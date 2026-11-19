"""Schema Algorithm Engine (CR-12, CR-15, CR-11): tâm nhóm + gợi ý hoà phiếu OMP + khả thi lịch.

Không schema nào ở đây có toạ độ của thành viên (CR-11): `center` là tâm đã làm tròn 3 chữ số.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.poi import PoiResponse


class LatLng(BaseModel):
    lat: float
    lng: float


class GroupCenterResponse(BaseModel):
    """`GET /rooms/{id}/group-center` (ALGORITHMS §3). `available:false` khi <2 người chia sẻ vị trí."""

    available: bool
    center: LatLng | None = None
    area_label: str | None = Field(default=None, description='Vd. "Q3" hoặc "Q3 – Phú Nhuận"')
    member_count: int = Field(description="Số thành viên đã chia sẻ vị trí (không gồm điểm hẹn)")
    nearby_pois: list[PoiResponse] = Field(default_factory=list)


class TieCandidate(BaseModel):
    place_id: UUID
    name: str
    upvotes: int
    downvotes: int = 0
    score: int = Field(description="upvotes − downvotes (hoà theo điểm, CR-15)")


class TieRanking(BaseModel):
    """Một dòng xếp hạng OMP. Km là KHỨ HỒI (`Nhà → quán → Nhà`); `max_min` = phút khứ hồi của người đi lâu nhất."""

    place_id: UUID
    rank: int
    psi: float = Field(description="Ψ = Σ w_r · c₍r₎ (nhỏ hơn = tốt hơn), làm tròn 3 số")
    max_km: float
    total_km: float
    max_min: int
    farthest_member_id: UUID = Field(
        description="Người có km khứ hồi lớn nhất ở quán này (CR-19); chỉ id, nickname lấy từ danh sách thành viên phòng"
    )


class TieMemberCost(BaseModel):
    """Một thành viên ở quán đề xuất. KHÔNG có toạ độ (CR-11); km/phút là khứ hồi của chính người đó."""

    member_id: UUID
    nickname: str
    km: float
    minutes: int
    rank: int = Field(description="Hạng theo chi phí tăng dần (1 = đi gần nhất)")
    weight: float = Field(description="Trọng số w_r của hạng đó")


class OmpParams(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    lambda_: float = Field(alias="lambda", description="λ — hệ số công bằng")
    k: float = Field(description="k — luỹ thừa phạt cá nhân")


class CategoryTieSuggestion(BaseModel):
    """Một loại quán đang hoà (bài K = 1). `ranking` chỉ gồm quán so được; quán thiếu toạ độ không có dòng."""

    category: str
    candidates: list[TieCandidate]
    recommended_place_id: UUID | None = None
    ranking: list[TieRanking] = Field(default_factory=list)
    members: list[TieMemberCost] = Field(default_factory=list)
    runner_up_psi: float | None = None
    excluded_member_count: int = 0
    estimated: bool = True
    source: str = Field(default="ESTIMATE", description="ESTIMATE | GOOGLE | VALHALLA | MIXED")
    params: OmpParams


class TieSuggestion(BaseModel):
    """`GET /rooms/{id}/tie-break/suggestion` (docs/phase7/ALGORITHMS.md §6, CR-15): mỗi loại hoà một mục."""

    available: bool
    reason: str | None = Field(default=None, description="NO_TIE | NO_ORIGINS | NO_PLACE_COORDS")
    suggestions: list[CategoryTieSuggestion] = Field(default_factory=list)


# ── CR-12 phần 2 (T-87) ──────────────────────────────────────────────────────────────────────────
class FeasibilityLeg(BaseModel):
    """Một cặp mục liên tiếp trên lịch (ALGO-03 §5). `slack_min < 0` = thiếu giờ."""

    from_item_id: UUID
    to_item_id: UUID
    eta_min: int
    margin_min: int
    buffer_min: int
    gap_min: int
    slack_min: int
    distance_km: float
    risk: str = Field(description="SAFE | SOFT_CONFLICT | HIGH_RISK")
    peak: bool
    source: str = Field(description="ESTIMATE | GOOGLE")


class ScheduleFeasibility(BaseModel):
    """`GET /rooms/{id}/schedule/feasibility` — tổng kế hoạch ngày của phòng (`day_offset = 0`)."""

    window_min: int
    required_total_min: int
    buffer_total_min: int
    is_feasible: bool
    legs: list[FeasibilityLeg] = Field(default_factory=list)
    estimated: bool = Field(description="Có chặng nào là ước lượng (không phải Google)")
    item_count: int = Field(description="Số mục lịch đã tính (chỉ ngày của phòng)")
    unknown_leg_count: int = Field(description="Số cặp liên tiếp không tính được vì quán thiếu toạ độ")
