from app.domain.patterns.conflict_rule.implementations import (
    BudgetThresholdConflictRule,
    DuplicatePlaceConflictRule,
    OpeningHoursConflictRule,
    TimeOverlapConflictRule,
    TravelTimeConflictRule,
)
from app.domain.patterns.conflict_rule.rule import (
    ConflictContext,
    ConflictResult,
    IConflictRule,
)


class ConflictDetectionEngine:
    """Bộ máy tổng hợp phát hiện xung đột lịch trình và địa điểm (Composite/Rules Engine).

    Quản lý danh sách các quy tắc IConflictRule và chạy đánh giá toàn diện trên ConflictContext.
    """

    def __init__(self, rules: list[IConflictRule] | None = None) -> None:
        """Khởi tạo ConflictDetectionEngine.

        Args:
            rules: Danh sách các quy tắc tùy chỉnh. Nếu None, nạp 5 quy tắc mặc định theo CONTRACTS.md.
        """
        if rules is None:
            self._rules: list[IConflictRule] = [
                TimeOverlapConflictRule(),
                TravelTimeConflictRule(),
                OpeningHoursConflictRule(),
                DuplicatePlaceConflictRule(),
                BudgetThresholdConflictRule(),
            ]
        else:
            self._rules = list(rules)

    @property
    def rules(self) -> list[IConflictRule]:
        """Danh sách các quy tắc đang được đăng ký."""
        return list(self._rules)

    def register_rule(self, rule: IConflictRule) -> None:
        """Đăng ký thêm một quy tắc kiểm tra xung đột."""
        self._rules.append(rule)

    def unregister_rule(self, rule_code: str) -> bool:
        """Hủy đăng ký quy tắc theo rule_code.

        Args:
            rule_code: Mã định danh của quy tắc cần hủy.

        Returns:
            True nếu có quy tắc bị xóa, False nếu không tìm thấy.
        """
        initial_len = len(self._rules)
        self._rules = [r for r in self._rules if r.rule_code != rule_code]
        return len(self._rules) < initial_len

    def get_rule(self, rule_code: str) -> IConflictRule | None:
        """Tìm quy tắc đã đăng ký theo rule_code."""
        for r in self._rules:
            if r.rule_code == rule_code:
                return r
        return None

    def evaluate_all(self, context: ConflictContext) -> list[ConflictResult]:
        """Chạy toàn bộ các quy tắc xung đột đã đăng ký trên ngữ cảnh phòng.

        Args:
            context: Ngữ cảnh phòng bao gồm địa điểm, lịch trình, ngân sách.

        Returns:
            Danh sách tất cả các cảnh báo ConflictResult từ các quy tắc vi phạm.
        """
        all_conflicts: list[ConflictResult] = []
        for rule in self._rules:
            rule_conflicts = rule.evaluate(context)
            if rule_conflicts:
                all_conflicts.extend(rule_conflicts)
        return all_conflicts
