---
name: Hangoutplanner
description: Phòng realtime để nhóm bạn đề xuất, bình chọn, chốt quán và xếp lịch chung, phá hoà phiếu công bằng.
colors:
  accent: "#FF6B4A"
  accent-hover: "#F25C3C"
  accent-soft: "#FFF1EC"
  accent-text: "#C73E26"
  bg: "#FAFAF9"
  surface: "#FFFFFF"
  surface-2: "#F5F5F4"
  line: "#E7E5E4"
  ink: "#1C1917"
  ink-2: "#57534E"
  ink-3: "#78716C"
  success: "#047857"
  success-soft: "#ECFDF5"
  warning: "#B45309"
  warning-soft: "#FFFBEB"
  danger: "#B91C1C"
  danger-soft: "#FEF2F2"
  info: "#0369A1"
  info-soft: "#F0F9FF"
  cat-food: "#C2410C"
  cat-drink: "#047857"
  cat-entertainment: "#7E22CE"
  cat-sightseeing: "#1D4ED8"
  cat-accommodation: "#BE123C"
  cat-shopping: "#0F766E"
  cat-other: "#57534E"
  brand-mark-bg: "#1C1917"
  brand-mark-dot: "#FF8566"
  stage-paper: "#FBF3E4"
  stage-paper-2: "#F3E3C7"
  stage-ink: "#2B1B12"
  stage-ink-2: "#6B4A36"
  stage-accent-text: "#B83A22"
  stage-sun: "#E9A400"
  stage-sky: "#1F6FA8"
  stage-leaf: "#3B7A3A"
  stage-brick: "#A8482A"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "clamp(40px, 6vw, 88px)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: "2.5rem"
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: "1.875rem"
  heading:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.625rem"
  body:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  label:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: "1.25rem"
  caption:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: "1.125rem"
rounded:
  field: "12px"
  card: "16px"
  full: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
    textColor: "{colors.ink}"
  button-primary-lg:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
    height: "52px"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.line}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
    height: "44px"
  chip-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "10px 14px"
    height: "44px"
  segmented:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.full}"
    padding: "4px"
  segmented-selected:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
---

# Design System: Hangoutplanner

## Overview

**Creative North Star: "Người sắp xếp kín tiếng"**

Hangoutplanner là người bạn trong nhóm lo hết việc sắp xếp nhưng không bao giờ nói nhiều. Trong phòng, giao diện lùi về
sau: nền xám ấm phẳng lặng, một họ chữ, bề mặt tách nhau bằng nấc màu thay vì đường kẻ hay bóng. Mỗi giai đoạn chỉ
đưa ra đúng việc cần làm lúc đó với **một** nút coral. Phần còn lại ("Vì sao?", chi tiết quán, lịch đầy đủ) nằm sau một
thao tác, sẵn đó khi người dùng hỏi tới, không bày sẵn ra màn hình.

Hệ chia làm hai vùng có chủ đích. **Operate** (mọi thứ lặp lại trong phòng: danh sách, bản đồ, lịch, form, sheet) phẳng,
yên, quen tay, dày vừa đủ để quét nhanh trên điện thoại 360px. **Stage** (trang chủ bản đồ 3D, quẹt phiếu, reveal chốt
quán, thẻ chuyến đi) là con phố nắng bên ngoài: giấy kem "Sài Gòn nắng", chữ display Bricolage Grotesque, một luồng ánh
sáng chiều và bóng dài một hướng. Người sắp xếp chỉ lên tiếng ở vài khoảnh khắc nhóm thật sự nhớ. Xong là trở lại yên lặng.

Cái vui đến từ coral, chữ to rõ, lời văn tự nhiên và vài khoảnh khắc có chủ đích. Nó không đến từ emoji, gradient hay
hiệu ứng rải khắp nơi. Bị loại rõ ràng: glass/blur trang trí, chữ gradient, eyebrow viết hoa giãn chữ, thẻ icon xếp hàng
ba, emoji làm icon, màu xám lạnh trộn với xám ấm.

**Key Characteristics:**
- Một màu nhấn duy nhất (Coral Nhóm Mình) và nó luôn mang nghĩa "lựa chọn của nhóm".
- Phẳng theo mặc định; độ sâu bằng nấc màu, bóng chỉ cho thứ thật sự nổi.
- Một họ chữ trong phòng (Be Vietnam Pro); font display chỉ ở Stage.
- Mobile-first, vùng chạm ≥ 44px, chữ tiếng Việt có dấu chồng luôn đủ khoảng dòng.
- Dark mode ấm ("không đen tuyệt đối"), cùng hệ chứ không phải palette thứ hai; bản đồ luôn sáng.

## Colors

Một họ xám ấm (stone) làm nền và mực, một coral làm điểm nhấn, bốn màu trạng thái chỉ khi mang nghĩa, bảy màu dữ liệu
cho loại quán. Nguồn sự thật là bộ ba RGB trong `frontend/src/styles/tokens.css` (`--color-*`), map qua
`tailwind.config.js`. Component chỉ gọi tên token, không viết hex hay class màu Tailwind gốc.

### Primary
- **Coral Nhóm Mình** (`accent`): nền nút chính, ghim "của nhóm" trên bản đồ, chip/vote đã chọn, quán đã chốt. Nhìn thấy
  coral tức là "nhóm mình". `accent-hover` cho hover/pressed. `accent-soft` làm nền chip/thẻ đang chọn.
- **Coral Mực** (`accent-text`): mọi chữ, link và viền focus màu coral trên nền sáng (5.1:1 trên trắng). Chữ không bao giờ
  dùng `accent` trực tiếp.

### Neutral
- **Giấy Đá** (`bg`): nền trang.
- **Trang Trắng** (`surface`): thẻ, sheet, thanh tab, ô nhập. Nổi lên khỏi `bg` đúng một nấc.
- **Đá Nhạt** (`surface-2`): vùng phụ, nút phụ, chip chưa chọn, rãnh segmented.
- **Vạch Đá** (`line`): viền ô nhập, ngăn cách hiếm hoi, thanh cuộn.
- **Mực Đá** (`ink`, 16.7:1): chữ chính, và cũng là chữ trên nút coral.
- **Mực Phụ** (`ink-2`, 7.3:1): chữ phụ, tiêu đề mục 15px đậm, nút ghost.
- **Mực Mờ** (`ink-3`, 4.8:1): chú thích ≥ 14px, placeholder, icon phụ.

### Trạng thái
- `success` / `-soft`: quán đã chốt, lưu xong, viền avatar đang kết nối.
- `warning` / `-soft`: xung đột mức WARNING, chồng/thiếu giờ (chỉ cảnh báo).
- `danger` / `-soft`: CRITICAL, xoá, lỗi nhập.
- `info` / `-soft`: gợi ý, trạng thái trung tính.

### Màu dữ liệu: 7 loại quán
`cat-food` · `cat-drink` · `cat-entertainment` · `cat-sightseeing` · `cat-accommodation` · `cat-shopping` · `cat-other`,
mỗi màu có cặp `-soft` trong `tokens.css`. Chỉ dùng cho icon loại quán, pin POI và chip lọc. Đo ≥ 3:1 cho icon trên cả
trắng lẫn soft.

### Stage (chỉ file thuộc vùng Stage)
- **Giấy Nắng** (`stage-paper`, `stage-paper-2`), **Mực Gỗ** (`stage-ink`, `stage-ink-2`), **Coral Gạch Nung**
  (`stage-accent-text`).
- Màu phố làm màu phụ, mỗi cảnh tối đa 1: **Hoa Sứ** (`stage-sun`, ở theme sáng chỉ làm mảng/ánh sáng, 1.95:1, không làm
  chữ), **Trời Trưa** (`stage-sky`, đường đi/nước), **Lá Me** (`stage-leaf`), **Gạch Bưu Điện** (`stage-brick`).

### Dark mode
Áp qua `:root[data-theme="dark"]` và khối `prefers-color-scheme: dark` guard bằng `:not([data-theme="light"])`. Hai
khối phải giống hệt nhau. Nền `#141210`, surface `#1F1D1A`, surface-2 `#292522`, line `#38332E`, ink `#F5F5F4`, ink-2
`#A8A29E`, ink-3 `#8C857F`, accent-soft `#3A1F18`, accent-text `#FF8566`. Coral `accent` giữ nguyên. Chữ trên nút coral
chuyển sang `#141210`. Stage chuyển sang "Sài Gòn chạng vạng" (`stage-paper` `#1A1420`). Ô logo "H." lên `#2E2824` để
nổi khỏi nền.

### Named Rules
**The Coral Means Us Rule.** Coral chỉ xuất hiện trên thứ thuộc về lựa chọn của nhóm hoặc hành động chính của bước. Nút
coral thứ hai trên cùng một màn, hay coral để trang trí, là sai.

**The No White On Coral Rule.** Chữ trắng trên coral chỉ đạt 2.8:1 và bị cấm. Nút chính luôn là nền `accent` + chữ `ink`
đậm 600.

**The Always-Light Map Rule.** Bản đồ và lớp quán (`PoiLayer.ts`) luôn dùng bảng màu sáng, kể cả khi app ở theme tối.

## Typography

**Body Font:** Be Vietnam Pro (fallback: system-ui, -apple-system, Segoe UI, Roboto), weight 400/500/600/700, subset
`latin` + `vietnamese`.
**Display Font:** Bricolage Grotesque 700/800, chỉ ở Stage và trong logo chữ, nạp trong chunk Stage.

**Character:** Be Vietnam Pro được vẽ cho tiếng Việt: thẳng, rõ, thân thiện mà không trẻ con. Bricolage là grotesk ấm,
hơi lém, chỉ dành cho vài tiêu đề lớn ở Stage.

### Hierarchy
- **Display** (800, `clamp(40px, 6vw, 88px)`, 1.2): khẩu hiệu hero "Đi đâu? Rồi đi đâu nữa?". Chỉ ở Stage.
- **Headline** (700, 32/40, −0.02em; desktop 44/52): tiêu đề trang chủ phần Operate.
- **Title** (700, 22/30): tiêu đề màn/sheet. Tiêu đề giai đoạn ① trong phòng là 26px.
- **Heading** (600, 18/26): tiêu đề nhóm. Tên quán trong thẻ là 16px, ở trang chi tiết là 24px.
- **Body** (400, 16/24): chữ thường và ô nhập (16px để iOS không tự zoom). Đoạn văn tối đa ~65 ký tự mỗi dòng.
- **Label** (500, 14/20): nhãn, nút md, chip, meta.
- **Caption** (400, 13/18): thông tin phụ không cần đọc kỹ. Không có cỡ nào nhỏ hơn.

### Named Rules
**The Stacked Diacritics Rule.** Dấu chồng (Ể, Ỗ, Ậ) cao gần gấp đôi dấu thường. Line-height tiêu đề ≥ 1.25 (Stage ≥ 1.2
ở cỡ ≥ 48px), chữ thường ≥ 1.5. Không `leading-none`.

**The No Eyebrow Rule.** Không có nhãn nhỏ VIẾT HOA giãn chữ trên tiêu đề. Tiêu đề mục dùng 15px đậm `ink-2`. Ngoại lệ
duy nhất là dòng `PLANNER` trong logo chữ.

**The Sentence Case Rule.** Viết hoa kiểu câu ở cả hai ngôn ngữ ("Thêm quán", "Add a place"). Mã phòng dùng
`tabular-nums` + `letter-spacing: 0.08em`, không monospace. Mọi số đứng cạnh nhau dùng class `.num`.

## Layout

- **Lưới 4px:** 4 · 8 · 12 · 16 · 24 · 32 · 48. Lề điện thoại 16px. Khoảng đệm cột trong phòng 20–24px. Khoảng giữa thẻ
  12px. Khoảng trong nhóm nhỏ hơn giữa các nhóm, và phía trên tiêu đề nhiều hơn phía dưới.
- **Mobile-first:** viết cho 360–430px trước, rồi `md` ≥ 768, `lg` ≥ 1024, `xl` ≥ 1280. Dùng `min-h-dvh`, không `h-screen`.
- **Phòng ≥ 1280px:** 3 cột cao `100dvh`, trang không cuộn, mỗi cột tự cuộn. Trái 400px (giai đoạn ① 560px), giữa là bản
  đồ tràn khung kèm panel chi tiết quán 500px nổi bên phải, phải là Kế hoạch 72px thu gọn / 440px mở. Không có
  `max-w-*`: khoảng dư thuộc về bản đồ.
- **Phòng 1024–1279px:** cột trái 360px. Kế hoạch là ngăn kéo đè lên bản đồ. Panel chi tiết 440px.
- **Phòng < 1024px:** 2 tab có nhãn chữ là **Khám phá** (bản đồ toàn màn + sheet danh sách 3 nấc: 96px · nửa màn · gần đầy)
  và **Kế hoạch**. Chi tiết quán là sheet toàn màn. Hành động chính luôn trong tầm ngón cái.
- **Lịch:** 1 giờ = 64px (`--cal-hour`, 15′ = 16px). Vùng ngoài khung giờ của phòng tô sọc chéo nhạt.
- **z-index theo thang:** map 0 · content 10 · tabbar 30 · sheet 40 · toast 50. Không `z-[9999]`.

## Elevation & Depth

Phẳng theo mặc định. Độ sâu đến từ nấc màu (`bg` → `surface` → `surface-2`), không từ bóng. Một thứ chỉ có viền **hoặc**
bóng, không bao giờ cả hai. Ở theme tối, bóng nổi tự mang thêm viền sáng mờ 1px để tách khỏi nền tối.

### Shadow Vocabulary
- **Nổi** (`--shadow-float`, Tailwind `shadow-float`): sheet, dialog, toast, menu, panel chi tiết nổi trên bản đồ, thẻ
  `floating`. Đây là bóng duy nhất của vùng Operate.
- **Bóng nắng dài** (`--stage-shadow-long`): chỉ ở Stage. Một hướng cố định, nắng từ tây nam đổ về đông bắc. Ánh sáng bản
  đồ hero dùng cùng hướng.
- **Nền mờ sau sheet** (`--scrim`): màu tối đặc 40% (tối: 60%), không blur.

### Named Rules
**The Flat-By-Default Rule.** Bề mặt đứng yên thì phẳng. Bóng chỉ dành cho thứ đang thật sự nằm trên thứ khác.

**The Stage-Only Light Rule.** Gradient (`--stage-sunlight`) và `backdrop-filter` (≤ 12px, sau chữ đè lên bản đồ hero) chỉ
có ở Stage. Operate không có gradient, glow hay glass.

## Shapes

Một quy tắc bo góc duy nhất: **điều khiển nhỏ bo tròn hẳn** (nút, chip, tab, segmented: 9999px), **thẻ và sheet bo 16px**
(sheet mobile chỉ bo hai góc trên), **ô nhập bo 12px**. Ô logo "H." bo 28% cạnh. Viền 1px màu `line` chỉ dùng cho ô
nhập, thẻ đứng yên và rãnh segmented. Ghim coral trên nền sáng ở Stage phải có viền `stage-ink` để đạt 3:1.

## Components

Phẳng, mềm, dễ bấm. Mọi điều khiển cao tối thiểu 44px. Phản hồi nhấn là thu nhỏ 0.97 (`.pressable`, `--t-press` 120ms,
`--ease-out`). Hover chỉ hiện sau `@media (hover: hover)`. Focus là viền 2px `accent-text`, cách 2px. Disabled là opacity 50%.

### Buttons
- **Shape:** viên thuốc tròn hẳn (9999px). Cỡ `md` cao 44px, padding 10/20, chữ label. Cỡ `lg` cao 52px, padding 12/24,
  chữ body.
- **Primary:** nền Coral Nhóm Mình, chữ Mực Đá đậm 600. Mỗi bước/màn chỉ có một nút primary. Nhãn là động từ + đối tượng,
  1–3 từ, không xuống dòng.
- **Hover / Focus:** hover sang `accent-hover`. Nhấn thu 0.97. Đang tải có spinner nhỏ trong nút, kèm `aria-busy`.
- **Secondary:** nền `surface-2`, viền `line`, chữ `ink` đậm 600, hover sang `line`.
- **Ghost:** trong suốt, chữ `ink-2`, hover có nền `surface-2` và chữ `ink`.
- **Danger:** nền `danger-soft`, chữ `danger`, viền danger 20%.
- **IconButton:** 44×44, bắt buộc `aria-label` qua i18n.

### Chips
- **Style:** viên thuốc, cao 44px, padding 6/14, nền `surface-2`, chữ `ink-2` 500. Trên điện thoại cuộn ngang, không xuống dòng.
- **State:** được chọn thì nền `accent-soft`, chữ `accent-text`, viền accent 20%, chữ đậm 600. Chip loại quán khi chọn dùng
  cặp `cat-<x>-soft` + chữ `cat-<x>` + vòng 1px `cat-<x>`. Có nút xoá (×) thì nút đó dùng nhãn i18n.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** `surface` trên `bg`.
- **Shadow Strategy:** không bóng khi đứng yên, `shadow-float` khi `floating` (xem Elevation).
- **Border:** 1px `line`. Thẻ bấm được thì hover sang viền accent 40% và nhấn sang nền `surface-2`.
- **Internal Padding:** 16px. Không lồng thẻ trong thẻ.

### Inputs / Fields
- **Style:** nền `surface`, viền 1px `line`, bo 12px, padding 10/14, chữ body 16px, cao ≥ 44px. Nhãn 14px nằm **phía trên**,
  không dùng placeholder làm nhãn.
- **Focus:** viền và vòng 1px chuyển sang `accent-text`.
- **Error / Disabled:** lỗi thì viền `danger`, dòng lỗi caption `danger` kèm icon cảnh báo đặc 14px và `aria-describedby`.
  Gợi ý là caption `ink-3`. Disabled có nền `surface-2` và opacity 50%.

### Navigation
- **Thanh đỉnh phòng:** nút về · tên phòng + "Bước x/4 · tên bước" · nút "N" người xem · avatar (viền `success` khi đang
  kết nối). Logo ở chỗ hẹp dùng `<Wordmark variant="mark" />`.
- **Tab mobile:** Khám phá · Kế hoạch. Luôn có icon + nhãn chữ, không bao giờ chỉ icon. Tab đang mở ghi vào URL (`?tab=`).
- **Segmented:** rãnh `surface-2` có viền `line`, padding 4. Mục được chọn có nền `surface`, chữ `ink` đậm và bóng nhỏ.
  Mục còn lại chữ `ink-2`.

### Sheet / Dialog
Trên điện thoại là bottom sheet bo hai góc trên 16px, cao tối đa 90dvh. Từ `md` là dialog giữa màn, tối đa 32rem. Nền
`surface` + `shadow-float` trên `--scrim`. `Esc` đóng sheet, focus nằm trong sheet và trả về chỗ cũ khi đóng. Không dùng
`alert()`/`confirm()`: xác nhận đi qua `ConfirmSheet` có nêu rõ đối tượng ("Xoá *Phở Hoà* khỏi danh sách?").

### Wordmark (signature)
`<Wordmark />` (`components/shell/Wordmark.tsx`) là cách duy nhất để hiện tên. Bản `full` gồm "Hangout" (Bricolage 800,
−0.025em) đặt trên "PLANNER" (Be Vietnam Pro 700, cỡ bằng 1/3 dòng trên, giãn 0.42em, `accent-text`). Bản `mark` là ô bo 28% nền `brand-mark-bg`, chữ "H" kèm chấm
`brand-mark-dot`. Không tự gõ tên thương hiệu thành chữ thường.

### Icons
Một bộ duy nhất là `@phosphor-icons/react`: kiểu `regular` mặc định, `fill` cho trạng thái chọn, cỡ 20 (24 cho tab). Không
emoji, không ký tự unicode làm icon.

## Do's and Don'ts

### Do:
- **Do** đưa mọi màu qua token (`bg-surface`, `text-ink-2`, `rgb(var(--color-…))`) và khai báo màu tối ở **cả hai** khối dark
  trong `tokens.css`.
- **Do** giữ đúng một nút coral mỗi bước. Mọi hành động khác là nút phụ, ghost hoặc liên kết.
- **Do** đặt thông tin phụ sau một thao tác ("Vì sao?", chi tiết quán) thay vì trải sẵn ra màn hình.
- **Do** đặt cảnh báo ngay trên thứ nó liên quan (mục lịch bị trùng, quán vượt giờ), không dùng banner ghim toàn trang.
- **Do** kiểm mọi màn ở 360px bằng cả tiếng Việt lẫn tiếng Anh. Không đặt chiều rộng cố định cho chữ.
- **Do** cho mỗi trạng thái đủ chữ + icon, không chỉ màu. Loading là skeleton đúng hình nội dung.
- **Do** dùng motion token (`--t-press` 120 · `--t-hover` 160 · `--t-ui` 220 · `--t-sheet` 320 · `--t-moment` 600,
  `--ease-out`). Khi `prefers-reduced-motion` thì bỏ di chuyển/scale, giữ đổi màu và opacity.

### Don't:
- **Don't** để chữ trắng trên coral, và đừng dùng coral cho thứ không phải lựa chọn của nhóm hay hành động chính.
- **Don't** dùng gradient, glow, glass hay blur trang trí ở Operate. Đừng dùng chữ gradient ở bất kỳ đâu.
- **Don't** để một thứ có cả viền 1px lẫn bóng. Đừng đặt bóng xám dưới mọi thẻ.
- **Don't** dùng eyebrow VIẾT HOA giãn chữ, đánh số 01/02/03 trang trí, pill "New/Beta" hay hàng 3 thẻ icon giống hệt nhau.
- **Don't** dùng emoji làm icon, monospace làm "chất kỹ thuật", hay điều hướng chỉ có icon.
- **Don't** dùng `h-screen`, `transition: all`, bounce/elastic, hiệu ứng lặp vô hạn (shimmer, pulse, xoay mãi) hay `z-[9999]`.
- **Don't** dùng modal cho việc làm được ngay tại chỗ (vote, lọc, đổi tab), hay `alert()`/`confirm()`.
- **Don't** để file Operate import `gsap`, `motion/*`, `sound/*` hoặc `stage/*`. Hiệu ứng Stage ở lại trong Stage.
- **Don't** đổi bản đồ sang bảng màu tối theo theme app.
