# Báo cáo Audit Giao diện & Độ bền (Tổng kết Giai đoạn 3 - Task T-55)

**Thời điểm thực hiện:** Giai đoạn 3 — Mốc M6 (Đánh bóng & Hoàn tất Giai đoạn 3)  
**Trạng thái hệ thống:**
- **Frontend**: 270/270 test pass (20 suites), lint 0 lỗi, TypeScript 0 cảnh báo, Vite production build sạch.
  - Bundle kích thước: `index.js` 581.3 kB (gzip 171.2 kB), `MapView.js` 837.7 kB (gzip 228.0 kB, dynamic import tách riêng khi mở tab Map), `index.css` 52.9 kB (gzip 9.5 kB).
  - Font subsets: `@fontsource/be-vietnam-pro` chỉ nạp các tệp subset `vietnamese` và `latin` (400, 500, 600, 700) với `font-display: swap`.
- **Backend**: 519/519 test pass (365 unit tests + 154 integration tests trên PostgreSQL 15 thật), Ruff 0 lỗi.
- **Docker Compose**: Cả 3 container (`didau_db`, `didau_backend`, `didau_frontend`) healthy, migration Alembic `003` (CR-06 reason codes) áp dụng thành công.

---

## 1. Bảng điểm đánh giá (Thang điểm 0 – 4)

| STT | Hạng mục | Điểm | Bằng chứng & Đánh giá chi tiết |
| :-: | :--- | :-: | :--- |
| 1 | **A11y (Accessibility)** | **3.9/4** | - **Độ tương phản**: Đạt WCAG AA và AAA; chữ `ink` trên nền sáng đạt 16.7:1; chữ `ink` trên coral `accent` đạt 6.2:1 (cấm tuyệt đối chữ trắng trên coral); Dark mode đạt AAA (15.4:1–17.1:1).<br>- **Vùng chạm**: 100% nút bấm, thanh điều khiển, nút vote, nút chọn sao, nút chuyển/xoá lịch đạt tối thiểu ≥44×44px theo Apple HIG.<br>- **Bàn phím & Focus**: Sheet bẫy focus khép kín, phím `Esc` đóng và trả focus; `:focus-visible` viền 2px rõ nét; bàn phím CaretUp/Down hỗ trợ sắp xếp lịch trình.<br>- **Screen Reader**: `aria-label`, `aria-selected`, `aria-live="polite"` tại các trò chơi chọn hộ và thông báo cập nhật kết quả. *(Trừ 0.1 điểm do kiểm thử trực quan trên môi trường headless không có tương tác người dùng khiếm thị thực tế).* |
| 2 | **Hiệu năng (Performance)** | **3.9/4** | - **Motion & Animation**: 0 vi phạm `transition: all` hay `transition-all`. Chỉ animate thuộc tính phần cứng (`transform`, `opacity`, `colors`, `width`).<br>- **Tôn trọng người dùng**: Hỗ trợ đầy đủ `@media (prefers-reduced-motion: reduce)` tắt toàn bộ hiệu ứng nảy, sweep, xoay.<br>- **Chia tách Bundle**: Thư viện bản đồ nặng (`MapView` ~837 kB) tách hoàn toàn qua dynamic import, chỉ nạp khi người dùng mở tab Bản đồ.<br>- **Bộ nhớ & Trình duyệt**: `useSyncExternalStore` đồng bộ theme nhẹ nhàng, không render thừa; `format.ts` cache instance `Intl.DateTimeFormat` và `Intl.NumberFormat`. |
| 3 | **Responsive (360px – 1280px)** | **3.9/4** | - **Mobile-First**: Tối ưu chuẩn kích thước 360px–430px; BottomTabBar 56px có `env(safe-area-inset-bottom)` và tự ẩn khi bàn phím ảo mở (visualViewport / focusin).<br>- **Desktop Adaptation**: Trên màn hình lớn (`lg:` ≥1024px), thanh tab chuyển sang DesktopTabBar; tab Bản đồ hiển thị 2 cột cân đối (danh sách quán bên trái, bản đồ tương tác bên phải).<br>- **Phòng thủ dữ liệu cực đoan**: Tên quán 100 ký tự cắt dòng `line-clamp-2`; biệt danh thành viên dài không làm vỡ flex layout (`min-w-0 truncate`); empty state hiển thị gọn gàng khi 0 dữ liệu. |
| 4 | **Theming & Token màu** | **4.0/4** | - **100% CSS Variables**: Toàn bộ mã nguồn `frontend/src` sử dụng token CSS variables từ `tokens.css` và `tailwind.config.js`. Đã xoá sạch mã màu cũ `primary` và các class màu Tailwind thô (`slate`, `amber`, `sky`...).<br>- **Dark Mode Tự Nhiên**: Nền tối ấm `#141210`, thẻ `#1F1D1A`, viền `#38332E`. Tự động đảo màu chữ trên nút `accent` thành màu tối để giữ độ tương phản 6.6:1 (tránh chữ trắng trên coral).<br>- **Màu dữ liệu danh mục**: 7 cặp màu `cat-*` và `cat-*-soft` đạt chuẩn tương phản ≥3:1 cho icon và nhãn phân loại. |
| 5 | **Anti-pattern & Song ngữ i18n** | **4.0/4** | - **Không Hardcode**: `PENDING_FILES` trong `i18n_guard.test.ts` rỗng tuyệt đối (`Set([])`). Không còn chuỗi tiếng Việt hardcode trong component JSX.<br>- **Đồng bộ song ngữ**: `vi.ts` và `en.ts` khớp 100% khoá và cấu trúc tham số (kiểm tra tự động qua `i18n_parity.test.ts`).<br>- **Server Text & Error Mapping**: 100% lỗi API và thông báo xung đột đi qua `describeApiError` và `describeConflict` (không hiển thị lỗi thô server).<br>- **Danh sách cấm DESIGN §11**: 0 vi phạm `alert`, `confirm`, `bg-gradient`, `backdrop-blur`, `h-screen` (đã dùng `min-h-dvh`), `z-[*]` tuỳ tiện. |

---

## 2. Các việc hoàn tất trong toàn bộ Giai đoạn 3

1. **Nền tảng & Hạ tầng Design (T-38, T-39, T-40):**
   - Thiết lập bảng token màu, typography Be Vietnam Pro, hệ thống lưới, bo góc, z-index.
   - Xây dựng lõi i18n (`useLanguage`, `format.ts`, `LanguageSwitcher`, kiểm thử parity/guard).
   - Bộ 12 component UI Kit (`Button`, `IconButton`, `TextField`, `Chip`, `Card`, `Sheet`, `ConfirmSheet`, `Toast`, `Skeleton`, `EmptyState`, `Avatar`, `Segmented`).

2. **Khung giao diện & Các Tab chức năng (T-41, T-44, T-45, T-46, T-47, T-50):**
   - Tái cấu trúc trang chủ `HomePage` và khung phòng `RoomShell` (BottomTabBar, DesktopTabBar, ConnectionBanner).
   - Tab Quán (`PlacesPanel`, `PlaceCard`, `PlaceForm`, `CategoryFilter`, `VoteButtons`).
   - Tab Lịch trình (`SchedulePanel`, `ScheduleTimeline`, `ScheduleItemCard`, `TimeSlotPicker`, `ConflictAlertBanner`, `ConflictListModal`, `AutoPlanButton`, `AutoPlanPreview`).
   - Tab Bản đồ (`MapPanel`, `MapView`, `RoomPlacesLayer`, `PoiLayer`, `RouteLayer`, `PlaceSheet`, `NearbySuggestions`, `MapSearchBox`, `ReviewForm`).
   - Tab Nhóm (`GroupPanel`, `MemberList`, `InviteCard`, cài đặt ngôn ngữ và giao diện).

3. **Cơ chế Ra quyết định & Trò chơi (T-48, T-49):**
   - Chuyển đổi toàn bộ sang `Sheet`: `DecideModal`, `DeciderBanner`, `SmartPickCard`, `TieBreakSelectorModal`.
   - Viết lại 3 mini-game: `SpinWheel` (vòng quay mượt mà với kim chỉ accent), `SwipeDeck` (thẻ vuốt với chống kẹt cử chỉ cảm ứng), `LuckyLadder` (thang may mắn công bằng).

4. **Độ bền, Hoạt ảnh & Dark Mode (T-51, T-52, T-53, T-54):**
   - Xoá sạch toàn bộ component cũ và làm rỗng `PENDING_FILES`.
   - Bộ hoạt ảnh CSS tinh gọn (`motion.css`): phản hồi bấm `scale(0.97)`, Bottom Sheet trượt mượt mà và vuốt xuống để đóng, vạch chỉ báo tab trượt ngang, nảy số vote, sweep coral sang success khi chốt quán, và lộ diện quán thắng cuộc.
   - Hỗ trợ chế độ tối toàn diện (`tokens.css`, `useTheme.ts`, đồng bộ `data-theme`).

5. **Backend CR-06 & Đồng bộ Dữ liệu (T-42):**
   - Bổ sung `params` cho 5 luật xung đột lịch trình; migration Alembic `003_reason_codes` thêm cột `params` JSONB.
   - Bổ sung `reason_codes` cho `SmartPick` và thuật toán lập lịch trình `ItineraryPlanner`.
   - Cập nhật hợp đồng `CONTRACTS.md` và `CHANGE_REQUESTS.md`.

6. **Đánh bóng & Hoàn thiện cuối cùng (T-55):**
   - Sửa chiều cao màn hình `min-h-screen` thành `min-h-screen min-h-dvh` trong `App.tsx`.
   - Áp dụng token `--t-ui` cho transition ẩn hiện bàn phím của `BottomTabBar`.
   - Đưa `*.tsbuildinfo` vào `.gitignore` và loại bỏ khỏi bộ nhớ đệm Git.
   - Cập nhật tài liệu `README.md`, `AUDIT.md`, `PROGRESS.md`, `CLAUDE.md`.
   - Xác nhận toàn bộ kiểm thử backend và frontend xanh 100%, chạy thử nghiệm thành công trên Docker Compose.
