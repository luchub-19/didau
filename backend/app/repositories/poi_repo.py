"""Bảng `pois` (T-102, CR-17 B): chỉ mục tìm quán trong Postgres (`pg_trgm`) nạp từ snapshot.

Bảng chỉ giữ cột để LỌC và XẾP (tên đã bỏ dấu, brand, toạ độ, score); phản hồi vẫn dựng từ `PoiService` trong RAM
theo `external_id` (giờ mở cửa hôm nay, địa chỉ, tags…), nên hình dạng `PoiResponse` không đổi.

Nạp: `python -m app.repositories.poi_repo` (chạy ở `start.sh` sau `alembic upgrade head`). Idempotent: so dấu vân tay
snapshot với `poi_snapshots`, trùng thì bỏ qua. Xoá bằng DELETE (không TRUNCATE) trong một transaction để bản đang
chạy (Render deploy không gián đoạn) vẫn đọc được dữ liệu cũ cho tới lúc commit.
"""

import argparse
import asyncio
import logging
import sys
import time

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.poi_service import (
    BRAND_FUZZY_MIN_LEN,
    BRAND_MIN_BRANCHES,
    BRAND_RADIUS_KM,
    SEARCH_DISTANCE_BAND_KM,
    BrandSummary,
    PoiService,
    normalize_text,
)

logger = logging.getLogger(__name__)

_meta = sa.MetaData()  # riêng, không gắn Base: bảng do migration 006 tạo, không phải model ORM
pois_table = sa.Table(
    "pois",
    _meta,
    sa.Column("external_id", sa.String(80), primary_key=True),
    sa.Column("name", sa.Text),
    sa.Column("norm_name", sa.Text),
    sa.Column("norm_text", sa.Text),
    sa.Column("brand_key", sa.String(120)),
    sa.Column("brand", sa.Text),
    sa.Column("norm_brand", sa.Text),
    sa.Column("kind", sa.String(20)),
    sa.Column("category", sa.String(20)),
    sa.Column("lat", sa.Float),
    sa.Column("lng", sa.Float),
    sa.Column("score", sa.SmallInteger),
)
snapshots_table = sa.Table(
    "poi_snapshots",
    _meta,
    sa.Column("id", sa.SmallInteger, primary_key=True),
    sa.Column("fingerprint", sa.String(80)),
    sa.Column("poi_count", sa.Integer),
    sa.Column("loaded_at", sa.DateTime(timezone=True)),
)

_INSERT_CHUNK = 2000
READY_TTL_S = 300.0  # đã nạp: tin trong 5 phút
NOT_READY_TTL_S = 30.0  # chưa nạp: hỏi lại sau 30 s (lệnh nạp có thể đang chạy)
BRAND_FUZZY_MIN_SIM = 0.5  # similarity("vincon", "vincom") = 0,56
FUZZY_MIN_LEN = 3  # khớp gần đúng tên quán chỉ khi truy vấn ≥ 3 ký tự (trigram ngắn hơn vô nghĩa)

# Khoảng cách haversine (km) trong SQL — cùng công thức `haversine_distance_km`
_DIST_SQL = (
    "2 * 6371.0 * asin(least(1.0, sqrt("
    "power(sin(radians(lat - :lat) / 2), 2)"
    " + cos(radians(:lat)) * cos(radians(lat)) * power(sin(radians(lng - :lng) / 2), 2))))"
)

_ready_cache: tuple[bool, float] | None = None


def reset_ready_cache() -> None:
    """Quên trạng thái "bảng đã nạp" (test, hoặc sau khi nạp xong trong cùng tiến trình)."""
    global _ready_cache
    _ready_cache = None


def _like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _box_sql(box: tuple[float, float, float, float] | None, params: dict[str, object], alias: str = "") -> str:
    """Điều kiện `AND lat/lng trong khung thành phố` (CR-18); không có khung → chuỗi rỗng."""
    if box is None:
        return ""
    params["bmin_lat"], params["bmin_lng"], params["bmax_lat"], params["bmax_lng"] = box
    return (
        f" AND {alias}lat BETWEEN :bmin_lat AND :bmax_lat AND {alias}lng BETWEEN :bmin_lng AND :bmax_lng"
    )


def _poi_row(poi) -> dict:
    return {
        "external_id": poi.external_id,
        "name": poi.name,
        "norm_name": poi.norm_name,
        "norm_text": poi.norm_text,
        "brand_key": poi.brand_key,
        "brand": poi.brand,
        "norm_brand": normalize_text(poi.brand) if poi.brand else None,
        "kind": poi.kind,
        "category": poi.category.value,
        "lat": poi.lat,
        "lng": poi.lng,
        "score": poi.score,
    }


class PoiRepository:
    """Tìm quán / chuỗi trong bảng `pois`. Mọi truy vấn chạy trong SAVEPOINT để lỗi không làm hỏng transaction
    của request (nơi gọi lùi về tìm trong RAM)."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def is_ready(self) -> bool:
        """Bảng đã có snapshot nạp xong (cache theo tiến trình, TTL ở trên)."""
        global _ready_cache
        now = time.monotonic()
        if _ready_cache is not None and now < _ready_cache[1]:
            return _ready_cache[0]
        async with self.session.begin_nested():
            count = (
                await self.session.execute(
                    sa.select(snapshots_table.c.poi_count).where(snapshots_table.c.id == 1)
                )
            ).scalar_one_or_none()
        ready = bool(count)
        _ready_cache = (ready, now + (READY_TTL_S if ready else NOT_READY_TTL_S))
        return ready

    async def search(
        self,
        q: str,
        near: tuple[float, float] | None,
        limit: int,
        box: tuple[float, float, float, float] | None = None,
    ) -> list[tuple[str, float | None]]:
        """[(external_id, km)] theo thứ tự MAP-POI §5: tầng khớp tên → dải 3 km → score → km. Thêm tầng 3 = khớp
        gần đúng (`word_similarity`, gõ sai/thiếu chữ) xếp sau mọi kết quả khớp chuỗi; trong tầng 3 vẫn dải 3 km trước,
        rồi mới tới độ giống (không thì "vincon" ra Vincom ở Hà Nội trước Vincom cách 2 km)."""
        query = normalize_text(q)
        if not query:
            return []
        tokens = list(dict.fromkeys(query.split()))
        params: dict[str, object] = {"q": query, "qprefix": _like_escape(query) + "%", "limit": limit}
        like_text, like_name, word_name = [], [], []
        for i, tok in enumerate(tokens):
            params[f"t{i}"] = "%" + _like_escape(tok) + "%"
            params[f"w{i}"] = "% " + _like_escape(tok) + " %"
            like_text.append(f"norm_text LIKE :t{i} ESCAPE '\\'")
            like_name.append(f"norm_name LIKE :t{i} ESCAPE '\\'")
            word_name.append(f"(' ' || norm_name || ' ') LIKE :w{i} ESCAPE '\\'")
        exact = " AND ".join(like_text)
        fuzzy = len(query) >= FUZZY_MIN_LEN
        where = f"({exact}) OR (:q <% norm_text)" if fuzzy else exact
        where = f"({where}){_box_sql(box, params)}"
        if near is not None:
            dist = _DIST_SQL
            params["lat"], params["lng"] = near
        else:
            dist = "0.0"
        sql = f"""
            WITH c AS (
                SELECT external_id, norm_name, norm_text, score, {dist} AS dist
                FROM pois WHERE {where}
            ), t AS (
                SELECT external_id, norm_text, score, dist,
                    CASE
                        WHEN norm_name LIKE :qprefix ESCAPE '\\' OR ({" AND ".join(word_name)}) THEN 0
                        WHEN {" AND ".join(like_name)} THEN 1
                        WHEN {exact} THEN 2
                        ELSE 3
                    END AS tier
                FROM c
            )
            SELECT external_id, dist FROM t
            ORDER BY tier, floor(dist / {SEARCH_DISTANCE_BAND_KM}),
                CASE WHEN tier = 3 THEN -round(word_similarity(:q, norm_text)::numeric, 1) ELSE 0 END,
                -score, dist, external_id
            LIMIT :limit
        """
        async with self.session.begin_nested():
            rows = (await self.session.execute(sa.text(sql), params)).all()
        return [(r.external_id, float(r.dist) if near is not None else None) for r in rows]

    async def brands(
        self,
        q: str,
        near: tuple[float, float] | None,
        limit: int,
        box: tuple[float, float, float, float] | None = None,
    ) -> list[BrandSummary]:
        """Chuỗi ≥ `BRAND_MIN_BRANCHES` chi nhánh khớp truy vấn: tiền tố tên chuỗi (tầng 0) hoặc gần đúng (tầng 1,
        `similarity` với số từ đầu tương ứng của tên chuỗi, chỉ khi gõ ≥ `BRAND_FUZZY_MIN_LEN` ký tự). Xếp tầng → số chi nhánh → gần."""
        query = normalize_text(q)
        if not query:
            return []
        params: dict[str, object] = {
            "q": query,
            "qprefix": _like_escape(query) + "%",
            "theprefix": "the " + _like_escape(query) + "%",
            "min_count": BRAND_MIN_BRANCHES,
            "limit": limit,
        }
        # Tiền tố như `brand_matches` ở RAM (bỏ "the " đầu)
        prefix = "(norm_brand LIKE :qprefix ESCAPE '\\' OR norm_brand LIKE :theprefix ESCAPE '\\')"
        fuzzy = len(query) >= BRAND_FUZZY_MIN_LEN
        # Gần đúng: so truy vấn với ĐÚNG số từ đầu của tên chuỗi ("vincon" ↔ "vincom"), không với cả tên —
        # không thì "coffee" khớp "Chidori Coffee in Bed". `<%` chỉ để dùng chỉ mục trigram lọc trước.
        head = f"array_to_string((string_to_array(norm_brand, ' '))[1:{len(query.split())}], ' ')"
        match = (
            f"({prefix} OR (:q <% norm_brand AND similarity(:q, {head}) >= {BRAND_FUZZY_MIN_SIM}))"
            if fuzzy
            else prefix
        )
        if near is not None:
            params["lat"], params["lng"], params["radius"] = near[0], near[1], BRAND_RADIUS_KM
            dist, radius = _DIST_SQL, "WHERE dist <= :radius"
        else:
            dist, radius = "NULL::float8", ""
        sql = f"""
            WITH hit AS (
                SELECT DISTINCT brand_key FROM pois
                WHERE brand_key IS NOT NULL AND norm_brand IS NOT NULL AND {match}
            ), b AS (
                SELECT p.brand_key, p.brand, p.norm_brand, {dist} AS dist
                FROM pois p JOIN hit USING (brand_key)
                WHERE TRUE{_box_sql(box, params, "p.")}
            ), g AS (
                SELECT brand_key,
                    mode() WITHIN GROUP (ORDER BY brand) AS name,
                    count(*) AS n,
                    min(dist) AS nearest,
                    bool_or(norm_brand LIKE :qprefix ESCAPE '\\' OR norm_brand LIKE :theprefix ESCAPE '\\') AS pre
                FROM b {radius}
                GROUP BY brand_key
                HAVING count(*) >= :min_count
            )
            SELECT brand_key, name, n, nearest FROM g
            ORDER BY (NOT pre), n DESC, nearest NULLS LAST, brand_key
            LIMIT :limit
        """
        async with self.session.begin_nested():
            rows = (await self.session.execute(sa.text(sql), params)).all()
        return [
            BrandSummary(
                r.brand_key, r.name, int(r.n), round(float(r.nearest), 3) if r.nearest is not None else None
            )
            for r in rows
        ]

    async def loaded_fingerprint(self) -> str | None:
        return (
            await self.session.execute(
                sa.select(snapshots_table.c.fingerprint).where(snapshots_table.c.id == 1)
            )
        ).scalar_one_or_none()

    async def replace_all(self, service: PoiService) -> int:
        """Thay toàn bộ bảng bằng snapshot của `service` (nơi gọi commit). Trả về số dòng."""
        await self.session.execute(sa.delete(pois_table))
        rows = [_poi_row(p) for p in service]
        for start in range(0, len(rows), _INSERT_CHUNK):
            await self.session.execute(sa.insert(pois_table), rows[start : start + _INSERT_CHUNK])
        await self.session.execute(sa.delete(snapshots_table))
        await self.session.execute(
            sa.insert(snapshots_table).values(
                id=1, fingerprint=service.fingerprint, poi_count=len(rows), loaded_at=sa.func.now()
            )
        )
        # Thống kê mới cho planner (ANALYZE chạy được trong transaction; dòng chết của DELETE để autovacuum dọn)
        await self.session.execute(sa.text("ANALYZE pois"))
        return len(rows)


async def load_snapshot(session: AsyncSession, service: PoiService, force: bool = False) -> int | None:
    """Nạp snapshot vào bảng nếu dấu vân tay khác (hoặc `force`). Trả về số dòng đã nạp, None nếu bỏ qua.
    Không commit — nơi gọi quyết định (CLI commit; test rollback)."""
    repo = PoiRepository(session)
    if not force and await repo.loaded_fingerprint() == service.fingerprint:
        return None
    count = await repo.replace_all(service)
    reset_ready_cache()
    return count


async def _main(force: bool) -> int:
    from app.core.database import AsyncSessionLocal

    started = time.monotonic()
    service = PoiService()
    if len(service) == 0:
        print("No POI snapshot found; skipping load.")
        return 1
    async with AsyncSessionLocal() as session:
        count = await load_snapshot(session, service, force=force)
        await session.commit()
    if count is None:
        print(f"POI table already up to date ({len(service)} POIs, {service.fingerprint[:12]}).")
    else:
        print(f"Loaded {count} POIs into table pois in {time.monotonic() - started:.1f}s.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load the POI snapshot into the pois search table.")
    parser.add_argument("--force", action="store_true", help="reload even if the snapshot is unchanged")
    args = parser.parse_args()
    sys.exit(asyncio.run(_main(args.force)))
