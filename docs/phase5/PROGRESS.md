# Tiến độ giai đoạn 5 "Không gian phòng"

Mỗi ô ghi chú tối đa 6 gạch đầu dòng. Chi tiết dài ghi vào mục "Nhật ký" cuối file task (`tasks/T-xx.md`).
Thứ tự làm, phụ thuộc và ước lượng token: `PLAN.md` §6. Luật giao diện: `DESIGN.md`.

## Cổng chờ người dùng
| Cổng | Sau task | Nội dung | Trạng thái |
| :--- | :--- | :--- | :--- |
| G1 | T-65 | Duyệt `PLAN.md` + `DESIGN.md` (bố cục theo mock, 5 câu hỏi mở ở DESIGN §11) | CHỜ |
| G2 | T-71, T-72, T-73 | Người dùng tự dùng thử phòng mới trên máy (desktop + điện thoại) trước khi đánh bóng | CHỜ |
| G3 | T-75 | Duyệt bộ ảnh cuối `screens/final/` + `DEMO.md` cập nhật | CHỜ |

## Việc của người (session không tự làm được)
| Việc | Cần trước | Ghi chú |
| :--- | :--- | :--- |
| Ảnh quán tuyển chọn, **đợt 1 (10–15 quán) trước**, 2–3 ảnh/quán | Đợt 1 trước T-75 (chụp ảnh demo); T-71/T-72 chạy được khi chưa có (hiện minh hoạ danh mục) | Sau T-70: mở `docs/phase5/curated-checklist.html` → bấm link Google Maps/Foody của từng quán → lưu ảnh vào `curated-inbox/` theo tên trang ghi (đuôi gì cũng được) → chạy `python3 scripts/curated_images.py` (tự thu nhỏ, đổi WebP, cập nhật checklist). Đợt 2 bổ sung dần, không chặn task nào |
| (Tuỳ chọn) bật Google: key + billing như mục "Việc của người" trong `CLAUDE.md` | T-71 nếu muốn thử UI Kit thật | Không bật thì panel chi tiết dùng dữ liệu tuyển chọn + OSM, vẫn đủ đẹp để demo |

## Bảng task
| Task | Trạng thái | Session | Ghi chú |
| :--- | :---: | :---: | :--- |
| T-65 | DONE | 254fa2f0 | • Làm: `docs/phase5/` PLAN, DESIGN, PROGRESS, BACKEND-NOTES, 11 file task, `mock/` (7 artboard chép từ canvas); `CLAUDE.md` thêm mục gđ5, sửa dòng nhánh cũ; skill `didau-ui` trỏ DESIGN gđ5. Không đổi code, không chạy test · • Quyết định: ngân sách = mỗi người cả buổi; không làm "đang hot" (thay 4 dải gợi ý); bộ dữ liệu tuyển chọn trong repo thay cho phụ thuộc Google · • Phát hiện: `avatar_url` (VARCHAR 500) có sẵn khi tạo/vào phòng → avatar DiceBear đồng bộ không cần backend (chưa đổi được sau khi vào); `.ics` một quán có ở `stage/reveal/actions.ts`; REST không có danh sách người đã vote · • Task sau: chờ **G1** (5 câu hỏi DESIGN §11); T-66 và T-70 làm được ngay sau G1 |
| T-66 | DONE | 5bca14e8 | • Làm: `room/phase.ts` (`roomPhase`, `phaseStep`, `resolveViewStep`, `nextReview`), `room/useRoomPhase.ts`, `components/shell/PhaseStepper.tsx` (variant `full`/`compact`) gắn vào `RoomTopBar`; khoá `phase.*` VI/EN. 10 test mới → 408 test xanh, lint/build xanh; bundle `index` 625,70 kB (gzip 187,07) · • Ảnh: `docs/phase5/screens/T-66/topbar-{1440,500}-{vi,en}-{gather,vote,send}.png` (12 ảnh, Chrome headless + MSW, đổi phase bằng setState store; banner "mất kết nối" do mock không có WS). Lệch plan: làm khi G1 vẫn CHỜ theo yêu cầu trực tiếp của người dùng · • Quyết định: không có jsdom/testing-library nên logic `viewStep` tách thành hàm thuần để test; `viewStep` hết hiệu lực khi `phase` đổi (so `review.phase`) · • Task sau: `useRoomPhase()` trả `{ phase, step, viewStep, setViewStep }` — T-67 đọc `viewStep` để đổi bố cục; stepper chỉ thấy từ `md` trở lên, mobile là dòng "Bước x/4 · tên" dưới thanh đỉnh · • Bẫy: `hints` rỗng/lạ → `vote`; `useRoomPhase` gọi trong `RoomTopBar` nên mỗi nơi gọi có state `viewStep` riêng — T-67 cần nâng lên context nếu bố cục cần chia sẻ |
| T-67 | TODO | | |
| T-68 | TODO | | |
| T-69 | TODO | | |
| T-70 | TODO | | |
| T-71 | TODO | | |
| T-72 | TODO | | |
| T-73 | TODO | | |
| T-74 | TODO | | |
| T-75 | TODO | | |

## Việc mở mang sang từ giai đoạn trước
- CR-09 (PROPOSED): avatar người quẹt trong phiên SWIPE — xem "Nâng cấp để sau" cuối `docs/phase4/PROGRESS.md`.
- DB local còn phòng thử `RTGNWK` (giai đoạn 3) — người dùng quyết giữ hay xoá.
- Việc backend phát sinh từ thiết kế mới: `BACKEND-NOTES.md` (chưa lên lịch).
