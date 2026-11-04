# LUẬT THIẾT KẾ "LỊCH CHUNG & ALGORITHM ENGINE" (giai đoạn 6)

Ghi đè `docs/phase5/DESIGN.md` §8 (Kế hoạch), §9 (Tạo phòng) và §4 (thanh đỉnh — thêm chip khung giờ). Mọi thứ khác giữ
gđ5 + gđ3. Màu/chữ/icon dùng token và component có sẵn; số px dưới đây là mặc định, chỉnh được nếu ảnh chụp cho thấy
lệch, nhưng ghi lại lý do ở PROGRESS.

## 1. Tạo phòng (thay gđ5 §9)
Thứ tự một màn: avatar + "Đổi nhân vật" + biệt danh · tên buổi · chip Hôm nay/Ngày mai/Chọn ngày + khung giờ ·
**chip thành phố** (TP.HCM · Hà Nội, mặc định TP.HCM) · "Tuỳ chỉnh thêm" (hoà phiếu + ghi chú).
- Không còn khối điểm hẹn, không còn khối ngân sách. Payload không gửi `origin_lat/lng`, `budget_limit`.
- Ẩn ngân sách bằng hằng `SHOW_BUDGET_IN_CREATE = false` trong `room/createRoom.ts` (bật lại = đổi một dòng);
  `BudgetChips`/`budgetLimitFor` giữ. `OriginPicker` không còn nơi gọi thì xoá (cùng khoá i18n chỉ nó dùng).

## 2. Chip khung giờ (thanh đỉnh)
- Nội dung: icon đồng hồ + khoảng giờ. VI `18:00 – 22:00`; EN gọn `6 – 10 PM` khi cùng buổi, `11 AM – 2 PM` khi khác,
  giữ phút khi lẻ (`6:30 – 10 PM`). Hàm mới `formatTimeWindow(start, end, lang)` trong `i18n/format.ts`.
- Desktop (≥768): ngay sau nút mã phòng, `text-caption`, nền `surface-2`, không phải nút (không hover). `title`/`aria-label`
  đầy đủ: "Khung giờ rảnh của nhóm: 18:00 – 22:00, Thứ Bảy 08/11".
- Mobile: nối vào dòng compact dưới thanh đỉnh: "Bước 3/4 · Chốt kèo · 18:00 – 22:00"; tên phòng không bị cắt thêm.
- Đổi khi `ROOM_UPDATED` đổi giờ.

## 3. Lịch (cột Kế hoạch, thay gđ5 §8 phần timeline)
### Lưới
- Trục: từ `room.start_minute` tới `room.end_minute`, mở rộng tới mục sớm/muộn nhất nếu có mục ngoài khung (làm tròn
  xuống/lên giờ chẵn); vùng ngoài khung tô sọc chéo nhạt + nhãn nhỏ "Ngoài khung giờ".
- Biến `--cal-hour: 64px` (15 phút = 16px). Gutter nhãn giờ 48px bên trái, nhãn ở **đầu** mỗi giờ (`18:00` / `6 PM`),
  `text-caption ink-3`, căn số `tabular-nums`.
- Đường kẻ: mỗi giờ `line` liền 1px; mỗi 30 phút `line` 50% nét đứt; 15 phút không kẻ (snap vẫn 15).
- Đầu cột (dính): "Lịch tối nay · 18:00 – 22:00" + `BudgetMeter` (nhánh không limit chỉ hiện tổng) + chip xung đột
  tổng nếu có. Chân cột dính đáy (§6).
- Nếu ngày phòng là hôm nay: vạch "bây giờ" đỏ 2px + chấm (như Google Calendar), cập nhật mỗi phút (`setInterval` 60 s,
  dừng khi tab ẩn).
- Lịch trống: lưới vẫn vẽ đủ; giữa lưới chữ mờ "Kéo quán đã chốt từ bên trái thả vào đây" (desktop) / "Nhấn giữ một quán
  ở khay trên rồi kéo xuống" (mobile) + nút phụ "Xếp lịch tự động".

### Ô quán (`CalendarEvent`)
- Vị trí: `top = (start − gridStart) × 16/15 px`, `height = duration × 16/15 − 2px` (khe 2px giữa ô liền nhau).
- Nền `accent-soft`, viền trái 3px màu danh mục (`cat-*`), bo `radius-field`, chữ `ink`.
- Nội dung theo chiều cao: ≥48px → tên (14 semibold, 1 dòng cắt) + giờ "18:00 – 19:00" (caption) + (≥80px) dòng đầu
  ghi chú; 24–47px → một dòng "Tên · 18:00"; <24px (15 phút) → chỉ tên cỡ caption.
- Xung đột: viền ngoài `danger` 1px + icon cảnh báo góc phải; câu mô tả nằm trong popup.
- Chồng giờ: xếp cột cạnh nhau như Google Calendar (cụm chồng nhau chia đều bề ngang, ô bắt đầu sớm hơn bên trái),
  tối đa 3 cột, cụm >3 thì cột thứ 3 là "+N" mở danh sách.
- Mục ngày khác (`day_offset > 0`): không vẽ; dòng "Ngày khác: N mục" dưới lưới.

### Tương tác
| Thao tác | Desktop | Cảm ứng |
| :--- | :--- | :--- |
| Mở popup | bấm (di < 4px) | chạm |
| Di ô | kéo thân ô quá 4px | nhấn giữ 350 ms → nhấc (bóng đổ + rung nhẹ) → kéo |
| Đổi thời lượng | kéo mép dưới (vùng 8px, con trỏ `ns-resize`, hiện tay nắm khi hover) | sau khi nhấc, tay nắm 24px ở đáy ô |
| Huỷ kéo | `Esc` hoặc thả ra ngoài lưới → về chỗ cũ | thả ra ngoài lưới |
| Bàn phím | Tab qua các ô theo giờ; Enter/Space mở popup; ↑/↓ dời 15'; Shift+↑/↓ đổi giờ kết thúc 15'; lưu sau 600 ms không bấm; vùng `aria-live` đọc "18:15 – 19:15" | – |

- Snap 15 phút theo **vị trí con trỏ trừ độ lệch chỗ cầm**, không theo mép ô.
- Thời lượng tối thiểu 15'. Di/kéo dãn bị kẹp trong lưới hiện tại (không tự mở rộng lưới khi kéo).
- Trong lúc kéo: ô hiện giờ mới ngay trên ô ("18:15 – 19:15"); ô gốc mờ 40% tại chỗ cũ; cuộn tự động khi cách mép cột
  < 48px.
- Thả: vẽ ngay (lạc quan), gửi `PUT` chỉ các mục đổi (giờ hoặc `order_index`), luôn kèm `note`; lỗi → về chỗ cũ +
  toast "Không lưu được, đã hoàn tác". Sau `PUT` gọi đánh giá xung đột như hiện tại.
- Người khác đang sửa: `SCHEDULE_UPDATED` đến khi mình đang kéo ô X → áp cho các ô khác, ô X giữ bản nháp tới khi thả.

### Kéo từ cột trái (T-80)
- Nguồn kéo: thẻ quán chính, đi kèm trong `LockedPlaces` và danh sách **Dự bị** (mới: mục gập "Dự bị (N)" thay cho
  liên kết; liên kết "Xem lại bình chọn" vẫn giữ). Thẻ có tay nắm ⠿ + `cursor: grab`; thẻ đã có trên lịch có nhãn
  "18:00" và kéo lại = **dời mục cũ** (một quán một mục, không nhân bản).
- Bóng kéo: chip gọn (ảnh nhỏ + tên), portal ra `body`, theo con trỏ. Khi vào lưới: hiện ô xem trước 60 phút đã snap +
  giờ; ra ngoài lưới: ô xem trước biến mất, thả = huỷ.
- Thả gần cuối khung: lùi giờ bắt đầu để kết thúc đúng cuối khung; khung < 60' thì ô lấp cả khung.
- 1024–1279 (Kế hoạch là ngăn kéo): bắt đầu kéo → ngăn kéo tự mở; huỷ kéo → đóng lại nếu trước đó đóng.
- Mobile: tab Kế hoạch có **khay "Chưa xếp lịch"** (cuộn ngang, thẻ chip) dính trên lưới; nhấn giữ chip → kéo xuống lưới.
  Thay thế không kéo: bấm chip → "Thêm vào giờ trống đầu tiên".
- Bàn phím / không kéo được: menu ⋯ trên thẻ cột trái có "Thêm vào lịch" → giờ trống đầu tiên ≥60' (không có thì sau mục
  cuối, kẹp trong khung), rồi mở popup của mục mới.

## 4. Popup ô quán (`CalendarItemPopover`)
### Chế độ xem
- Desktop ≥1024: popover rộng 360px, neo **bên trái** ô (cột lịch ở mép phải màn), mũi tên chỉ vào ô; không đủ chỗ thì
  lật/dịch để nằm trong viewport; cao tối đa 70vh, tự cuộn. <1024: `Sheet` từ đáy.
- Hàng đầu: icon ✎ Sửa · 🗑 Bỏ khỏi lịch · ✕ Đóng (`IconButton`, 44px vùng chạm).
- Thứ tự nội dung: ảnh (tuyển chọn → minh hoạ danh mục, tỉ lệ 16:9) · tên (heading) + danh mục + mức giá · giờ
  "18:00 – 19:00 · 1 giờ" · người đề xuất (avatar + tên) · ♥ số người muốn đi · giới thiệu (tuyển chọn, 3 dòng, "Xem
  thêm") · địa chỉ + "Chỉ đường" · ghi chú (nếu có, nền `surface-2`) · chip xung đột (câu đầy đủ) · liên kết "Xem chi
  tiết quán" (mở `PlaceDetail` như từ danh sách).
- Đóng: ✕, `Esc`, bấm ra ngoài; focus trả về ô. Mở popup ô khác thì thay nội dung, không chồng 2 popup.
- Bỏ khỏi lịch: xoá ngay + toast "Đã bỏ … · Hoàn tác" 5 s (hoàn tác = `POST` lại với giờ + ghi chú cũ).

### Chế độ sửa (thay nội dung cùng chỗ, không mở popup thứ hai)
- Tiêu đề "Sửa · Tên quán" + nút ← quay lại xem.
- Hai ô giờ "Bắt đầu" / "Kết thúc" — `<input type="time">` bước 1 phút (tự nhập không bị ép 15'), kèm chip thời lượng
  nhanh 30' · 1 giờ · 1,5 giờ · 2 giờ (đổi giờ kết thúc).
- Ghi chú: `textarea` 3 dòng, tối đa 500 ký tự, đếm ký tự khi > 400.
- Kiểm hợp lệ tại chỗ (không đỏ cả form): kết thúc ≤ bắt đầu → chặn Lưu, câu dưới ô; ngoài khung giờ của nhóm → cho lưu,
  câu nhắc vàng "Ngoài khung giờ 18:00 – 22:00"; trùng giờ mục khác → cho lưu, câu nhắc.
- Nút: **Lưu** (chính) · Huỷ. `Enter` trong ô giờ = Lưu, `Esc` = Huỷ (về chế độ xem). Lưu xong về chế độ xem với dữ
  liệu mới. Đang lưu: nút Lưu xoay, các ô khoá.

## 5. Thẻ chuyến đi (Stage, `stage/card/`)
- Kích thước xuất 1080×1350 (4:5, hợp Zalo/Messenger/Instagram), dựng ở 540×675 CSS px, `pixelRatio: 2`.
- Palette Stage: "Sài Gòn nắng" (sáng) mặc định; nút đổi "Chạng vạng" (tối) trong modal. Font tiêu đề display gđ4 §3.
- Nội dung trên → dưới: tên buổi (display, ≤2 dòng) · thứ + ngày + khung giờ · danh sách điểm theo giờ (giờ bắt đầu
  đậm · tên · danh mục icon · địa chỉ ngắn 1 dòng), tối đa 6, thừa "+N điểm nữa" · (nếu ≥2 điểm có toạ độ) phác thảo
  tuyến SVG nối các điểm, không tile bản đồ · hàng avatar thành viên (≤8 + "+N") + tên (≤6) · chân: "Đi Đâu · mã
  phòng ABC123".
- Không có ảnh Google; ảnh tuyển chọn cùng origin được dùng cho điểm đầu (nếu có).
- Giữa hai điểm (khi có số liệu ALGO-03, sau T-90): dòng nhỏ "🛵 ~12' · 3,2 km"; chân thẻ "Còn dư 65' dự phòng" nếu khả thi.
- Modal **"Xuất kế hoạch"** có 2 tab: **Ảnh** · **Văn bản**.
  - Ảnh: xem trước thẻ (co theo màn) · **Tải ảnh** (chính, `hookupfpt-<code>.png`) · Chia sẻ (chỉ hiện khi
    `navigator.canShare({ files })`) · Sao chép ảnh (khi có `ClipboardItem`). Đang dựng: skeleton, không nhảy bố cục.
  - Văn bản (theo OUTPUT §4B, tiếng theo ngôn ngữ đang chọn), xem trước trong khung `pre` + **Sao chép**:
    ```
    🎉 KẾ HOẠCH ĐI CHƠI: <tên buổi>
    📅 Thứ Bảy (07/11/2026) | Khung giờ: 18:00 – 22:30
    📍 18:35 – 20:00: <quán> (<địa chỉ ngắn>)
    🛵 Di chuyển: ~20 phút (3,2 km)
    📍 20:20 – 22:00: <quán> (<địa chỉ ngắn>)
    👥 <tên 1>, <tên 2>, … (+N)
    💡 Lịch hợp lý, còn dư 65 phút dự phòng.        ← hoặc "⚠️ Đoạn A → B thiếu 8 phút"
    👉 <link phòng>
    ```
    Dòng 🛵 và 💡 chỉ có khi có số liệu ALGO-03; ghi "(ước lượng)" khi nguồn là ước lượng.
  - Hàng dưới chung: Thêm vào lịch (`.ics`, mô tả mỗi sự kiện có chặng di chuyển tới điểm sau) · Gửi link phòng.
- Lịch trống → nút mở modal khoá + câu "Xếp ít nhất một quán vào lịch".

## 6. Chân cột Kế hoạch (thay gđ5 §8 phần nút)
- Bước ④ (`send`): **Xuất kế hoạch** (nút chính, mở modal §5) · hàng phụ: Gửi link cho nhóm · Thêm vào lịch (.ics) · Xếp
  lại tự động. (Câu hỏi mở G1 #1 vẫn có thể đổi nút chính.)
- Bước ③ (`lock`, lịch trống): nút chính "Xếp lịch tự động"; gợi ý kéo thả ở giữa lưới.

## 7. Quả địa cầu tải bản đồ (Stage, `stage/hero/HeroGlobe.tsx`)
- Hiện khi: chunk `HeroScroll` đang tải (trong fallback của `Hero`) **hoặc** `mapState === 'loading'`; chỉ sau 300 ms
  (tải nhanh thì không nháy). Ẩn: `ready` (mờ dần cùng lúc bản đồ hiện, `--t-shot`), `failed` (ẩn ngay, poster ở lại).
  Mức `static`: không có (không tải bản đồ).
- Vị trí giữa màn (phía trên khối chữ hero trên mobile, không che CTA), đường kính 112px (mobile 88px), dưới là dòng
  `role="status"` "Đang dựng bản đồ 3D…" / "Building the 3D map…".
- Cách vẽ: hình tròn `overflow:hidden` chứa dải lục địa SVG (equirectangular, đơn giản hoá, ≤3 kB gzip) lặp 2 lần, trượt
  ngang vô tận bằng CSS `transform` (một vòng 8 s, `linear`); phủ gradient tròn tạo khối cầu + vệt sáng; viền mảnh
  `--stage-ink` 12%. Màu biển/đất từ token `--stage-*`. Có thể đặt một chấm cam ở vị trí TP.HCM.
- `prefers-reduced-motion` / mức `lite`: vòng 20 s; không có thêm hiệu ứng nào khác.
- Kiểm vì sao poster trông "mờ mờ đứng yên" (lớp phủ/độ mờ nào); nếu là lớp phủ có chủ đích thì giữ, địa cầu đặt trên.

## 8. Giao diện thuật toán (mạch B; công thức ở `ALGORITHMS.md`)
### Nguyên tắc chung (tài liệu đồ án §1.3: hỗ trợ, giải thích được, không làm gián đoạn)
- Không tự mở modal/popup vì thuật toán. Đề xuất hiện tại chỗ, thu gọn được; host là người bấm chốt.
- Cảnh báo dùng nền **pastel** (`warning-soft` vàng nhạt; mức `HIGH_RISK` thêm viền `warning` và icon), **không đỏ**, luôn
  có chữ + icon (WCAG 1.4.1), có nút "Bỏ qua".
- Mọi số do thuật toán tính có liên kết **"Vì sao?"** (`WhyPanel`: popover ≥1024 / Sheet <1024) theo ALGORITHMS §7.
- Kết quả từ ước lượng ghi "ước lượng · xe máy"; từ Google ghi "Google Maps".

### "Xuất phát từ đâu?" (vị trí thành viên, CR-11)
- Hàng trong menu avatar (dưới "Thông tin chuyến"): "Xuất phát từ: Chưa chia sẻ / Gần Bình Thạnh ✓". Bấm → Sheet nhỏ:
  Vị trí hiện tại · Tìm địa điểm (`MapSearchBox`) · Xoá vị trí; câu riêng tư: "Nhóm chỉ thấy khu vực trung tâm, không
  thấy vị trí của bạn".
- Danh sách thành viên: chấm nhỏ "đã chia sẻ" cạnh avatar (không hiện nơi).
- Nhắc nhẹ **một lần** (nhớ theo người xem) khi giai đoạn `tie` bắt đầu mà mình chưa chia sẻ: dòng trong thẻ hoà phiếu
  "Thêm nơi xuất phát để tính quán thuận đường cho bạn" + nút; không toast, không modal.

### Widget tâm nhóm (ALGO-01)
- Góc trái dưới bản đồ (tránh nút zoom phải), thu gọn: chip "📍 Trung tâm nhóm: Q3 – Phú Nhuận · 3 người". Ẩn khi <2 vị
  trí. Bấm → mở rộng thành thẻ 320px: câu tóm tắt, "Xem quán gần đây" (bay tới tâm + vòng tròn bán kính mờ + dải quán gần
  tâm), "Vì sao?", thu lại. Mobile: chip trên đỉnh tab Khám phá, mở rộng thành Sheet.
- Dải gợi ý gđ5 "Gần điểm hẹn" đổi thành **"Gần cả nhóm"** khi có tâm (≥2 vị trí), không thì giữ như cũ.
- Không vẽ vị trí từng người trên bản đồ.

### Thẻ hoà phiếu (ALGO-02, thay nội dung `TieBlock`)
- Tiêu đề "3 quán đang hoà 7 phiếu". Dòng đề xuất: ảnh nhỏ + **"Đề xuất: Vạn Hạnh Mall"** + "Cả nhóm đi tổng 57' · người
  xa nhất 25' · ít hơn hạng 2 là 3'". Hàng các quán hoà còn lại (tên + tổng/lâu nhất, chữ nhỏ).
- Host: **Chốt Vạn Hạnh Mall** (nút chính) · "Cách khác" (mở `DecideModal` bước chọn kiểu: Vòng quay/Swipe/Thang/SMART) ·
  "Vì sao?". Thành viên: thấy đề xuất + "Đang chờ chủ phòng chốt" + "Vì sao?".
- Thiếu dữ liệu (`NO_ORIGINS`): "Chưa ai chia sẻ nơi xuất phát và phòng chưa có điểm hẹn" + nút chia sẻ (mình) / đặt điểm
  hẹn (host) + "Cách khác".
- "Vì sao?" = bảng thành viên × quán (ALGORITHMS §7), cột đề xuất tô `accent-soft`, hàng Tổng/Lâu nhất đậm; <1024 bảng
  cuộn ngang trong Sheet, cột tên dính.

### Danh sách bình chọn (ALGO-04)
- Mặc định "Ưu tiên" (thứ tự server); menu ⋯ "Sắp xếp: Ưu tiên · Theo phiếu · Mới thêm".
- Nhãn trên `PlaceRow` (một nhãn chính, thay chỗ nhãn gđ5 nếu trùng; "Đã chốt" vẫn thắng): **Đề xuất** (`accent`) · Nhiều
  phiếu nhất · Kịp giờ · **Nhiều phiếu nhưng khó kịp** (pastel cảnh báo). Bấm nhãn → "Vì sao?" của quán đó.
- Dòng meta thêm "người xa nhất ~25'" khi có `max_eta`.

### Dải di chuyển trên lịch (ALGO-03)
- Giữa hai ô liên tiếp có khe ≥0: dải cao đúng thời lượng di chuyển ước tính (tối thiểu 16px), nền sọc nhạt, chữ caption
  "🛵 12' · 3,2 km". Khe < cần thiết: dải đổi nền pastel vàng, chữ "Thiếu 8'" + icon, bấm → "Vì sao?" + gợi ý (dời ô sau
  xuống, chọn quán gần hơn, rút ngắn) + "Bỏ qua" (nhớ theo người xem, hiện lại khi số liệu đổi).
- Khi kéo: dải tính lại tức thì bằng `room/travel.ts` (ước lượng), thả xong thay bằng số backend.
- Đầu cột: dòng tổng "Còn dư 65' dự phòng" hoặc "Thiếu thời gian ở 1 đoạn" (pastel).

## 9. Tên hiển thị HookupFPT
- `app.name` = "HookupFPT" cả VI/EN; `<title>`, meta, logo chữ trang chủ/thanh đỉnh, chân trang, thẻ chuyến đi, văn bản
  emoji, `.ics` (`PRODID:-//HookupFPT//VN`, UID `@hookupfpt`), tên file tải. Khẩu hiệu gđ4 giữ nếu không chứa tên cũ.
- Tên package/repo, khoá localStorage, tên biến giữ nguyên (đổi khoá localStorage làm mất phiên người dùng).

## 10. Checklist trước DONE (cộng gđ5 §12 và gđ3 §12)
- [ ] Kéo/di/kéo dãn lệch đúng bội 15', không lệch theo độ cuộn của cột, không lệch khi cột đổi rộng.
- [ ] Ghi chú còn nguyên sau khi kéo một mục khác (test `toBulkPayload` + kiểm tay qua MSW).
- [ ] 375px không cuộn ngang; popup không tràn viewport ở 1024/1280/1440.
- [ ] `Esc` huỷ kéo, đóng popup, trả focus; Tab/Enter/↑↓ chạy trên lịch.
- [ ] Hai trình duyệt cùng phòng: kéo ở A, B thấy đổi; B đang kéo không bị giật bởi A.
- [ ] i18n parity VI/EN, không trộn ngôn ngữ, giờ EN dạng 12h.
- [ ] Số bundle ghi PROGRESS.
- [ ] (Mạch B) Không phản hồi API/WS nào chứa toạ độ thành viên khác; "Vì sao?" có số khớp kết quả; cảnh báo không đỏ,
  có chữ + icon, "Bỏ qua" chạy; không popup tự mở.
