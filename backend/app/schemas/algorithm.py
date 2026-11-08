"""Schema Algorithm Engine (CR-12 phần 1, CR-11): tâm nhóm + gợi ý hoà phiếu.

Không schema nào ở đây có toạ độ của thành viên (CR-11): `center` là tâm đã làm tròn 3 chữ số.
"""

from uuid import UUID

from pydantic import BaseModel, Field

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


class TieMemberInfo(BaseModel):
    """Thành viên trong ma trận. Chỉ có nguồn xuất phát, KHÔNG có toạ độ."""

    member_id: UUID
    nickname: str
    origin_source: str = Field(description="MEMBER | MEETING_POINT")


class TieLeg(BaseModel):
    minutes: int
    distance_km: float
    source: str = Field(description="ESTIMATE | GOOGLE")


class TieRanking(BaseModel):
    """Một dòng xếp hạng. `total_min`=S, `max_min`=M (người đi xa nhất), `total_km`=D."""

    place_id: UUID
    rank: int
    total_min: int
    max_min: int
    total_km: float


class TieSuggestion(BaseModel):
    """`GET /rooms/{id}/tie-break/suggestion` (ALGORITHMS §4).

    `matrix[i][j]` = `members[i]` → `candidates[j]` (null ở quán thiếu toạ độ). `ranking` chỉ gồm quán so được;
    quán thiếu toạ độ nằm trong `unranked_place_ids`. `margin_vs_second_min` = S(hạng 2) − S(hạng 1) và có
    thể ≤ 0 khi hạng 1 thắng nhờ người đi xa nhất đỡ vất vả hơn (luật ngưỡng 2').
    """

    available: bool
    reason: str | None = Field(default=None, description="NO_TIE | NO_ORIGINS | NO_PLACE_COORDS")
    candidates: list[TieCandidate] = Field(default_factory=list)
    members: list[TieMemberInfo] = Field(default_factory=list)
    matrix: list[list[TieLeg | None]] = Field(default_factory=list)
    ranking: list[TieRanking] = Field(default_factory=list)
    unranked_place_ids: list[UUID] = Field(default_factory=list)
    recommended_place_id: UUID | None = None
    margin_vs_second_min: int | None = None
    threshold_min: int
    travel_mode: str
    excluded_member_count: int = 0
    estimated: bool = True
