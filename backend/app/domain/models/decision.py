from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.id_generator import generate_uuid
from app.core.time_utils import now_utc
from app.domain.enums import DecisionStatus

if TYPE_CHECKING:
    from app.domain.models.member import Member
    from app.domain.models.place import Place
    from app.domain.models.room import Room


class DecisionSession(Base):
    """Bảng decision_sessions: Phiên giải quyết chọn hộ theo CR-02."""

    __tablename__ = "decision_sessions"
    __table_args__ = (
        Index(
            "uq_decision_open_per_room",
            "room_id",
            unique=True,
            postgresql_where=text("status = 'OPEN'"),
            sqlite_where=text("status = 'OPEN'"),
        ),
        Index("idx_decision_sessions_room_id", "room_id"),
        Index("idx_decision_sessions_status", "status"),
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
    mode: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=DecisionStatus.OPEN.value,
        server_default=DecisionStatus.OPEN.value,
    )
    category: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    candidate_place_ids: Mapped[list[Any]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    seed: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
    )
    result_place_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("places.id", ondelete="SET NULL"),
        nullable=True,
    )
    result_payload: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
    )
    created_by_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=now_utc,
    )
    closes_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    room: Mapped["Room"] = relationship(
        "Room",
        back_populates="decision_sessions",
    )
    created_by: Mapped["Member"] = relationship("Member")
    result_place: Mapped["Place | None"] = relationship("Place")
    swipes: Mapped[list["DecisionSwipe"]] = relationship(
        "DecisionSwipe",
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class DecisionSwipe(Base):
    """Bảng decision_swipes: Lá phiếu quẹt (like/dislike) của thành viên trong phiên SWIPE."""

    __tablename__ = "decision_swipes"

    session_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("decision_sessions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    member_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="CASCADE"),
        primary_key=True,
    )
    place_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("places.id", ondelete="CASCADE"),
        primary_key=True,
    )
    liked: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
    )

    # Relationships
    session: Mapped["DecisionSession"] = relationship(
        "DecisionSession",
        back_populates="swipes",
    )
    member: Mapped["Member"] = relationship("Member")
    place: Mapped["Place"] = relationship("Place")
