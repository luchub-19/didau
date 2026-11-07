from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.id_generator import generate_member_token, generate_uuid
from app.core.time_utils import now_utc
from app.domain.enums import MemberRole

if TYPE_CHECKING:
    from app.domain.models.place import Place
    from app.domain.models.room import Room
    from app.domain.models.vote import Vote


class Member(Base):
    """Bảng members: Thành viên trong phòng theo CONTRACTS.md."""

    __tablename__ = "members"
    __table_args__ = (
        UniqueConstraint("room_id", "nickname", name="uq_room_nickname"),
        CheckConstraint(
            "(origin_lat IS NULL OR (origin_lat >= -90 AND origin_lat <= 90)) AND "
            "(origin_lng IS NULL OR (origin_lng >= -180 AND origin_lng <= 180))",
            name="chk_members_origin_range",
        ),
        CheckConstraint(
            "(origin_lat IS NULL) = (origin_lng IS NULL)",
            name="chk_members_origin_pair",
        ),
        Index("idx_members_room_id", "room_id"),
        Index("idx_members_token", "token"),
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
    nickname: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )
    avatar_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MemberRole.MEMBER.value,
        server_default=MemberRole.MEMBER.value,
    )
    token: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        nullable=False,
        default=generate_member_token,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    origin_lat: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    origin_lng: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=now_utc,
    )
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        default=now_utc,
    )

    @property
    def has_origin(self) -> bool:
        """Đã đặt vị trí xuất phát riêng chưa (CR-11); schema công khai chỉ lộ cờ này."""
        return self.origin_lat is not None and self.origin_lng is not None

    # Relationships
    room: Mapped["Room"] = relationship(
        "Room",
        back_populates="members",
    )
    submitted_places: Mapped[list["Place"]] = relationship(
        "Place",
        back_populates="submitted_by",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    votes: Mapped[list["Vote"]] = relationship(
        "Vote",
        back_populates="member",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
