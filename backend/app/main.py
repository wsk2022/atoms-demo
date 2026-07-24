"""SparkForge 应用入口。

启动：uvicorn app.main:app --reload --port 8000
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app import config
from app.database import init_db
from app.routers import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

app = FastAPI(title=config.settings.APP_NAME, version=config.settings.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
async def _startup():
    config.ensure_dirs()
    await init_db()


@app.get("/api/health")
def health():
    return {"ok": True, "app": config.settings.APP_NAME,
            "version": config.settings.APP_VERSION}


# 前端静态文件（生产环境构建后放 ../frontend/out）
_frontend_out = Path(__file__).resolve().parent.parent.parent / "frontend" / "out"
if _frontend_out.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_out), html=True), name="frontend")
