# Kịch bản demo 4 phút — Hangoutplanner, giai đoạn 7 (hoà phiếu bằng Ordered Median)

Buổi thuyết trình **thứ Hai 2026-11-16**. Bản giai đoạn 6 (tâm nhóm, lịch, xuất kế hoạch) ở `docs/phase6/DEMO.md`; bản này chỉ
dựng quanh thuật toán mới. Nhớ ranh giới (PLAN §1): **không gì tự động** — mọi đề xuất chỉ host xác nhận; OMP chỉ chạy khi
**hoà phiếu**; chồng/thiếu giờ chỉ **cảnh báo**.

## Chuẩn bị (trước giờ ≥ 15′)
| Việc | Lệnh / cách | Kiểm |
| :--- | :--- | :--- |
| PC Valhalla bật, tắt chế độ ngủ, tunnel chạy | `VALHALLA.md` §5, §7 | `curl -H "X-Route-Key: …" <VALHALLA_URL>/status` ra JSON |
| Render thức (ngủ ~1′) | `curl -m 120 <BACKEND>/healthz` | `{"status":"ok"}` — lần cuối đo 2026-11-15: 53 s lúc nguội |
| Render đã chạy **bản có OMP** | xem "Kiểm deploy" bên dưới | `GET …/rooms/<id>/routes/me` không còn 404 |
| Dựng phòng demo | `python3 scripts/seed_demo_omp.py <BACKEND> --tie-live` | in mã phòng + 4 token; "Nguồn km: VALHALLA" |
| Mở 2 cửa sổ: **Bảo** (host, laptop ≥ 1280 px) và **Sơn** (cửa sổ ẩn danh / điện thoại) | mở `<FRONTEND>/rooms/<room_id>`, Console: `localStorage.setItem('didau_member_token','<TOKEN>')`, tải lại | cả hai thấy phòng "Demo OMP — tối thứ Bảy" |
| Chế độ sáng, không "Giảm chuyển động", mở app trước 5′ | | |
| Video dự phòng đã quay | | |

`--tie-live` giữ lại 2 phiếu của Sơn nên **chưa có hoà**; hoà xảy ra trước mắt khán giả ở bước 3. Muốn hoà sẵn (an toàn hơn khi
mạng yếu) bỏ cờ này. Mỗi lần chạy tạo phòng mới, không xoá phòng cũ.

Phòng seed: 4 người **đã chia sẻ vị trí** — Bảo (Q.1 Bến Thành), Nam (Bình Thạnh), Linh (Thủ Đức), Sơn (Q.7 Phú Mỹ Hưng);
3 quán Ăn (Cơm Tấm Ba Ghiền / Quán Bụi / Lẩu Dê 404), 2 quán Uống (Cà Phê Trứng 3T thắng rõ), 2 quán Giải trí (CGV thắng rõ).
Cache km đã làm ấm (56 đường nhà ↔ quán) nên tính toán không phụ thuộc mạng lúc diễn.

## Kịch bản (≈ 4′)
| Giờ | Làm gì (cửa sổ) | Nói gì (gợi ý) |
| :--- | :--- | :--- |
| 0:00 | **Bảo**: mở phòng. Chỉ avatar: bốn chấm "đã chia sẻ vị trí". Mở **Xuất phát từ đâu?** để chỉ vị trí *của mình*. | "Bốn người ở bốn quận. Vị trí chỉ mình tôi thấy; người khác chỉ biết tôi đã chia sẻ." |
| 0:30 | Cột danh sách: Ăn có Cơm Tấm Ba Ghiền 3 phiếu, Quán Bụi 2, Lẩu Dê 2; Uống, Giải trí có quán thắng rõ. | "Chỉ khi hai quán **bằng điểm ở hạng đầu** mới cần thuật toán — còn lại người dùng tự quyết." |
| 1:00 | **Sơn**: bấm **Muốn đi** cho Quán Bụi rồi Lẩu Dê 404. Cửa sổ Bảo (không tải lại) hiện thẻ **"Ăn đang hoà"** — 3 quán cùng 3 điểm. | "Hoà ba quán. Đây là lúc Ordered Median vào việc." (2 tab realtime) |
| 1:20 | Thẻ nói: "Chọn **Quán Bụi** sẽ tốt hơn · người xa nhất bớt …". Chỉ đường **của Bảo** vẽ trên bản đồ tới quán đề xuất (nhãn "Đường của bạn · đi … · về …"). | "Một câu ngắn, kèm con số. Đường vẽ chỉ của riêng tôi — không ai xem được đường từ nhà người khác." |
| 1:45 | Bấm **Vì sao?** → bảng từng người (đi + về, km, "tính nặng") + "So với các quán cùng hoà". Chỉ nhãn nguồn **Valhalla · xe máy**. | "Máy cộng đi và về của từng người, người ở xa tính nặng hơn để không ai phải đi quá xa. Linh ở Thủ Đức xa nhất nên được tính nặng nhất." |
| 2:15 | **Bảo** bấm **Chốt Quán Bụi** (host xác nhận; Sơn không có nút này). | "Chủ phòng quyết. MVP chốt 1 quán cho cả phòng; bản đầy đủ sẽ chốt theo từng loại." |
| 2:35 | Cột Kế hoạch: kéo Quán Bụi vào 17:30; kéo Cà Phê Trứng sát ngay sau → dải **"Thiếu …"**; kéo CGV muộn hơn. Bản đồ tự vẽ **đường giữa các quán** (xanh). | "Lịch do người dùng xếp. Thiếu giờ chỉ cảnh báo, máy không tự đẩy giờ." |
| 3:15 | Bấm dải **Thiếu …** → **Vì sao?** (km từ Valhalla). Dời quán ra, dải về "SAFE". | "Cùng nguồn km với thuật toán nên phút và đề xuất không lệch nhau." |
| 3:40 | Chốt ý: phạm vi MVP — một chặng, km không có kẹt xe; bản đầy đủ: nhiều chặng theo lịch. | Slide giới hạn (xem `ALGORITHMS.md` §9.4). |

Số đã đo khi diễn tập API trên phòng seed (2026-11-15, Valhalla local): Quán Bụi Ψ 69,686 · Cơm Tấm Ba Ghiền 95,183 · Lẩu Dê 404
100,793; người xa nhất (Linh) 22,959 km khứ hồi, tổng 51,192 km. Sau chốt: Quán Bụi → Cà Phê Trứng 0,566 km (SOFT_CONFLICT khi sát giờ),
→ CGV 1,334 km. Giao diện phải khớp các số này; lệch = đã đổi dữ liệu seed.

## Nếu hỏng thì
| Sự cố | Dấu hiệu | Làm gì |
| :--- | :--- | :--- |
| **PC Valhalla tắt / tunnel chết** | nhãn nguồn "Ước lượng", đường của mình là nét đứt thẳng, chữ "ước lượng" | **Phòng seed vẫn ra kết quả giống hệt** (km đã nằm trong bảng `travel_legs`; khoá = toạ độ, đo lại 2026-11-15 với `VALHALLA_URL` trỏ cổng chết: cùng Ψ, cùng `source=VALHALLA`). Chỉ **quán/vị trí mới thêm lúc diễn** mới ra ước lượng + đường thẳng. Nói thẳng: "Valhalla là nguồn km, đang dùng ước lượng chim bay × 1,3 dự phòng". Backend chờ ≤ 4 s ở lần gọi đầu rồi nghỉ 60 s, không treo |
| **Render ngủ / treo sau auto-deploy** | màn "Đang đánh thức máy chủ…", `/healthz` quá 2′ | Mở app trước 5′. Nếu treo: `docs/DEPLOY.md` §5.4 (Manual Deploy → Clear build cache). Quá giờ → chạy video dự phòng |
| **Render còn bản cũ (chưa có OMP)** | `routes/me` 404; thẻ hoà cũ, không có đường | Phải push `main` + chờ deploy trước giờ diễn; đặt env `ROUTING_PROVIDER=valhalla`, `VALHALLA_URL`, `VALHALLA_KEY`. Không sửa được lúc diễn → video |
| **Mạng trường yếu** | WS rớt, thẻ hoà không tự hiện | Bỏ `--tie-live` (hoà sẵn); nếu thẻ không hiện, tải lại cửa sổ Bảo. Dùng điện thoại phát 4G cho cả hai cửa sổ. Tile bản đồ lỗi vẫn thấy thẻ + "Vì sao?" |
| **Không ra hoà** | thẻ "Chưa có loại quán nào bằng điểm nhau" | Hoà = bằng **điểm** (Muốn đi − Không) ở hạng đầu của **một loại**. Cho Sơn bấm đủ 2 quán |
| **Đề xuất khác kịch bản** | tên quán khác Quán Bụi | Bốn vị trí xuất phát phải còn nguyên (không ai đổi vị trí). Đã đổi: chạy lại `seed_demo_omp.py` |
| **Nút Chốt không có** | chỉ host thấy | Đang xem bằng cửa sổ Sơn — chuyển sang Bảo |
| **Máy yếu giật** | | thêm `?motion=lite` hoặc `?motion=off` vào URL |
