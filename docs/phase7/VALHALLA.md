# Tự host Valhalla (việc của người — trước buổi MVP 2026-11-16)

Backend (Render) gọi Valhalla trên PC của nhóm qua tunnel có khoá. PC hỏng/tắt → app tự lùi về ước lượng; phòng demo đã
có km trong cache DB nên kết quả không đổi. Yêu cầu: Docker (Linux, hoặc Windows + WSL2), RAM ≥ 8 GB, PC bật suốt buổi.

Vì sao Valhalla: miễn phí, có chế độ xe máy (`motor_scooter`: tránh đường cấp cao, tốc độ trần mặc định 45 km/h), có API
ma trận và trả hình dạng đường đi. Đúng tới đâu phụ thuộc OpenStreetMap: đường lớn/cầu/một chiều tốt; hẻm thiếu trên OSM
thì đường dài hơn thật; không có kẹt xe (ALGO-03 đã có biên giờ cao điểm). Kiểm bằng §6.

## 1. Tải bản đồ (cắt TP.HCM cho nhẹ)
```bash
mkdir -p ~/valhalla/custom_files && cd ~/valhalla
wget https://download.geofabrik.de/asia/vietnam-latest.osm.pbf
# TP.HCM sau sáp nhập 2025 gồm cả Bình Dương, Bà Rịa–Vũng Tàu
osmium extract -b 106.30,10.30,107.60,11.50 vietnam-latest.osm.pbf -o custom_files/hcm.osm.pbf
# không cắt: cp vietnam-latest.osm.pbf custom_files/
```

## 2. Chạy Valhalla (image chính thức, tự dựng tile từ `.pbf` trong `custom_files`)
```bash
docker run -dt --name valhalla --restart unless-stopped -p 8002:8002 \
  -v $PWD/custom_files:/custom_files ghcr.io/valhalla/valhalla-scripted:latest
docker logs -f valhalla   # đợi dựng xong
```
Tài liệu: https://github.com/valhalla/valhalla/blob/master/docker/README.md

## 3. Thử nhanh (Bến Thành → Phú Mỹ Hưng)
```bash
curl -s localhost:8002/route -d '{"locations":[{"lat":10.7725,"lon":106.698},{"lat":10.7290,"lon":106.7180}],"costing":"motor_scooter","units":"kilometers"}' | head -c 400
curl -s localhost:8002/sources_to_targets -d '{"sources":[{"lat":10.7725,"lon":106.698}],"targets":[{"lat":10.7290,"lon":106.7180}],"costing":"motor_scooter","units":"kilometers"}'
```

## 4. Đặt khoá (Valhalla không có đăng nhập)
```
# Caddyfile
:8080 {
  @ok header X-Route-Key {env.ROUTE_KEY}
  handle @ok { reverse_proxy localhost:8002 }
  respond 403
}
```
```bash
ROUTE_KEY=<chuỗi-bí-mật-dài> caddy run --config Caddyfile
```

## 5. Mở tunnel
- **Tailscale Funnel** (nên dùng, địa chỉ cố định `https://<máy>.<tailnet>.ts.net`): `tailscale funnel 8080`.
- Cloudflare quick tunnel: `cloudflared tunnel --url http://localhost:8080` — địa chỉ **đổi mỗi lần chạy**, phải sửa env
  Render và chờ restart; tránh dùng hôm demo.
- Đặt trên Render: `ROUTING_PROVIDER=valhalla`, `VALHALLA_URL=<địa chỉ tunnel>`, `VALHALLA_KEY=<ROUTE_KEY>`.
  Gửi cho người cài đặt bằng kênh riêng, không dán lên chat nhóm.

## 6. Kiểm 10 tuyến (số cho báo cáo + hiệu chỉnh `MOTORBIKE_KMH`)
So km Valhalla với Google Maps chế độ xe máy (mở tay), ghi vào bảng:
| # | Từ | Đến | Valhalla (km) | Google xe máy (km / phút) | Chênh km |
| :-: | :--- | :--- | :-: | :-: | :-: |
| 1 | | | | | |

## 7. Hôm thuyết trình
Tắt chế độ ngủ của PC; kiểm `curl` qua địa chỉ tunnel (kèm header khoá) trước giờ; mở app trước 5′ (Render ngủ ~1′);
có video dự phòng.
