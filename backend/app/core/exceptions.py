from typing import Any


class AppException(Exception):
    """Exception cơ sở cho mọi lỗi nghiệp vụ trong hệ thống Đi Đâu."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        """Chuyển đổi exception thành cấu trúc Error Envelope chuẩn theo ARCHITECTURE.md."""
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


class UnauthorizedError(AppException):
    """Lỗi khi thiếu hoặc sai X-Member-Token."""

    def __init__(
        self,
        message: str = "Yêu cầu xác thực token không hợp lệ hoặc đã hết hạn.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(code="UNAUTHORIZED", message=message, status_code=401, details=details)


class ForbiddenHostOnlyError(AppException):
    """Lỗi khi thành viên không phải HOST thực hiện thao tác dành riêng cho HOST."""

    def __init__(
        self,
        message: str = "Thao tác này chỉ dành riêng cho Chủ phòng (HOST).",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            code="FORBIDDEN_HOST_ONLY", message=message, status_code=403, details=details
        )


class RoomNotFoundError(AppException):
    """Lỗi khi không tìm thấy phòng."""

    def __init__(
        self,
        message: str = "Không tìm thấy phòng với thông tin yêu cầu.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(code="ROOM_NOT_FOUND", message=message, status_code=404, details=details)


class RoomStatusInvalidError(AppException):
    """Lỗi khi trạng thái phòng không cho phép thực hiện thao tác."""

    def __init__(
        self,
        message: str = "Trạng thái hiện tại của phòng không cho phép thực hiện thao tác này.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            code="ROOM_STATUS_INVALID", message=message, status_code=400, details=details
        )


class PlaceNotFoundError(AppException):
    """Lỗi khi không tìm thấy địa điểm."""

    def __init__(
        self,
        message: str = "Không tìm thấy địa điểm được yêu cầu.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(code="PLACE_NOT_FOUND", message=message, status_code=404, details=details)


class MemberNotFoundError(AppException):
    """Lỗi khi không tìm thấy thành viên trong phòng."""

    def __init__(
        self,
        message: str = "Không tìm thấy thành viên trong phòng.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            code="MEMBER_NOT_FOUND", message=message, status_code=404, details=details
        )


class NicknameTakenError(AppException):
    """Lỗi khi nickname đã tồn tại trong phòng."""

    def __init__(
        self,
        message: str = "Biệt danh này đã được sử dụng bởi một thành viên khác trong phòng.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(code="NICKNAME_TAKEN", message=message, status_code=409, details=details)


class PlaceAlreadyAddedError(AppException):
    """Lỗi khi địa điểm (cùng external_id) đã có trong phòng (CR-03)."""

    def __init__(
        self,
        message: str = "Địa điểm này đã có trong danh sách lựa chọn của phòng.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            code="PLACE_ALREADY_ADDED", message=message, status_code=409, details=details
        )


class ConflictCriticalError(AppException):
    """Lỗi khi xảy ra xung đột nghiêm trọng không thể tiếp tục."""

    def __init__(
        self,
        message: str = "Phát hiện xung đột nghiêm trọng trong lịch trình.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            code="CONFLICT_CRITICAL", message=message, status_code=409, details=details
        )


class InvalidStrategyError(AppException):
    """Lỗi khi chiến lược phân định hòa phiếu không hợp lệ."""

    def __init__(
        self,
        message: str = "Chiến lược phân định hòa phiếu không hợp lệ.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            code="INVALID_STRATEGY", message=message, status_code=400, details=details
        )


class ValidationError(AppException):
    """Lỗi xác thực dữ liệu đầu vào."""

    def __init__(
        self,
        message: str = "Dữ liệu đầu vào không hợp lệ.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            code="VALIDATION_ERROR", message=message, status_code=422, details=details
        )


class RateLimitExceededError(AppException):
    """Lỗi khi vượt quá giới hạn tần suất yêu cầu (HTTP 429)."""

    def __init__(
        self,
        message: str = "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            code="RATE_LIMIT_EXCEEDED", message=message, status_code=429, details=details
        )
