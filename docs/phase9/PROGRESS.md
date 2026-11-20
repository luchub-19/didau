# Tiến độ giai đoạn 9 "Quả cầu tải bản đồ"

Mỗi ô ghi chú tối đa 6 gạch đầu dòng. Thứ tự, phụ thuộc, model: `PLAN.md` §6. Đặc tả: `PLAN.md` §4.
Mock: https://claude.ai/artifact/B5GB6SMsj5n1pvNWF1rcNq

## Cổng chờ người dùng
| Cổng | Sau task | Nội dung | Trạng thái |
| :--- | :--- | :--- | :--- |
| G1 | plan | Xem mock, trả lời `PLAN.md` §5 (6 câu), duyệt plan | QUA 2026-11-21: chọn đúng cả 6 đề xuất (chấm bi; 168 / ~120 px; trần trễ 600 ms; giữ 4 chấm bạn bè; cho canvas 30 fps; cho devDep `world-atlas@2.0.2`) |
| G2 | T-115 | Xem bản build thật: desktop + điện thoại, sáng/tối, mạng chậm giả lập | — |

## Bảng task
| Task | Trạng thái | Session | Ghi chú |
| :--- | :---: | :---: | :--- |
| T-110 | DONE | be10afb4 | • **Đã làm:** `scripts/gen_globe_mask.mjs` (world-atlas@2.0.2 devDep, chạy tay) → `stage/hero/globe/mask.ts` (bitmask 1°, mã **RLE**); `globe/projection.ts` (`decodeMask`, `isLand`, `buildDots` struct-of-arrays có `hash` cho đèn T-111, `projectInto`/`project`/`viewOf`, `GLOBE_HCM`); `globe/clock.ts` (`globeLonAt`, `setGlobeSpeed` đổi tốc độ không giật, `markGlobeOnScreen`/`isGlobeOnScreen`); `globe/GlobeCanvas.tsx` (DPR ≤ 2, rAF khoá 30/15 fps, dừng khi tab ẩn/IO ngoài khung, 4 dải alpha theo z ⇒ 4 lần fill/khung, cỡ theo `ResizeObserver` của phần tử cha). `HeroGlobe` 120 px / md 168 px, bỏ lớp radial-gradient phủ; xoá `globe-land.ts` + keyframes `hero-globe-*`.<br>• **Test:** `stage_globe.test.ts` 12 mới + 2 mới ở `stage_hero` (canvas thay SVG; instance thứ hai hiện ngay). Lint + **922 vitest** + build xanh. Dữ liệu mask 1 501 B gzip (file nguồn 2 029 B gzip vì comment, build bỏ); mask nằm ở chunk `index` chính (fallback `HeroStatic` import `HeroGlobe`), ước +2,5 kB gzip — T-115 đo chính xác.<br>• **Lệch plan (có lý do):** (1) RLE thay base64 bit thô: base64 2,1 kB gzip vượt trần 2 kB. (2) Ô 1° là đất nếu ≥ 3/9 điểm mẫu trong ô (giữ dải hẹp VN/Ý/Nhật). (3) Vòng vắt qua 180° (Nga, Fiji, Nam Cực) làm lật chẵn-lẻ cả hàng ~66°N trong `gen-mask.js` của mock ⇒ script duỗi vòng + xét từng vòng ở lon, lon ± 360, khép Nam Cực qua −90°. (4) Thêm cờ `isGlobeOnScreen`: instance trong `HeroScroll` render trước khi fallback gỡ ⇒ thấy cờ thì **hiện ngay**, không chờ 300 ms (nếu không, đồng hồ chung vẫn để lại 300 ms trống).<br>• **Kiểm trực quan** (Chrome 157 headless `--disable-gpu`, CDP, Slow 4G, bản `vite preview`): 1280 sáng/tối, 390 sáng/tối, 360 sáng, 1280 `?motion=lite`; ảnh `t110/` ở scratchpad session (không commit). Dò mỗi 60 ms: cầu có mặt liên tục lúc `data-hero-tier` loading → full/lite (không khung trống), không giao khối chữ/thẻ hero ở 360/390, canvas có vẽ (đếm pixel), sau `ready` cầu mờ rồi gỡ, bản đồ hiện. Góc liền mạch kiểm bằng test đồng hồ (mắt thường trên ảnh tĩnh không kiểm được).<br>• **Chưa kiểm:** điện thoại thật / pin (G2); FPS và CPU (T-115); đổi theme giữa lúc đang tải chưa đọc lại màu (T-111 làm màu theo theme).<br>• **Task sau cần biết:** T-111 vẽ ánh sáng trong `draw()` của `GlobeCanvas` (bảng màu `readPalette`; canvas hiện đúng bằng đường kính, quầng ngoài cần nới canvas + lề âm); T-113 cần thêm chế độ "seek" vào `clock.ts` (hiện chỉ quay đều, nghiêng cố định `GLOBE_TILT_DEG` 22°). Luật gđ6 §7 "chỉ transform" coi như đã đổi theo G1 câu 5; văn bản DESIGN §7 mới chốt ở T-115. |
| T-111 | TODO | | |
| T-112 | TODO | | |
| T-113 | TODO | | |
| T-114 | TODO | | |
| T-115 | TODO | | |
