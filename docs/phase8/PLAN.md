# Giai đoạn 8 "Vì sao? cho buổi demo" (T-106 → T-109)

Lập 2026-11-19 (session plan, không code). Buổi trình bày MVP trên lớp: **thứ Hai 2026-11-23**.
Đặc tả thuật toán không đổi: `docs/phase7/ALGORITHMS.md`. Luật giao diện: `DESIGN.md` (gốc repo) + `docs/phase6/DESIGN.md`.

## 1. Mục tiêu

Trong **≤ 3 phút** chiếu laptop lên máy chiếu, thầy phải thấy được **ý đồ** của OMP: *công bằng cho người ở xa* — khác với
cách "cộng tổng km". Đồng thời người dùng thật không thấy app rối hơn: thẻ đề xuất giữ nguyên, mọi thay đổi nằm sau nút
"Vì sao?".

## 2. Hiện trạng (đã kiểm 2026-11-19)

1. **Ca demo không lộ ý đồ.** Phòng `seed_demo_genz.py` (4 người Nobita Q1 / Doraemon Bình Thạnh / Xuka Thủ Đức / Xeko Q7;
   Haidilao LM81 / Pizza 4P's PMH / Dookki Vạn Hạnh): km ước lượng (chim bay × 1,3) cho Haidilao thắng **cả** Ψ (1 430 so với
   3 133 / 3 649), tổng km (52,5) **lẫn** người xa nhất (19,1 km). Phòng cũ `seed_demo_omp.py` cũng vậy (Quán Bụi nhỏ nhất cả
   hai, `DEMO.md` gđ7 dòng 38). ⇒ "Cộng tổng km" chọn trùng quán, thầy không có lý do tin OMP khác gì phép cộng.
2. **Bảng "Vì sao?" (`TieWhyBody` trong `TieSuggestion.tsx`) nói bằng chữ.** Đoạn luật 5 dòng (công thức viết thành lời), bảng 4
   cột với "Tính nặng ×1,33" (người xem phải tự nối trọng số với hệ quả), phần so quán là dòng chữ caption mờ.
3. Thẻ đề xuất ("Chọn X sẽ tốt hơn · người xa nhất bớt N′" + một nút Chốt + "Vì sao?") đã đúng — **giữ nguyên**.

## 3. Quyết định (người dùng trả lời 2026-11-19)

| # | Câu hỏi | Chốt |
| :-- | :--- | :--- |
| 1 | Màn demo | Laptop chiếu máy chiếu (bố cục desktop) |
| 2 | Thời lượng phần thuật toán | ≤ 3 phút, ít câu hỏi |
| 3 | Thông điệp chính | **Công bằng cho người ở xa** |
| 4 | So với gì trong "Vì sao?" | So với **"cộng tổng km"** (MinSum): chỉ nói khi hai cách chọn khác nhau |
| 5 | Đơn vị | **Phút** là số chính (khứ hồi), km phụ |
| 6 | Máy chiếu | **Theme sáng + zoom trình duyệt**; không code "chế độ trình chiếu" |
| 7 | Kịch bản | Vote trực tiếp tạo hoà (như `--tie-live`) |
| 8 | Ca demo | Giữ 4 người, **dò lại bộ quán Ăn** sao cho cộng tổng chọn A, OMP chọn B |
| 9 | Tầng 3 "Xem cách tính" / hiện Ψ | **Không làm.** Công thức để ở slide |
| 10 | Bảng từng người cũ | **Thu thành thanh**, bỏ cột "Tính nặng" |
| 11 | Gọi tên người xa nhất trong câu so sánh | **Có**, sửa backend (CR-19) |
| 12 | Câu trên thẻ đề xuất | Giữ "người xa nhất bớt N′" |
| 13 | Nơi đặt plan | `docs/phase8/` |

## 4. Vì sao thiết kế như vậy — tâm lý người xem và cách sắp xếp

Mỗi nguyên tắc dưới đây ánh xạ vào một quyết định cụ thể ở §5. Nguồn ở §8.

| Nguyên tắc | Nói gì | Áp vào đâu |
| :--- | :--- | :--- |
| **Cảm nhận độ dài trên cùng một trục** (Cleveland & McGill 1984) | Mắt so *vị trí/độ dài trên cùng một thước* chính xác nhất, hơn hẳn so con số, góc hay diện tích | Thay dòng số bằng **thanh ngang**, mọi thanh trong bảng dùng **chung một thước** (0 → phút lớn nhất) |
| **Giải thích kiểu đối chiếu** (Miller 2019) | Người ta không hỏi "vì sao X?" trống không mà hỏi "vì sao X **mà không phải** Y?" | Câu "Nếu chỉ cộng tổng km, máy sẽ chọn Y…": Y là phương án "bình thường" người xem đang ngầm nghĩ tới |
| **Hiệu ứng nạn nhân có danh tính** (Small, Loewenstein & Slovic 2007) | Một người cụ thể có tên làm người ta để tâm hơn một con số thống kê | Gọi tên: "**Xuka** phải đi 62′" thay vì "người xa nhất" → cần CR-19 |
| **Sợ mất hơn ham được** (Kahneman & Tversky 1979) | Cùng một khoảng chênh, nói thành "mất" có sức nặng hơn "được" | Thẻ nói phần được ("bớt 8′"); câu đối chiếu nói phần mất ("phải đi **thêm** 14′") |
| **Hiệu ứng nổi bật (von Restorff)** | Trong một nhóm giống nhau, thứ duy nhất khác biệt được nhìn và nhớ | **Chỉ** thanh của quán đề xuất màu coral; mọi thanh khác cùng một màu trung tính. Coral vẫn mang nghĩa "lựa chọn của nhóm" (DESIGN.md) |
| **Trí nhớ làm việc ~4 khối** (Cowan 2001) | Người xem chỉ giữ được khoảng 4 ý một lúc | Panel đúng 4 khối: câu luật · biểu đồ quán · câu đối chiếu · thanh từng người. Bỏ cột "Tính nặng" |
| **Hé lộ dần** (NN/g) | Đẩy thông tin phụ ra sau một thao tác thì dễ học và ít lỗi hơn | Thẻ (ai cũng thấy) → "Vì sao?" (ai tò mò mới mở). Không thêm tầng 3 (quyết định #9) |
| **Gần nhau / giống nhau (Gestalt)** | Thứ đặt gần nhau và trông giống nhau được hiểu là một nhóm | Tên – thanh – số trên **cùng một hàng**; hai biểu đồ cùng kiểu thanh, cùng thước nên đọc như một hệ |
| **Thứ tự đọc = thứ tự quan trọng** | Mắt đọc trên → dưới, trái → phải | Biểu đồ quán xếp theo đề xuất trước; thanh từng người xếp **xa → gần** (người xa nhất ở đầu) |
| **Đỉnh và kết** (Kahneman 1993) | Người ta nhớ khoảnh khắc mạnh nhất và đoạn kết | Kịch bản 3′ có đỉnh là lúc chỉ vào câu đối chiếu, và **kết** bằng câu công bằng, không kết bằng lịch/thiếu giờ |
| **Máy chiếu ăn tương phản** | Ánh sáng phòng làm theme tối bệt, chữ xám mờ biến mất | Theme sáng; số chính dùng `ink` (không `ink-3`); không chữ dưới 13px; thử zoom 125% |
| **Phút dễ cảm hơn km** | "Đi 62 phút" gợi ngay cảm giác mệt; "23 km" phải đổi ra trong đầu | Phút là số chính, km nhỏ bên cạnh |

Điều **không** làm và vì sao: không vẽ nhà/đường của người khác lên bản đồ (CR-11 — vì vậy biểu đồ phải nằm trong panel);
không chế độ trình chiếu riêng (thêm rủi ro, quyết định #6); không hiện Ψ hay trọng số (người dùng thật không cần, PRODUCT.md
nguyên tắc 3); không animation lặp, chỉ cho thanh "mọc" một lần khi mở panel (≤ `--t-ui`, tắt khi giảm chuyển động).

## 5. Thiết kế "Vì sao?" mới (chỉ đổi nội dung panel)

Số trong phác thảo là **ví dụ**, không phải số thật; số thật do T-106 dò.

```
Vì sao chọn Dookki?                                   [x]
Máy ưu tiên người phải đi xa nhất, để không ai phải đi quá xa.

Người xa nhất phải đi (đi + về)
Dookki ✓    ████████████            48′      ← coral, đậm
Haidilao    ███████████████▌        62′   tổng km ít nhất
Pizza 4P's  ██████████████████      71′
Nếu chỉ cộng tổng km, máy sẽ chọn Haidilao:
Xuka phải đi 62′, thêm 14′.

Tới Dookki
Xuka (xa nhất)  ████████████        48′ · 17,2 km
Xeko            ████████▌           35′ · 12,6 km
Doraemon        █████▌              22′ · 8,1 km
Nobita (bạn)    ██                   9′ · 3,0 km

Valhalla · xe máy
```

Luật:
- Thước chung cho **cả** panel: 0 → `max(max_min)` của các quán xếp hạng được.
- Câu đối chiếu chỉ hiện khi quán tổng km nhỏ nhất (`argmin total_km` trên `ranking`; bằng nhau → theo thứ tự `rank`)
  **khác** `recommended_place_id`. Khi trùng: một dòng caption "Quán này cũng có tổng quãng đường ít nhất."
- Tên trong câu đối chiếu = `farthest_member_id` của quán cộng-tổng (CR-19) → nickname từ store phòng; thiếu trường (server
  cũ) → "người xa nhất phải đi 62′, thêm 14′".
- Nhãn "tổng km ít nhất" chỉ gắn khi khác quán đề xuất.
- Một người duy nhất / chỉ một quán xếp hạng được / quán thiếu toạ độ / người bị loại: giữ các nhánh hiện có
  (`whyRuleOne`, `unranked`, `excluded`).
- Popover desktop rộng 20rem → **24rem** để thanh đủ dài; mobile vẫn là Sheet.

## 6. Task, thứ tự, cổng

| Task | Nội dung | Phụ thuộc | Model · ước lượng | Ngày dự kiến |
| :--- | :--- | :--- | :--- | :--- |
| T-106 | Dò ca demo OMP ≠ cộng tổng, sửa seed, ghi số thật | — | Opus 5.5 · ~90k | 2026-11-20 |
| T-107 | Backend CR-19: `farthest_member_id` mỗi dòng `ranking` | **G1** | Sonnet 5.5 · ~60k | 2026-11-20 |
| T-108 | Frontend: "Vì sao?" thành biểu đồ thanh + câu đối chiếu | T-107 (chạy được cả khi thiếu trường) | Opus 5.5 · ~120k | 2026-11-21 |
| T-109 | Kịch bản 3′, theme sáng/zoom, ảnh, PRODUCT.md, diễn tập | T-106, T-108 | Sonnet 5.5 · ~70k | 2026-11-22 |

- **G1** (trước T-107): người dùng duyệt plan này + **CR-19** (`docs/CHANGE_REQUESTS.md`) + câu sửa PRODUCT.md ở T-109.
- **G2** (sau T-109): người dùng tổng duyệt `docs/phase8/DEMO.md` **trên bản deploy**, bằng chính laptop + máy chiếu nếu được.
- T-106 và T-107 độc lập, chạy song song được. Nếu hết giờ: T-106 + T-108 là lõi; thiếu T-107 thì câu đối chiếu không có tên.

## 7. Việc của người

- Bật PC Valhalla `luckmintpc` + tunnel khi chạy T-106 (cần km thật để xác nhận ca) và hôm diễn.
- `scripts/host_local.sh`, `scripts/host_local/`, `scripts/seed_demo_genz.py` đang **chưa commit**: commit trước T-106, hoặc
  cho phép T-106 commit `seed_demo_genz.py` cùng task.
- Sau T-107/T-108: `git push` lên `origin` + `didau` để Vercel/Render deploy (session không tự push).
- Thử máy chiếu thật (hoặc màn ngoài) với độ phân giải laptop: zoom 125% trên màn 1366 px còn 1093 px CSS → bố cục
  1024–1279 (Kế hoạch thành ngăn kéo). Ghi độ phân giải laptop vào PROGRESS để T-109 kiểm đúng cỡ.
- Làm slide công thức (k = 2, λ = 1, Ψ) vì app không hiện nữa.

## 8. Nguồn

Tra cứu 2026-11-19: Cleveland & McGill, "Graphical Perception" (1984) —
<https://vis.arc.vt.edu/~npolys/projects/safas/science.pdf>, tóm tắt <https://info3312.infosci.cornell.edu/ae/graphical-perception-A.html>;
NN/g, Progressive Disclosure — <https://www.nngroup.com/videos/progressive-disclosure/>; Gestalt grouping —
<https://en.wikipedia.org/wiki/Principles_of_grouping>, <https://www.smashingmagazine.com/2016/05/improve-your-designs-with-principles-similarity-proximity-part-1>;
giải thích đối chiếu trong gợi ý — <https://escholarship.org/uc/item/9xd206g2>.
Tài liệu kinh điển (không tra lại trong session này): Miller, "Explanation in AI: Insights from the Social Sciences" (2019,
arXiv:1706.07269); Small, Loewenstein & Slovic (2007) về nạn nhân có danh tính; Kahneman & Tversky (1979) Prospect Theory;
Cowan (2001) giới hạn trí nhớ làm việc; Kahneman et al. (1993) quy luật đỉnh – kết; hiệu ứng von Restorff (1933).
