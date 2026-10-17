import re
from typing import ClassVar
from urllib.parse import urlparse

from app.domain.enums import PlaceCategory
from app.domain.patterns.category_detector.detector import IPlaceCategoryDetector


def _normalize_text(text: str) -> str:
    """Chuẩn hóa chuỗi văn bản: chuyển chữ thường, loại bỏ khoảng trắng thừa."""
    return " ".join(text.lower().strip().split())


class KeywordCategoryDetector(IPlaceCategoryDetector):
    """Nhận diện danh mục địa điểm bằng bộ từ khóa tiếng Việt có dấu và không dấu."""

    # Danh sách từ khóa phân loại theo mức ưu tiên
    _CATEGORY_KEYWORDS: ClassVar[dict[PlaceCategory, list[str]]] = {
        PlaceCategory.FOOD: [
            # Món ăn & quán ăn phổ biến
            "phở", "pho", "phở bò", "phở gà", "phở thìn", "phở 24", "phở bát đàn",
            "bún bò", "bun bo", "bún bò huế", "bun bo hue", "bún chả", "bun cha",
            "bún đậu", "bun dau", "bún riêu", "bun rieu", "bún mắm", "bún cá",
            "bún thịt nướng", "bún mọc", "bún thang", "bún",
            "bánh canh", "banh canh", "hủ tiếu", "hu tieu", "miến", "hủ miến",
            "bánh mì", "banh mi", "bánh xèo", "banh xeo", "bánh cuốn", "banh cuon",
            "bánh khọt", "bánh bèo", "bánh tráng nướng", "bánh tráng cuốn",
            "cơm tấm", "com tam", "cơm niêu", "com nieu", "cơm gà", "com ga",
            "cơm sườn", "cơm bình dân", "cơm văn phòng", "cơm",
            "cháo lòng", "cháo vịt", "cháo sườn", "cháo", "xôi", "xôi gà",
            "bò né", "bo ne", "bò kho", "bo kho", "bò tơ", "bò nướng", "bò lúc lắc",
            "lẩu bò", "lau bo", "heo quay", "vịt quay", "vịt cỏ",
            "gà rán", "ga ran", "gà nướng", "gà ta", "gà hấp", "gà luộc",
            "dê núi", "lẩu dê", "bê thui",
            "lẩu", "lau", "nướng", "nuong", "bbq", "buffet",
            "dimsum", "há cảo", "ha cao", "sủi cảo",
            "mì quảng", "mi quang", "mì cay", "mi cay", "mì vịt tiềm", "mì xào", "mì sợi",
            "súp", "nem nướng", "chả cá", "chả lụa",
            "ốc", "quán ốc", "hải sản", "hai san",
            "quán ăn", "quan an", "nhà hàng", "nha hang", "quán nhậu", "quan nhau",
            "tiệm ăn", "ẩm thực", "am thuc", "tiệm bánh", "bakery", "bếp",
            "pizza", "sushi", "sashimi", "ramen", "burger", "steak",
            "kimbap", "tokbokki",
            # Thương hiệu / Chuỗi F&B
            "haidilao", "manwah", "kichi kichi", "kichi-kichi", "gogi house", "gogi",
            "sumo bbq", "king bbq", "dodo pizza", "pizza 4p's", "pizza 4ps",
            "the pizza company", "domino's", "dominos", "lotteria", "kfc", "jollibee",
            "mcdonald's", "mcdonalds", "texas chicken", "popeyes", "otoke chicken",
            "cơm tấm cali", "wrap & roll", "san fu lou", "baoz dimsum",
        ],
        PlaceCategory.DRINK: [
            # Cà phê, trà, trà sữa, sinh tố
            "cà phê", "ca phe", "cafe", "café", "càfê", "coffee",
            "trà sữa", "tra sua", "milk tea", "milktea", "boba",
            "trà đào", "tra dao", "trà sen", "trà ô long", "trà oolong",
            "trà xanh", "trà trái cây", "matcha",
            "sinh tố", "sinh to", "nước ép", "nuoc ep", "juice", "smoothie",
            "tàu hủ", "chè", "che", "sữa chua trân châu", "sữa chua",
            "tiệm trà", "tiem tra", "quán trà", "tea", "quán nước", "quan nuoc",
            "nước mía", "kem", "tiệm cà phê", "tiem ca phe",
            # Đồ uống có cồn / Quán bar / Pub
            "pub", "bar", "beer club", "beerclub", "bia tươi", "bia suoi",
            "bia thủ công", "craft beer", "cocktail bar", "cocktail",
            "lounge", "rooftop bar", "speakeasy", "tavern", "bia sệt", "quán bia",
            # Thương hiệu chuỗi đồ uống
            "highlands coffee", "highlands", "the coffee house", "phúc long", "phuc long",
            "katinat saigon kafe", "katinat", "koi thé", "koi the", "gong cha",
            "tocotoco", "toco toco", "phê la", "phe la", "trung nguyên", "trung nguyen",
            "passio", "chuk chuk", "mixue", "starbucks", "cheese coffee", "okkio",
            "cộng cà phê", "cong ca phe", "the alley", "ding tea", "sharetea",
            "tiger sugar", "chill skybar",
        ],
        PlaceCategory.ENTERTAINMENT: [
            # Rạp chiếu phim
            "rạp chiếu phim", "rap chieu phim", "rạp phim", "rap phim", "cinema", "cine",
            "cgv", "lotte cinema", "galaxy cinema", "bhd star", "bhd", "cinestar", "mega gs",
            # Giải trí, trò chơi, thể thao giải trí
            "karaoke", "bida", "billiards", "billiard", "bowling",
            "board game", "boardgame", "game zone", "game center",
            "khu vui chơi", "play center", "playzone", "escape room",
            "bắn súng sơn", "paintball", "công viên nước", "water park",
            "công viên giải trí", "amusement park", "rạp xiếc", "circus",
            "nhà hát", "opera house", "sân khấu kịch", "kịch hồng vân",
            "timezone", "vr game", "bắn cung", "trượt băng", "ice rink",
        ],
        PlaceCategory.SIGHTSEEING: [
            # Địa điểm tham quan, di tích, cảnh quan
            "bảo tàng", "bao tang", "museum", "gallery", "triển lãm", "trien lam",
            "di tích lịch sử", "di tích", "di tich", "danh lam thắng cảnh", "thắng cảnh",
            "công viên", "cong vien", "thảo cầm viên", "vườn bách thú", "zoo",
            "aquarium", "thủy cung", "phố đi bộ", "pho di bo", "walking street",
            "quảng trường", "quang truong", "square",
            "dinh độc lập", "dinh doc lap", "dinh thống nhất",
            "chùa", "pagoda", "temple", "đền", "miếu",
            "nhà thờ", "church", "cathedral", "nhà thờ đức bà",
            "hồ con rùa", "hồ gươm", "hồ tây", "hồ xuân hương",
            "bến nhà rồng", "cầu rồng", "tháp rùa", "tượng đài", "monument",
            "hải đăng", "lighthouse", "suối", "thác", "vịnh", "bán đảo",
        ],
        PlaceCategory.ACCOMMODATION: [
            # Khách sạn, lưu trú
            "khách sạn", "khach san", "hotel", "homestay", "home stay",
            "resort", "khu nghỉ dưỡng", "nhà nghỉ", "nha nghi",
            "motel", "hostel", "villa", "serviced apartment",
            "căn hộ dịch vụ", "lodge", "bungalow", "bed and breakfast",
            # Thương hiệu lưu trú
            "vinpearl", "intercontinental", "marriott", "sheraton", "hilton",
            "pullman", "novotel", "ibis", "mường thanh", "muong thanh",
            "sofitel", "anantara", "banyan tree",
        ],
        PlaceCategory.SHOPPING: [
            # Trung tâm mua sắm, siêu thị, chợ
            "trung tâm thương mại", "tttm", "shopping mall", "mall", "plaza",
            "chợ bến thành", "chợ bà chiểu", "chợ tân định", "chợ lớn", "chợ đồng xuân",
            "chợ đêm", "cho dem", "chợ", "siêu thị", "sieu thi", "supermarket", "mart",
            "co.opmart", "coopmart", "winmart", "vinmart", "lottemart", "lotte mart",
            "emart", "mega market", "bách hóa xanh",
            "aeon mall", "aeon", "takashimaya", "parkson", "crescent mall",
            "vincom center", "vincom mega mall", "vincom plaza", "vincom",
            "nhà sách", "nha sach", "bookstore", "fahasa",
            "cửa hàng thời trang", "tiệm vàng",
        ],
    }

    # Các từ khóa chỉ địa điểm phức hợp / trung tâm thương mại chứa nhiều dịch vụ
    _CONTAINER_KEYWORDS: ClassVar[set[str]] = {
        "vincom", "mall", "plaza", "aeon", "center", "lotte mart", "takashimaya",
        "crescent mall", "parkson", "mega mall", "tòa nhà", "chung cư", "tầng",
    }

    # Các từ khóa cơ quan, bệnh viện, trường học, hành chính công
    _INSTITUTIONAL_KEYWORDS: ClassVar[set[str]] = {
        "bệnh viện", "benh vien", "phòng khám", "phong kham",
        "trường đại học", "truong dai hoc", "trường học", "truong hoc",
        "trường thpt", "trường thcs", "trường tiểu học", "trường mầm non",
        "viện nghiên cứu", "trụ sở", "ủy ban", "uy ban", "công an", "cong an",
        "trạm y tế", "tram y te", "văn phòng", "van phong",
    }

    def detect(
        self,
        name: str,
        address: str | None = None,
        url: str | None = None,
        tags: list[str] | None = None,
    ) -> PlaceCategory:
        """Nhận diện danh mục bằng quét từ khóa trên tags, name và address."""
        # 1. Quét tags trước tiên nếu có
        if tags:
            for tag in tags:
                matched = self._match_text(tag)
                if matched != PlaceCategory.OTHER:
                    return matched

        # 2. Quét tên địa điểm
        matched_name = self._match_text(name)
        if matched_name != PlaceCategory.OTHER:
            return matched_name

        # 3. Quét địa chỉ nếu tên chưa ra kết quả
        if address:
            matched_addr = self._match_text(address)
            if matched_addr != PlaceCategory.OTHER:
                return matched_addr

        return PlaceCategory.OTHER

    def _match_text(self, text: str) -> PlaceCategory:
        norm_text = _normalize_text(text)
        if not norm_text:
            return PlaceCategory.OTHER

        # Kiểm tra xem có chứa từ khóa cơ sở công cộng / hành chính / y tế / giáo dục không
        has_institution = any(
            re.search(rf"(?<!\w){re.escape(ik)}(?!\w)", norm_text)
            for ik in self._INSTITUTIONAL_KEYWORDS
        )

        matches_by_category: dict[PlaceCategory, list[tuple[int, bool]]] = {}

        for category, keywords in self._CATEGORY_KEYWORDS.items():
            for kw in keywords:
                pattern = rf"(?<!\w){re.escape(kw)}(?!\w)"
                match = re.search(pattern, norm_text)
                if match:
                    score = len(kw)
                    is_prefix = match.start() == 0
                    if is_prefix:
                        score += 5
                    is_container = (
                        category == PlaceCategory.SHOPPING and kw in self._CONTAINER_KEYWORDS
                    )
                    if category not in matches_by_category:
                        matches_by_category[category] = []
                    matches_by_category[category].append((score, is_container))

        if not matches_by_category:
            return PlaceCategory.OTHER

        # Nếu có từ khóa cơ sở công cộng (bệnh viện, trường học...), kiểm tra xem có thương hiệu
        # F&B hoặc dịch vụ cụ thể bên trong không (VD: "Highlands Coffee Bệnh viện...")
        if has_institution:
            # Chỉ chấp nhận nếu có match cụ thể ở FOOD, DRINK, ENTERTAINMENT với từ khóa đủ mạnh
            has_commercial_brand = any(
                cat in matches_by_category for cat in (PlaceCategory.FOOD, PlaceCategory.DRINK)
            )
            if not has_commercial_brand:
                return PlaceCategory.OTHER

        # Kiểm tra xem có match nào ở các nhóm dịch vụ cụ thể không
        specific_categories = (
            PlaceCategory.FOOD,
            PlaceCategory.DRINK,
            PlaceCategory.ENTERTAINMENT,
            PlaceCategory.SIGHTSEEING,
            PlaceCategory.ACCOMMODATION,
        )

        has_specific_category = any(cat in matches_by_category for cat in specific_categories)

        # Nếu có category cụ thể, loại bỏ các match thuộc container mall để không bị ghi đè
        best_category = PlaceCategory.OTHER
        best_score = -1

        for category, scores in matches_by_category.items():
            for score, is_container in scores:
                if has_specific_category and is_container:
                    continue
                if score > best_score:
                    best_score = score
                    best_category = category

        return best_category


class UrlPatternCategoryDetector(IPlaceCategoryDetector):
    """Nhận diện danh mục địa điểm qua hostname và đường dẫn URL."""

    # Tên miền cho từng nhóm danh mục
    _ACCOMMODATION_DOMAINS = (
        "booking.com", "agoda.com", "airbnb.com", "airbnb.vn", "traveloka.com",
        "hotels.com", "trivago.com", "trivago.vn", "vntrip.vn", "mytour.vn",
        "luxstay.com", "marriott.com", "hilton.com", "vinpearl.com",
    )

    _ENTERTAINMENT_DOMAINS = (
        "cgv.vn", "lottecinemavn.com", "lottecinema.com.vn", "galaxycinema.vn",
        "bhdstar.vn", "cinestar.com.vn", "megagscinemas.vn", "tiptop.vn",
    )

    _SHOPPING_DOMAINS = (
        "shopee.vn", "lazada.vn", "tiki.vn", "sendo.vn", "aeon.com.vn", "vincom.com.vn",
    )

    _FOOD_DELIVERY_DOMAINS = (
        "shopeefood.vn", "foody.vn", "baemin.vn", "loship.vn", "now.vn",
    )

    _DRINK_SLUGS = (
        "ca-phe", "cafe", "coffee", "tra-sua", "tra", "tea", "boba",
        "milk-tea", "juice", "sinh-to", "smoothie", "bar", "pub", "beer", "cocktail",
    )

    _DRINK_NAME_KEYWORDS = (
        "cà phê", "ca phe", "cafe", "coffee", "trà sữa", "tra sua", "trà", "tea",
        "sinh tố", "sinh to", "nước ép", "nuoc ep", "juice", "bar", "pub", "cocktail", "bia",
    )

    def detect(
        self,
        name: str,
        address: str | None = None,
        url: str | None = None,
        tags: list[str] | None = None,
    ) -> PlaceCategory:
        """Nhận diện danh mục dựa trên hostname và đường dẫn của URL."""
        if not url or not isinstance(url, str):
            return PlaceCategory.OTHER

        url_str = url.strip().lower()
        if not url_str:
            return PlaceCategory.OTHER

        try:
            parsed = urlparse(url_str)
            domain = parsed.netloc.lower()
            path = parsed.path.lower()
        except (ValueError, AttributeError):
            return PlaceCategory.OTHER

        # Loại bỏ tiền tố www.
        domain = domain.removeprefix("www.")

        # 1. Lưu trú
        if any(domain == d or domain.endswith("." + d) for d in self._ACCOMMODATION_DOMAINS):
            return PlaceCategory.ACCOMMODATION

        # 2. Giải trí / Rạp phim
        if any(domain == d or domain.endswith("." + d) for d in self._ENTERTAINMENT_DOMAINS):
            return PlaceCategory.ENTERTAINMENT

        # 3. Giao đồ ăn / đồ uống (ShopeeFood, Foody, GrabFood, Baemin, Loship)
        is_grab_food = (domain == "grab.com" or domain.endswith(".grab.com")) and (
            "/food" in path or "food." in domain
        )
        is_food_delivery = is_grab_food or any(
            domain == d or domain.endswith("." + d) for d in self._FOOD_DELIVERY_DOMAINS
        )

        if is_food_delivery:
            # Kiểm tra xem có phải quán nước / đồ uống trong nền tảng giao đồ ăn không
            has_drink_in_url = any(slug in path for slug in self._DRINK_SLUGS)
            name_norm = _normalize_text(name)
            has_drink_in_name = any(
                re.search(rf"(?<!\w){re.escape(k)}(?!\w)", name_norm)
                for k in self._DRINK_NAME_KEYWORDS
            )
            if has_drink_in_url or has_drink_in_name:
                return PlaceCategory.DRINK
            return PlaceCategory.FOOD

        # 4. Thương mại điện tử / Mua sắm (loại trừ shopeefood)
        if domain != "shopeefood.vn" and any(
            domain == d or domain.endswith("." + d) for d in self._SHOPPING_DOMAINS
        ):
            return PlaceCategory.SHOPPING

        return PlaceCategory.OTHER


class CompositeCategoryDetector(IPlaceCategoryDetector):
    """Pipeline tổng hợp kết hợp nhiều detector theo thứ tự ưu tiên."""

    def __init__(
        self,
        detectors: list[IPlaceCategoryDetector] | None = None,
        fallback: PlaceCategory = PlaceCategory.OTHER,
    ) -> None:
        if detectors is None:
            # Ưu tiên mặc định: UrlPattern -> KeywordDetector
            self._detectors = [
                UrlPatternCategoryDetector(),
                KeywordCategoryDetector(),
            ]
        else:
            self._detectors = list(detectors)
        self._fallback = fallback

    @property
    def detectors(self) -> list[IPlaceCategoryDetector]:
        return list(self._detectors)

    @property
    def fallback(self) -> PlaceCategory:
        return self._fallback

    def detect(
        self,
        name: str,
        address: str | None = None,
        url: str | None = None,
        tags: list[str] | None = None,
    ) -> PlaceCategory:
        """Thực thi pipeline nhận diện danh mục, trả về kết quả đầu tiên khác OTHER."""
        for detector in self._detectors:
            category = detector.detect(
                name=name,
                address=address,
                url=url,
                tags=tags,
            )
            if category != PlaceCategory.OTHER:
                return category

        return self._fallback
