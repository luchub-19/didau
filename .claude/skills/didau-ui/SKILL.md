---
name: didau-ui
description: Luật thiết kế và song ngữ VI/EN của app "Đi Đâu" (giai đoạn 3). Dùng mỗi khi tạo hoặc sửa bất kỳ file giao diện nào trong frontend/src (component .tsx, styles, tailwind.config.js, i18n/locales), khi thêm chữ hiển thị cho người dùng, thêm animation, hoặc review/chụp màn hình giao diện. Rút từ taste-skill (redesign, motion, tells) và impeccable (operate, craft-floor, harden, clarify, animate, delight, audit).
---

# Đi Đâu UI

Nguồn sự thật là `docs/phase3/DESIGN.md`. Skill này chỉ nhắc những luật hay bị quên nhất và chỉ chỗ đọc. Khi file task
`docs/phase3/tasks/T-xx.md` ghi đọc mục nào của DESIGN.md thì đọc đúng mục đó (Grep heading rồi Read với offset/limit).

## Vùng Stage (giai đoạn 4)
Trang chủ điện ảnh, quẹt thẻ, reveal, chuyển tab, `src/stage|motion|sound/*`: dùng skill `didau-stage` và `docs/phase4/DESIGN.md`.

## Trước khi viết một dòng UI
1. Màn này thuộc chế độ nào? Trang chủ = Persuade nhẹ; mọi thứ trong phòng = **Operate**: quen thuộc, dễ quét,
   cá tính chỉ ở màu/chữ/một điểm nhấn (DESIGN §1).
2. Dùng component trong `src/components/ui/` trước khi tự viết. Thiếu thì ghi vào PROGRESS, đừng tự tạo biến thể mới
   ngoài phạm vi task.
3. Màu/chữ/bo góc/z-index chỉ qua token (DESIGN §2–4). Không class màu Tailwind gốc, không mã hex trong component.

## Luật hay quên
- **Chữ trắng trên coral bị cấm** (2.8:1). Nút chính = nền `accent` + chữ `ink`.
- **Mọi chữ hiển thị qua `t()`**, khoá thêm vào cả `i18n/locales/vi.ts` và `en.ts`. Không ghép chuỗi; dùng nội suy.
  Giờ/tiền/khoảng cách qua `src/i18n/format.ts`. Chữ do server sinh (lỗi, xung đột, lý do) qua `src/i18n/serverText.ts`,
  không hiển thị nguyên văn. Dữ liệu người dùng và địa danh giữ nguyên (DESIGN §9).
- Comment trong code vẫn viết tiếng Việt.
- Không emoji làm icon; icon Phosphor qua `components/ui/Icon.tsx`. Điều hướng luôn có nhãn chữ.
- Vùng chạm ≥44px. Input 16px. Nhãn ở trên ô, lỗi ở dưới ô.
- Sheet thay modal; không `alert()`/`confirm()`; xoá thì ưu tiên undo.
- Đủ trạng thái: đang tải (skeleton), trống (dạy cách dùng + 1 hành động), lỗi (cái gì hỏng + cách sửa + thử lại).
- Line-height tiếng Việt: tiêu đề ≥1.25, chữ thường 1.5; không VIẾT HOA nhãn nhỏ có giãn chữ.
- Animation chỉ từ T-52 trở đi. Hỏi "thấy bao nhiêu lần?" trước khi animate; chỉ `transform`/`opacity`; có nhánh
  `prefers-reduced-motion` (DESIGN §8).

## Danh sách cấm (DESIGN §11)
Emoji làm icon · gradient · glass/blur trang trí · viền + bóng cùng lúc · hàng thẻ icon giống nhau · eyebrow viết hoa ·
pill "New" · đánh số 01/02 trang trí · monospace làm "chất kỹ thuật" · placeholder làm nhãn · `h-screen` ·
`transition: all` · bounce · `z-[9999]` · câu tiếng Việt hardcode trong component.

## Trước khi báo DONE
Làm đủ checklist DESIGN §12: chụp bằng Claude in Chrome ở 390px và 1280px, VI và EN (`VITE_ENABLE_MOCK=true npm run
dev`), tự xem và sửa 3 lỗi rõ nhất; Tab bằng bàn phím; `npm run lint && npm test && npm run build` xanh; test
`i18n_guard` xanh và file của task đã ra khỏi `PENDING_FILES`. Không chạy được Chrome thì ghi rõ "chưa kiểm tra trực
quan", không báo là đã kiểm tra.
