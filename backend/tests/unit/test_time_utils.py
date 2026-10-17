from datetime import UTC, datetime

import pytest

from app.core.time_utils import (
    VIETNAM_TZ,
    datetime_to_iso_utc,
    minutes_to_time,
    now_utc,
    now_vietnam,
    parse_iso_datetime,
    time_to_minutes,
    utc_to_vietnam,
    vietnam_to_utc,
)


class TestTimeConversion:
    """Kiểm tra các hàm chuyển đổi giờ phút theo yêu cầu của T-02."""

    def test_time_to_minutes_exact_contract_cases(self) -> None:
        """Kiểm tra các mốc bắt buộc trong đặc tả: 00:00 -> 0, 09:30 -> 570, 23:59 -> 1439."""
        assert time_to_minutes("00:00") == 0
        assert time_to_minutes("09:30") == 570
        assert time_to_minutes("23:59") == 1439

    def test_time_to_minutes_additional_cases(self) -> None:
        """Kiểm tra thêm các mốc thông dụng khác."""
        assert time_to_minutes("14:15") == 855
        assert time_to_minutes("12:00") == 720
        assert time_to_minutes("01:05") == 65
        assert time_to_minutes("00:01") == 1

    def test_minutes_to_time_exact_contract_cases(self) -> None:
        """Kiểm tra các mốc bắt buộc trong đặc tả: 0 -> 00:00, 570 -> 09:30, 1439 -> 23:59."""
        assert minutes_to_time(0) == "00:00"
        assert minutes_to_time(570) == "09:30"
        assert minutes_to_time(1439) == "23:59"

    def test_minutes_to_time_additional_cases(self) -> None:
        """Kiểm tra thêm các mốc khác."""
        assert minutes_to_time(855) == "14:15"
        assert minutes_to_time(720) == "12:00"
        assert minutes_to_time(65) == "01:05"
        assert minutes_to_time(1) == "00:01"

    def test_round_trip_all_minutes(self) -> None:
        """Kiểm tra tính đối xứng 2 chiều cho toàn bộ 1440 phút trong ngày."""
        for m in range(1440):
            time_str = minutes_to_time(m)
            assert time_to_minutes(time_str) == m

    @pytest.mark.parametrize(
        "invalid_str",
        [
            "24:00",
            "25:00",
            "12:60",
            "12:99",
            "9:30",
            "09:3",
            "abc",
            "",
            "   ",
            "-01:00",
            "00:-10",
            "12:00:00",
        ],
    )
    def test_time_to_minutes_invalid_strings(self, invalid_str: str) -> None:
        """Kiểm tra các chuỗi không hợp lệ phải ném ra ValueError."""
        with pytest.raises(ValueError):
            time_to_minutes(invalid_str)

    def test_time_to_minutes_non_string(self) -> None:
        """Kiểm tra truyền kiểu dữ liệu không phải chuỗi."""
        with pytest.raises((ValueError, TypeError)):
            time_to_minutes(123)  # type: ignore

    @pytest.mark.parametrize(
        "invalid_minutes",
        [
            -1,
            -100,
            1440,
            1441,
            2000,
            10000,
        ],
    )
    def test_minutes_to_time_out_of_bounds(self, invalid_minutes: int) -> None:
        """Kiểm tra số phút ngoài dải [0, 1439] phải ném ra ValueError."""
        with pytest.raises(ValueError):
            minutes_to_time(invalid_minutes)

    def test_minutes_to_time_invalid_types(self) -> None:
        """Kiểm tra kiểu dữ liệu không hợp lệ cho minutes_to_time."""
        with pytest.raises((ValueError, TypeError)):
            minutes_to_time("570")  # type: ignore
        with pytest.raises((ValueError, TypeError)):
            minutes_to_time(True)  # type: ignore
        with pytest.raises((ValueError, TypeError)):
            minutes_to_time(570.5)  # type: ignore


class TestTimezoneUtils:
    """Kiểm tra các hàm hỗ trợ múi giờ Việt Nam và UTC."""

    def test_now_vietnam(self) -> None:
        """Đảm bảo now_vietnam trả về timezone Asia/Ho_Chi_Minh."""
        vn_time = now_vietnam()
        assert vn_time.tzinfo == VIETNAM_TZ

    def test_now_utc(self) -> None:
        """Đảm bảo now_utc trả về timezone UTC."""
        utc_time = now_utc()
        assert utc_time.tzinfo == UTC

    def test_utc_to_vietnam_conversion(self) -> None:
        """UTC 00:00 tương ứng 07:00 giờ Việt Nam (UTC+7)."""
        dt_utc = datetime(2026, 10, 17, 0, 0, 0, tzinfo=UTC)
        dt_vn = utc_to_vietnam(dt_utc)
        assert dt_vn.hour == 7
        assert dt_vn.day == 17

    def test_vietnam_to_utc_conversion(self) -> None:
        """Giờ Việt Nam 07:00 tương ứng 00:00 UTC."""
        dt_vn = datetime(2026, 10, 17, 7, 0, 0, tzinfo=VIETNAM_TZ)
        dt_utc = vietnam_to_utc(dt_vn)
        assert dt_utc.hour == 0
        assert dt_utc.day == 17

    def test_iso_formatting_and_parsing(self) -> None:
        """Kiểm tra format và parse ISO string UTC."""
        dt = datetime(2026, 10, 17, 7, 30, 0, tzinfo=UTC)
        iso_str = datetime_to_iso_utc(dt)
        assert iso_str == "2026-10-17T07:30:00Z"

        parsed = parse_iso_datetime(iso_str)
        assert parsed == dt
        assert parsed.tzinfo == UTC
