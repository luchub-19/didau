from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.core.time_utils import now_utc


class ExternalPlaceLink(Base):
    """Bảng external_place_links: Bộ đệm liên kết địa điểm OSM và Google Place ID."""

    __tablename__ = "external_place_links"

    osm_external_id: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
    )
    google_place_id: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )
    matched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        default=now_utc,
    )
    rejected_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )
