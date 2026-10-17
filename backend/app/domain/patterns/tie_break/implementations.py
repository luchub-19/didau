import hashlib
from collections import defaultdict

from app.core.exceptions import InvalidStrategyError
from app.domain.enums import PlaceCategory, PlaceStatus, TieBreakStrategyName
from app.domain.patterns.tie_break.strategy import (
    ITieBreakStrategy,
    PlaceVoteSummary,
    TieBreakContext,
)


class EarliestSubmissionTieBreakStrategy(ITieBreakStrategy):
    """Ưu tiên địa điểm được đề xuất lên hệ thống trước (created_at sớm nhất)."""

    @property
    def strategy_name(self) -> str:
        return TieBreakStrategyName.EARLIEST_SUBMISSION.value

    def break_ties(
        self,
        candidates: list[PlaceVoteSummary],
        context: TieBreakContext,
    ) -> list[PlaceVoteSummary]:
        if len(candidates) <= 1:
            return list(candidates)

        return sorted(
            candidates,
            key=lambda c: (c.created_at, str(c.place_id)),
        )


class MostUpvotesTieBreakStrategy(ITieBreakStrategy):
    """Ưu tiên địa điểm có số lượt Upvote tuyệt đối nhiều hơn."""

    @property
    def strategy_name(self) -> str:
        return TieBreakStrategyName.MOST_UPVOTES.value

    def break_ties(
        self,
        candidates: list[PlaceVoteSummary],
        context: TieBreakContext,
    ) -> list[PlaceVoteSummary]:
        if len(candidates) <= 1:
            return list(candidates)

        return sorted(
            candidates,
            key=lambda c: (-c.upvotes, c.created_at, str(c.place_id)),
        )


class CreatorPriorityTieBreakStrategy(ITieBreakStrategy):
    """Ưu tiên địa điểm do chính Chủ phòng (HOST) đề xuất."""

    @property
    def strategy_name(self) -> str:
        return TieBreakStrategyName.CREATOR_PRIORITY.value

    def break_ties(
        self,
        candidates: list[PlaceVoteSummary],
        context: TieBreakContext,
    ) -> list[PlaceVoteSummary]:
        if len(candidates) <= 1:
            return list(candidates)

        return sorted(
            candidates,
            key=lambda c: (
                0 if c.submitted_by_id == context.host_member_id else 1,
                -c.upvotes,
                c.created_at,
                str(c.place_id),
            ),
        )


class RandomTieBreakStrategy(ITieBreakStrategy):
    """Chọn ngẫu nhiên có kiểm soát (deterministic pseudo-random dựa trên seed room_id + place_id)."""

    @property
    def strategy_name(self) -> str:
        return TieBreakStrategyName.RANDOM.value

    def break_ties(
        self,
        candidates: list[PlaceVoteSummary],
        context: TieBreakContext,
    ) -> list[PlaceVoteSummary]:
        if len(candidates) <= 1:
            return list(candidates)

        def _deterministic_hash(candidate: PlaceVoteSummary) -> str:
            seed_key = f"{context.room_id}:{candidate.place_id}"
            return hashlib.sha256(seed_key.encode("utf-8")).hexdigest()

        return sorted(candidates, key=_deterministic_hash)


class CategoryDiversityTieBreakStrategy(ITieBreakStrategy):
    """Ưu tiên địa điểm có danh mục khác biệt với các địa điểm đã được chốt trước đó."""

    @property
    def strategy_name(self) -> str:
        return TieBreakStrategyName.CATEGORY_DIVERSITY.value

    def break_ties(
        self,
        candidates: list[PlaceVoteSummary],
        context: TieBreakContext,
    ) -> list[PlaceVoteSummary]:
        if len(candidates) <= 1:
            return list(candidates)

        # Sắp xếp danh sách ứng viên theo tiêu chí phụ trước (-upvotes, created_at, place_id)
        remaining = sorted(
            candidates,
            key=lambda c: (-c.upvotes, c.created_at, str(c.place_id)),
        )

        chosen: list[PlaceVoteSummary] = []
        seen_categories: set[PlaceCategory] = set(context.already_accepted_categories)

        while remaining:
            picked_idx: int | None = None
            # Tìm ứng viên đầu tiên mang lại một danh mục mới chưa có trong seen_categories
            for i, candidate in enumerate(remaining):
                if candidate.category not in seen_categories:
                    picked_idx = i
                    break

            if picked_idx is not None:
                picked = remaining.pop(picked_idx)
                seen_categories.add(picked.category)
                chosen.append(picked)
            else:
                # Nếu tất cả các ứng viên còn lại đều thuộc danh mục đã thấy, chọn theo thứ tự ưu tiên phụ
                picked = remaining.pop(0)
                chosen.append(picked)

        return chosen


class TieBreakStrategyFactory:
    """Factory để lấy hoặc đăng ký chiến lược phân định hòa phiếu."""

    def __init__(self) -> None:
        self._strategies: dict[str, ITieBreakStrategy] = {}
        self._register_defaults()

    def _register_defaults(self) -> None:
        self.register(EarliestSubmissionTieBreakStrategy())
        self.register(MostUpvotesTieBreakStrategy())
        self.register(CreatorPriorityTieBreakStrategy())
        self.register(RandomTieBreakStrategy())
        self.register(CategoryDiversityTieBreakStrategy())

    def register(self, strategy: ITieBreakStrategy) -> None:
        self._strategies[strategy.strategy_name.upper()] = strategy

    def get_strategy(self, name: str | TieBreakStrategyName) -> ITieBreakStrategy:
        raw_name = name.value if isinstance(name, TieBreakStrategyName) else str(name)
        normalized_name = raw_name.strip().upper()
        if normalized_name not in self._strategies:
            raise InvalidStrategyError(
                message=f"Chiến lược phân định hòa phiếu '{raw_name}' không hợp lệ.",
                details={
                    "strategy": raw_name,
                    "available_strategies": list(self._strategies.keys()),
                },
            )
        return self._strategies[normalized_name]

    def list_strategies(self) -> list[str]:
        return list(self._strategies.keys())

    @classmethod
    def create(cls, name: str | TieBreakStrategyName) -> ITieBreakStrategy:
        """Classmethod tiện ích để lấy strategy từ factory mặc định."""
        return cls().get_strategy(name)


def resolve_voting_with_tie_break(
    candidates: list[PlaceVoteSummary],
    max_accepted_places: int,
    strategy: ITieBreakStrategy,
    context: TieBreakContext,
) -> tuple[list[PlaceVoteSummary], bool]:
    """Chốt kết quả bình chọn danh sách địa điểm và áp dụng TieBreak khi có hòa phiếu.

    Args:
        candidates: Danh sách các địa điểm đang được bình chọn.
        max_accepted_places: Số lượng địa điểm tối đa được chấp nhận (ACCEPTED).
        strategy: Chiến lược phân định hòa phiếu được chỉ định.
        context: Ngữ cảnh giải quyết hòa phiếu.

    Returns:
        tuple[list[PlaceVoteSummary], bool]:
            - Danh sách địa điểm đã được cập nhật trạng thái ACCEPTED hoặc REJECTED,
              được sắp xếp theo thứ tự ưu tiên.
            - tie_break_applied: True nếu TieBreak đã được áp dụng để quyết định
              thứ tự giữa các ứng viên có cùng số điểm vote.
    """
    if not candidates:
        return [], False

    if max_accepted_places <= 0:
        rejected = [c.model_copy(update={"status": PlaceStatus.REJECTED}) for c in candidates]
        return rejected, False

    # Gom nhóm theo score từ cao xuống thấp
    groups_by_score: dict[int, list[PlaceVoteSummary]] = defaultdict(list)
    for c in candidates:
        groups_by_score[c.score].append(c)

    sorted_scores = sorted(groups_by_score.keys(), reverse=True)

    ordered_candidates: list[PlaceVoteSummary] = []
    has_tied_group = False

    for score in sorted_scores:
        group = groups_by_score[score]
        if len(group) > 1:
            has_tied_group = True
            ordered_group = strategy.break_ties(group, context)
        else:
            ordered_group = group
        ordered_candidates.extend(ordered_group)

    # Đánh dấu trạng thái ACCEPTED cho top max_accepted_places và REJECTED cho phần còn lại
    resolved_places: list[PlaceVoteSummary] = []
    for idx, place in enumerate(ordered_candidates):
        new_status = PlaceStatus.ACCEPTED if idx < max_accepted_places else PlaceStatus.REJECTED
        resolved_places.append(place.model_copy(update={"status": new_status}))

    tie_break_applied = has_tied_group and len(candidates) > 1

    return resolved_places, tie_break_applied
