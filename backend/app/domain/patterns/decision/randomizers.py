import random
from collections.abc import Sequence
from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field

T = TypeVar("T")


class WheelResult(BaseModel, Generic[T]):
    """Kết quả quay vòng quay chọn hộ (CR-02 và CONTRACTS.md)."""

    winner: Any
    winner_index: int
    stop_angle_deg: float
    seed: int
    candidate_place_ids: list[UUID | str] = Field(default_factory=list)
    result_payload: dict[str, Any] = Field(default_factory=dict)


def _extract_id(obj: Any) -> UUID | str:
    if isinstance(obj, UUID):
        return obj
    if isinstance(obj, dict):
        val = obj.get("id") or obj.get("place_id")
        return UUID(str(val)) if val else str(obj)
    val = getattr(obj, "id", None) or getattr(obj, "place_id", None)
    if val:
        try:
            return UUID(str(val))
        except (ValueError, TypeError):
            return str(val)
    return str(obj)


class WheelPicker:
    """Bộ chọn ngẫu nhiên bằng Vòng quay may mắn (Deterministic theo seed)."""

    @classmethod
    def pick(
        cls,
        candidates: Sequence[T],
        weights: Sequence[float] | None = None,
        seed: int = 0,
    ) -> WheelResult[T]:
        """Chọn một ứng viên từ danh sách candidates theo seed và trọng số.

        Args:
            candidates: Danh sách ứng viên (địa điểm, id, tên...).
            weights: Danh sách trọng số (nếu có). None = phân phối đều.
            seed: Seed số nguyên ngẫu nhiên (từ server).

        Returns:
            WheelResult gồm người thắng, vị trí, góc dừng stop_angle_deg và payload.
        """
        if not candidates:
            raise ValueError("Danh sách candidates không được rỗng.")

        n = len(candidates)
        rng = random.Random(seed)

        # 1. Xác định trọng số
        if weights is None:
            norm_weights = [1.0] * n
        else:
            if len(weights) != n:
                raise ValueError("Độ dài weights phải bằng độ dài candidates.")
            norm_weights = [max(0.0, float(w)) for w in weights]
            if sum(norm_weights) <= 0:
                norm_weights = [1.0] * n

        total_weight = sum(norm_weights)

        # 2. Chọn winner theo seed
        val = rng.random() * total_weight
        cum = 0.0
        winner_idx = 0
        for i, w in enumerate(norm_weights):
            cum += w
            if val < cum or i == n - 1:
                winner_idx = i
                break

        # 3. Tính góc dừng (stop_angle_deg)
        # Giả định vòng tròn 360 độ, mỗi ô chiếm tỷ lệ theo weight
        # Kim chỉ nằm ở đỉnh (0 độ / 360 độ).
        cum_angles: list[float] = [0.0]
        cur = 0.0
        for w in norm_weights:
            cur += (w / total_weight) * 360.0
            cum_angles.append(cur)

        start_angle = cum_angles[winner_idx]
        end_angle = cum_angles[winner_idx + 1]
        slice_width = end_angle - start_angle

        # Tạo góc dừng nằm trong khoảng [20%, 80%] của lát cắt để không chạm vạch chia
        jitter = 0.2 + 0.6 * rng.random()
        slice_target_angle = start_angle + jitter * slice_width

        # Quay 4 vòng đầy đủ (4 * 360 = 1440) + bù góc để ô trúng nằm ngay kim đỉnh
        rotations = 4 * 360.0
        stop_offset = (360.0 - slice_target_angle) % 360.0
        stop_angle_deg = round(rotations + stop_offset, 1)

        candidate_ids = [_extract_id(c) for c in candidates]
        winner = candidates[winner_idx]

        payload = {
            "stop_angle_deg": stop_angle_deg,
            "winner_index": winner_idx,
            "seed": seed,
        }

        return WheelResult(
            winner=winner,
            winner_index=winner_idx,
            stop_angle_deg=stop_angle_deg,
            seed=seed,
            candidate_place_ids=candidate_ids,
            result_payload=payload,
        )


class LadderRung(BaseModel):
    """Bậc thang ngang nối cột c và c + 1 tại độ cao height (Plan 4.3)."""

    column: int
    height: int


class LadderResult(BaseModel):
    """Cấu trúc thang may mắn và kết quả phân định (Plan 4.3)."""

    n_columns: int
    height: int
    rungs: list[LadderRung]
    winning_top_column: int
    winning_bottom_column: int
    connections: dict[int, int]
    inverse_connections: dict[int, int]
    paths: dict[int, list[tuple[int, int]]]
    seed: int


class LadderGenerator:
    """Sinh và giải thang may mắn Amidakuji (사다리타기) theo seed."""

    @classmethod
    def generate(
        cls,
        n_columns: int,
        seed: int = 0,
        height: int | None = None,
    ) -> LadderResult:
        """Sinh cấu trúc thang may mắn gồm các bậc ngang và kết quả đi đường.

        Args:
            n_columns: Số lượng cột dọc (số ứng viên, >= 2).
            seed: Seed số nguyên ngẫu nhiên.
            height: Số tầng bậc ngang (mặc định max(8, n_columns * 3)).

        Returns:
            LadderResult gồm rungs, winning columns, connections và paths.
        """
        if n_columns < 2:
            raise ValueError("Thang may mắn cần ít nhất 2 cột.")

        h_levels = height if height is not None else max(8, n_columns * 3)
        rng = random.Random(seed)

        # 1. Sinh các bậc ngang không bị trùng lặp liền kề ở cùng một độ cao
        rungs: list[LadderRung] = []
        for h in range(1, h_levels + 1):
            c = 0
            while c < n_columns - 1:
                if rng.random() < 0.5:
                    rungs.append(LadderRung(column=c, height=h))
                    # Tránh đặt 2 bậc ngang kề nhau (c và c+1) ở cùng độ cao
                    c += 2
                else:
                    c += 1

        # Nếu không có bậc nào, thêm tối thiểu 1 bậc ở tầng 1
        if not rungs:
            rungs.append(LadderRung(column=0, height=1))

        # 2. Lập bản đồ bậc ngang theo tầng để tra cứu nhanh: height -> {col: col+1}
        rung_map_forward: dict[int, dict[int, int]] = {}
        rung_map_backward: dict[int, dict[int, int]] = {}
        for r in rungs:
            if r.height not in rung_map_forward:
                rung_map_forward[r.height] = {}
                rung_map_backward[r.height] = {}
            rung_map_forward[r.height][r.column] = r.column + 1
            rung_map_backward[r.height][r.column + 1] = r.column

        # 3. Đi đường cho từng cột từ đỉnh xuống đáy
        connections: dict[int, int] = {}
        inverse_connections: dict[int, int] = {}
        paths: dict[int, list[tuple[int, int]]] = {}

        for start_col in range(n_columns):
            curr_col = start_col
            path: list[tuple[int, int]] = [(curr_col, 0)]

            for h in range(1, h_levels + 1):
                fwd = rung_map_forward.get(h, {})
                bwd = rung_map_backward.get(h, {})

                if curr_col in fwd:
                    path.append((curr_col, h))
                    curr_col = fwd[curr_col]
                    path.append((curr_col, h))
                elif curr_col in bwd:
                    path.append((curr_col, h))
                    curr_col = bwd[curr_col]
                    path.append((curr_col, h))
                else:
                    path.append((curr_col, h))

            path.append((curr_col, h_levels + 1))
            connections[start_col] = curr_col
            inverse_connections[curr_col] = start_col
            paths[start_col] = path

        # 4. Xác định ô trúng thưởng dưới đáy và tìm cột thắng trên đỉnh
        # Seed quyết định ô trúng thưởng ở đáy (0 .. n_columns - 1)
        winning_bottom = rng.randint(0, n_columns - 1)
        winning_top = inverse_connections[winning_bottom]

        return LadderResult(
            n_columns=n_columns,
            height=h_levels,
            rungs=rungs,
            winning_top_column=winning_top,
            winning_bottom_column=winning_bottom,
            connections=connections,
            inverse_connections=inverse_connections,
            paths=paths,
            seed=seed,
        )

    @classmethod
    def trace_endpoint(
        cls,
        rungs: Sequence[LadderRung],
        n_columns: int,
        start_col: int,
    ) -> int:
        """Dò đường thủ công từ đỉnh xuống đáy theo các bậc ngang."""
        curr_col = start_col
        # Sắp xếp theo height tăng dần
        sorted_rungs = sorted(rungs, key=lambda r: r.height)
        by_height: dict[int, list[LadderRung]] = {}
        for r in sorted_rungs:
            by_height.setdefault(r.height, []).append(r)

        for h in sorted(by_height.keys()):
            for r in by_height[h]:
                if curr_col == r.column:
                    curr_col = r.column + 1
                    break
                elif curr_col == r.column + 1:
                    curr_col = r.column
                    break

        return curr_col
