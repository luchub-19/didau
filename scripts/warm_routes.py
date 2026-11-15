#!/usr/bin/env python3
"""Làm ấm cache km của một phòng (T-97) — chỉ gọi API, không ghi tay vào DB.

Dùng:
    python3 scripts/warm_routes.py <BACKEND_URL> <MÃ_PHÒNG> <TOKEN_HOST> [--rounds 8] [--wait 2]

Cách làm: `GET /rooms/{id}/routes/me?place_id=` (token của chính người đó) và `GET /schedule/routes` đều
"hẹn làm ấm" khi thấy ô ước lượng (docs/phase7/PROGRESS.md, T-95). Script chỉ cần gọi lặp tới khi mọi đường
của host tới mọi quán có toạ độ đều `source=VALHALLA` và có `shape`. Chỉ đọc đường CỦA HOST (token host);
muốn làm ấm đường của thành viên khác, đưa thêm `--token <TOKEN>` (lặp được) — mỗi người chỉ thấy đường của mình.

Thoát 0 khi mọi đường đã ấm, 1 nếu còn ô ước lượng (Valhalla tắt / lỗi) — khi đó demo vẫn chạy bằng ước lượng.
"""

import argparse
import sys
import time

import httpx


def warm_room(
    client: httpx.Client,
    base: str,
    room_id: str,
    tokens: list[str],
    rounds: int = 8,
    wait_s: float = 2.0,
) -> tuple[int, int]:
    """Gọi lặp tới khi hết ô ước lượng. Trả (số đường đã ấm, số đường còn ước lượng)."""
    api = f"{base}/api/v1"
    h0 = {"X-Member-Token": tokens[0]}
    places = client.get(f"{api}/rooms/{room_id}/places", headers=h0).json()
    place_ids = [p["id"] for p in places if p.get("latitude") is not None and p.get("status") != "REJECTED"]
    warm = cold = 0
    for r in range(1, rounds + 1):
        warm = cold = 0
        for tok in tokens:
            for pid in place_ids:
                resp = client.get(
                    f"{api}/rooms/{room_id}/routes/me",
                    params={"place_id": pid},
                    headers={"X-Member-Token": tok},
                )
                if resp.status_code != 200:  # NO_ORIGIN: người này chưa chia sẻ vị trí
                    continue
                for leg in (resp.json()["to_place"], resp.json()["to_home"]):
                    if leg["source"] == "VALHALLA" and leg.get("shape"):
                        warm += 1
                    else:
                        cold += 1
        sched = client.get(f"{api}/rooms/{room_id}/schedule/routes", headers=h0)
        if sched.status_code == 200:
            for leg in sched.json()["legs"]:
                if leg["source"] == "VALHALLA" and leg.get("shape"):
                    warm += 1
                else:
                    cold += 1
        print(f"  vòng {r}: ấm {warm}, còn ước lượng {cold}")
        if cold == 0:
            break
        time.sleep(wait_s)
    return warm, cold


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("backend_url")
    ap.add_argument("room_code")
    ap.add_argument("host_token")
    ap.add_argument("--token", action="append", default=[], help="token thành viên khác (làm ấm đường của họ)")
    ap.add_argument("--rounds", type=int, default=8)
    ap.add_argument("--wait", type=float, default=2.0)
    a = ap.parse_args()
    base = a.backend_url.rstrip("/")
    with httpx.Client(timeout=30.0) as client:
        me = client.get(f"{base}/api/v1/members/me", headers={"X-Member-Token": a.host_token})
        if me.status_code != 200:
            sys.exit(f"[FAIL] token host không hợp lệ: {me.status_code} {me.text}")
        room_id = me.json()["room_id"]
        print(f"Làm ấm phòng {a.room_code} ({room_id}) tại {base}")
        warm, cold = warm_room(client, base, room_id, [a.host_token, *a.token], a.rounds, a.wait)
    print(f"Kết quả: {warm} đường ấm, {cold} còn ước lượng")
    sys.exit(0 if cold == 0 else 1)


if __name__ == "__main__":
    main()
