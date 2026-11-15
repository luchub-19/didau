"""Kho `travel_legs` (gđ7, CR-15 phần B): cache km/hình dạng đường xe máy theo cặp toạ độ đã làm tròn.

`TravelLegRepository` dùng session có sẵn; `SessionLegStore` (hiện thực `ILegStore` cho `DbCachedEstimator`) mở
session RIÊNG mỗi lần đọc/ghi và commit ngay — bảng này không gắn với transaction của request nào, nên đọc trong
request chỉ thấy dữ liệu đã commit, và làm ấm (chạy sau commit) không phải chờ khoá của request.
"""

from collections.abc import Callable, Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import algo_config as cfg
from app.core.time_utils import now_utc
from app.domain.models.travel_leg import TravelLeg
from app.domain.patterns.itinerary.travel import CachedLeg, ILegStore, TravelSource, minutes_for_km
from app.repositories.base import BaseRepository

_KEY_CHUNK = 500
"""Số khoá `from_key` tối đa trong một mệnh đề IN."""


def _insert(session: AsyncSession) -> Any:
    """`INSERT … ON CONFLICT` đúng phương ngữ (Postgres thật; SQLite trong test migration)."""
    bind = session.get_bind()
    if bind.dialect.name == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:
        from sqlalchemy.dialects.postgresql import insert
    return insert


def _dedupe(legs: Sequence[CachedLeg]) -> list[CachedLeg]:
    """Một dòng mỗi khoá (dòng sau thắng): Postgres từ chối ON CONFLICT chạm một hàng hai lần trong một lệnh."""
    return list({(cl.from_key, cl.to_key): cl for cl in legs}.values())


def _to_cached(row: TravelLeg) -> CachedLeg:
    try:
        source = TravelSource(row.source)
    except ValueError:
        source = TravelSource.VALHALLA
    return CachedLeg(row.from_key, row.to_key, float(row.distance_km), row.shape, source)


class TravelLegRepository(BaseRepository):
    """Đọc/ghi `travel_legs` trong session được truyền vào (nơi gọi tự commit)."""

    def __init__(self, session: AsyncSession, profile: str = cfg.VALHALLA_COSTING) -> None:
        super().__init__(session)
        self.profile = profile

    async def get_many(self, keys: Sequence[tuple[str, str]]) -> dict[tuple[str, str], CachedLeg]:
        wanted = set(keys)
        if not wanted:
            return {}
        froms = sorted({f for f, _ in wanted})
        tos = sorted({t for _, t in wanted})
        out: dict[tuple[str, str], CachedLeg] = {}
        for start in range(0, len(froms), _KEY_CHUNK):
            stmt = select(TravelLeg).where(
                TravelLeg.profile == self.profile,
                TravelLeg.from_key.in_(froms[start : start + _KEY_CHUNK]),
                TravelLeg.to_key.in_(tos),
            )
            for row in (await self.session.execute(stmt)).scalars():
                k = (row.from_key, row.to_key)
                if k in wanted:
                    out[k] = _to_cached(row)
        return out

    def _values(self, cl: CachedLeg) -> dict[str, Any]:
        return {
            "from_key": cl.from_key,
            "to_key": cl.to_key,
            "profile": self.profile,
            "distance_km": cl.distance_km,
            "minutes": minutes_for_km(cl.distance_km),
            "shape": cl.shape,
            "source": cl.source.value,
            "fetched_at": now_utc(),
        }

    async def save_legs(self, legs: Sequence[CachedLeg]) -> None:
        """Thêm/cập nhật km; KHÔNG đụng `shape` đã có."""
        if not legs:
            return
        insert = _insert(self.session)
        stmt = insert(TravelLeg).values([self._values(cl) for cl in _dedupe(legs)])
        stmt = stmt.on_conflict_do_update(
            index_elements=["from_key", "to_key", "profile"],
            set_={
                "distance_km": stmt.excluded.distance_km,
                "minutes": stmt.excluded.minutes,
                "source": stmt.excluded.source,
                "fetched_at": stmt.excluded.fetched_at,
            },
        )
        await self.session.execute(stmt)

    async def save_shapes(self, legs: Sequence[CachedLeg]) -> None:
        """Ghi `shape`; dòng chưa có thì thêm với km của `/route`, dòng đã có giữ km của ma trận."""
        rows = [cl for cl in legs if cl.shape]
        if not rows:
            return
        insert = _insert(self.session)
        stmt = insert(TravelLeg).values([self._values(cl) for cl in _dedupe(rows)])
        stmt = stmt.on_conflict_do_update(
            index_elements=["from_key", "to_key", "profile"],
            set_={"shape": stmt.excluded.shape},
        )
        await self.session.execute(stmt)


# ── Session factory dùng chung cho kho + làm ấm (test thay bằng engine NullPool của mình) ───────────
_session_factory: Callable[[], AsyncSession] | None = None


def get_session_factory() -> Callable[[], AsyncSession]:
    if _session_factory is not None:
        return _session_factory
    from app.core.database import AsyncSessionLocal

    return AsyncSessionLocal


def set_session_factory(factory: Callable[[], AsyncSession] | None) -> None:
    """Đặt factory session cho `SessionLegStore` và làm ấm (None = về `AsyncSessionLocal`)."""
    global _session_factory
    _session_factory = factory


class SessionLegStore(ILegStore):
    """`ILegStore` mở session riêng mỗi thao tác (đọc dữ liệu đã commit; ghi xong commit ngay)."""

    def __init__(
        self,
        session_factory: Callable[[], AsyncSession] | None = None,
        profile: str = cfg.VALHALLA_COSTING,
    ) -> None:
        self._factory = session_factory
        self.profile = profile

    def _session(self) -> AsyncSession:
        return (self._factory or get_session_factory())()

    async def get_many(self, keys: Sequence[tuple[str, str]]) -> dict[tuple[str, str], CachedLeg]:
        async with self._session() as session:
            return await TravelLegRepository(session, self.profile).get_many(keys)

    async def save_legs(self, legs: Sequence[CachedLeg]) -> None:
        async with self._session() as session:
            await TravelLegRepository(session, self.profile).save_legs(legs)
            await session.commit()

    async def save_shapes(self, legs: Sequence[CachedLeg]) -> None:
        async with self._session() as session:
            await TravelLegRepository(session, self.profile).save_shapes(legs)
            await session.commit()
