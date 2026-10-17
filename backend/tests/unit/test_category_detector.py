import pytest

from app.domain.enums import PlaceCategory
from app.domain.patterns.category_detector import (
    CompositeCategoryDetector,
    IPlaceCategoryDetector,
    KeywordCategoryDetector,
    UrlPatternCategoryDetector,
)


class TestKeywordCategoryDetector:
    """Kiểm thử bộ nhận diện danh mục theo từ khóa tiếng Việt (KeywordCategoryDetector)."""

    @pytest.fixture
    def detector(self) -> KeywordCategoryDetector:
        return KeywordCategoryDetector()

    # --- NHÓM 1: ĐỒ ĂN (FOOD) ---
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("Phở Thìn 13 Lò Đúc", PlaceCategory.FOOD),
            ("Bún bò Huế Đông Ba", PlaceCategory.FOOD),
            ("Bún chả Hương Liên", PlaceCategory.FOOD),
            ("Cơm tấm Ba Ghiền", PlaceCategory.FOOD),
            ("Bánh mì Huỳnh Hoa", PlaceCategory.FOOD),
            ("Hủ tiếu Nam Vang Liến Húa", PlaceCategory.FOOD),
            ("Bánh canh ghẹ Cầu Bông", PlaceCategory.FOOD),
            ("Bánh xèo Mười Xiềm", PlaceCategory.FOOD),
            ("Bò né 3 Ngon", PlaceCategory.FOOD),
            ("Lẩu Haidilao Landmark 81", PlaceCategory.FOOD),
            ("Pizza 4P's Bến Thành", PlaceCategory.FOOD),
            ("Quán Ốc Đào Nguyễn Trãi", PlaceCategory.FOOD),
            ("Gogi House BBQ", PlaceCategory.FOOD),
            ("Kichi Kichi Lẩu Băng Chuyền", PlaceCategory.FOOD),
            ("Dimsum Tiến Phát", PlaceCategory.FOOD),
            ("Gà rán KFC Hai Bà Trưng", PlaceCategory.FOOD),
            ("Cháo lòng Bà Út", PlaceCategory.FOOD),
            ("Mì Quảng Sâm", PlaceCategory.FOOD),
        ],
    )
    def test_detect_food_places(
        self, detector: KeywordCategoryDetector, name: str, expected: PlaceCategory
    ) -> None:
        assert detector.detect(name=name) == expected

    # --- NHÓM 2: ĐỒ UỐNG (DRINK) ---
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("Highlands Coffee Hàm Nghi", PlaceCategory.DRINK),
            ("The Coffee House - Trần Cao Vân", PlaceCategory.DRINK),
            ("Phúc Long Coffee & Tea", PlaceCategory.DRINK),
            ("Cà Phê Trứng 3T", PlaceCategory.DRINK),
            ("Trà sữa Koi Thé", PlaceCategory.DRINK),
            ("Katinat Saigon Kafe", PlaceCategory.DRINK),
            ("Gong Cha Hồ Tùng Mậu", PlaceCategory.DRINK),
            ("Phê La Đặng Tiến Đông", PlaceCategory.DRINK),
            ("Chill Skybar Rooftop", PlaceCategory.DRINK),
            ("Bia sệt 24/7", PlaceCategory.DRINK),
            ("Sinh tố & Nước ép 142", PlaceCategory.DRINK),
            ("Cộng Cà Phê", PlaceCategory.DRINK),
            ("Quán Bar Acoustic", PlaceCategory.DRINK),
        ],
    )
    def test_detect_drink_places(
        self, detector: KeywordCategoryDetector, name: str, expected: PlaceCategory
    ) -> None:
        assert detector.detect(name=name) == expected

    # --- NHÓM 3: GIẢI TRÍ (ENTERTAINMENT) ---
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("CGV Crescent Mall", PlaceCategory.ENTERTAINMENT),
            ("Lotte Cinema Cantavil", PlaceCategory.ENTERTAINMENT),
            ("Galaxy Cinema Nguyễn Du", PlaceCategory.ENTERTAINMENT),
            ("Karaoke Nnice Phan Xích Long", PlaceCategory.ENTERTAINMENT),
            ("Billiards Club Kỳ Hòa", PlaceCategory.ENTERTAINMENT),
            ("Bowling PowerBowl 388", PlaceCategory.ENTERTAINMENT),
            ("Boardgame Station Sài Gòn", PlaceCategory.ENTERTAINMENT),
            ("Timezone Megamall Thảo Điền", PlaceCategory.ENTERTAINMENT),
            ("Rạp chiếu phim Quốc Thanh", PlaceCategory.ENTERTAINMENT),
        ],
    )
    def test_detect_entertainment_places(
        self, detector: KeywordCategoryDetector, name: str, expected: PlaceCategory
    ) -> None:
        assert detector.detect(name=name) == expected

    # --- NHÓM 4: THAM QUAN (SIGHTSEEING) ---
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("Dinh Độc Lập", PlaceCategory.SIGHTSEEING),
            ("Bảo tàng Chứng tích Chiến tranh", PlaceCategory.SIGHTSEEING),
            ("Phố đi bộ Nguyễn Huệ", PlaceCategory.SIGHTSEEING),
            ("Hồ Con Rùa", PlaceCategory.SIGHTSEEING),
            ("Chùa Bửu Long", PlaceCategory.SIGHTSEEING),
            ("Nhà thờ Đức Bà Sài Gòn", PlaceCategory.SIGHTSEEING),
            ("Bến Nhà Rồng", PlaceCategory.SIGHTSEEING),
            ("Công viên Tao Đàn", PlaceCategory.SIGHTSEEING),
        ],
    )
    def test_detect_sightseeing_places(
        self, detector: KeywordCategoryDetector, name: str, expected: PlaceCategory
    ) -> None:
        assert detector.detect(name=name) == expected

    # --- NHÓM 5: LƯU TRÚ (ACCOMMODATION) ---
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("Khách sạn Rex Sài Gòn", PlaceCategory.ACCOMMODATION),
            ("InterContinental Saigon Hotel", PlaceCategory.ACCOMMODATION),
            ("Homestay Nhà Của Bu Đà Lạt", PlaceCategory.ACCOMMODATION),
            ("Vinpearl Resort & Spa Nha Trang", PlaceCategory.ACCOMMODATION),
            ("Nhà nghỉ Mai Vàng", PlaceCategory.ACCOMMODATION),
        ],
    )
    def test_detect_accommodation_places(
        self, detector: KeywordCategoryDetector, name: str, expected: PlaceCategory
    ) -> None:
        assert detector.detect(name=name) == expected

    # --- NHÓM 6: MUA SẮM (SHOPPING) ---
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("Trung tâm thương mại Takashimaya", PlaceCategory.SHOPPING),
            ("Chợ Bến Thành", PlaceCategory.SHOPPING),
            ("Siêu thị Co.opmart Cống Quỳnh", PlaceCategory.SHOPPING),
            ("Aeon Mall Tân Phú Celadon", PlaceCategory.SHOPPING),
            ("Vincom Center Đồng Khởi", PlaceCategory.SHOPPING),
            ("Nhà sách Fahasa Nguyễn Huệ", PlaceCategory.SHOPPING),
        ],
    )
    def test_detect_shopping_places(
        self, detector: KeywordCategoryDetector, name: str, expected: PlaceCategory
    ) -> None:
        assert detector.detect(name=name) == expected

    # --- ƯU TIÊN LOẠI HÌNH TRONG TRUNG TÂM THƯƠNG MẠI ---
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("Highlands Coffee - Vincom Plaza", PlaceCategory.DRINK),
            ("CGV Vincom Đồng Khởi", PlaceCategory.ENTERTAINMENT),
            ("Kichi Kichi Vincom Thủ Đức", PlaceCategory.FOOD),
            ("The Coffee House Aeon Mall", PlaceCategory.DRINK),
            ("Haidilao Landmark 81", PlaceCategory.FOOD),
        ],
    )
    def test_specific_venue_overrides_mall_container(
        self, detector: KeywordCategoryDetector, name: str, expected: PlaceCategory
    ) -> None:
        assert detector.detect(name=name) == expected

    # --- NHÓM 7: KHÔNG XÁC ĐỊNH / OTHER ---
    @pytest.mark.parametrize(
        "name",
        [
            "Bệnh viện Chợ Rẫy",
            "Trường Đại học Bách Khoa TP.HCM",
            "Văn phòng Công ty Linktink",
            "Tòa nhà Landmark 81",
            "Điểm hẹn ngẫu nhiên",
        ],
    )
    def test_detect_other_places(self, detector: KeywordCategoryDetector, name: str) -> None:
        assert detector.detect(name=name) == PlaceCategory.OTHER

    # --- CHỮ KHÔNG DẤU VÀ VIẾT HOA ---
    @pytest.mark.parametrize(
        ("name", "expected"),
        [
            ("pho bo tai nam", PlaceCategory.FOOD),
            ("ca phe sua da", PlaceCategory.DRINK),
            ("KARAOKE NICE", PlaceCategory.ENTERTAINMENT),
            ("khach san muong thanh", PlaceCategory.ACCOMMODATION),
        ],
    )
    def test_unaccented_and_uppercase_matching(
        self, detector: KeywordCategoryDetector, name: str, expected: PlaceCategory
    ) -> None:
        assert detector.detect(name=name) == expected

    # --- HỖ TRỢ QUA TAGS VÀ ĐỊA CHỈ ---
    def test_detect_via_tags_when_name_is_generic(
        self, detector: KeywordCategoryDetector
    ) -> None:
        res = detector.detect(name="Góc Nhỏ", tags=["trà sữa", "view đẹp"])
        assert res == PlaceCategory.DRINK

    def test_detect_via_address_fallback(self, detector: KeywordCategoryDetector) -> None:
        res = detector.detect(name="Điểm Hẹn", address="123 Rạp chiếu phim Quốc Thanh, Quận 1")
        assert res == PlaceCategory.ENTERTAINMENT


class TestUrlPatternCategoryDetector:
    """Kiểm thử bộ nhận diện danh mục theo đường dẫn URL (UrlPatternCategoryDetector)."""

    @pytest.fixture
    def detector(self) -> UrlPatternCategoryDetector:
        return UrlPatternCategoryDetector()

    def test_food_delivery_urls(self, detector: UrlPatternCategoryDetector) -> None:
        assert (
            detector.detect(
                name="Bún bò O Xuân",
                url="https://shopeefood.vn/ho-chi-minh/bun-bo-hue-o-xuan",
            )
            == PlaceCategory.FOOD
        )
        assert (
            detector.detect(
                name="Cơm tấm Ba Ghiền",
                url="https://foody.vn/ho-chi-minh/com-tam-ba-ghien",
            )
            == PlaceCategory.FOOD
        )
        assert (
            detector.detect(
                name="Quán Cơm Bình Dân",
                url="https://food.grab.com/vn/vi/restaurant/com-tam-cali",
            )
            == PlaceCategory.FOOD
        )

    def test_drink_places_on_food_delivery_platforms(
        self, detector: UrlPatternCategoryDetector
    ) -> None:
        # Đường dẫn ShopeeFood chứa ca-phe trong slug
        assert (
            detector.detect(
                name="3T",
                url="https://shopeefood.vn/ho-chi-minh/ca-phe-trung-3t",
            )
            == PlaceCategory.DRINK
        )
        # Tên quán có từ khóa trà sữa trên nền tảng GrabFood
        assert (
            detector.detect(
                name="Trà Sữa Gong Cha",
                url="https://food.grab.com/vn/vi/restaurant/12345",
            )
            == PlaceCategory.DRINK
        )

    def test_accommodation_urls(self, detector: UrlPatternCategoryDetector) -> None:
        assert (
            detector.detect(
                name="Khách sạn ABC",
                url="https://www.agoda.com/vi-vn/vinpearl-resort/hotel/nha-trang-vn.html",
            )
            == PlaceCategory.ACCOMMODATION
        )
        assert (
            detector.detect(
                name="Rex",
                url="https://www.booking.com/hotel/vn/rex-hotel.html",
            )
            == PlaceCategory.ACCOMMODATION
        )
        assert (
            detector.detect(
                name="Homestay Đà Lạt",
                url="https://www.airbnb.com/rooms/123456",
            )
            == PlaceCategory.ACCOMMODATION
        )

    def test_entertainment_urls(self, detector: UrlPatternCategoryDetector) -> None:
        assert (
            detector.detect(
                name="Rạp Landmark 81",
                url="https://www.cgv.vn/default/movies.html",
            )
            == PlaceCategory.ENTERTAINMENT
        )
        assert (
            detector.detect(
                name="Galaxy",
                url="https://galaxycinema.vn/phim-dang-chieu",
            )
            == PlaceCategory.ENTERTAINMENT
        )

    def test_shopping_urls(self, detector: UrlPatternCategoryDetector) -> None:
        assert (
            detector.detect(
                name="Cửa hàng ABC",
                url="https://tiki.vn/nha-sach-tiki",
            )
            == PlaceCategory.SHOPPING
        )
        assert (
            detector.detect(
                name="Shop Quần Áo",
                url="https://shopee.vn/ao-thun-nam-123",
            )
            == PlaceCategory.SHOPPING
        )

    def test_unknown_or_empty_urls(self, detector: UrlPatternCategoryDetector) -> None:
        assert detector.detect(name="Quán Ăn", url=None) == PlaceCategory.OTHER
        assert detector.detect(name="Quán Ăn", url="") == PlaceCategory.OTHER
        assert (
            detector.detect(name="Quán Ăn", url="https://google.com/search")
            == PlaceCategory.OTHER
        )


class TestCompositeCategoryDetector:
    """Kiểm thử CompositeCategoryDetector (Pipeline tổng hợp)."""

    def test_default_pipeline_url_priority(self) -> None:
        """Kiểm tra URL detector được ưu tiên trước nếu khớp miền đặc thù."""
        detector = CompositeCategoryDetector()
        # Tên trung tính, URL Booking xác định rõ là ACCOMMODATION
        res = detector.detect(
            name="Hoàng Gia",
            url="https://www.booking.com/hotel/vn/hoang-gia.html",
        )
        assert res == PlaceCategory.ACCOMMODATION

    def test_default_pipeline_keyword_fallback_when_url_is_none(self) -> None:
        """Kiểm tra fallback sang KeywordDetector khi không có URL."""
        detector = CompositeCategoryDetector()
        res = detector.detect(name="Bún Bò Huế Ba Ghiền", url=None)
        assert res == PlaceCategory.FOOD

    def test_contracts_spec_example(self) -> None:
        """Kiểm tra đúng case trong CONTRACTS.md:

        POST /api/v1/rooms/{id}/places:
        name: "Cà Phê Trứng 3T"
        url: "https://shopeefood.vn/ho-chi-minh/ca-phe-trung-3t"
        -> category: DRINK.
        """
        detector = CompositeCategoryDetector()
        res = detector.detect(
            name="Cà Phê Trứng 3T",
            url="https://shopeefood.vn/ho-chi-minh/ca-phe-trung-3t",
        )
        assert res == PlaceCategory.DRINK

    def test_fallback_to_other_when_nothing_matches(self) -> None:
        detector = CompositeCategoryDetector()
        res = detector.detect(name="Địa điểm bí mật 12345", url=None)
        assert res == PlaceCategory.OTHER

    def test_custom_fallback(self) -> None:
        detector = CompositeCategoryDetector(fallback=PlaceCategory.FOOD)
        res = detector.detect(name="Địa điểm lạ hoắc", url=None)
        assert res == PlaceCategory.FOOD

    def test_custom_detectors_order(self) -> None:
        class DummyAlwaysSightseeingDetector(IPlaceCategoryDetector):
            def detect(self, name: str, address=None, url=None, tags=None) -> PlaceCategory:
                return PlaceCategory.SIGHTSEEING

        detector = CompositeCategoryDetector(
            detectors=[DummyAlwaysSightseeingDetector(), KeywordCategoryDetector()]
        )
        # Dù tên là Bún Bò Huế nhưng dummy detector đứng trước
        res = detector.detect(name="Bún Bò Huế")
        assert res == PlaceCategory.SIGHTSEEING

    def test_implements_interface(self) -> None:
        detector = CompositeCategoryDetector()
        assert isinstance(detector, IPlaceCategoryDetector)
        assert len(detector.detectors) == 2
        assert detector.fallback == PlaceCategory.OTHER
