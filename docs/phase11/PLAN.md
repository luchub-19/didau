# Giai đoạn 11 "Landing" (T-122 → T-130)

Lập 2026-11-26 qua 6 đợt hỏi + 3 bản mock (`/impeccable`). Người dùng duyệt **khung** theo mock v3 cùng ngày.
Trạng thái: **CHỜ G0** (duyệt plan này + §9). Mock chuẩn để code theo: `docs/phase11/comps/landing-v3.html` (mở bằng trình
duyệt; v2 `landing-dem.html` chỉ để tham khảo lịch sử). File task: `docs/phase11/tasks/T-xx.md`. Tiến độ: `PROGRESS.md`.

## 1. Mục tiêu

Thay trang chủ (vùng Stage) bằng landing **"Buổi tối có cao trào"** trong thế giới **"Sài Gòn về đêm"**: người xem thấy
ngay app thật, gặp một dàn nhân vật, hiểu 4 bước của một phòng, rồi **tự đặt mình vào cảnh hoà phiếu** trên bản đồ thật và
thấy app bảo vệ người ở xa (có thể chính là họ). Người xem chính: **người chấm đồ án + nhà tuyển dụng xem portfolio**;
nhóm bạn mở link vẫn dùng được màn đầu (Tạo phòng / Nhập mã / Vào lại phòng).

Thành công = sau một lượt xem, người xem nói lại được một câu ("app chọn quán để không ai phải chạy xa nhất một mình"),
đã tự kéo điểm của mình ít nhất một lần, và nhớ ít nhất một hình ảnh (bốn bạn chạy xe về / dải phố Bùi Viện).

Không thuộc mục tiêu: SEO, đo chuyển đổi, onboarding tăng trưởng (PRODUCT.md: dừng ở bản nộp đồ án).

## 2. Hiện trạng và vì sao trông "beta" (đã kiểm 2026-11-26)

Trang cũ (`pages/HomePage.tsx` → `stage/hero/*`): hero ghim cuộn 4 màn hình (gsap ScrollTrigger scrub), 5 cảnh camera trên
bản đồ 3D phủ lớp kem `stage-paper/0.94`, quả cầu tải gđ9, một khung chữ ở đáy; cuộn hết là footer.

| Quan sát | Nghiên cứu | Hệ quả |
| :--- | :--- | :--- |
| Không thấy app thật | NN/g: trang chủ nói trong một cái liếc sản phẩm làm gì; đưa **nội dung thật** thay mô tả | Cửa sổ phòng mẫu bấm được ở màn đầu; UI thật ở mọi phần |
| Chỉ 1 màn | NN/g 2018: màn đầu ~57% thời gian nhìn, màn 2 ~17%, ~26% rải phía dưới | Có nội dung đáng cuộn tới |
| Cuộn bị ghim 4 màn | NN/g "Scrolljacking 101", "Parallax usability" | Cuộn tự nhiên; nội dung đổi khi phần **đi vào** màn hình |
| Rối, nhạt, không tiêu điểm | Tuch et al. 2012: ấn tượng trong 17–50 ms; ít phức tạp + quen thuộc = đẹp. Lindgaard 2006 | Mỗi màn một tiêu điểm, tương phản cao |
| Không có điểm khác biệt | Devpost: hàng chục đồ án "meet in the middle + vote" dừng ở trung điểm. NN/g peak–end rule | Cao trào = cảnh hoà phiếu tự chơi; kết = QR + dàn nhân vật |
| Lạnh, thiếu con người (mock v2) | Norman: 3 tầng cảm xúc (cảm quan / hành vi / suy ngẫm) | Dàn nhân vật xuyên suốt, phố đêm vẽ tay, ảnh thật |
| Tương tác nông (mock v2) | Bret Victor, Explorable Explanations: người đọc tự đổi giả định và thấy kết quả | Bạn là người thứ 5, kéo điểm của mình trên bản đồ thật |

Nguồn: nngroup.com/articles/{scrolling-and-attention, scrolljacking-101, parallax-usability, homepage-design-principles,
top-ten-guidelines-for-homepage-usability, peak-end-rule, aesthetic-usability-effect} · nngroup.com/videos/3-levels-emotional-processing ·
research.google/pubs/pub38315 · doi 10.1080/01449290500330448 · worrydream.com/ExplorableExplanations ·
devpost.com/software/{meety-ed72rl, rendezwho, halfhalf, midz}. Đã cân nhắc rồi bỏ: "choice overload" (Scheibehenne 2010,
hiệu ứng TB ≈ 0); self-reference effect chỉ là phần phụ (bằng chứng lẫn lộn).

## 3. Quyết định đã chốt

1. Người xem chính: người chấm + portfolio. Màn đầu vẫn dùng được cho người dùng thật.
2. Trình tự: hero → nhóm chat rối → dải ảnh → một phòng 4 bước → **★ hoà phiếu tự chơi** → số đo 20 case → kết + QR.
3. Mở hoàn toàn: landing **không dùng** hero gđ4, quả cầu gđ9, gsap ScrollTrigger. Code cũ giữ trong repo đến G2.
4. Thế giới **"Sài Gòn về đêm"**: nền tối ấm, đèn natri + coral là nguồn sáng. Landing **luôn tối** (một cảnh cố định).
5. **Cửa sổ app và bản đồ luôn sáng** (Always-Light Map, T-101 giữ nguyên).
6. **Bản đồ thật** (MapLibre, `MAP_STYLE_URL`) ở hero (cửa sổ phòng mẫu, không tương tác) và ở cảnh hoà phiếu (bản đồ lớn).
7. **Phòng mẫu dựng lại trên trang**, không gọi backend; "Tạo phòng / Nhập mã / Vào lại" mở đúng modal thật của app.
8. **Explorable:** người xem là **người thứ 5**: chọn quận, kéo điểm, hoặc bấm lên bản đồ. 4 bạn kia chỉ là **vùng mờ cấp quận**
   (CR-11). Điểm của người xem không rời trình duyệt.
9. **Số liệu:** 4 bạn + 3 quán dùng **km/phút Valhalla thật** của ca demo; điểm của người xem tra **lưới Valhalla tính sẵn**
   (JSON tĩnh); ngoài lưới mới lùi về ước lượng chim bay × 1,3 và ghi nhãn. Đề xuất tính bằng **bản port OMP thật**
   (λ = 1, k = 2, K = 1) khớp backend.
10. **Dàn nhân vật** đúng ca demo gđ8: **Nobita** (chủ phòng, Q1), **Doraemon** (Bình Thạnh), **Xuka** (Thủ Đức), **Xeko** (Q7);
    avatar `characterDataUri(seed = tên)`. Người dùng chọn giữ tên gốc (nhân vật có bản quyền: rủi ro portfolio đã báo).
11. **Mở màn "Bốn bạn hội tụ"** (~2 s, một lần) trên **phố đêm vẽ tay** (SVG).
12. **Dải ảnh thật**: "Bui Vien Street, Ho Chi Minh City, at night, 2023 (13)", Bahnfrend, **CC BY-SA 4.0**, phải hiện ghi công.
13. **Âm thanh** tắt sẵn, dùng engine `sound/` của app: `tick` khi thả tim/đặt điểm, `chime` khi chốt.
14. **Kết bằng QR** tới `https://didau-omega.vercel.app/`, chỉ hiện ở màn ≥ 960px.
15. Nội dung được phép: số đo thuật toán + phòng mẫu. **Không** tên nhóm/trường, **không** phần kỹ thuật, không testimonial.
16. Song ngữ VI/EN đầy đủ cho mọi chữ, kể cả chữ do tương tác sinh ra.

## 4. Đặc tả

### 4.1 Trình tự và từng phần (mock v3 là chuẩn thị giác)

| # | Phần | Người xem hiểu / làm | Thành phần chính | Task |
| :- | :--- | :--- | :--- | :--- |
| 0 | Thanh đỉnh | – | Wordmark · Tạo phòng (chỉ hiện khi CTA hero khuất và CTA cuối chưa hiện) · Nhập mã · nút loa · VI/EN; có nền khi cuộn | T-124 |
| 1 | Hero | App chọn chỗ đi chơi cho cả nhóm; bấm thử được | Tiêu đề 2 dòng + lede + 2 CTA + "vào lại phòng" (nếu có `savedRoomCode`) + gợi ý "bấm thử"; cửa sổ phòng mẫu (thẻ hoà/dẫn/chốt, 3 quán có tim, "Vì sao?" mở tại chỗ, hiện diện avatar, bản đồ thật có ghim); phố đêm + bốn bạn hội tụ | T-125 |
| 2 | Nhóm chat rối | "Đi đâu?" không bao giờ chốt; người xa hay xin vắng | Tin nhắn có avatar tới lần lượt khi cuộn tới, bộ đếm 53, "đang gõ", câu chốt | T-126 |
| 3 | Dải ảnh | Chất Sài Gòn | Ảnh Bùi Viện toàn chiều ngang, phủ tối trên/dưới, 1 câu, ghi công | T-126 |
| 4 | Một phòng, 4 bước | Đề xuất → bình chọn → chốt → gửi lịch | Desktop: khung app dính phải, đổi màn khi bước đi vào giữa màn hình, bấm tên bước để nhảy; mobile: khung dưới từng bước | T-127 |
| 5 | ★ Hoà phiếu | Thêm mình vào phòng, thấy đề xuất đổi và vì sao | Bản đồ lớn (vùng mờ 4 bạn, ghim 3 quán, điểm "Bạn" kéo được, 3 đường nét đứt + phút), hỏi "Bạn ở quận nào?" + 12 chip, công tắc "Cộng tổng km / Ưu tiên người xa nhất", bảng "người xa nhất" có avatar, lời kết luận | T-128 |
| 6 | Số đo | Không phải may: 20 bộ dữ liệu | Dải vàng đèn đường; 2 số lớn chạy lên + 2 biểu đồ cùng thang; "Xem bảng" mở tại chỗ | T-129 |
| 7 | Kết | Tới lượt nhóm bạn | Tiêu đề lớn + 2 CTA + dàn nhân vật + QR (≥ 960px) | T-129 |
| 8 | Footer | – | Câu thương hiệu · ghi công bản đồ (OpenFreeMap · OpenMapTiles · © OpenStreetMap) | T-129 |

### 4.2 Thế giới "Sài Gòn về đêm" (token, chỉ vùng Stage/landing)
Lấy nguyên giá trị từ `:root` của mock v3 vào `styles/tokens.css` dưới tiền tố `--night-*` / `--lamp-*` (định dạng bộ ba RGB
như token hiện có): `night #16111C`, `night-2 #201926`, `night-3 #2B2233`, `night-line #3D3247`, `moon #F4ECE2`,
`moon-2 #C2B4C4`, `moon-3 #9A8C9E`, `lamp #F2B544`, `lamp-ink #2A1A0C`, `lamp-ink-2 #5A3B17`, `coral-on-dark #FF8566`,
`house-1/2/3`. Cửa sổ app dùng token sáng sẵn có (`bg`, `surface`, `ink`…) **ép sáng** dù theme app là tối. Chữ display
Bricolage 800 (tiêu đề hero `clamp(40px, 4.6vw, 64px)/1.2`, h2 `clamp(34px, 4.6vw, 60px)/1.2`), chữ thường Be Vietnam Pro.
Luật dấu chồng (line-height ≥ 1.2 cho display) giữ nguyên. Vẫn cấm: chữ gradient, glass trang trí, eyebrow, 01/02/03 trang trí,
hàng 3 thẻ icon, emoji làm icon, chữ trắng trên coral, coral cho thứ không phải "nhóm mình / hành động chính".

### 4.3 Dữ liệu (T-122 tạo, T-123 đọc)
- `frontend/src/landing/data/demoCase.json`: 4 bạn (tên, mã quận, nhãn quận, **toạ độ quận đại diện**, không phải nhà), 3 quán
  (tên, toạ độ, địa chỉ ngắn), ma trận **km + phút đi + về** từng bạn × từng quán (Valhalla, motorcycle), tổng km/quán,
  khối `expected` = kết quả `ordered_median` của backend cho ca demo (để test parity), ngày đo, nguồn.
  Phải khớp DEMO gđ8: người xa nhất 60′ / 74′ / 94′; tổng 68,2 / 63,5 / 81,5 km; Pizza 4P's: Xuka 60, Xeko 54, Doraemon 28, Nobita 26.
- `frontend/src/landing/data/grid.json`: lưới bước 0,01° phủ `lat 10.68–10.90 × lng 106.58–106.84` (~620 điểm) × 3 quán:
  km + phút đi + về (null nếu Valhalla không tới). Mục tiêu ≤ 40 KB (mảng số nguyên làm tròn 0,1 km / 1 phút).
- `frontend/public/landing/`: `bui-vien-night-{1200,2000}.webp`, `qr-deploy.svg` (sinh một lần, không thêm dependency runtime).
- Chi tiết đo + lệnh chạy: `docs/phase11/DATA.md` (T-122 viết).

### 4.4 Logic thuần (T-123, không đụng DOM, test đầy đủ)
- `landing/logic/omp.ts`: `psi(kmList, {lambda: 1, k: 2})` và `rankPlaces(...)` đúng `docs/phase7/ALGORITHMS.md` §2–§3 cho K = 1:
  `cᵢ = dᵢᵏ` (d = km đi + về, chặn như backend), xếp tăng, `w_r = 1 + λ(r−1)/(N−1)`, `Ψ = Σ w_r c₍r₎`; hoà (1e-9) → `max d` nhỏ hơn
  → `Σ d` nhỏ hơn → thứ tự cố định. Và `rankBySum(...)` cho chế độ "Cộng tổng km". Test parity với khối `expected`.
- `landing/logic/grid.ts`: `tripFrom(lngLat, placeId)` → `{km, min, source: 'grid' | 'estimate'}`: nội suy song tuyến 4 điểm lưới
  (bỏ điểm null), ngoài lưới/thiếu → ước lượng chim bay × 1,3 + tốc độ hiệu chỉnh từ chính lưới (ghi trong DATA.md).
- `landing/logic/explore.ts`: gộp 4 bạn + (tuỳ chọn) người xem → mỗi quán `{far, farWho, total, yourMin}`, chọn theo chế độ,
  sinh **khoá câu** cho lời kết luận (không sinh chữ: chữ ở i18n). Các khoá: `waiting`, `farYou`, `farOther`, `sum`, kèm `diff`
  khi hai chế độ chọn khác nhau.
- `landing/logic/roomSim.ts`: reducer phòng mẫu: `vote/unvote/lock/undo/toggleWhy`, tính `tie | lead | locked`, gợi ý = quán có
  người xa nhất đi ít nhất trong nhóm đang hoà, "bớt N′" so với quán đứng sau.

### 4.5 Chuyển động (một ngữ pháp, mỗi thứ chạy vì một đổi trạng thái)
| Chuyển động | Lúc nào | Thời lượng / easing | Giảm chuyển động |
| :--- | :--- | :--- | :--- |
| Chữ hero lên theo dòng, cửa sổ "bật đèn" | tải trang, 1 lần | 760 ms rise; 1100 ms lampOn | chỉ opacity |
| Phố: cửa sổ nhà + bảng hiệu + đèn sáng dần | tải trang, 1 lần | 500–600 ms, trễ ngẫu nhiên cố định ≤ 900 ms | sáng ngay |
| **Bốn bạn hội tụ** | tải trang, 1 lần | 1500–1860 ms, `cubic-bezier(.22,1,.36,1)`, so le 90 ms; nhãn tên sau 2050 ms | đứng sẵn |
| Xeko vào phòng (avatar + toast) | 1 lần, 3,6 s sau tải | 420 ms pop; toast 2,6 s | không pop |
| Tim, ghim nảy | mỗi lần thả | 360–380 ms | bỏ scale |
| "Vì sao?" mở tại chỗ | bấm | grid-rows 360 ms; thanh mọc 700 ms | không mọc |
| **Chốt** (khoảnh khắc chính) | bấm | dấu tích 620 ms + chữ rise so le 60 ms; chime nếu bật | chỉ opacity |
| Chat tới lần lượt + đang gõ | phần vào ≥ 40% màn hình, 1 lần | 280 ms/tin; gõ 1100 ms; đếm 900 ms | hiện ngay |
| Ảnh: zoom 1.06 → 1 | phần vào 20%, 1 lần | 1600 ms | không zoom |
| Đổi màn 4 bước | bước đi vào giữa màn hình / bấm | 360 ms ± 14px theo hướng; phần tử so le 90 ms | chỉ opacity |
| Đặt/kéo điểm "Bạn" | thao tác | rơi 520 ms; thanh + vị trí avatar 520 ms; khung chọn trượt 360 ms | không trượt |
| Số đo chạy lên + thanh mọc | phần vào 25%, 1 lần | 1000 ms, so le 90 ms | hiện ngay |

Không lặp vô hạn (trừ 3 chấm "đang gõ" ≤ 1,1 s), không parallax, không ghim/scrub. Mọi chuyển động tôn trọng
`useMotionTier()` (`static` = giảm chuyển động). Nội dung phía trên màn đầu luôn hiện ngay; phần chạy-khi-tới chỉ ẩn khi
nó đang ở dưới màn hình lúc tải.

### 4.6 Bản đồ và hiệu năng
- Một module chung `landing/map/` (T-125): nạp `maplibre-gl` **lazy** (chunk riêng), style `MAP_STYLE_URL`, lùi
  `FALLBACK_MAP_STYLE`, ẩn lớp poi/transit/bus/rail/aeroway/housenum, ghim quán là marker HTML.
- **Tối đa 1 WebGL context sống:** bản đồ hero sau khi `idle` chụp canvas thành ảnh rồi `remove()` (ghim HTML giữ vị trí đã
  `project`); bản đồ hoà phiếu chỉ tạo khi phần cách màn hình ≤ 600px; khi người xem kéo sang phần khác xa, giữ nguyên
  (không tạo lại liên tục).
- Ngân sách (đo ở T-130, Chrome DevTools "Fast 4G" + CPU 4×): LCP ≤ 2,5 s (LCP là tiêu đề hero, không phải bản đồ),
  CLS < 0,1, JS tải trước tương tác của landing (không tính chunk bản đồ) ≤ 120 KB gzip, chunk landing **không** chứa gsap.
- Ảnh: `srcset` 1200/2000 webp, `loading="lazy"`, `decoding="async"`, có `width/height` để không nhảy bố cục.

### 4.7 Truy cập, mobile, song ngữ
- 360–430px: mọi phần xếp dọc; cửa sổ hero ẩn bản đồ, còn panel; phố đêm thấp hơn (190px), bốn bạn dừng giữa màn.
  Bản đồ hoà phiếu cao ≥ 460px, chip cuộn ngang, công tắc full-width; QR ẩn.
- Bàn phím: mọi nút/chip/công tắc dùng được; công tắc nhận ←/→; **chip quận là đường thay thế cho kéo thả** (WCAG 2.5.7);
  điểm "Bạn" cũng nhận phím mũi tên khi focus (bước 0,005°). Lời kết luận `aria-live="polite"`; bản đồ có `aria-label` mô tả;
  cảnh phố + xe là trang trí (`aria-hidden`).
- Chuỗi qua i18n `landing.*` ở `i18n/locales/{vi,en}.ts`, đủ hai bản (lấy nguyên từ mock v3 làm bản nháp). Tên quán, tên
  nhân vật, tên phường/đường không dịch. Số dùng định dạng theo ngôn ngữ (`68,2` / `68.2`).

### 4.8 Ghi công và giấy phép
Ảnh Bahnfrend (CC BY-SA 4.0, link tới trang Commons) hiện ngay trên dải ảnh. Avatar DiceBear "thumbs" (CC0). Bản đồ:
OpenFreeMap · OpenMapTiles · © OpenStreetMap ở control attribution + footer. Mã QR không cần ghi công.

## 5. Ngoài phạm vi / chống mục tiêu
- Không sửa backend, không CR API mới; không gọi Render/Valhalla lúc người xem mở trang.
- Không sửa vùng Operate (phòng, thẻ, lịch…); chỉ **import** thứ thuần (avatar, Wordmark, sound, modal tạo/vào phòng,
  `tokenStorage`, `MAP_STYLE_URL`).
- Không xoá `stage/hero/**`, `globe/**`, gsap trong gđ này (quyết ở G2).
- Không bịa số: mọi con số lấy từ `demoCase.json`, `grid.json` hoặc `docs/proposal/mvp/script-thuyet-trinh-v2.md` §1.1.

## 6. Task, thứ tự, cổng

| Task | Việc | Phụ thuộc | Model · effort | Cỡ |
| :--- | :--- | :--- | :--- | :-: |
| **G0** | Duyệt plan + trả lời §9 | – | – | – |
| T-122 | Dữ liệu thật: script Valhalla → `demoCase.json` + `grid.json` (+ `expected` từ backend), ảnh webp, QR SVG, `DATA.md` | G0 · Valhalla bật | Sonnet 5.5 · medium | M |
| T-123 | Logic thuần: `omp.ts` (parity backend), `grid.ts`, `explore.ts`, `roomSim.ts` + test | G0 (dùng fixture tạm, nối data thật khi T-122 xong) | Sonnet 5.5 · high | M |
| T-124 | Khung landing: token đêm, `LandingPage` thay hero cũ trong `HomePage`, thanh đỉnh, CTA thật, `useReveal`, `cast.ts`, i18n `landing.*` | G0 | Opus 5.5 · high | L |
| T-125 | Hero: phố đêm SVG, bốn bạn hội tụ, cửa sổ phòng mẫu (roomSim), module bản đồ chung + bản đồ mini, hiện diện, âm thanh | T-123, T-124 | Opus 5.5 · high | L |
| **G1** | Người dùng xem hero trên bản build thật (màn đầu "wow" chưa?) | T-125 | – | – |
| T-126 | Nhóm chat rối + dải ảnh | T-124 | Sonnet 5.5 · medium | S |
| T-127 | Một phòng 4 bước (khung dính, đổi màn, bản mobile) | T-124 | Sonnet 5.5 · high | M |
| T-128 | ★ Hoà phiếu tự chơi trên bản đồ lớn | T-122, T-123, T-125 | Opus 5.5 · high | L |
| T-129 | Số đo + bảng + kết + QR + footer | T-122 (QR), T-124 | Sonnet 5.5 · medium | S |
| T-130 | Đo + a11y + ảnh + DESIGN (ngoại lệ thế giới đêm) + `CLAUDE.md`; sửa nhỏ trong `landing/**` | T-124 → T-129 | Sonnet 5.5 · high | M |
| **G2** | Người dùng duyệt bản build thật; quyết xoá hero/globe/gsap cũ | T-130 | – | – |

Song song được: T-122 ∥ T-123 ∥ T-124 ngay sau G0; sau T-124 thì T-126 ∥ T-127 ∥ T-129 (và T-125). T-128 là task cuối
trước T-130 vì cần cả dữ liệu, logic lẫn module bản đồ.

Vì sao chọn model: **Opus** cho 3 task dựng hình và tương tác nặng (T-124 đặt nền thế giới + i18n, T-125 khoảnh khắc mở
màn, T-128 explorable), nơi chất lượng thị giác và nhiều trạng thái đan nhau; **Sonnet high** cho logic có test (T-123),
khung dính nhiều trạng thái (T-127) và vòng đo/kiểm cuối (T-130); **Sonnet medium** cho task theo khuôn mock rõ ràng
(T-122, T-126, T-129). Không task nào hợp Haiku: mọi task đều chạm i18n hai bản hoặc đo đạc cần phán đoán.

## 7. Việc của người
- **Trước T-122:** bật Valhalla (PC `luckmintpc` + tunnel, hoặc `docker start valhalla` trên laptop; `docs/phase7/VALHALLA.md`
  §5, §7) và cho session biết `VALHALLA_URL`.
- **G1:** mở bản build (`npm run build && npm run preview`), xem hero ở desktop + điện thoại thật, trả lời câu hỏi ở PROGRESS.
- **G2:** duyệt toàn trang; quyết xoá code hero/globe cũ; quyết có deploy không (`git push` → Vercel).

## 8. Rủi ro
| Rủi ro | Ảnh hưởng | Cách giảm |
| :--- | :--- | :--- |
| Valhalla không bật được | T-122/T-128 thiếu lưới thật | T-123 có ước lượng hiệu chỉnh; T-128 chạy được với `source: 'estimate'` + nhãn; lưới bổ sung sau |
| 2 bản đồ WebGL trên máy yếu | giật, tốn pin | §4.6: hero chụp ảnh rồi huỷ; bản đồ lớn tạo muộn |
| Bản port OMP lệch backend | đề xuất trên landing sai với app | test parity bằng khối `expected` (T-122) + vài ca K = 1 từ `hangout_20_cases.json` |
| Tile OpenFreeMap chậm/lỗi | bản đồ trống | lùi `FALLBACK_MAP_STYLE`; phần chữ/bảng vẫn đủ nghĩa khi không có bản đồ |
| Tên nhân vật có bản quyền | bị hỏi khi làm portfolio | đã báo; tên nằm ở một chỗ (`cast.ts` + i18n), đổi một lần là xong |
| Chuỗi dài bản EN tràn ở 360px | vỡ bố cục | T-130 kiểm 360px cả hai ngôn ngữ |

## 9. Câu hỏi cho G0
0. Làm gđ11 **trước** gđ10 "Ảnh quán"? (Đề xuất: có.)
1. Landing **luôn tối**, không theo theme app? (Mock v3 đang vậy; đề xuất: có.)
2. Các task cùng lúc (T-122 ∥ T-123 ∥ T-124) chạy ở 3 session song song hay lần lượt? (Đề xuất: lần lượt nếu chỉ một máy.)
