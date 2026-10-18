# KẾ HOẠCH GIAI ĐOẠN 3: LÀM LẠI GIAO DIỆN + SONG NGỮ VI/EN

Ngày lập: 2026-10-18. Giai đoạn 1–2 (T-01 → T-37) đã DONE. Giai đoạn này **giữ nguyên logic** (store, API client,
WebSocket, thuật toán backend) và làm lại lớp giao diện, theo thứ tự: nền vững → song ngữ đầy đủ → từng màn hình
→ trạng thái và độ bền → rồi mới đến hiệu ứng → chế độ tối → đánh bóng.

Session mới **không cần đọc file này**: đọc `docs/phase3/README.md` rồi file task của mình. File này để người
dùng duyệt và để tra cứu khi task ghi "đọc PLAN mục X".

---

## 1. Quyết định đã chốt với người dùng (2026-10-18)

| # | Câu hỏi | Quyết định |
| :-: | :--- | :--- |
| 1 | Thiết bị chính | **Điện thoại trước** (mobile-first), desktop mở rộng sau |
| 2 | Cảm giác | **Tươi, thân thiện, có màu**: nền sáng trung tính, một màu nhấn, bo mềm, chữ to rõ |
| 3 | Phạm vi | **Làm lại giao diện, giữ logic** (store/API/WS/test logic giữ nguyên) |
| 4 | Chọn ngôn ngữ | Theo trình duyệt lần đầu, có nút VI/EN, lưu `localStorage`, URL không đổi |
| 5 | Chữ do backend sinh | **Frontend dịch theo mã** (error code, rule code, reason code); cần CR-06 cho phần backend chưa có mã |
| 6 | Emoji | **Bỏ hết**, thay bằng một bộ icon (Phosphor) |
| 7 | Dark mode | Sáng trước; dùng token ngay từ đầu; tối ở T-54 |
| 8 | Màu nhấn | **Cam san hô (coral)** `#FF6B4A`, chữ trên nút là màu mực (không trắng, vì trượt tương phản) |
| 9 | Font | **Be Vietnam Pro** |
| 10 | Điều hướng trong phòng | **Thanh tab dưới đáy**: Quán · Bản đồ · Lịch · Nhóm |
| 11 | Tài liệu | Thư mục riêng `docs/phase3/`, **mỗi task một file nhỏ**; file cũ dài giữ làm lưu trữ |
| 12 | Skill | Rút thành `DESIGN.md` + skill dự án `.claude/skills/didau-ui/` tự nạp khi sửa UI |
| 13 | Thời hạn | Không gấp: làm đủ cả dark mode và đánh bóng |
| 14 | Kiểm tra trực quan | Session tự chạy app (MSW) và chụp màn hình bằng Claude in Chrome trước khi DONE |
| 15 | Mức hiệu ứng | Vừa phải, có chủ đích; CSS trước, thư viện chỉ khi cần |

Quyết định mình tự đặt (người dùng có thể đổi, ghi lại để session sau không tự nghĩ lại):
- Tên "Đi Đâu" giữ nguyên ở bản EN (tên riêng); khẩu hiệu EN: "Where to tonight?".
- Bản EN hiển thị giờ kiểu 12h (`5:00 PM`), tiền vẫn là VND (`₫45,000`).
- Tính năng mới (UI chat theo CR-04, màn cấu hình khung giờ phòng theo CR-03) **không** nằm trong giai đoạn này.
  Ghi vào mục 8 làm việc tương lai.

## 2. Hiện trạng giao diện (điểm xuất phát)

- React 18 + Vite 5 + Tailwind **v3** + Zustand; khoảng 10.300 dòng UI trong `components/`, `pages/`, `store/`...
- Khoảng 600 chuỗi tiếng Việt hardcode trong khoảng 45 file; chưa có i18n.
- Đúng những "dấu hiệu AI" mà cả hai repo liệt kê: pill badge ✨ trên tiêu đề, chữ gradient "Đi Đâu?", hàng 3 thẻ
  icon emoji giống nhau, emoji làm icon khắp nơi (🚀 🔑 🍜 🎲), `alert()`/`confirm()` (4 chỗ), spinner giữa màn,
  favicon emoji, màu `sky` + `slate` mặc định của Tailwind.
- `RoomPage.tsx` 434 dòng gom cả tab, modal, xử lý lỗi; tab nằm trên cùng (xa ngón cái).
- Ba component chọn hộ rất lớn: `LuckyLadder` 663, `SwipeDeck` 595, `SpinWheel` 443 dòng.
- Test chạy môi trường **node** (không có jsdom), dùng `renderToStaticMarkup` + `toContain('<chữ tiếng Việt>')`.
  Vì vậy i18n phải khởi tạo đồng bộ, mặc định `vi` khi không có `navigator`, để 150 test hiện có vẫn chạy.
- Backend: lỗi API có `error.code` (dịch được). Nhưng `ConflictAlert.message`, `ScoredPick.reasons`,
  `PlannedSlot.reasons`, `DroppedPlace.reason` là **câu tiếng Việt tự do** (ví dụ `planner.py:340`,
  `smart_pick.py:282`): cần CR-06.

## 3. Rút skill từ hai repo: lấy gì, bỏ gì, vì sao

Nguyên tắc chọn: app này là **công cụ nhóm trên điện thoại** (chế độ Operate), không phải landing page giành giải.
Skill nào viết cho landing page/portfolio thì chỉ lấy phần áp dụng được cho app.

### 3.1. `pbakaus/impeccable`: nguồn chính

| Phần | Lấy | Dùng ở đâu |
| :--- | :--- | :--- |
| **Modes** (Persuade / Operate / Read / Experience) | Có: trang chủ là Persuade nhẹ, trong phòng là Operate | DESIGN §1 |
| `operate.md`: một họ chữ, thang rem cố định, đủ 7 trạng thái component, skeleton thay spinner, không modal theo phản xạ, motion 150–250ms | Có, gần như toàn bộ | DESIGN §3, §6, §7, §8 |
| `craft-floor.md`: tương phản, khoảng cách, đủ trạng thái, chỉnh cả bề mặt trình duyệt (selection, caret, focus ring, scrollbar), danh sách "Refuse" | Có | DESIGN §2, §11; T-38 |
| `harden.md`: i18n (không ghép chuỗi, số nhiều, `Intl`), tràn chữ, lỗi mạng theo mã HTTP, chống bấm 2 lần, cử chỉ bị ngắt | Có, cốt lõi cho song ngữ | DESIGN §9; T-39, T-43, T-51 |
| `clarify.md`: nút gọi tên hành động, lỗi nói cái gì hỏng + cách sửa, nhãn bền, hoàn tác thay vì xác nhận | Có | DESIGN §10; mọi task màn hình |
| `onboard.md`: trạng thái trống là chỗ dạy dùng, đưa người dùng tới "khoảnh khắc aha" nhanh | Có: aha của app là "cả nhóm vote xong và có lịch" | T-44, T-45 |
| `adapt.md`: mobile là nghĩ lại chứ không thu nhỏ, bottom nav, bottom sheet, vùng chạm 44px | Có | DESIGN §5; T-41 |
| `animate.md` + `delight.md`: một khoảnh khắc có chủ đích, mỗi animation phải có lý do, vui tỉ lệ với tần suất | Có | DESIGN §8; T-52, T-53 |
| `audit.md`, `polish.md`: chấm a11y/hiệu năng/responsive 0–4 | Có, làm checklist | T-51, T-55 |
| CLI `npx impeccable`, chế độ `live`, hook detector, `PRODUCT.md`/`DESIGN.md` theo định dạng của họ | **Không**: thêm công cụ ngoài, tải binary, trùng với docs sẵn có | |
| `overdrive`, `bolder` | **Không**: trái mục tiêu "đơn giản" | |

### 3.2. `leonxlnx/taste-skill`: lấy có chọn lọc

| Skill / phần | Lấy | Lý do |
| :--- | :--- | :--- |
| `taste-skill` v2 (mặc định) | **Chỉ phần tham khảo**: `references/motion.md` (token easing, thời lượng, công thức press/hover/menu/accordion, "điều làm motion lộ là AI") và `references/tells.md` (danh sách dấu hiệu AI) | Bản thân skill ghi rõ "không dành cho dashboard/app". Quy trình bốc thăm hướng thiết kế, tìm ảnh lưu trữ, ≥8 phần tử chuyển động là cho landing page |
| `redesign-skill` | **Có**: quy trình Quét → Chẩn đoán → Sửa, thứ tự ưu tiên (font → màu → trạng thái hover/active → bố cục → thay component sáo rỗng → trạng thái tải/trống/lỗi → thang chữ), luật "không đổi framework, không phá chức năng" | Đúng tình huống: dự án đã có, giữ logic |
| `taste-skill-v2-experimental` | **Một phần**: 3 "núm" làm ngôn ngữ chung. App này đặt `DESIGN_VARIANCE 3`, `MOTION_INTENSITY 4`, `VISUAL_DENSITY 5`; các luật trạng thái (§4.5), form (§4.6: nhãn trên, lỗi dưới), khoá 1 màu nhấn, khoá 1 hệ bo góc | Phần còn lại (hero, bento, marquee, Next.js RSC) không áp dụng |
| `minimalist-skill` | **Một phần**: màu nhạt cho nhãn trạng thái, nút phẳng, không bóng nặng, chữ không đen tuyệt đối | Bảng màu đơn sắc ấm không khớp "tươi, có màu" |
| `soft-skill` | **Không** (chỉ mượn ý bóng rất mềm cho sheet) | Double-bezel, pill nav kính mờ, chữ khổng lồ, `py-24` trở lên: quá nặng cho app điện thoại |
| `output-skill` | **Có** như kỷ luật session: không để `// TODO`, không bỏ dở giữa chừng | Mỗi session làm trọn một task |
| `brutalist`, `stitch`, `gpt-tasteskill`, `image-to-code`, `imagegen-*`, `brandkit` | **Không** | Sai phong cách hoặc là công cụ tạo ảnh |

### 3.3. Chỗ hai repo mâu thuẫn và cách chốt

| Vấn đề | taste-skill | impeccable | Chốt cho dự án |
| :--- | :--- | :--- | :--- |
| Bo góc | v2 cấm bo mềm 9–16px (landing) | Thẻ 12–16px, pill cho điều khiển nhỏ | impeccable (app, Operate) |
| Chuyển động | v2 bắt ≥8 phần tử chuyển động | Operate: không chuỗi tải trang, motion chỉ cho trạng thái | impeccable |
| Viền | v2 cấm mọi viền 1px | Cho phép trong form/bảng | Viền chỉ cho input; thẻ tách bằng nấc màu |
| Font | Cấm Inter, đề xuất Geist/Satoshi | Một họ sans tốt là đủ | Be Vietnam Pro: thiết kế cho dấu tiếng Việt, thứ Geist/Satoshi không ưu tiên |

### 3.4. Nguồn bổ sung ngoài hai repo

- **WCAG 2.2**: SC 2.5.8 vùng chạm tối thiểu 24px (AA), 2.5.5 là 44px (AAA); tương phản 4.5:1 / 3:1.
- **Apple HIG** 44pt, **Material** 48dp vùng chạm; bottom navigation 3–5 mục.
- **Emil Kowalski** (animations.dev, Sonner, Vaul): quyết định animate theo tần suất; thao tác bàn phím không animate;
  UI dưới 300ms.
- **Be Vietnam Pro** (Lâm Bảo, Tony Le, ViệtAnh Nguyễn; OFL): dạng dấu thích ứng cho tiếng Việt. Nguồn về khoảng dòng
  cho dấu chồng: case study BM Daniel (Baemin, Red Dot) và thảo luận trên Typedrawers.
- **i18n**: so sánh react-i18next / Lingui / Paraglide (Tolgee 2026, PkgPulse). Chọn react-i18next: phổ biến, khởi
  tạo đồng bộ chạy được trong test node, không cần bước biên dịch hay plugin Babel; tự thêm test đối chiếu khoá để bù
  lại việc thiếu kiểm tra lúc biên dịch.

Danh sách link ở mục 9.

## 4. Kiến trúc giao diện mới

```
App
├─ I18nProvider (i18next, đồng bộ) ─ <html lang>
├─ Màn khởi động máy chủ / lỗi kết nối (dùng EmptyState)
├─ HomePage (Persuade nhẹ)
│   ├─ Tiêu đề + 1 câu + [Tạo phòng]  [Có mã phòng?]
│   ├─ Phòng gần đây (nếu có)
│   └─ 3 bước "cách chơi" dạng danh sách có thứ tự thật (<ol>), không phải 3 thẻ icon
│   Sheet: CreateRoom, JoinRoom
└─ RoomPage → RoomShell
    ├─ RoomTopBar: tên phòng, mã phòng (chạm để copy), trạng thái kết nối, nút chia sẻ
    ├─ Dải cảnh báo xung đột (khi có), dải mất kết nối (khi có)
    ├─ Panel theo tab (?tab=places|map|schedule|group)
    │   ├─ Quán: chip danh mục cuộn ngang, banner "Chọn hộ", danh sách thẻ quán + vote, nút nổi [Thêm quán]
    │   ├─ Bản đồ: bản đồ toàn panel, ô tìm kiếm nổi, PlaceSheet kéo lên; lg: danh sách | bản đồ
    │   ├─ Lịch: dòng thời gian theo ngày, [Lên lịch giúp tôi], xem trước auto-plan trong sheet
    │   └─ Nhóm: mã phòng + chia sẻ, thành viên (online), ngôn ngữ, (T-54) giao diện sáng/tối
    └─ BottomTabBar (mobile) / TopTabs (lg)
    Sheet dùng chung: thêm quán, chi tiết quán, thêm vào lịch, xung đột, chọn hộ, phân định hoà, xác nhận
    Toast dùng chung
```

Thư mục mới: `src/styles/` (token), `src/i18n/` (khởi tạo, từ điển, định dạng, bảng dịch mã), `src/components/ui/`
(bộ khung), `src/components/shell/` (khung phòng). Component tính năng giữ thư mục cũ, viết lại phần hiển thị.

## 5. Lộ trình và mốc

| Mốc | Task | Kết quả | Cổng kiểm tra |
| :--- | :--- | :--- | :--- |
| **M1. Nền** | T-38 → T-41 | Token, font, icon, i18n chạy, bộ khung component, khung phòng có tab dưới | **Người dùng duyệt trang mẫu (T-38)** trước khi làm T-40 |
| **M2. Song ngữ từ backend** | T-42, T-43 | Mã lý do/tham số từ backend (CR-06), frontend dịch được mọi chữ server | CR-06 phải được duyệt trước T-42 |
| **M3. Màn hình** | T-44 → T-50 | Mọi màn trên bộ khung mới, chữ qua i18n, đủ trạng thái | Chụp màn hình VI/EN mỗi task |
| **M4. Độ bền** | T-51 | Danh sách chờ i18n rỗng, a11y AA, chữ dài, mất mạng | **Người dùng duyệt bản demo đứng yên** trước motion |
| **M5. Hiệu ứng** | T-52, T-53 | Phản hồi bấm, sheet/tab, khoảnh khắc chốt quán và kết quả chọn hộ | reduced-motion đầy đủ |
| **M6. Tối + hoàn thiện** | T-54, T-55 | Dark mode, đánh bóng, tài liệu, review cuối | |

Thứ tự tuần tự (1 session/lần) nằm ở `README.md`. T-42 (backend) độc lập với T-40/T-41, nên nếu CR-06 duyệt sớm
có thể làm xen; nếu CR-06 bị từ chối, T-43 dùng phương án lùi (mục 6).

## 6. CR-06 (PROPOSED): mã cho chữ do backend sinh ra

Chi tiết ở `docs/CHANGE_REQUESTS.md` mục CR-06. Tóm tắt: thêm trường mới, **giữ** trường cũ để tương thích:
- `ConflictAlert.params` (JSON: `item_ids`, `place_names`, `start/end`, `travel_min`, `budget`...) + migration 003
  thêm cột `params JSONB` vào bảng conflicts.
- `ScoredPick.reason_codes`, `PlannedSlot.reason_codes`: danh sách `{code, params}`; `DroppedPlace.reason_code`.
- Bảng mã cố định trong CONTRACTS.

Phương án lùi nếu CR-06 bị từ chối: frontend tự dựng câu từ `rule_code` + `entity_ids` + dữ liệu trong store
(xung đột) và **ẩn** phần lý do chi tiết của chọn hộ/lên lịch ở chế độ EN, chỉ hiện điểm số/thời gian. Không bao giờ
hiện câu tiếng Việt của server ở chế độ EN.

## 7. Rủi ro và cách chặn

| Rủi ro | Chặn |
| :--- | :--- |
| Sót chuỗi tiếng Việt ở chế độ EN | Test `i18n_guard` + `i18n_parity` (T-39); T-51 yêu cầu danh sách chờ rỗng; chụp màn EN mỗi task |
| Sửa UI làm vỡ logic/realtime | Không sửa store/API/WS (trừ chỗ task cho phép); 150 test cũ phải xanh; chỉ đổi chữ mong đợi trong test khi đổi copy |
| Test cũ assert chữ tiếng Việt | i18n mặc định `vi` trong test; task đổi copy thì sửa test tương ứng trong cùng commit |
| Bản đồ MapLibre trong bottom tab (mất kích thước khi ẩn/hiện) | Đã có bẫy (PROGRESS cũ, 2026-10-17): container phải có chiều cao thật; gọi `map.resize()` khi tab hiện lại (T-41, T-47) |
| Coral trượt tương phản | Đã đo: chữ trắng trên `#FF6B4A` chỉ 2.8:1, nên dùng chữ mực; chữ coral trên nền sáng dùng `#C73E26` |
| Font tải chậm, nhảy bố cục | Chỉ subset `vietnamese` + `latin`, 4 weight, `font-display: swap`, fallback `system-ui` có `size-adjust` gần đúng |
| Session đọc quá nhiều docs | Mỗi task một file 3–5 KB, ghi rõ đọc mục nào; file cũ `TASKS.md`/`PROGRESS.md` không đọc trong giai đoạn 3 |
| Component chọn hộ quá lớn cho 1 session | Tách 2 task (T-48, T-49) |

## 8. Ngoài phạm vi (việc tương lai, không làm trong giai đoạn 3)

- UI chat trong phòng (WS `CHAT_MESSAGE` đã có, CR-04).
- Màn cấu hình khung giờ/ngân sách phòng (`PATCH /rooms/{id}`, CR-03), ngoài phần điểm hẹn đã có.
- PWA/cài lên màn hình chính, thông báo đẩy.
- Ngôn ngữ thứ ba.

## 9. Nguồn tham khảo

- taste-skill: https://github.com/leonxlnx/taste-skill (đọc `skills/redesign-skill`, `taste-skill/references/motion.md`, `tells.md`, `taste-skill-v2-experimental` §0–4)
- impeccable: https://github.com/pbakaus/impeccable (đọc `skill/SKILL.src.md`, `reference/operate.md`, `craft-floor.md`, `harden.md`, `clarify.md`, `onboard.md`, `adapt.md`, `animate.md`, `delight.md`, `audit.md`)
- WCAG 2.2 vùng chạm: https://frontendchecklist.io/rules/accessibility/touch-targets · https://testparty.ai/blog/wcag-target-size-guide
- Bottom sheet và thumb zone: https://virtuslab.com/blog/frontend/mobile-first-interaction-patterns · https://www.dolfy.ai/blog/bottom-sheet-or-modal-mobile-interruption-pattern
- Emil Kowalski, tóm tắt nguyên tắc: https://instagit.com/emilkowalski/skills/what-is-emil-kowalskis-design-engineering-philosophy.md
- Be Vietnam Pro: https://fontsource.org/fonts/be-vietnam-pro/about
- Dấu tiếng Việt và khoảng dòng: https://www.red-dot.org/project/bm-daniel-55106 · https://typedrawers.com/discussion/2570/on-the-positioning-of-the-upper-marks-in-stacked-diacriticals · https://vietnamesetypography.com/
- Thư viện i18n React 2026: https://tolgee.io/blog/react-i18n-libraries-comparison · https://www.pkgpulse.com/guides/next-intl-vs-react-i18next-vs-lingui-react-i18n-2026
