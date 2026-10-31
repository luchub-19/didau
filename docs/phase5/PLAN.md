# KẾ HOẠCH GIAI ĐOẠN 5: "KHÔNG GIAN PHÒNG" — THIẾT KẾ LẠI TRANG PHÒNG

Trang phòng là nơi người dùng ở gần như suốt thời gian dùng app. Giai đoạn này tổ chức lại bố cục cho đơn giản, dễ
dùng không cần hướng dẫn, nhưng **không bớt chức năng**. Phần lớn là frontend; việc backend chỉ ghi note
(`BACKEND-NOTES.md`), chưa làm.

## 1. Quyết định đã chốt với người dùng (2026-10-31 → 2026-11-01)
1. **Gộp tab.** Desktop (≥1024px): một màn làm việc 3 cột, không tab — Danh sách nhóm | Bản đồ | Kế hoạch (thu gọn
   được). Mobile: 2 tab **Khám phá** (bản đồ + sheet danh sách) và **Kế hoạch**. Tab "Nhóm" bỏ, nội dung vào menu avatar.
2. **Bố cục đổi theo giai đoạn**, suy ra từ dữ liệu (không bắt người dùng bấm): ① Tìm quán → ② Bình chọn
   (②b Cần trọng tài khi hoà) → ③ Chốt kèo → ④ Gửi lịch. Mỗi giai đoạn **một** nút chính; thứ chưa cần thì chìm.
3. **Góc phải trên**: "N đang xem" (từ presence CR-08) + avatar, tên, vai trò của mình; bấm mở menu (mời, thành viên,
   ngôn ngữ, giao diện, âm thanh, thông tin chuyến, chiến lược hoà phiếu cho chủ phòng).
4. **Avatar = nhân vật hoạt hình ngẫu nhiên** (DiceBear, sinh tại chỗ, không gọi mạng); người dùng không tải ảnh lên.
5. **Hết "vote mù"**: trang chi tiết quán ngay trong web (bộ ảnh, giới thiệu, đánh giá), vote ở đáy trang chi tiết.
   Nguồn dữ liệu theo tầng: bộ **tuyển chọn trong repo** (ảnh + giới thiệu song ngữ, ~40 quán TP.HCM) → Google Places
   UI Kit nếu bật cờ → iframe Maps Embed (miễn phí) → OSM + ảnh minh hoạ danh mục. Ảnh lấy tự do (đồ án nội bộ) nhưng
   tải về repo.
6. **Không làm "đang hot"** (cần dữ liệu nhiều phòng → backend sau). Thay bằng 4 dải gợi ý có lý do rõ: Gần điểm hẹn ·
   Bộ sưu tập (tuyển chọn) · Hợp giờ + ngân sách · Nhóm đang để ý (presence).
7. **Ngân sách = mỗi người cho CẢ BUỔI.** Hiện trên chip giá, dải gợi ý, thanh ngân sách đầu cột Kế hoạch. SmartPick ở
   backend hiện so giá từng quán → sửa sau (`BACKEND-NOTES.md` #1).
8. **Tạo phòng hỏi "Nhóm hẹn nhau ở đâu?"** (vị trí hiện tại / tìm địa điểm / để sau) thay vì hỏi "có muốn đề xuất
   quán gần không"; ngân sách chọn bằng chip.
9. Mock tham chiếu: `docs/phase5/mock/*.dc.html` (bản chép của canvas
   https://claude.ai/artifact/A9TtzPuFhdLbZsnGcauwYw). Mock là **bố cục và thứ bậc**, không phải pixel: màu/chữ/icon
   thật theo token và component hiện có (DESIGN §2).

## 2. Hiện trạng (điểm xuất phát, đọc code 2026-10-31)
- `RoomPage.tsx` → `RoomShell` (thanh đỉnh + `DesktopTabBar`/`BottomTabBar`) → 4 panel `pages/room/*Panel.tsx`.
  `useRoomTab` giữ `?tab=places|map|schedule|group`, `pushState` + View Transitions (T-62).
- Nội dung bị khoá `max-w-7xl`; bản đồ `h-[75vh]` trong trang cuộn; `ConflictAlertBanner` ghim trên mọi tab trừ Lịch;
  `DeciderBanner`, bộ lọc, sắp xếp, nút nổi "Thêm quán" tranh chú ý cùng lúc.
- `Place` không có ảnh/rating. `GooglePlaceCard` + `loadPlacesUiKit` đã có (sau cờ Google, tự ẩn khi thiếu key).
- Ngân sách: `Room.budget_limit` nhập ở `CreateRoomModal`, chỉ hiện ở tab Nhóm. `Place.estimated_cost` thường 0 với quán OSM.
- Avatar: `Member.avatar_url` (VARCHAR 500) có trong API tạo/vào phòng (`creator_avatar_url`, `avatar_url`) nhưng FE
  chưa dùng. **Chưa có endpoint đổi avatar sau khi vào phòng.**
- `.ics`: `stage/reveal/actions.ts` (`buildIcs`, `downloadIcs`) cho **một** quán sau reveal.
- REST không trả danh sách người đã vote từng quán (chỉ `upvotes`/`downvotes`/`current_user_vote`); WS
  `VOTE_UPDATED.voter_id` chỉ có khi đang mở phòng.

## 3. Nguyên tắc
- **Một việc chính mỗi giai đoạn.** Nút chính duy nhất màu `accent`; các hành động khác là nút phụ/liên kết.
- **Thông tin ở đâu thì quyết định ở đó**: vote đặt cạnh ảnh và đánh giá, không đặt trên thẻ trống.
- **Không màn trống trông hỏng**: thiếu ảnh/giá/giờ vẫn có bố cục đầy đủ (minh hoạ danh mục, "chưa rõ giá").
- **Không đổi hợp đồng** trong giai đoạn này. Cần thì thêm CR (PROPOSED) và ghi `BACKEND-NOTES.md`, không tự làm.
- Giữ tài sản giai đoạn 4: View Transitions, presence, reveal, StageDeck, `motion/`, `sound/`. Vùng Stage vẫn theo
  `docs/phase4/DESIGN.md`; phần còn lại theo `docs/phase3/DESIGN.md` + `docs/phase5/DESIGN.md` (ghi đè chỗ khác nhau).

## 4. Kiến trúc mới (tên file dự kiến, task tạo ra)
```
frontend/src/
  room/                       # mới — logic thuần của không gian phòng (test không cần DOM)
    phase.ts                  # T-66 roomPhase(): gather | vote | tie | lock | send
    budget.ts                 # T-73 tổng chi phí lịch / người, số quán chưa rõ giá
    curated.ts                # T-70 tra bộ tuyển chọn theo external_id hoặc tên + toạ độ
  curated/hcm.json            # T-70 dữ liệu tuyển chọn (vi + en)
  components/shell/
    PhaseStepper.tsx          # T-66
    RoomWorkspace.tsx         # T-67 3 cột desktop / 2 tab mobile (thay phần thân RoomShell)
    IdentityMenu.tsx          # T-68 "N đang xem" + avatar + menu
  components/places/
    PlaceRow.tsx              # T-69 thẻ ngang
    PlaceDetail.tsx           # T-71 trang chi tiết (panel desktop / sheet mobile)
    DiscoveryRails.tsx        # T-72 4 dải gợi ý
  components/schedule/
    BudgetMeter.tsx           # T-73
  components/ui/
    CharacterAvatar.tsx       # T-68 DiceBear sinh tại chỗ, đọc `avatar_url` dạng URL DiceBear
frontend/public/curated/      # ảnh tuyển chọn (người dùng đặt vào)
```
`GroupPanel.tsx`, `DeciderBanner.tsx`, `ConflictAlertBanner` (bản ghim toàn trang) bị thay; xoá ở task thay chúng.

## 5. Ngân sách hiệu năng (giữ của giai đoạn 4, đo ở T-75)
- Entry `index.js` ≤216 kB gzip; phòng cộng thêm ≤+25 kB so với đầu giai đoạn (đầu giai đoạn 185,8 kB, DESIGN gđ4 §6).
- DiceBear: chỉ import 1 style; nếu >15 kB gzip thì tải lười.
- UI Kit/Embed chỉ tải khi mở trang chi tiết; không bao giờ cho cả danh sách.
- Ảnh tuyển chọn: WebP, cạnh dài ≤1200px, ảnh nhỏ (thumbnail) ≤320px; `loading="lazy"`.
- CLS ≈0 khi đổi giai đoạn (cột thu/mở dùng `transform`/width cố định, không đẩy nội dung).

## 6. Lộ trình
Ước lượng = context đỉnh của một session: nền ~25k (system, `CLAUDE.md`, skill, file task, mục DESIGN) + đọc code
(~1 token / 3 byte) + sửa (~1,3× code mới) + mỗi vòng lint/test/build ~5k (cắt output) + mỗi ảnh chụp ~1,5k.
Nhắm ≤150k, tuyệt đối ≤250k. Gần 180k mà chưa xong: dừng ở trạng thái xanh, giữ `DOING`, tách phần còn lại thành T-xxb.

| # | Task | Tên | Phụ thuộc | Cổng | Token (đọc/sửa/build+chụp) | Model · effort |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | T-65 | Tài liệu giai đoạn 5 (file này) | – | **G1** sau task | ~75k (15/35/0) | Sonnet 5.5 · medium |
| 2 | T-66 | `roomPhase` + `PhaseStepper` | G1 | | ~75k (20/15/15) | Sonnet 5.5 · medium |
| 3 | T-67 | Khung không gian: 3 cột / 2 tab, bỏ tab Nhóm | T-66 | | ~135k (45/35/25) | **Opus 5.5 · high** |
| 4 | T-68 | Danh tính: avatar hoạt hình, "N đang xem", menu avatar | T-67 | | ~110k (35/30/20) | Sonnet 5.5 · high |
| 5 | T-69 | Thẻ quán ngang, vote "Muốn đi", khối trọng tài | T-67 | | ~125k (40/35/25) | Sonnet 5.5 · high |
| 6 | T-70 | Bộ dữ liệu tuyển chọn + hàm tra | G1 | | ~100k (20/45/10) | Sonnet 5.5 · medium |
| 7 | T-71 | Trang chi tiết quán | T-69, T-70 | | ~140k (45/40/25) | **Opus 5.5 · high** |
| 8 | T-72 | Giai đoạn ①: tìm kiếm lớn + 4 dải gợi ý | T-67, T-70 | | ~120k (35/35/25) | Sonnet 5.5 · high |
| 9 | T-73 | Cột Kế hoạch + thanh ngân sách cả buổi + gửi lịch | T-67 | | ~130k (45/35/25) | Sonnet 5.5 · high |
| 10 | T-74 | Form tạo phòng mới | T-68 | | ~85k (25/20/15) | Sonnet 5.5 · medium |
| 11 | T-75 | Đánh bóng, đo, chụp, cập nhật demo | T-66 → T-74 | **G2** trước, **G3** sau | ~125k (30/20/50) | Sonnet 5.5 · medium |

```
T-65 ─▶ G1 ─▶ T-66 ─▶ T-67 ─┬─▶ T-68 ─▶ T-74
                             ├─▶ T-69 ─▶ T-71 ─┐
              T-70 (sau G1) ─┼─────────▶ T-72 ─┼─▶ G2 ─▶ T-75 ─▶ G3
                             └─▶ T-73 ─────────┘
```
Song song được (2 worktree): T-70 với T-66/T-67; sau T-67 thì T-68, T-69, T-73 không đụng file của nhau
(mỗi file task ghi rõ ranh giới).

**Vì sao chọn model:** Opus chỉ cho T-67 và T-71 — đổi kiến trúc, đụng code Stage đã tinh chỉnh (View Transitions,
MapView giữ mounted, presence, `PlaceSheet`), sai nhỏ là lỗi khó thấy và mọi task sau phải sửa theo. Sonnet high cho
task component nhiều trạng thái giao diện. Sonnet medium cho tài liệu, dữ liệu, form, đánh bóng. Không dùng Haiku: task
nào cũng phải chụp và soi giao diện.

## 7. Rủi ro và cách chặn
| Rủi ro | Chặn |
| :--- | :--- |
| Bỏ tab làm vỡ View Transitions (T-62) và test `stage_tab_transition` | T-67 giữ `withViewTransition` cho đổi tab mobile và cho mở/đóng cột; cập nhật test thay vì xoá |
| MapLibre không vẽ lại khi cột đổi rộng | `ResizeObserver` trên khung bản đồ gọi `map.resize()`; bỏ mẹo `dispatchEvent('resize')` |
| Link cũ `?tab=places/map/schedule/group` | `useRoomTab` ánh xạ: places/map → explore, schedule → plan, group → explore + mở menu avatar |
| Dữ liệu tuyển chọn không khớp quán người dùng thêm | Ghép theo `external_id` trước, rồi tên chuẩn hoá + toạ độ ≤50 m; không khớp thì tầng dưới |
| Giấy phép style DiceBear | T-68 chọn style và ghi giấy phép vào README (mục credits); CC BY thì ghi công |
| Bundle vượt ngân sách | Đo cuối mỗi task, ghi số vào PROGRESS; UI Kit, Embed, DiceBear tải lười nếu cần |

## 8. Ngoài phạm vi
- Mọi đổi backend/hợp đồng (`BACKEND-NOTES.md`), kể cả avatar người đã vote khi tải phòng, đổi avatar sau khi vào phòng.
- Trang chủ (hero 3D) giữ nguyên. StageDeck/reveal chỉ đổi điểm vào (nút "Để trọng tài chọn"), không đổi bên trong.
- Đổi mô hình vote (veto có lý do) — chỉ đổi nhãn up/down thành "Muốn đi / Không".
