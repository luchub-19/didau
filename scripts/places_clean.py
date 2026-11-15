"""Làm sạch snapshot quán (T-104, MAP-POI §10): gộp trùng mốc lớn, bỏ quán tenant trong mall, cờ sai vị trí, file ghi đè tay.

`build_places.py` gọi các hàm này sau bước gộp Overture + OSM; `audit_places.py` dùng lại để in báo cáo. Các hàm nhận bản ghi
dạng duck-typing (`Rec` của build_places: name, kind, lat, lng, sources, score, external_id, aliases…) nên không import
ngược build_places. Luật loại (`kind`, tiện lợi, công ty…) nằm ở `osm_mapping.py`.
"""

from __future__ import annotations

import itertools
import json
import math
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OVERRIDES_PATH = Path(__file__).resolve().parent / "places_overrides.json"

LANDMARK_KINDS = frozenset({"mall", "cinema", "museum", "park"})
COMMERCIAL_LANDMARKS = frozenset({"mall", "cinema"})
POSITION_MAX_KM = 25.0
SAME_SPOT_M = 60.0  # cùng thương hiệu trong bán kính này = cùng một mốc dù tên khác
LANDMARK_MERGE_NEAR_M = 400.0
LANDMARK_MERGE_M = 150.0  # cùng kind, tên chung ≥ 2 từ có nghĩa → một mốc
TENANT_RADIUS_M = 700.0  # quán "X - Tên mall" trong bán kính này của chính mall đó → tenant
DISTRICT_FAR_KM = 12.0  # nhắc quận X mà cách tâm X xa hơn mức này (và gấp 2 bán kính của X) mới cờ
POSITION_FAR_KM = 2.5  # mốc cách nơi nhiều quán khác nhắc tên nó hơn ngưỡng này → nghi sai vị trí

# Từ chung bỏ khi so tên mốc: loại địa điểm + hành chính (chỉ giữ phần "riêng" của tên)
_GENERIC = frozenset(
    [
        "tttm",
        "trung",
        "tam",
        "thuong",
        "mai",
        "toa",
        "nha",
        "the",
        "at",
        "tai",
        "va",
        "and",
        "of",
        "khu",
        "cong",
        "vien",
        "bao",
        "tang",
        "rap",
        "phim",
        "cinema",
        "museum",
        "park",
        "garden",
        "quan",
        "huyen",
        "phuong",
        "thanh",
        "pho",
        "tp",
        "hcm",
        "ho",
        "chi",
        "minh",
        "viet",
        "nam",
        "vietnam",
        "ha",
        "noi",
        "hanoi",
    ]
)
# Từ thương hiệu/loại mốc: không đủ để phân biệt hai mốc với nhau khi tìm "tên nhắc ở nơi khác"
_BRAND_WORDS = frozenset(
    [
        "vincom",
        "lotte",
        "aeon",
        "parkson",
        "mega",
        "mall",
        "megamall",
        "plaza",
        "center",
        "centre",
        "mart",
        "market",
        "city",
        "pearl",
        "crescent",
        "cgv",
        "bhd",
        "galaxy",
    ]
)
# Sai chính tả hay gặp của thương hiệu mall (để các bản ghi "Crensent Mall"/"Aone Mall" gộp được vào mall thật)
_TYPO = {
    "crensent": "crescent",
    "cresent": "crescent",
    "creasent": "crescent",
    "crecent": "crescent",
    "aone": "aeon",
    "aoen": "aeon",
    "eon": "aeon",
    "aon": "aeon",
    "vicom": "vincom",
    "lote": "lotte",
    "lottemart": "lotte",
}
# Tên viết sai thương hiệu: nếu còn sót sau khi gộp (không nằm cạnh mall thật) thì là bản ghi rác/sai chỗ → bỏ
BRAND_TYPOS = frozenset(
    ["crensent", "cresent", "creasent", "crecent", "aone", "aoen", "eon", "aon", "vicom", "lote"]
)
_SPLIT = re.compile(r"[^a-z0-9]+")


def meters(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    """Khoảng cách xấp xỉ phẳng (đủ chính xác dưới vài chục km)."""
    dy = (a_lat - b_lat) * 111_320.0
    dx = (a_lng - b_lng) * 111_320.0 * math.cos(math.radians((a_lat + b_lat) / 2))
    return math.hypot(dx, dy)


def fold(text: str) -> str:
    from app.domain.patterns.category_detector.osm_mapping import fold_text

    return fold_text(text.replace("_", " "))


def short_name(name: str) -> str:
    """Tên là cả địa chỉ ("TTTM Vincom Mega Mall Thảo Điền, 161 Xa Lộ Hà Nội…") → cắt từ dấu phẩy đầu."""
    head = name.split(",")[0].strip()
    return head if len(head) >= 4 else name


def _raw_words(name: str) -> list[str]:
    return [w for w in _SPLIT.split(fold(short_name(name).replace("&", " "))) if w]


def tokens(name: str, *, drop_generic: bool = True) -> list[str]:
    """Từ có nghĩa của tên mốc (đã bỏ dấu, tách "megamall" → "mega mall", "lottemart" → "lotte mart")."""
    text = fold(short_name(name).replace("&", " "))
    text = re.sub(r"megamall", "mega mall", text)
    text = re.sub(r"(lotte|win|vin|co\s?op|big\s?c)mart", r"\1 mart", text)
    words = [_TYPO.get(w, w) for w in _SPLIT.split(text) if w]
    return [w for w in words if w not in _GENERIC] if drop_generic else words


# ── file ghi đè tay ──────────────────────────────────────────────────────────────────────────────


def load_overrides(path: Path = OVERRIDES_PATH) -> dict:
    """`{drop: {id: lý do}, kind: {id: {kind, reason}}, move: {id: {lat, lng, reason}}}` — rỗng nếu chưa có file."""
    if not path.exists():
        return {"drop": {}, "kind": {}, "move": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: data.get(k) or {} for k in ("drop", "kind", "move")}


def apply_overrides(recs: list, overrides: dict) -> tuple[list, list]:
    """Áp `drop`/`kind`/`move`; trả (còn lại, bị bỏ). Id không còn trong dữ liệu thì bỏ qua (nguồn có thể đã đổi)."""
    drop, kinds, moves = overrides["drop"], overrides["kind"], overrides["move"]
    kept, dropped = [], []
    for rec in recs:
        if rec.external_id in drop or any(a in drop for a in rec.aliases):
            dropped.append(rec)
            continue
        if rec.external_id in kinds:
            rec.kind = kinds[rec.external_id]["kind"]
        if rec.external_id in moves:
            rec.lat, rec.lng = moves[rec.external_id]["lat"], moves[rec.external_id]["lng"]
        kept.append(rec)
    return kept, dropped


# ── gộp trùng mốc lớn + bỏ tenant ─────────────────────────────────────────────────────────────────


def _shared(a: list[str], b: list[str]) -> int:
    return len(set(a) & set(b))


def _better(a, b):
    """Bản ghi giữ lại: có OSM trước (giữ id osm:*), rồi điểm cao, rồi tên không phải địa chỉ, rồi id."""
    key = lambda r: ("osm" in r.sources, r.score or r.confidence, "," not in r.name, r.external_id)
    return a if key(a) >= key(b) else b


def merge_landmarks(recs: list) -> tuple[list, int]:
    """Gộp các bản ghi cùng mốc lớn (cùng kind, < 150 m, chung ≥ 2 từ có nghĩa). Trả (danh sách mới, số bản ghi bị gộp).
    Người thắng nhận id người thua vào `aliases`; tên cắt ở dấu phẩy đầu."""
    cell = 0.004
    landmarks = [r for r in recs if r.kind in LANDMARK_KINDS]
    grid: dict[tuple[int, int, str], list] = defaultdict(list)
    for r in landmarks:
        grid[(math.floor(r.lat / cell), math.floor(r.lng / cell), r.kind)].append(r)
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        while parent.get(x, x) != x:
            parent[x] = parent.get(parent[x], parent[x])
            x = parent[x]
        return x

    tok = {r.external_id: tokens(r.name) for r in landmarks}
    for r in landmarks:
        r0, c0 = math.floor(r.lat / cell), math.floor(r.lng / cell)
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                for o in grid.get((r0 + dr, c0 + dc, r.kind), ()):
                    if o.external_id <= r.external_id:
                        continue
                    ta, tb = tok[r.external_id], tok[o.external_id]
                    contained = set(ta) <= set(tb) or set(tb) <= set(ta)
                    # tên này nằm trọn trong tên kia ("Crescent Mall" ⊂ "Crescent Mall Phú Mỹ Hưng Quận 7") → nới bán kính;
                    # rạp thì không (hai cụm CGV cách 300 m là hai rạp khác nhau)
                    limit = (
                        LANDMARK_MERGE_NEAR_M
                        if contained and r.kind != "cinema"
                        else LANDMARK_MERGE_M
                    )
                    if meters(r.lat, r.lng, o.lat, o.lng) >= limit:
                        continue
                    brand_close = (
                        meters(r.lat, r.lng, o.lat, o.lng) < SAME_SPOT_M
                        and set(ta) & set(tb) & _BRAND_WORDS
                    )  # "Parkson Vietnam" / "Parkson Saigon Tourist", "LOTTE Mart Quận 7" / "Lotte Department Store"
                    if _shared(ta, tb) >= 2 or brand_close:
                        parent[find(o.external_id)] = find(r.external_id)
    groups: dict[str, list] = defaultdict(list)
    for r in landmarks:
        groups[find(r.external_id)].append(r)
    merged_into: dict[str, object] = {}
    n_merged = 0
    for members in groups.values():
        if len(members) < 2:
            continue
        winner = members[0]
        for m in members[1:]:
            winner = _better(winner, m)
        for m in members:
            if m is winner:
                continue
            winner.aliases.append(m.external_id)
            winner.aliases.extend(m.aliases)
            winner.address = winner.address or m.address
            winner.brand = winner.brand or m.brand
            winner.phone = winner.phone or m.phone
            winner.website = winner.website or m.website
            winner.opening_hours = winner.opening_hours or m.opening_hours
            winner.has_social = winner.has_social or m.has_social
            winner.datasets |= m.datasets
            for src in m.sources:
                if src not in winner.sources:
                    winner.sources.append(src)
            merged_into[m.external_id] = winner
            n_merged += 1
    out = []
    for r in recs:
        if r.external_id in merged_into:
            continue
        if r.kind in LANDMARK_KINDS:
            head = short_name(r.name)
            if head != r.name:
                r.raw_name = r.name  # cờ vị trí vẫn đọc được "…, Quận 7, TP.HCM"
                r.address = r.address or r.name[len(head) :].lstrip(", ").strip() or None
            r.name = head
        out.append(r)
    return out, n_merged


_TENANT_SEP = re.compile(r"( - | – | at | tại |, )", re.IGNORECASE)


def drop_tenants(recs: list) -> tuple[list, list]:
    """Quán gắn nhãn mốc lớn nhưng thật ra là cửa hàng trong mall khác ("Nhà Sách Văn Lang - Pearl Plaza", "C Club at Crescent
    Mall"): tên có dấu phân cách và chứa trọn tên (≥ 2 từ) của một mốc cùng kind trong 700 m, thêm ≥ 2 từ khác."""
    cell = 0.01
    landmarks = [
        r for r in recs if r.kind in COMMERCIAL_LANDMARKS
    ]  # công viên/bảo tàng không có "tenant"
    grid: dict[tuple[int, int, str], list] = defaultdict(list)
    for r in landmarks:
        grid[(math.floor(r.lat / cell), math.floor(r.lng / cell), r.kind)].append(r)
    dropped = set()
    for a in landmarks:
        if not _TENANT_SEP.search(a.name):
            continue
        ta = set(tokens(a.name, drop_generic=True)) | set(
            tokens(a.name.replace(",", " "), drop_generic=True)
        )
        r0, c0 = math.floor(a.lat / cell), math.floor(a.lng / cell)
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                for b in grid.get((r0 + dr, c0 + dc, a.kind), ()):
                    if b is a or b.external_id in dropped:
                        continue
                    tb = set(tokens(b.name))
                    if (
                        len(tb) >= 2
                        and tb <= ta
                        and len(ta - tb) >= 2
                        and meters(a.lat, a.lng, b.lat, b.lng) < TENANT_RADIUS_M
                        and not _TENANT_SEP.search(b.name)
                    ):
                        dropped.add(a.external_id)
    return [r for r in recs if r.external_id not in dropped], [
        r for r in recs if r.external_id in dropped
    ]


def drop_brand_typos(recs: list) -> tuple[list, list]:
    """Mall/rạp tên viết sai thương hiệu ("Crensent Mall", "Aone Mall Bình Tân") còn sót sau gộp → bỏ."""
    dropped = [
        r
        for r in recs
        if r.kind in COMMERCIAL_LANDMARKS
        and r.sources == ["overture"]
        and set(_raw_words(getattr(r, "raw_name", r.name))) & BRAND_TYPOS
    ]
    ids = {r.external_id for r in dropped}
    return [r for r in recs if r.external_id not in ids], dropped


# ── cờ sai vị trí ────────────────────────────────────────────────────────────────────────────────

# Quận/huyện nhắc trong tên/địa chỉ → khoá tra trong bảng tâm (`districts_*.json` `short`)
_NUMBERED = re.compile(r"\b(?:quan|q)\s?\.?\s?(\d{1,2})\b")
_NAMED = (
    "binh thanh|binh tan|go vap|phu nhuan|tan binh|tan phu|nha be|hoc mon|cu chi|binh chanh|can gio|thu duc|"
    "ba dinh|hoan kiem|dong da|hai ba trung|cau giay|thanh xuan|tay ho|long bien|ha dong|hoang mai|nam tu liem|bac tu liem"
)
_NAMED_RE = re.compile(rf"\b({_NAMED})\b")
# Huyện/thành phố rộng: tâm hộp bao không đại diện (Saigon Mia nằm ở Bình Chánh nhưng cách "tâm" 12 km)
_BIG_DISTRICTS = frozenset({"binh chanh", "can gio", "cu chi", "hoc mon", "nha be", "tp thu duc"})
_MERGED_TO_THU_DUC = {"2", "9"}  # Quận 2/9 cũ nằm trong TP Thủ Đức


def district_centres(
    districts: list[tuple[str, float, float]],
) -> dict[str, tuple[float, float, float]]:
    """short → (lat, lng, bán kính chấp nhận km). Tên trùng (TP Thủ Đức nhiều phường) lấy trung bình; bán kính =
    1,2 × khoảng cách tới tâm khác gần nhất, kẹp 5–20 km."""
    acc: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for short, lat, lng in districts:
        acc[fold(short)].append((lat, lng))
    centres = {
        k: (sum(p[0] for p in v) / len(v), sum(p[1] for p in v) / len(v)) for k, v in acc.items()
    }
    out = {}
    for k, (lat, lng) in centres.items():
        others = [meters(lat, lng, la, lo) / 1000 for kk, (la, lo) in centres.items() if kk != k]
        nearest = min(others) if others else 10.0
        spread = max(
            (meters(lat, lng, la, lo) / 1000 for la, lo in acc[k]), default=0.0
        )  # TP Thủ Đức: trải nhiều phường
        radius = min(20.0, max(5.0, 1.2 * nearest, spread + 3.0))
        out[k] = (lat, lng, 20.0 if k in _BIG_DISTRICTS else radius)
    return out


def mentioned_districts(text: str, centres: dict) -> list[str]:
    folded = fold(text)
    found = []
    for n in _NUMBERED.findall(folded):
        key = "thu duc" if n in _MERGED_TO_THU_DUC else f"q{n}"
        if key in centres or key == "thu duc":
            found.append("tp thu duc" if key == "thu duc" else key)
    for name in _NAMED_RE.findall(folded):
        key = "tp thu duc" if name == "thu duc" else name
        if key in centres:
            found.append(key)
    return [k for k in dict.fromkeys(found) if k in centres]


def flag_district_mismatch(rec, centres: dict) -> str | None:
    """Tên/địa chỉ nhắc quận X nhưng quán cách tâm X xa hơn bán kính và gần tâm khác hơn nhiều → lý do (chuỗi), hoặc None."""
    keys = mentioned_districts(f"{getattr(rec, 'raw_name', rec.name)} {rec.address or ''}", centres)
    if not keys:
        return None
    dist = {k: meters(rec.lat, rec.lng, centres[k][0], centres[k][1]) / 1000 for k in keys}
    if any(dist[k] <= centres[k][2] for k in keys):
        return None
    nearest = min(meters(rec.lat, rec.lng, lat, lng) / 1000 for lat, lng, _ in centres.values())
    worst = min(keys, key=lambda k: dist[k])
    # Tên phường/xã trùng tên quận ở nơi khác (Bình Chánh, Bình Tân, Tân Phú…) nên chỉ cờ khi lệch RẤT xa
    # mall/rạp: chỉ cần lệch hơn bán kính của quận (tên mall thường ghi đúng quận); quán thường: lệch RẤT xa mới cờ
    far = 0.0 if rec.kind in COMMERCIAL_LANDMARKS else max(2 * centres[worst][2], DISTRICT_FAR_KM)
    if dist[worst] < far or dist[worst] < 2 * max(nearest, 1.0):
        return None
    return f"nhắc {worst} nhưng cách tâm {dist[worst]:.1f} km (gần tâm khác nhất {nearest:.1f} km)"


def build_name_index(recs: list) -> dict[tuple[str, str], list[tuple[float, float]]]:
    """Cặp từ liền nhau (không dấu) trong tên + địa chỉ của MỌI quán → toạ độ. Để hỏi "nơi nào nhắc tới tên này"."""
    index: dict[tuple[str, str], list[tuple[float, float]]] = defaultdict(list)
    for r in recs:
        words = [w for w in _SPLIT.split(fold(f"{short_name(r.name)} {r.address or ''}")) if w]
        for pair in set(itertools.pairwise(words)):
            index[pair].append((r.lat, r.lng))
    return index


def _place_phrase(name: str) -> list[str]:
    """Phần tên riêng của mốc thương hiệu: các từ SAU từ thương hiệu/loại cuối cùng, tới số đầu tiên.
    "Vincom Center Đồng Khởi" → [dong, khoi]; "B1-Vincom Mega Mall Royal City 72 Nguyễn Trãi" → []."""
    words = [w for w in tokens(name, drop_generic=True)]
    last = max((i for i, w in enumerate(words) if w in _BRAND_WORDS), default=-1)
    if last < 0:
        return []
    tail = []
    for w in words[last + 1 :]:
        if w.isdigit():
            break
        tail.append(w)
    return tail


def flag_landmark_elsewhere(rec, index: dict) -> str | None:
    """Mall/rạp mang tên thương hiệu + địa danh ("Vincom Center Đồng Khởi") mà địa danh đó được ≥ 5 quán khác nhắc tới,
    tập trung quanh một nơi (≥ 60 % trong 2 km) cách mốc 2,5–25 km → lý do. Xa hơn 25 km là tỉnh khác, không phải lệch."""
    if rec.kind not in COMMERCIAL_LANDMARKS:
        return None
    tail = _place_phrase(rec.name)
    for pair in itertools.pairwise(tail):
        pts = index.get(pair, [])
        if len(pts) < 5 or len(pts) > 2000:
            continue
        if sum(1 for la, lo in pts if meters(la, lo, rec.lat, rec.lng) < 1500) >= 2:
            continue  # ngay quanh mốc đã có quán nhắc tên này → vị trí hợp lý
        # cụm đông nhất (tâm là một trong các điểm nhắc, bán kính 2 km); tên có thể trùng ở tỉnh khác ("Đồng Khởi" Biên Hòa)
        best, best_n = None, 0
        for la, lo in pts[:400]:
            n = sum(1 for la2, lo2 in pts if meters(la, lo, la2, lo2) < 2000)
            if n > best_n:
                best, best_n = (la, lo), n
        if best is None or best_n < 5:
            continue
        km = meters(rec.lat, rec.lng, best[0], best[1]) / 1000
        if POSITION_FAR_KM < km < POSITION_MAX_KM:
            return f'"{" ".join(pair)}" được {best_n}/{len(pts)} quán nhắc quanh ({best[0]:.4f}, {best[1]:.4f}), mốc cách {km:.1f} km'
    return None


def position_flags(
    recs: list, districts: list[tuple[str, float, float]]
) -> list[tuple[object, str]]:
    """Mọi cờ nghi sai vị trí: [(rec, lý do)]."""
    centres = district_centres(districts)
    index = build_name_index(recs)
    flags = []
    for r in recs:
        reason = flag_district_mismatch(r, centres) or flag_landmark_elsewhere(r, index)
        if reason:
            flags.append((r, reason))
    return flags
