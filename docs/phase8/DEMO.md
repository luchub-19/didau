# Kịch bản demo 3 phút — "Vì sao?" (giai đoạn 8, hoà phiếu bằng Ordered Median)

Buổi trình bày **thứ Hai 2026-11-23**, laptop chiếu máy chiếu. Lý do chọn từng bước (đỉnh – kết, thước chung, tương phản): `PLAN.md` §4.
Thông điệp duy nhất: **OMP công bằng cho người ở xa — khác với cộng tổng km.** Không nói công thức (để ở slide), không mở lịch/thiếu giờ
(để dành nếu bị hỏi). Ranh giới giữ nguyên: không gì tự động — máy chỉ **đề xuất**, host **quyết**.

> **Trạng thái diễn tập (2026-11-19, T-109):** đã đi trọn kịch bản trên **bản build local** (backend `uvicorn` + Valhalla Docker của laptop +
> frontend `dist` qua Caddy), **chưa** trên bản deploy — T-107/T-108 chưa push (xem "Việc của người" ở `PROGRESS.md`). Cổng G2 vẫn chờ
> người dùng tổng duyệt trên Render/Vercel, bằng laptop + máy chiếu thật.

## Số trên màn (phải khớp, ca T-106, Valhalla xe máy, λ = 1, k = 2)
| Quán Ăn | Người xa nhất (đi + về) | Tổng km nhóm | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Pizza 4P's Thiso Mall Sala** | **60′** · Xuka 24,7 km | 68,2 | OMP đề xuất |
| Haidilao Giga Mall | 74′ · **Xeko** | **63,5** | "cộng tổng km" sẽ chọn quán này |
| Dookki SC VivoCity | 94′ · Xuka | 81,5 | |

Câu đỉnh trên màn: **"Nếu chỉ cộng tổng km, máy sẽ chọn Haidilao Giga Mall: Xeko phải đi 74′, thêm 14′."** · Thẻ: "Chọn Pizza 4P's Thiso Mall Sala
sẽ tốt hơn · người xa nhất bớt 14′" · đường của Nobita: "đi 13′ · về 13′" · cột từng người ở Pizza 4P's: Xuka 60′ · Xeko 54′ · Doraemon 28′ ·
Nobita (bạn) 26′. Lệch bất kỳ số nào = seed bị đổi, chạy lại seed (đừng diễn).

## Chuẩn bị (trước giờ ≥ 15′)
| Việc | Lệnh / cách | Kiểm |
| :--- | :--- | :--- |
| Valhalla bật (PC `luckmintpc` + tunnel, hoặc `docker start valhalla` trên laptop) | `docs/phase7/VALHALLA.md` §5, §7 | `/status` ra JSON. **Không bắt buộc lúc diễn** (xem "Nếu hỏng thì") nhưng cần lúc seed |
| Render thức (ngủ ~1′) và đã chạy bản **có CR-19** | `curl -m 120 <BACKEND>/healthz` | `{"status":"ok"}`; sau seed, `GET …/tie-break/suggestion` có `ranking[].farthest_member_id` |
| Dựng **3 phòng** (tập / diễn / dự phòng) | `python3 scripts/seed_demo_genz.py <BACKEND> --rooms 3 --frontend <FRONTEND> --out <file ngoài repo>` | mỗi phòng in "56 đường Valhalla, 0 còn ước lượng" + mã phòng + token Nobita/Xeko. File `--out` có token — đừng commit |
| Hai cửa sổ: **Nobita** (host, laptop, màn chiếu) và **Xeko** (cửa sổ ẩn danh hoặc điện thoại) | mở link phòng, Console: `localStorage.setItem('didau_member_token','<TOKEN>');location.reload()` | cửa sổ Nobita thấy nút **Chốt**; cửa sổ Xeko thì không |
| **Theme sáng**, không bật "Giảm chuyển động", **zoom trình duyệt 100 %** (xem dưới), mở app trước 5′ | Ctrl+0 | |
| Video dự phòng đã quay | | |

Hai điều dễ quên: (1) mỗi phòng chỉ **Chốt một lần** — phòng đã chốt không tập lại được, nên dùng phòng tập cho mọi thứ trừ Chốt;
(2) phòng tập hết hoà bằng cách Xeko bấm "Bỏ Muốn đi" ở Pizza 4P's và Dookki.

### Zoom và độ phân giải (đã đo 2026-11-19, theme sáng, Chrome, panel "Vì sao?" cao 607 px)
| Màn laptop | Zoom | Kết quả | Ảnh |
| :--- | :--- | :--- | :--- |
| **1366×768** (và 1280×800, 1920×1080) | **100 %** ✅ | panel hiện **trọn, không cuộn**, không cuộn ngang | `screens/t109/1366-z100-*.png` |
| 1536×864 | 125 % ✅ | trọn, không cuộn (khung nhìn 1229×691) | `screens/t109/1536-z125-04-vi-sao.png` |
| 1366×768 | 125 % ❌ | khung nhìn 1093×614: panel **cuộn 25 px**, dòng "Valhalla · xe máy" bị cắt, panel che cả thanh trên | `screens/t109/1366-z125-04-vi-sao-CUT.png` |

**Chốt: 100 %.** Độ phân giải laptop người dùng **chưa được ghi** ở PROGRESS (PLAN §7) — nếu máy chiếu chỉ 1024×768 hoặc nhỏ hơn thì
chưa đo, phải thử trước giờ (Ctrl+0, rồi mở "Vì sao?" xem còn cuộn không). Muốn chữ to hơn cho phòng lớn: chỉ dùng 125 % khi màn ≥ 1536×864.

## Kịch bản (≈ 3′)
Ảnh cho mỗi bước: `docs/phase8/screens/t109/1366-z100-0N-*.png`. Thời gian đo trên bản local: thẻ hoà hiện ở cửa sổ Nobita **0,74 s** sau phiếu của Xeko.

| Giờ | Làm gì (cửa sổ) | Nói gì (gợi ý) | Ảnh |
| :--- | :--- | :--- | :--- |
| 0:00 | **Nobita**: mở phòng "Tối thứ Bảy đi đâu?". Chỉ chip "Trung tâm nhóm … · 4 người" và Haidilao đang dẫn 3 phiếu (Pizza 4P's, Dookki 2–2). | "Bốn bạn ở bốn quận — Quận 1, Bình Thạnh, Thủ Đức, Quận 7 — đang chọn chỗ ăn tối thứ Bảy." | `01-phong` |
| 0:20 | **Xeko**: bấm **Muốn đi** Pizza 4P's, rồi Dookki. Cửa sổ Nobita (không tải lại) hiện thẻ **"Hoà rồi: 3 quán cùng 3 phiếu"**. | "Xeko vừa bỏ thêm hai phiếu — ba quán bằng điểm. Đây là lúc máy phải chọn thay vì để nhóm cãi nhau." (2 cửa sổ, realtime) | `02-hoa-realtime` |
| 0:40 | Thẻ đề xuất: "Chọn **Pizza 4P's Thiso Mall Sala** sẽ tốt hơn · người xa nhất bớt 14′". Chỉ đường **của Nobita** vẽ trên bản đồ (nhãn "đi 13′ · về 13′"). | "Một câu, một nút. Máy không tự chốt — chỉ host bấm. Đường vẽ chỉ của riêng tôi, không ai xem được đường từ nhà người khác." | `03-the-de-xuat` |
| 1:00 | Bấm **Vì sao?** Đọc câu luật. Chỉ **ba thanh** cùng một thước: Pizza 4P's 60′ (cam, ngắn nhất), Haidilao 74′, Dookki 94′. | "Máy ưu tiên người phải đi xa nhất, để không ai phải đi quá xa. Mỗi thanh là **người xa nhất** ở quán đó phải đi bao lâu, đi cộng về." | `04-vi-sao` |
| 1:30 | **ĐỈNH.** Chỉ câu đối chiếu, **dừng ~5 giây, im lặng**: "Nếu chỉ cộng tổng km, máy sẽ chọn Haidilao…: Xeko phải đi 74′, thêm 14′." Nhãn "tổng km ít nhất" cạnh Haidilao. | "Cách thông thường là cộng km cả nhóm — nó chọn Haidilao, tổng chỉ 63 km. Nhưng người chịu thiệt là **Xeko**: thêm 14 phút mỗi lượt. Tổng km không thấy được điều đó." | `04-vi-sao` |
| 2:00 | Chỉ thanh từng người ở Pizza 4P's (Xuka 60′ xa nhất … Nobita 26′), rồi đóng panel (X/Esc). **Nobita** bấm **Chốt Pizza 4P's** → màn "Chốt rồi!". | "Máy đề xuất, **người quyết**. Chủ phòng bấm thì mới chốt." | `05-chot` |
| 2:20 | Đứng ở màn "Chốt rồi!" — **dừng ở đây**, không mở lịch. | **Kết:** "Cộng tổng km hỏi *cả nhóm đi tổng cộng bao xa*. Ta hỏi *ai đang phải đi xa nhất*. Tổng thêm 4,7 km (+7,5 %) để người xa nhất bớt 14 phút — công bằng cho người ở xa." | `05-chot` |
| ≤ 3:00 | Mở slide công thức nếu thầy hỏi (k = 2, λ = 1, Ψ). | | |

**Câu hay bị hỏi, có sẵn đáp:** "Công thức?" → slide; `docs/phase7/ALGORITHMS.md` §4. "Sao không hiện điểm Ψ?" → người dùng thật không cần số đó (PRODUCT.md nguyên tắc 3).
"Km có kẹt xe không?" → không, Valhalla xe máy theo đường, không theo giờ (`ALGORITHMS.md` §9.4). "Ai thấy được đường?" → chỉ chính người đó (CR-11).
"Hoà mới chạy?" → đúng: OMP chỉ chạy khi hai quán **bằng điểm** ở hạng đầu của một loại; còn lại người dùng tự quyết.
Lịch / thiếu giờ / xuất kế hoạch → `docs/phase6/DEMO.md` và `docs/phase7/DEMO.md` (không thuộc 3′).

## Bẫy đã gặp khi diễn tập
- **Sau Chốt, cột trái sai cho tới khi tải lại.** Ngay sau "Chốt rồi!" → "Đi thôi", mục "Quán đã chốt" ở cột trái hiện **Haidilao** làm thẻ chính (dữ liệu
  đúng: Pizza 4P's `ACCEPTED`, Haidilao `REJECTED`; F5 là hiện Pizza 4P's). Nguyên nhân: `splitLockedPlaces` chọn thẻ chính là quán `ACCEPTED` điểm cao nhất, mà store
  không đánh `REJECTED` các quán còn lại khi chốt qua thẻ hoà. Ngoài phạm vi T-109 (ghi ở PROGRESS). **Cách diễn: dừng ở màn "Chốt rồi!", đừng bấm "Đi thôi"
  rồi chỉ vào cột trái; nếu cần cho xem Kế hoạch thì F5 trước.**
- Thẻ hoà **không có tên** ("người xa nhất phải đi 74′, thêm 14′") nghĩa là Render còn bản chưa có CR-19 — vẫn diễn được, nhưng mất sức nặng của tên người.
- Panel "Vì sao?" che phần trên thẻ hoà — đóng bằng X/Esc (focus về nút "Vì sao?").

## Nếu hỏng thì
| Sự cố | Dấu hiệu | Làm gì |
| :--- | :--- | :--- |
| **Valhalla tắt / tunnel chết** | nhãn nguồn "Ước lượng", đường của mình nét đứt | **Phòng seed vẫn ra đúng 60′/74′/94′** (km nằm trong `travel_legs`, khoá = toạ độ) — **đo lại 2026-11-19** với `VALHALLA_URL` trỏ cổng chết: cùng Ψ, cùng 68,207 / 63,476 / 81,474 km, `source=VALHALLA`. Chỉ quán/vị trí **thêm lúc diễn** mới ra ước lượng. Backend chờ ≤ 4 s ở lần gọi đầu rồi nghỉ 60 s, không treo |
| **Render ngủ / treo sau auto-deploy** | "Đang đánh thức máy chủ…", `/healthz` quá 2′ | Mở app trước 5′. Treo: `docs/DEPLOY.md` §5.4 (Manual Deploy → Clear build cache). Quá giờ → video dự phòng |
| **Render còn bản cũ** (chưa push T-107/T-108) | panel "Vì sao?" vẫn là bảng 4 cột cũ, hoặc `routes/me` 404 | Phải push `main` + chờ deploy trước giờ diễn (`ROUTING_PROVIDER=valhalla`, `VALHALLA_URL`, `VALHALLA_KEY`). Không sửa được lúc diễn → video |
| **Mạng trường yếu** | WS rớt, thẻ hoà không tự hiện | Dùng điện thoại phát 4G cho cả hai cửa sổ. Thẻ không hiện sau ~5 s: tải lại cửa sổ Nobita (phiếu đã lưu, thẻ sẽ hiện). Tile bản đồ lỗi vẫn thấy thẻ + "Vì sao?" |
| **Không ra hoà** | thẻ "Chưa có loại quán nào bằng điểm nhau" | Hoà = bằng **điểm** (Muốn đi − Không) ở hạng đầu của **một loại**. Xeko phải bấm đủ **cả hai** quán (Pizza 4P's và Dookki); đã bấm một nửa thì bấm nốt |
| **Phòng đã hoà sẵn** (tập xong chưa dọn) | thẻ hoà hiện ngay ở 0:00, mất khoảnh khắc 0:20 | Dùng phòng khác, hoặc Xeko "Bỏ Muốn đi" Pizza 4P's + Dookki rồi tải lại |
| **Đề xuất không phải Pizza 4P's** | tên quán/số khác bảng trên | Có người đổi vị trí xuất phát, hoặc đã chốt/đổi quán. Dùng phòng dự phòng hoặc chạy lại seed |
| **Không thấy nút Chốt** | chỉ host thấy | Đang xem cửa sổ Xeko — chuyển sang Nobita |
| **Panel "Vì sao?" bị cuộn / cắt** | zoom trình duyệt lớn trên màn nhỏ | Ctrl+0 (100 %) |
| **Máy yếu giật** | | thêm `?motion=lite` hoặc `?motion=off` vào URL |
