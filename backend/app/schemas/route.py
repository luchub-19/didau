"""Schema đường đi (gđ7, CR-15 phần B, ALGORITHMS §7). Riêng tư CR-11: chỉ đường của CHÍNH người gọi hoặc giữa
các quán; không trường toạ độ nào, không khoá cache (`from_key`/`to_key`)."""

from uuid import UUID

from pydantic import BaseModel, Field


class RouteLegOut(BaseModel):
    km: float = Field(description="Quãng đường một chiều (km, làm tròn 3 số)")
    minutes: int = Field(description="ceil(km ÷ MOTORBIKE_KMH × 60); Google giữ phút có kẹt xe")
    shape: str | None = Field(
        default=None,
        description="Polyline mã hoá, độ chính xác 6 (Valhalla). null = chưa có đường thật (ước lượng)",
    )
    source: str = Field(description="ESTIMATE | VALHALLA | GOOGLE")


class MyRoutesResponse(BaseModel):
    """`GET /rooms/{id}/routes/me?place_id=` — nhà người gọi → quán và quán → nhà người gọi."""

    place_id: UUID
    to_place: RouteLegOut
    to_home: RouteLegOut


class ScheduleRouteLeg(RouteLegOut):
    from_item_id: UUID
    to_item_id: UUID


class ScheduleRoutesResponse(BaseModel):
    """`GET /rooms/{id}/schedule/routes` — đường giữa các mục liên tiếp trên lịch ngày đầu (như ALGO-03)."""

    legs: list[ScheduleRouteLeg] = Field(default_factory=list)
    unknown_leg_count: int = Field(default=0, description="Cặp liên tiếp có quán thiếu toạ độ (không vẽ được)")
