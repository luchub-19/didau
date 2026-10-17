from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.config import Settings


def test_cors_origins_strips_trailing_slash_and_spaces():
    s = Settings(ALLOWED_ORIGINS=" https://a.vercel.app/ , http://localhost:5173,, ")
    assert s.cors_origins == ["https://a.vercel.app", "http://localhost:5173"]


def test_preflight_ok_when_env_has_trailing_slash():
    s = Settings(ALLOWED_ORIGINS="https://a.vercel.app/")
    app = FastAPI()
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_methods=["*"])
    res = TestClient(app).options(
        "/x",
        headers={"Origin": "https://a.vercel.app", "Access-Control-Request-Method": "POST"},
    )
    assert res.status_code == 200
    assert res.headers["access-control-allow-origin"] == "https://a.vercel.app"
