from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import get_event_bus
from app.api.v1.router import api_router, register_exception_handlers
from app.api.v1.websocket import router as websocket_router
from app.config import get_settings
from app.core.database import AsyncSessionLocal
from app.domain.patterns.event_bus.handlers import register_websocket_broadcast_handlers
from app.services.conflict_service import register_conflict_evaluation_handlers
from app.services.websocket_manager import get_websocket_manager

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Khởi tạo và đăng ký các background event handlers lúc khởi động ứng dụng."""
    event_bus = get_event_bus()
    ws_manager = get_websocket_manager()

    # Đăng ký handler phát tán tin nhắn WebSocket realtime khi có Domain Event
    register_websocket_broadcast_handlers(event_bus, ws_manager)

    # Đăng ký handler tự động đánh giá xung đột ngầm khi Schedule/Place thay đổi
    register_conflict_evaluation_handlers(
        event_bus=event_bus,
        session_factory=AsyncSessionLocal,
    )

    yield


is_prod = settings.APP_ENV.lower() == "production"

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Backend API cho hệ thống lập kế hoạch đi chơi Đi Đâu",
    lifespan=lifespan,
    docs_url=None if is_prod else "/docs",
    redoc_url=None if is_prod else "/redoc",
    openapi_url=None if is_prod else "/openapi.json",
    debug=False if is_prod else settings.DEBUG,
)

# Cấu hình CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Đăng ký exception handlers định dạng ApiErrorEnvelope
register_exception_handlers(app)

# Gắn các routers
app.include_router(api_router)
app.include_router(websocket_router)


@app.get("/health", tags=["Health"])
def health_check() -> dict[str, str]:
    """Endpoint kiểm tra sức khỏe hệ thống theo đặc tả T-01."""
    return {"status": "ok"}


@app.get("/healthz", tags=["Health"])
async def healthz() -> Any:
    """Endpoint kiểm tra sức khỏe và kết nối cơ sở dữ liệu (SELECT 1). Trả về 200 hoặc 503."""
    from fastapi.responses import JSONResponse
    from sqlalchemy import text

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return JSONResponse(status_code=200, content={"status": "ok"})
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "detail": str(exc)},
        )


@app.get("/", tags=["Root"])
def root() -> dict[str, Any]:
    """Endpoint thông tin gốc."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "ok",
    }


def test_health_check_endpoint() -> None:
    """Test ban đầu đảm bảo endpoint /health trả về status: ok."""
    from fastapi.testclient import TestClient

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_healthz_endpoint() -> None:
    """Test đảm bảo endpoint /healthz trả về status: ok khi DB hoạt động."""
    from fastapi.testclient import TestClient

    client = TestClient(app)
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
