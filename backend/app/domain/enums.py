from enum import Enum, IntEnum


class PlaceStatus(str, Enum):
    """Trạng thái của một địa điểm trong vòng đời lên kế hoạch."""

    PROPOSED = "PROPOSED"
    VOTING = "VOTING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    VISITED = "VISITED"


class PlaceCategory(str, Enum):
    """Danh mục loại hình địa điểm."""

    FOOD = "FOOD"
    DRINK = "DRINK"
    ENTERTAINMENT = "ENTERTAINMENT"
    SIGHTSEEING = "SIGHTSEEING"
    ACCOMMODATION = "ACCOMMODATION"
    SHOPPING = "SHOPPING"
    OTHER = "OTHER"


class VoteValue(IntEnum):
    """Giá trị lá phiếu bình chọn."""

    UPVOTE = 1
    DOWNVOTE = -1
    NEUTRAL = 0


class ConflictLevel(str, Enum):
    """Mức độ nghiêm trọng của xung đột lịch trình/quy tắc."""

    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


class MemberRole(str, Enum):
    """Vai trò thành viên trong phòng."""

    HOST = "HOST"
    MEMBER = "MEMBER"


class RoomStatus(str, Enum):
    """Trạng thái hoạt động của phòng."""

    PLANNING = "PLANNING"
    VOTING = "VOTING"
    FINALIZED = "FINALIZED"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


class TieBreakStrategyName(str, Enum):
    """Tên chiến lược phân định hòa phiếu."""

    EARLIEST_SUBMISSION = "EARLIEST_SUBMISSION"
    MOST_UPVOTES = "MOST_UPVOTES"
    CREATOR_PRIORITY = "CREATOR_PRIORITY"
    RANDOM = "RANDOM"
    CATEGORY_DIVERSITY = "CATEGORY_DIVERSITY"
    GROUP_DECISION = "GROUP_DECISION"


class PlaceSource(str, Enum):
    """Nguồn gốc dữ liệu của địa điểm theo CR-02."""

    MANUAL = "MANUAL"
    OSM = "OSM"
    GOOGLE = "GOOGLE"


class CityCode(str, Enum):
    """Mã thành phố hỗ trợ cho phòng."""

    HCM = "HCM"
    HN = "HN"


class DecisionMode(str, Enum):
    """Chế độ quyết định chọn hộ."""

    SMART = "SMART"
    WHEEL = "WHEEL"
    SWIPE = "SWIPE"
    LADDER = "LADDER"


class DecisionStatus(str, Enum):
    """Trạng thái phiên quyết định chọn hộ."""

    OPEN = "OPEN"
    RESOLVED = "RESOLVED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class TriggerHint(str, Enum):
    """Gợi ý kích hoạt tính năng Chọn hộ."""

    TIE_AT_TOP = "TIE_AT_TOP"
    NEAR_TIE = "NEAR_TIE"
    TOO_MANY = "TOO_MANY"
    STALLED = "STALLED"
    EMPTY = "EMPTY"
