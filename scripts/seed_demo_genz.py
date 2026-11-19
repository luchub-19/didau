#!/usr/bin/env python3
"""Dựng phòng demo OMP với quán quen thuộc Gen Z — chỉ gọi API công khai, không ghi tay vào DB.

Dùng:
    python3 scripts/seed_demo_genz.py <BACKEND_URL> [--rooms 3] [--frontend URL] [--out FILE] [--no-warm]

Giống `seed_demo_omp.py --tie-live`, chỉ đổi bộ quán:
  • 4 thành viên đã chia sẻ vị trí ở 4 khu: Nobita (chủ phòng, Q1), Doraemon (Bình Thạnh), Xuka (Thủ Đức), Xeko (Q7);
  • ĂN: Haidilao Giga Mall / Pizza 4P's Thiso Mall Sala / Dookki SC VivoCity — CHƯA hoà (Haidilao dẫn 3–2–2); lúc demo
    Xeko bấm "Muốn đi" cho Pizza 4P's và Dookki → 3 quán cùng 3 điểm → OMP đề xuất Pizza 4P's Thiso, còn "cộng tổng
    km" sẽ chọn Haidilao Giga Mall (T-106, gđ8: dò bằng `find_demo_case.py --valhalla`, số đo ở docs/phase8/PROGRESS.md);
  • UỐNG: Katinat thắng rõ; GIẢI TRÍ: CGV Landmark 81 thắng rõ (không hoà).
Toạ độ lấy từ `frontend/public/data/places_hcm.geojson` (chi nhánh thật).
In mã phòng, link phòng và câu lệnh Console để vào bằng từng thành viên. Mỗi phòng là một phòng MỚI, không xoá phòng cũ.
"""

import argparse
import sys
from datetime import date, timedelta

import httpx

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from seed_demo_omp import check, die
from warm_routes import warm_room

# (nickname, vị trí xuất phát) — chủ phòng đầu tiên; toạ độ giống seed_demo_omp.py nên km/kết quả như cũ
MEMBERS = [
    ("Nobita", "Quận 1 (Bến Thành)", 10.7725, 106.6980),
    ("Doraemon", "Bình Thạnh", 10.8106, 106.7091),
    ("Xuka", "Thủ Đức", 10.8494, 106.7537),
    ("Xeko", "Quận 7 (Phú Mỹ Hưng)", 10.7290, 106.7180),
]

# (tên, địa chỉ, lat, lng, loại, người đề xuất, chỉ số người bỏ "Muốn đi")
PLACES = [
    # ĂN: đủ phiếu thì cả 3 cùng 3 điểm → hoà. Km Valhalla (T-106): Haidilao tổng nhỏ nhất (63,5 km) nhưng Xeko đi 74′;
    # Pizza 4P's tổng 68,2 km, người xa nhất 60′ → OMP chọn Pizza 4P's. Đổi quán thì chạy lại find_demo_case.py --valhalla.
    ("Haidilao Giga Mall", "Giga Mall, 240–242 Phạm Văn Đồng, Thủ Đức", 10.82777, 106.722, "FOOD", 1, [0, 1, 2]),
    ("Pizza 4P's Thiso Mall Sala", "Thiso Mall Sala, 10 Mai Chí Thọ, Thủ Thiêm", 10.77227, 106.72284, "FOOD", 0, [0, 1, 3]),
    ("Dookki SC VivoCity", "SC VivoCity, 1058 Nguyễn Văn Linh, Quận 7", 10.73017, 106.70325, "FOOD", 3, [1, 2, 3]),
    # UỐNG: Katinat thắng rõ (3 vs 1)
    ("Katinat Nguyễn Huệ", "Oscar, Nguyễn Huệ, Quận 1", 10.7748, 106.7033, "DRINK", 0, [0, 1, 3]),
    ("Phúc Long Landmark 81", "Vincom Landmark 81, Bình Thạnh", 10.7940, 106.7206, "DRINK", 2, [2]),
    # GIẢI TRÍ: CGV thắng rõ (2 vs 0)
    ("CGV Landmark 81", "Vincom Landmark 81, Bình Thạnh", 10.7953, 106.7218, "ENTERTAINMENT", 1, [0, 3]),
    ("Timezone Estella Place", "Estella Place, 88 Song Hành, Thủ Đức", 10.80193, 106.74848, "ENTERTAINMENT", 3, []),
]

# Phiếu của Xeko (chỉ số 3) để lại cho lúc demo
LIVE_VOTES = {"Pizza 4P's Thiso Mall Sala", "Dookki SC VivoCity"}
XEKO = 3


def seed_room(c: httpx.Client, base: str, n: int, warm: bool) -> tuple[str, str, list[str], str]:
    api = f"{base}/api/v1"
    created = check(
        c.post(
            f"{api}/rooms",
            json={
                "title": f"Tối thứ Bảy đi đâu? ({n})",
                "description": "Phòng demo Hangoutplanner",
                "event_date": str(date.today() + timedelta(days=3)),
                "creator_nickname": MEMBERS[0][0],
                "city": "HCM",
                "origin_lat": 10.7769,
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

    for i, (nick, _area, lat, lng) in enumerate(MEMBERS):
        check(
            c.patch(f"{api}/rooms/{room_id}/members/me", headers=hdr[i], json={"origin_lat": lat, "origin_lng": lng}),
            (200,),
            f"{nick} chia sẻ vị trí",
        )

    for name, addr, lat, lng, cat, by, ups in PLACES:
        p = check(
            c.post(
                f"{api}/rooms/{room_id}/places",
                headers=hdr[by],
                json={"name": name, "address": addr, "latitude": lat, "longitude": lng, "category": cat,
                      "estimated_cost": 150000, "open_minute": 600, "close_minute": 1380},
            ),
            (201,),
            f"Thêm quán {name}",
        )
        for m in ups:
            if name in LIVE_VOTES and m == XEKO:
                continue
            check(
                c.post(f"{api}/rooms/{room_id}/places/{p['id']}/votes", headers=hdr[m], json={"vote_value": 1}),
                (200,),
                f"{MEMBERS[m][0]} bỏ phiếu {name}",
            )

    tie = check(c.get(f"{api}/rooms/{room_id}/tie-break/suggestion", headers=hdr[0]), (200,), "tie-break/suggestion")
    if tie.get("suggestions"):
        die(f"Phòng {code}: chưa được hoà trước lúc demo, nhận {[s['category'] for s in tie['suggestions']]}")

    source = "chưa làm ấm"
    if warm:
        ok, cold = warm_room(c, base, room_id, tokens)
        source = f"{ok} đường Valhalla, {cold} còn ước lượng" + ("" if cold == 0 else " (Valhalla tắt?)")
    return room_id, code, tokens, source


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("backend_url")
    ap.add_argument("--rooms", type=int, default=1, help="số phòng cần dựng (vd 3: tập / diễn / dự phòng)")
    ap.add_argument("--frontend", default="https://didau-omega.vercel.app")
    ap.add_argument("--out", help="ghi thêm kết quả vào file này (có token — đừng commit)")
    ap.add_argument("--no-warm", action="store_true", help="bỏ bước làm ấm cache km")
    a = ap.parse_args()
    base = a.backend_url.rstrip("/")
    front = a.frontend.rstrip("/")

    lines: list[str] = []
    with httpx.Client(timeout=90.0) as c:  # Render ngủ ~1′
        if c.get(f"{base}/healthz").status_code != 200:
            die("/healthz không trả 200")
        for n in range(1, a.rooms + 1):
            room_id, code, tokens, source = seed_room(c, base, n, not a.no_warm)
            lines += [
                f"=== Phòng {n}: mã {code} — {source}",
                f"Link: {front}/rooms/{room_id}",
                "Mở link, bấm F12 > Console, dán đúng dòng của người cần vào rồi Enter:",
            ]
            for (nick, area, *_), t in zip(MEMBERS, tokens):
                role = "chủ phòng" if nick == MEMBERS[0][0] else area
                lines.append(f"  {nick} ({role}): localStorage.setItem('didau_member_token','{t}');location.reload()")
            lines.append("")
    lines.append("Lúc demo: cửa sổ Xeko bấm 'Muốn đi' cho Pizza 4P's Thiso Mall Sala và Dookki SC VivoCity → 3 quán Ăn hoà.")
    lines.append("Tập lại: Xeko bấm 'Bỏ Muốn đi' ở 2 quán đó là hết hoà. Đừng bấm Chốt ở phòng tập.")
    out = "\n".join(lines)
    print(out)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(out + "\n")
        print(f"\nĐã ghi vào {a.out}")


if __name__ == "__main__":
    main()
