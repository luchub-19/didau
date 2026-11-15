#!/usr/bin/env python3
"""Seed phòng demo OMP (T-97) — chỉ gọi API công khai, không ghi tay vào DB.

Dùng:
    python3 scripts/seed_demo_omp.py <BACKEND_URL> [--no-warm]

Dựng phòng "Demo OMP" (khung giờ mặc định 17:00–23:00):
  • 4 thành viên, MỖI NGƯỜI đã chia sẻ vị trí xuất phát ở một quận khác nhau (Q1 / Bình Thạnh / Thủ Đức / Q7);
  • 3 quán ĂN cùng 3 điểm  → loại FOOD **hoà sẵn** (đây là bài OMP K = 1 để demo);
  • 2 quán UỐNG (1 quán thắng rõ), 2 quán GIẢI TRÍ (1 quán thắng rõ) → không hoà;
  • `--tie-live`: giữ lại 2 phiếu của Sơn (Quán Bụi, Lẩu Dê) để HOÀ XẢY RA TRỰC TIẾP lúc demo (Sơn bấm "Muốn đi" ở tab 2);
  • sau đó gọi `warm_routes.py` để cache km (Valhalla nếu bật, không thì để nguyên ước lượng).
In ra mã phòng + token từng người (dùng cho 2 tab realtime) và cách mở trang phòng.

Chạy lại = tạo phòng MỚI (mã khác); không xoá phòng cũ.
"""

import argparse
import sys
import time
from datetime import date, timedelta

import httpx

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from warm_routes import warm_room  # noqa: E402

# (nickname, vị trí xuất phát) — host đầu tiên. Tên khớp DEMO.md.
MEMBERS = [
    ("Bảo", "Quận 1 (Bến Thành)", 10.7725, 106.6980),
    ("Nam", "Bình Thạnh", 10.8106, 106.7091),
    ("Linh", "Thủ Đức", 10.8494, 106.7537),
    ("Sơn", "Quận 7 (Phú Mỹ Hưng)", 10.7290, 106.7180),
]

# (tên, địa chỉ, lat, lng, loại, người đề xuất, chỉ số người bỏ "Muốn đi")
PLACES = [
    # FOOD: 3 quán cùng 3 điểm → hoà sẵn
    ("Cơm Tấm Ba Ghiền", "84 Đặng Văn Ngữ, Phú Nhuận", 10.7932, 106.6743, "FOOD", 1, [0, 1, 2]),
    ("Quán Bụi", "39 Lý Tự Trọng, Quận 1", 10.779185, 106.702288, "FOOD", 0, [1, 2, 3]),
    ("Lẩu Dê 404", "436 Nguyễn Thị Thập, Quận 7", 10.7412, 106.7088, "FOOD", 3, [0, 2, 3]),
    # DRINK: Cà Phê Trứng 3T thắng rõ (3 vs 1)
    ("Cà Phê Trứng 3T", "1A Tôn Đức Thắng, Quận 1", 10.7769, 106.7058, "DRINK", 0, [0, 1, 3]),
    ("Trà Sữa Phê La", "125 Hồ Tùng Mậu, Quận 1", 10.7725, 106.7032, "DRINK", 2, [2]),
    # ENTERTAINMENT: CGV thắng rõ (2 vs 0)
    ("CGV Vincom Đồng Khởi", "72 Lê Thánh Tôn, Quận 1", 10.7781, 106.7018, "ENTERTAINMENT", 1, [0, 3]),
    ("Bowling Diamond Plaza", "34 Lê Duẩn, Quận 1", 10.7822, 106.6985, "ENTERTAINMENT", 3, []),
]


# Phiếu của Sơn (chỉ số 3) bị giữ lại khi --tie-live: thiếu 2 phiếu này thì Cơm Tấm Ba Ghiền (3 điểm) đứng đầu một mình.
LIVE_VOTES = {"Quán Bụi", "Lẩu Dê 404"}


def die(msg: str) -> None:
    sys.exit(f"[FAIL] {msg}")


def check(resp: httpx.Response, ok: tuple[int, ...], what: str) -> dict:
    if resp.status_code not in ok:
        die(f"{what}: {resp.status_code} {resp.text}")
    time.sleep(0.3)  # get_db commit SAU khi trả response (bẫy smoke_test T-37)
    return resp.json() if resp.content else {}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("backend_url")
    ap.add_argument("--tie-live", action="store_true", help="chưa hoà: Sơn bỏ 2 phiếu cuối ngay lúc demo")
    ap.add_argument("--no-warm", action="store_true", help="bỏ bước làm ấm cache km")
    a = ap.parse_args()
    base = a.backend_url.rstrip("/")
    api = f"{base}/api/v1"

    with httpx.Client(timeout=90.0) as c:  # Render ngủ ~1′: request đầu có thể chờ lâu
        r = c.get(f"{base}/healthz")
        if r.status_code != 200:
            die(f"/healthz trả {r.status_code}")

        host_name = MEMBERS[0][0]
        created = check(
            c.post(
                f"{api}/rooms",
                json={
                    "title": "Demo OMP — tối thứ Bảy",
                    "description": "Phòng demo thuật toán Ordered Median (giai đoạn 7)",
                    "event_date": str(date.today() + timedelta(days=3)),
                    "creator_nickname": host_name,
                    "city": "HCM",
                    "origin_lat": 10.7769,  # điểm hẹn host: Q1 (KHÔNG dùng thay vị trí thành viên — PLAN #9)
                    "origin_lng": 106.7009,
                    "start_minute": 1020,
                    "end_minute": 1380,
                    "max_places_per_member": 3,
                },
            ),
            (201,),
            "Tạo phòng",
        )
        room_id = created["room"]["id"]
        code = created["room"]["code"]
        tokens = [created["member_token"]]
        for nick, *_ in MEMBERS[1:]:
            j = check(c.post(f"{api}/rooms/join", json={"room_code": code, "nickname": nick}), (200,), f"{nick} vào phòng")
            tokens.append(j["member_token"])
        hdr = [{"X-Member-Token": t} for t in tokens]

        for i, (nick, area, lat, lng) in enumerate(MEMBERS):
            check(
                c.patch(f"{api}/rooms/{room_id}/members/me", headers=hdr[i], json={"origin_lat": lat, "origin_lng": lng}),
                (200,),
                f"{nick} chia sẻ vị trí",
            )

        place_ids: list[str] = []
        for name, addr, lat, lng, cat, by, ups in PLACES:
            p = check(
                c.post(
                    f"{api}/rooms/{room_id}/places",
                    headers=hdr[by],
                    json={"name": name, "address": addr, "latitude": lat, "longitude": lng, "category": cat,
                          "estimated_cost": 100000, "open_minute": 420, "close_minute": 1380},
                ),
                (201,),
                f"Thêm quán {name}",
            )
            place_ids.append(p["id"])
        for (name, *_rest, ups), pid in zip(PLACES, place_ids):
            for m in ups:
                if a.tie_live and name in LIVE_VOTES and m == 3:
                    continue
                check(
                    c.post(f"{api}/rooms/{room_id}/places/{pid}/votes", headers=hdr[m], json={"vote_value": 1}),
                    (200,),
                    f"{MEMBERS[m][0]} bỏ phiếu {name}",
                )

        # Kiểm: loại FOOD phải hoà, DRINK/ENTERTAINMENT thì không
        tie = check(c.get(f"{api}/rooms/{room_id}/tie-break/suggestion", headers=hdr[0]), (200,), "tie-break/suggestion")
        cats = [s["category"] for s in tie.get("suggestions", [])]
        if a.tie_live:
            if cats:
                die(f"--tie-live: chưa được hoà, nhận {cats}")
        elif cats != ["FOOD"]:
            die(f"Cần đúng 1 loại hoà (FOOD), nhận {cats} / available={tie.get('available')} reason={tie.get('reason')}")

        if not a.no_warm:
            print("Làm ấm cache km…")
            warm, cold = warm_room(c, base, room_id, tokens)
            print(f"  → {warm} đường ấm, {cold} còn ước lượng" + ("" if cold == 0 else " (Valhalla tắt? demo vẫn chạy bằng ước lượng)"))
            tie = c.get(f"{api}/rooms/{room_id}/tie-break/suggestion", headers=hdr[0]).json()

        if a.tie_live:
            print("\n[PASS] Phòng demo đã sẵn sàng (CHƯA hoà). Ở tab Sơn bấm 'Muốn đi' cho Quán Bụi và Lẩu Dê 404 → 3 quán hoà 3 điểm.")
            print(f"  Mã phòng : {code}   (room_id {room_id})")
            print("  Token (đừng dán lên chat công khai):")
            for (nick, area, *_), t in zip(MEMBERS, tokens):
                print(f"    {nick:<5} {'(host)' if nick == host_name else '      '} {area:<24} {t}")
            print(f"\n  Vào phòng: mở <FRONTEND>/rooms/{room_id}, Console: localStorage.setItem('didau_member_token', '<TOKEN>') rồi tải lại.")
            return
        s = tie["suggestions"][0]
        names = {p["id"]: p["name"] for p in c.get(f"{api}/rooms/{room_id}/places", headers=hdr[0]).json()}
        print("\n[PASS] Phòng demo đã sẵn sàng")
        print(f"  Mã phòng : {code}   (room_id {room_id})")
        print(f"  Nguồn km : {s['source']}   (estimated={s['estimated']})")
        print(f"  Đề xuất  : {names.get(s['recommended_place_id'], '?')}")
        for rk in s["ranking"]:
            print(f"    hạng {rk['rank']}: {names.get(rk['place_id'], '?'):<22} Ψ={rk['psi']:<9} xa nhất {rk['max_km']} km  tổng {rk['total_km']} km")
        print("  Token (đừng dán lên chat công khai):")
        for (nick, area, *_), t in zip(MEMBERS, tokens):
            print(f"    {nick:<5} {'(host)' if nick == host_name else '      '} {area:<24} {t}")
        print(f"\n  Vào phòng bằng thành viên đã seed (mỗi cửa sổ ẩn danh MỘT người): mở <FRONTEND>/rooms/{room_id}")
        print("  rồi ở Console của trình duyệt chạy (thay <TOKEN> bằng token ở trên) và tải lại trang:")
        print("    localStorage.setItem('didau_member_token', '<TOKEN>')")


if __name__ == "__main__":
    main()
