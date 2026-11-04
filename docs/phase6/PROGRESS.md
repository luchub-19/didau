# Tiến độ giai đoạn 6 "Lịch chung & Algorithm Engine"

Mỗi ô ghi chú tối đa 6 gạch đầu dòng. Chi tiết dài ghi vào mục "Nhật ký" cuối file task (`tasks/T-xx.md`).
Thứ tự làm, phụ thuộc, model: `PLAN.md` §6. Prompt cho từng session: `PROMPTS.md`. Luật giao diện: `DESIGN.md`. Thuật toán: `ALGORITHMS.md`.

## Cổng chờ người dùng
| Cổng | Sau task | Nội dung | Trạng thái |
| :--- | :--- | :--- | :--- |
| G1 | T-76 | Duyệt `PLAN.md`, `DESIGN.md`, `ALGORITHMS.md` (đặc biệt bảng §0 và các hằng số §2/§5), CR-10 → CR-14, 3 câu hỏi mở dưới đây | **QUA 2026-11-04** — duyệt nguyên văn, CR-10 → CR-14 APPROVED; 3 câu hỏi mở dùng phương án (a): nút chính "Xuất kế hoạch", chỉ thẻ 4:5, giữ "Xếp lịch tự động" làm nút phụ |
| G2 | T-80 → T-91 | Tự dùng thử: lịch kéo thả (desktop + điện thoại, 2 trình duyệt cùng phòng), chia sẻ vị trí, hoà phiếu, cảnh báo thiếu giờ, xuất kế hoạch | CHỜ |
| G3 | T-92 | Duyệt ảnh `screens/final/`, `DEMO.md`, `ALGORITHMS.md` §11 (số liệu cho báo cáo) | CHỜ |

### Câu hỏi mở cho G1 (chưa trả lời thì session sau dùng phương án (a) và ghi rõ)
1. Nút chính bước ④ là **"Xuất kế hoạch"** (gửi link thành nút phụ) — (a) đồng ý · (b) giữ gửi link là nút chính.
2. Thẻ PNG khổ 4:5 (1080×1350) — (a) chỉ 4:5 · (b) thêm bản story 9:16.
3. "Xếp lịch tự động" (auto-plan) giữ làm nút phụ cạnh kéo thả — (a) giữ · (b) bỏ.

## Việc của người (session không tự làm được)
| Việc | Cần trước | Ghi chú |
| :--- | :--- | :--- |
| Duyệt CR-10 → CR-14 | T-78 (CR-10), T-85 (11, 13, 14), T-86/T-87 (12) | Đổi trạng thái trong `docs/CHANGE_REQUESTS.md` hoặc nói trong chat |
| (Tuỳ chọn) bật Google Routes API cho key server | T-84/T-86 nếu muốn số thật | Không bật thì mọi thứ chạy bằng ước lượng, có nhãn "ước lượng" |
| Thử kéo thả trên điện thoại thật + 2 máy cùng phòng | G2 | Headless không kiểm được chạm thật, rung |
| Thử import `.ics`, dán văn bản emoji và gửi ảnh thẻ trên Zalo/Messenger | G2 | `.ics` còn mang từ gđ5 |

## Bảng task
| Task | Trạng thái | Session | Ghi chú |
| :--- | :---: | :---: | :--- |
| T-76 | DONE | 39cdf548 | • Làm: `docs/phase6/` PLAN, DESIGN, ALGORITHMS, PROGRESS, 17 file task (T-76 → T-92); CR-10 → CR-14 (PROPOSED) trong `docs/CHANGE_REQUESTS.md`; mục gđ6 trong `CLAUDE.md`. Không đổi code, không chạy test; commit `1c8a0c6` · • Hỏi người dùng 2 lượt (4 + 20 câu) sau khi đọc `docs/proposal/` (Algorithm Engine, INPUT, OUTPUT, phân tích giao diện); quyết định ở PLAN §1 + ALGORITHMS §0 · • Phát hiện: `PUT /schedule` đang xoá `note` (CR-10); `HaversineTravelEstimator` (30 km/h, +10' gửi xe) và `TravelTimeConflictRule` (30 km/h) lệch tham số → T-84 thống nhất · • Lệch tài liệu đồ án có chủ ý: không làm heatmap/lịch rảnh, không P90 thật (biên ước lượng có nhãn), Google sau cờ, giữ WS thay Socket.io · • Task sau: sau G1 làm song song được mạch A (T-77/T-78/T-83) và mạch B (T-84), T-91 độc lập |
| T-77 | DONE | (session) | • Làm: form tạo phòng bỏ `OriginPicker` + khối ngân sách (`SHOW_BUDGET_IN_CREATE=false` trong `room/createRoom.ts`), chip thành phố TP.HCM/Hà Nội; payload không gửi `origin_*`/`budget_limit`; xoá `OriginPicker`, `locateOnce`, `OriginPoint` + 9 khoá i18n `room.create.origin*`; `formatTimeWindow` + `describeEventDate` (`i18n/format.ts`); `TimeWindowChip` (desktop sau mã phòng) + `PhaseStepper` prop `windowText` (dòng compact mobile); `RoomShell` truyền `timeWindow` từ `room.start/end_minute`. Test 566 (565 xanh); lint/build xanh, entry chính 71,49 kB gz 28,17 (chunk lớn 657 kB giữ nguyên bản chất) · • Quyết định: khoá i18n mới ở cấp gốc `timeWindow.label` vì `room.timeWindow` đã là chuỗi · • Bẫy: `OriginPicker` kéo i18n vào test ngầm → `create_room.test.tsx` giờ `import '../i18n'` · • **Chưa làm:** ảnh chụp 1440/390 (sáng VI, tối EN) và kiểm 375px không cuộn ngang; mục 5 (BudgetMeter không limit, dải "Gần điểm hẹn") chưa xác nhận bằng mắt · • Test `decide_wheel` (SWIPE render SwipeDeck) lỗi khi chạy riêng cả trước khi sửa — không liên quan T-77 |
| T-78 | DONE | 68a6e10a | • Làm: `room/calendar.ts` (SNAP_MIN/DEFAULT_DURATION_MIN/MIN_DURATION_MIN, `gridRange`, `snap`, `minuteAtY`/`yAtMinute`, `dropSlot`, `moveSlot`, `resizeSlot`, `overlaps`, `layoutColumns`, `firstFreeSlot`, `reorderByStart`, `toBulkPayload`, `placeScheduleItem`); store `moveItems` (lạc quan → PUT → thay kết quả server; lỗi → khôi phục các mục đã gửi + ném lại lỗi); `bulkUpdate` tự bù `note`; 3 chỗ dựng payload trong `ScheduleTimeline` qua `toBulkPayload`; MSW PUT thiếu `note` → `null`; CR-10 APPLIED + CONTRACTS §3.3 #11, §6. Test mới 45 (`calendar.test.ts`), tổng 611 (610 xanh); lint/build xanh, entry chính 71,49 kB gz 28,17 (không đổi so T-77) · • Quyết định: lưới chặn ở 1439 (backend `end_minute ≤ 1439`, không có 1440); `layoutColumns` trả thêm `overflow` + `cluster` (cụm >3 cột: 2 cột thật + ô tràn ở cột 3, UI gộp theo `cluster` thành "+N"); `toBulkPayload(changed, all)` nhận thay đổi từng phần `{id, …}`, `note` chỉ đổi khi khoá `note` CÓ MẶT trong `changed`; `moveItems` tự `reorderByStart`; `placeScheduleItem` là tra cứu (trả mục hoặc `undefined`) · • Bẫy: lần `moveItems` cũ không đè bản vẽ lạc quan của lần sau (`moveSeq`); payload rỗng → không gọi PUT · • Việc task sau (T-79): dùng `moveItems`/`toBulkPayload`, `PX_PER_MIN = 64/60`; vẫn còn `handleDragStart/Drop` HTML5 trong `ScheduleTimeline` (T-79 thay) · • Test `decide_wheel` (SWIPE) vẫn lỗi từ trước, không liên quan |
| T-79 | TODO | | |
| T-80 | TODO | | |
| T-81 | TODO | | |
| T-82 | TODO | | |
| T-83 | TODO | | |
| T-84 | TODO | | |
| T-85 | TODO | | |
| T-86 | TODO | | |
| T-87 | TODO | | |
| T-88 | TODO | | |
| T-89 | TODO | | |
| T-90 | TODO | | |
| T-91 | TODO | | |
| T-92 | TODO | | |

## Việc mở mang sang từ giai đoạn trước
- Gđ5: G2/G3 chưa có góp ý; CLS khi giai đoạn đổi do máy khác chưa đạt; danh sách "Chưa làm/chưa kiểm" ở dòng T-75
  `docs/phase5/PROGRESS.md`. Việc backend: `docs/phase5/BACKEND-NOTES.md` (#5 điểm hẹn giữa nhóm → làm ở T-85/T-86).
- CR-09 (PROPOSED): avatar người quẹt SWIPE.
