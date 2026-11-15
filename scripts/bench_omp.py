#!/usr/bin/env python3
"""Đo OMP trên 20 case của Sơn (T-97): DP vs thử hết, và Ψ (OMP) vs MinSum vs MinMax. In bảng Markdown.

Dùng (cần backend + venv của nó; không mạng, không DB):
    cd backend && poetry run python ../scripts/bench_omp.py [--repeat 5] [--k 1.0] [--lam 0.5]

Cột "thời gian" = nhanh nhất trong --repeat lượt (như số đo T-94 ở docs/phase7/PROGRESS.md).
MinSum / MinMax chọn tổ hợp có tổng km nhỏ nhất / km của người đi xa nhất nhỏ nhất (cùng DP theo lớp: với cặp (s₁, s_K)
cố định, đoạn giữa ngắn nhất luôn tối ưu cho cả hai). Hoà → tổ hợp đầu tiên theo thứ tự duyệt.
"""

import argparse
import json
import sys
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from app.core import algo_config as cfg  # noqa: E402
from app.domain.algorithms.ordered_median import (  # noqa: E402
    combination_count,
    evaluate,
    solve_brute,
    solve_dp,
)

CASES = json.loads((BACKEND / "tests" / "fixtures" / "hangout_20_cases.json").read_text())


def problem(case: dict):
    m = case["dist_matrix"]
    members = [v["index"] for v in case["vertices"] if v["role"] == "person"]
    stages = [
        [v["index"] for v in case["vertices"] if v["role"] != "person" and v["stage"] == t]
        for t in range(1, case["num_stages"] + 1)
    ]
    return members, stages, lambda a, b: m[a][b]


def solve_simple(members, stages, dist, objective: str):
    """MinSum | MinMax bằng DP theo lớp (đoạn giữa ngắn nhất cho mỗi cặp đầu–cuối)."""
    best, best_val = None, float("inf")
    for i1, s1 in enumerate(stages[0]):
        chain = {i1: (0.0, (s1,))}
        for t in range(1, len(stages)):
            nxt = {}
            for v in stages[t]:
                nxt[v] = min(
                    ((du + dist(path[-1], v), (*path, v)) for du, path in chain.values()),
                    key=lambda x: x[0],
                )
            chain = {i: x for i, x in enumerate(nxt.values())}
        for middle, path in chain.values():
            ds = [dist(m, path[0]) + middle + dist(path[-1], m) for m in members]
            val = sum(ds) if objective == "sum" else max(ds)
            if val < best_val - 1e-9:
                best, best_val = path, val
    return best


def best_time(fn, repeat: int) -> tuple[object, float]:
    out, best = None, float("inf")
    for _ in range(repeat):
        t0 = time.perf_counter()
        out = fn()
        best = min(best, time.perf_counter() - t0)
    return out, best * 1000


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repeat", type=int, default=5)
    ap.add_argument("--k", type=float, default=cfg.OMP_K)
    ap.add_argument("--lam", type=float, default=cfg.OMP_LAMBDA)
    a = ap.parse_args()

    print(f"λ = {a.lam}, k = {a.k}; thời gian = nhanh nhất {a.repeat} lượt (ms)\n")
    print("| Case | N | K | Tổ hợp | Ψ | DP (ms) | Thử hết (ms) | DP vs thử hết |")
    print("| :-: | :-: | :-: | --: | --: | --: | --: | :-: |")
    rows, mism = [], 0
    for c in CASES:
        members, stages, dist = problem(c)
        n_combo = combination_count(stages)
        dp, t_dp = best_time(lambda: solve_dp(members, stages, dist, lam=a.lam, k=a.k), a.repeat)
        if n_combo <= cfg.OMP_BRUTE_LIMIT:
            bf, t_bf = best_time(lambda: solve_brute(members, stages, dist, lam=a.lam, k=a.k), a.repeat)
            same = dp.combo == bf.combo and abs(dp.psi - bf.psi) < 1e-9
            mism += 0 if same else 1
            bf_txt, ok = f"{t_bf:.1f}", "khớp" if same else "**LỆCH**"
        else:
            bf_txt, ok = "—", "—"
        n_txt = f"{n_combo:,}".replace(",", " ") if n_combo < 10**6 else f"{n_combo:.2e}"
        print(f"| {c['case_id']} | {len(members)} | {c['num_stages']} | {n_txt} | {dp.psi:.3f} | {t_dp:.2f} | {bf_txt} | {ok} |")
        rows.append((c, members, stages, dist, dp))

    print("\n| Case | OMP: tổng / xa nhất (km) | MinSum: tổng / xa nhất | MinMax: tổng / xa nhất | OMP = MinSum? | Xa nhất bớt so MinSum | Tổng thêm so MinSum |")
    print("| :-: | :-: | :-: | :-: | :-: | --: | --: |")
    differ, saved, extra = 0, [], []
    for c, members, stages, dist, dp in rows:
        ev_sum = evaluate(members, solve_simple(members, stages, dist, "sum"), dist, lam=a.lam, k=a.k)
        ev_max = evaluate(members, solve_simple(members, stages, dist, "max"), dist, lam=a.lam, k=a.k)
        same = dp.combo == ev_sum.combo
        d_max, d_tot = ev_sum.max_km - dp.max_km, dp.total_km - ev_sum.total_km
        if not same:
            differ += 1
            saved.append(d_max)
            extra.append(d_tot)
        print(
            f"| {c['case_id']} | {dp.total_km:.1f} / {dp.max_km:.1f} | {ev_sum.total_km:.1f} / {ev_sum.max_km:.1f} "
            f"| {ev_max.total_km:.1f} / {ev_max.max_km:.1f} | {'có' if same else 'KHÁC'} | {d_max:+.2f} | {d_tot:+.2f} |"
        )
    print(f"\nDP lệch thử hết: {mism}/{sum(1 for c in CASES if combination_count(problem(c)[1]) <= cfg.OMP_BRUTE_LIMIT)} case")
    print(f"OMP khác MinSum: {differ}/{len(CASES)} case", end="")
    if differ:
        print(f"; khi khác: người xa nhất bớt TB {sum(saved)/differ:.2f} km, tổng nhóm thêm TB {sum(extra)/differ:.2f} km")
    else:
        print()
    sys.exit(1 if mism else 0)


if __name__ == "__main__":
    main()
