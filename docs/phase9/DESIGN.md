# Quả cầu tải bản đồ — luật cuối (giai đoạn 9, T-115)

Thay `docs/phase6/DESIGN.md` §7. Nguồn: `frontend/src/stage/hero/HeroGlobe.tsx` + `frontend/src/stage/hero/globe/*`.
Đặc tả gốc, lý do, câu hỏi G1: `PLAN.md`. Ảnh duyệt G2: `screens/` (16 ảnh). Chỉ đụng hero trang chủ; không có cầu ở mức `static`.

## 1. Luật

### Hiện / ẩn
- Hiện khi chunk `HeroScroll` đang tải (fallback `Hero`) hoặc `mapState` chưa `ready`; chỉ sau 300 ms (tải nhanh thì không nháy),
  **trừ** instance thứ hai trong `HeroScroll` khi cờ `isGlobeOnScreen` đã bật (hiện ngay, không để trống 300 ms).
- **Một đồng hồ chung** (`globe/clock.ts`) cho cả hai instance: góc xoay nối tiếp, không giật khi chunk về.
- `failed` ⇒ gỡ ngay, poster ở lại. `ready` đến trước 300 ms (cầu chưa hiện) ⇒ không có cầu, bản đồ mờ chéo như trước gđ9.

### Hình
- Canvas 2D chấm bi chiếu trực giao từ bitmask Natural Earth 1° (`mask.ts`, RLE, 1 501 B gzip; sinh bằng
  `scripts/gen_globe_mask.mjs` từ devDep `world-atlas@2.0.2`). Nghiêng cố định 22° khi xoay, 45°/s (một vòng 8 s).
- Đường kính **120 px (mobile) / 168 px (md trở lên)**. Canvas rộng 128 % đường kính (`GLOBE_HALO`) để chứa khí quyển.
- Màu từ token `--stage-*` (paper/ink/ink-2/accent-text/sun/sky + leaf/brick cho chấm bạn bè), đọc lại khi đổi `data-theme` hoặc
  `prefers-color-scheme`. 6 mức sáng lambert × 3 dải độ sâu. Theme tối: ~18 % chấm đất phía đêm là đèn thành phố (hash tất định).
- Ghim = `--stage-accent-text`. 4 chấm bạn bè (sky/leaf/sun/brick) là **hình minh hoạ cố định**, không phải vị trí hay dữ liệu thật.

### Mốc tải (xương sống: `globe/progress.ts`, `HeroMap` báo `onProgress`/`onReady`/`onFail`)
| Mốc | Phát ở | Cầu | Dòng `role="status"` (VI / EN) | Vòng |
| :--- | :--- | :--- | :--- | :--- |
| `loading` | fallback `Hero` | xoay | Đang tải bản đồ… / Loading the map… | 0 % |
| `code` | `HeroScroll` mount | xoay tiếp | Đang dựng kiểu bản đồ… / Styling the map… | 22 % |
| `style` | `map.on('load')` | quay về TP.HCM (106,7°E 10,8°N), Hermite giữ vận tốc, 1,1–2,0 s | Đang tải đường phố… / Loading streets… | 48 % |
| `tiles` | `prewarm()` xong | ghim nảy 350 ms + 4 chấm bay về (650 ms, lệch 90 ms) + gợn sóng 1,6 s | Đang dựng toà nhà 3D… / Raising 3D buildings… | 76 % |
| `ready` | `map.once('idle')` | lao xuống | Tới nơi rồi! / Here we are! | 100 % |
- Giữa hai mốc vòng nhích tới 70 % khoảng kế bằng CSS transition 5 s (không rAF, không bao giờ tự đạt mốc kế). Vòng `aria-hidden`.
- `ready` tới sớm hơn biên đạo ⇒ tăng tốc phần còn lại (×2,6); mạng rất nhanh (`ready` trước khi dừng) ⇒ quay nhanh ≤ 500 ms, bỏ
  ghim/chấm bạn bè/gợn sóng.

### Trần trễ (G1 câu 3 = 600 ms) và cách rời
- Sau `ready`, cầu bắt đầu rời **muộn nhất 600 ms** (`GLOBE_STORY_CAP_MS`, `globe/exit.ts`) dù biên đạo chưa xong, kể cả tab ẩn.
- `dive` (`full`): WAAPI (không dùng `@keyframes` CSS — CSS áp easing từng đoạn nên cầu khựng ở 35 %) trên hộp cầu
  `scale 1 → 2,2 → 16` + `opacity → 0`, và trên lớp bản đồ `opacity 0 → 1`, `scale 1,18 → 1`, `blur 8 → 0 px`; dài 1 400 ms
  (`--t-shot`), easing `--ease-camera`/`--ease-out`. Vòng + dòng trạng thái mờ bằng CSS `hero-globe-out`. Xong ⇒ huỷ animation
  (hết `filter`), **sau đó** mới `startIntro()` (orbit của `HeroMap`).
- `lite` / `prefers-reduced-motion`: 20 s/vòng (18°/s), canvas 15 fps, ánh sáng vẽ tĩnh, hiện thẳng ở ghim, không chấm bạn bè/gợn
  sóng, không lao xuống (`fade`: cầu mờ `--t-shot`, bản đồ mờ chéo `--t-moment` như cũ).

### Hiệu năng (luật gđ6 §7 "chỉ transform" **đã đổi** theo G1 câu 5)
- Canvas vẽ lại mỗi khung. **Thiết kế: khoá 30 fps** (`full`) / 15 fps (`lite`), dừng rAF khi tab ẩn hoặc cầu ngoài khung
  (IntersectionObserver), DPR ≤ 2; lớp biển/rìa vẽ **một lần**; ≤ 20 lần `fill` mỗi khung. Khung tĩnh (`parked`, `lite` sau ghim)
  chỉ vẽ một lần.
- **Lúc đo (T-115) bộ khoá 30 fps không hoạt động: cầu vẽ 60 khung/giây** — xem §3 và PROGRESS.

## 2. Số đo (T-115, 2026-11-21)
Bản `vite build` (không phải dev server) phục vụ bằng server tĩnh; Chrome 157 headless **GPU thật (Intel Iris Xe, ANGLE GL; dGPU
không đánh thức)**, CDP, cache tắt. Mạng = đúng preset DevTools: **Fast 4G** 9 Mbps, RTT 225 ms; **Slow 4G** 1,6 Mbps, RTT 562,5 ms.
"Trước" = `a1f3645^` (ngay trước T-110), dựng bằng `git archive`; "Sau" = HEAD (`1257578`). Mốc tính từ `ready` (bản trước không có
vòng tiến độ: `ready` = lúc opacity lớp bản đồ bắt đầu tăng). Hiện xong = opacity tính được ≥ 0,99. 3 lượt mỗi ô, độ lệch ≤ 2 ms
giữa các lượt (đồng hồ rAF); riêng `ready` tuyệt đối dao động ±300 ms vì tile tải thật qua mạng.

### Thời điểm bản đồ hiện (sau `ready`)
| Cấu hình | Trước: bắt đầu → xong | Sau: bắt đầu → xong | Cầu gỡ khỏi DOM (sau) | Chênh "xong" |
| :--- | :--- | :--- | :--- | :--- |
| 1280, Fast 4G | +0 → **+383 ms** | +400 → **+1 233 ms** | +1 650 ms | **+850 ms** |
| 1280, Slow 4G | +0 → **+383 ms** | +400 → **+1 233 ms** | +1 650 ms | **+850 ms** |
| 390 DPR 2, Fast 4G | +0 → **+384 ms** | +400 → **+1 233 ms** | +1 650 ms | **+850 ms** |
- `ready` tuyệt đối không đổi giữa trước/sau (Fast ≈ 8,2–8,4 s; Slow ≈ 22,1–22,8 s): gđ9 không làm bản đồ tải chậm hơn, chỉ làm
  khâu hiện chậm hơn.
- **So với trần G1** (bản đồ hiện xong không muộn hơn "bây giờ" quá 600 ms):
  - theo định nghĩa của `PLAN.md` §4.2 (bây giờ = mờ 1 400 ms ngay khi `ready`, như mock): xong +1 233 ms < 1 400 ms ⇒ **giữ**,
    cả Fast lẫn Slow 4G;
  - theo **code thật trước gđ9** (mờ 600 ms ⇒ +383 ms): chậm hơn **+850 ms > 600 ms ⇒ không giữ** (vượt 250 ms). Phần lớn là chính
    1 400 ms lao xuống đã duyệt ở G1. Nếu coi mốc này mới là chuẩn thì cần rút lao xuống xuống ≈ 900 ms (hiện không có token ngắn
    hơn `--t-shot` mà dài hơn 600 ms) — **để G2 quyết**.

### Kích thước (gzip -9, từ file build)
| Chunk | Trước | Sau | Chênh |
| :--- | :--- | :--- | :--- |
| `index` (entry; chứa cầu vì fallback `HeroStatic` import `HeroGlobe`) | 253,91 kB | 261,87 kB | **+7,96 kB** |
| `HeroScroll` | 20,17 kB | 20,40 kB | +0,23 kB |
| `HeroMap` | 4,40 kB | 4,55 kB | +0,15 kB |
- Entry tăng 7,96 kB, **nhiều hơn** ước lượng ~2,5 kB của T-110 (mask 1,5 kB; phần còn lại là biên đạo, ánh sáng, palette, tiến độ,
  thoát, i18n). Cả entry lẫn bảng ngân sách `docs/phase4/DESIGN.md` §6 (185,8 kB lúc T-64) đã lệch từ trước gđ9 (253,9 kB) — bảng
  đó cần dựng lại ở một task riêng; gđ9 chỉ cộng thêm số trên.

### CPU khi cầu xoay (giữ cầu ở trạng thái đang tải bằng cách chặn chunk `HeroScroll`; 10 s, sau 4 s khởi động)
CPU tiến trình = tổng mọi tiến trình Chrome (trình duyệt + renderer + GPU), % của **một lõi**. Chính của luồng chính = `TaskDuration`.
| Cấu hình | Trước | Sau (đã ship) | Sau, vá thử khoá 30 fps* |
| :--- | :--- | :--- | :--- |
| 1280 DPR 1 — CPU tiến trình, không throttle | 12,2 % | **26,9 %** | 19,2 % |
| 390 DPR 2 — CPU tiến trình, không throttle | 12,9 % | **25,2 %** | 16,9 % |
| 1280 — luồng chính, CPU 4× | 1,8 % | **12,3 %** (script 9,3 %) | 6,2 % |
| 390 DPR 2 — luồng chính, CPU 4× | 1,9 % | **8,0 %** (script 4,7 %) | 4,5 % |
| Số lần vẽ cầu / 10 s | – (CSS, 0) | **600** (60 fps) | 300 (30 fps) |
| JS mỗi lần vẽ (script ÷ số lần vẽ), không throttle | – | 0,24 ms (1280) · 0,19 ms (390) | 0,26 · 0,16 ms |
| JS mỗi lần vẽ, CPU 4× | – | 0,77 ms (1280) · 0,39 ms (390) | 0,72 · 0,41 ms |
| FPS trang (rAF), p95 khung | 60 · 16,7 ms | 60 · 16,7–16,8 ms | 60 · 16,7 ms |
- *Bản vá thử chỉ có trong scratchpad (thay `last = ts - ((ts - last) % frameMs || 0)` bằng `last = ts`), **chưa vào repo**.
- Không có khung rớt ở bất kỳ ô nào (khung chậm nhất 16,8 ms) — kể cả CPU 4×. Thời gian GPU/raster không đo riêng; phần GPU
  nằm trong "CPU tiến trình".
- Cầu thêm ≈ +14,7 điểm % (1280) / +12,3 điểm % (390) so với cầu CSS cũ khi đang xoay; ≈ +7 / +4 điểm % sau khi vá khoá 30 fps.

### Chưa đo
Pin/nhiệt và điện thoại thật (G2, việc của người); FPS của dive/ghim trên màn ≥ 90 Hz; đổi theme giữa lúc tải bằng mắt.

## 3. Lỗi tìm thấy khi đo (chưa sửa — ngoài phạm vi T-115)
**Bộ khoá 30 fps của `GlobeCanvas` (`tick`) thực tế vẽ 60 khung/giây ở màn 60 Hz.**
- Đo: 1 instance duy nhất, rAF của trang 60 Hz; 180 `clearRect` trong 3 s (probe) và 1 200 `drawImage` trong 10 s (2 lần mỗi khung)
  = 60 lần vẽ/s. Bản vá thử `last = ts` cho đúng 300 lần vẽ/10 s.
- Nguyên nhân (suy từ code, bản vá khớp): `last = ts - ((ts - last) % frameMs || 0)` giữ nhịp theo phần dư; rAF của Chrome cách
  16,6/16,7/16,8 ms nên hai vsync đôi khi chỉ cách 33,3x < `frameMs` = 33,333… ⇒ phần dư ≈ nguyên `dt` ⇒ `last` gần như không
  tiến ⇒ khung kế cũng vẽ.
- Hậu quả: CPU gấp đôi so với 30 fps G1 đã duyệt; ghim/gợn sóng cũng vẽ 60 fps. `stage_globe.test.ts` chưa có test nào về nhịp rAF
  của `GlobeCanvas` (chỉ chạy đồng hồ chung theo khung 33 ms).
- Đề xuất task riêng: đổi một dòng + test chuỗi timestamp 16,6/16,7/16,8 ms ⇒ ≤ 31 lần vẽ/s.

## 4. Kiểm trực quan
`screens/{1280,390}-{light,dark}-{1-spin,2-stop-vn,3-pin,4-dive}.jpg`, chụp từ bản build ở Slow 4G (cửa sổ dài, bắt đúng khoảnh khắc).
Khoảnh khắc 4 được đóng băng ở 600/1 400 ms của animation lao xuống bằng `Animation.currentTime` (chụp thường không bắt kịp ~1,4 s).
Quả cầu nằm trên poster bản đồ (poster là nền tĩnh có sẵn, **không phải** bản đồ 3D đã tải) cho tới khi lao xuống.
