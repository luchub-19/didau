from collections import Counter

import pytest

from app.domain.patterns.decision import (
    LadderGenerator,
    WheelPicker,
)


def test_wheel_picker_deterministic_with_same_seed():
    """Cùng một seed luôn cho ra cùng một người thắng, cùng vị trí và góc dừng."""
    candidates = ["Quán A", "Quán B", "Quán C", "Quán D"]
    seed = 812734

    res1 = WheelPicker.pick(candidates, seed=seed)
    res2 = WheelPicker.pick(candidates, seed=seed)

    assert res1.winner == res2.winner
    assert res1.winner_index == res2.winner_index
    assert res1.stop_angle_deg == res2.stop_angle_deg
    assert res1.result_payload == res2.result_payload


def test_wheel_picker_different_seeds_variety():
    """Các seed khác nhau cho ra các kết quả khác nhau."""
    candidates = ["Quán 1", "Quán 2", "Quán 3", "Quán 4", "Quán 5"]
    winners = {WheelPicker.pick(candidates, seed=s).winner for s in range(50)}
    assert len(winners) > 1


def test_wheel_picker_stop_angle_range():
    """Góc dừng quay tối thiểu 4 vòng (1440 độ) và dưới 5 vòng (1800 độ)."""
    candidates = ["A", "B", "C"]
    for seed in [1, 42, 100, 9999]:
        res = WheelPicker.pick(candidates, seed=seed)
        assert 1440.0 <= res.stop_angle_deg <= 1800.0


def test_wheel_picker_single_candidate():
    """Chỉ có 1 ứng viên thì luôn thắng tại index 0."""
    res = WheelPicker.pick(["Quán Duy Nhất"], seed=123)
    assert res.winner == "Quán Duy Nhất"
    assert res.winner_index == 0


def test_wheel_picker_empty_candidates_raises():
    """Danh sách rỗng ném ngoại lệ ValueError."""
    with pytest.raises(ValueError, match="không được rỗng"):
        WheelPicker.pick([])


def test_wheel_picker_mismatched_weights_raises():
    """Số lượng trọng số không khớp với số ứng viên ném ngoại lệ ValueError."""
    with pytest.raises(ValueError, match="bằng độ dài"):
        WheelPicker.pick(["A", "B"], weights=[1.0, 2.0, 3.0])


def test_wheel_picker_weighted_distribution():
    """Ứng viên có trọng số vượt trội (100 so với 1) chiếm phần lớn kết quả."""
    candidates = ["Quán Hiếm", "Quán Phổ Biến"]
    weights = [1.0, 99.0]
    results = [WheelPicker.pick(candidates, weights=weights, seed=s).winner_index for s in range(100)]
    assert results.count(1) >= 85


def test_wheel_picker_uniform_distribution_10000_seeds():
    """Tiêu chí hoàn thành: 10.000 seed thì WheelPicker không trọng số lệch < 3% mỗi ô."""
    candidates = ["Ô 0", "Ô 1", "Ô 2", "Ô 3"]
    n_seeds = 10000
    expected_prob = 1.0 / len(candidates)  # 25% (0.25)
    margin = 0.03  # Độ lệch cho phép < 3%

    counts = Counter()
    for s in range(n_seeds):
        res = WheelPicker.pick(candidates, seed=s)
        counts[res.winner_index] += 1

    for idx in range(len(candidates)):
        actual_prob = counts[idx] / n_seeds
        deviation = abs(actual_prob - expected_prob)
        assert deviation < margin, (
            f"Ô {idx} lệch {deviation * 100:.2f}% (thực tế: {actual_prob * 100:.2f}%, kỳ vọng: 25.00%), vượt ngưỡng 3%!"
        )


def test_ladder_generator_deterministic_with_same_seed():
    """Cùng seed thì LadderGenerator sinh cùng bậc ngang, cùng cột thắng và đường đi."""
    seed = 54321
    res1 = LadderGenerator.generate(n_columns=4, seed=seed)
    res2 = LadderGenerator.generate(n_columns=4, seed=seed)

    assert [r.model_dump() for r in res1.rungs] == [r.model_dump() for r in res2.rungs]
    assert res1.winning_top_column == res2.winning_top_column
    assert res1.winning_bottom_column == res2.winning_bottom_column
    assert res1.connections == res2.connections
    assert res1.paths == res2.paths


def test_ladder_generator_no_adjacent_rungs_at_same_height():
    """Bất biến thang Amidakuji: Tại cùng một độ cao không được có 2 bậc ngang liền kề."""
    for s in range(20):
        res = LadderGenerator.generate(n_columns=6, seed=s)
        by_height = {}
        for r in res.rungs:
            by_height.setdefault(r.height, []).append(r.column)

        for h, cols in by_height.items():
            sorted_cols = sorted(cols)
            for i in range(len(sorted_cols) - 1):
                assert sorted_cols[i + 1] > sorted_cols[i] + 1, (
                    f"Trùng lặp bậc ngang liền kề tại height {h}: cột {sorted_cols[i]} và {sorted_cols[i + 1]}"
                )


def test_ladder_generator_all_columns_connected_bijection():
    """Mỗi cột xuất phát ở đỉnh nối chính xác với một cột duy nhất ở đáy (Song ánh / Hoán vị)."""
    for n in [2, 3, 5, 8]:
        res = LadderGenerator.generate(n_columns=n, seed=123)
        assert len(res.connections) == n
        assert set(res.connections.keys()) == set(range(n))
        assert set(res.connections.values()) == set(range(n))
        assert set(res.inverse_connections.keys()) == set(range(n))
        assert set(res.inverse_connections.values()) == set(range(n))


def test_ladder_generator_result_matches_manual_trace():
    """Tiêu chí hoàn thành: Kết quả thang khớp hoàn toàn với việc đi đường thủ công."""
    for s in [7, 42, 99, 1337, 2026]:
        res = LadderGenerator.generate(n_columns=5, seed=s)
        for start_col in range(5):
            manual_end = LadderGenerator.trace_endpoint(res.rungs, n_columns=5, start_col=start_col)
            assert res.connections[start_col] == manual_end, (
                f"Seed {s}, cột bắt đầu {start_col}: kết quả tạo ({res.connections[start_col]}) không khớp với dò tay ({manual_end})!"
            )


def test_ladder_generator_winning_column_relationship():
    """Cột thắng trên đỉnh phải dẫn tới đúng ô trúng thưởng ở đáy."""
    for s in range(10):
        res = LadderGenerator.generate(n_columns=4, seed=s)
        assert res.connections[res.winning_top_column] == res.winning_bottom_column
        assert res.inverse_connections[res.winning_bottom_column] == res.winning_top_column


def test_ladder_generator_paths_continuity():
    """Đường đi trong paths từ (col, 0) đến (dest, height + 1) phải liên tục theo từng bước."""
    res = LadderGenerator.generate(n_columns=3, seed=42)
    for col, path in res.paths.items():
        assert path[0] == (col, 0)
        assert path[-1] == (res.connections[col], res.height + 1)
        for i in range(len(path) - 1):
            p1 = path[i]
            p2 = path[i + 1]
            # Mỗi bước chỉ di chuyển dọc 1 bước hoặc ngang 1 cột
            col_diff = abs(p1[0] - p2[0])
            height_diff = abs(p1[1] - p2[1])
            assert (col_diff <= 1 and height_diff <= 1), f"Đường đi nhảy cóc giữa {p1} và {p2}"


def test_ladder_generator_minimum_columns_error():
    """Ném lỗi khi n_columns < 2."""
    with pytest.raises(ValueError, match="ít nhất 2 cột"):
        LadderGenerator.generate(n_columns=1)
