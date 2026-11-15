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


def osm_kind(tags: Mapping[str, str]) -> str | None:
    """kind của một phần tử OSM; None nếu không thuộc nhóm "đi chơi"."""
    for key, table in _OSM_KIND.items():
        kind = table.get(tags.get(key, ""))
        if kind:
            return kind
    return None


def overture_kind(basic: str | None, taxonomy: str | None, name: str = "") -> str | None:
    """kind của một điểm Overture. Tên có chữ "karaoke" luôn là karaoke (Overture hay xếp nhầm vào bar/nhà hàng)."""
    if "karaoke" in fold_text(name):
        return "karaoke"
    return _OVT_TAXONOMY_KIND.get(taxonomy or "") or _OVT_BASIC_KIND.get(basic or "")


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
