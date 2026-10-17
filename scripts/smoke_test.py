#!/usr/bin/env python3
"""Smoke test script for Di Dau deployment verification.

Usage:
    python3 scripts/smoke_test.py <BACKEND_URL> <FRONTEND_URL> [osm|google]

Tham số thứ 3 là chế độ PLACES_PROVIDER mà backend đang chạy (mặc định osm); script dùng nó để
kiểm tra /pois/google-match: osm phải trả DISABLED, google thì không được trả DISABLED.
Phần Giai đoạn 2 (bước 8-13) kiểm tra: thêm quán OSM, hòa phiếu, Chọn hộ bằng vòng quay (2 client
nhận cùng góc dừng), tự lên lịch + áp dụng không xung đột, review nội bộ.
"""

import asyncio
import json
import sys
import time
from datetime import date
import httpx
import websockets

# Hai quán có thật trong snapshot OSM Q.1 (cùng id với app/core/seed.py)
OSM_PLACES = [
    {
        "name": "Quán Bụi",
        "address": "39 Lý Tự Trọng, Quận 1",
        "latitude": 10.779185,
        "longitude": 106.702288,
        "category": "FOOD",
        "estimated_cost": 150000,
        "source": "OSM",
        "external_id": "osm:node/6235215186",
        "cuisine": "vietnamese",
        "opening_hours_raw": "Mo-Su 08:00-23:00",
        "coords_source": "OSM",
    },
    {
        "name": "Propaganda Saigon Bistro",
        "address": "21 Hàn Thuyên, Quận 1",
        "latitude": 10.778708,
        "longitude": 106.698088,
        "category": "FOOD",
        "estimated_cost": 170000,
        "source": "OSM",
        "external_id": "osm:node/4183849494",
        "cuisine": "sandwich",
        "opening_hours_raw": "Mo-Su 07:30-23:00",
        "coords_source": "OSM",
    },
]


async def settle() -> None:
    """Chờ backend commit xong. get_db commit SAU khi trả response nên request kế tiếp có thể
    đến trước COMMIT (ghi vào docs/PROGRESS.md, T-37)."""
    await asyncio.sleep(0.3)


def fail(msg: str) -> None:
    print(f"[FAIL] {msg}")
    sys.exit(1)


async def wait_for_event(ws, event_type: str, timeout: float = 5.0) -> dict:
    """Đọc WS tới khi gặp event_type, trả payload. Hết giờ thì thoát với [FAIL]."""
    deadline = time.time() + timeout
    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            fail(f"Không nhận được {event_type} trong {timeout}s")
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
        except asyncio.TimeoutError:
            fail(f"Không nhận được {event_type} trong {timeout}s")
        envelope = json.loads(raw)
        if envelope.get("type") == event_type:
            return envelope.get("payload", {})


async def phase2(client, backend_url, room_id, mode, ws_a, ws_b, token_a, token_b, token_c):
    base = f"{backend_url}/api/v1"
    host = {"X-Member-Token": token_a}
    member = {"X-Member-Token": token_b}

    # Step 8: thêm 2 quán OSM, 3 người cùng upvote -> hòa ở đầu bảng
    print("\n[Step 8] Adding 2 OSM places and tying the votes...")
    osm_ids = []
    for body in OSM_PLACES:
        r = await client.post(f"{base}/rooms/{room_id}/places", headers=host, json=body)
        if r.status_code != 201:
            fail(f"Add OSM place failed: {r.status_code} {r.text}")
        pid = r.json()["id"]
        if r.json().get("external_id") != body["external_id"]:
            fail(f"external_id bị mất khi lưu: {r.json()}")
        osm_ids.append(pid)
        await settle()
        for tok in (token_a, token_b, token_c):
            v = await client.post(
                f"{base}/rooms/{room_id}/places/{pid}/votes",
                headers={"X-Member-Token": tok},
                json={"vote_value": 1},
            )
            if v.status_code != 200:
                fail(f"Vote failed: {v.status_code} {v.text}")
            await settle()
    dup = await client.post(f"{base}/rooms/{room_id}/places", headers=host, json=OSM_PLACES[0])
    if dup.status_code != 409 or dup.json().get("error", {}).get("code") != "PLACE_ALREADY_ADDED":
        fail(f"Thêm trùng external_id phải trả 409 PLACE_ALREADY_ADDED, nhận {dup.status_code} {dup.text}")
    print("[PASS] 2 OSM places added, tie at 3 votes, duplicate -> 409 PLACE_ALREADY_ADDED")

    # Step 9: /pois (snapshot) và /pois/google-match theo chế độ
    print(f"\n[Step 9] POI snapshot and google-match in '{mode}' mode...")
    r = await client.get(
        f"{base}/pois", params={"bbox": "10.770,106.695,10.785,106.710", "limit": 50}
    )
    if r.status_code != 200 or not r.json():
        fail(f"/pois trả {r.status_code}, {len(r.json()) if r.status_code == 200 else 0} điểm")
    r = await client.post(
        f"{base}/pois/google-match",
        headers=host,
        json={"external_id": OSM_PLACES[0]["external_id"], "name": OSM_PLACES[0]["name"],
              "lat": OSM_PLACES[0]["latitude"], "lng": OSM_PLACES[0]["longitude"]},
    )
    if r.status_code != 200:
        fail(f"google-match trả {r.status_code}: {r.text}")
    reason = r.json().get("reason")
    if mode == "osm" and reason != "DISABLED":
        fail(f"Chế độ osm phải trả DISABLED, nhận {reason}")
    if mode == "google" and reason == "DISABLED":
        fail("Chế độ google nhưng backend trả DISABLED: kiểm tra PLACES_PROVIDER=google")
    print(f"[PASS] /pois OK, google-match reason={reason}")

    # Step 10: hints có TIE_AT_TOP
    print("\n[Step 10] Decision hints...")
    r = await client.get(f"{base}/rooms/{room_id}/decisions/hints", headers=member)
    if r.status_code != 200:
        fail(f"hints trả {r.status_code}: {r.text}")
    types = [h["type"] for h in r.json()["hints"]]
    if "TIE_AT_TOP" not in types:
        fail(f"Cần hint TIE_AT_TOP, nhận {types}")
    print(f"[PASS] hints={types}, smart_picks={len(r.json()['smart_picks'])}")

    # Step 11: Chọn hộ bằng vòng quay, 2 client nhận cùng góc dừng
    print("\n[Step 11] Wheel decision: both clients must stop at the same angle...")
    r = await client.post(
        f"{base}/rooms/{room_id}/decisions", headers=host,
        json={"mode": "WHEEL", "candidate_place_ids": osm_ids},
    )
    if r.status_code != 201:
        fail(f"Create decision failed: {r.status_code} {r.text}")
    session_id = r.json()["session"]["id"]
    got_a = await wait_for_event(ws_a, "DECISION_STARTED")
    got_b = await wait_for_event(ws_b, "DECISION_STARTED")
    angle_a = (got_a.get("result_payload") or {}).get("stop_angle_deg")
    angle_b = (got_b.get("result_payload") or {}).get("stop_angle_deg")
    if angle_a is None or angle_a != angle_b or got_a["result_place_id"] != got_b["result_place_id"]:
        fail(f"Hai client lệch kết quả: {got_a} vs {got_b}")
    if got_a["result_place_id"] not in osm_ids:
        fail("Người thắng không nằm trong danh sách ứng viên")
    r = await client.post(f"{base}/rooms/{room_id}/decisions/{session_id}/accept", headers=host)
    if r.status_code != 200:
        fail(f"Accept decision failed: {r.status_code} {r.text}")
    await settle()
    print(f"[PASS] Cả 2 client dừng ở {angle_a}° -> {got_a['result_place_id']}, Host đã chốt")

    # Step 12: tự lên lịch -> áp dụng -> không xung đột
    print("\n[Step 12] Auto-plan preview + apply, expect no conflicts...")
    r = await client.post(f"{base}/rooms/{room_id}/schedule/auto-plan", headers=member, json={})
    if r.status_code != 200:
        fail(f"auto-plan preview failed: {r.status_code} {r.text}")
    plan = r.json()
    if not plan["slots"]:
        fail(f"Lịch nháp rỗng: dropped={plan['dropped']}")
    r = await client.post(
        f"{base}/rooms/{room_id}/schedule/auto-plan/apply", headers=member,
        json={"plan_hash": plan["plan_hash"], "slots": plan["slots"]},
    )
    if r.status_code != 403:
        fail(f"Member áp dụng lịch phải bị 403, nhận {r.status_code}")
    r = await client.post(
        f"{base}/rooms/{room_id}/schedule/auto-plan/apply", headers=host,
        json={"plan_hash": plan["plan_hash"], "slots": plan["slots"]},
    )
    if r.status_code != 200:
        fail(f"auto-plan apply failed: {r.status_code} {r.text}")
    await settle()
    r = await client.post(f"{base}/rooms/{room_id}/conflicts/evaluate", headers=host)
    if r.status_code != 200:
        fail(f"evaluate conflicts failed: {r.status_code} {r.text}")
    bad = [c for c in r.json() if c.get("level") in ("CRITICAL", "ERROR")]
    if bad:
        fail(f"Lịch tự sinh có xung đột nặng: {bad}")
    print(f"[PASS] {len(plan['slots'])} slot được áp dụng, {len(r.json())} cảnh báo, 0 xung đột nặng")

    # Step 13: review nội bộ
    print("\n[Step 13] Internal review...")
    key = OSM_PLACES[0]["external_id"]
    r = await client.put(
        f"{base}/reviews", headers=member,
        json={"external_key": key, "rating": 5, "comment": "Ngon, đáng quay lại", "tags": []},
    )
    if r.status_code != 200:
        fail(f"PUT review failed: {r.status_code} {r.text}")
    r = await client.get(f"{base}/reviews", params={"external_key": key})
    if r.status_code != 200 or r.json()["count"] < 1:
        fail(f"GET review failed: {r.status_code} {r.text}")
    print(f"[PASS] review avg={r.json()['avg']} count={r.json()['count']}")


async def main():
    if len(sys.argv) < 3:
        print("Usage: python smoke_test.py <BACKEND_URL> <FRONTEND_URL>")
        sys.exit(1)

    backend_url = sys.argv[1].rstrip("/")
    frontend_url = sys.argv[2].rstrip("/")
    mode = sys.argv[3].lower() if len(sys.argv) > 3 else "osm"
    if mode not in ("osm", "google"):
        print("Chế độ phải là osm hoặc google")
        sys.exit(1)
    ws_base = backend_url.replace("https://", "wss://").replace("http://", "ws://")

    print("==================================================")
    print("SMOKE TEST: DI DAU PRODUCTION DEPLOYMENT")
    print(f"Backend:  {backend_url}")
    print(f"Frontend: {frontend_url}")
    print(f"WS Base:  {ws_base}")
    print(f"Provider: {mode}")
    print("==================================================")

    async with httpx.AsyncClient(timeout=20.0) as client:
        # Step 1: Healthcheck
        print("\n[Step 1] Checking /healthz...")
        resp = await client.get(f"{backend_url}/healthz")
        if resp.status_code != 200 or resp.json().get("status") != "ok":
            print(f"[FAIL] /healthz returned status {resp.status_code}: {resp.text}")
            sys.exit(1)
        print(f"[PASS] /healthz OK: {resp.json()}")

        # Step 2: Create room
        print("\n[Step 2] Creating room (Member A as host)...")
        create_payload = {
            "title": f"Smoke Test Outing {int(time.time())}",
            "event_date": str(date.today()),
            "creator_nickname": "Member A (Host)",
            "city": "HCM",
            "origin_lat": 10.7769,
            "origin_lng": 106.7009,
            "start_minute": 1020,
            "end_minute": 1380,
        }
        resp = await client.post(f"{backend_url}/api/v1/rooms", json=create_payload)
        if resp.status_code != 201:
            print(f"[FAIL] Create room failed: {resp.status_code} {resp.text}")
            sys.exit(1)
        room_data = resp.json()
        room_id = room_data["room"]["id"]
        room_code = room_data["room"]["code"]
        token_a = room_data["member_token"]
        print(f"[PASS] Room created: id={room_id}, code={room_code}")
        await settle()

        # Step 3: 2 members join (Member B and Member C)
        print("\n[Step 3] Joining members (Member B and Member C)...")
        join_b = await client.post(
            f"{backend_url}/api/v1/rooms/join",
            json={"room_code": room_code, "nickname": "Member B"},
        )
        if join_b.status_code != 200:
            print(f"[FAIL] Member B join failed: {join_b.status_code} {join_b.text}")
            sys.exit(1)
        token_b = join_b.json()["member_token"]
        await settle()
        print("[PASS] Member B joined successfully")

        join_c = await client.post(
            f"{backend_url}/api/v1/rooms/join",
            json={"room_code": room_code, "nickname": "Member C"},
        )
        if join_c.status_code != 200:
            print(f"[FAIL] Member C join failed: {join_c.status_code} {join_c.text}")
            sys.exit(1)
        token_c = join_c.json()["member_token"]
        await settle()
        print("[PASS] Member C joined successfully")

        # Step 4: Add a place for voting test
        print("\n[Step 4] Adding place for voting test...")
        place_resp = await client.post(
            f"{backend_url}/api/v1/rooms/{room_id}/places",
            headers={"X-Member-Token": token_a},
            json={
                "name": "Smoke Test Coffee Shop",
                "category": "DRINK",
                "address": "123 Test Street",
            },
        )
        if place_resp.status_code != 201:
            print(f"[FAIL] Add place failed: {place_resp.status_code} {place_resp.text}")
            sys.exit(1)
        place_id = place_resp.json()["id"]
        await settle()
        print(f"[PASS] Place added: id={place_id}")

        # Step 5: Open 2 WebSockets (Origin = frontend_url)
        print("\n[Step 5] Connecting 2 WebSockets with Origin header...")
        ws_url_a = f"{ws_base}/ws/rooms/{room_id}?token={token_a}"
        ws_url_b = f"{ws_base}/ws/rooms/{room_id}?token={token_b}"
        headers = {"Origin": frontend_url}

        async with websockets.connect(
            ws_url_a, additional_headers=headers
        ) as ws_a, websockets.connect(
            ws_url_b, additional_headers=headers
        ) as ws_b:
            print("[PASS] Both WebSockets connected with valid Origin header")

            # Step 6: Member A chats, Member B receives within 3 seconds
            print("\n[Step 6] Testing Chat broadcast from A to B within 3s...")
            chat_text = f"Hello from Member A at {int(time.time())}"
            chat_msg = {
                "type": "CHAT_MESSAGE",
                "payload": {"message": chat_text},
                "ts": int(time.time() * 1000),
            }
            start_chat_time = time.time()
            await ws_a.send(json.dumps(chat_msg))

            received_chat = False
            while time.time() - start_chat_time < 3.0:
                try:
                    remaining = 3.0 - (time.time() - start_chat_time)
                    if remaining <= 0:
                        break
                    raw_msg = await asyncio.wait_for(ws_b.recv(), timeout=remaining)
                    envelope = json.loads(raw_msg)
                    msg_type = envelope.get("type")
                    payload = envelope.get("payload", {})
                    if msg_type == "CHAT_MESSAGE" and payload.get("message") == chat_text:
                        elapsed = time.time() - start_chat_time
                        print(f"[PASS] Member B received chat in {elapsed:.2f}s: \"{chat_text}\"")
                        received_chat = True
                        break
                except asyncio.TimeoutError:
                    break

            if not received_chat:
                print("[FAIL] Member B did not receive chat message within 3.0 seconds!")
                sys.exit(1)

            # Step 7: Member A votes, Member B receives vote event
            print("\n[Step 7] Testing Vote event broadcast from A to B...")
            vote_resp = await client.post(
                f"{backend_url}/api/v1/rooms/{room_id}/places/{place_id}/votes",
                headers={"X-Member-Token": token_a},
                json={"vote_value": 1},
            )
            if vote_resp.status_code != 200:
                print(f"[FAIL] Cast vote failed: {vote_resp.status_code} {vote_resp.text}")
                sys.exit(1)

            received_vote = False
            start_vote_time = time.time()
            while time.time() - start_vote_time < 5.0:
                try:
                    remaining = 5.0 - (time.time() - start_vote_time)
                    if remaining <= 0:
                        break
                    raw_msg = await asyncio.wait_for(ws_b.recv(), timeout=remaining)
                    envelope = json.loads(raw_msg)
                    msg_type = envelope.get("type")
                    payload = envelope.get("payload", {})
                    if msg_type in ("VOTE_UPDATED", "PLACE_VOTED") and str(payload.get("place_id")) == str(place_id):
                        elapsed = time.time() - start_vote_time
                        print(f"[PASS] Member B received vote event ({msg_type}) in {elapsed:.2f}s: {payload}")
                        received_vote = True
                        break
                except asyncio.TimeoutError:
                    break

            if not received_vote:
                print("[FAIL] Member B did not receive vote update event within 5.0 seconds!")
                sys.exit(1)

            await phase2(client, backend_url, room_id, mode, ws_a, ws_b, token_a, token_b, token_c)

    print("\n==================================================")
    print("ALL SMOKE TESTS PASSED SUCCESSFULLY!")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(main())
