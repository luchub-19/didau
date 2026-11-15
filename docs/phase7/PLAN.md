# KẾ HOẠCH GIAI ĐOẠN 7: "THUẬT TOÁN OMP CỦA SƠN"

Thay ALGO-02 (hoà phiếu theo tổng thời gian + ngưỡng 2′) bằng **Ordered Median (OMP)** của Sơn (nhánh orphan
`origin/feat/tie-breaker`, `SPEC.md` v1.2.0), giải bằng quy hoạch động theo báo cáo so sánh của Bảo (Drive, 2026-11-14).
Km lấy từ **Valhalla tự host** (xe máy), có ước lượng làm đường lùi. Có **hai đợt**:

- **MVP (T-94 → T-97):** xong trước buổi thuyết trình MVP **thứ Hai 2026-11-16**.
- **Bản đầy đủ (T-99 → …):** sau buổi thuyết trình — chặng theo loại quán, chốt không loại ai, "Kết thúc bình chọn".

Đặc tả thuật toán đã chốt: `ALGORITHMS.md` (code theo file đó). Hợp đồng: CR-15 (`docs/CHANGE_REQUESTS.md`).
Hướng dẫn tự host Valhalla (việc của người): `VALHALLA.md`. Tiến độ: `PROGRESS.md`.

## 1. Quyết định đã chốt (hỏi đáp với người dùng 2026-11-14)
| # | Câu hỏi | Chốt |
| :-: | :--- | :--- |
| 1 | Thuật toán chính | **OMP của Sơn**; chấp nhận đổi app khá nhiều cho khớp. Kịch bản thuyết trình của nhóm trưởng chỉ là ví dụ thứ tự trình bày |
| 2 | Đơn vị | Thuật toán tính **km**; giao diện hiện **phút** (`phút = ceil(km ÷ MOTORBIKE_KMH × 60)`, cùng nguồn km nên phút và đề xuất không vênh) |
| 3 | Công thức | Làm đúng như Sơn: khứ hồi `Nhà → S₁ → … → S_K → Nhà`, `cᵢ = dᵢᵏ`, `Ψ = Σ w₍ᵣ₎·c₍ᵣ₎`; ~~λ = 0,5, k = 1 (mặc định của Sơn)~~ → **λ = 1, k = 2** (báo cáo của Bảo, người dùng chốt 2026-11-15, CR-16 / T-99) |
| 4 | Khi nào dùng thuật toán | Chỉ khi có **xung đột giữa nhiều lựa chọn** = hoà phiếu. Người dùng vẫn tự kéo lịch |
| 5 | Chồng giờ / thiếu giờ | **Chỉ cảnh báo** (ALGO-03 như cũ), không tự chọn/bỏ hoạt động nào |
| 6 | Hoà | Bằng **điểm** (Muốn đi − Không) ở hạng đầu, **theo từng loại quán**; chỉ khi bằng điểm thật (không dùng "gần hoà") |
| 7 | Đi không kịp | OMP chọn **thuần km** như Sơn (không lọc khả thi); ALGO-03 cảnh báo sau như bình thường |
| 8 | Không có gì tự động | Mọi đề xuất (chọn quán, bỏ quán) là câu ngắn "Chọn X sẽ tốt hơn" + nút "Vì sao?"; **chỉ host** bấm xác nhận |
| 9 | Thiếu vị trí | Người chưa chia sẻ vị trí bị **loại khỏi phép tính** ("Vì sao?" ghi số người thiếu); không ai có → không chạy, nhắc chia sẻ. **Không** dùng điểm hẹn host thay |
| 10 | Phá hoà Ψ | Người đi xa nhất ít km hơn → tổng km nhỏ hơn → quán thêm sớm hơn → `place_id` |
| 11 | Nguồn km | **Valhalla tự host** (`costing=motor_scooter`) trên PC của nhóm qua tunnel có khoá; lỗi/thiếu → ước lượng chim bay × 1,3 |
| 12 | Demo live | Cache km **lưu DB**, làm ấm khi thêm quán/chia sẻ vị trí, OMP chỉ đọc cache; seed sẵn phòng demo |
| 13 | Vẽ đường | **(b)**: mỗi người chỉ thấy **đường của mình** (nhà mình ↔ quán) + đường **giữa các quán trên lịch**. Không bao giờ vẽ đường từ nhà người khác (CR-11) |
| 14 | Chặng (bản đầy đủ) | Chặng = **loại quán** (cả 7 loại). **Thứ tự = đúng như lịch người dùng đã xếp; máy không đoán** (sửa 2026-11-14, bỏ thứ tự mặc định + host sắp loại). Điểm cố định = quán **đã chốt và đã có trên lịch**; chặng chưa có trên lịch bị bỏ qua. Chặng đang hoà được đặt vào vị trí giờ của ứng viên đã nằm trên lịch; không ứng viên nào trên lịch → chỉ tính `Nhà → quán → Nhà` (K = 1) |
| 15 | Chốt (bản đầy đủ) | Chốt **không** tự loại quán khác; hiện đề xuất "Loại các quán còn lại?" cho host xác nhận |
| 16 | Kết thúc bình chọn (bản đầy đủ) | Nút riêng của host, có hỏi xác nhận; không tự khoá |
| 17 | Tự xếp lịch (bản đầy đủ) | Được thay cả lịch tay, nhưng thêm hộp hỏi "Bạn chắc muốn sắp tự động?" |
| 18 | T-92 | Đóng; ảnh `screens/final/` + đo fps/CLS/LCP dời sau MVP; hiệu chỉnh `MOTORBIKE_KMH` gộp vào kiểm 10 tuyến Valhalla |
| 19 | Tên web (2026-11-15) | **Hangoutplanner** (viết liền, chỉ H hoa) thay HookupFPT; logo chữ phương án **C "Hai tầng"** (`Hangout` to + `PLANNER` chữ hoa giãn, màu coral). Làm ở T-98 |

## 2. Lệch có chủ ý ở MVP (sửa ở bản đầy đủ)
- MVP chỉ có **1 chặng**: chặng = loại quán đang hoà; vì luồng chốt cũ khoá cả phòng nên lúc hoà chưa có chặng nào đã
  chốt ⇒ K = 1 đúng với quyết định 14 (bộ giải vẫn viết cho K bất kỳ để test bằng dataset).
- **Chốt vẫn theo luồng cũ** (giữ quán thắng, loại phần còn lại, phòng FINALIZED) — trái quyết định 15/16, chấp nhận ở
  MVP vì đổi luồng chốt kéo theo giai đoạn phòng, reveal, lịch. Host vẫn phải bấm xác nhận (quyết định 8 giữ).
- Không đổi luồng tự xếp lịch (quyết định 17).

## 3. Lộ trình
| Task | Đợt | Nội dung | Phụ thuộc | Model gợi ý |
| :-: | :-: | :--- | :--- | :--- |
| T-93 | — | Lên plan (file này, ALGORITHMS, PROGRESS, task, VALHALLA, CR-15), đóng T-92 | — | Opus 5.5 · high |
| T-94 | MVP | Lõi OMP thuần + DP + test Sơn + test hồi quy 20 case; ALGO-02 dùng OMP (K = 1), hoà theo điểm/loại | G1 | Opus 5.5 · high |
| T-95 | MVP | Valhalla estimator + cache km lưu DB + làm ấm + endpoint đường đi (của mình + giữa các quán) | G1 (song song T-94) | Opus 5.5 · high |
| T-96 | MVP | FE: thẻ đề xuất ngắn + "Vì sao?" OMP + vẽ đường (b) trên bản đồ | T-94, T-95, **câu hỏi UI §5** | Sonnet 5.5 · high |
| T-97 | MVP | Seed phòng demo + làm ấm, `DEMO.md` mới, ALGORITHMS §11 cho báo cáo, kiểm deploy Render, tổng duyệt | T-94…T-96, Valhalla chạy | Sonnet 5.5 · medium |
| T-98 | MVP | Đổi tên hiển thị sang Hangoutplanner + wordmark C (quyết định 19) | — (song song) | Sonnet 5.5 · medium |
| T-100 | MVP | Dữ liệu quán Overture + OSM (mall, siêu thị, giải trí), trường POI mới, ô tìm có địa chỉ — `MAP-POI.md`, CR-17 A | CR-17 | Opus 5.5 · high |
| T-101 | MVP nếu kịp | Lớp quán icon + tên theo zoom, ẩn POI nền nhóm thay thế | T-100 | Opus 5.5 · high |
| T-102 | Đầy đủ | Tìm Postgres + "Xem N chi nhánh" (CR-17 B) | T-100 | Opus 5.5 · high |
| T-103 | Đầy đủ | Nguồn bản đồ tĩnh cả TP | T-101 | Sonnet 5.5 · high |
| T-99+ | Đầy đủ | Chặng theo loại + DP nhiều chặng trong app; chốt không loại; "Kết thúc bình chọn"; hỏi xác nhận tự xếp lịch; việc dời từ T-92 | buổi MVP | lên plan lại sau buổi MVP |

Thời gian: T-94 + T-95 chạy song song (2 session) sáng Chủ nhật 15/11, T-96 chiều, T-97 tối; sáng thứ Hai chỉ tổng duyệt.
Gần hết giờ mà chưa xong: ưu tiên T-94 (thuật toán) + T-97 (demo chạy bằng ước lượng); T-95/T-96 phần vẽ đường bỏ được.

## 4. Việc của người
| Việc | Cần trước | Ghi chú |
| :--- | :--- | :--- |
| **Duyệt G1**: file này, `ALGORITHMS.md`, CR-15, trả lời câu hỏi UI §5 | T-94/T-95 (CR-15), T-96 (§5) | Nói trong chat hoặc sửa trạng thái CR |
| Dựng Valhalla + Caddy + tunnel trên PC ở nhà | T-97 (bật cờ) | `VALHALLA.md`; gửi `VALHALLA_URL` + `VALHALLA_KEY` để đặt vào Render, không dán lên chat công khai |
| Kiểm 10 tuyến Valhalla vs Google Maps (xe máy) | T-97 (số cho báo cáo) | Ghi bảng ở `VALHALLA.md` §6 |
| Thuyết trình: bật PC, tắt ngủ, mở app trước 5′ (Render ngủ), quay video dự phòng | 16/11 | |
| Hỏi Sơn ví dụ A-B-C / Q1→Q7 (OMP có xử lý giờ không) | trước buổi thuyết trình | Để phần trình bày nói đúng phạm vi thuật toán |

## 5. Câu hỏi giao diện (G1 — phải trả lời trước T-96)
Người dùng dặn: phần UI phải xem kỹ và hỏi kỹ trước khi chốt. T-96 **không được** tự chọn khi chưa có câu trả lời.

**ĐÃ TRẢ LỜI 2026-11-14:** 1 → mỗi loại một thẻ · 2 → kèm số ("Chọn Cơm B sẽ tốt hơn · người xa nhất bớt 29′") ·
3 → bảng từng người, nói bằng lời ("tổng quãng đường, ưu tiên người ở xa"), **không** hiện chữ Ψ · 4 → luôn hiện đường
của mình tới quán được đề xuất · 5 → đường giữa các quán tự hiện khi lịch có ≥ 2 mục · 6 → giữ nhãn nguồn như hiện có.
User flow cho nhóm (Claude Doc): https://claude.ai/artifact/R3WaLMud1Yp72NjpHWgQ5V
1. Nhiều loại quán cùng hoà một lúc (vd Ăn hoà và Uống hoà): MVP hiện **một thẻ cho mỗi loại** hay **chỉ loại đầu
   tiên** (như giai đoạn `tie` hiện tại)?
2. Câu đề xuất ngắn: "Chọn **Cơm B** sẽ tốt hơn" — có kèm một con số (vd "ít hơn 3′ cho người đi xa nhất") hay chỉ tên quán?
3. "Vì sao?" hiện gì: bảng từng người (nickname, phút, km?, hạng, trọng số wᵢ) + Ψ của quán đề xuất so với hạng 2? Có
   hiện chữ "Ψ"/"điểm phạt" hay nói bằng lời ("tổng quãng đường có ưu tiên người ở xa")?
4. Đường của mình vẽ lúc nào: chỉ khi mở thẻ hoà phiếu, khi chọn một quán, hay luôn hiện tới quán đề xuất?
5. Đường giữa các quán trên lịch: hiện ở bản đồ ngay khi có ≥2 mục trên lịch, hay có nút bật/tắt?
6. Nguồn: ghi "Valhalla · xe máy" / "Ước lượng" ở "Vì sao?" như nhãn `source` hiện có — có cần ghi rõ hơn cho buổi thuyết trình?
