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
