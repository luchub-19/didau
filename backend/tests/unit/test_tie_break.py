from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from app.core.exceptions import InvalidStrategyError
from app.domain.enums import PlaceCategory, PlaceStatus, TieBreakStrategyName
from app.domain.patterns.tie_break import (
    CategoryDiversityTieBreakStrategy,
    CreatorPriorityTieBreakStrategy,
    EarliestSubmissionTieBreakStrategy,
    ITieBreakStrategy,
    MostUpvotesTieBreakStrategy,
    PlaceVoteSummary,
    RandomTieBreakStrategy,
    TieBreakContext,
    TieBreakStrategyFactory,
    resolve_voting_with_tie_break,
)


def create_summary(
    name: str,
    created_at: datetime,
    upvotes: int = 0,
    downvotes: int = 0,
    score: int = 0,
    category: PlaceCategory = PlaceCategory.FOOD,
    submitted_by_id: UUID | None = None,
    place_id: UUID | None = None,
    status: PlaceStatus = PlaceStatus.PROPOSED,
) -> PlaceVoteSummary:
    """Helper tạo nhanh đối tượng PlaceVoteSummary phục vụ kiểm thử."""
    return PlaceVoteSummary(
        place_id=place_id or uuid4(),
        name=name,
        category=category,
        status=status,
        submitted_by_id=submitted_by_id or uuid4(),
        estimated_cost=50000,
        open_minute=480,
        close_minute=1320,
        created_at=created_at,
        upvotes=upvotes,
        downvotes=downvotes,
        score=score,
    )


@pytest.fixture
def base_context() -> TieBreakContext:
    return TieBreakContext(
        room_id=UUID("00000000-0000-0000-0000-000000000001"),
        host_member_id=UUID("00000000-0000-0000-0000-000000000002"),
        already_accepted_categories=[],
    )


# ==============================================================================
# 1. EarliestSubmissionTieBreakStrategy Tests
# ==============================================================================


class TestEarliestSubmissionTieBreakStrategy:
    def test_strategy_name(self) -> None:
        strategy = EarliestSubmissionTieBreakStrategy()
        assert strategy.strategy_name == "EARLIEST_SUBMISSION"

    def test_sorts_by_created_at_ascending(self, base_context: TieBreakContext) -> None:
        strategy = EarliestSubmissionTieBreakStrategy()
        p1 = create_summary("Place 1", created_at=datetime(2026, 10, 17, 10, 0, tzinfo=UTC))
        p2 = create_summary("Place 2", created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC))
        p3 = create_summary("Place 3", created_at=datetime(2026, 10, 17, 9, 0, tzinfo=UTC))

        result = strategy.break_ties([p1, p2, p3], base_context)

        assert [p.name for p in result] == ["Place 2", "Place 3", "Place 1"]

    def test_handles_empty_and_single_candidate(self, base_context: TieBreakContext) -> None:
        strategy = EarliestSubmissionTieBreakStrategy()
        assert strategy.break_ties([], base_context) == []

        single = create_summary("Single", created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC))
        assert strategy.break_ties([single], base_context) == [single]

    def test_handles_same_created_at_deterministically(self, base_context: TieBreakContext) -> None:
        strategy = EarliestSubmissionTieBreakStrategy()
        same_time = datetime(2026, 10, 17, 8, 0, tzinfo=UTC)
        id_a = UUID("00000000-0000-0000-0000-00000000000a")
        id_b = UUID("00000000-0000-0000-0000-00000000000b")

        p_a = create_summary("Place A", created_at=same_time, place_id=id_a)
        p_b = create_summary("Place B", created_at=same_time, place_id=id_b)

        result1 = strategy.break_ties([p_a, p_b], base_context)
        result2 = strategy.break_ties([p_b, p_a], base_context)

        assert [p.name for p in result1] == ["Place A", "Place B"]
        assert [p.name for p in result2] == ["Place A", "Place B"]


# ==============================================================================
# 2. MostUpvotesTieBreakStrategy Tests
# ==============================================================================


class TestMostUpvotesTieBreakStrategy:
    def test_strategy_name(self) -> None:
        strategy = MostUpvotesTieBreakStrategy()
        assert strategy.strategy_name == "MOST_UPVOTES"

    def test_sorts_by_upvotes_descending_when_score_is_tied(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = MostUpvotesTieBreakStrategy()
        # Both have score = 3, but p2 has 6 upvotes, p1 has 4 upvotes
        p1 = create_summary(
            "Place 1",
            created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
            upvotes=4,
            downvotes=1,
            score=3,
        )
        p2 = create_summary(
            "Place 2",
            created_at=datetime(2026, 10, 17, 9, 0, tzinfo=UTC),
            upvotes=6,
            downvotes=3,
            score=3,
        )
        p3 = create_summary(
            "Place 3",
            created_at=datetime(2026, 10, 17, 10, 0, tzinfo=UTC),
            upvotes=8,
            downvotes=5,
            score=3,
        )

        result = strategy.break_ties([p1, p2, p3], base_context)

        assert [p.name for p in result] == ["Place 3", "Place 2", "Place 1"]

    def test_secondary_tiebreak_uses_earliest_created_at(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = MostUpvotesTieBreakStrategy()
        # Same upvotes = 5
        p1 = create_summary(
            "Place 1",
            created_at=datetime(2026, 10, 17, 10, 0, tzinfo=UTC),
            upvotes=5,
            score=5,
        )
        p2 = create_summary(
            "Place 2",
            created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
            upvotes=5,
            score=5,
        )

        result = strategy.break_ties([p1, p2], base_context)
        assert [p.name for p in result] == ["Place 2", "Place 1"]

    def test_handles_empty_and_single_candidate(self, base_context: TieBreakContext) -> None:
        strategy = MostUpvotesTieBreakStrategy()
        assert strategy.break_ties([], base_context) == []


# ==============================================================================
# 3. CreatorPriorityTieBreakStrategy Tests
# ==============================================================================


class TestCreatorPriorityTieBreakStrategy:
    def test_strategy_name(self) -> None:
        strategy = CreatorPriorityTieBreakStrategy()
        assert strategy.strategy_name == "CREATOR_PRIORITY"

    def test_prioritizes_host_submission_over_earlier_member_submission(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = CreatorPriorityTieBreakStrategy()
        host_id = base_context.host_member_id
        other_member_id = UUID("00000000-0000-0000-0000-000000000099")

        # Member created earlier
        p_member = create_summary(
            "Member Place",
            created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
            submitted_by_id=other_member_id,
            upvotes=5,
            score=5,
        )
        # Host created later
        p_host = create_summary(
            "Host Place",
            created_at=datetime(2026, 10, 17, 10, 0, tzinfo=UTC),
            submitted_by_id=host_id,
            upvotes=5,
            score=5,
        )

        result = strategy.break_ties([p_member, p_host], base_context)
        assert [p.name for p in result] == ["Host Place", "Member Place"]

    def test_multiple_host_places_sorted_by_upvotes_then_created_at(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = CreatorPriorityTieBreakStrategy()
        host_id = base_context.host_member_id
        other_member_id = UUID("00000000-0000-0000-0000-000000000099")

        h1 = create_summary(
            "Host Place 1",
            created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
            submitted_by_id=host_id,
            upvotes=3,
        )
        h2 = create_summary(
            "Host Place 2",
            created_at=datetime(2026, 10, 17, 9, 0, tzinfo=UTC),
            submitted_by_id=host_id,
            upvotes=5,
        )
        m1 = create_summary(
            "Member Place",
            created_at=datetime(2026, 10, 17, 7, 0, tzinfo=UTC),
            submitted_by_id=other_member_id,
            upvotes=10,
        )

        result = strategy.break_ties([h1, m1, h2], base_context)
        assert [p.name for p in result] == ["Host Place 2", "Host Place 1", "Member Place"]

    def test_no_host_places_falls_back_to_upvotes_and_created_at(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = CreatorPriorityTieBreakStrategy()
        member_id = UUID("00000000-0000-0000-0000-000000000099")

        m1 = create_summary(
            "M1",
            created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
            submitted_by_id=member_id,
            upvotes=2,
        )
        m2 = create_summary(
            "M2",
            created_at=datetime(2026, 10, 17, 9, 0, tzinfo=UTC),
            submitted_by_id=member_id,
            upvotes=5,
        )

        result = strategy.break_ties([m1, m2], base_context)
        assert [p.name for p in result] == ["M2", "M1"]


# ==============================================================================
# 4. RandomTieBreakStrategy Tests
# ==============================================================================


class TestRandomTieBreakStrategy:
    def test_strategy_name(self) -> None:
        strategy = RandomTieBreakStrategy()
        assert strategy.strategy_name == "RANDOM"

    def test_deterministic_across_multiple_runs_for_same_room_and_candidates(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = RandomTieBreakStrategy()
        places = [
            create_summary(f"Place {i}", created_at=datetime(2026, 10, 17, 8, i, tzinfo=UTC))
            for i in range(10)
        ]

        expected_names = [p.name for p in strategy.break_ties(places, base_context)]

        for _ in range(10):
            run_result = strategy.break_ties(places, base_context)
            assert [p.name for p in run_result] == expected_names

    def test_order_invariance_shuffled_inputs_give_same_deterministic_order(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = RandomTieBreakStrategy()
        p1 = create_summary("P1", created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC))
        p2 = create_summary("P2", created_at=datetime(2026, 10, 17, 9, 0, tzinfo=UTC))
        p3 = create_summary("P3", created_at=datetime(2026, 10, 17, 10, 0, tzinfo=UTC))

        res1 = strategy.break_ties([p1, p2, p3], base_context)
        res2 = strategy.break_ties([p3, p1, p2], base_context)
        res3 = strategy.break_ties([p2, p3, p1], base_context)

        names1 = [p.name for p in res1]
        assert [p.name for p in res2] == names1
        assert [p.name for p in res3] == names1

    def test_different_room_id_influences_ordering(self) -> None:
        strategy = RandomTieBreakStrategy()
        ctx_a = TieBreakContext(
            room_id=UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            host_member_id=uuid4(),
        )
        ctx_b = TieBreakContext(
            room_id=UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
            host_member_id=uuid4(),
        )

        places = [
            create_summary(f"Place {i}", created_at=datetime(2026, 10, 17, 8, i, tzinfo=UTC))
            for i in range(15)
        ]

        res_a = [p.name for p in strategy.break_ties(places, ctx_a)]
        res_b = [p.name for p in strategy.break_ties(places, ctx_b)]

        assert res_a != res_b

    def test_handles_empty_and_single_candidate(self, base_context: TieBreakContext) -> None:
        strategy = RandomTieBreakStrategy()
        assert strategy.break_ties([], base_context) == []


# ==============================================================================
# 5. CategoryDiversityTieBreakStrategy Tests
# ==============================================================================


class TestCategoryDiversityTieBreakStrategy:
    def test_strategy_name(self) -> None:
        strategy = CategoryDiversityTieBreakStrategy()
        assert strategy.strategy_name == "CATEGORY_DIVERSITY"

    def test_prioritizes_categories_not_already_accepted(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = CategoryDiversityTieBreakStrategy()
        context = TieBreakContext(
            room_id=base_context.room_id,
            host_member_id=base_context.host_member_id,
            already_accepted_categories=[PlaceCategory.FOOD],
        )

        p_food = create_summary(
            "Food Place",
            created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
            category=PlaceCategory.FOOD,
            upvotes=10,
        )
        p_drink = create_summary(
            "Drink Place",
            created_at=datetime(2026, 10, 17, 9, 0, tzinfo=UTC),
            category=PlaceCategory.DRINK,
            upvotes=3,
        )

        result = strategy.break_ties([p_food, p_drink], context)
        # Even though food has more upvotes, drink introduces a new category
        assert [p.name for p in result] == ["Drink Place", "Food Place"]

    def test_greedy_interleaving_maximizes_category_diversity(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = CategoryDiversityTieBreakStrategy()
        context = TieBreakContext(
            room_id=base_context.room_id,
            host_member_id=base_context.host_member_id,
            already_accepted_categories=[],
        )

        f1 = create_summary(
            "Food 1",
            created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
            category=PlaceCategory.FOOD,
            upvotes=10,
        )
        f2 = create_summary(
            "Food 2",
            created_at=datetime(2026, 10, 17, 8, 1, tzinfo=UTC),
            category=PlaceCategory.FOOD,
            upvotes=8,
        )
        d1 = create_summary(
            "Drink 1",
            created_at=datetime(2026, 10, 17, 8, 2, tzinfo=UTC),
            category=PlaceCategory.DRINK,
            upvotes=6,
        )
        e1 = create_summary(
            "Entertainment 1",
            created_at=datetime(2026, 10, 17, 8, 3, tzinfo=UTC),
            category=PlaceCategory.ENTERTAINMENT,
            upvotes=4,
        )

        result = strategy.break_ties([f1, f2, d1, e1], context)
        # Diverse categories (Food 1, Drink 1, Entertainment 1) picked before second Food (Food 2)
        assert [p.name for p in result] == ["Food 1", "Drink 1", "Entertainment 1", "Food 2"]

    def test_all_same_category_falls_back_to_upvotes_and_created_at(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = CategoryDiversityTieBreakStrategy()
        f1 = create_summary(
            "Food Low Upvotes",
            created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
            category=PlaceCategory.FOOD,
            upvotes=2,
        )
        f2 = create_summary(
            "Food High Upvotes",
            created_at=datetime(2026, 10, 17, 9, 0, tzinfo=UTC),
            category=PlaceCategory.FOOD,
            upvotes=5,
        )

        result = strategy.break_ties([f1, f2], base_context)
        assert [p.name for p in result] == ["Food High Upvotes", "Food Low Upvotes"]


# ==============================================================================
# 6. TieBreakStrategyFactory Tests
# ==============================================================================


class TestTieBreakStrategyFactory:
    def test_factory_loads_all_five_strategies_by_string(self) -> None:
        factory = TieBreakStrategyFactory()

        assert isinstance(
            factory.get_strategy("EARLIEST_SUBMISSION"), EarliestSubmissionTieBreakStrategy
        )
        assert isinstance(factory.get_strategy("MOST_UPVOTES"), MostUpvotesTieBreakStrategy)
        assert isinstance(
            factory.get_strategy("CREATOR_PRIORITY"), CreatorPriorityTieBreakStrategy
        )
        assert isinstance(factory.get_strategy("RANDOM"), RandomTieBreakStrategy)
        assert isinstance(
            factory.get_strategy("CATEGORY_DIVERSITY"), CategoryDiversityTieBreakStrategy
        )

    def test_factory_loads_by_enum(self) -> None:
        factory = TieBreakStrategyFactory()

        assert isinstance(
            factory.get_strategy(TieBreakStrategyName.EARLIEST_SUBMISSION),
            EarliestSubmissionTieBreakStrategy,
        )
        assert isinstance(
            factory.get_strategy(TieBreakStrategyName.MOST_UPVOTES),
            MostUpvotesTieBreakStrategy,
        )
        assert isinstance(
            factory.get_strategy(TieBreakStrategyName.CREATOR_PRIORITY),
            CreatorPriorityTieBreakStrategy,
        )
        assert isinstance(
            factory.get_strategy(TieBreakStrategyName.RANDOM),
            RandomTieBreakStrategy,
        )
        assert isinstance(
            factory.get_strategy(TieBreakStrategyName.CATEGORY_DIVERSITY),
            CategoryDiversityTieBreakStrategy,
        )

    def test_case_insensitive_lookup(self) -> None:
        factory = TieBreakStrategyFactory()
        assert isinstance(factory.get_strategy("earliest_submission"), EarliestSubmissionTieBreakStrategy)
        assert isinstance(factory.get_strategy("Most_Upvotes"), MostUpvotesTieBreakStrategy)

    def test_invalid_strategy_raises_invalid_strategy_error(self) -> None:
        factory = TieBreakStrategyFactory()
        with pytest.raises(InvalidStrategyError) as exc_info:
            factory.get_strategy("NON_EXISTENT_STRATEGY")

        assert exc_info.value.code == "INVALID_STRATEGY"
        assert exc_info.value.status_code == 400
        assert "NON_EXISTENT_STRATEGY" in str(exc_info.value.message)

    def test_list_strategies(self) -> None:
        factory = TieBreakStrategyFactory()
        strategies = factory.list_strategies()
        assert set(strategies) == {
            "EARLIEST_SUBMISSION",
            "MOST_UPVOTES",
            "CREATOR_PRIORITY",
            "RANDOM",
            "CATEGORY_DIVERSITY",
        }

    def test_register_custom_strategy(self) -> None:
        class CustomStrategy(ITieBreakStrategy):
            @property
            def strategy_name(self) -> str:
                return "CUSTOM_TEST"

            def break_ties(
                self, candidates: list[PlaceVoteSummary], context: TieBreakContext
            ) -> list[PlaceVoteSummary]:
                return candidates

        factory = TieBreakStrategyFactory()
        factory.register(CustomStrategy())
        assert isinstance(factory.get_strategy("CUSTOM_TEST"), CustomStrategy)

    def test_classmethod_create(self) -> None:
        strategy = TieBreakStrategyFactory.create(TieBreakStrategyName.MOST_UPVOTES)
        assert isinstance(strategy, MostUpvotesTieBreakStrategy)


# ==============================================================================
# 7. resolve_voting_with_tie_break Tests
# ==============================================================================


class TestResolveVotingWithTieBreak:
    def test_no_tie_different_scores_tie_break_not_applied(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = MostUpvotesTieBreakStrategy()
        p1 = create_summary(
            "P1 High",
            created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
            score=10,
        )
        p2 = create_summary(
            "P2 Medium",
            created_at=datetime(2026, 10, 17, 9, 0, tzinfo=UTC),
            score=5,
        )
        p3 = create_summary(
            "P3 Low",
            created_at=datetime(2026, 10, 17, 10, 0, tzinfo=UTC),
            score=1,
        )

        resolved, tie_break_applied = resolve_voting_with_tie_break(
            candidates=[p1, p2, p3],
            max_accepted_places=2,
            strategy=strategy,
            context=base_context,
        )

        assert tie_break_applied is False
        assert len(resolved) == 3
        assert resolved[0].name == "P1 High" and resolved[0].status == PlaceStatus.ACCEPTED
        assert resolved[1].name == "P2 Medium" and resolved[1].status == PlaceStatus.ACCEPTED
        assert resolved[2].name == "P3 Low" and resolved[2].status == PlaceStatus.REJECTED

    def test_tied_scores_resolved_by_strategy_and_marks_status(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = MostUpvotesTieBreakStrategy()
        # P1 and P2 tied at score 4, but P2 has 5 upvotes, P1 has 4 upvotes
        p1 = create_summary(
            "P1",
            created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC),
            upvotes=4,
            score=4,
        )
        p2 = create_summary(
            "P2",
            created_at=datetime(2026, 10, 17, 9, 0, tzinfo=UTC),
            upvotes=5,
            score=4,
        )

        resolved, tie_break_applied = resolve_voting_with_tie_break(
            candidates=[p1, p2],
            max_accepted_places=1,
            strategy=strategy,
            context=base_context,
        )

        assert tie_break_applied is True
        assert resolved[0].name == "P2"
        assert resolved[0].status == PlaceStatus.ACCEPTED
        assert resolved[1].name == "P1"
        assert resolved[1].status == PlaceStatus.REJECTED

    def test_max_accepted_places_zero_rejects_all(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = EarliestSubmissionTieBreakStrategy()
        p1 = create_summary(
            "P1", created_at=datetime(2026, 10, 17, 8, 0, tzinfo=UTC), score=5
        )

        resolved, tie_break_applied = resolve_voting_with_tie_break(
            candidates=[p1],
            max_accepted_places=0,
            strategy=strategy,
            context=base_context,
        )

        assert tie_break_applied is False
        assert resolved[0].status == PlaceStatus.REJECTED

    def test_empty_candidates_returns_empty(
        self, base_context: TieBreakContext
    ) -> None:
        strategy = EarliestSubmissionTieBreakStrategy()
        resolved, tie_break_applied = resolve_voting_with_tie_break(
            candidates=[],
            max_accepted_places=3,
            strategy=strategy,
            context=base_context,
        )

        assert resolved == []
        assert tie_break_applied is False
