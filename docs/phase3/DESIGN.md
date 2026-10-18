# LUẬT THIẾT KẾ "ĐI ĐÂU" (giai đoạn 3)

Bản rút gọn những gì dùng được cho dự án này từ hai repo `leonxlnx/taste-skill` và `pbakaus/impeccable`, đối chiếu
thêm WCAG 2.2, Apple HIG, Material và nguyên tắc motion của Emil Kowalski. Lý do chọn/bỏ từng skill: xem `PLAN.md` mục 3.

**Đọc theo mục.** Mỗi file task ghi rõ cần đọc mục nào. Đây là hợp đồng giao diện: muốn lệch thì ghi vào PROGRESS
giai đoạn 3 và hỏi người dùng, không tự đổi token.

---

## 1. Định vị (đọc với mọi task UI)

- **Người dùng:** sinh viên và người trẻ 18–25 tuổi, mở link mời qua Zalo/Messenger **trên điện thoại**, thường đang
  nhắn tin với nhóm cùng lúc. Họ cần xong việc nhanh (đề xuất quán, vote, xem lịch) chứ không ngồi khám phá.
- **Chế độ màn hình** (theo impeccable):
  - Trang chủ = **Persuade nhẹ**: một câu nói rõ app làm gì, một hành động chính.
  - Mọi thứ trong phòng = **Operate**: quen thuộc, dễ quét, nhất quán. Cá tính chỉ nằm ở màu, chữ và **một** điểm nhấn.
- **Cảm giác:** tươi, thân thiện, có màu, nhưng không trẻ con. Vui đến từ màu coral, chữ to rõ, lời văn tự nhiên và vài
  khoảnh khắc có chủ đích, **không** từ emoji, gradient hay hiệu ứng rải khắp nơi.
- **Điểm nhấn riêng (signature):** coral là màu "quán đang được nhóm chọn": pin trên bản đồ, chip đã vote, quán đã chốt.
  Nhìn thấy coral tức là "nhóm mình". Đừng dùng coral cho thứ không liên quan đến lựa chọn hay hành động chính.

## 2. Token màu (nền sáng; dark mode làm ở T-54)

Mọi màu đi qua CSS variable trong `src/styles/tokens.css`, map vào Tailwind (`theme.extend.colors`). Component **không**
viết mã hex hay class màu Tailwind gốc (`bg-slate-50`, `text-sky-600`...) nữa, chỉ dùng tên token.

| Token | Giá trị | Dùng cho | Tương phản |
| :--- | :--- | :--- | :--- |
| `bg` | `#FAFAF9` | nền trang | |
| `surface` | `#FFFFFF` | thẻ, sheet, thanh tab | |
| `surface-2` | `#F5F5F4` | vùng phụ, input, chip chưa chọn | |
| `line` | `#E7E5E4` | viền input, ngăn cách hiếm hoi | |
| `ink` | `#1C1917` | chữ chính | 16.7:1 trên `bg` |
| `ink-2` | `#57534E` | chữ phụ | 7.3:1 |
| `ink-3` | `#78716C` | chú thích ≥14px, placeholder | 4.8:1 trên trắng |
| `accent` | `#FF6B4A` | nền nút chính, pin "của nhóm", chọn | chữ `ink` trên nó: 6.2:1 |
| `accent-hover` | `#F25C3C` | hover/pressed nút chính | chữ `ink`: 5.3:1 |
| `accent-soft` | `#FFF1EC` | nền chip/thẻ đang chọn | |
| `accent-text` | `#C73E26` | chữ/link màu coral trên nền sáng | 5.1:1 trên trắng |
| `success` / `success-soft` | `#047857` / `#ECFDF5` | quán đã chốt, lưu xong | |
| `warning` / `warning-soft` | `#B45309` / `#FFFBEB` | xung đột mức WARNING | |
| `danger` / `danger-soft` | `#B91C1C` / `#FEF2F2` | CRITICAL, xoá, lỗi | |
| `info` / `info-soft` | `#0369A1` / `#F0F9FF` | gợi ý, trạng thái trung tính | |

Luật:
- **Cấm chữ trắng trên coral** (2.8:1, trượt AA). Nút chính = nền `accent` + chữ `ink`, chữ đậm 600.
- Một màu nhấn duy nhất. Màu trạng thái chỉ xuất hiện khi mang nghĩa (lỗi, cảnh báo, thành công).
- Một họ xám ấm (stone). Không trộn xám lạnh (slate) với xám ấm.
- 7 màu danh mục (FOOD, DRINK...) là **màu dữ liệu**: chỉ dùng cho icon danh mục, pin POI và chip lọc. Mỗi danh mục
  có cặp `cat-<x>` (đậm, cho icon/pin) và `cat-<x>-soft` (nền chip), định nghĩa ở T-38, kiểm tra tương phản 3:1 cho icon.
- Không gradient (nền, nút, chữ), không glow, không glass/blur trang trí. Lớp phủ sau sheet là màu `ink` 40% đặc.

## 3. Chữ

- Font: **Be Vietnam Pro** (`@fontsource/be-vietnam-pro`, subset `vietnamese` + `latin`, weight 400/500/600/700,
  `font-display: swap`). Một họ chữ cho toàn app, không font display riêng, không monospace trừ mã phòng.
- Mã phòng (`DIDAU8`) dùng chữ số `tabular-nums` + `letter-spacing: 0.08em`, **không** dùng monospace.
- Thang cố định (rem, mobile-first, tỉ lệ khoảng 1.2), không `clamp()` trong phòng:

| Tên | Cỡ / dòng | Dùng cho |
| :--- | :--- | :--- |
| `display` | 32/40, 700, tracking −0.02em | chỉ tiêu đề trang chủ (desktop 44/52) |
| `title` | 22/30, 700 | tiêu đề màn/sheet |
| `heading` | 18/26, 600 | tiêu đề nhóm, tên quán trong thẻ |
| `body` | 16/24, 400 | chữ thường, input (16px để iOS không tự zoom) |
| `label` | 14/20, 500 | nhãn, nút nhỏ, chip |
| `caption` | 13/18, 400 | thông tin phụ; không nhỏ hơn mức này |

- **Tiếng Việt cần khoảng dòng:** dấu chồng (Ể, Ỗ, Ậ) cao gần gấp đôi dấu thường. Line-height tiêu đề tối thiểu 1.25,
  chữ thường 1.5. Không `leading-none`, không VIẾT HOA TOÀN BỘ có tracking rộng (nhãn nhỏ viết hoa là "tell" của AI và
  khó đọc với dấu).
- Viết hoa kiểu câu (sentence case) cho cả hai ngôn ngữ: "Thêm quán", "Add a place", không "Add A Place".
- Đoạn văn tối đa khoảng 65 ký tự mỗi dòng; tiêu đề dùng `text-wrap: balance`.

## 4. Không gian, bo góc, độ nổi

- Lưới 4px: 4, 8, 12, 16, 24, 32, 48. Lề màn hình điện thoại 16px, desktop nội dung tối đa 1120px.
- Khoảng cách trong nhóm < giữa các nhóm; phía trên tiêu đề nhiều hơn phía dưới.
- **Vùng chạm tối thiểu 44×44px** (Apple HIG; WCAG 2.2 AA chỉ đòi 24px nhưng 44 an toàn cho ngón cái). Icon nhỏ thì
  nới vùng bấm bằng padding.
- Bo góc, quy tắc duy nhất: **điều khiển nhỏ (nút, chip, tab) bo tròn hẳn**; **thẻ và sheet 16px**; **input 12px**.
- Độ nổi: tách bề mặt bằng nấc màu (`bg` → `surface`), không viền + bóng cùng lúc. Bóng chỉ cho thứ thật sự nổi:
  sheet, toast, thanh tab dưới, menu (bóng mềm có offset, ví dụ `0 8px 24px rgb(28 25 23 / 0.12)`).
- z-index theo thang trong token: `map 0`, `content 10`, `tabbar 30`, `sheet 40`, `toast 50`. Không `z-[9999]`.

## 5. Bố cục và điều hướng (mobile-first)

- Viết CSS cho 360–430px trước, rồi `md:` (≥768) và `lg:` (≥1024). Không `h-screen`, dùng `min-h-dvh`.
- **Trong phòng:** thanh tab dưới cố định 4 mục **Quán · Bản đồ · Lịch · Nhóm**, mỗi mục icon + nhãn (không bao giờ
  chỉ icon), cao 56px + `env(safe-area-inset-bottom)`. Mục đang chọn: icon fill + chữ `ink` + chấm/viền coral.
- Từ `lg:`: thanh tab chuyển lên đầu dưới header (hoặc cột trái); tab Bản đồ dùng bố cục hai cột: danh sách bên trái,
  bản đồ bên phải.
- Tab đang mở ghi vào URL (`?tab=map`) để nút Back và link chia sẻ giữ đúng tab.
- **Hành động chính của mỗi tab** nằm trong tầm ngón cái: nút nổi hoặc nút cuối danh sách ở nửa dưới màn hình
  ("Thêm quán", "Lên lịch giúp tôi").
- **Sheet thay modal:** trên điện thoại mọi form/chi tiết mở bằng bottom sheet (kéo xuống hoặc nút X để đóng, `Esc`
  đóng, focus vào sheet, trả focus khi đóng); từ `md:` cùng component hiển thị thành dialog giữa màn. Không dùng modal
  cho việc làm được ngay tại chỗ (vote, lọc, đổi tab).
- Không dùng `window.alert` / `window.confirm`. Thông báo ngắn = toast; xác nhận xoá = sheet xác nhận nêu rõ đối tượng
  ("Xoá *Phở Hoà* khỏi danh sách?"), hoặc tốt hơn là hoàn tác (undo) nếu khôi phục được.

## 6. Component (bộ khung ở `src/components/ui/`, làm ở T-40)

Mọi component tương tác có đủ trạng thái: mặc định, hover (chỉ sau `@media (hover: hover)`), focus-visible,
pressed, disabled, loading, lỗi.

- **Button**: `primary` (coral), `secondary` (`surface-2` + chữ `ink`), `ghost` (chỉ chữ), `danger`. Cỡ `md` 44px,
  `lg` 52px. Nhãn là động từ + đối tượng, 1–3 từ, không xuống dòng. Mỗi màn chỉ một nút `primary`.
- **IconButton**: 44×44, bắt buộc `aria-label` (qua i18n).
- **TextField**: nhãn **phía trên** (không dùng placeholder làm nhãn), gợi ý bên dưới, lỗi bên dưới màu `danger` kèm
  icon, `aria-describedby`. Input 16px.
- **Chip**: lọc danh mục, tag đánh giá. Cuộn ngang trên điện thoại, không xuống nhiều dòng.
- **Card**: nền `surface`, 16px, padding 16. Không lồng thẻ trong thẻ. Không hàng 3 thẻ icon giống hệt nhau.
- **Sheet**, **Toast**, **ConfirmSheet**, **Skeleton**, **EmptyState**, **Avatar** (bo 12px, chữ cái đầu, màu theo hash).
- **Icon**: `@phosphor-icons/react`, kiểu `regular` cho mặc định, `fill` cho trạng thái chọn, cỡ 20 (24 cho tab).
  Một bộ icon duy nhất; không emoji, không ký tự unicode làm icon.

## 7. Trạng thái (không có thì chưa xong)

- **Đang tải:** skeleton đúng hình nội dung, không spinner giữa màn (spinner nhỏ trong nút đang gửi thì được).
  Lời đang tải nêu đúng việc: "Đang tải danh sách quán…".
- **Trống:** dạy cách dùng và có một hành động: tab Quán trống → "Chưa có quán nào. Dán link ShopeeFood/Grab hoặc chọn
  trên bản đồ." + nút "Thêm quán".
- **Lỗi:** nói cái gì hỏng, cách khắc phục, có nút thử lại. Không "Oops!", không lộ mã lỗi làm thông điệp chính.
- **Quyền:** việc chỉ Host làm được thì hiển thị khoá kèm lý do, không ẩn mất làm người dùng tìm.
- **Ngoại tuyến / WebSocket mất kết nối:** dải mỏng phía trên "Mất kết nối, đang thử lại…", không chặn cả màn.

## 8. Chuyển động (chỉ làm từ T-52; trước đó giao diện phải hoàn chỉnh khi đứng yên)

- Câu hỏi trước mọi animation (Emil Kowalski): **thấy bao nhiêu lần?** Hàng trăm lần (gõ phím, vote liên tục) thì
  không animate hoặc chỉ đổi màu; thỉnh thoảng (mở sheet) thì animate chuẩn; một lần (kết quả chọn hộ) thì được kéo dài.
- **Mục đích hợp lệ:** xác nhận hành động, giải thích thay đổi trạng thái/vị trí, giữ liền mạch khi chuyển màn, hoặc
  là khoảnh khắc đặc trưng. "Cho đẹp" chỉ hợp lệ với khoảnh khắc đặc trưng.
- Token (`tokens.css`):
  ```css
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);   /* vào, ra, hiện */
  --ease-in-out: cubic-bezier(0.76, 0, 0.24, 1); /* di chuyển khi đang hiển thị */
  --t-press: 120ms; --t-hover: 160ms; --t-ui: 220ms; --t-sheet: 320ms; --t-moment: 600ms;
  ```
  Thoát nhanh hơn vào (khoảng 70%). Không dùng `ease-in`, không bounce/elastic cho UI.
- Chỉ animate `transform`, `opacity` (và `clip-path` cho khoảnh khắc). Không `transition: all`.
- Không chuỗi xuất hiện lúc tải trang trong phòng; không fade-up cho mọi khối; không vòng lặp vô nghĩa (chấm nhấp nháy,
  shimmer chữ). Stagger chỉ cho danh sách xuất hiện lần đầu, tổng trễ ≤ 300ms.
- `prefers-reduced-motion: reduce` = bỏ di chuyển/scale, giữ đổi màu và opacity để vẫn thấy phản hồi.
- CSS trước. Chỉ thêm thư viện (`motion`) nếu cần kéo/thả có quán tính mà CSS không làm được, và ghi lý do vào PROGRESS.

## 9. Song ngữ (đọc với mọi task có chữ hiển thị)

- Thư viện: `i18next` + `react-i18next`, tài nguyên gói sẵn trong bundle, khởi tạo **đồng bộ** (test dùng
  `renderToStaticMarkup` trong môi trường node). Từ điển: `src/i18n/locales/vi.ts` (nguồn) và `en.ts` (cùng kiểu,
  TypeScript báo lỗi nếu thiếu khoá).
- **Không trộn ngôn ngữ:** ở chế độ EN không được lộ một chữ tiếng Việt nào do app tạo ra, và ngược lại.
  Được phép giữ nguyên: **dữ liệu người dùng và địa danh** (tên quán, địa chỉ, biệt danh, tên phòng, nhận xét).
  Tên thương hiệu "Đi Đâu" giữ nguyên ở cả hai ngôn ngữ.
- Chữ do backend sinh ra (lỗi, xung đột, lý do chọn hộ/lên lịch) **không hiển thị nguyên văn**: dịch theo `error.code`,
  `rule_code` + `params`, `reason_codes` (CR-06). Không có mã thì dùng câu chung theo ngôn ngữ, không fallback về câu
  tiếng Việt của server.
- Dữ liệu OSM: `cuisine` dịch theo bảng giá trị phổ biến, giá trị lạ thì **ẩn**; giờ mở cửa hiển thị từ
  `open_minute/close_minute` đã định dạng, không in `opening_hours_raw` ("Mo-Su 06:00-22:30").
- Tag đánh giá lưu ở DB là chuỗi tiếng Việt cố định (`REVIEW_TAGS`): coi chúng là **mã**, dịch nhãn theo bảng.
- Khoá đặt theo tính năng: `place.form.title`, `schedule.empty.body`, `common.action.save`. Không ghép chuỗi
  (`t('a') + name + t('b')`); dùng nội suy `t('place.deleteConfirm', { name })`.
- Số nhiều: `en` có `_one/_other`, `vi` chỉ `_other`. Định dạng qua helper `src/i18n/format.ts` dùng `Intl`:
  tiền `vi-VN` "45.000 ₫" / `en-US` "₫45,000"; giờ `vi-VN` "17:00" / `en-US` "5:00 PM"; khoảng cách "1,2 km" / "1.2 km";
  thời gian tương đối qua `Intl.RelativeTimeFormat`.
- Chọn ngôn ngữ: lần đầu theo `navigator.language` (`vi*` → vi, `en*` → en, còn lại → vi), lưu `localStorage`
  khoá `didau.lang`, cập nhật `<html lang>`. Đổi ngôn ngữ không tải lại trang, không đổi URL. Không có `navigator`/
  `localStorage` (test, SSR) → vi.
- Bản tiếng Anh dài hơn hoặc ngắn hơn tiếng Việt tuỳ câu: không đặt chiều rộng cố định cho chữ, kiểm tra cả hai ngôn
  ngữ ở 360px.
- **Lưới an toàn (T-39):** test `i18n_guard` quét `src/` (trừ `i18n/locales`, `mocks`, `__tests__`) tìm chữ có dấu
  tiếng Việt ngoài comment; file chưa chuyển nằm trong danh sách chờ, mỗi task màn hình xoá file của mình khỏi danh
  sách. Test `i18n_parity` so khoá `vi`/`en` và kiểm tra giá trị `en` không có dấu tiếng Việt.

## 10. Giọng văn

| | Tiếng Việt | English |
| :--- | :--- | :--- |
| Xưng hô | "bạn", "nhóm mình"; không "quý khách", không teencode | "you", "your group"; casual, not slangy |
| Nút | động từ + đối tượng: "Thêm quán", "Chốt quán" | "Add place", "Lock it in" |
| Thành công | ngắn, không chấm than: "Đã thêm vào lịch" | "Added to schedule" |
| Lỗi | việc gì hỏng + cách sửa: "Không lưu được. Kiểm tra mạng rồi thử lại." | "Couldn't save. Check your connection and try again." |
| Cấm | "Oops", "Tuyệt vời!", "nâng tầm", "liền mạch" | "Oops", "Awesome!", "seamless", "elevate", "unlock" |

## 11. Danh sách cấm (rút từ cả hai repo)

Emoji làm icon · chữ gradient / nền gradient · glass, blur trang trí · bóng xám dưới mọi thẻ · viền 1px + bóng cùng lúc ·
hàng 3 thẻ icon giống nhau · nhãn nhỏ VIẾT HOA tracking rộng trên tiêu đề (eyebrow) · pill "New/Beta" · đánh số 01/02/03
trang trí · monospace làm "chất kỹ thuật" · chữ trắng trên coral · placeholder làm nhãn · `alert()`/`confirm()` ·
modal cho việc làm tại chỗ · `h-screen` · `transition: all` · bounce/elastic · `z-[9999]` · chỉ icon không nhãn
trong điều hướng · câu tiếng Việt hardcode trong component.

## 12. Checklist trước khi chuyển task sang DONE (mọi task UI)

1. Chụp màn hình bằng Claude in Chrome ở **390×844** và **1280×800**, cả **VI và EN**, với `VITE_ENABLE_MOCK=true`
   (chạy `npm run dev`). Tự xem ảnh, sửa 3 lỗi rõ nhất, chụp lại. Ghi tên các màn đã chụp vào PROGRESS.
2. Bàn phím: Tab đi qua đủ điều khiển theo thứ tự hợp lý, vòng focus nhìn thấy được, `Esc` đóng sheet.
3. Tương phản theo bảng mục 2; vùng chạm ≥44px.
4. Đủ trạng thái mục 7 cho phần mình làm.
5. Không còn vi phạm mục 11 trong các file của task (`grep` emoji, `alert(`, `bg-slate`, `text-sky`...).
6. `npm run lint && npm test && npm run build` xanh; test `i18n_guard` xanh với danh sách chờ đã bớt file của task.
