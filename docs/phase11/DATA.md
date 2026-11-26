# Dữ liệu tĩnh của landing (T-122)

Sinh ngày **2026-11-26** bằng `scripts/build_landing_data.py` (chạy tay, gọi Valhalla thật, không nằm trong test).

## Lệnh đã chạy
```bash
# Valhalla ở PC nhà (host che): mở tunnel tới cổng nội bộ để khỏi cần khoá của cổng Caddy
ssh -f -N -L 18002:127.0.0.1:8002 <user>@<pc-nha>
~/.cache/pypoetry/virtualenvs/didau-backend-*/bin/python scripts/build_landing_data.py \
    --valhalla http://localhost:18002 [--step 0.01] [--cache DIR]
```
Valhalla 3.9.2, costing `motor_scooter` (như backend). Mỗi lô 40 nguồn × 3 quán, cache từng lô theo băm yêu cầu (`--cache`)
nên rớt mạng thì chạy lại là ghi tiếp. Lệch bất kỳ số nào của DEMO gđ8 → script thoát, **không ghi file**.

## Đối chiếu DEMO gđ8 (đã khớp từng số)
| Quán | Người xa nhất (′, đi + về) | DEMO | Tổng km | DEMO |
| :--- | ---: | ---: | ---: | ---: |
| Pizza 4P's Thiso Mall Sala | 60 | 60 | 68,2 | 68,2 |
| Haidilao Giga Mall | 74 | 74 | 63,5 | 63,5 |
| Dookki SC VivoCity | 94 | 94 | 81,5 | 81,5 |

Pizza 4P's, cột từng người: Xuka 60′ · Xeko 54′ · Doraemon 28′ · Nobita 26′ (khớp). `expected.omp` chọn **Pizza 4P's**
(Ψ 2291,602 / 2485,543 / 4285,925); `expected.sum` chọn **Haidilao** (63,5 km).

## File
| File | Kích thước | Ghi chú |
| :--- | ---: | :--- |
| `frontend/src/landing/data/demoCase.json` | 2,4 KB | km khứ hồi **3 số lẻ** (để Ψ phía trình duyệt khớp backend; backend làm tròn Ψ 3 số nên test dùng sai số 0,005) |
| `frontend/src/landing/data/grid.json` | 15,8 KB | 23 hàng × 27 cột = **621 điểm**, bước 0,01°, bbox `[106.58, 10.68, 106.84, 10.90]`; km làm tròn 0,1, phút nguyên |
| `frontend/public/landing/bui-vien-night-1200.webp` | 115 KB | |
| `frontend/public/landing/bui-vien-night-2000.webp` | 226 KB | |
| `frontend/public/landing/qr-deploy.svg` | 1,6 KB | QR `https://didau-omega.vercel.app/`, mức sửa lỗi M, `#1C1917` trên `#FAFAF9`, viền 4 ô |

- **Lưới:** 114 / 1 863 ô `null` (**6,1 %**, ≥ 90 % có giá trị): điểm rơi xuống sông/không có đường xe máy gần. Không chứa toạ độ
  người dùng thật (chỉ nút lưới + toạ độ quán + tâm quận đại diện của 4 bạn mẫu).
- **Hiệu chỉnh ước lượng:** phút khứ hồi ≈ `a · (chim bay × 1,3, một chiều) + b` với **a = 4,517, b = 14,84** (hồi quy đơn trên
  chính 1 749 ô lưới có giá trị). km ước lượng = `2 · chim bay × 1,3`.
- **Ảnh:** "Bui Vien Street, Ho Chi Minh City, at night, 2023 (13)", **Bahnfrend**, **CC BY-SA 4.0**
  (https://commons.wikimedia.org/wiki/File:Bui_Vien_Street,_Ho_Chi_Minh_City,_at_night,_2023_(13).jpg). Tải bản gốc 3708×2416,
  `magick -auto-orient -resize {1200|2000}x -strip -quality 70`. **Phải hiện ghi công** trên trang (PLAN §3 mục 12).
- **QR:** sinh một lần bằng `segno` 1.6.6 trong venv tạm ngoài repo (`make(url, error='m', boost_error=False)`, `scale=8`,
  `border=4`); không thêm dependency vào `package.json`/`pyproject`.

## Kết quả 12 quận trên lưới thật (chế độ "xa nhất", người xem đặt ở tâm quận)
`pick` = quán được đề xuất; "xa nhất" = ai đi lâu nhất ở quán đó. Test `explore.test.ts` bám các dòng gv/btn/nb/pn.
| Quận | Đề xuất (xa nhất) | Ghi chú |
| :--- | :--- | :--- |
| q1 | Pizza (Xuka 60′) | |
| q7 | Pizza (Xuka 60′) | |
| Gò Vấp | **Haidilao** (Xeko 74′) | đảo so với mặc định, hai chế độ cùng chọn |
| Bình Tân | Pizza (**Bạn** 81′) | tổng km chọn Haidilao |
| Thủ Đức | Haidilao (Xeko 74′) | |
| Nhà Bè | Pizza (**Bạn** 67′) | tổng km chọn Dookki |
| Bình Thạnh | Pizza (Xuka 60′) | tổng km chọn Haidilao |
| Quận 12 | Haidilao (Xeko 74′) | |
| Phú Nhuận, Tân Bình, Quận 3 | Pizza (Xuka 60′) | tổng km chọn Haidilao |
| Quận 5 | Pizza (Xuka 60′) | hai chế độ cùng chọn |

Đừng viết chữ i18n dựa vào một quận cụ thể (đổi lưới là đổi bảng này).

## Chạy lại
Cần Valhalla bật (`docs/phase7/VALHALLA.md`), seed `scripts/seed_demo_genz.py` không đổi 4 nhà + 3 quán. Sau khi chạy lại, chạy
`npm test` ở `frontend/` và dò lại bảng 12 quận ở trên.
