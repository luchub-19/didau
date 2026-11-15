"""Map loại quán (OSM tag / Overture category) → `kind` → `PlaceCategory` (CR-17 A, `docs/phase7/MAP-POI.md` §3.1).

File này chỉ dùng thư viện chuẩn để `scripts/build_places.py` import được mà không cần môi trường backend.
"""

import re
import unicodedata
from collections.abc import Mapping

from app.domain.enums import PlaceCategory

# Các giá trị amenity của snapshot cũ `pois_*` (scripts/build_osm_pois.py)
OSM_AMENITIES: tuple[str, ...] = (
    "restaurant",
    "cafe",
    "fast_food",
    "food_court",
    "bar",
    "pub",
    "ice_cream",
)

# kind → category (MAP-POI §3.1). Thứ tự = thứ tự hiển thị trong tài liệu.
KIND_CATEGORY: dict[str, PlaceCategory] = {
    "restaurant": PlaceCategory.FOOD,
    "eatery": PlaceCategory.FOOD,
    "fast_food": PlaceCategory.FOOD,
    "bakery": PlaceCategory.FOOD,
    "cafe": PlaceCategory.DRINK,
    "tea": PlaceCategory.DRINK,
    "dessert": PlaceCategory.DRINK,
    "bar": PlaceCategory.DRINK,
    "mall": PlaceCategory.SHOPPING,
    "supermarket": PlaceCategory.SHOPPING,
    "cinema": PlaceCategory.ENTERTAINMENT,
    "karaoke": PlaceCategory.ENTERTAINMENT,
    "play": PlaceCategory.ENTERTAINMENT,
    "park": PlaceCategory.SIGHTSEEING,
    "museum": PlaceCategory.SIGHTSEEING,
}

# Tag OSM → kind, xét theo thứ tự khoá amenity → shop → leisure → tourism
_OSM_KIND: dict[str, dict[str, str]] = {
    "amenity": {
        "restaurant": "restaurant",
        "fast_food": "fast_food",
        "food_court": "eatery",
        "cafe": "cafe",
        "bar": "bar",
        "pub": "bar",
        "biergarten": "bar",
        "nightclub": "bar",
        "ice_cream": "dessert",
        "cinema": "cinema",
        "karaoke_box": "karaoke",
    },
    "shop": {
        "bakery": "bakery",
        "pastry": "bakery",
        "coffee": "cafe",
        "tea": "tea",
        "beverages": "tea",
        "mall": "mall",
        "department_store": "mall",
        "supermarket": "supermarket",
    },
    "leisure": {
        "park": "park",
        "amusement_arcade": "play",
        "bowling_alley": "play",
        "escape_game": "play",
        "water_park": "play",
    },
    "tourism": {
        "museum": "museum",
        "gallery": "museum",
        "zoo": "park",
        "theme_park": "play",
    },
}

# Overture `taxonomy.primary` cụ thể hơn `basic_category` → xét trước
_OVT_TAXONOMY_KIND: dict[str, str] = {
    "bakery": "bakery",
    "patisserie_cake_shop": "bakery",
    "ice_cream_shop": "dessert",
    "dessert_shop": "dessert",
    "frozen_yogurt_shop": "dessert",
    "bubble_tea_shop": "tea",
    "tea_room": "tea",
    "smoothie_juice_bar": "tea",
    "karaoke_venue": "karaoke",
    "bowling_alley": "play",
    "pool_billiards": "play",
    "escape_room": "play",
    "arcade": "play",
    "amusement_park": "play",
    "water_park": "play",
    "grocery_store": "supermarket",
    "organic_grocery_store": "supermarket",
    "supermarket": "supermarket",
    "zoo": "park",
    "food_court": "eatery",
}

_OVT_BASIC_KIND: dict[str, str] = {
    "restaurant": "restaurant",
    "casual_eatery": "eatery",
    "food_court": "eatery",
    "food_truck_stand": "eatery",
    "fast_food_restaurant": "fast_food",
    "coffee_shop": "cafe",
    "cafe": "cafe",
    "non_alcoholic_beverage_venue": "tea",
    "smoothie_juice_bar": "tea",
    "bar": "bar",
    "alcoholic_beverage_venue": "bar",
    "dance_club": "bar",
    "lounge": "bar",
    "shopping_mall": "mall",
    "department_store": "mall",
    "supermarket": "supermarket",
    "movie_theater": "cinema",
    "arcade": "play",
    "amusement_park": "play",
    "park": "park",
    "public_plaza": "park",
    "zoo": "park",
    "museum": "museum",
    "art_gallery": "museum",
}


def fold_text(text: str) -> str:
    """Bỏ dấu tiếng Việt, hạ chữ thường, gộp khoảng trắng (đ → d)."""
    text = text.replace("đ", "d").replace("Đ", "d")
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", stripped.lower()).strip()


# ── Làm sạch loại (T-104, MAP-POI §10) ───────────────────────────────────────────────────────────
# Tên đã `fold_text` (không dấu, chữ thường). Tất cả luật nằm ở đây để build và test dùng chung.

# Không phải nơi đi chơi — loại hẳn, ở MỌI kind (cửa hàng tiện lợi theo brand, công ty, điện máy, viễn thông, bảo hiểm…)
_EXCLUDED_NAME = re.compile(
    r"\b(circle ?k|family ?mart|mini ?stop|gs ?25|7 ?-? ?eleven|seven eleven|b ?'? ?s ?mart|bsmart|cvs ?mart|"
    r"cong ty|tnhh|jsc|co ?\.? ?ltd|ctcp|chi nhanh cong ty|"
    r"dien may|dien lanh|nguyen kim|the gioi di dong|thegioididong|fpt ?shop|vien thong|viettel|vnpt|mobifone|"
    r"cua hang tien loi|dai ly|\bgas\b|co so san xuat|nha phan phoi|nguyen lieu|showroom|thiet bi|khuon banh|may (in|lanh|tinh)|khu do thi|chung cu|nha dat|thu mua|"
    r"bao hiem|bao viet|ngan hang|atm|nghia trang|nghia dia|nha tang le|cemetery|hoa vien nghia|nha dau xe|bai do xe|bai gui xe|parking)\b"
)
# Chợ: không lấy làm siêu thị/trung tâm thương mại (chợ truyền thống)
_MARKET_NAME = re.compile(
    r"^(cho|khu cho|trung tam cho|sap|cho dau moi)\b|\bcho (dem|dau moi|truyen thong)\b"
)

# Chuỗi siêu thị có tên riêng → luôn là supermarket (trừ khi tên là mall)
_SUPERMARKET_BRAND = re.compile(
    r"\b(co ?\.? ?op ?(mart|food|xtra|smile|extra)?|coopmart|coopxtra|copmart|bach hoa xanh|bhx|"
    r"win ?mart|vin ?mart|vinhomes mart|wineco|lotte ?mart|lotte market|aeon|citimart|citi ?mart|maxvalu|"
    r"gogo|big ?c|e ?mart|emart|mega ?market|mm mega|metro|king ?food(mart)?|satra|annam|nam an market|"
    r"fuji ?mart|tops market|k ?-? ?market|famall|finelife|lan chi mart|bluesky)\b|go ?!|^go\b(?! vap)|sieu thi go\b"
)
# Từ chung "siêu thị / …mart / …market": chỉ nhận khi không phải cửa hàng chuyên doanh
_SUPERMARKET_GENERIC = re.compile(r"\b(sieu thi|supermarket|hypermarket)\b|\w*mart\b|\w*market\b")
_SPECIALTY_NAME = re.compile(
    r"\b(tuyen dung|ke sieu thi|toc|may|my nghe|vat tu|phan bon|sach|shop|store|sua|me bau|em be|me va be|long mi|nail|xe may|xe dap|noi that|dien may|dien lanh|do choi|gas|hai san|"
    r"yen sao|trai cay|hoa qua|thuc pham|nong san|dac san|gao|phu kien|thoi trang|my pham|duoc pham|nha thuoc|"
    r"vat lieu|cua hang|dai ly|online|rau|thit|ruou|wine|bia|hat dinh duong|sam|thuoc|spa|tham my|door)\b"
)
_REMAP_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "mall",
        re.compile(r"\b(mall|tttm|trung tam thuong mai|plaza|shopping center|department store)\b"),
    ),
    ("cafe", re.compile(r"\b(cafe|coffee|ca phe|cf)\b")),
    ("tea", re.compile(r"\b(tra sua|tra|tea|sinh to|nuoc ep|juice|smoothie)\b")),
    ("bakery", re.compile(r"\b(banh mi|banh ngot|tiem banh|bakery|patisserie)\b")),
    ("restaurant", re.compile(r"\b(nha hang|quan an|pho|bun|com|lau|nuong|bbq|quan nhau)\b")),
)


def is_excluded(name: str, brand: str | None = None) -> bool:
    """Điểm không phải nơi đi chơi (tiện lợi, công ty, điện máy, viễn thông, bảo hiểm…) — loại ở mọi kind."""
    return bool(_EXCLUDED_NAME.search(fold_text(f"{name} {brand or ''}".replace("_", " "))))


def is_traditional_market(name: str) -> bool:
    return bool(_MARKET_NAME.search(fold_text(name)))


# Tên "ra dáng" của mốc lớn. Overture/OSM gắn nhãn shopping_mall/park/museum/cinema cho cả tiệm tạp hoá, lớp học, kho…
# ("Cửa hàng Sữa Khánh Thư", "Presto Piano") nên các kind này đòi tên có dấu hiệu của loại (T-104, MAP-POI §10).
LANDMARK_NAME: dict[str, re.Pattern[str]] = {
    "mall": re.compile(
        r"mall|plaza|tttm|trung tam (thuong mai|mua sam)|center|centre|vincom|aeon|lotte|parkson|takashimaya|pearl|landmark|"
        r"diamond|crescent|estella|vivo|giga|square|tower|bitexco|galaxy|thuong mai|department|big ?c\b|emart|\bgo\b|"
        r"mega ?market|\bmm\b|metro|sense city|saigon|sai gon|pavilion|paragon|celadon|pandora|etown|nowzone|mart|market|"
        r"sieu thi|pico|city|tiara|aqua|sunrise|river|gate|crown|hub|avenue|galleria|phố|pho di bo|khu mua sam"
    ),
    "cinema": re.compile(
        r"cgv|bhd|lotte|galaxy|cinema|\brap\b|cine|beta|mega gs|dcine|platinum|phim|theater|theatre|movie|starlight|"
        r"cenistar|cinestar|studio|imax|kinoplex"
    ),
    "park": re.compile(
        r"cong vien|park|vuon|\bho\b|lake|khu (du lich|sinh thai|vui choi)|sinh thai|garden|quang truong|\bdam\b|\bdao\b|"
        r"cay xanh|tuong dai|thao cam vien|zoo|bien\b|bai (tam|bien)|dia dao|suoi|thac|rung|safari|farm|trang trai|"
        r"da cau|bo song|pho di bo|bay"
    ),
    "museum": re.compile(
        r"bao tang|museum|gallery|trien lam|di tich|dinh |\bchua\b|\bden\b|van mieu|nha tu|thu vien|nha hat|opera|"
        r"khu luu niem|nha luu niem|hoang thanh|thanh co|lang |cung |nha co|biet thu|nha tho|cathedral|pagoda|temple|"
        r"church|tuong dai|dai (hoc|tuong)|exhibition|art (center|space|house)|trung tam (van hoa|nghe thuat|trien lam)"
    ),
}


# Từng kind: tên có dấu hiệu này thì KHÔNG phải loại đó (rác Overture/OSM gắn nhầm: xưởng phim, nghĩa trang, bãi bóng…)
_KIND_REJECT: dict[str, re.Pattern[str]] = {
    # cửa hàng/quán nằm TRONG siêu thị mang tên siêu thị ("Kfc Big C", "Đệ Nhất Yến Đảo - Co.opmart") không phải siêu thị
    "supermarket": re.compile(
        r"\b(kfc|casio|yen dao|tommy|pnj|highlands|starbucks|lotteria|jollibee|mcdonald|nhi)\b"
    ),
    "cinema": re.compile(
        r"lotteria|hang phim|phim truong|tutor|production|ca phe|cafe|coffee|gosell|serum"
    ),
    "park": re.compile(
        r"lotteria|nuoc thai|xu ly|chung cu|nha dat|\bspa\b|san (banh|bong)|metro|memorial|du an|cafe|coffee|quan |nha hang|"
        r"noi quy|vuon uom|sidewalk|bonsai|shop|resort|villa|homestay|khach san|hotel|truong "
    ),
    "museum": re.compile(
        r"lotteria|studio|music|academy|school|truong |creative|photo ?(shop|studio)|piano|henna|lop "
    ),
    "mall": re.compile(r"lotteria"),
    "karaoke": re.compile(r"cho thue|thue loa|loa keo|day hat"),
    "play": re.compile(
        r"\b(shop|store|cake|tea|technolog\w*|khu do thi|huong tram|thao moc)\b|^so \d"
    ),
}
_PLAY_NAME = re.compile(
    r"bida|billiard|\bpool\b|bowling|game|arcade|timezone|kid|vui choi|escape|trampoline|sky|park|club|clb|fantasy|land\b|"
    r"world|zone|laser|\bvr\b|cau lac bo|cong vien|khu du lich|karting|go kart|paintball|golf|ho boi|aquarium|thuy cung|"
    r"xiec|circus|bong ban|pickle|cau long|swim|boi loi|snooker|carom|lo\b|dam sen|suoi tien|roller|coaster|escape|mini"
)

# Có chữ "mall/plaza…" nhưng thật ra là cửa hàng chuyên doanh/chung cư/văn phòng → không phải mall
_NOT_A_MALL = re.compile(
    r"\b(chung cu|can ho|khu do thi|office|van phong|sieu thi (sua|tranh|xe|online|tinh dau|phu tung|tong hop)|"
    r"lotteria|\btai\b|\btang \d|sua|me (va|&) be|do go|mat kinh|tinh dau|den led|xe may|dien thoai|noi that|ban ghe|gom su|mua hang)\b|\bshop\b"
)


def looks_like_landmark(kind: str, name: str) -> bool:
    pattern = LANDMARK_NAME.get(kind) or (_PLAY_NAME if kind == "play" else None)
    folded = fold_text(name)
    reject = _KIND_REJECT.get(kind)
    if reject is not None and reject.search(folded):
        return False
    if kind == "mall" and _NOT_A_MALL.search(folded) and not _SUPERMARKET_BRAND.search(folded):
        return False
    return pattern is None or bool(pattern.search(folded))


def clean_kind(kind: str | None, name: str, brand: str | None = None) -> str | None:
    """Cổng cuối cho mọi nguồn: bỏ điểm không phải nơi đi chơi (`is_excluded`), chợ truyền thống ở kind mall/supermarket,
    và mall/rạp/công viên/bảo tàng mà tên không ra dáng loại đó (`LANDMARK_NAME`)."""
    if kind is None or is_excluded(name, brand):
        return None
    if kind in ("mall", "supermarket") and is_traditional_market(name):
        return None
    if not looks_like_landmark(kind, f"{name} {brand or ''}"):
        return None
    return kind


def _remap_kind(folded: str) -> str | None:
    for kind, pattern in _REMAP_RULES:
        if pattern.search(folded):
            return kind
    return None


def grocery_kind(name: str, brand: str | None = None, *, trusted: bool = False) -> str | None:
    """kind của điểm Overture `grocery_store`/OSM `shop=supermarket` (MAP-POI §10): chỉ siêu thị thật mới là `supermarket`;
    còn lại xét tên (quán cà phê/trà/mall bị gắn nhầm) hoặc bỏ. `trusted` = OSM `shop=supermarket` (người vẽ bản đồ
    đã xác nhận) — giữ supermarket khi tên không có dấu hiệu nào khác. Không có tên → giữ supermarket."""
    folded = fold_text(f"{name} {brand or ''}")
    if not name.strip():
        return "supermarket"
    if _EXCLUDED_NAME.search(folded) or _MARKET_NAME.search(fold_text(name)):
        return None
    is_mall = bool(_REMAP_RULES[0][1].search(folded))
    if _SUPERMARKET_BRAND.search(folded) or (
        _SUPERMARKET_GENERIC.search(folded) and not _SPECIALTY_NAME.search(folded)
    ):
        # "The Crescent Mall"/"TTTM …" là trung tâm thương mại dù được gắn nhãn siêu thị; "Lotte Mart", "AEON Mall"… giữ
        # theo brand (kind mall/supermarket do nguồn quyết định, ở đây chỉ có nhãn grocery nên coi là siêu thị)
        return (
            "mall"
            if is_mall and not re.search(r"\b(sieu thi|mart|market)\b", folded)
            else "supermarket"
        )
    remapped = _remap_kind(folded)
    if remapped is not None:
        return remapped
    return None  # `trusted` (OSM shop=supermarket) vẫn phải có dấu hiệu trong tên: nhiều tiệm tạp hoá/shop bị gắn nhầm


def osm_kind(tags: Mapping[str, str]) -> str | None:
    """kind của một phần tử OSM; None nếu không thuộc nhóm "đi chơi". `shop=supermarket` đi qua `grocery_kind`
    khi có `name`/`brand` trong tags (build_places truyền thêm tên vào tags)."""
    for key, table in _OSM_KIND.items():
        kind = table.get(tags.get(key, ""))
        if kind == "supermarket" and tags.get("name"):
            return grocery_kind(tags["name"], tags.get("brand"), trusted=True)
        if kind:
            return kind
    return None


def overture_kind(
    basic: str | None, taxonomy: str | None, name: str = "", brand: str | None = None
) -> str | None:
    """kind của một điểm Overture. Tên có chữ "karaoke" luôn là karaoke (Overture hay xếp nhầm vào bar/nhà hàng).
    `grocery_store` chỉ là supermarket khi là siêu thị thật (xem `grocery_kind`)."""
    if "karaoke" in fold_text(name):
        return "karaoke"
    kind = _OVT_TAXONOMY_KIND.get(taxonomy or "") or _OVT_BASIC_KIND.get(basic or "")
    if kind == "supermarket":
        return grocery_kind(name, brand, trusted="supermarket" in (taxonomy, basic))
    return kind


def kind_category(kind: str | None) -> PlaceCategory:
    """kind → PlaceCategory; kind lạ/rỗng → OTHER."""
    return KIND_CATEGORY.get(kind or "", PlaceCategory.OTHER)


def osm_category(tags: Mapping[str, str]) -> PlaceCategory:
    """Map tag OSM sang PlaceCategory qua kind; tag lạ rơi về OTHER."""
    return kind_category(osm_kind(tags))


def osm_address(tags: Mapping[str, str]) -> str | None:
    """Ghép địa chỉ từ các tag `addr:*` (số nhà, đường, phường, quận, thành phố)."""
    street = " ".join(p for p in (tags.get("addr:housenumber"), tags.get("addr:street")) if p)
    parts = [
        street,
        tags.get("addr:subdistrict") or tags.get("addr:ward"),
        tags.get("addr:district"),
        tags.get("addr:city"),
    ]
    text = ", ".join(p for p in parts if p)
    return text or tags.get("addr:full") or None
