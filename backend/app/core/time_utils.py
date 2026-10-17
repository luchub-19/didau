import re
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

VIETNAM_TIMEZONE_STR = "Asia/Ho_Chi_Minh"
VIETNAM_TZ = ZoneInfo(VIETNAM_TIMEZONE_STR)

TIME_REGEX = re.compile(r"^([0-1]\d|2[0-3]):([0-5]\d)$")


def time_to_minutes(time_str: str) -> int:
    """Chuyển đổi chuỗi giờ 'HH:MM' thành số phút tính từ 00:00 (0..1439).

    Ví dụ:
        '00:00' -> 0
        '09:30' -> 570
        '23:59' -> 1439
    """
    if not isinstance(time_str, str):
        raise TypeError(f"Định dạng thời gian phải là chuỗi 'HH:MM', nhận: {type(time_str)}")

    match = TIME_REGEX.match(time_str.strip())
    if not match:
        raise ValueError(
            f"Thời gian '{time_str}' không hợp lệ. Định dạng yêu cầu là 'HH:MM' (00:00 đến 23:59)."
        )

    hours = int(match.group(1))
    minutes = int(match.group(2))
    return hours * 60 + minutes


def minutes_to_time(minutes: int) -> str:
    """Chuyển đổi số phút từ 00:00 (0..1439) thành chuỗi 'HH:MM'.

    Ví dụ:
        0 -> '00:00'
        570 -> '09:30'
        1439 -> '23:59'
    """
    if not isinstance(minutes, int) or isinstance(minutes, bool):
        raise TypeError(f"Số phút phải là số nguyên (int), nhận: {type(minutes)}")

    if minutes < 0 or minutes > 1439:
        raise ValueError(f"Số phút phải nằm trong khoảng [0, 1439], nhận: {minutes}")

    hours = minutes // 60
    mins = minutes % 60
    return f"{hours:02d}:{mins:02d}"


def now_utc() -> datetime:
    """Trả về thời gian hiện tại chuẩn UTC có thông tin timezone."""
    return datetime.now(UTC)


def now_vietnam() -> datetime:
    """Trả về thời gian hiện tại theo múi giờ Việt Nam (Asia/Ho_Chi_Minh)."""
    return datetime.now(VIETNAM_TZ)


def utc_to_vietnam(dt: datetime) -> datetime:
    """Chuyển đổi datetime sang múi giờ Việt Nam.

    Nếu datetime là naive (không có tzinfo), coi như là UTC trước khi chuyển.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(VIETNAM_TZ)


def vietnam_to_utc(dt: datetime) -> datetime:
    """Chuyển đổi datetime sang múi giờ UTC.

    Nếu datetime là naive (không có tzinfo), coi như là giờ Việt Nam trước khi chuyển.
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=VIETNAM_TZ)
    return dt.astimezone(UTC)


def datetime_to_iso_utc(dt: datetime) -> str:
    """Định dạng datetime thành chuỗi ISO-8601 chuẩn UTC dạng YYYY-MM-DDTHH:mm:ssZ."""
    dt_utc = vietnam_to_utc(dt) if dt.tzinfo != UTC else dt
    return dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso_datetime(iso_str: str) -> datetime:
    """Chuyển đổi chuỗi ISO-8601 thành datetime UTC có thông tin timezone."""
    # Thay thế 'Z' thành '+00:00' để fromisoformat xử lý đúng
    clean_str = iso_str.strip()
    if clean_str.endswith("Z"):
        clean_str = clean_str[:-1] + "+00:00"
    dt = datetime.fromisoformat(clean_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)
