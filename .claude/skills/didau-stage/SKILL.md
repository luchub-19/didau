---
name: didau-stage
description: Luật vùng Stage (giai đoạn 4) của app "Đi Đâu": trang chủ điện ảnh bản đồ 3D, quẹt thẻ bỏ phiếu, reveal chốt quán, chuyển tab, hiện diện. Dùng khi tạo/sửa frontend/src/stage/**, frontend/src/motion/*, frontend/src/sound/*, HomePage.tsx, lớp trình diễn quanh SwipeDeck/kết quả chốt quán, token --stage-* hoặc --t-swipe/tab/fly/shot/reveal. File vùng Operate dùng didau-ui.
---

# Đi Đâu Stage

Nguồn sự thật: `docs/phase4/DESIGN.md` (đọc theo mục file task ghi). Kế hoạch: `docs/phase4/PLAN.md`.
Luật nền phase 3 vẫn áp: token, i18n, vùng chạm ≥44px, chữ trắng trên coral bị cấm.

## Trước khi viết
1. File có thuộc Stage không (DESIGN §1)? Không → dùng `didau-ui`, không gradient/camera/gsap.
2. Khoảnh khắc này thấy bao nhiêu lần, việc của nó là gì (giới thiệu / xác nhận / giải thích / cao trào)?
3. Màn này đã có khoảnh khắc nào chưa? Một khoảnh khắc mỗi màn, phần còn lại nhanh và yên.

## Luật hay quên
- Mỗi phần tử chuyển động: `{...motionAttrs('vote.swipe')}` → `data-motion`. Preset mới thì thêm vào
  `motion/presets.ts` + bảng DESIGN §4, có `maxSequenceMs`.
- Không số ms/easing rời: `resolvePreset(name, tier)` hoặc `var(--t-*)`, `var(--ease-*)`.
- Luôn rẽ nhánh theo `useMotionTier()`: `full` / `lite` / `static`. `static` = chỉ đổi màu/opacity.
  Thử `?motion=off|lite|slow` trước khi báo xong.
- Bản đồ hero: dùng `createFpsGuard()` → `downgradeMotionTier('lite', lý do)`; ngừng render khi khuất/tab ẩn;
  poster tĩnh hiện trước, lỗi style thì giữ poster.
- Lớp tòa nhà OpenFreeMap Liberty tên `building-3d` (minzoom 14). Ánh sáng ấm: DESIGN §2.
- CTA Tạo phòng / Nhập mã luôn thấy ở cảnh 1 và 5, Tab tới được; hiệu ứng không che CTA.
- Mọi chú thích cảnh, aria-label, nhãn nút qua `t()` (khoá `stage.*`, `sound.*`), đủ VI/EN; địa danh giữ nguyên.
- Màu: `rgb(var(--stage-*))`; mỗi cảnh ≤ 1 nhấn (coral) + 1 phụ. `stage-sun` sáng chỉ làm mảng, không làm chữ.
- Âm thanh chỉ qua `playSound()`; mặc định tắt; không tạo AudioContext khi chưa bật.
- Ngân sách (DESIGN §6): trang chủ ≤ +45 kB gzip, phòng ≤ +25 kB, hero ≥ 50 fps. Thư viện chỉ thêm ở task ghi.
- Không sửa store/`services/*` của luồng chốt quán; chỉ bọc lớp trình diễn (giữ `bac1f30`, `289a929`).
- Kịch bản (shots, thứ tự reveal) là dữ liệu thuần + unit test không cần WebGL.

## Cấm (DESIGN §7)
Gradient ngoài `--stage-sunlight` · glass trang trí · bounce/elastic · hiệu ứng lặp vô hạn · Three.js/R3F ·
Lenis/cuộn mượt · video nền · con trỏ tuỳ biến · chữ trắng trên coral · emoji làm icon · chuỗi Việt hardcode.

## Trước DONE
Checklist DESIGN §8: chụp 1280/1440/390 VI+EN, GIF chuyển động vào `docs/phase4/screens/`, sửa ≥3 lỗi rõ nhất,
`npm run lint && npm test && npm run build` xanh. Không có trình duyệt thật → ghi "chưa kiểm tra trực quan".
