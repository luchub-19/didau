# Session kiểm tra code (reviewer), giai đoạn 3

Session reviewer **không làm task mới**. Nó kiểm tra độc lập một task đã `DONE` (hoặc cả một mốc) xem có đúng phạm vi,
đúng tiêu chí, đúng luật thiết kế, và PROGRESS có báo trung thực không. Reviewer không tin lời PROGRESS: tự chạy, tự xem.

## Hai chế độ
- **`review T-xx`** (mặc định): kiểm tra commit của một task. Nên chạy sau mỗi task, trước khi session sau làm task kế.
- **`review M<n>`**: kiểm tra tích hợp sau khi xong một mốc (M1 = T-38→T-41, M2 = T-42→T-43, M3 = T-44→T-50,
  M4 = T-51, M5 = T-52→T-53, M6 = T-54→T-55), tập trung vào chỗ các task chạm nhau.

Không ghi task: lấy task `DONE` gần nhất có cột Review còn trống trong `docs/phase3/PROGRESS.md`.

## Đọc gì (giữ ít)
1. `docs/phase3/PROGRESS.md` (dòng của task).
2. `docs/phase3/tasks/T-xx.md` (toàn bộ: phạm vi, tiêu chí, bẫy, Nhật ký).
3. `docs/phase3/DESIGN.md` §11 và §12, cộng các mục mà file task liệt kê.
4. Diff của task: `git log --oneline --grep "T-xx"` rồi `git show --stat <sha>` và `git show <sha> -- <file>`.
   Không đọc `docs/TASKS.md`, `docs/PROGRESS.md`, `docs/ARCHITECTURE.md` cũ.

## Các bước kiểm tra

### 1. Phạm vi
- So danh sách file trong `git show --stat` với "Được phép tạo/sửa" của task. File ngoài danh sách = phát hiện
  (trừ `vi.ts`/`en.ts`, lock file và test được task cho phép).
- Logic bị đụng? Xem kỹ diff ở `store/`, `services/api/`, `services/websocket/`, `hooks/useRoom.ts`,
  `hooks/useWebSocket.ts`, backend. Chỉ được đổi chỗ task ghi rõ (thường là bỏ chuỗi, trả mã).
- Dependency mới trong `package.json` có nằm trong danh sách task cho phép không.

### 2. Chạy lại, không tin số trong PROGRESS
```bash
cd frontend && npm run lint && npm test && npm run build
cd backend && poetry run ruff check . && poetry run pytest   # nếu task đụng backend (cần docker compose up -d db)
```
Ghi số test thật, so với số PROGRESS báo. Lệch thì ghi phát hiện.

### 3. Tiêu chí hoàn thành
Đi từng gạch đầu dòng "Tiêu chí hoàn thành" trong file task, đánh ĐẠT / KHÔNG ĐẠT / KHÔNG KIỂM ĐƯỢC kèm bằng chứng
(lệnh, đường dẫn ảnh, dòng code). Ảnh mà task nói đã chụp phải có thật trong `docs/phase3/screens/`.

### 4. Luật thiết kế và song ngữ (quét trên các file của task)
```bash
F="<danh sách file .ts/.tsx của task>"
grep -nE "slate-|sky-|gray-|indigo-|purple-|#[0-9a-fA-F]{3,6}\b" $F        # màu cứng thay vì token
grep -nE "alert\(|confirm\(|h-screen|transition-all|bg-gradient|backdrop-blur|z-\[" $F
grep -nP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" $F                        # emoji
grep -nE "text-white" $F                                                    # nghi chữ trắng trên coral
grep -nE "t\([^)]*\)\s*\+|\+\s*t\(" $F                                      # ghép chuỗi i18n
```
Rồi đọc diff tìm những thứ grep không bắt được: placeholder làm nhãn, IconButton thiếu `aria-label`, điều hướng chỉ có
icon, vùng chạm < 44px, thiếu trạng thái tải/trống/lỗi, câu server hiển thị nguyên văn (phải qua `serverText.ts`),
`opening_hours_raw` hoặc cuisine lạ bị in ra, khoá có trong `vi.ts` mà `en.ts` dịch máy móc/sai nghĩa.
Kiểm tra `PENDING_FILES` trong `__tests__/i18n_guard.test.ts` đã bớt đúng các file của task.

### 5. Xem bằng mắt (Claude in Chrome)
`cd frontend && VITE_ENABLE_MOCK=true npm run dev`, mở các màn của task ở 390×844 và 1280×800, VI rồi EN.
Tìm: chữ tiếng Việt lọt vào EN, tràn chữ, dấu bị cắt, bố cục vỡ, focus không thấy khi Tab, `Esc` không đóng sheet.
Không chạy được Chrome thì ghi "chưa kiểm tra trực quan".

### 6. Lỗi logic thật
Đọc diff như người review code: điều kiện sai, effect thiếu cleanup, state không reset, lỗi khi dữ liệu rỗng/null,
race khi bấm nhiều lần, WebSocket bị kết nối lại khi đổi tab/ngôn ngữ. Có thể dùng thêm lệnh `/code-review` trên
commit của task để có thêm góc nhìn, nhưng phải tự xác minh từng phát hiện trước khi ghi.

## Ghi kết quả
1. Tạo `docs/phase3/reviews/T-xx.md` (hoặc `M<n>.md`), ngắn:
   ```
   # Review T-xx  ·  <ngày>  ·  session <8 ký tự>  ·  commit <sha>
   Kết luận: ĐẠT | ĐẠT CÓ GHI CHÚ | CẦN SỬA
   Test chạy lại: frontend <n> pass, backend <n> pass / không đụng
   ## Phát hiện (nặng trước)
   | # | Mức | File:dòng | Vấn đề | Cách sửa đề xuất |
   (Mức: CHẶN = sai logic, vỡ test, lọt tiếng Việt ở EN, vượt phạm vi lớn · NÊN SỬA = vi phạm DESIGN · NHỎ = thẩm mỹ)
   ## Tiêu chí hoàn thành
   (từng dòng: ĐẠT / KHÔNG ĐẠT / KHÔNG KIỂM ĐƯỢC + bằng chứng)
   ```
2. PROGRESS: điền cột Review của task: `ĐẠT`, `ĐẠT*` (có ghi chú) hoặc `CẦN SỬA` + link file review.
3. **Hỏi người dùng** trước khi sửa: liệt kê phát hiện CHẶN/NÊN SỬA và hỏi "sửa luôn trong session này không?".
   - Đồng ý: chỉ sửa trong phạm vi file của task đó, chạy lại lệnh kiểm tra, commit riêng
     `fix(T-xx): sửa theo review`, cập nhật file review (cột "Đã sửa") và cột Review → `ĐẠT`.
   - Không: để `CẦN SỬA`; session làm task kế tiếp phải xử lý các mục CHẶN trước (README đã ghi luật này).
4. Không sửa task khác, không làm tính năng mới, không "tiện tay" refactor.
