# LUẬT THIẾT KẾ VÙNG STAGE (giai đoạn 4)

Viết ở T-58 (2026-10-27). Chỉ áp cho **vùng Stage**; vùng Operate vẫn theo `docs/phase3/DESIGN.md`.
Kế hoạch gốc: `docs/phase4/PLAN.md`. Đọc theo mục; file task ghi mục nào thì đọc mục đó.
Trang thử trực quan: `VITE_ENABLE_MOCK=true npm run dev` → `/_styleguide` (mục "Stage" ở đầu trang).

---

## 1. Hai vùng: Stage và Operate

| | Stage | Operate |
| :--- | :--- | :--- |
| Là gì | Khoảnh khắc thấy 1 lần/ít lần: giới thiệu, quẹt phiếu, công bố, chuyển cảnh | Việc lặp lại hàng trăm lần: danh sách, lịch, form, sheet |
| Luật | File này (+ luật nền của phase 3: token, i18n, vùng chạm, chữ trắng trên coral bị cấm) | `docs/phase3/DESIGN.md` nguyên vẹn |
| Được phép | gradient/ánh sáng `--stage-*`, font tiêu đề display, camera, `gsap`, `motion`, âm thanh | không (giữ phẳng, yên) |
| Skill | `didau-stage` | `didau-ui` |

**File thuộc Stage** (thêm file Stage mới thì cập nhật bảng này trong cùng commit):
- `frontend/src/motion/*`, `frontend/src/sound/*` (hạ tầng; Operate **không** import).
- `frontend/src/stage/**` (T-59 → T-62 tạo: `hero/`, `deck/`, `reveal/`, lớp chuyển tab).
- `frontend/src/pages/HomePage.tsx` (khi T-59 thay bằng hero).
- Lớp trình diễn quanh `components/decide/SwipeDeck.tsx` và kết quả chốt quán (T-60, T-61). Logic, store,
  `services/*` vẫn là Operate: **không sửa** (giữ bản sửa `bac1f30`, `289a929`).
- CSS: token `--stage-*`, `--t-swipe|tab|fly|shot|reveal`, `--ease-camera|throw` trong `styles/tokens.css`.

Kiểm biên: chunk Operate không chứa `gsap`, `stage/*` (soát output build ở T-64).

## 2. Palette "Sài Gòn nắng" (sáng) và "Sài Gòn chạng vạng" (tối)

Ý: giấy kem ấm phơi nắng, một mặt trời coral, vài màu phố (hoa sứ, trời trưa, lá me, gạch). Coral `accent`
giữ nguyên làm màu thương hiệu: **"chỗ của nhóm mình"** (ghim, quán thắng, nút chính). Mỗi cảnh tối đa
**1 màu nhấn + 1 màu phụ** (học Stripe/Linear: hạn chế màu nhấn mỗi section).

Tương phản đo thật (công thức WCAG 2.x, script trong Nhật ký T-58), so với `--stage-paper` / `--stage-paper-2`:

| Token | Sáng | Tỉ lệ | Tối | Tỉ lệ | Dùng cho |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `stage-paper` | `#FBF3E4` | – | `#1A1420` | – | nền Stage |
| `stage-paper-2` | `#F3E3C7` | – | `#271D2C` | – | dải chú thích, khối phụ |
| `stage-ink` | `#2B1B12` | 15.0 / 13.1 | `#FBEFE0` | 15.9 / 14.3 | chữ chính, tiêu đề |
| `stage-ink-2` | `#6B4A36` | 7.2 / 6.3 | `#CDB6A4` | 9.3 / 8.3 | chữ phụ |
| `stage-accent-text` | `#B83A22` | 5.2 / 4.5 | `#FF8F70` | 8.1 / 7.3 | chữ/link coral |
| `stage-on-accent` | `#2B1B12` | 5.9 trên coral | `#2B1B12` | 5.9 trên coral | chữ trên nút coral (cả hai theme) |
| `stage-sun` | `#E9A400` | **1.95** | `#FFC94D` | 11.8 | sáng: **chỉ mảng/ánh sáng, không chữ, không icon mang nghĩa**; tối: đèn đường, được làm chữ |
| `stage-sky` | `#1F6FA8` | 4.9 / 4.3 | `#86BDE8` | 9.0 / 8.1 | màu phụ (đường đi, nước) |
| `stage-leaf` | `#3B7A3A` | 4.7 / 4.1 | `#93C58B` | 9.1 / 8.2 | màu phụ (công viên, "đi tiếp") |
| `stage-brick` | `#A8482A` | 5.3 / 4.6 | `#E8916B` | 7.5 / 6.7 | màu phụ (gạch, Bưu điện) |
| `accent` (coral) | `#FF6B4A` | 2.6 | `#FF6B4A` | 6.4 | nền nút + ghim; ghim trên nền sáng phải có viền `stage-ink` (đồ hoạ cần ≥3:1) |

- Chữ thường trên `stage-paper-2` chỉ dùng `stage-ink`/`stage-ink-2`; màu phụ trên paper-2 xuống 4.1–4.6, chỉ
  dùng cho chữ ≥18px đậm hoặc icon.
- Ánh sáng: `--stage-sunlight` (gradient 115°, coral → vàng → trong suốt; tối: coral → tím chạng vạng) và
  `--stage-shadow-long` (bóng dài **một hướng cố định**: nắng từ tây nam đổ về đông bắc). Bản đồ hero dùng cùng
  hướng: `map.setLight({ anchor: 'map', position: [1.5, 250, 50], color: '#FFD3A1', intensity: 0.55 })`.
- Dark mode: chỉ "chạng vạng" (cùng hệ, tối hơn); không làm palette thứ ba. Token tối nằm trong cả
  `[data-theme="dark"]` và khối `prefers-color-scheme` của `tokens.css`.

## 3. Font tiêu đề

Chữ thường giữ **Be Vietnam Pro**. Một font display cho tiêu đề Stage, `--stage-font-display`. Đã thử 3 ứng viên
có subset `vietnamese` (Google Fonts), chữ "Ở Ữ Ặ Đi Đâu" ở 96px, khẩu hiệu ở 64px (ảnh
`screens/T-58-stage-1440.png`, `-1280`, `-390`):

| Ứng viên | Dấu chồng ở 96px | Cảm giác | Kết luận |
| :--- | :--- | :--- | :--- |
| **Bricolage Grotesque** (800, trục opsz) | gọn, dấu không đè nhau, móc "Ở/Ữ" rõ | grotesk ấm, hơi lém, hợp người trẻ; đi cặp tốt với Be Vietnam Pro | **ĐÃ CHỐT** (G1, 2026-10-27) |
| Fraunces (700) | đẹp, dấu thanh mảnh | serif biên tập, "tạp chí ẩm thực"; lệch giọng app nhóm bạn | dự phòng |
| Big Shoulders Display (800) | ổn nhưng chữ hẹp làm dấu trông dính | thể thao (giống Lando Norris), lạnh | chỉ hợp số lớn (giờ 17:00 → 23:00) |

- Line-height tiêu đề tiếng Việt ≥ 1.2 ở cỡ ≥ 48px (dấu chồng cần chỗ); letter-spacing ≤ −0.02em.
- Cỡ hero: `clamp(40px, 6vw, 88px)`. Ở 1440px khẩu hiệu VI/EN nằm 1 dòng; ở ≤500px xuống 2 dòng, không cắt chữ.
- Nạp font: T-59 thêm `@fontsource/bricolage-grotesque` (chỉ weight 700/800, subset latin + vietnamese) trong
  chunk Stage; **không** dùng link Google Fonts trong app (trang `/_styleguide` nạp link chỉ để thử).
- Font phải có `font-display: swap`; poster hero vẫn đọc được bằng Be Vietnam Pro trước khi font về.

### Khẩu hiệu (đã chốt, PLAN §6)
| | VI | EN |
| :--- | :--- | :--- |
| Khẩu hiệu (`stage.tagline`) | Đi đâu? Rồi đi đâu nữa? | Where to? And where next? |
| Dòng phụ (`stage.subline`) | Rủ cả nhóm, xếp cả tối. | Round up the crew. Plan the whole night. |

Độ dài hai thứ tiếng gần bằng nhau (23 / 24 ký tự): một khối chữ dùng chung cho cả hai, không cần bố cục riêng.
Chú thích 5 cảnh hero: `stage.shots.*` (VI/EN đã có trong locales). Tên địa danh trên bản đồ giữ nguyên (dữ liệu OSM).

## 4. Motion v2

### Token (CSS là nguồn sự thật, `motion/tokens.ts` đọc lại; test `stage_motion` canh hai bên khớp)
| Token | Giá trị | Dùng |
| :--- | :--- | :--- |
| `--t-swipe` | 280ms | thẻ quẹt bay ra |
| `--t-tab` | 260ms | chuyển tab (View Transitions) |
| `--t-fly` | 520ms | phiếu bay vào bảng đếm |
| `--t-shot` | 1400ms | camera giữa hai cảnh hero (lite: flyTo ngắn) |
| `--t-reveal` | 1800ms | công bố quán thắng |
| `--ease-camera` | `cubic-bezier(0.65, 0, 0.35, 1)` | camera, chuyển cảnh lớn |
| `--ease-throw` | `cubic-bezier(0.32, 0.72, 0, 1)` | vật bị quăng (tiếp đà ngón tay) |

Token cũ (`--t-press…--t-moment`, `--ease-out`, `--ease-in-out`) giữ nguyên.

### Preset có tên (`motion/presets.ts`) và chuỗi tối đa mỗi khoảnh khắc
| `data-motion` | Việc | Token | Chuỗi tối đa |
| :--- | :--- | :--- | :--- |
| `hero.shot` | giới thiệu | shot / camera | 1600ms mỗi lần chuyển cảnh (scrub theo cuộn thì theo tay người dùng) |
| `hero.intro` | giới thiệu | reveal / out | 2000ms, camera xoay 24° **một lần** khi bản đồ hero vừa hiện; lite không xoay (T-59) |
| `vote.swipe` | xác nhận | swipe / throw | 320ms |
| `vote.flyIn` | giải thích | fly / out | 700ms |
| `decide.reveal` | cao trào | reveal / out | 2400ms (cả chuỗi: tối → ghim rơi → tên quán → nút) |
| `tab.switch` | liền mạch | tab / out (vào 260 ms, thoát 0,6×; T-62) | 300ms |
| `presence.pulse` | giải thích | moment / out | 600ms, **phát một lần**, không lặp |

Quy ước bắt buộc:
- Phần tử chuyển động mang `data-motion="<tên>"` (`motionAttrs(name)`); grep một tên ra đủ CSS/TS/DOM.
- Không viết số ms/easing rời trong component: `resolvePreset(name, tier)` hoặc `var(--t-*)`.
- Kịch bản (shots, thứ tự reveal) là dữ liệu thuần, có unit test riêng không cần WebGL.
- Chỉ animate `transform`, `opacity`, `clip-path`, camera bản đồ. Không `transition: all`.
- Không bounce/elastic cho UI. Quán tính khi quăng thẻ là vật lý của cử chỉ, không phải bounce trang trí.

### Ba mức (`useMotionTier()`)
| Mức | Khi nào | Hành vi |
| :--- | :--- | :--- |
| `full` | WebGL có, > 4 nhân, > 4 GB | tòa nhà 3D + bóng, camera scrub theo cuộn, đủ khoảnh khắc |
| `lite` | ≤ 4 nhân hoặc ≤ 4 GB, `?motion=lite`, hoặc FPS < 40 liên tục 2 s (`createFpsGuard` → `downgradeMotionTier`) | bỏ tòa nhà 3D/bóng, camera `flyTo` ngắn, thời lượng × `liteScale` |
| `static` | `prefers-reduced-motion`, không WebGL, `?motion=off` | poster + chữ; mọi khoảnh khắc chỉ đổi màu/opacity (`move: false`, nhịp `--t-ui`) |

Ưu tiên: URL > reduced-motion > WebGL > phần cứng. Mức chỉ **hạ**, không tự nâng trong phiên.

### Gỡ lỗi
`?motion=slow` (mọi thời lượng × 4), `?motion=off`, `?motion=lite`. Log `stageLog()` có tiền tố `[stage]`, chỉ in
ở dev: lọc console bằng `[stage]`. Trang thử gắn `window.__stageLab.map` để soi bản đồ từ DevTools.

## 5. Âm thanh

- `sound/sound.ts` tổng hợp WebAudio, không file: `tick` (60ms, quẹt thẻ), `chime` (380ms, reveal),
  `whoosh` (320ms, chuyển cảnh lớn). Âm lượng tổng 0.18. Không lặp, không nhạc nền.
- Mặc định **tắt**; `useSound()` lưu `localStorage['didau.sound'] = 'on' | 'off'`.
- AudioContext chỉ tạo khi đang bật **và** trong/sau thao tác người dùng; tắt là `close()` ngay.
- Chỉ phát ở khoảnh khắc: quẹt thẻ (`tick`), công bố quán (`chime`), chuyển cảnh hero/reveal (`whoosh`, tuỳ chọn).
  Không phát cho nút thường, toast, vote ở danh sách Operate.
- Nút bật/tắt (làm ở T-61): (1) góc phải header trang chủ, cạnh nút ngôn ngữ, nút icon loa có nhãn
  `sound.turnOn` / `sound.turnOff` (aria-pressed); (2) mục Cài đặt trong tab Nhóm, kèm `sound.hint`.

## 6. Ngân sách hiệu năng (chép PLAN §8, đo ở T-64)

| Hạng mục | Ngân sách |
| :--- | :--- |
| JS ban đầu trang chủ (không tính chunk bản đồ) | ≤ 171 kB + 45 kB gzip |
| Phòng (vùng Operate) | không tăng quá 25 kB gzip so với T-55 |
| LCP trang chủ (desktop, Lighthouse) | ≤ 2,5 s (poster tĩnh là LCP, bản đồ tải sau) |
| Khung hình hero, GPU tích hợp, 1440p | ≥ 50 fps trung bình; < 40 fps 2 s liên tục → tự hạ `lite` |
| CLS | ≤ 0,05 |
| Bản đồ hero | ngừng render khi ra khỏi khung nhìn / tab ẩn |
| Âm thanh | không giữ AudioContext khi tắt; chỉ tạo sau thao tác người dùng |

### Số đo cuối (T-64, 2026-10-28, `vite build` + Chrome thật GPU, màn 90 Hz)
| Hạng mục | Trước (T-55) | Sau (T-64) | Kết luận |
| :--- | :--- | :--- | :--- |
| Chunk vào `index.js` (trang chủ + phòng dùng chung) | 171 kB | **185,6 kB** gzip | đạt (≤ 216) |
| Trang chủ: chunk hero tải lười ngay sau lần vẽ đầu (`HeroScroll` 20,2 + gsap 28,2 + `HeroMap` 4,4) | – | +52,8 kB | ngoài đường găng LCP; mức `static` không tải; cộng cả vào thì 238 kB > 216 → chấp nhận, ghi nhận |
| Phòng: entry | 171 kB | 185,6 kB (+14,6) | đạt (≤ +25) |
| Phòng: bản đồ (`MapView` + `maplibre-gl`) | 228 kB | 229,7 kB | không đổi đáng kể |
| Phòng: lười theo khoảnh khắc | – | `StageDeck` 46,6 (mở phiên quẹt), `RevealStage` 4,0 + gsap 28,2 (mở sheet chọn hộ) | người dùng chọn giữ `motion` (2026-10-28) |
| LCP trang chủ desktop 1436px | – | 176 ms (cache ấm) · 2,22 s (lần đầu, ngay sau đổi cỡ cửa sổ); phần tử LCP = H1 | đạt; đo bằng PerformanceObserver, **không phải Lighthouse** (không cài) |
| CLS | – | 0,0000 | đạt |
| FPS hero 1436px, cuộn đều cả phim 12 s | – | TB 89,9 · p5 89,3 · khung chậm nhất 22 ms, 0 khung > 25 ms | đạt (≥ 50) |
| Operate không kéo `gsap`/`motion` | – | gsap chỉ ở chunk `index-*` phụ (dùng chung HeroScroll/RevealStage), `motion` chỉ ở `StageDeck`; entry không chứa | đạt |

Kết quả thử 3D ở T-58 (OpenFreeMap Liberty, pitch 60): lớp tòa nhà tên **`building-3d`** (`fill-extrusion`,
minzoom 14, source `openmaptiles`). Q1 đủ dày: 71 khối trong khung ở Bến Thành, 65 ở Nguyễn Huệ (khung 918×480).
FPS thật trên GPU: chưa có số (headless không đại diện); người dùng lướt thử ở G1 thấy mượt, T-59 đo số.
Nhận xét G1: tòa nhà OSM ở TP.HCM là **khối hộp đơn giản, ít chi tiết** (chỉ footprint + chiều cao, không mô hình).
Hướng xử lý ở T-59 (không thêm Three.js): chọn góc camera nơi khối dày và có tòa cao (Bitexco, Nguyễn Huệ, bờ sông);
tăng `fill-extrusion-opacity` ≈ 0.9, tô màu ấm theo chiều cao (`interpolate` trên `render_height`), dùng ánh sáng
nghiêng thấp để mặt tường tương phản; để chữ, ghim coral và đường nối chặng gánh phần "chi tiết" thay cho mô hình.

## 7. Danh sách cấm (cập nhật cho giai đoạn 4)

Giữ toàn bộ DESIGN phase 3 §11, trừ hai nới lỏng **chỉ trong Stage**:
- Gradient: chỉ `--stage-sunlight` (ánh sáng), không gradient trên chữ, nút, thẻ.
- Blur: chỉ lớp nền sau chữ đè lên bản đồ hero (`backdrop-filter` ≤ 12px), không glass trang trí.

Vẫn cấm ở mọi vùng: bounce/elastic cho UI · hiệu ứng lặp vô hạn (chấm nhấp nháy, shimmer, pulse lặp, xoay mãi) ·
chữ trắng trên coral · emoji làm icon · eyebrow viết hoa giãn chữ · đánh số 01/02 trang trí · con trỏ chuột tuỳ biến ·
cuộn mượt toàn trang (Lenis…) · video nền · Three.js/R3F · chuỗi xuất hiện lúc tải trong phòng · CTA bị hiệu ứng
che hoặc chỉ hiện sau khi cuộn (Tạo phòng / Nhập mã luôn thấy ở cảnh 1 và 5, Tab tới được).

## 8. Checklist trước DONE (task Stage)

1. Mỗi phần tử chuyển động có `data-motion`; không số ms rời; có nhánh `static` (đã thử `?motion=off`).
2. Thử `?motion=slow` và `?motion=lite`; quay GIF ngắn vào `docs/phase4/screens/`.
3. Chụp 1280, 1440, 390 (VI + EN, sáng; tối nếu task ghi). Tự chấm: một khoảnh khắc mỗi màn? CTA luôn thấy?
   mỗi cảnh ≤ 1 nhấn + 1 phụ? Sửa ≥ 3 lỗi rõ nhất rồi chụp lại.
4. Mọi chữ (kể cả chú thích cảnh, aria-label) qua `t()`, đủ VI/EN; địa danh giữ nguyên.
5. Bàn phím: Tab tới CTA, Esc/Enter dùng được cho thẻ quẹt và reveal; vùng chạm ≥ 44px.
6. Âm thanh tắt mặc định; không tạo AudioContext khi chưa bật.
7. Operate không import `gsap`, `motion`-lib hay `stage/*`; `npm run lint && npm test && npm run build` xanh.
8. Không chạy được trình duyệt thật → ghi "chưa kiểm tra trực quan", không báo đã kiểm tra.
