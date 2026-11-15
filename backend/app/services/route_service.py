"""Đường đi + làm ấm cache km (gđ7, CR-15 phần B, `docs/phase7/ALGORITHMS.md` §5, §7).

- `RouteService`: `GET /routes/me` (chỉ đường của người gọi — CR-11) và `GET /schedule/routes` (giữa các quán).
- Làm ấm: `warm_after_commit(repo, room_id)` gắn hook `after_commit` vào session của request; chỉ khi transaction
  commit xong mới tạo task nền (`RouteWarmer`) với session RIÊNG — tránh bẫy gđ6 T-87 (session riêng đọc dữ liệu chưa
  commit / chờ khoá hàng của request). Rollback → huỷ. Mỗi phòng tối đa một task; yêu cầu tới trong lúc chạy được
  gom thành MỘT lượt chạy lại. Process dừng (Render ngủ) → task mất, lần kích hoạt sau làm ấm lại.
- Chỉ làm gì khi `ROUTING_PROVIDER=valhalla` + có `VALHALLA_URL`; mặc định không đổi hành vi.
"""

import asyncio
import logging
from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core import algo_config as cfg
from app.core.exceptions import AppException, PlaceNotFoundError, RoomNotFoundError
from app.domain.algorithms.feasibility import consecutive_pairs, plan_items_from_dicts
from app.domain.models.member import Member
from app.domain.models.place import Place
from app.domain.models.schedule import ScheduleItem
from app.domain.patterns.itinerary.travel import (
    Coord,
    DbCachedEstimator,
    ITravelTimeEstimator,
    Route,
    TravelSource,
    get_travel_estimator,
)
from app.repositories import (
    IMemberRepository,
    IPlaceRepository,
    IRoomRepository,
    IScheduleRepository,
    MemberRepository,
    PlaceRepository,
    RoomRepository,
    ScheduleRepository,
)
from app.repositories.travel_leg_repo import get_session_factory
from app.schemas.route import (
    MyRoutesResponse,
    RouteLegOut,
    ScheduleRouteLeg,
    ScheduleRoutesResponse,
)

logger = logging.getLogger(__name__)

_PENDING = "route_warm_rooms"
_HOOKED = "route_warm_hooked"


class NoOriginError(AppException):
    """Người gọi chưa tự chia sẻ vị trí → không có đường của mình (404 `NO_ORIGIN`)."""

    def __init__(self, details: dict[str, Any] | None = None) -> None:
        super().__init__(
            code="NO_ORIGIN",
            message="Bạn chưa chia sẻ vị trí xuất phát.",
            status_code=404,
            details=details,
        )


class NoPlaceCoordsError(AppException):
    """Quán chưa có toạ độ → không vẽ được đường (404 `NO_PLACE_COORDS`)."""

    def __init__(self, details: dict[str, Any] | None = None) -> None:
        super().__init__(
            code="NO_PLACE_COORDS",
            message="Địa điểm chưa có toạ độ.",
            status_code=404,
            details=details,
        )


def _coord(lat: float | None, lng: float | None) -> Coord | None:
    return (float(lat), float(lng)) if lat is not None and lng is not None else None


def _leg_out(r: Route) -> RouteLegOut:
    return RouteLegOut(
        km=round(r.leg.distance_km, 3),
        minutes=r.leg.minutes,
        shape=r.shape,
        source=r.leg.source.value,
    )


def _fetching_estimator() -> DbCachedEstimator | None:
    est = get_travel_estimator()
    return est if isinstance(est, DbCachedEstimator) and est.can_fetch else None


async def routes_for(
    est: ITravelTimeEstimator, pairs: Sequence[tuple[Coord, Coord]], *, fetch: bool = True
) -> list[Route]:
    """Chặng + hình dạng cho từng cặp. Estimator không có cache DB (mặc định/Google): chỉ đọc cache, không gọi mạng,
    `shape` None — xem đường không bao giờ tốn lượt Google."""
    if isinstance(est, DbCachedEstimator):
        return await est.routes(pairs, fetch=fetch)
    out: list[Route] = []
    for a, b in pairs:
        out.append(Route((await est.acached_matrix([a], [b]))[0][0]))
    return out


# ── Làm ấm ────────────────────────────────────────────────────────────────────────────────────────
async def warm_room(room_id: UUID, session_factory: Any = None) -> int:
    """Một lượt làm ấm cho phòng (session riêng, chỉ đọc dữ liệu đã commit). Trả số dòng km mới.

    Cặp cần: thành viên tự chia sẻ (+ điểm hẹn host, ALGO-04 dùng) ↔ quán hai chiều, quán ↔ quán (mọi cặp có hướng)
    → MỘT yêu cầu ma trận. Rồi lấy hình dạng (tối đa `ROUTE_WARM_SHAPE_LIMIT`): chặng liên tiếp trên lịch trước,
    sau đó nhà ↔ quán.
    """
    est = _fetching_estimator()
    if est is None:
        return 0
    factory = session_factory or get_session_factory()
    async with factory() as session:
        room = await RoomRepository(session).get_by_id(room_id)
        if room is None:
            return 0
        places = await PlaceRepository(session).list_by_room(room_id)
        members = await MemberRepository(session).list_by_room(room_id)
        schedule = await ScheduleRepository(session).list_by_room(room_id)
        place_coords = {str(p.id): c for p in places if (c := _coord(p.latitude, p.longitude))}
        homes = [c for m in members if m.is_active and (c := _coord(m.origin_lat, m.origin_lng))]
        if (meeting := _coord(room.origin_lat, room.origin_lng)) is not None:
            homes.append(meeting)
        items = plan_items_from_dicts(
            [
                {
                    "id": s.id,
                    "place_id": s.place_id,
                    "day_offset": s.day_offset,
                    "start_minute": s.start_minute,
                    "end_minute": s.end_minute,
                    "order_index": s.order_index,
                }
                for s in schedule
            ],
            place_coords,
        )
    pts = list(place_coords.values())
    home_pairs = [pair for h in homes for p in pts for pair in ((h, p), (p, h))]
    place_pairs = [(p, q) for p in pts for q in pts if p != q]
    added = await est.warm(home_pairs + place_pairs)
    sched_pairs = [
        (a.coord, b.coord)
        for a, b in consecutive_pairs(items)
        if a.coord is not None and b.coord is not None
    ]
    await est.routes(sched_pairs + home_pairs, limit=cfg.ROUTE_WARM_SHAPE_LIMIT)
    logger.info("Đã làm ấm đường đi phòng %s: %d chặng km mới", room_id, added)
    return added


class RouteWarmer:
    """Tối đa một task làm ấm mỗi phòng; yêu cầu tới khi đang chạy → chạy lại đúng một lần nữa."""

    def __init__(self) -> None:
        self._tasks: dict[UUID, asyncio.Task[None]] = {}
        self._again: set[UUID] = set()

    def request(self, room_id: UUID) -> None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        task = self._tasks.get(room_id)
        if task is not None and not task.done() and task.get_loop() is loop:
            self._again.add(room_id)
            return
        self._tasks[room_id] = loop.create_task(self._run(room_id))

    async def _run(self, room_id: UUID) -> None:
        try:
            while True:
                self._again.discard(room_id)
                await warm_room(room_id)
                if room_id not in self._again:
                    break
        except Exception:
            logger.exception("Làm ấm đường đi lỗi cho phòng %s", room_id)
        finally:
            if self._tasks.get(room_id) is asyncio.current_task():
                self._tasks.pop(room_id, None)

    async def drain(self) -> None:
        """Chờ mọi task làm ấm của event loop hiện tại xong (test)."""
        loop = asyncio.get_running_loop()
        while pending := [t for t in self._tasks.values() if not t.done() and t.get_loop() is loop]:
            await asyncio.gather(*pending, return_exceptions=True)


_warmer = RouteWarmer()


def get_route_warmer() -> RouteWarmer:
    return _warmer


def request_warm(room_id: UUID) -> None:
    """Hẹn làm ấm ngay (dữ liệu đã commit — dùng từ GET khi thấy ô ước lượng). Không làm gì nếu cờ tắt."""
    if _fetching_estimator() is not None:
        _warmer.request(room_id)


def _on_commit(sync_session: Session) -> None:
    rooms = sync_session.info.pop(_PENDING, None)
    for room_id in rooms or ():
        _warmer.request(room_id)


def _on_rollback(sync_session: Session, previous_transaction: Any) -> None:
    # `after_soft_rollback` bắt cả rollback chưa chạm DB; savepoint lồng (begin_nested) hỏng không huỷ cả request
    if not getattr(previous_transaction, "nested", False):
        sync_session.info.pop(_PENDING, None)


def warm_after_commit(repo: Any, room_id: UUID) -> None:
    """Hẹn làm ấm phòng SAU KHI session của `repo` commit (không chặn request; rollback = huỷ).

    Repo giả trong unit test (không có `AsyncSession`) hoặc cờ tắt → không làm gì.
    """
    if _fetching_estimator() is None:
        return
    session = getattr(repo, "session", None)
    if not isinstance(session, AsyncSession):
        return
    sync = session.sync_session
    if not sync.info.get(_HOOKED):
        # Giữ listener tới hết đời session (session theo request); gỡ trong lúc sự kiện đang phát là không an toàn
        event.listen(sync, "after_commit", _on_commit)
        event.listen(sync, "after_soft_rollback", _on_rollback)
        sync.info[_HOOKED] = True
    sync.info.setdefault(_PENDING, set()).add(room_id)


# ── Đường của mình / đường lịch ─────────────────────────────────────────────────────────────────
class RouteService:
    def __init__(
        self,
        room_repo: IRoomRepository,
        member_repo: IMemberRepository,
        place_repo: IPlaceRepository,
        schedule_repo: IScheduleRepository,
    ) -> None:
        self.room_repo = room_repo
        self.member_repo = member_repo
        self.place_repo = place_repo
        self.schedule_repo = schedule_repo

    async def _room(self, room_id: UUID) -> None:
        if await self.room_repo.get_by_id(room_id) is None:
            raise RoomNotFoundError(
                message="Không tìm thấy phòng với mã yêu cầu.", details={"room_id": str(room_id)}
            )

    async def my_routes(self, room_id: UUID, member: Member, place_id: UUID) -> MyRoutesResponse:
        """Nhà người gọi → quán, quán → nhà người gọi. Chỉ vị trí TỰ chia sẻ (không dùng điểm hẹn host)."""
        await self._room(room_id)
        place: Place | None = await self.place_repo.get_by_id(place_id)
        if place is None or place.room_id != room_id:
            raise PlaceNotFoundError(
                message="Không tìm thấy địa điểm được yêu cầu trong phòng này.",
                details={"place_id": str(place_id), "room_id": str(room_id)},
            )
        home = _coord(member.origin_lat, member.origin_lng)
        if home is None:
            raise NoOriginError()
        dest = _coord(place.latitude, place.longitude)
        if dest is None:
            raise NoPlaceCoordsError(details={"place_id": str(place_id)})
        est = get_travel_estimator()
        go, back = await routes_for(est, [(home, dest), (dest, home)])
        if TravelSource.ESTIMATE in (go.leg.source, back.leg.source):
            request_warm(room_id)
        return MyRoutesResponse(place_id=place_id, to_place=_leg_out(go), to_home=_leg_out(back))

    async def schedule_routes(self, room_id: UUID) -> ScheduleRoutesResponse:
        """Đường giữa các mục liên tiếp trên lịch ngày đầu (`day_offset = 0`, như ALGO-03)."""
        await self._room(room_id)
        places = await self.place_repo.list_by_room(room_id)
        schedule: list[ScheduleItem] = await self.schedule_repo.list_by_room(room_id)
        coords = {str(p.id): c for p in places if (c := _coord(p.latitude, p.longitude))}
        items = plan_items_from_dicts(
            [
                {
                    "id": s.id,
                    "place_id": s.place_id,
                    "day_offset": s.day_offset,
                    "start_minute": s.start_minute,
                    "end_minute": s.end_minute,
                    "order_index": s.order_index,
                }
                for s in schedule
                if (s.day_offset or 0) == 0
            ],
            coords,
        )
        pairs = consecutive_pairs(items)
        known = [(a, b) for a, b in pairs if a.coord is not None and b.coord is not None]
        routes = await routes_for(
            get_travel_estimator(),
            [(a.coord, b.coord) for a, b in known],  # type: ignore[misc]
        )
        if any(r.leg.source is TravelSource.ESTIMATE for r in routes):
            request_warm(room_id)
        return ScheduleRoutesResponse(
            legs=[
                ScheduleRouteLeg(from_item_id=a.item_id, to_item_id=b.item_id, **_leg_out(r).model_dump())
                for (a, b), r in zip(known, routes, strict=True)
            ],
            unknown_leg_count=len(pairs) - len(known),
        )

