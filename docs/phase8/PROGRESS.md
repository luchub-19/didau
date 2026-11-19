# Tiến độ giai đoạn 8 "Vì sao? cho buổi demo"

Mỗi ô ghi chú tối đa 6 gạch đầu dòng. Thứ tự, phụ thuộc, model: `PLAN.md` §6. Lý do thiết kế: `PLAN.md` §4–§5.
Hạn: buổi trình bày **thứ Hai 2026-11-23**.

## Cổng chờ người dùng
| Cổng | Sau task | Nội dung | Trạng thái |
| :--- | :--- | :--- | :--- |
| G1 | plan | Duyệt `PLAN.md`, **CR-19**, câu sửa PRODUCT.md (T-109) | QUA 2026-11-19 (CR-19 APPROVED) |
| G2 | T-109 | Tổng duyệt `DEMO.md` trên bản deploy, laptop + máy chiếu | CHỜ |

## Việc của người
Xem `PLAN.md` §7 (Valhalla, commit script chưa track, push deploy, độ phân giải laptop, slide công thức).

## Bảng task
| Task | Trạng thái | Session | Ghi chú |
| :--- | :---: | :---: | :--- |
| T-106 | DONE | f426bd70 | • **Ca mới (ĂN, nguồn = VALHALLA, λ=1 k=2, 56/56 đường ấm):** OMP đề xuất **Pizza 4P's Thiso Mall Sala** Ψ 2 291,6 · tổng 68,2 km · max 24,7 km/**60′** (Xuka); cộng tổng chọn **Haidilao Giga Mall** Ψ 2 485,5 · tổng **63,5 km** · max 30,4 km/**74′** (Xeko); Dookki SC VivoCity Ψ 4 285,9 · 81,5 km · 38,7 km/94′ (Xuka). Người xa nhất bớt **14′**, tổng nhóm +7,5 %.<br>• `scripts/find_demo_case.py` (mới): lọc quán Ăn trong `places_hcm.geojson` theo chuỗi thương hiệu Gen Z (`BRANDS`; geojson **không có** `brand_key`) + `s ≥ 40`, xếp bằng chính `decide`→`rank_candidates`; `--hangout` bỏ fast-food, `--valhalla URL` lấy km thật qua `ValhallaEstimator.amatrix` của backend.<br>• **Lệch plan (có lý do):** dò trên km ước lượng (như task ghi) cho 3 bộ tốt nhất thì Valhalla đảo **cả 3** (Q7 → Thảo Điền phải vòng sông: Xeko 71′ thật vs 54′ ước lượng) ⇒ thêm `--valhalla`, chốt bộ trên ma trận Valhalla. Quán thứ 3 phải có tổng ≤ 1,35× quán cộng-tổng (không thì script chọn quán vô lý cách 96′). Giữ 3 thương hiệu cũ, chỉ đổi chi nhánh.<br>• Kiểm: seed chạy 2 lần trên backend local + Valhalla **của laptop** (`docker start valhalla`, image `valhalla-scripted:latest` 3.9.2, tileset 1794713401; đã `docker stop` lại) — 2 phòng ra **cùng** số; trước phiếu live không hoà (Haidilao 3–2–2); Uống/Giải trí không hoà. PC `luckmintpc` **offline** cả buổi → chưa đo trên Valhalla của PC (`valhalla-pinned`).<br>• **Task sau cần biết:** khi PC bật, chạy `find_demo_case.py --hangout --valhalla <URL PC> --valhalla-key …` hoặc seed lên Render rồi đọc `/tie-break/suggestion` để xác nhận (biên Ψ 8,5 %, tổng 7,5 % — đủ chịu chênh tile nhỏ). Lúc demo: Xeko bấm 'Muốn đi' Pizza 4P's Thiso + Dookki VivoCity. Người xa nhất **khác nhau** ở hai quán (Xeko ở Haidilao, Xuka ở Pizza 4P's) — T-107/CR-19 phải gọi đúng tên theo quán.<br>• Ruff: `ruff check scripts/find_demo_case.py scripts/seed_demo_genz.py` xanh (đã bỏ `noqa: E402` thừa, `chmod +x`). Không có test mới (script chạy tay). `seed_demo_genz.py` commit cùng task (PLAN §7); `host_local*` vẫn chưa commit. |
| T-107 | TODO | | |
| T-108 | TODO | | |
| T-109 | TODO | | |
