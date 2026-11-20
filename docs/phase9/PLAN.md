# Giai đoạn 9 "Quả cầu tải bản đồ" (T-110 → T-115)

Lập 2026-11-21 (session plan cce035f5, không code). Chỉ đụng **landing page** (hero trang chủ), không liên quan buổi trình bày
MVP 2026-11-23 (demo chỉ chiếu trong phòng). Thay `docs/phase6/DESIGN.md` §7 khi T-115 xong.
Mock chạy được (bật/tắt từng nâng cấp, đổi tốc độ mạng/cỡ/theme): https://claude.ai/artifact/B5GB6SMsj5n1pvNWF1rcNq
Nguồn mock: `docs/phase9/mock/globe-mock.src.html` (chỗ `__MASK__` = base64 bitmask 0,5° sinh bằng
`docs/phase9/mock/gen-mask.js`); logic vẽ trong mock là bản tham khảo cho T-110/T-111/T-113/T-114.

## 1. Mục tiêu

Quả địa cầu hiện lúc bản đồ 3D đang tải phải **trông như một hành tinh** và **kể chuyện của app** (cả nhóm đổ về một điểm ở
Sài Gòn), rồi **chuyển liền mạch** vào bản đồ 3D, mà không làm bản đồ hiện chậm hơn đáng kể và không tốn pin vô ích.

## 2. Hiện trạng (đã kiểm 2026-11-21)

1. `stage/hero/HeroGlobe.tsx`: hình tròn 112 px (mobile 88) `overflow:hidden` chứa dải SVG `globe-land.ts` (6 khối lục địa vẽ
   tay) lặp 2 lần, trượt ngang bằng CSS `hero-globe-spin` 8 s (`motion.css:493`); phủ 2 radial-gradient. Đất chạy ngang đều,
   không cong ở mép ⇒ trông như nút tròn, không như quả cầu.
2. Hiện ở **hai chỗ**: fallback `Suspense` của `Hero` (`HeroStatic introOnly` → `<HeroGlobe state="loading">`) khi chunk
   `HeroScroll` chưa về, rồi `HeroScroll` dựng **một instance khác** (`state={mapState}`). Hai instance ⇒ hiện tại đã có giật
   nhẹ lúc chunk về (dải bắt đầu lại từ 0).
3. `HeroMap` chỉ báo `onReady` (sau `load` → `prewarm()` → `idle`) và `onFail`. Không có mốc trung gian.
4. Cảnh đầu của bản đồ (`HERO_SHOTS[0]` "overview") đã ở Q1 TP.HCM (106,7044°E 10,7717°N) ⇒ "lao xuống" khớp vị trí sẵn.
   Sau `onReady`, `HeroMap` chạy intro orbit (`startOrbit(introMs)`).
5. Luật gđ6 §7: chỉ trượt `transform` (composite), hiện sau 300 ms, `ready` → mờ dần `--t-shot`, `failed` → gỡ ngay,
   `lite`/reduced-motion → vòng 20 s.

## 3. Năm nâng cấp (đánh số như mock)

| # | Nâng cấp | Task |
| :-- | :--- | :--- |
| 1 | **Cầu thật (chấm bi)**: canvas 2D, chiếu trực giao các chấm đất từ bitmask Natural Earth; mép tự dồn chấm ⇒ cong thật | T-110 |
| 2 | **Ánh sáng · khí quyển**: chấm sáng/tối theo hướng nắng, rìa tối, vệt phản chiếu, quầng ngoài; theme chạng vạng có đèn thành phố | T-111 |
| 5 | **Tiến độ thật**: `HeroMap` báo 4 mốc; vòng tiến độ quanh cầu + dòng trạng thái đổi theo mốc. Là xương sống của 3 và 4 | T-112 |
| 3 | **Dừng ở VN · ghim · hội tụ**: mốc `style` → cầu giảm tốc, dừng đúng TP.HCM; mốc `tiles` → ghim cam nảy + 4 chấm bạn bè bay về | T-113 |
| 4 | **Lao xuống bản đồ**: mốc `ready` → cầu phóng to vào ghim rồi tan, bản đồ hiện từ hơi nhoè; xong mới chạy intro orbit | T-114 |

Thứ tự làm: 1 → 2 → 5 → 3 → 4 → chốt (T-115). Nâng cấp 5 làm trước 3/4 vì 3/4 cần các mốc của nó.

## 4. Đặc tả (bản nháp; số chốt sau G1 và T-115)

### 4.1 Vòng đời và mốc tải
| Mốc | Phát ra ở đâu | Cầu làm gì | Dòng trạng thái (VI / EN) | Vòng tiến độ |
| :--- | :--- | :--- | :--- | :--- |
| (bắt đầu) | fallback `Hero` | xoay 45°/s (8 s/vòng), nghiêng 22° | "Đang tải bản đồ…" / "Loading the map…" | 0 → nhích |
| `code` | `HeroScroll` mount | xoay tiếp, **không giật** (xem 4.4) | "Đang dựng kiểu bản đồ…" / "Styling the map…" | 22 % |
| `style` | `map.on('load')` | giảm tốc, quay về TP.HCM (1,1–2,0 s), nghiêng về 10,8° | "Đang tải đường phố…" / "Loading streets…" | 48 % |
| `tiles` | `prewarm()` xong | ghim nảy (350 ms) + 4 chấm bay về (650 ms, lệch 90 ms) + gợn sóng lặp | "Đang dựng toà nhà 3D…" / "Raising 3D buildings…" | 76 % |
| `ready` | `map.once('idle')` | lao xuống (1 400 ms = `--t-shot`), sau đó intro orbit | "Tới nơi rồi!" / "Here we are!" | 100 % rồi mờ |
| `failed` | `onFail` | gỡ ngay, poster ở lại (như cũ) | — | — |

- Giữa hai mốc, vòng tiến độ nhích dần về 70 % khoảng tới mốc kế (`1 − e^(−t/1,8 s)`), **không bao giờ tự đạt mốc kế**.
- Nhãn chữ thật trên màn chỉ là dòng `role="status"`; vòng tiến độ `aria-hidden`.

### 4.2 Ngân sách trễ (quan trọng nhất)
- Bản đồ đã `idle` mà cầu còn đang kể chuyện ⇒ tăng tốc phần còn lại (×2,6 trong mock). **Đề xuất trần: bản đồ hiện xong không
  muộn hơn 600 ms so với bây giờ** (bây giờ = mờ dần 1 400 ms ngay khi `ready`). Mock đo được con số này ở góc phải sân khấu.
- `ready` tới trước 300 ms (cầu chưa hiện) ⇒ không có gì thay đổi so với bây giờ.
- `ready` tới trước `style` của cầu kịp quay về VN (mạng rất nhanh) ⇒ bỏ ghim/chấm bạn bè, quay nhanh 500 ms rồi lao xuống.

### 4.3 Hình
- Đường kính: **chờ G1** (mock mặc định 168 px; hiện tại 112). Mobile: không che khối chữ hero (`top-[18%]` hiện tại) — cỡ mobile
  chốt ở T-110 bằng ảnh 360/390.
- Chấm: bitmask **1°** (360×180 bit, base64 ≈ 1,4 kB gzip), lấy mẫu theo bước `3,1 px / (R·π/180)` độ (≈ 3,3° ở R 56, 1,7° ở
  R 110), bỏ vùng > 84° vĩ. Bán kính chấm co theo `√z` ở mép.
- Màu đọc từ token `--stage-*` lúc mount (sáng: biển `paper-2` pha `sky`, đất `ink-2`; chạng vạng: biển tím đêm, đất `ink-2`,
  đèn thành phố `--stage-sun` cho ~18 % chấm ở phía đêm, chọn bằng hash tất định).
- Ghim: màu `--stage-accent-text`; 4 chấm bạn bè dùng `sky`/`leaf`/`sun`/`brick` — **hình minh hoạ cố định**, không phải vị trí
  thật, không lấy từ dữ liệu phòng nào (CR-11 không áp nhưng ghi rõ để khỏi nhầm).

### 4.4 Hiệu năng, pin, chuyển động
- Canvas vẽ lại mỗi khung ⇒ **sửa luật gđ6 §7 "chỉ transform"** (cần duyệt ở G1). Bù lại: khoá **30 fps** (`full`), dừng rAF khi
  tab ẩn (`visibilitychange`) hoặc cầu ra khỏi khung (IntersectionObserver), DPR ≤ 2, chấm vẽ bằng một path mỗi màu.
- **Một đồng hồ chung** (module `globe/clock.ts`: thời điểm bắt đầu + góc) để instance thứ hai (sau khi chunk về) nối tiếp góc
  xoay của instance đầu — sửa luôn cái giật ở §2 mục 2.
- `lite` / `prefers-reduced-motion`: 20 s/vòng, 15 fps, không ánh sáng động (vẽ tĩnh 1 lần lớp sáng), không bay chấm (hiện thẳng ở
  ghim), không gợn sóng, không lao xuống (mờ chéo như cũ). `static`: không có cầu (như cũ).
- Lao xuống: chỉ `transform` + `opacity` + `filter: blur` trên lớp bản đồ, 1 400 ms; intro orbit của `HeroMap` chạy **sau** khi
  lao xuống xong (cần callback từ `HeroGlobe` hoặc trễ cố định `--t-shot`).
- Đo ở T-115: CPU khi cầu đang xoay (DevTools Performance, máy dev + CPU throttle 4×), FPS, kích thước chunk `HeroScroll`
  trước/sau, thời điểm bản đồ hiện (trước/sau) ở mạng Fast 4G và Slow 4G.

## 5. Câu hỏi cho người dùng (G1, trả lời sau khi xem mock)

| # | Câu hỏi | Đề xuất |
| :-- | :--- | :--- |
| 1 | Phong cách: chấm bi (như mock) hay đất liền tô kín? | Chấm bi (nhẹ, hợp bitmask, đổi mức chi tiết theo cỡ) |
| 2 | Đường kính desktop: 112 / 168 / 220 px? Mobile? | 168 desktop, ~120 mobile |
| 3 | Trần trễ: bản đồ được phép hiện muộn hơn bây giờ tối đa bao nhiêu? | 600 ms |
| 4 | Giữ 4 chấm bạn bè bay về ghim, hay chỉ ghim + gợn sóng? | Giữ (đúng câu chuyện "cả nhóm gặp nhau") |
| 5 | Cho phép đổi luật gđ6 §7 từ "chỉ transform" sang canvas 30 fps có dừng khi ẩn? | Cho |
| 6 | Nguồn bitmask: thêm devDependency `world-atlas@2.0.2` (ISC, dữ liệu Natural Earth public domain) để script sinh lại offline? | Có |

**Trả lời G1 (2026-11-21): chọn đúng cả 6 đề xuất ở cột phải.**

## 6. Task, thứ tự, cổng

| Task | Nội dung | Phụ thuộc | Model · ước lượng |
| :--- | :--- | :--- | :--- |
| T-110 | Nâng cấp 1: bitmask + chiếu trực giao + canvas chấm bi + đồng hồ chung; bỏ dải SVG | **G1** | Opus 5.5 · ~110k |
| T-111 | Nâng cấp 2: ánh sáng, khí quyển, đèn thành phố, màu từ token cả hai theme | T-110 | Sonnet 5.5 · ~60k |
| T-112 | Nâng cấp 5: `HeroMap` báo mốc, luồng mốc tới `HeroGlobe`, vòng tiến độ + dòng trạng thái i18n | T-110 | Sonnet 5.5 · ~80k |
| T-113 | Nâng cấp 3: quay về VN theo mốc `style`, ghim + chấm bạn bè theo mốc `tiles` | T-111, T-112 | Opus 5.5 · ~100k |
| T-114 | Nâng cấp 4: lao xuống bản đồ, ngân sách trễ, nối intro orbit, mức `lite` | T-113 | Opus 5.5 · ~100k |
| T-115 | Đo (CPU/FPS/chunk/thời điểm hiện bản đồ), ảnh, chốt DESIGN §7 mới, dọn | T-114 | Sonnet 5.5 · ~60k |

- **G1** (trước T-110): người dùng xem mock, trả lời §5, duyệt plan.
- **G2** (sau T-115): người dùng xem trên bản build thật (desktop + điện thoại, theme sáng/tối, mạng chậm giả lập).
- T-111 và T-112 độc lập, chạy song song được.
- Hết hứng giữa chừng: dừng sau T-111 là đã có bản đẹp hơn hẳn mà không đụng luồng tải; T-112 → T-114 là phần "kể chuyện".

## 7. Việc của người
- Xem mock, trả lời §5 (G1).
- G2: thử trên điện thoại thật (mock và DevTools không đo được pin/nhiệt).
