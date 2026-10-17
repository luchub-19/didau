import re

_DAY_INDEX = {"mo": 0, "tu": 1, "we": 2, "th": 3, "fr": 4, "sa": 5, "su": 6}
_DAY_END = 1439  # end_minute trong hợp đồng nằm trong 0..1439

_RULE_RE = re.compile(
    r"^(?P<days>[A-Za-z][A-Za-z ,\-]*?)?\s*"
    r"(?P<body>(?:\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(?:\s*,\s*)?)+|off|closed)$",
    re.IGNORECASE,
)
_SPAN_RE = re.compile(r"(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})")

Interval = tuple[int, int]


def _to_minute(hour: int, minute: int) -> int | None:
    if minute > 59 or hour > 24 or (hour == 24 and minute != 0):
        return None
    return hour * 60 + minute


def _parse_days(text: str | None) -> set[int] | None:
    """Trả về tập thứ (0=Mo..6=Su); None nếu mẫu lạ; tập rỗng nếu là PH/SH (bỏ qua)."""
    if text is None or not text.strip():
        return set(range(7))
    days: set[int] = set()
    for part in text.split(","):
        part = part.strip().lower()
        if part in ("ph", "sh"):
            continue
        if "-" in part:
            first, _, last = part.partition("-")
            if first.strip() not in _DAY_INDEX or last.strip() not in _DAY_INDEX:
                return None
            i, j = _DAY_INDEX[first.strip()], _DAY_INDEX[last.strip()]
            while True:
                days.add(i)
                if i == j:
                    break
                i = (i + 1) % 7
        elif part in _DAY_INDEX:
            days.add(_DAY_INDEX[part])
        else:
            return None
    return days


def _parse_body(body: str) -> list[Interval] | None:
    if body.lower() in ("off", "closed"):
        return []
    intervals: list[Interval] = []
    for m in _SPAN_RE.finditer(body):
        start = _to_minute(int(m.group(1)), int(m.group(2)))
        end = _to_minute(int(m.group(3)), int(m.group(4)))
        if start is None or end is None:
            return None
        if end <= start:
            end = _DAY_END  # qua đêm hoặc 24h: cắt ở cuối ngày
        intervals.append((start, min(end, _DAY_END)))
    return sorted(intervals)


def parse_opening_hours(raw: str | None, weekday: int) -> list[Interval] | None:
    """Parse chuỗi `opening_hours` kiểu OSM cho một thứ trong tuần.

    Args:
        raw: Chuỗi gốc, ví dụ `Mo-Fr 08:00-17:00; Sa,Su 09:00-12:00`.
        weekday: 0=Thứ Hai … 6=Chủ Nhật (giống `date.weekday()`).

    Returns:
        Danh sách khoảng mở cửa (start, end) tính bằng phút, rỗng nếu đóng cửa hôm đó,
        hoặc None nếu mẫu lạ/không rõ.
    """
    if raw is None or not raw.strip():
        return None
    text = raw.strip()
    if text.lower() == "24/7":
        return [(0, _DAY_END)]

    by_day: dict[int, list[Interval]] = {}
    parsed_any = False
    for rule in text.split(";"):
        rule = rule.strip()
        if not rule:
            continue
        if rule.lower() == "24/7":
            for d in range(7):
                by_day[d] = [(0, _DAY_END)]
            parsed_any = True
            continue
        m = _RULE_RE.match(rule)
        if not m:
            return None
        days = _parse_days(m.group("days"))
        intervals = _parse_body(m.group("body").strip())
        if days is None or intervals is None:
            return None
        if not days:  # chỉ áp cho ngày lễ (PH/SH): bỏ qua
            continue
        parsed_any = True
        for d in days:
            by_day[d] = intervals  # quy tắc sau ghi đè quy tắc trước (chuẩn OSM)

    if not parsed_any:
        return None
    return by_day.get(weekday, [])
