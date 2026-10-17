from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import BigInteger, Date, DateTime, Index, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.id_generator import generate_room_code, generate_uuid
from app.core.time_utils import now_utc
from app.domain.enums import RoomStatus, TieBreakStrategyName

if TYPE_CHECKING:
    from app.domain.models.conflict import Conflict
    from app.domain.models.member import Member
    from app.domain.models.place import Place
    from app.domain.models.schedule import ScheduleItem


class Room(Base):
    """Bảng rooms: Phòng lập kế hoạch đi chơi theo CONTRACTS.md."""

    __tablename__ = "rooms"
    __table_args__ = (
        Index("idx_rooms_code", "code"),
        Index("idx_rooms_status", "status"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=generate_uuid,
    )
    code: Mapped[str] = mapped_column(
        String(10),
        unique=True,
        nullable=False,
        default=generate_room_code,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    event_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=RoomStatus.PLANNING.value,
        server_default=RoomStatus.PLANNING.value,
    )
    tie_break_strategy: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=TieBreakStrategyName.EARLIEST_SUBMISSION.value,
        server_default=TieBreakStrategyName.EARLIEST_SUBMISSION.value,
    )
    budget_limit: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=now_utc,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        default=now_utc,
    )

    # Relationships
    members: Mapped[list["Member"]] = relationship(
        "Member",
        back_populates="room",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    places: Mapped[list["Place"]] = relationship(
        "Place",
        back_populates="room",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    schedule_items: Mapped[list["ScheduleItem"]] = relationship(
        "ScheduleItem",
        back_populates="room",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    conflicts: Mapped[list["Conflict"]] = relationship(
        "Conflict",
        back_populates="room",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
