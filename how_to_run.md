# Hướng dẫn cài đặt & chạy Hangout Planner trên Localhost

Tài liệu này dành cho cả thành viên dùng **Windows (PowerShell)** và **Linux (Ubuntu/Debian — Bash)**.

> **Quy ước quan trọng để tránh lỗi khác hệ điều hành:**
> - Trên **Windows**, hãy mở **PowerShell** (không dùng CMD cũ) và **copy đúng khối lệnh ghi nhãn `Windows (PowerShell)`**. PowerShell **không** hiểu cú pháp `BIEN=gia_tri lenh` hay chạy trực tiếp file `.sh` của Linux.
> - Trên **Linux**, dùng **Terminal (Bash/Zsh)** và **copy đúng khối lệnh ghi nhãn `Linux (Bash)`**.
> - Nếu chạy từ thư mục gốc project, hãy `cd` vào đúng thư mục `Hangout-planner` trước.

---

## Phần 1. Công cụ & thư viện cần chuẩn bị

### 1.1. Bảng chọn nhanh: Bạn cần cài những gì?

Không bắt buộc cài hết tất cả — tuỳ cách chạy bạn chọn:

| Cách chạy | Node.js + npm | Docker + Compose | Python (3.11–3.14) + Poetry |
| :--- | :---: | :---: | :---: |
| **Cách 1:** Chạy nhanh chế độ Mock (MSW) | Bắt buộc | Không cần | Không cần |
| **Cách 2:** Frontend local + Backend Render sẵn có | Bắt buộc | Không cần | Không cần |
| **Cách 3A:** Full-stack thật bằng Docker Compose *(khuyên dùng)* | Không cần | Bắt buộc | Không cần |
| **Cách 3B:** Full-stack chạy tay (sửa code Backend / chạy test) | Bắt buộc | Khuyên dùng *(để bật DB Postgres)* | Bắt buộc |

---

### 1.2. Cài công cụ hệ thống (chỉ cài những mục bạn cần)

#### 1) Git & Node.js (v18+ / khuyên dùng v20 hoặc v22 LTS, đi kèm `npm`)

- **Windows:**
  - Tải và cài trực tiếp từ [nodejs.org](https://nodejs.org/) (chọn bản **LTS**), hoặc cài qua `winget` trong PowerShell:
    ```powershell
    winget install OpenJS.NodeJS.LTS
    ```
  - Đóng và mở lại PowerShell rồi kiểm tra:
    ```powershell
    node -v
    npm -v
    ```
- **Linux (Ubuntu/Debian):**
  ```bash
  sudo apt-get update
  sudo apt-get install -y nodejs npm
  node -v && npm -v
  ```
  *(Nếu bản `nodejs` mặc định của hệ thống cũ hơn v18, cài bản LTS qua [NodeSource](https://github.com/nodesource/distributions) hoặc `nvm`.)*

#### 2) Docker & Docker Compose *(cho Cách 3A và 3B)*

- **Windows:**
  - Tải và cài **Docker Desktop for Windows** từ [docker.com](https://www.docker.com/products/docker-desktop/) (trong lúc cài giữ mặc định bật **WSL 2**).
  - **Lưu ý bắt buộc:** Trước mỗi lần chạy lệnh `docker ...`, bạn phải **mở ứng dụng Docker Desktop** và chờ biểu tượng cá voi báo **Engine running**.
  - Kiểm tra trong PowerShell:
    ```powershell
    docker --version
    docker compose version
    ```
- **Linux (Ubuntu/Debian):**
  ```bash
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose-v2
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER"
  ```
  - Đăng xuất rồi đăng nhập lại (hoặc gõ `newgrp docker` trong terminal hiện tại) để chạy `docker` không cần `sudo`.
  - Kiểm tra:
    ```bash
    docker --version && docker compose version
    ```
  - *(Lưu ý: nếu đã dùng Docker thì **không** nên chạy thêm dịch vụ PostgreSQL cài riêng trên máy để tránh đụng cổng `5432`.)*

#### 3) Python (`>=3.11, <3.15`) & Poetry *(chỉ cần cho Cách 3B — chạy tay Backend)*

> Dự án yêu cầu **Python từ 3.11 đến 3.14** (xem `backend/pyproject.toml`). Không dùng Python 3.10 trở xuống hoặc 3.15+.

- **Windows (PowerShell):**
  ```powershell
  # Cài Python 3.12 (nếu chưa có)
  winget install Python.Python.3.12
  # Đóng mở lại PowerShell, sau đó cài Poetry
  pip install poetry
  poetry --version
  ```
- **Linux (Ubuntu/Debian):**
  ```bash
  python3 --version   # kiểm tra đang là 3.11 – 3.14
  # Cài Poetry (qua pipx hoặc uv)
  sudo apt-get install -y pipx && pipx install poetry && pipx ensurepath
  # (Hoặc nếu đã có uv: uv tool install poetry && uv tool update-shell)
  ```
  Mở lại terminal rồi kiểm tra `poetry --version`.

---

### 1.3. Thư viện bên trong project (tự động cài từ file cấu hình)

Bạn **không cần cài lẻ từng thư viện** — chỉ cần chạy 1 lệnh cài đặt tự động sau khi `git clone` về máy:

- **Frontend** (khai báo trong `frontend/package.json` — gồm React 18, TypeScript, Vite, Tailwind CSS, Zustand, MapLibre GL JS, Motion, GSAP, i18next, html-to-image, DiceBear, MSW, Vitest...):
  - **Windows (PowerShell) & Linux (Bash) giống nhau:**
    ```bash
    cd frontend
    npm install
    ```
- **Backend** (khai báo trong `backend/pyproject.toml` — gồm FastAPI, Uvicorn, Pydantic v2, SQLAlchemy 2 async, asyncpg, Alembic, pytest, httpx, Ruff... — *chỉ cần chạy nếu dùng Cách 3B*):
  - **Windows (PowerShell) & Linux (Bash) giống nhau:**
    ```bash
    cd backend
    poetry install
    ```

---

## Phần 2. Các cách chạy project trên Localhost

### Cách 1: Chạy nhanh chế độ Mock (MSW) — Chỉ cần Frontend

> **Phù hợp khi:** muốn mở web lên test giao diện, luồng tạo phòng, bỏ phiếu, phá hoà OMP + *"Vì sao?"*, kéo-thả lịch, xuất kế hoạch ngay lập tức mà **không cần cài Docker hay PostgreSQL**.
>
> **Giới hạn:** dữ liệu sống tạm trong RAM trình duyệt (F5 sẽ reset về phòng mẫu `DIDAU8`) và không đồng bộ WebSocket giữa nhiều máy/nhiều tab thật.

- **Windows (PowerShell):**
  ```powershell
  cd frontend
  $env:VITE_ENABLE_MOCK="true"
  npm run dev
  ```
- **Linux (Bash):**
  ```bash
  cd frontend
  VITE_ENABLE_MOCK=true npm run dev
  ```

- **Truy cập:** `http://localhost:5173`
- **Phòng mẫu có sẵn:** nhập mã **`DIDAU8`** (hoặc tự tạo phòng mới).
- **Mẹo test nhanh ca hoà phiếu OMP trong chế độ Mock:** mở DevTools (`F12`) → tab **Console** → chạy:
  ```js
  localStorage.setItem('didau.mock.tieDemo', '1'); location.reload();
  ```
- **Dừng server:** nhấn `Ctrl + C`.

---

### Cách 2: Frontend chạy local + nối Backend thật đang deploy trên Render

> **Phù hợp khi:** muốn test dữ liệu & API thật từ backend đã deploy sẵn mà **không cần cài Docker hay PostgreSQL** trên máy.
>
> **Lưu ý:**
> - Backend Render chạy gói miễn phí nên nếu đang ngủ, lần gọi đầu tiên sẽ mất **~1 phút** để tự thức dậy (web sẽ tự hiện màn hình chờ).
> - Dùng `VITE_BACKEND_URL` giúp Vite proxy toàn bộ `/api` để tránh lỗi CORS. Riêng kết nối WebSocket có thể bị từ chối nếu cấu hình `ALLOWED_ORIGINS` trên Render chỉ cho phép domain Vercel — muốn test realtime nhiều tab đầy đủ, hãy dùng **Cách 3**.

- **Windows (PowerShell):**
  ```powershell
  cd frontend
  $env:VITE_ENABLE_MOCK="false"
  $env:VITE_BACKEND_URL="https://didau-backend.onrender.com"
  npm run dev
  ```
- **Linux (Bash):**
  ```bash
  cd frontend
  VITE_ENABLE_MOCK=false VITE_BACKEND_URL=https://didau-backend.onrender.com npm run dev
  ```

- **Truy cập:** `http://localhost:5173`
- **Dừng server:** nhấn `Ctrl + C`.

---

### Cách 3: Chạy Full-stack thật hoàn toàn trên Localhost (PostgreSQL + FastAPI + Vite)

Chạy đầy đủ cả **Database PostgreSQL thật (`:5432`)**, **Backend FastAPI + WebSocket (`:8000`)** và **Frontend (`:5173`)**. Hỗ trợ mở nhiều tab / nhiều thiết bị cùng LAN để test realtime.

#### Nhánh 3A — Chạy 1 lệnh bằng Docker Compose *(khuyên dùng nhất)*

Tự động dựng PostgreSQL 15, chạy migration Alembic, nạp ~70.000 quán (HCM & HN) vào DB, tạo phòng mẫu `DIDAU8`, bật Backend và Frontend.

- **Windows (PowerShell)** *(nhớ mở app **Docker Desktop** chạy sẵn trước)*:
  ```powershell
  # Chạy từ thư mục gốc Hangout-planner
  $env:SEED_DEMO="true"
  docker compose up --build
  ```
- **Linux (Bash):**
  ```bash
  # Chạy từ thư mục gốc Hangout-planner
  SEED_DEMO=true docker compose up --build
  ```

- **Truy cập:**
  - Web Frontend: `http://localhost:5173`
  - Tài liệu API (Swagger): `http://localhost:8000/docs`
  - Phòng mẫu: **`DIDAU8`**
- **Dừng và dọn container:**
  - Nhấn `Ctrl + C`, sau đó chạy (giống nhau trên cả Windows & Linux):
    ```bash
    docker compose down
    ```
  - Nếu muốn **xoá sạch dữ liệu PostgreSQL** để tạo lại từ đầu:
    ```bash
    docker compose down -v
    ```

---

#### Nhánh 3B — Chạy tay Backend + Frontend *(tiện khi sửa code Python / chạy test)*

Dùng Docker chỉ để bật riêng PostgreSQL (`:5432`), còn Backend chạy bằng Poetry và Frontend chạy bằng `npm` để có auto-reload nhanh.

**Bước 1 — Bật PostgreSQL (chạy ở thư mục gốc `Hangout-planner`, giống nhau trên Windows & Linux):**
```bash
docker compose up -d db
```
*(Nếu bạn tự cài PostgreSQL trực tiếp trên máy không qua Docker, hãy tạo database tên `didau` với user/password là `postgres`/`postgres` ở cổng `5432` rồi bỏ qua bước 1.)*

**Bước 2 — Terminal 1: Chạy Backend (`:8000`):**

- **Windows (PowerShell)** *(không chạy file `.sh`, chạy trực tiếp các lệnh Python)*:
  ```powershell
  cd backend
  poetry run alembic upgrade head
  poetry run python -m app.repositories.poi_repo
  poetry run python -m app.core.seed
  poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
  ```
  *(Từ lần chạy thứ 2 trở đi, khi DB đã nạp sẵn, bạn chỉ cần chạy dòng cuối `poetry run uvicorn ...`.)*

- **Linux (Bash):**
  ```bash
  cd backend
  SEED_DEMO=true poetry run ./start.sh
  ```
  *(Hoặc từ lần thứ 2 trở đi muốn có auto-reload khi sửa code: `poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`.)*

**Bước 3 — Terminal 2: Chạy Frontend (`:5173`):**

- **Windows (PowerShell):**
  ```powershell
  cd frontend
  $env:VITE_ENABLE_MOCK="false"
  $env:VITE_BACKEND_URL="http://localhost:8000"
  npm run dev
  ```
- **Linux (Bash):**
  ```bash
  cd frontend
  VITE_ENABLE_MOCK=false npm run dev
  ```

**Bước 4 *(tuỳ chọn)* — Tạo phòng demo có sẵn ca hoà phiếu OMP để thuyết trình:**
*(Chạy khi Backend ở `:8000` đang bật — giống nhau trên Windows & Linux)*
```bash
cd backend
poetry run python ../scripts/seed_demo_genz.py http://localhost:8000 --frontend http://localhost:5173
```

- **Truy cập:** `http://localhost:5173` (Swagger API: `http://localhost:8000/docs`).
- **Dừng server:** nhấn `Ctrl + C` ở cả 2 terminal; tắt DB bằng `docker compose stop db`.

---

## Phần 3. Chạy kiểm thử (Test & Lint)

*(Giống nhau trên Windows PowerShell & Linux Bash)*

- **Kiểm tra Frontend:**
  ```bash
  cd frontend
  npm run lint
  npm test
  npm run build
  ```
- **Kiểm tra Backend** *(cần bật DB trước bằng `docker compose up -d db` cho các test tích hợp)*:
  ```bash
  cd backend
  poetry run ruff check .
  poetry run pytest
  ```

---

## Phần 4. Lỗi thường gặp & cách xử lý nhanh

| Lỗi | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| PowerShell báo `The term 'VITE_ENABLE_MOCK=true' is not recognized` | Copy nhầm lệnh Linux vào Windows PowerShell | Dùng cú pháp PowerShell: `$env:VITE_ENABLE_MOCK="true"` ở dòng riêng trước `npm run dev`. |
| Windows không chạy được `./start.sh` | PowerShell không chạy bash script trực tiếp | Làm theo hướng dẫn **Windows (PowerShell)** ở Nhánh 3B (gọi thẳng `poetry run alembic ...` và `poetry run uvicorn ...`). |
| `Cannot connect to the Docker daemon` | **Windows:** chưa mở Docker Desktop.<br>**Linux:** dịch vụ chưa chạy hoặc user chưa vào nhóm `docker`. | **Windows:** mở Docker Desktop.<br>**Linux:** chạy `sudo systemctl start docker` và `newgrp docker` (hoặc đăng xuất/đăng nhập lại). |
| `port is already allocated` ở cổng `5432` / `5173` / `8000` | Đang có tiến trình hoặc PostgreSQL khác chiếm cổng đó | Tắt server/PostgreSQL cũ hoặc dừng container cũ bằng `docker compose down`. |
| Biến môi trường PowerShell bị "dính" sang lần chạy khác | Đặt `$env:...` trong cùng 1 cửa sổ PowerShell sẽ giữ tới khi đóng cửa sổ | Mở cửa sổ PowerShell mới hoặc xoá biến: `Remove-Item Env:VITE_ENABLE_MOCK`, `Remove-Item Env:VITE_BACKEND_URL`. |
