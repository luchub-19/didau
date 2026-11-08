# Kịch bản demo 3 phút — HookupFPT, giai đoạn 6 (Lịch chung & Algorithm Engine)

Ba người: **Bảo** (host, laptop Chrome ≥1280 px), **Nam** và **Linh** (hai điện thoại / hai cửa sổ ẩn danh).
Bản giai đoạn 5 (không có thuật toán) ở `docs/phase5/DEMO.md`. Chuẩn bị chung (mạng, tile bản đồ, chế độ sáng, không bật
"Giảm chuyển động") giống bản đó; thêm: Render ngủ → gọi `/health` trước; cho phép vị trí hoặc chuẩn bị chọn nơi xuất phát bằng ô tìm.

## Kịch bản
| Thời điểm | Làm gì | Nói gì (gợi ý) |
| :--- | :--- | :--- |
| 0:00 | Bảo tạo phòng (khung giờ 17:00–23:00 mặc định, điểm hẹn Q1), mời Nam, Linh bằng mã. | "Tối nay đi đâu? Ba người, ba nơi." |
| 0:20 | Mỗi người: avatar → **Xuất phát từ đâu?** (Bảo: Q1, Nam: Bình Thạnh, Linh: Thủ Đức). Chấm "đã chia sẻ" hiện cạnh tên. | "Vị trí chỉ mình tôi thấy; người khác chỉ biết tôi đã chia sẻ." |
| 0:45 | Bản đồ hiện **widget tâm nhóm** + vòng tròn 2 km; mở rộng → nhãn khu vực. Bấm dải **Gần cả nhóm**. | "ALGO-01: tâm của ba điểm xuất phát." |
| 1:00 | Thêm quán: mỗi người đề xuất 2 (nút "Thêm 2/2" khoá lại ở quán thứ 3). | "Host đặt giới hạn, mặc định 2 quán/người." |
| 1:20 | Cả ba bình chọn "Muốn đi" → **3 quán hoà**. Danh sách xếp theo **Ưu tiên**, chip nhãn bấm được → **Vì sao?**. | "ALGO-04: không chỉ đếm phiếu mà còn xét độ xa và giờ mở cửa." |
| 1:40 | Thẻ đề xuất hoà phiếu: **Vạn Hạnh Mall** (gợi ý). Bấm **Vì sao?** → ma trận thời gian (tổng 57′ / xa nhất 25′, ghi "Ước lượng · xe máy"). Host xác nhận → **Chốt**. | "ALGO-02: chọn quán tổng thời gian đi ít nhất — host vẫn quyết." |
| 2:00 | Cột Kế hoạch: **kéo quán** vào lịch; kéo quán thứ hai sát quán đầu → dải **"Thiếu 10′"** hiện ngay khi đang kéo. | "ALGO-03: không đủ thời gian đi giữa hai nơi." |
| 2:20 | Bấm dải → **Vì sao?** (công thức, gợi ý), hoặc **Bỏ qua**; dời quán xa ra → dải về "12′ · 3,2 km". Mở popup quán: sửa giờ + ghi chú. | "Cảnh báo nhẹ, không chặn, không tự đẩy giờ." |
| 2:40 | **Xuất kế hoạch**: tab Ảnh (thẻ 4:5) → Tải; tab Văn bản (emoji) → Sao chép; `.ics`. | "Gửi cả nhóm trên Zalo." |

## Nếu có sự cố
- **Không thấy widget tâm nhóm**: cần ≥2 người có vị trí; ai không chia sẻ thì lấy điểm hẹn của host.
- **Không ra hoà**: hoà nghĩa là bằng số "Muốn đi" ở hạng đầu; cho cả ba cùng bấm.
- **Dải di chuyển ghi "ước lượng"**: bình thường khi chưa bật Google Routes (`PLACES_PROVIDER=google` + key).
- **Chia sẻ ảnh/sao chép ảnh không chạy**: cần HTTPS/máy thật; dùng Tải về.
- **Máy yếu giật**: thêm `?motion=lite` hoặc `?motion=off` vào URL.

## Chưa kiểm khi viết kịch bản
Chạy thật qua WS hai máy; định vị `navigator.geolocation`; kéo bằng chạm; Google Routes thật. Kiểm trước khi demo.
Ảnh minh hoạ từng bước hiện ở `docs/phase6/screens/T-79 … T-90/` (bộ `screens/final/` chưa chụp — xem PROGRESS T-92).
