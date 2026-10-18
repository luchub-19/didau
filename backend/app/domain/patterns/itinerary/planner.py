import itertools
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.enums import PlaceCategory, PlaceStatus
from app.domain.patterns.itinerary.opening_hours import parse_opening_hours
from app.domain.patterns.itinerary.travel import HaversineTravelEstimator, ITravelTimeEstimator
from app.domain.patterns.tie_break.strategy import PlaceVoteSummary
from app.domain.phase2_interfaces.route_optimization import IRouteOptimizationService

DEFAULT_DURATIONS: dict[PlaceCategory, int] = {
    PlaceCategory.FOOD: 75,
    PlaceCategory.DRINK: 75,
    PlaceCategory.ENTERTAINMENT: 120,
    PlaceCategory.SIGHTSEEING: 90,
    PlaceCategory.SHOPPING: 60,
    PlaceCategory.ACCOMMODATION: 60,
    PlaceCategory.OTHER: 60,
}

DINNER_WINDOW = (17 * 60 + 30, 20 * 60 + 30)
LUNCH_WINDOW = (11 * 60, 13 * 60 + 30)

WAIT_WEIGHT = 0.5
MEAL_DEVIATION_WEIGHT = 2.0
DROP_PENALTY = 1000.0
DRINK_BEFORE_FOOD_PENALTY = 60.0
BRUTE_FORCE_MAX = 7
TWO_OPT_MAX_PASSES = 20
DAY_LAST_MINUTE = 1439


class PlanConstraints(BaseModel):
    """Ràng buộc đầu vào của planner."""

    event_date: date
    day_offset: int = 0
    num_days: int = 1
    start_minute: int = 1020  # 17:00
    end_minute: int = 1380  # 23:00
    meeting_point: tuple[float, float] | None = None
    duration_overrides: dict[UUID, int] = Field(default_factory=dict)
    # Chuỗi opening_hours gốc (OSM) theo place_id; ưu tiên hơn open/close_minute
    opening_hours_raw: dict[UUID, str] = Field(default_factory=dict)


class PlannedSlot(BaseModel):
    place_id: UUID
    day_offset: int
    start_minute: int
    end_minute: int
    travel_from_prev_min: int = 0
    reasons: list[str] = Field(default_factory=list)
    reason_codes: list[dict[str, Any]] = Field(default_factory=list)


class DroppedPlace(BaseModel):
    place_id: UUID
    reason: str
    reason_code: str | None = None
    reason_params: dict[str, Any] = Field(default_factory=dict)


def _hhmm(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def select_candidates(places: list[PlaceVoteSummary]) -> tuple[list[PlaceVoteSummary], bool]:
    """Lấy quán ACCEPTED; nếu không có thì top-score PROPOSED/VOTING mỗi category 1 quán.

    Returns:
        (danh sách quán, used_fallback).
    """
    accepted = [p for p in places if p.status == PlaceStatus.ACCEPTED]
    if accepted:
        return accepted, False
    best: dict[PlaceCategory, PlaceVoteSummary] = {}
    pool = [p for p in places if p.status in (PlaceStatus.PROPOSED, PlaceStatus.VOTING)]
    for p in sorted(pool, key=lambda x: (-x.score, x.created_at, str(x.place_id))):
        best.setdefault(p.category, p)
    return list(best.values()), bool(best)


class _DayState:
    """Dữ liệu tiền xử lý của một ngày để mô phỏng timeline nhanh."""

    def __init__(
        self,
        places: list[PlaceVoteSummary],
        constraints: PlanConstraints,
        estimator: ITravelTimeEstimator,
        day_offset: int,
    ) -> None:
        self.places = places
        self.day_start = constraints.start_minute
        self.day_end = min(constraints.end_minute, DAY_LAST_MINUTE)
        self.meeting = constraints.meeting_point
        weekday = (constraints.event_date + timedelta(days=day_offset)).weekday()
        n = len(places)
        self.duration = [
            constraints.duration_overrides.get(p.place_id) or DEFAULT_DURATIONS[p.category]
            for p in places
        ]
        self.windows: list[list[tuple[int, int]]] = []
        for p in places:
            raw = constraints.opening_hours_raw.get(p.place_id)
            wins = parse_opening_hours(raw, weekday) if raw else None
            if wins is None and p.open_minute is not None and p.close_minute is not None:
                close = p.close_minute if p.close_minute >= p.open_minute else DAY_LAST_MINUTE
                wins = [(p.open_minute, close)]
            self.windows.append(wins if wins is not None else [(0, DAY_LAST_MINUTE)])
        self.coords: list[tuple[float, float] | None] = [
            (p.latitude, p.longitude)
            if p.latitude is not None and p.longitude is not None
            else None
            for p in places
        ]
        self.travel = [[0] * n for _ in range(n)]
        self.from_meeting = [0] * n
        for i in range(n):
            ci = self.coords[i]
            if ci is None:
                continue
            if self.meeting is not None:
                self.from_meeting[i] = estimator.minutes(self.meeting, ci)
            for j in range(n):
                cj = self.coords[j]
                if i != j and cj is not None:
                    self.travel[i][j] = estimator.minutes(ci, cj)
        self.meal_windows = [DINNER_WINDOW]
        if self.day_start <= LUNCH_WINDOW[0] and self.day_end >= LUNCH_WINDOW[1]:
            self.meal_windows.append(LUNCH_WINDOW)
        self.has_food = any(p.category == PlaceCategory.FOOD for p in places)

    def fit(self, idx: int, arrive: int, limit: int | None = None) -> int | None:
        """Giờ bắt đầu sớm nhất >= arrive sao cho kịp trong giờ mở cửa và khung buổi."""
        end_cap = self.day_end if limit is None else limit
        dur = self.duration[idx]
        for open_m, close_m in self.windows[idx]:
            start = max(arrive, open_m, self.day_start)
            if start + dur <= min(close_m, end_cap):
                return start
        return None

    def schedule_start(self, idx: int, arrive: int) -> int | None:
        """Như `fit`, nhưng quán FOOD đến sớm hơn khung bữa thì chờ tới đầu khung (nếu kịp)."""
        start = self.fit(idx, arrive)
        if start is None or self.places[idx].category != PlaceCategory.FOOD:
            return start
        if self.meal_deviation(idx, start) == 0:
            return start
        for ws, _ in self.meal_windows:
            if start < ws:
                shifted = self.fit(idx, ws)
                if shifted is not None and self.meal_deviation(idx, shifted) < self.meal_deviation(
                    idx, start
                ):
                    return shifted
        return start

    def meal_deviation(self, idx: int, start: int) -> int:
        if self.places[idx].category != PlaceCategory.FOOD:
            return 0
        end = start + self.duration[idx]
        return min(max(0, ws - start) + max(0, end - we) for ws, we in self.meal_windows)

    def simulate(
        self, order: list[int]
    ) -> tuple[float, list[tuple[int, int, int, int]], list[int]]:
        """Mô phỏng timeline theo thứ tự `order`.

        Returns:
            (chi phí, [(idx, start, end, travel)], [idx bị loại]).
        """
        t = self.day_start
        prev: int | None = None
        cost = 0.0
        placed: list[tuple[int, int, int, int]] = []
        dropped: list[int] = []
        seen_food = False
        for idx in order:
            if prev is None:
                travel = self.from_meeting[idx]
            else:
                travel = self.travel[prev][idx] if self.coords[prev] and self.coords[idx] else 0
            arrive = t + travel
            start = self.schedule_start(idx, arrive)
            if start is None:
                dropped.append(idx)
                cost += DROP_PENALTY
                continue
            end = start + self.duration[idx]
            cost += travel + WAIT_WEIGHT * (start - arrive)
            cost += MEAL_DEVIATION_WEIGHT * self.meal_deviation(idx, start)
            category = self.places[idx].category
            if category == PlaceCategory.FOOD:
                seen_food = True
            elif category == PlaceCategory.DRINK and self.has_food and not seen_food:
                cost += DRINK_BEFORE_FOOD_PENALTY
            placed.append((idx, start, end, travel))
            t, prev = end, idx
        return cost, placed, dropped


class HeuristicItineraryPlanner(IRouteOptimizationService):
    """Planner heuristic thuần (không gọi API ngoài), deterministic.

    n ≤ 7: duyệt toàn bộ hoán vị; n > 7: greedy rồi 2-opt.
    """

    def __init__(self, estimator: ITravelTimeEstimator | None = None) -> None:
        self.estimator = estimator or HaversineTravelEstimator()

    async def optimize_route(self, place_ids: list[UUID]) -> list[UUID]:
        """Planner cần tọa độ nên không đổi thứ tự ở đây; dùng `plan_day` để xếp lịch."""
        return list(place_ids)

    async def plan_day(
        self,
        places: list[PlaceVoteSummary],
        constraints: PlanConstraints,
    ) -> tuple[list[PlannedSlot], list[DroppedPlace]]:
        return self.plan(places, constraints)

    def plan(
        self,
        places: list[PlaceVoteSummary],
        constraints: PlanConstraints,
    ) -> tuple[list[PlannedSlot], list[DroppedPlace]]:
        """Xếp `places` vào các ngày từ `day_offset`; quán chưa xếp được sang ngày kế (nếu còn)."""
        remaining = sorted(places, key=lambda p: (-p.score, p.created_at, str(p.place_id)))
        slots: list[PlannedSlot] = []
        dropped: list[DroppedPlace] = []
        last_day = constraints.day_offset + max(1, constraints.num_days) - 1
        for day in range(constraints.day_offset, last_day + 1):
            if not remaining:
                break
            day_slots, day_dropped = self._plan_one_day(remaining, constraints, day)
            slots.extend(day_slots)
            placed_ids = {s.place_id for s in day_slots}
            remaining = [p for p in remaining if p.place_id not in placed_ids]
            dropped = day_dropped  # lý do mới nhất của những quán còn lại
        return slots, dropped

    def _plan_one_day(
        self,
        places: list[PlaceVoteSummary],
        constraints: PlanConstraints,
        day: int,
    ) -> tuple[list[PlannedSlot], list[DroppedPlace]]:
        state = _DayState(places, constraints, self.estimator, day)
        n = len(places)
        if n <= BRUTE_FORCE_MAX:
            best_order = min(
                itertools.permutations(range(n)),
                key=lambda perm: state.simulate(list(perm))[0],
            )
            order = list(best_order)
        else:
            order = self._two_opt(state, self._greedy(state))
        _, placed, dropped_idx = state.simulate(order)

        slots: list[PlannedSlot] = []
        prev_name: str | None = None
        for idx, start, end, travel in placed:
            place = places[idx]
            reasons, reason_codes = self._reasons(state, idx, start, travel, prev_name)
            slots.append(
                PlannedSlot(
                    place_id=place.place_id,
                    day_offset=day,
                    start_minute=start,
                    end_minute=end,
                    travel_from_prev_min=travel,
                    reasons=reasons,
                    reason_codes=reason_codes,
                )
            )
            prev_name = place.name
        dropped = []
        for i in dropped_idx:
            drop_reason, drop_code, drop_params = self._drop_reason(state, i)
            dropped.append(
                DroppedPlace(
                    place_id=places[i].place_id,
                    reason=drop_reason,
                    reason_code=drop_code,
                    reason_params=drop_params,
                )
            )
        return slots, dropped

    @staticmethod
    def _greedy(state: _DayState) -> list[int]:
        """Gần nhất khả thi; quán không khả thi nối cuối (sẽ bị loại)."""
        left = list(range(len(state.places)))
        order: list[int] = []
        t = state.day_start
        prev: int | None = None
        while left:
            best: tuple[float, int] | None = None
            for idx in left:
                travel = state.from_meeting[idx] if prev is None else state.travel[prev][idx]
                start = state.schedule_start(idx, t + travel)
                if start is None:
                    continue
                key = (travel + WAIT_WEIGHT * (start - t - travel), idx)
                if best is None or key < best:
                    best = key
            if best is None:
                order.extend(left)
                break
            chosen = best[1]
            travel = state.from_meeting[chosen] if prev is None else state.travel[prev][chosen]
            start = state.schedule_start(chosen, t + travel) or t
            t, prev = start + state.duration[chosen], chosen
            order.append(chosen)
            left.remove(chosen)
        return order

    @staticmethod
    def _two_opt(state: _DayState, order: list[int]) -> list[int]:
        best_cost = state.simulate(order)[0]
        for _ in range(TWO_OPT_MAX_PASSES):
            improved = False
            for i in range(len(order) - 1):
                for j in range(i + 1, len(order)):
                    cand = order[:i] + order[i : j + 1][::-1] + order[j + 1 :]
                    cost = state.simulate(cand)[0]
                    if cost < best_cost - 1e-9:
                        order, best_cost, improved = cand, cost, True
            if not improved:
                break
        return order

    @staticmethod
    def _reasons(
        state: _DayState,
        idx: int,
        start: int,
        travel: int,
        prev_name: str | None,
    ) -> tuple[list[str], list[dict[str, Any]]]:
        place = state.places[idx]
        reasons: list[str] = []
        reason_codes: list[dict[str, Any]] = []
        if place.category == PlaceCategory.FOOD:
            for ws, we in state.meal_windows:
                if ws <= start and start + state.duration[idx] <= we:
                    is_dinner = (ws, we) == DINNER_WINDOW
                    label = "bữa tối" if is_dinner else "bữa trưa"
                    window_code = "dinner" if is_dinner else "lunch"
                    reasons.append(f"Rơi vào khung {label} {_hhmm(ws)}–{_hhmm(we)}")
                    reason_codes.append({
                        "code": "MEAL_WINDOW",
                        "params": {
                            "window": window_code,
                            "start_minute": ws,
                            "end_minute": we,
                        },
                    })
                    break
            else:
                reasons.append("Lệch khung giờ bữa ăn thông thường")
                reason_codes.append({"code": "OFF_MEAL_WINDOW", "params": {}})
        elif place.category == PlaceCategory.DRINK:
            if state.has_food:
                reasons.append("Xếp sau bữa ăn")
                reason_codes.append({"code": "AFTER_MEAL", "params": {}})
            else:
                reasons.append("Đồ uống")
                reason_codes.append({"code": "DRINK", "params": {}})
        if travel > 0:
            if prev_name:
                origin = f"'{prev_name}'"
                reasons.append(f"Di chuyển khoảng {travel} phút từ {origin}")
                reason_codes.append({
                    "code": "TRAVEL_FROM",
                    "params": {"travel_min": travel, "from_name": prev_name},
                })
            else:
                origin = "điểm hẹn"
                reasons.append(f"Di chuyển khoảng {travel} phút từ {origin}")
                reason_codes.append({
                    "code": "TRAVEL_FROM",
                    "params": {"travel_min": travel, "from_origin": True},
                })
        return reasons, reason_codes

    @staticmethod
    def _drop_reason(state: _DayState, idx: int) -> tuple[str, str, dict[str, Any]]:
        if state.fit(idx, state.day_start, DAY_LAST_MINUTE) is None:
            return (
                "Quán không mở cửa hoặc không kịp giờ đóng cửa trong ngày này",
                "CLOSED_OR_NO_FIT",
                {},
            )
        return ("Hết giờ trong buổi", "OUT_OF_TIME", {})
