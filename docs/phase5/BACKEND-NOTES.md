# Việc backend để sau (giai đoạn 5 chỉ làm frontend)

Ghi lại để không mất; **chưa lên lịch**. Mỗi mục khi làm phải thêm CR (PROPOSED) vào `docs/CHANGE_REQUESTS.md` và chờ
người dùng duyệt trước khi sửa `CONTRACTS.md`. Frontend giai đoạn 5 đã có đường lùi cho từng mục.

| # | Việc | Vì sao | Frontend đang lùi thế nào | Gợi ý làm |
| :-: | :--- | :--- | :--- | :--- |
| 1 | SmartPick hiểu `budget_limit` là **ngân sách mỗi người cho cả buổi** | Người dùng chốt 2026-11-01. `smart_pick.py:240` đang so giá **từng quán** với cả ngân sách | Thanh ngân sách FE tự tính tổng; điểm "vừa ngân sách" của SmartPick có thể lệch | So `cost` với `budget_limit − Σ cost các quán đã ACCEPTED/trong lịch`; cập nhật test `smart_pick`, lý do `WITHIN_BUDGET` thêm tham số còn lại |
| 2 | API trả **danh sách người đã vote** từng quán | Thẻ quán muốn hiện avatar người "Muốn đi" ngay khi tải phòng | Chỉ hiện avatar thấy được qua `VOTE_UPDATED.voter_id` trong phiên; còn lại hiện số | Thêm `upvoter_ids: string[]` vào place summary (REST + `PLACE_ADDED`) |
| 3 | **Đổi avatar sau khi đã vào phòng** | "Đổi nhân vật" hiện chỉ được trước khi tạo/vào phòng | Ẩn nút đổi trong menu avatar | `PATCH /rooms/{id}/members/me {avatar_url}` + sự kiện WS `MEMBER_UPDATED` |
| 4 | Xếp hạng **"đang hot"** từ dữ liệu nhiều phòng | Người dùng muốn dải gợi ý theo xu hướng | Thay bằng Bộ sưu tập tuyển chọn + Nhóm đang để ý | `GET /pois/trending?city=` đếm số lần quán được thêm/chốt 30 ngày gần nhất, cache |
| 5 | **Điểm hẹn ở giữa cả nhóm** | Mỗi người đi từ một nơi | Chủ phòng đặt một điểm hẹn | Mỗi thành viên chia sẻ vị trí (tuỳ chọn), backend tính tâm/điểm cân bằng thời gian đi |
| 6 | Phân biệt **"miễn phí"** và **"chưa rõ giá"** | `estimated_cost = 0` đang mang cả hai nghĩa | Hiện "chưa rõ giá" cho 0 | `estimated_cost` cho phép `null` = chưa rõ, `0` = miễn phí; migration giữ 0 cũ thành `null` |
| 7 | Tự chốt phiên SWIPE + avatar người quẹt (CR-09 đang PROPOSED) | Mang từ giai đoạn 4 | Host bấm `acceptTop`; "+1" ẩn danh | Xem "Nâng cấp để sau" trong `docs/phase4/PROGRESS.md` |
