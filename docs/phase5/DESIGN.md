# LUẬT THIẾT KẾ "KHÔNG GIAN PHÒNG" (giai đoạn 5)

File này **ghi đè** `docs/phase3/DESIGN.md` ở phần bố cục trang phòng (§5 cũ), thẻ quán và trạng thái theo giai đoạn.
Token màu, chữ, component, song ngữ (§2–4, §6, §9 của gđ3) và luật vùng Stage (`docs/phase4/DESIGN.md`) vẫn giữ nguyên.
Mock: `docs/phase5/mock/*.dc.html` — chỉ đọc bố cục và thứ bậc; màu hex, icon SVG tự vẽ và ô ảnh sọc trong mock là
nháp, code thật dùng token, `components/ui/Icon.tsx` (Phosphor) và ảnh thật/minh hoạ.

## 1. Thứ bậc trong phòng
Mỗi lúc người dùng phải thấy ngay ba thứ: **đang ở bước nào**, **việc chính của bước này**, **nhóm đang ở đó**.
- Nút chính (`accent`) chỉ một cái mỗi bước (bảng §3). Mọi hành động khác: nút phụ (`surface-2`) hoặc liên kết.
- Cảnh báo chỉ hiện ở nơi nó liên quan (xung đột trên mục lịch bị trùng, vượt ngân sách trên quán) — không còn banner
  ghim toàn trang.
- Trạng thái kết nối: viền avatar của mình (xanh `success` = đang kết nối, xám = mất); mất kết nối lâu vẫn dùng
  `ConnectionBanner`.

## 2. Bố cục
### Desktop ≥1280px — 3 cột, cao `100dvh`, trang không cuộn, mỗi cột tự cuộn
| Cột | Rộng | Nội dung |
| :--- | :--- | :--- |
| Trái | 400px (giai đoạn ①: 560px) | Giai đoạn ①: tìm kiếm + dải gợi ý + khay danh sách nhóm. ②: danh sách nhóm. ③④: quán đã chốt + đi kèm + dự bị |
| Giữa | phần còn lại | Bản đồ tràn khung; trang chi tiết quán là panel 500px nổi bên phải bản đồ |
| Phải | 72px thu gọn / 440px mở | Kế hoạch. Thu gọn ở ①②, tự mở ở ③④; người dùng bấm để mở/đóng bất kỳ lúc nào |

Không còn `max-w-7xl`: khoảng dư trên màn rộng thuộc về bản đồ. Đổi rộng cột bằng chuyển `width` một lần
(`--t-ui`, `--ease-out`), bản đồ gọi `map.resize()` qua `ResizeObserver`.

### Desktop 1024–1279px
Cột trái 360px; cột Kế hoạch mở dạng ngăn kéo đè lên bản đồ (không đẩy bản đồ). Panel chi tiết 440px.

### Mobile <1024px — 2 tab có nhãn chữ
- **Khám phá**: bản đồ toàn màn + sheet danh sách (3 nấc: thu 96px · nửa màn · gần đầy). Giai đoạn ①: sheet mở nửa màn,
  đầu sheet là ô tìm kiếm + dải gợi ý.
- **Kế hoạch**: thanh ngân sách + timeline + nút gửi.
- Trang chi tiết quán: sheet toàn màn, vuốt xuống để đóng.
- Thanh đỉnh: nút về · tên phòng + "Bước x/4 · tên bước" · nút "N" người xem · avatar.

### URL
`?tab=explore|plan` (mobile). Link cũ: `places|map` → `explore`, `schedule` → `plan`, `group` → `explore` và mở menu
avatar. `?place=<id>` mở trang chi tiết (chia sẻ được). Back của trình duyệt đóng trang chi tiết trước, rồi mới đổi tab.

## 3. Giai đoạn (hàm thuần `room/phase.ts`)
Tính theo thứ tự, điều kiện đầu tiên đúng thì dừng:
| Mã | Điều kiện | Nút chính | Nổi | Chìm |
| :--- | :--- | :--- | :--- | :--- |
| `send` ④ | `room.status === 'FINALIZED'` hoặc `schedule.length > 0` | Gửi kế hoạch cho nhóm | Cột Kế hoạch mở, lộ trình trên bản đồ | Tìm kiếm, dải gợi ý |
| `lock` ③ | có quán `ACCEPTED` | Xếp lịch tự động | Quán đã chốt, cột Kế hoạch mở | Vote, dải gợi ý |
| `tie` ②b | ≥2 quán chưa REJECTED và `hints[0].type ∈ {TIE_AT_TOP, NEAR_TIE}` | Để trọng tài chọn | Khối hoà phiếu đầu danh sách | Nút thêm quán thu nhỏ |
| `vote` ② | ≥2 quán chưa REJECTED | (không có nút accent; hành động chính là ♥ trên từng quán) | Danh sách + thanh "x/y đã chọn" | Dải gợi ý thành nút "Thêm quán khác" |
| `gather` ① | còn lại | Thêm vào danh sách (trên từng gợi ý) | Ô tìm kiếm lớn, 4 dải gợi ý | Vote, cột Kế hoạch |

- **Thanh bước** (`PhaseStepper`): 4 bước, bước đã qua có dấu ✓ (`success`), bước hiện tại nền `accent-soft`.
  Bấm bước đã qua = **xem lại** (đổi bố cục, không đổi dữ liệu); khi giai đoạn tính từ dữ liệu đổi thì bỏ chế độ
  xem lại. Bước chưa tới không bấm được (`aria-disabled`, tooltip "Cần …").
- Đổi giai đoạn: bố cục chuyển trong ≤280 ms, không phát âm thanh, không toast (reveal của gđ4 vẫn là cao trào duy nhất).

## 4. Thanh đỉnh và menu danh tính (`IdentityMenu`)
Trái → phải: nút về · tên phòng + mã (bấm để chép) · `PhaseStepper` (giữa) · "N đang xem" (chồng ≤3 avatar + số) ·
nút mời · avatar + tên + vai trò (`Chủ phòng`/`Thành viên`) + mũi tên.
- "N đang xem" = số peer còn hạn trong `usePresenceStore` (TTL 15 s) + 1 (mình). Bấm: danh sách thành viên, chia
  "Đang xem" / "Vắng".
- Menu avatar: Mời bạn (mã, link, QR nếu đã có) · Thành viên · Thông tin chuyến (ngày, giờ, ngân sách, điểm hẹn) ·
  Chiến lược hoà phiếu (chỉ chủ phòng, khi chưa FINALIZED) · Ngôn ngữ · Giao diện · Âm thanh.
- Avatar (`CharacterAvatar`): nhân vật DiceBear sinh trên máy từ `member.avatar_url`. Giá trị lưu dạng URL chuẩn
  DiceBear (`https://api.dicebear.com/9.x/<style>/svg?seed=<seed>`, khớp ví dụ trong CONTRACTS) nhưng **không tải
  URL đó** — chỉ đọc `style` + `seed` rồi sinh SVG tại chỗ. `avatar_url` rỗng/lạ → seed = `member.id`.
  Chọn lại nhân vật chỉ được **trước khi** tạo/vào phòng (API chưa có đổi avatar, `BACKEND-NOTES.md` #3).

## 5. Thẻ quán trong danh sách (`PlaceRow`)
Ngang: ảnh vuông 84px (desktop) / 72px (mobile) · khối chữ · nút ♥ + số.
- Tên 16px đậm (2 dòng tối đa) · meta 14px `ink-2`: danh mục · khoảng cách tới điểm hẹn · giá "~45k".
- Nhãn (tối đa 1): "Đã chốt" (`success`) > "Đang dẫn" (`accent-text` trên `accent-soft`) > "Vượt ngân sách" (`warning`).
- Hàng avatar người đã thích: chỉ hiện người thấy được qua `VOTE_UPDATED.voter_id` trong phiên này; còn lại hiện số.
  (Danh sách đầy đủ cần backend, `BACKEND-NOTES.md` #2.)
- Bấm thẻ = mở trang chi tiết + sáng ghim trên bản đồ. Rê chuột = presence `setHoverPlace` (giữ như gđ4).
- Vote đổi nhãn: up = **Muốn đi** (♥), down = **Không** (✕, chỉ có trong trang chi tiết và menu ⋯ của thẻ). API không đổi.
- Bỏ: badge nguồn OSM/Google, badge "Mới đề xuất", nút "Xem trên bản đồ" (bản đồ luôn ở cạnh).
- Danh sách dài: ô "Lọc trong danh sách" + bộ lọc danh mục thu vào một nút ⋯ khi >8 quán.

## 6. Trang chi tiết quán (`PlaceDetail`)
Thứ tự = thứ người dùng cần để quyết: ảnh → hợp với nhóm không (giá, khoảng cách, giờ mở so với khung giờ phòng) →
bạn bè nói gì → giới thiệu → đánh giá người lạ → bản đồ nhỏ + chỉ đường.
1. Bộ ảnh 16:9 (desktop 230px cao, mobile 280px), vuốt / ← →, chấm trang, "1/8".
2. Tên 24px · meta: danh mục · "~45k/người" · "450 m từ điểm hẹn" · "Đang mở · tới 23:00" (xanh nếu phủ khung giờ
   phòng, cam nếu đóng sớm hơn `end_minute`).
3. Lời người đề xuất (`place.notes`) trong khối `accent-soft` kèm avatar.
4. Giới thiệu + "Nên thử" (tuyển chọn, theo ngôn ngữ đang chọn).
5. Đánh giá: "Bạn bè" (`InternalReviews`, có nút viết) rồi "Google" (UI Kit, chỉ khi cờ bật và có key).
6. Thanh dính đáy: avatar người muốn đi · **Không** (viền) · **Muốn đi** (`accent`). Đã FINALIZED: thay bằng "Chỉ đường".
- Desktop: phím ↑ ↓ sang quán trước/sau trong danh sách (chỉ khi focus trong panel), Esc đóng.

### Tầng dữ liệu (tầng trên có thì dùng, thiếu thì xuống tầng dưới, có thể trộn)
| Tầng | Nguồn | Cho gì |
| :-: | :--- | :--- |
| 1 | `curated/hcm.json` (T-70) | Ảnh, giới thiệu vi/en, nên thử, mức giá, tag |
| 2 | Google Places UI Kit (cờ `PLACES_PROVIDER=google` + key) | Ảnh, rating, review, giờ — giao diện của Google, giữ logo; tải khi mở trang |
| 3 | iframe Maps Embed (`place` mode, cần key, miễn phí) | Bản đồ nhỏ + sao + số review khi không có tầng 2 |
| 4 | OSM (`opening_hours_raw`, `cuisine`, `url`) + minh hoạ danh mục | Luôn có |
Backend vẫn không đọc/lưu gì của Google (luật repo). Không có key → bỏ tầng 2–3, không báo lỗi.

## 7. Dải gợi ý (giai đoạn ①)
Ngang, cuộn được, thẻ 200px: ảnh 4:3 · tên · 1 dòng meta · nút ＋ (44px) thêm một chạm. Tên dải nói lý do:
1. **Gần điểm hẹn** — từ `/pois` quanh `origin` (logic của `NearbySuggestions`).
2. **Bộ sưu tập** — chip chủ đề (Cà phê view đẹp, Ăn đêm Q1, Hẹn hò, Rẻ mà ngon…) lọc dữ liệu tuyển chọn.
3. **Hợp giờ và ngân sách** — lọc phía client: mở phủ khung giờ phòng, giá ≤ ngân sách còn lại.
4. **Nhóm đang để ý** — quán bạn bè đang mở xem (presence), kèm avatar; chỉ hiện khi ≥2 người online.
Quán đã trong danh sách: nút ＋ thành ✓ "Đã thêm". Dải rỗng thì ẩn cả dải (không hiện tiêu đề trơ trọi).

## 8. Kế hoạch và ngân sách
- **Ngân sách = mỗi người, cả buổi.** `spent = Σ estimated_cost` của quán trong lịch (mỗi quán một lần);
  `unknown` = số mục có `estimated_cost` 0/null (hiện "chưa rõ giá", **không** coi là miễn phí — xem §11 câu b).
- `BudgetMeter`: "295k / 400k" · thanh chia đoạn theo từng điểm · "Còn dư 105k · 1 điểm chưa rõ giá".
  Vượt: thanh và số chuyển `warning`, dòng phụ chỉ quán đắt nhất. Không có `budget_limit`: chỉ hiện tổng.
- "Vượt ngân sách" trên quán (§5) = giá quán > ngân sách − tổng các quán khác đã trong lịch.
- Timeline: giờ ở trái, chấm + đường dọc, thẻ điểm dừng có ảnh nhỏ; giữa hai điểm ghi thời gian di chuyển.
  Xung đột hiện ngay dưới mục bị trùng (chip `warning` + "Sửa"), bỏ banner chung.
- Chân cột: **Gửi kế hoạch cho nhóm** (chia sẻ link, `shareRoom`) · "Thêm vào lịch" (.ics **cả lịch**, mở rộng
  `stage/reveal/actions.ts`) · "Xếp lại tự động" (`AutoPlanButton`).
- Thêm quán: chip mức giá thay ô số — `<50k` · `50–150k` · `150–300k` · `300k+` · "Tự nhập"; lưu giá giữa khoảng.

## 9. Tạo phòng
Một màn, mọi câu có giá trị mặc định, bấm "Tạo phòng" ngay được:
tên của bạn + avatar + "Đổi nhân vật" · tên buổi · khi nào (Hôm nay / Ngày mai / Chọn ngày + khung giờ, mặc định
17:00–23:00) · **Nhóm hẹn nhau ở đâu?** (Chỗ tôi đang đứng / Tìm địa điểm / Để sau) · **Ngân sách mỗi người, cả buổi**
(chip: Dưới 200k · 200–500k · 500k–1tr · Không giới hạn · Tự nhập).
- Hỏi quyền vị trí **chỉ sau khi bấm** "Chỗ tôi đang đứng"; bị từ chối → chuyển sang "Tìm địa điểm", không báo lỗi đỏ.
- Có toạ độ thì suy `city` (HCM/HN theo khung toạ độ), bỏ ô chọn thành phố; "Để sau" giữ ô chọn thành phố.
- Vào phòng bằng mã (`JoinRoomModal`): cũng có tên + avatar + "Đổi nhân vật".

## 10. Chữ và khoảng trắng
Tên quán 16px (chi tiết 24px) · meta 14px · chữ phụ 13px chỉ cho thông tin không cần đọc kỹ · tiêu đề giai đoạn ①
26px · khoảng đệm cột 20–24px · khoảng giữa thẻ 12px. Không nhãn VIẾT HOA giãn chữ (mock có, **không** làm theo):
tiêu đề mục dùng 15px đậm `ink-2`.

## 11. Câu hỏi mở cho cổng G1
a. Kiểu trọng tài mặc định khi bấm "Để trọng tài chọn": **SMART** (đề xuất — ra kết quả ngay, đúng nghĩa "trọng tài")
   hay SWIPE (cả nhóm quẹt, vui hơn nhưng lâu)?
b. `estimated_cost = 0`: hiện "chưa rõ giá" (đề xuất). Muốn phân biệt "miễn phí" cần trường mới → `BACKEND-NOTES.md` #6.
c. Style nhân vật DiceBear: `adventurer`, `notionists`, `fun-emoji` hay `thumbs` (T-68 kiểm giấy phép trước khi dùng).
d. 1024–1279px: Kế hoạch là ngăn kéo đè bản đồ (đề xuất) hay vẫn 3 cột hẹp?
e. Giữ bộ lọc danh mục và sắp xếp "Mới nhất" (thu vào nút ⋯) hay bỏ hẳn?

## 12. Checklist trước DONE (cộng với checklist gđ3 §12)
- Đủ 5 giai đoạn có ảnh chụp (desktop 1440 + mobile 390/500) ở cả sáng và tối, VI và EN cho màn có chữ mới.
- Không cuộn ngang ở 375px; vùng chạm ≥44px; Tab đi đúng thứ tự cột trái → bản đồ → Kế hoạch.
- Thiếu dữ liệu (không ảnh, không giá, không giờ, không điểm hẹn, 0 quán) vẫn có bố cục đủ.
- `?motion=off` không chuyển động; đổi giai đoạn không giật bản đồ (CLS ≈0).
- Ghi số bundle sau task vào PROGRESS.
