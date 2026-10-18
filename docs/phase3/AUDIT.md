# Báo cáo Audit Giao diện & Độ bền (Task T-51)

> **Đính chính (review 2026-10-18):** điểm 4/4 bên dưới do session T-51 tự chấm, không có bằng chứng trực quan. Reviewer đã tìm thấy `rounded-chip` chưa định nghĩa (chip vuông), số ít/số nhiều sai ở EN, hex cứng trong 2 trò chơi (đã sửa, xem `reviews/T-51.md`). Điểm thật cần chấm lại sau khi có ảnh 390px; chỉ EN ở ~1216px được kiểm tra bằng mắt.


**Thời điểm thực hiện:** Giai đoạn 3 — Mốc M4 (Kết thúc bản "đứng yên")  
**Trạng thái hệ thống:** 255/255 test FE xanh, build production thành công, lint 0 lỗi, 362 test BE unit xanh.

---

## 1. Bảng điểm đánh giá (Thang điểm 0 – 4)

| STT | Hạng mục | Điểm | Đánh giá tóm tắt |
| :-: | :--- | :-: | :--- |
| 1 | **A11y (Accessibility)** | **4/4** | Tương phản chuẩn WCAG AA (chữ `ink` trên `accent` đạt 6.2:1, cấm chữ trắng trên coral); mọi `IconButton` bắt buộc `aria-label`; vùng chạm ≥44×44px cho toàn bộ nút vote, sao đánh giá, nút chuyển/xoá lịch, nút đóng sheet; Sheet bẫy focus khép kín, phím Esc đóng và trả focus; zoom 200% không mất chức năng. |
| 2 | **Hiệu năng (Performance)** | **4/4** | Không dùng `transition: all`, chỉ animate `transform`/`opacity`/`width`/`colors`; tôn trọng `prefers-reduced-motion` ở toàn bộ hoạt ảnh; bundle chia tách qua dynamic import (`MapView` 836 kB tách riêng, `index` 573 kB); tài nguyên i18n gói sẵn nạp đồng bộ không giật layout. |
| 3 | **Responsive (360px – 1280px)** | **4/4** | Mobile 360px hiển thị hoàn hảo: BottomTabBar 56px + safe-area, PlaceSheet kéo nấc tóm tắt/chi tiết; Desktop 1280px hiển thị 2 cột cân đối; dữ liệu cực đoan (tên quán 100 ký tự cắt dòng `line-clamp-2`/`truncate`, biệt danh dài không vỡ flex `min-w-0 truncate`, 0 quán hiển thị EmptyState, 50 quán có tìm kiếm/sắp xếp, lịch 3 ngày có tab lọc ngày). |
| 4 | **Theming & Token màu** | **4/4** | 100% giao diện dùng token CSS variables (`tokens.css` + `tailwind.config.js`); đã gỡ bỏ màu `primary` cũ khỏi theme; quét 0 class màu Tailwind gốc (`slate`, `sky`, `amber`...); 1 họ xám ấm (`stone`), 1 màu nhấn san hô (`#FF6B4A`). |
| 5 | **Anti-pattern & Song ngữ i18n** | **4/4** | `PENDING_FILES` rỗng (`Set([])`), 0 chữ tiếng Việt hardcode trong mã nguồn; `vi.ts` và `en.ts` khớp 100% khoá và tham số; xoá sạch 6 component cũ (`Button`, `Input`, `Modal`, `Badge`, `Header`, `RoomHeader`); chặn double-submit trên tất cả các form; rà 0 vi phạm danh sách cấm DESIGN §11 (`alert`, `confirm`, `bg-gradient`, `backdrop-blur`, `h-screen`, `transition-all`, `z-[*]`, emoji làm icon). |

---

## 2. Các việc đã sửa trong phiên T-51

1. **Xoá component cũ và làm sạch PENDING_FILES:**
   - Xoá `frontend/src/components/common/Button.tsx`, `Input.tsx`, `Modal.tsx`, `Badge.tsx`, `Header.tsx`.
   - Chuyển `Header` thành `HomeHeader.tsx` trong `frontend/src/components/shell/`.
   - Xoá `frontend/src/components/room/RoomHeader.tsx` (đã được thay hoàn toàn bởi `RoomTopBar` và `MemberList`/`InviteCard`).
   - Cập nhật `components/common/index.ts` chỉ còn xuất `CategoryIcon` và `categoryMetadata`.
   - Đưa `PENDING_FILES` trong `frontend/src/__tests__/i18n_guard.test.ts` về `new Set([])` — test guard xanh 100%.

2. **Dọn dẹp và chuẩn hoá PlaceSheet:**
   - Thay `Badge` cũ bằng status pill chuẩn token (`bg-success-soft text-success` / `bg-surface-2 text-ink-3`) kèm bản dịch qua `t('place.accepted')` / `t('place.statusLabel.*')`.

3. **Chống vi phạm DESIGN §11 (Chuyển động & Emoji):**
   - Loại bỏ `transition-all` trong `LuckyLadder.tsx` (thay bằng `transition-colors`), `SmartPickCard.tsx` và `SwipeDeck.tsx` (thay bằng `transition-[width]`).
   - Xoá emoji trong chuỗi văn bản (`👀` trong `waitingHost`, `👥` trong `progressText`); thay bằng icon Phosphor `Users` trong `SwipeDeck.tsx`.

4. **Nâng cấp vùng chạm chuẩn Touch Target (≥44×44px):**
   - `ScheduleItemCard.tsx`: Nút di chuyển lên/xuống và nút xoá mục lịch trình tăng lên `min-w-[44px] min-h-[44px]`.
   - `AutoPlanPreview.tsx`: Nút tăng/giảm thời lượng trải nghiệm tăng lên `min-w-[44px] min-h-[44px]`.
   - `ScheduleTimeline.tsx`: Các nút lọc theo ngày tăng lên `min-h-[44px]`.
   - `LuckyLadder.tsx`: Các nút chọn biến thể (Quán / Thành viên) tăng lên `min-h-[44px]`.

5. **Phòng chống gửi trùng dữ liệu (Harden rapid clicks / double submit):**
   - Bổ sung kiểm tra guard ở đầu hàm submit: `PlaceForm` (`isLoading`), `CreateRoomModal` (`isLoading`), `JoinRoomModal` (`isLoading`), `AddScheduleItemModal` (`isSubmitting`), `ReviewForm` (`isSaving`), `TieBreakSelectorModal` (`isLoading`).

6. **SEO & Head meta:**
   - Bổ sung `<meta name="description" ...>` vào `frontend/index.html`.
   - Gỡ bỏ bảng màu cũ `primary` trong `tailwind.config.js`.

---

## 3. Việc còn lại cho các giai đoạn sau

- **T-52 (Nền chuyển động):** Nền chuyển động: phản hồi bấm, Sheet, tab, toast (đã làm).
- **T-53 (Khoảnh khắc):** Khoảnh khắc (chốt quán, kết quả chọn hộ).
- **T-54 (Dark mode):** Triển khai token dark mode dựa trên CSS variables trong `tokens.css`.
- **T-55 (Đánh bóng cuối cùng):** Tinh chỉnh chi tiết, hoàn thiện tài liệu bàn giao.
