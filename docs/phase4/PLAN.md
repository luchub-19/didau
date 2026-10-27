# KẾ HOẠCH GIAI ĐOẠN 4: "SÂN KHẤU" — GIAO DIỆN ĐIỆN ẢNH CHO TRANG CHỦ VÀ CÁC KHOẢNH KHẮC

Lập ngày 2026-10-27 (session tư vấn, không viết code). Đọc theo mục; file task ghi rõ đọc mục nào.

## 1. Quyết định đã chốt với người dùng (2026-10-27)

| Câu hỏi | Chốt |
| :--- | :--- |
| Phạm vi | Trang chủ + các khoảnh khắc trong phòng. Phần còn lại của phòng **giữ nguyên** (chế độ Operate của giai đoạn 3). |
| Phong cách | **Điện ảnh kiểu Awwwards** (camera, cuộn kể chuyện, chuyển cảnh lớn), nhưng không dồn hiệu ứng thừa. |
| Thiết bị demo chính | **Laptop / màn lớn** (1280–1920px). Mobile vẫn phải dùng được, ở bản nhẹ. |
| Luật thiết kế | **Viết DESIGN.md mới** (`docs/phase4/DESIGN.md`), chia vùng Stage / Operate; DESIGN giai đoạn 3 vẫn là luật của vùng Operate. |
| Hình ảnh trang chủ | **Bản đồ 3D TP.HCM thật** (MapLibre + OpenFreeMap, tòa nhà 3D), camera bay theo cuộn. |
| Khoảnh khắc trong phòng | Cả 4: bỏ phiếu bằng thẻ quẹt/kéo, reveal lúc chốt quán, chuyển tab mượt, hiện diện realtime (làm cuối, cắt được). |
| Thành phố demo | **TP.HCM** (đã có `backend/app/data/pois_hcm.json.gz`). |
| Tông màu Stage | **Sài Gòn nắng**: sáng, ấm, bão hoà; giữ coral `accent` làm màu thương hiệu. |
| Âm thanh | **Có**, mặc định **tắt**, bật bằng nút; chỉ ở khoảnh khắc (reveal, quẹt thẻ). |
| Tên / khẩu hiệu | Giữ tên Đi Đâu; khẩu hiệu **đã chốt**: "Đi đâu? Rồi đi đâu nữa?" / "Where to? And where next?" (mục 6). |
| Nhịp làm | **Nhanh, vài buổi**: ít task hơn, task to hơn, thủ tục nhẹ hơn giai đoạn 3 (xem `README.md`). |

## 2. Nguyên tắc: "Một khoảnh khắc mỗi màn, phần còn lại nhanh và yên"

1. **Vùng Stage** (được phép điện ảnh): trang chủ (`HomePage`), màn quẹt thẻ, màn reveal, lớp chuyển tab.
   **Vùng Operate** (giữ luật giai đoạn 3): danh sách quán, lịch, xung đột, nhóm, form, sheet.
2. Hỏi trước mọi hiệu ứng: *thấy bao nhiêu lần?* (DESIGN giai đoạn 3 §8). Một lần → được dài và đẹp; hàng trăm lần → không.
3. Mỗi hiệu ứng phải **có việc để làm**: giới thiệu sản phẩm, xác nhận hành động, giải thích thay đổi, hoặc là cao trào.
4. **Tương tác thật, không chỉ để xem**: hero cho kéo/nghiêng bản đồ và bấm vào quán thật; thẻ quẹt bằng chuột/cử chỉ;
   reveal có nút chia sẻ/chốt thật.
5. **Hiệu năng là một phần thiết kế**: có 3 mức (`full` / `lite` / `static`), tự hạ mức trên máy yếu, tôn trọng
   `prefers-reduced-motion`.

## 3. Hiện trạng (điểm xuất phát)

- Stack: React 18, Vite 5, Tailwind 3, MapLibre 4.7, i18next, zustand, Phosphor, Be Vietnam Pro. **Chưa có thư viện
  animation**; chuyển động ở `frontend/src/styles/motion.css` (keyframes: sheet, toast, vote-pop, winner-reveal, …).
- Bản đồ: style OpenFreeMap Liberty (`frontend/src/config.ts`), có lớp tòa nhà 3D, miễn phí, không cần key.
- Đã có: `components/decide/SwipeDeck.tsx` (714 dòng, có xử lý kẹt kéo), `SpinWheel`, `LuckyLadder`, `SmartPickCard`,
  keyframe `winner-reveal`, `place-lock-in-sweep`; tab phòng qua `components/shell/useRoomTab.ts` (`?tab=`).
- Bundle (T-55): `index.js` gzip 171 kB, `MapView.js` gzip 228 kB (import động).
- WebSocket: `VOTE_UPDATED` **không có id người bỏ phiếu**; chỉ có `MEMBER_JOINED`/`MEMBER_LEFT` cho hiện diện.
  → "phiếu bay vào kèm avatar" và "con trỏ bạn bè" cần đổi backend + hợp đồng (CR-08, task T-63).
- Commit gần nhất sửa luồng chốt quán (`bac1f30`, `289a929`: ErrorBoundary, huỷ phiên OPEN cũ). Task reveal phải
  giữ nguyên các bản sửa này.

## 4. Kiến trúc mới (code dễ đọc, dễ tìm, dễ debug)

```
frontend/src/
  motion/                 # MỘT chỗ cho mọi chuyển động có tên
    tokens.ts             # thời lượng, easing (đọc từ CSS var để CSS và JS dùng chung)
    presets.ts            # preset có tên: 'vote.swipe', 'decide.reveal', 'tab.switch', 'hero.shot' …
    useMotionTier.ts      # 'full' | 'lite' | 'static' (reduced-motion, WebGL, số nhân CPU, ?motion=)
    debug.ts              # ?motion=slow|off|lite, timeScale toàn cục, log '[stage]' chỉ ở dev
  sound/
    sound.ts              # WebAudio tự tổng hợp (không file âm thanh, không bản quyền), mặc định tắt
    useSound.ts           # bật/tắt lưu localStorage 'didau.sound'
  stage/
    hero/                 # trang chủ điện ảnh
      shots.ts            # KỊCH BẢN CAMERA LÀ DỮ LIỆU: [{ id, center, zoom, pitch, bearing, captionKey }]
      HeroMap.tsx         # MapLibre 3D, lazy chunk riêng
      HeroScroll.tsx      # nối tiến độ cuộn → camera (GSAP ScrollTrigger)
      HeroPoster.tsx      # ảnh tĩnh hiện ngay (LCP) và là bản 'static'
    reveal/               # màn công bố quán thắng
    deck/                 # sân khấu quẹt thẻ (bọc logic SwipeDeck có sẵn)
```

Quy ước bắt buộc (ghi vào DESIGN mới):
- Mỗi phần tử có chuyển động mang `data-motion="<tên preset>"`; grep tên preset ra đủ CSS, TS, DOM.
- Không viết số thời lượng/easing rời trong component; luôn lấy từ `motion/tokens.ts` hoặc CSS var.
- Mỗi preset có nhánh `static` (giữ đổi màu/opacity, bỏ di chuyển).
- Vùng Operate **không import** `gsap` hay `stage/*`; kiểm bằng output build (chunk riêng) trong T-64.
- Kịch bản (shots, thứ tự reveal) là dữ liệu thuần, có unit test riêng (không cần WebGL).

### Thư viện (chỉ thêm ở task cần, ghi phiên bản vào PROGRESS)
| Gói | Dùng cho | Task |
| :--- | :--- | :--- |
| `gsap` + `@gsap/react` (miễn phí toàn bộ từ 2025) | ScrollTrigger cho hero (scrub/pin), timeline reveal | T-59, T-61 |
| `motion` (Motion for React) | kéo có quán tính, nghiêng thẻ, layout animation | T-60 |
| View Transitions API (có sẵn trình duyệt) | chuyển tab; phát hiện tính năng, không có thì đổi tab tức thì | T-62 |
| **Không** dùng Three.js / R3F | MapLibre đã là WebGL; thêm Three = thêm ~150 kB và một vòng render nữa | – |

## 5. Hướng thị giác "Sài Gòn nắng" (T-58 chốt số liệu, đo tương phản)

- Nền Stage: kem ấm (giấy nắng), không trắng tinh. Màu nhấn: coral `accent` sẵn có (mặt trời, quán thắng).
- Màu phụ đề xuất: vàng nắng (hoa sứ, mái hiên), xanh trời trưa, xanh lá me, terracotta (gạch, Bưu điện Thành phố).
- Ánh sáng là nhân vật chính: dải "nắng chiều" (gradient chỉ trong Stage), bóng đổ dài theo một hướng cố định;
  bản đồ hero chỉnh `light` của MapLibre (hướng, cường độ) cho tòa nhà 3D đổ bóng ấm.
- Chữ: Be Vietnam Pro cho chữ thường; **một** font tiêu đề display có subset Vietnamese (T-58 chọn 2–3 ứng viên,
  kiểm tra dấu chồng ở cỡ lớn: "Ở", "Ữ", "Ặ").
- Dark mode: Stage chuyển sang "Sài Gòn chạng vạng" (cùng hệ màu, tối hơn); không làm palette thứ ba.
- Luật cũ vẫn giữ: chữ trắng trên coral bị cấm; không emoji làm icon; vùng chạm ≥44px.

## 6. Tên và khẩu hiệu (đề xuất, người dùng chọn ở cổng G1)

Giữ tên **Đi Đâu** (EN: *Đi Đâu*, phụ đề "Where to, crew?"). App lên **cả một buổi nhiều chặng** (ăn → cà phê →
đi tiếp, khung 17:00–23:00), nên khẩu hiệu nói về cả buổi, không về "một quán". (Bản cũ "…chỉ cần một" đã bỏ, 2026-10-27.)
1. **"Đi đâu? Rồi đi đâu nữa?"** / *"Where to? And where next?"* ← **ĐÃ CHỐT 2026-10-27** (chơi chữ với tên app, gợi nhiều chặng)
   Dòng phụ: "Rủ cả nhóm, xếp cả tối." / *"Round up the crew. Plan the whole night."*
2. "Một tối, mấy chặng, cả nhóm cùng chốt." / *"One night, a few stops, decided together."*
3. "Từ quán ăn tới quán nước, cả tối gói trong một phòng." / *"From dinner to drinks, the whole night in one room."*

Các cảnh hero (khớp `shots.ts`, chữ qua i18n, tên địa danh giữ nguyên). Mạch truyện: một buổi tối nhiều chặng.
| # | Cảnh | Camera | Chú thích (VI / EN) |
| :-: | :--- | :--- | :--- |
| 1 | Toàn cảnh Q1 lúc nắng chiều | zoom 13, pitch 0 → 45 | khẩu hiệu + dòng phụ + 2 nút Tạo phòng / Nhập mã |
| 2 | Chợ Bến Thành | zoom 16, pitch 60 | "Mỗi người một ý…" / "Everyone has an idea…" |
| 3 | Phố đi bộ Nguyễn Huệ | zoom 16.5, xoay bearing | "…cả nhóm bỏ phiếu cùng lúc" / "…the crew votes, live" |
| 4 | 3 ghim coral rơi lần lượt: chỗ ăn → cà phê → chỗ đi tiếp (quán thật từ OSM) | zoom 16, pitch 65 | "Chốt từng chặng" / "Pick every stop" |
| 5 | Kéo ra, đường nối 3 chặng + mốc giờ 17:00 → 23:00 | zoom 14 | "Cả tối xếp sẵn, khỏi vòng vèo" / "The whole night, in order, no detours" + CTA |

## 7. Lộ trình

| # | Task | Tên | Phụ thuộc | Cổng | Ước lượng |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | T-58 | Nền Stage: DESIGN mới, tham chiếu, `motion/`, `sound/`, thử 3D | – | **G1** người dùng duyệt DESIGN + moodboard + khẩu hiệu | 1 buổi |
| 2 | T-59 | Hero bản đồ 3D TP.HCM | G1 | | 1–1,5 buổi |
| 3 | T-60 | Sân khấu quẹt thẻ bỏ phiếu | G1 | | 1 buổi |
| 4 | T-61 | Reveal chốt quán | T-60 | | 1 buổi |
| 5 | T-62 | Chuyển tab bằng View Transitions | T-58 | | 0,5 buổi |
| 6 | T-63 | Hiện diện realtime (tuỳ chọn) | T-58 | **G2** CR-08 = ACCEPTED | 1 buổi |
| 7 | T-64 | Đánh bóng, đo, kịch bản demo | T-59 → T-62 (+T-63 nếu làm) | **G3** người dùng duyệt bộ ảnh/video | 0,5–1 buổi |

T-60 và T-62 không phụ thuộc nhau, làm song song được (2 session, 2 worktree) nếu muốn nhanh.

## 8. Ngân sách hiệu năng (đo ở T-64, vi phạm thì hạ mức hoặc cắt)

| Hạng mục | Ngân sách |
| :--- | :--- |
| JS ban đầu trang chủ (không tính chunk bản đồ) | ≤ 171 kB + 45 kB gzip |
| Phòng (vùng Operate) | không tăng quá 25 kB gzip so với T-55 (chỉ `motion` + View Transitions) |
| LCP trang chủ (desktop, Lighthouse) | ≤ 2,5 s (poster tĩnh là LCP, bản đồ tải sau) |
| Khung hình hero trên GPU tích hợp, 1440p | ≥ 50 fps trung bình; dưới 40 fps 2 s liên tục → tự hạ `lite` |
| CLS | ≤ 0,05 |
| Bản đồ hero | ngừng render khi ra khỏi khung nhìn / tab ẩn |
| Âm thanh | không giữ AudioContext mở khi đang tắt; chỉ tạo sau thao tác người dùng |

Mức `lite`: bỏ tòa nhà 3D và đổ bóng, camera chuyển cảnh bằng `flyTo` ngắn thay vì scrub liên tục.
Mức `static`: poster + 5 khối chữ, không bản đồ động; mọi khoảnh khắc chỉ đổi màu/opacity.

## 9. Rủi ro và cách chặn

| Rủi ro | Chặn |
| :--- | :--- |
| Tile OpenFreeMap chậm/lỗi lúc demo | Poster tĩnh luôn hiện trước; lỗi tải style → giữ poster, không màn trắng |
| Lớp tòa nhà 3D TP.HCM thưa | T-58 thử thật và chụp; thưa thì chọn cảnh nơi có dữ liệu, hoặc hạ pitch |
| Hero "đẹp mà không dùng được" | CTA Tạo phòng / Nhập mã luôn thấy ở cảnh 1 và cảnh 5; bàn phím Tab tới được |
| Phá luồng chốt quán vừa sửa | T-61 chỉ bọc lớp trình diễn quanh kết quả; không sửa store/`services/*`; test cũ phải xanh |
| Hiệu ứng tràn sang vùng Operate | DESIGN mới liệt kê file thuộc Stage; skill `didau-stage` chỉ nạp cho các file đó |
| Âm thanh gây khó chịu | mặc định tắt, ≤ 400 ms, âm lượng thấp, không lặp |
| Nhịp nhanh làm docs trôi | mỗi task vẫn cập nhật PROGRESS (≤6 dòng) + commit 1 lần |

## 10. Ngoài phạm vi

Đổi vùng Operate (danh sách, lịch, form) · Three.js/R3F · video nền · cuộn mượt toàn trang (Lenis…) cho phòng ·
con trỏ chuột tuỳ biến · chế độ Google (vẫn sau cờ `PLACES_PROVIDER=google`) · deploy (làm riêng khi người dùng bảo).

## 11. Nguồn tham khảo đã dùng khi lập kế hoạch

- Skill: Anthropic `frontend-design`; `pbakaus/impeccable` (audit/critique, luật chống "AI slop"); `leonxlnx/taste-skill`
  (thang motion/density). Tổng hợp: composio.dev/blog/top-design-skills, pasqualepillitteri.it (DE/IT/ES),
  claudemarket.ai/skills/best-frontend-design-skills.
- Quy trình chụp → tự chấm → sửa: claude-codex.fr/en/content/stack-design-claude-code.
- Motion vs GSAP: blog.openreplay.com/motion-vs-gsap, syncfusion.com/blogs/post/motion-vs-gsap-react.md.
- Vì sao Linear/Stripe/Vercel "đắt": mantlr.com/blog/stripe-linear-vercel-premium-ui (giới hạn màu nhấn mỗi section,
  trạng thái hover/focus/disabled làm kỹ, chữ là thương hiệu).
- Awwwards Site of the Year 2025: Lando Norris, OFF+BRAND, Messenger (abeto) — tham chiếu nhịp camera và chuyển cảnh.
- Xu hướng 2026: lollypop.design (VI), tbhcreative.com, ionos.com; gallery JA: biz.ne.jp/matome/2007222, 1GUU, Parts.
