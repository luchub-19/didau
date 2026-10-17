from fastapi import APIRouter, FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.v1.conflicts import router as conflicts_router
from app.api.v1.decisions import router as decisions_router
from app.api.v1.members import router as members_router
from app.api.v1.places import router as places_router
from app.api.v1.pois import router as pois_router
from app.api.v1.reviews import router as reviews_router
from app.api.v1.rooms import router as rooms_router
from app.api.v1.schedule import router as schedule_router
from app.api.v1.votes import router as votes_router
from app.core.exceptions import AppException

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(rooms_router)
api_router.include_router(members_router)
api_router.include_router(places_router)
api_router.include_router(votes_router)
api_router.include_router(schedule_router)
api_router.include_router(conflicts_router)
api_router.include_router(pois_router)
api_router.include_router(decisions_router)
api_router.include_router(reviews_router)


def register_exception_handlers(app: FastAPI) -> None:
    """Đăng ký error handler định dạng ApiErrorEnvelope thống nhất theo CONTRACTS.md."""

    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.to_dict(),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Dữ liệu đầu vào không hợp lệ.",
                    "details": {"errors": exc.errors()},
                }
            },
        )
