# HƯỚNG DẪN TRIỂN KHAI HỆ THỐNG "ĐI ĐÂU" (DEPLOYMENT GUIDE)

Tài liệu này cung cấp hướng dẫn chi tiết về kiến trúc triển khai, danh sách biến môi trường, quy trình cập nhật và các lưu ý vận hành khi đưa ứng dụng "Đi Đâu" lên môi trường Production.

---

## 1. SƠ ĐỒ TRIỂN KHAI KIẾN TRÚC (DEPLOYMENT ARCHITECTURE)

```mermaid
flowchart TD
    Client["Trình duyệt Client (Desktop / Mobile)"]
    
    subgraph Vercel["Vercel Edge Network (Frontend)"]
        SPA["React + Vite Single Page App<br/>(Static Assets & CDN)"]
        VercelConfig["vercel.json (SPA Rewrite to /index.html)"]
    end
    
    subgraph Render["Render Cloud (Singapore Region)"]
        Docker["Docker Container (Python 3.12-slim)"]
        StartScript["start.sh<br/>1. alembic upgrade head<br/>2. seed (nếu SEED_DEMO=true)<br/>3. uvicorn worker"]
        FastAPI["FastAPI REST & WebSocket Server<br/>Port 8000 (Proxy headers enabled)"]
    end
    
    subgraph Neon["Neon Serverless PostgreSQL (Singapore Region)"]
        Postgres["PostgreSQL 15/16 Instance<br/>(Direct Connection / SSL Require)"]
    end
    
    Client -->|"HTTPS (Tải HTML/JS/CSS)"| SPA
    Client -->|"REST API (/api/v1/*)"| FastAPI
    Client -->|"WebSocket WSS (/api/v1/ws/*)"| FastAPI
    Docker -->|"TCP (SSL: True, Pool: 5)"| Postgres
```

---

## 2. DANH SÁCH BIẾN MÔI TRƯỜNG (ENVIRONMENT VARIABLES)

### 2.1. Backend (Render Web Service)

| Tên biến | Bắt buộc | Giá trị mẫu / Mặc định | Mô tả |
| :--- | :---: | :--- | :--- |
| `APP_ENV` | Có | `production` | Khi đặt `production`, FastAPI tự động tắt `/docs`, `/redoc`, `/openapi.json` và debug mode. |
| `PORT` | Không | `8000` (Render tự cấp cổng) | Cổng mạng Uvicorn lắng nghe. |
| `DATABASE_URL` | Có | `postgresql://user:pass@ep-xyz.aws.neon.tech/neondb?sslmode=require` | Chuỗi kết nối Neon PostgreSQL (Direct connection). Mã nguồn tự động chuẩn hóa sang asyncpg driver. |
| `ALLOWED_ORIGINS` | Có | `https://your-app.vercel.app` | Danh sách domain frontend được phép gọi API (CORS) và mở kết nối WebSocket (kiểm tra `Origin`). Phân tách bằng dấu phẩy. Không chứa dấu `/` ở cuối. |
| `NOMINATIM_USER_AGENT` | Không | `DiDau/1.0 (student project)` | Header User-Agent gửi kèm khi gọi OpenStreetMap / Nominatim API theo quy định OSM Policy. |
| `SEED_DEMO` | Không | `false` | Nếu đặt `true`, container sẽ chạy nạp dữ liệu mẫu (`app.core.seed`) mỗi khi khởi động. |
| `PLACES_PROVIDER` | Không | `osm` | `osm` (mặc định, không cần key) hoặc `google` (bật khớp `place_id`). Thiếu key hoặc vượt quota thì tự lùi về `osm`. |
| `GOOGLE_MAPS_SERVER_KEY` | Chỉ khi `google` | _(trống)_ | Key phía server, chỉ bật *Places API (New)*. Để trống thì `/pois/google-match` trả `reason=NO_KEY`. |
| `GOOGLE_MATCH_DAILY_LIMIT` | Không | `1000` | Trần số lần gọi Text Search mỗi ngày (giờ VN, đếm trong bộ nhớ tiến trình, reset khi restart). |
| `POI_DATA_DIR` | Không | `app/data` | Thư mục chứa snapshot `pois_hcm.json.gz` / `pois_hn.json.gz`. Thiếu snapshot thì `/pois` trả rỗng, không lỗi. |

### 2.2. Frontend (Vercel Project)

| Tên biến | Bắt buộc | Giá trị mẫu | Mô tả |
| :--- | :---: | :--- | :--- |
| `VITE_API_URL` | Có | `https://didau-backend.onrender.com` | URL gốc của backend trên Render (không có dấu `/` ở cuối). Dùng cho REST API và WebSocket (`wss://`). |
| `VITE_ENABLE_MOCK` | Có | `false` | Tắt toàn bộ mock MSW để kết nối backend thực tế. |
| `VITE_GOOGLE_MAPS_BROWSER_KEY` | Chỉ khi `google` | _(trống)_ | Key trình duyệt (giới hạn referrer). Để trống thì frontend **không gửi request nào** tới `googleapis.com`. |
| `VITE_MAP_STYLE_URL` | Không | OpenFreeMap Liberty | Style MapLibre; đổi nhà cung cấp tile chỉ cần đổi biến này rồi redeploy. |

> [!IMPORTANT]
> **Lưu ý đặc biệt với Vite:** Các biến môi trường bắt đầu bằng `VITE_*` được **nhúng tĩnh (inlined) vào mã nguồn JS ngay tại thời điểm build**. Nếu bạn thay đổi biến trên Vercel, bạn **BẮT BUỘC** phải kích hoạt lại tiến trình Build (Redeploy) thì thay đổi mới có hiệu lực trên trình duyệt người dùng!

---

## 3. CÁCH XEM LOG TRÊN RENDER

1. Truy cập [Render Dashboard](https://dashboard.render.com).
2. Nhấp chọn Web Service **`didau-backend`**.
3. Chọn tab **Logs** ở menu bên trái:
   - Bạn có thể xem log khởi động: tiến trình chạy Alembic migration (`alembic upgrade head`), Uvicorn startup.
   - Khi có request hoặc kết nối WebSocket, Uvicorn sẽ ghi nhận HTTP method, path, status code và log của WebSocket Connection Manager.
   - Nếu gặp lỗi kết nối cơ sở dữ liệu hoặc từ chối Origin, thông báo cảnh báo `[WARNING]` hoặc `[ERROR]` sẽ hiển thị tại đây.

---

## 4. QUY TRÌNH DEPLOY LẠI KHI CẬP NHẬT CODE (RE-DEPLOYMENT)

### 4.1. Tự động deploy qua Git (Khuyên dùng)
- Cả **Render** và **Vercel** đều đã liên kết với nhánh `main` của repo GitHub `luchub-19/didau`.
- Khi bạn push commit mới lên nhánh `main`:
  ```bash
  git add .
  git commit -m "feat/fix: mô tả thay đổi"
  git push origin main
  ```
- **Vercel**: Tự động phát hiện thay đổi trong thư mục `frontend/`, chạy `npm run build` và deploy bản mới trong ~30-45 giây.
- **Render**: Tự động build lại Docker image từ `backend/Dockerfile`, chạy `start.sh` và switch traffic không gián đoạn.

### 4.2. Kích hoạt Deploy thủ công (Manual Deploy)
- **Trên Render:** Vào Web Service $\rightarrow$ Nhấn nút **Manual Deploy** (góc trên bên phải) $\rightarrow$ Chọn **Deploy latest commit** (hoặc **Clear build cache & deploy** nếu muốn build lại từ đầu).
- **Trên Vercel:** Vào Project $\rightarrow$ Tab **Deployments** $\rightarrow$ Nhấn dấu 3 chấm `...` ở deployment gần nhất $\rightarrow$ Chọn **Redeploy**.

---

## 5. CÁC GIỚI HẠN CỦA GÓI MIỄN PHÍ (FREE TIER LIMITS)

> [!WARNING]
> Cần lưu ý các đặc tính sau để trải nghiệm người dùng không bị bỡ ngỡ:

1. **Cơ chế ngủ đông của Render (Spin-down on Idle):**
   - Trên gói Free của Render, web service sẽ **tự động ngủ (spin down)** nếu không có request nào gửi tới trong vòng **15 phút**.
   - Khi có request đầu tiên đánh thức server: Render cần khoảng **50 giây đến 1 phút 15 giây** để khởi động lại container.
   - **Xử lý phía Client:** Frontend "Đi Đâu" đã được tích hợp bộ phát hiện Cold Start: nếu request đầu tiên chưa có phản hồi sau 3 giây, ứng dụng sẽ hiển thị thông báo thân thiện: *"Đang đánh thức máy chủ, chờ khoảng 1 phút nhé…"*, tự động gửi lại request kiểm tra mỗi 5 giây (tối đa 2 phút) và WebSocket client duy trì kết nối retry liên tục.
2. **Neon Serverless Compute Suspension:**
   - Database trên Neon tự động suspend khi không có truy vấn trong 5 phút. Khi Uvicorn gửi query, Neon khôi phục lại chỉ trong vòng vài trăm mili-giây.
3. **Giới hạn số worker:**
   - Gói Free của Render cấp 0.1 vCPU và 512MB RAM, do đó container backend được cấu hình chạy `--workers 1` với kết nối connection pool `pool_size=5, max_overflow=5` để tối ưu hóa bộ nhớ và độ ổn định.

---

## 6. CHẾ ĐỘ GOOGLE VÀ CHECKLIST CHẶN CHI PHÍ

Mặc định ứng dụng chạy chế độ `osm` (miễn phí, không key). Chỉ làm mục này khi muốn bật `PLACES_PROVIDER=google`. Mọi bước dưới đây là việc của người, làm **trước** khi đặt key lên Render/Vercel.

### 6.1. Checklist Google Cloud

- [ ] Tạo project Google Cloud, gắn billing (bắt buộc dù dùng free tier).
- [ ] Bật 3 API: *Places API (New)*, *Maps JavaScript API*, *Places UI Kit*.
- [ ] Tạo **browser key**: giới hạn *HTTP referrer* = domain Vercel (`https://your-app.vercel.app/*`) và `http://localhost:5173/*`; giới hạn API = Maps JavaScript API.
- [ ] Tạo **server key**: giới hạn API = chỉ *Places API (New)* (không giới hạn IP vì Render free dùng IP động).
- [ ] Đặt quota/ngày (Console → APIs & Services → từng API → *Quotas*):
  - [ ] Places UI Kit ≤ **300/ngày** (≈ 9.000/tháng, dưới ngưỡng miễn phí 10.000).
  - [ ] Places Autocomplete ≤ **300 phiên/ngày**.
  - [ ] Places API (New) Text Search ≤ **1.000/ngày**.
- [ ] Tạo **budget alert $1** (Billing → Budgets & alerts), bật email cho cả nhóm ở các mốc 50% / 90% / 100%.
- [ ] Đặt `GOOGLE_MAPS_SERVER_KEY`, `PLACES_PROVIDER=google` (Render) và `VITE_GOOGLE_MAPS_BROWSER_KEY` (Vercel), rồi **Redeploy Vercel** (biến `VITE_*` được nhúng lúc build).

### 6.2. Các lớp chặn chi phí trong code

| Lớp | Hành vi |
| :--- | :--- |
| Backend | `GOOGLE_MATCH_DAILY_LIMIT`: vượt ngưỡng thì `/pois/google-match` trả `reason=QUOTA`, frontend hiển thị chế độ OSM. Kết quả (kể cả "không thấy") được cache trong bảng `external_place_links`, cache hit không tốn quota. |
| Frontend | Chỉ nạp Google Maps JS và khởi tạo thẻ Google khi có browser key **và** người dùng chạm vào một quán. Timeout 4 s hoặc lỗi thì ẩn thẻ, không hiện lỗi. |
| Không lưu | Backend không đọc/lưu rating, review, ảnh của Google; chỉ lưu `google_place_id`. |

### 6.3. Kiểm tra sau khi deploy

```bash
# Chế độ osm (mặc định)
python3 scripts/smoke_test.py https://didau-backend.onrender.com https://your-app.vercel.app osm
# Chế độ google (sau khi đặt key)
python3 scripts/smoke_test.py https://didau-backend.onrender.com https://your-app.vercel.app google
```

Ở chế độ `osm`, mở DevTools → Network, lọc `googleapis`: phải **không có** request nào. Smoke test tạo phòng thật trên backend, nên chạy trên DB demo.
