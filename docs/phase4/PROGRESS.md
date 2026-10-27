# Tiến độ giai đoạn 4

Mỗi ô ghi chú tối đa 6 gạch đầu dòng. Chi tiết dài ghi vào mục "Nhật ký" cuối file task.

## Cổng chờ người dùng
| Cổng | Sau task | Nội dung | Trạng thái |
| :--- | :--- | :--- | :--- |
| G1 | T-58 | Duyệt `docs/phase4/DESIGN.md`, moodboard, palette Sài Gòn nắng, font tiêu đề (khẩu hiệu đã chốt 2026-10-27, xem PLAN §6) | **QUA** 2026-10-27: duyệt palette + DESIGN, font Bricolage Grotesque, fps đo ở T-59 |
| G2 | trước T-63 | CR-08 (sự kiện WS hiện diện + id người bỏ phiếu) | CHƯA ĐỀ XUẤT |
| G3 | T-64 | Duyệt bộ ảnh/GIF cuối và kịch bản demo | CHỜ |

## Bảng task
| Task | Trạng thái | Session | Ghi chú |
| :--- | :---: | :---: | :--- |
| T-58 | DONE | bc0b4479 | • Làm: `docs/phase4/DESIGN.md`, skill `didau-stage`, moodboard 6 ảnh `refs/`, `motion/` (tokens, presets 6 tên, `useMotionTier` + `createFpsGuard`, `?motion=`), `sound/` (tick/chime/whoosh WebAudio, `didau.sound` mặc định tắt), token `--stage-*`, khoá `stage.*`/`sound.*`; 305 test (+24: `stage_motion`, `stage_sound`) · • Thử 3D: lớp `building-3d` (minzoom 14), Q1 đủ dày (71/65 khối ở Bến Thành/Nguyễn Huệ); ảnh `screens/T-58-map3d-*`. **FPS thật chưa đo** (Chrome extension không kết nối, headless không đại diện) · • G1 qua: font **Bricolage Grotesque** (T-59 thêm `@fontsource/bricolage-grotesque`); người dùng thấy map mượt nhưng tòa nhà 3D ít chi tiết → hướng xử lý ở DESIGN §6 · • Lệch: ảnh chụp bằng Chrome headless (390 thực tế 500px), thiếu ảnh Apple Maps; skill `frontend-design`/impeccable chưa cài (người dùng tự cài nếu muốn) · • Task sau: dùng `motionAttrs`/`resolvePreset`/`useMotionTier` từ `src/motion`, `playSound` từ `src/sound`; Liberty extrusion hơi trong suốt → đặt opacity ≈0.9 · • Chi tiết: Nhật ký `tasks/T-58.md` |
| T-59 | DONE | fd079ebb | • Làm: `stage/hero/` (`shots.ts` + `stops.json` 3 quán OSM thật Ngon → Ciao → Saigon Saigon, `cameraAt`/`shotIndexAt` thuần; `Hero` chọn mức; `HeroStatic`, `HeroScroll` lazy (GSAP pin+scrub, lite = flyTo 1,2 s), `HeroMap` lazy (ánh sáng ấm, tòa nhà tô theo chiều cao, ghim + tooltip, đường nối, dừng khi khuất/tab ẩn, `createFpsGuard`→lite), `HeroPoster` 4 ảnh ≤145 kB), `motion/bezier.ts`, khoá `hero.*`; 321 test (+16 `stage_hero`) · • Thư viện: `gsap` 3.15.0, `@gsap/react` 2.1.2, `@fontsource/bricolage-grotesque` 5.3.0 (chỉ 800, latin+vietnamese) · • Bundle: JS ban đầu 176.93 kB gzip (+3.9; ngân sách 216); chunk `HeroScroll` 48.0 kB, `HeroMap` 3.1 kB + `maplibre-gl` dùng chung · • Lệch: cảnh 5 zoom 15.6 (14 quá xa), bearing cảnh 4–5 ≈ −60° + `labelSide` để nhãn không đè; mỗi cảnh 2–4 thêm dòng phụ `hero.detail.*`; `hero.shot` liteScale 0.6→0.86; trang chủ bỏ mục "Cách chơi" (khoá `home.headline/sub/howTitle/step*` thừa, chưa xoá); sửa 2 assert HomePage cũ · • Kiểm tra trực quan bằng Chrome **headless swiftshader** (extension không kết nối): ảnh + 2 GIF `screens/T-59-*`; **fps GPU thật chưa đo** (headless báo ~58–60, không đại diện) → đo: dev 1440px, cuộn phim, đọc `window.__heroFps` · • Sửa mượt sau phản hồi người dùng (giật, cuộn không đều): hold 0.35→0.15, easing camera mềm + `panProgress` (tâm trôi đều khi zoom), scrub 1 s, bỏ `backdrop-blur` đè canvas, pixelRatio ≤1.5, dọn icon POI, tải trước tile 5 cảnh, trời/sương nắng chiều; **chờ người dùng thử lại trên máy thật** · • Task sau: `motionAttrs`/`resolvePreset` đủ dùng; MapLibre `.maplibregl-map` ghi đè `position` (container phải `w-full h-full`); chi tiết Nhật ký `tasks/T-59.md` |
| T-60 | TODO | | |
| T-61 | TODO | | |
| T-62 | TODO | | |
| T-63 | TODO (tuỳ chọn) | | |
| T-64 | TODO | | |
