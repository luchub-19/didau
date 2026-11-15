# Tiến độ giai đoạn 7 "Thuật toán OMP của Sơn"

Mỗi ô ghi chú tối đa 6 gạch đầu dòng. Thứ tự, phụ thuộc, model: `PLAN.md` §3. Thuật toán: `ALGORITHMS.md`.
Hạn MVP: buổi thuyết trình **thứ Hai 2026-11-16**.

## Cổng chờ người dùng
| Cổng | Sau task | Nội dung | Trạng thái |
| :--- | :--- | :--- | :--- |
| G1 | T-93 | Duyệt `PLAN.md`, `ALGORITHMS.md`, CR-15; trả lời câu hỏi UI `PLAN.md` §5 (cần trước T-96) | CHỜ |
| G2 | T-97 | Tổng duyệt `DEMO.md` trên bản deploy trước buổi thuyết trình | CHỜ |

## Việc của người
Xem `PLAN.md` §4 (Valhalla + tunnel, kiểm 10 tuyến, chuẩn bị hôm thuyết trình, hỏi Sơn về phạm vi giờ giấc).

## Bảng task
| Task | Trạng thái | Session | Ghi chú |
| :--- | :---: | :---: | :--- |
| T-93 | DONE | efa7053a | • Làm: `docs/phase7/` PLAN, ALGORITHMS, PROGRESS, VALHALLA, task T-94 → T-97; CR-15 (PROPOSED); mục gđ7 trong `CLAUDE.md`; đóng T-92 (`docs/phase6/PROGRESS.md`). Không đổi code, không chạy test · • Hỏi người dùng nhiều lượt sau khi đọc nhánh `feat/tie-breaker` (orphan, có `__pycache__` — chép tay, không merge) + 3 file Drive (SPEC, báo cáo so sánh của Bảo, tổng hợp 2 thuật toán); 18 quyết định ở PLAN §1 · • Lệch có chủ ý ở MVP: K = 1, chốt theo luồng cũ (PLAN §2) · • Phát hiện: code có 3 định nghĩa "hoà" (giai đoạn `tie` theo điểm + loại; ALGO-02 theo số "Muốn đi" + cả phòng; resolve TRAVEL_TIME theo "Muốn đi") → chốt theo điểm + loại; code Sơn trả hình học đường từ nhà mọi người (vi phạm CR-11) → bỏ; Sơn không xử lý giờ giấc (không có start/end ở code/SPEC/dataset) · • Việc task sau: T-94 + T-95 song song sau G1; T-96 dừng nếu chưa có câu trả lời PLAN §5 |
| T-94 | TODO | | |
| T-95 | TODO | | |
| T-96 | TODO | | |
| T-97 | TODO | | |
| T-98 | TODO | | Đổi tên Hangoutplanner + wordmark C; song song, nên xong trước T-97 |

## Bản đầy đủ (sau buổi MVP, lên plan lại)
- Chặng = loại quán, thứ tự **chỉ theo lịch người dùng đã xếp** (chưa có trên lịch → bỏ qua), DP nhiều chặng trong app (PLAN §1 #14).
- Chốt không tự loại quán; đề xuất "Loại các quán còn lại?" (#15); nút "Kết thúc bình chọn" (#16); giai đoạn phòng theo loại.
- Hộp xác nhận trước khi tự xếp lịch (#17).
- Dời từ T-92 gđ6: ảnh `screens/final/`, đo kéo thả fps/long task, CLS, LCP trang chủ.
