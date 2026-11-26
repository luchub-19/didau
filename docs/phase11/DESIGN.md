# Landing "Sài Gòn về đêm" — luật cuối + số đo (giai đoạn 11, T-130)

Nguồn: `frontend/src/landing/**`. Đặc tả gốc, lý do, câu hỏi G0/G1: `PLAN.md`. Mock chuẩn: `comps/landing-v3.html`. Dữ liệu:
`DATA.md`. Ảnh duyệt G2: `screens/final/` (24 ảnh webp + 3 GIF). Landing chỉ phục vụ `/` (trang chủ); phòng và các trang khác giữ
luật `docs/phase5/DESIGN.md` + `DESIGN.md` gốc.

## 1. Luật thế giới đêm
- **Một cảnh cố định, luôn tối.** Landing không theo `data-theme` (G0 đề xuất §9 câu 1; chưa ghi người dùng duyệt). Token chỉ khai báo ở
  `:root` trong `styles/tokens.css`, không lặp trong khối dark. Gốc `.landing` đặt `color-scheme: dark`.
- **Nền đêm, chữ trăng, một màu đèn.** Nền `night`/`night-2`/`night-3`; chữ `night-moon` (chính), `-2` (phụ), `-3` (mờ, chỉ chữ ≥ 12px
  trên `night`/`night-2`); nhấn = `lamp` (đèn natri) cho chữ nhấn và dải số đo; hành động chính = coral như app (Coral Means Us).
  Chữ trên dải vàng chỉ dùng `lamp-ink` / `lamp-ink-2`. Chữ trên coral là `ink` đậm, không bao giờ trắng.
- **Cửa sổ app bên trong luôn sáng.** Hero (`RoomWindow`) và khung 4 bước (`.fs-app`) tự ép token sáng của app (`color-scheme: light`
  + khai lại `--color-*`) dù theme app là tối. Phòng mẫu phải trông giống phòng thật.
- **Chữ display** Bricolage 800: h1 `clamp(40px, 4.6vw, 64px)`, h2 `clamp(34px, 4.6vw, 60px)`, `line-height` 1.2 (dấu chồng tiếng Việt),
  `text-wrap: balance`. Chữ thường Be Vietnam Pro, thân ≥ 15px (chữ phụ trong cửa sổ app 12–12,5px đạt AA, xem §5).
- **Vẫn cấm:** chữ gradient, glass trang trí, eyebrow, 01/02/03 trang trí, hàng 3 thẻ icon, emoji làm icon, chữ trắng trên coral,
  coral cho thứ không phải "nhóm mình / hành động chính", ghim/scrub khi cuộn, parallax, hiệu ứng lặp vô hạn (trừ 3 chấm "đang gõ" ≤ 1,1 s).
- **Không bịa số.** Mọi con số lấy từ `data/demoCase.json`, `data/grid.json` hoặc `docs/proposal/mvp/script-thuyet-trinh-v2.md` §1.1.
  Quyền riêng tư (CR-11): 4 bạn chỉ ở cấp quận; điểm của người xem không rời trình duyệt, không gọi mạng khi kéo.

## 2. Token (`styles/tokens.css`, mô tả `--night-*`/`--lamp-*`)
`night #16111C` · `night-2 #201926` · `night-3 #2B2233` · `night-line #3D3247` · `night-moon #F4ECE2` (15,9:1) · `-2 #C2B4C4` (9,4:1) ·
`-3 #9A8C9E` (5,9:1) · `lamp #F2B544` · `lamp-ink #2A1A0C` (9,2:1 trên lamp) · `lamp-ink-2 #5A3B17` (5,5:1 trên lamp) ·
`coral-on-dark #FF8566` (7,8:1, viền focus + chữ nhấn trên đêm) · `house-1/2/3` (nhà ống phố đêm). Tailwind map: `night`, `lamp`, `house`,
`coral-on-dark`. Khung focus: 2px `coral-on-dark` (trên dải vàng đổi sang `lamp-ink`, class `.landing-on-lamp`).

## 3. Ngữ pháp chuyển động
Một câu: **mỗi chuyển động chạy vì một đổi trạng thái, đúng một lần, rồi đứng yên.** Bảng thời lượng: `PLAN.md` §4.5 (biến
`--landing-t-*` + `--landing-stagger` 90 ms ở đầu `landing.css`; component không viết số rời).
- Tải trang: chữ lên theo dòng 760 ms, cửa sổ "bật đèn", phố sáng dần, bốn bạn hội tụ 1500–1860 ms so le 90 ms (G1 duyệt nguyên trạng).
- Cuộn: `useOnceInView` (`waiting | entered | shown`). Phần ở dưới màn hình lúc tải mới ẩn rồi hiện; phần đã trong màn đầu hiện ngay.
- Thao tác: tim/ghim nảy ~360 ms, "Vì sao?" mở `grid-rows` 360 ms, **chốt** 620 ms (khoảnh khắc chính), điểm "Bạn" rơi 520 ms.
- **Giảm chuyển động (`useMotionTier() = 'static'`, `?motion=off` hoặc `prefers-reduced-motion`):** chỉ còn đổi opacity, nội dung
  hiện đủ ngay, không số chạy lên, không zoom ảnh, không pop. Đã kiểm 20 tổ hợp (§5).
- **Không gây dịch bố cục.** Phần tử xuất hiện/biến mất sau (hàng "đang gõ", khung bước trên mobile, lời kết luận, bản đồ) phải giữ chỗ
  sẵn (`min-height`, đè lên chỗ đã giữ, hoặc `position: absolute`), không chèn/gỡ hàng trong luồng.

## 4. Named Rules cho landing (Night Window + Always-Light đã merge vào `DESIGN.md` gốc 2026-11-26; hai luật còn lại chỉ ở đây)
**The Night Window Rule.** Landing là ngoại lệ có tên của vùng Stage: nền đêm cố định, nhưng bên trong cửa sổ app luôn là giao diện
sáng của app. Không mượn token đêm cho Operate; không mượn token app tối cho landing.

**The Always-Light Map Rule (áp cả landing).** Hai bản đồ landing (mini ở hero, lớn ở phần hoà phiếu) dùng bảng màu sáng của
`MAP_STYLE_URL` trên nền đêm; không đảo màu, không tối bản đồ cho "hợp". Ghim quán và điểm "Bạn" là HTML/SVG phủ lên bản đồ.

**The One Context Rule.** Tối đa 1 WebGL context gắn DOM: bản đồ hero chụp sang canvas 2D rồi `remove()`; bản đồ hoà phiếu chờ qua
`whenMapsReleased()` (`landing/map`) rồi mới dựng. Bản đồ mới trên landing phải đi qua `createLandingMap` để vào cổng này.

**The Honest Number Rule.** Số trên trang là số đo hoặc số tính từ dữ liệu đo; điểm của người xem tra từ lưới đường tính sẵn và
phải ghi chú khi là ước lượng.

## 5. Số đo T-130 (2026-11-26)
**Cách đo.** `npm run build` rồi phục vụ `dist/` bằng server tĩnh **có gzip** (giống Vercel; `vite preview` không nén nên bơm số byte
lên). Chrome 158 headless (SwiftShader, `__EGL_VENDOR_LIBRARY_FILENAMES` = mesa → dGPU không bị đánh thức), CDP, cache tắt,
**Fast 4G** = 9 Mbps xuống / 1,5 Mbps lên / RTT 225 ms + **CPU 4×**; 3 lượt mỗi khổ, lấy trung vị. Script: `screens/T-130-cdp.mjs`
(`perf | glfast | matrix | contrast | kbd | final | gif-open | gif-lock`). CPU phần mềm 4× là cực xấu hơn máy thật: số dưới là cận trên.

| Chỉ tiêu (PLAN §4.6) | Ngân sách | 1440 | 390 | Kết |
| :--- | :--- | :--- | :--- | :--- |
| LCP (trung vị 3 lượt) | ≤ 2,5 s | **1,45 s** (1,30 / 1,45 / 1,70) | **1,51 s** (1,50 / 1,51 / 1,54) | đạt |
| Phần tử LCP | là chữ hero, không phải bản đồ | `span.landing-intro` (từ trong tiêu đề) | `p` lede dưới tiêu đề | đạt (chữ, không ảnh/bản đồ) |
| FCP | – | 1,14–1,30 s | 1,14–1,15 s | – |
| CLS (tải + cuộn hết trang) | < 0,1 | **0,0003** | **0,006** | đạt |
| TBT (10 s sau FCP) | – (không có ngân sách) | 108 ms (66–166); long task dài nhất 304–413 ms | 0 ms; 1 long task 325–328 ms | ghi nhận |
| JS chính tải trước | – | `index-*.js` **286,8 kB gzip** (toàn app, đã gồm landing) | như 1440 | xem dưới |
| JS riêng của landing | ≤ 120 kB gzip | **≈ 41,5 kB** = code 28,4 + dữ liệu JSON 6,5 + chuỗi i18n `landing.*` 6,7 | như 1440 | đạt |
| gsap trong chunk landing | không | **không có** (chỉ `RevealStage` lười, 31 kB gzip) | – | đạt |
| Chunk bản đồ | lười | `maplibre-gl-*.js` 216,3 kB gzip, tải sau `load` (≥ 961px) / khi gần #tie | khi gần #tie | đạt |
| Ảnh | srcset, lazy | `bui-vien-night-2000.webp` 226 kB | `-1200.webp` 115 kB | đạt |
| Tổng byte đã tải (gồm tile) | – | 1,66 MB | 1,17 MB | – |
| WebGL context gắn DOM, cùng lúc | ≤ 1 | **1** (cả khi cuộn thẳng xuống #tie ngay sau tải: trước khi sửa là 2 trong ~1,6 s) | **1** | đạt |

Ghi chú:
- "JS riêng của landing" quy từ sourcemap (nhóm gzip riêng nên hơi cao). Chunk chính trước gđ11 là 267,0 kB → nay 286,8 kB (**+19,8 kB**)
  do code + dữ liệu + chuỗi của landing nằm trong chunk chính (hero/quả cầu cũ không còn được trang chủ nạp). Nếu hiểu ngân sách là "toàn bộ JS tải đầu" thì 286,8 kB **vượt**
  120 kB, nhưng 245 kB trong đó là app dùng chung (React, router, i18n, modal tạo phòng…), không phải do landing.
- Còn 1 context WebGL **không gắn DOM** do `detectWebgl()` của `motion/useMotionTier.ts` (có từ gđ4, ngoài phạm vi): chỉ chờ GC,
  không vẽ. Đề xuất: gọi `WEBGL_lose_context` ngay sau khi dò (task khác).
- Cuộn thẳng xuống ngay sau tải trước đây làm bản đồ hoà phiếu và hero cùng sống ~1,6 s (`glfast`); đã sửa bằng cổng một context.

**Kiểm bố cục + truy cập (axe-core 4.10.2).** 360 / 390 / 768 / 1280 / 1440 × VI/EN × giảm chuyển động bật/tắt = **20 tổ hợp: 0 lỗi
axe (cả serious/critical), 0 px tràn ngang**, mọi phần hiện đủ khi giảm chuyển động. axe thêm 4 lần ở trạng thái đã tương tác (đặt
điểm "Bạn", chế độ tổng km, mở bảng số đo, mở "Vì sao?" + chốt ở hero): 0 lỗi. Trước khi sửa có 3 loại lỗi serious (mục 6).
- **Tương phản chữ thật** (`contrast`: nền đọc từ ảnh chụp, chữ trộn alpha/opacity; 821 phần tử chữ nhìn thấy ở 5 cấu hình): mọi chữ
  ≥ AA (4,5:1, chữ lớn 3:1). Thấp nhất là 4,52:1 (chữ `ink-3` 12px trong cửa sổ app trên nền tô). 2 báo động còn lại (chip "Phú Nhuận"
  / "District 12" ở 1440, 2,3:1) là lỗi lấy mẫu nền lúc chip nằm sát mép; xem ảnh thật: chữ `ink-2` trên chip sáng, đạt.
- **Bàn phím** (Tab toàn trang, 1440 VI): 35 điểm dừng, thứ tự đúng bố cục, **mọi điểm dừng có vòng focus nhìn thấy**, không bẫy
  (hết trang là thoát khỏi tài liệu). Chip quận Enter → điểm "Bạn" xuất hiện, focus vào nó, mũi tên dời 0,005° và lời kết luận
  (`aria-live="polite"`) đổi; công tắc chế độ ←/→ đổi chế độ.

## 6. Lỗi tìm thấy khi đo (đã sửa trong T-130)
| # | Lỗi | Cách thấy | Sửa |
| :- | :--- | :--- | :--- |
| 1 | CLS 0,05 ở 390: hàng "đang gõ" chèn rồi gỡ khỏi luồng làm mọi phần bên dưới nhảy 42 px khi người xem đã cuộn đi | PerformanceObserver `layout-shift`, nguồn `#end`/`#numbers` | hàng đè lên chỗ tin chốt đã giữ chiều cao (`.chat-last` + `.chat-typing-row` absolute) |
| 2 | 2 WebGL context cùng gắn DOM ~1,6 s khi cuộn nhanh xuống #tie | `T-130-cdp.mjs glfast` | `whenMapsReleased()` trong `map/index.ts`, `TieMap` chờ trước khi dựng (+2 test) |
| 3 | axe `aria-prohibited-attr`: `aria-label` trên `<p class="num-big">` | axe | giá trị cuối là chữ `sr-only`, số chạy lên `aria-hidden` |
| 4 | axe `color-contrast` 2,39:1: tin của Xeko mờ bằng `opacity: .55` | axe | mờ avatar, bong bóng nền tối hơn + viền (chữ không còn opacity) |
| 5 | axe `color-contrast` 4,35:1: giờ/km 12px ở hàng đang chọn; đầu bảng "đi + về, phút" (3,5–4,2:1 dưới bóng thẻ bản đồ ≤ 960px); ô "chưa chốt" sọc trong khung lịch (4,36:1) | axe + `contrast` | `ink-3` → `ink-2` ở ba chỗ |
| 6 | Lời kết luận ở chế độ "Cộng tổng km" nói "Nếu chỉ cộng tổng km, máy sẽ chọn <quán kia>": sai vì đang ở chế độ đó | đọc chữ khi thử công tắc bằng bàn phím | khoá mới `landing.tie.verdict.diffFar` ("Nếu ưu tiên người xa nhất, app sẽ chọn …"), `model.ts` chọn khoá theo chế độ (+ cập nhật test) |

## 7. Lệch có chủ ý / chưa kiểm
- Mock v3 làm Xeko "mờ 0,55"; bản build mờ avatar + nền bong bóng (WCAG cho chữ 12px không cho phép opacity ở mức đó).
- Đo trên SwiftShader (CPU phần mềm) + CPU 4×, không trên điện thoại thật; kéo bằng ngón tay (`pointer: coarse`) chưa thử.
- Khung 4 bước trên mobile còn dịch 6–8 px/khung khi dựng (giá trị `min-height` đo ở 358px); mỗi lần < 0,001 CLS, không cộng được vào bảng.
- QR: giải mã được bằng phần mềm (jsQR) ở 200/296/600 px ra `https://didau-omega.vercel.app/`; **chưa quét bằng điện thoại thật** (việc của người, T-129).
