from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.core.id_generator import generate_uuid
from app.core.time_utils import now_utc

if TYPE_CHECKING:
    from app.domain.models.member import Member
    from app.domain.models.place import Place


class Vote(Base):
    """Bảng votes: Bình chọn địa điểm theo CONTRACTS.md."""

    __tablename__ = "votes"
    __table_args__ = (
        UniqueConstraint("place_id", "member_id", name="uq_place_member_vote"),
        CheckConstraint("vote_value IN (-1, 0, 1)", name="chk_votes_vote_value"),
        Index("idx_votes_place_id", "place_id"),
        Index("idx_votes_member_id", "member_id"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=generate_uuid,
    )
    place_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("places.id", ondelete="CASCADE"),
        nullable=False,
    )
    member_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="CASCADE"),
        nullable=False,
    )
    vote_value: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
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
    place: Mapped["Place"] = relationship(
        "Place",
        back_populates="votes",
    )
    member: Mapped["Member"] = relationship(
        "Member",
        back_populates="votes",
    )
