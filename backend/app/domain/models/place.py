from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.id_generator import generate_uuid
from app.core.time_utils import now_utc
from app.domain.enums import PlaceCategory, PlaceStatus

if TYPE_CHECKING:
    from app.domain.models.member import Member
    from app.domain.models.room import Room
    from app.domain.models.schedule import ScheduleItem
    from app.domain.models.vote import Vote


class Place(Base):
    """Bảng places: Địa điểm đề xuất trong phòng theo CONTRACTS.md."""

    __tablename__ = "places"
    __table_args__ = (
        CheckConstraint(
            "open_minute IS NULL OR (open_minute >= 0 AND open_minute <= 1439)",
            name="chk_places_open_minute",
        ),
        CheckConstraint(
            "close_minute IS NULL OR (close_minute >= 0 AND close_minute <= 1439)",
            name="chk_places_close_minute",
        ),
        Index("idx_places_room_id", "room_id"),
        Index("idx_places_status", "status"),
        Index("idx_places_category", "category"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=generate_uuid,
    )
    room_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rooms.id", ondelete="CASCADE"),
        nullable=False,
    )
    submitted_by_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )
    address: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )
    latitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    category: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=PlaceCategory.OTHER.value,
        server_default=PlaceCategory.OTHER.value,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default=PlaceStatus.PROPOSED.value,
        server_default=PlaceStatus.PROPOSED.value,
    )
    url: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )
    estimated_cost: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        default=0,
        server_default="0",
    )
    open_minute: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
    close_minute: Mapped[int | None] = mapped_column(
        Integer,
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
    room: Mapped["Room"] = relationship(
        "Room",
        back_populates="places",
    )
    submitted_by: Mapped["Member"] = relationship(
        "Member",
        back_populates="submitted_places",
    )
    votes: Mapped[list["Vote"]] = relationship(
        "Vote",
        back_populates="place",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    schedule_items: Mapped[list["ScheduleItem"]] = relationship(
        "ScheduleItem",
        back_populates="place",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
