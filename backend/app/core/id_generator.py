import secrets
import string
from uuid import UUID, uuid4

# Bảng ký tự cho room_code: 6 ký tự viết hoa gồm chữ và số, loại trừ 0, O, 1, I để tránh nhầm lẫn
ROOM_CODE_ALPHABET = "".join(
    c for c in (string.ascii_uppercase + string.digits) if c not in ("0", "O", "1", "I")
)


def generate_uuid() -> UUID:
    """Sinh UUIDv4 chuẩn làm khóa chính cho các entity."""
    return uuid4()


def generate_uuid_str() -> str:
    """Sinh chuỗi UUIDv4 chuẩn 36 ký tự có dấu gạch ngang."""
    return str(uuid4())


def generate_room_code(length: int = 6) -> str:
    """Sinh mã chia sẻ phòng gồm `length` ký tự viết hoa không gây nhầm lẫn (mặc định 6 ký tự)."""
    return "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(length))


def generate_member_token() -> str:
    """Sinh token ngẫu nhiên bảo mật cho thành viên (UUIDv4 dạng chuỗi)."""
    return str(uuid4())
