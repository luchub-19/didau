from typing import Any
from uuid import UUID, uuid4

from app.domain.patterns.itinerary.planner import DroppedPlace, PlanConstraints, PlannedSlot
from app.domain.patterns.tie_break.strategy import PlaceVoteSummary
from app.domain.phase2_interfaces import (
    IExpenseSplittingService,
    IExternalPlacesProvider,
    IRouteOptimizationService,
)


class StubRouteOptimizationService(IRouteOptimizationService):
    """Hiện thực stub/mock cho IRouteOptimizationService phục vụ kiểm thử Phase 2."""

    def __init__(self, reversed_order: bool = True) -> None:
        self.reversed_order = reversed_order
        self.invocations: list[list[UUID]] = []

    async def optimize_route(self, place_ids: list[UUID]) -> list[UUID]:
        """Sắp xếp lại danh sách place_ids theo thứ tự đảo ngược hoặc cố định."""
        self.invocations.append(place_ids)
        if self.reversed_order:
            return list(reversed(place_ids))
        return sorted(place_ids, key=str)

    async def plan_day(
        self,
        places: list[PlaceVoteSummary],
        constraints: PlanConstraints,
    ) -> tuple[list[PlannedSlot], list[DroppedPlace]]:
        """Xếp tuần tự từ đầu khung giờ, mỗi quán 60 phút, không kiểm tra gì thêm."""
        slots: list[PlannedSlot] = []
        cursor = constraints.start_minute
        for place in places:
            slots.append(
                PlannedSlot(
                    place_id=place.place_id,
                    day_offset=constraints.day_offset,
                    start_minute=cursor,
                    end_minute=cursor + 60,
                )
            )
            cursor += 60
        return slots, []


class StubExternalPlacesProvider(IExternalPlacesProvider):
    """Hiện thực stub/mock cho IExternalPlacesProvider phục vụ kiểm thử Phase 2."""

    def __init__(self, predefined_results: list[dict[str, Any]] | None = None) -> None:
        self.predefined_results = predefined_results
        self.searched_queries: list[dict[str, Any]] = []

    async def search_places(
        self,
        query: str,
        lat: float,
        lng: float,
    ) -> list[dict[str, Any]]:
        """Trả về kết quả tìm kiếm mẫu theo tọa độ."""
        self.searched_queries.append({"query": query, "lat": lat, "lng": lng})
        if self.predefined_results is not None:
            return self.predefined_results

        return [
            {
                "external_id": f"gplace_{uuid4().hex[:8]}",
                "name": f"{query.title()} Quán",
                "address": f"123 Nguyễn Huệ, Quận 1, TP.HCM (gần {lat:.4f}, {lng:.4f})",
                "latitude": round(lat + 0.001, 6),
                "longitude": round(lng + 0.001, 6),
                "rating": 4.8,
                "user_ratings_total": 256,
                "category": "FOOD",
            },
            {
                "external_id": f"gplace_{uuid4().hex[:8]}",
                "name": f"{query.title()} Corner",
                "address": f"45 Lê Lợi, Quận 1, TP.HCM (gần {lat:.4f}, {lng:.4f})",
                "latitude": round(lat - 0.001, 6),
                "longitude": round(lng - 0.001, 6),
                "rating": 4.5,
                "user_ratings_total": 89,
                "category": "DRINK",
            },
        ]


class StubExpenseSplittingService(IExpenseSplittingService):
    """Hiện thực stub/mock cho IExpenseSplittingService phục vụ kiểm thử Phase 2."""

    def __init__(self) -> None:
        self.calculated_rooms: list[UUID] = []

    async def calculate_split(
        self,
        room_id: UUID,
        expenses: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Tính toán tổng chi tiêu và chia đều số tiền cho từng thành viên."""
        self.calculated_rooms.append(room_id)
        total_amount = sum(int(e.get("amount", 0)) for e in expenses)

        # Thu thập toàn bộ member_id tham gia
        all_participants: set[str] = set()
        for e in expenses:
            payer = str(e.get("paid_by_id", ""))
            if payer:
                all_participants.add(payer)
            for p in e.get("participant_ids", []):
                all_participants.add(str(p))

        num_participants = max(len(all_participants), 1)
        per_member_share = total_amount // num_participants

        balances: dict[str, int] = {}
        for p in all_participants:
            paid = sum(int(e.get("amount", 0)) for e in expenses if str(e.get("paid_by_id")) == p)
            balances[p] = paid - per_member_share

        return {
            "room_id": str(room_id),
            "total_expense": total_amount,
            "currency": "VND",
            "participant_count": len(all_participants),
            "per_member_share": per_member_share,
            "net_balances": balances,
            "settlement_transactions": [],
        }
