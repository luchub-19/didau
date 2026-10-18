# Tiến độ giai đoạn 3

Mỗi ô ghi chú tối đa 6 gạch đầu dòng. Chi tiết dài ghi vào mục "Nhật ký" cuối file task.
Cột Review do session reviewer điền (`docs/phase3/REVIEW.md`): `ĐẠT`, `ĐẠT*` (có ghi chú), `CẦN SỬA` (link review).

## Cổng chờ người dùng
| Cổng | Trạng thái |
| :--- | :--- |
| CR-06 (mã lý do/tham số từ backend) | PROPOSED, chờ duyệt |
| Duyệt trang mẫu T-38 | ĐÃ DUYỆT (đồng ý màu/font) |
| Duyệt bản đứng yên sau T-51 | chưa tới |

## Bảng task
| Task | Trạng thái | Session | Review | Ghi chú |
| :--- | :---: | :---: | :---: | :--- |
| T-38 | DONE | a99b8130 | ĐẠT ([review](reviews/T-38.md)) | - Thêm token màu, z-index, radius, motion; 7 cặp màu danh mục đạt ≥3:1.<br>- Cấu hình Be Vietnam Pro, font scale, tailwind tokens; giữ màu cũ.<br>- Thêm base.css, favicon SVG ghim coral, dev/StyleGuide.tsx tại `/_styleguide`.<br>- 150/150 test FE xanh, build xanh; ảnh lưu `docs/phase3/screens/T-38-*.png`.<br>- Cấm chữ trắng trên coral; nút primary dùng `bg-accent text-ink font-semibold`.<br>- Task sau dùng token trong tailwind và component mới. |
| T-39 | DONE | d576ece6 | | - Thêm lõi i18n (i18next 26.5.2, react-i18next 17.1.0), tài nguyên gói sẵn, fallback 'vi'.<br>- Thêm useLanguage(), format.ts (chuẩn Intl vi-VN/en-US: time, duration, money, distance, relative).<br>- Thêm LanguageSwitcher (aria-pressed, aria-label); hiển thị thử nghiệm trên /_styleguide.<br>- Chuyển màn waking/error App.tsx sang t(); main.tsx và useMinuteFormat dùng format.ts.<br>- 168/168 test FE xanh (150 cũ + 18 mới), lint 0 cảnh báo, build xanh; PENDING_FILES: 48 file.<br>- Task sau gọi t() qua useTranslation(), thêm khoá vào vi/en.ts và xoá file khỏi PENDING_FILES khi xong. Chưa kiểm tra trực quan (không có Chrome). |
| T-40 | DONE | dd4a5e6a | | - Tạo bộ 12 component UI Kit tại components/ui/ (Button, IconButton, TextField, Chip, Card, Sheet, ConfirmSheet, Toast, Skeleton, EmptyState, Avatar, Segmented, Icon).<br>- Thêm khoá ui.* vào vi/en.ts; gắn ToastViewport vào App.tsx; cập nhật /_styleguide với component thật.<br>- 190/190 test FE xanh (168 cũ + 22 mới ở ui_kit.test.tsx), lint 0 lỗi, build xanh; i18n_guard xanh.<br>- grep màu Tailwind gốc trong ui/ rỗng; không hardcode tiếng Việt trong ui/.<br>- ToastViewport hỗ trợ fallback getState() trong môi trường node/renderToStaticMarkup.<br>- Task sau (T-41) dùng component trong components/ui/ để dựng khung phòng và tab bar. Chưa kiểm tra trực quan (không có Chrome). |
| T-41 | DONE | 4c8874f4 | | - Tạo khung phòng RoomShell, RoomTopBar, BottomTabBar (mobile 56px + safe-area, ẩn khi mở bàn phím) & DesktopTabBar (lg), ConnectionBanner, hook useRoomTab (quản lý ?tab= và popstate).<br>- Tách 4 panel PlacesPanel, MapPanel (giữ mounted sau lần mở đầu, gọi resize), SchedulePanel, GroupPanel (thông tin phòng + LanguageSwitcher).<br>- Màn loading phòng dùng Skeleton (bỏ spinner); màn chưa tham gia / lỗi dùng EmptyState; thay confirm/alert bằng ConfirmSheet và toast.<br>- Bổ sung khoá room.*, connection.* vào vi/en.ts; xoá pages/RoomPage.tsx khỏi PENDING_FILES (còn 47 file).<br>- 199/199 test FE xanh (190 cũ + 9 mới ở room_shell.test.tsx), lint 0 lỗi, build xanh; 412 unit tests BE xanh (test tích hợp DB chưa chạy trong sandbox).<br>- Task sau lưu ý: tab phòng qua ?tab=places\|map\|schedule\|group; MapView giữ mounted ẩn/hiện. Chưa kiểm tra trực quan (không có Chrome). |
| T-42 | TODO | | | |
| T-43 | TODO | | | |
| T-44 | TODO | | | |
| T-45 | TODO | | | |
| T-46 | TODO | | | |
| T-47 | TODO | | | |
| T-48 | TODO | | | |
| T-49 | TODO | | | |
| T-50 | TODO | | | |
| T-51 | TODO | | | |
| T-52 | TODO | | | |
| T-53 | TODO | | | |
| T-54 | TODO | | | |
| T-55 | TODO | | | |

## Review theo mốc
| Mốc | Review |
| :--- | :--- |
| M1 (T-38→T-41) | |
| M2 (T-42→T-43) | |
| M3 (T-44→T-50) | |
| M4 (T-51) | |
| M5 (T-52→T-53) | |
| M6 (T-54→T-55) | |

## Cho task sau (việc ngoài phạm vi phát hiện được)
- (trống)
