#!/usr/bin/env python3
"""Smoke test script for Di Dau deployment verification.

Usage:
    poetry run python scripts/smoke_test.py <BACKEND_URL> <FRONTEND_URL>
    or:
    python3 scripts/smoke_test.py <BACKEND_URL> <FRONTEND_URL>
"""

import asyncio
import json
import sys
import time
from datetime import date
import httpx
import websockets


async def main():
    if len(sys.argv) < 3:
        print("Usage: python smoke_test.py <BACKEND_URL> <FRONTEND_URL>")
        sys.exit(1)

    backend_url = sys.argv[1].rstrip("/")
    frontend_url = sys.argv[2].rstrip("/")
    ws_base = backend_url.replace("https://", "wss://").replace("http://", "ws://")

    print("==================================================")
    print("SMOKE TEST: DI DAU PRODUCTION DEPLOYMENT")
    print(f"Backend:  {backend_url}")
    print(f"Frontend: {frontend_url}")
    print(f"WS Base:  {ws_base}")
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
        print("[PASS] Member B joined successfully")

        join_c = await client.post(
            f"{backend_url}/api/v1/rooms/join",
            json={"room_code": room_code, "nickname": "Member C"},
        )
        if join_c.status_code != 200:
            print(f"[FAIL] Member C join failed: {join_c.status_code} {join_c.text}")
            sys.exit(1)
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

    print("\n==================================================")
    print("ALL SMOKE TESTS PASSED SUCCESSFULLY!")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(main())
