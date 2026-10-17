from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.id_generator import generate_uuid
from app.core.time_utils import now_utc


class PlaceReview(Base):
    """Bảng place_reviews: Đánh giá nội bộ của các thành viên trong nhóm theo CR-02."""

    __tablename__ = "place_reviews"
    __table_args__ = (
        UniqueConstraint("member_id", "external_key", name="uq_place_reviews_member_external_key"),
        Index("idx_reviews_external_key", "external_key"),
        CheckConstraint("rating >= 1 AND rating <= 5", name="chk_place_reviews_rating"),
    )

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=generate_uuid,
    )
    external_key: Mapped[str] = mapped_column(
        String(320),
        nullable=False,
    )
    room_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("rooms.id", ondelete="SET NULL"),
        nullable=True,
    )
    member_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("members.id", ondelete="SET NULL"),
        nullable=True,
    )
    nickname: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    rating: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
    )
    comment: Mapped[str | None] = mapped_column(
        String(280),
        nullable=True,
    )
    tags: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
        server_default="[]",
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
