<p align="center">
  <a href="https://didau-omega.vercel.app">
    <img src="frontend/public/favicon.svg" width="72" alt="Logo Hangout Planner">
  </a>
</p>

<h1 align="center">Hangout Planner</h1>

<p align="center">
  Lên kế hoạch đi chơi cho cả nhóm trong một phòng realtime.<br>
  Khi hoà phiếu, chọn quán công bằng nhất cho người ở xa nhất.
</p>

<p align="center">
  <a href="https://didau-omega.vercel.app">Dùng thử</a> ·
  <a href="docs/phase7/ALGORITHMS.md">Thuật toán</a> ·
  <a href="docs/CONTRACTS.md">API</a> ·
  <a href="docs/DEPLOY.md">Triển khai</a>
</p>

<br>

![Trang chủ Hangout Planner: bản đồ 3D TP.HCM](docs/proposal/mvp/screens/01-trang-chu.jpg)

> [!NOTE]
> Backend chạy gói miễn phí của Render, nên lần mở đầu tiên có thể mất khoảng một phút để máy chủ khởi động.

## Giới thiệu

"Tối nay đi đâu?" thường kéo dài cả buổi trong nhóm chat: người gửi link quán, người thả tim, rồi hai quán bằng phiếu
và không ai muốn quyết. Hangout Planner gom việc đó vào một phòng chung. Cả nhóm cùng đề xuất quán, bình chọn, chốt,
xếp lịch rồi gửi kế hoạch. Mọi thay đổi hiện ngay trên máy của mọi người.

Không cần tài khoản. Chủ phòng gửi mã 6 ký tự hoặc link qua Zalo/Messenger, bạn bè vào bằng một nickname và chia sẻ
nơi xuất phát. Trang phòng đổi bố cục theo từng bước và chỉ hiện những gì cần làm lúc đó.

<table>
  <tr>
    <td width="50%" valign="top">
      <b>1 · Tìm quán</b><br>
      <sub>Khoảng 70 000 quán thật ở TP.HCM và Hà Nội ngay trên bản đồ, gộp chi nhánh cùng thương hiệu.</sub>
      <br><br>
      <img src="docs/phase8/screens/t109/1366-z100-01-phong.png" alt="Danh sách quán và bản đồ">
    </td>
    <td width="50%" valign="top">
      <b>2 · Bình chọn</b><br>
      <sub>Phiếu bầu, người đang xem và con trỏ của bạn bè cập nhật tức thì. Khi hoà, app đưa ra một đề xuất.</sub>
      <br><br>
      <img src="docs/phase8/screens/t109/1366-z100-02-hoa-realtime.png" alt="Hoà phiếu và thẻ đề xuất">
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <b>3 · Chốt</b><br>
      <sub>Chỉ chủ phòng chốt quán. Cả phòng thấy kết quả cùng lúc, kèm đường đi, chia sẻ và thêm vào lịch.</sub>
      <br><br>
      <img src="docs/phase8/screens/t109/1366-z100-05-chot.png" alt="Màn chốt quán">
    </td>
    <td width="50%" valign="top">
      <b>4 · Xếp lịch và gửi</b><br>
      <sub>Kéo quán vào lịch, kéo giãn để đổi giờ, theo dõi ngân sách, xuất kế hoạch gửi nhóm.</sub>
      <br><br>
      <img src="docs/proposal/mvp/screens/07-ke-hoach-sau-chot.jpg" alt="Lịch chung của nhóm">
    </td>
  </tr>
</table>

<p align="center">
  <sub>
    Xem chuyển động:
    <a href="docs/phase4/screens/final/hero-1440.gif">trang chủ</a> ·
    <a href="docs/phase5/screens/final/flow-4-steps-1440.gif">các bước trên desktop</a> ·
    <a href="docs/phase4/screens/final/swipe-1440.gif">quẹt thẻ bỏ phiếu</a> ·
    <a href="docs/phase5/screens/final/flow-mobile-explore-detail-vote-500.gif">trên điện thoại</a>
  </sub>
</p>

## Phá hoà công bằng

Bốc thăm hay "ai đề xuất trước" không quan tâm ai phải đi bao xa. Chọn quán có tổng quãng đường cả nhóm ít nhất thì tốt
hơn, nhưng vẫn có thể bắt một người đi rất xa để những người còn lại đỡ vài cây số.

Hangout Planner dùng **Ordered Median Problem (OMP)**. Với mỗi quán đang hoà, app tính quãng đường khứ hồi của từng
người, bình phương lên (k = 2), xếp tăng dần rồi nhân với trọng số tăng dần (λ = 1). Nhờ vậy người đi xa nhất được tính
nặng nhất. Quãng đường lấy từ máy chủ định tuyến **Valhalla** tự host với hồ sơ xe máy và được lưu cache trong Postgres.
Khi không gọi được Valhalla, app lùi về ước lượng (đường chim bay × hệ số uốn lượn).

<img src="docs/phase8/screens/t109/1366-z100-04-vi-sao.png" alt="Bảng Vì sao? so sánh thời gian đi của người xa nhất">

Trong ví dụ trên, ba quán cùng 3 phiếu và bốn người xuất phát từ Q.1, Bình Thạnh, Thủ Đức, Q.7:

| Quán | Người xa nhất đi + về | |
| :--- | --: | :--- |
| **Pizza 4P's Thiso Mall Sala** | **60′** | đề xuất |
| Haidilao Giga Mall | 74′ | tổng km cả nhóm ít nhất |
| Dookki SC VivoCity | 94′ | |

Nếu chỉ cộng tổng km, máy sẽ chọn Haidilao và người xa nhất phải đi thêm 14 phút. Màn mặc định chỉ hiện một câu ngắn
"người xa nhất bớt 14′". Bảng chi tiết nằm sau nút **Vì sao?**.

- **Bộ giải.** Quy hoạch động theo lớp cho lộ trình nhiều chặng. Trên 20 bộ dữ liệu mô phỏng, kết quả khớp vét cạn ở mọi
  case vét cạn chạy được. Case lớn nhất có 3,3 × 10¹² tổ hợp và được giải trong khoảng 4 ms. Số đo và cách tái lập nằm ở
  [`ALGORITHMS.md` §9](docs/phase7/ALGORITHMS.md).
- **Người quyết là người.** Máy chỉ đề xuất, chủ phòng bấm chốt. Chồng giờ hay thiếu giờ trên lịch chỉ được cảnh báo,
  app không tự sửa.
- **Riêng tư.** Không phản hồi API nào chứa toạ độ của thành viên khác. Mỗi người chỉ thấy đường đi của chính mình.

## Tính năng

- **Phòng không cần tài khoản.** Vào bằng nickname và mã 6 ký tự. Có hai vai trò: chủ phòng và thành viên.
- **Realtime.** Phiếu bầu, danh sách quán, lịch, người đang xem và con trỏ trên bản đồ được đồng bộ qua WebSocket.
- **Bản đồ quán.** Bản đồ vector MapLibre với lớp quán thay cho POI nền. Tìm kiếm mờ tiếng Việt, lọc theo 7 loại quán,
  xem chi tiết quán và đường đi của mình.
- **Lịch chung.** Lịch kéo thả trong khung giờ của phòng (mặc định 17:00–23:00), có ghi chú và ngân sách mỗi người.
  App cảnh báo khi chồng giờ hoặc không đủ thời gian di chuyển giữa hai chặng.
- **Xuất kế hoạch.** Ảnh PNG, văn bản kèm emoji, tệp `.ics` hoặc link.
- **Giao diện.** Song ngữ Việt/Anh, theme sáng/tối/theo máy. Điện thoại dùng hai tab, desktop dùng ba cột. Trang chủ 3D
  tự hạ cấp theo sức máy và tôn trọng `prefers-reduced-motion`.

<table>
  <tr>
    <td width="33%"><img src="docs/phase5/screens/final/gather-500-light-vi.webp" alt="Tìm quán trên điện thoại"></td>
    <td width="33%"><img src="docs/phase5/screens/final/vote-500-dark-en.webp" alt="Bình chọn, theme tối, tiếng Anh"></td>
    <td width="33%"><img src="docs/phase6/screens/T-82/card-light-vi-8stops-1080x1350.webp" alt="Ảnh kế hoạch xuất ra"></td>
  </tr>
  <tr>
    <td align="center"><sub>Điện thoại · sáng · tiếng Việt</sub></td>
    <td align="center"><sub>Điện thoại · tối · tiếng Anh</sub></td>
    <td align="center"><sub>Ảnh kế hoạch gửi nhóm</sub></td>
  </tr>
</table>

## Bắt đầu nhanh

Cần Docker và Docker Compose.

```bash
git clone https://github.com/From-haven/Hangout-planner.git && cd Hangout-planner
SEED_DEMO=true docker compose up --build
```

Ứng dụng chạy ở http://localhost:5173, tài liệu API (Swagger) ở http://localhost:8000/docs. Backend tự chạy migration,
nạp bảng tìm quán và tạo phòng mẫu **`DIDAU8`**.

Để dựng phòng có sẵn ca hoà phiếu như ví dụ ở trên:

```bash
cd backend && poetry install
poetry run python ../scripts/seed_demo_genz.py http://localhost:8000 --frontend http://localhost:5173
```

Script in ra mã phòng và cách vào phòng bằng từng thành viên. Số phút trong ví dụ chỉ khớp khi có Valhalla
([`VALHALLA.md`](docs/phase7/VALHALLA.md)); không có Valhalla thì app dùng ước lượng.

<details>
<summary><b>Biến môi trường</b></summary>
<br>

| Biến | Mặc định | Ý nghĩa |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/didau` | Kết nối Postgres |
| `PLACES_PROVIDER` | `osm` | `osm` hoặc `google` (cần key, luôn có đường lùi về OSM) |
| `VALHALLA_URL`, `VALHALLA_KEY` | trống | Máy chủ định tuyến. Bỏ trống thì chỉ đọc cache và ước lượng |
| `SEED_DEMO` | `false` | Tạo phòng mẫu `DIDAU8` khi khởi động |

Danh sách đầy đủ ở [`backend/.env.example`](backend/.env.example) và [`docs/DEPLOY.md`](docs/DEPLOY.md).

</details>

<details>
<summary><b>Kiểm thử</b></summary>
<br>

```bash
docker compose up -d db                                   # test tích hợp dùng Postgres thật
cd backend  && poetry run ruff check . && poetry run pytest
cd frontend && npm run lint && npm test && npm run build
```

Test không gọi mạng thật: backend mock `httpx`, frontend dùng MSW. Smoke test đầu-cuối trên backend đang chạy:

```bash
cd backend && poetry run python ../scripts/smoke_test.py http://localhost:8000 http://localhost:5173 osm
```

</details>

## Công nghệ

| | |
| :--- | :--- |
| **Frontend** | React 18 · TypeScript · Vite · Tailwind CSS · Zustand · MapLibre GL · Motion · i18next |
| **Backend** | Python 3.11+ · FastAPI · SQLAlchemy 2 (async) · Alembic · WebSocket |
| **Dữ liệu** | PostgreSQL 15 (`pg_trgm`) · Overture Maps · OpenStreetMap |
| **Định tuyến** | Valhalla tự host (xe máy), cache trong bảng `travel_legs` |
| **Kiểm thử** | pytest · Ruff · Vitest · MSW |
| **Triển khai** | Vercel (frontend) · Render (backend) · Docker Compose (local) |

```text
Trình duyệt (React + MapLibre)
   │  REST /api/v1  ·  WebSocket /ws/rooms/{room_id}
   ▼
FastAPI ── PostgreSQL (phòng, phiếu, lịch, pois, travel_legs)
   │
   └── Valhalla (km xe máy; không gọi được thì ước lượng)
```

Backend chia lớp theo hướng `api → services → domain → repositories`. Thuật toán phá hoà, cảnh báo lịch và phân loại quán
nằm ở `backend/app/domain/patterns/`. Chi tiết ở [`ARCHITECTURE.md`](docs/ARCHITECTURE.md).

<details>
<summary><b>Cấu trúc thư mục</b></summary>
<br>

```text
backend/
  app/api/v1/          REST và WebSocket
  app/domain/          model, enum, thuật toán (patterns/decision: OMP, cảnh báo lịch)
  app/services/        nghiệp vụ, định tuyến, phát sự kiện realtime
  app/repositories/    truy cập dữ liệu (SQLAlchemy async)
  alembic/             migration
  tests/
frontend/
  src/room/            trang phòng: danh sách, bản đồ, lịch, "Vì sao?"
  src/stage/           trang chủ 3D và các khoảnh khắc chuyển động
  src/i18n/locales/    chuỗi giao diện tiếng Việt và tiếng Anh
  src/mocks/           MSW cho phát triển và kiểm thử
scripts/               dựng dữ liệu quán, seed phòng demo, benchmark OMP, làm ấm cache đường
docs/                  kiến trúc, hợp đồng API, đặc tả thuật toán, nhật ký từng giai đoạn
```

</details>

## Tài liệu

| Tài liệu | Nội dung |
| :--- | :--- |
| [`docs/phase7/ALGORITHMS.md`](docs/phase7/ALGORITHMS.md) | Đặc tả OMP, bộ giải DP, nguồn km, số đo |
| [`docs/CONTRACTS.md`](docs/CONTRACTS.md) | Hợp đồng REST, schema, sự kiện WebSocket |
| [`docs/CHANGE_REQUESTS.md`](docs/CHANGE_REQUESTS.md) | Các thay đổi hợp đồng đã duyệt |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Triển khai Vercel + Render, chế độ Google |
| [`PRODUCT.md`](PRODUCT.md) | Người dùng, nguyên tắc sản phẩm, giới hạn |

## Đồ án

Đồ án môn **Tư duy tính toán** (Computational Thinking), Trường Đại học Khoa học Tự nhiên, ĐHQG-HCM.

- Giảng viên hướng dẫn:
- Lớp:
- Học kỳ:

| Họ tên | MSSV |
| :--- | :--- |
| | |
| | |
| | |
| | |

## Giấy phép và ghi công

Mã nguồn phát hành theo giấy phép [MIT](LICENSE).

- Bản đồ: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, [OpenFreeMap](https://openfreemap.org),
  [OpenMapTiles](https://openmaptiles.org).
- Dữ liệu quán: [Overture Maps Foundation](https://overturemaps.org) và OpenStreetMap.
- Định tuyến: [Valhalla](https://github.com/valhalla/valhalla).
- Avatar: bộ [Thumbs](https://www.dicebear.com/styles/thumbs/) của DiceBear (CC0 1.0), sinh ngay trên máy từ seed.
