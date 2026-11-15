from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time_utils import now_utc


class TravelLeg(Base):
    """Bảng travel_legs: cache km/phút/hình dạng đường xe máy theo cặp toạ độ (gđ7, CR-15).

    Khoá = toạ độ làm tròn `ROUTE_COORD_DECIMALS` số dạng "lat,lng" + chế độ (`profile`), có hướng (đường một
    chiều). Không TTL. Chỉ server đọc: không API nào trả `from_key`/`to_key` (có thể là vị trí nhà thành viên).
    """

    __tablename__ = "travel_legs"
    __table_args__ = (
        CheckConstraint("distance_km >= 0", name="chk_travel_legs_distance"),
        CheckConstraint("minutes >= 0", name="chk_travel_legs_minutes"),
    )

    from_key: Mapped[str] = mapped_column(String(40), primary_key=True)
    to_key: Mapped[str] = mapped_column(String(40), primary_key=True)
    profile: Mapped[str] = mapped_column(String(32), primary_key=True)
    distance_km: Mapped[float] = mapped_column(Float, nullable=False)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    shape: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=now_utc,
    )
