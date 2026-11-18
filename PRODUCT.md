# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Chính:** sinh viên và người trẻ 18–25 tuổi, mở link mời phòng qua Zalo/Messenger **trên điện thoại**, thường vừa
  dùng app vừa nhắn tin với nhóm. Họ cần xong việc nhanh (đề xuất quán, bình chọn, xem lịch, chia sẻ nơi xuất phát),
  không ngồi khám phá giao diện.
- **Host** (người tạo phòng): người duy nhất xác nhận đề xuất, chốt quán, quyết định khi hoà phiếu.
- **Member** (người vào bằng mã/link): đề xuất quán, bình chọn, xem kế hoạch chung.
- Người chấm đồ án và người xem demo **không** phải đối tượng thiết kế của app này. Phần trình bày thuật toán nằm ở
  một web riêng do nhóm làm (cho buổi demo khác); app này đánh giá bằng đúng trải nghiệm thật của nhóm bạn.

## Product Purpose

Giải bài toán "cuối tuần này đi đâu?" của một nhóm bạn trong **một phòng realtime**: đề xuất quán → bình chọn → chốt →
xếp lịch chung → gửi kế hoạch. Thành công là nhóm chốt được nơi đi mà không ai bị bắt đi quá xa, và mọi người hiểu vì
sao chọn quán đó mà không phải đọc nhiều.

## Positioning

**Phá hoà phiếu công bằng.** Khi các quán hoà điểm, app không bốc thăm hay lấy "ai đề xuất trước" mà dùng Ordered
Median (OMP, λ = 1, k = 2) trên **km thật** (Valhalla, xe máy; lùi về ước lượng chim bay × 1,3), ưu tiên người ở xa
nhất. Đề xuất luôn là một câu ngắn ("Chọn X sẽ tốt hơn · người xa nhất bớt 8′") kèm "Vì sao?", và **chỉ host bấm xác
nhận**: không có gì tự động. Đặc tả: `docs/phase7/ALGORITHMS.md`.

## Operating Context

- Link mời gửi qua Zalo/Messenger, mở trong trình duyệt điện thoại (thường là webview của app nhắn tin). Desktop có bố
  cục 3 cột (danh sách | bản đồ | kế hoạch), mobile có 2 tab.
- Không đăng ký/đăng nhập: vào phòng bằng nickname + mã 6 ký tự, `member_token` lưu ở trình duyệt.
- Phòng gắn với một thành phố (TP.HCM hoặc Hà Nội, CR-18). Chỉ tìm quán trong thành phố đó; vào phòng bắt buộc chia sẻ
  nơi xuất phát.
- Giai đoạn phòng đổi bố cục: tìm quán → bình chọn → (hoà) → chốt → gửi lịch. Khung giờ mặc định 17:00–23:00.
- Kế hoạch xuất ra PNG, văn bản kèm emoji, `.ics` và link.

## Capabilities and Constraints

- Tính năng hiện có: đề xuất quán (từ dữ liệu Overture + OSM, tìm bằng Postgres `pg_trgm`, "Xem N chi nhánh"), vote
  Muốn đi/Không realtime qua WebSocket, hiện diện, đề xuất phá hoà + "Vì sao?", chốt quán, lịch kéo thả kiểu Google
  Calendar, cảnh báo chồng/thiếu giờ (chỉ cảnh báo, không tự sửa), đường đi của mình trên bản đồ + đường giữa các quán
  trên lịch, trang chủ bản đồ 3D, song ngữ VI/EN.
- **Quyền riêng tư (CR-11):** không phản hồi nào chứa toạ độ của thành viên khác; không bao giờ vẽ hay trả đường/km
  xuất phát từ nhà người khác. Mỗi người chỉ thấy đường của mình.
- Không gọi dịch vụ trả phí. Mọi thứ Google nằm sau cờ `PLACES_PROVIDER=google` và có đường lùi về OSM; không lưu
  rating/review/ảnh của Google.
- Hạ tầng: frontend Vercel, backend Render (ngủ khi rảnh), Valhalla chạy trên PC của nhóm qua tunnel.
- Vòng đời: **dừng ở bản nộp đồ án.** Chỉ cần chạy ổn cho buổi chấm và dùng làm portfolio; không có người dùng thật lâu
  dài, nên đừng đầu tư vào khả năng mở rộng, onboarding tăng trưởng hay vận hành dài hạn.
- Thuật ngữ: phòng, host, thành viên, quán, loại quán (7 loại), Muốn đi / Không, hoà, chốt, kế hoạch, nơi xuất phát.

## Brand Commitments

- Tên hiển thị: **Hangoutplanner** (viết liền, chỉ H hoa). Logo luôn qua `<Wordmark />`
  (`frontend/src/components/shell/Wordmark.tsx`), không tự viết tên. Repo/package vẫn tên "Đi Đâu"/`didau`.
- Coral mang nghĩa "lựa chọn của nhóm mình" (pin, vote, quán đã chốt), không dùng làm màu trang trí (`docs/phase3/DESIGN.md` §1).
- Giọng văn: "bạn", "nhóm mình"; tự nhiên, không teencode, không chấm than; nút là động từ + đối tượng; lỗi nói việc gì
  hỏng và cách sửa. Bản EN casual nhưng không slang. Cấm "Oops", "Tuyệt vời!", "seamless", "elevate"
  (`docs/phase3/DESIGN.md` §10).
- Bản đồ và lớp quán luôn dùng bảng màu sáng, kể cả ở theme tối (người dùng chốt ở T-101).
- Luật giao diện hiện hành nằm rải ở `docs/phase3/DESIGN.md`, `docs/phase5/DESIGN.md` và `docs/phase6/DESIGN.md` (gđ sau ghi đè gđ trước),
  cùng `docs/phase4/DESIGN.md` cho vùng Stage.

## Evidence on Hand

- Ảnh chụp web thật (theme tối, phòng demo, km từ Valhalla): `docs/proposal/mvp/screens/01-…07-*`.
- Số đo thuật toán (20 case, so sánh A1/A2/A3/MinSum/OMP): `docs/proposal/mvp/script-thuyet-trinh-v2.md` §1.1.
- Phòng demo đã seed (xem `docs/phase7/` và `scripts/seed_demo_*`).
- **Chưa có:** người dùng thật, testimonial, số liệu sử dụng. Đừng bịa ra.

## Product Principles

1. **Đúng thứ, đúng lúc.** Mỗi giai đoạn của phòng chỉ hiện những gì người dùng cần làm lúc đó; thông tin phụ nằm sau
   một thao tác ("Vì sao?", chi tiết quán), không trải sẵn ra màn hình.
2. **Ít chữ, đủ tính năng.** Giữ đủ tính năng của web nhưng không dày đặc chữ hay chi tiết. Thuật toán không cần dạy
   trong app: một câu ngắn kèm một con số là đủ, giải thích sâu chỉ khi người dùng bấm hỏi.
3. **Công bằng có thể giải thích.** Mọi đề xuất đều trả lời được "vì sao" bằng lời thường (quãng đường, người ở xa),
   không bằng ký hiệu (không hiện Ψ).
4. **Người quyết là người, không phải máy.** Không tự chọn, tự bỏ hay tự xếp; máy chỉ đề xuất, host xác nhận. Chồng hay
   thiếu giờ chỉ cảnh báo.
5. **Riêng tư theo mặc định.** Vị trí của một người chỉ phục vụ chính họ và phép tính chung, không bao giờ lộ cho người khác.

## Accessibility & Inclusion

- Mobile-first, kiểm ở 360px với cả hai ngôn ngữ; vùng chạm tối thiểu 44×44px.
- Hướng tới WCAG 2.2 AA: trạng thái không chỉ truyền bằng màu (có chữ + icon), `prefers-reduced-motion` bỏ di chuyển/scale.
- Song ngữ VI/EN đầy đủ, không trộn ngôn ngữ trong chữ do app tạo ra (`docs/phase3/DESIGN.md` §9).
