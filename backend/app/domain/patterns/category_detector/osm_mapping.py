from collections.abc import Mapping

from app.domain.enums import PlaceCategory

# Các giá trị amenity được đưa vào snapshot (khớp scripts/build_osm_pois.py)
OSM_AMENITIES: tuple[str, ...] = (
    "restaurant",
    "cafe",
    "fast_food",
    "food_court",
    "bar",
    "pub",
    "ice_cream",
)

_AMENITY_TO_CATEGORY: dict[str, PlaceCategory] = {
    "restaurant": PlaceCategory.FOOD,
    "fast_food": PlaceCategory.FOOD,
    "food_court": PlaceCategory.FOOD,
    "cafe": PlaceCategory.DRINK,
    "bar": PlaceCategory.DRINK,
    "pub": PlaceCategory.DRINK,
    "ice_cream": PlaceCategory.DRINK,
}


def osm_category(tags: Mapping[str, str]) -> PlaceCategory:
    """Map tag OSM sang PlaceCategory; amenity lạ rơi về OTHER."""
    return _AMENITY_TO_CATEGORY.get(tags.get("amenity", ""), PlaceCategory.OTHER)


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
