from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database import engine, init_db
from app.routers import admin, auth, catalog, head, payroll


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.APP_NAME, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["system"])
def health():
    status = "ok"
    db_ok = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
        status = "degraded"
    return {
        "status": status,
        "service": settings.APP_NAME,
        "version": "0.1.0",
        "time": datetime.now(timezone.utc).isoformat(),
        "checks": {"database": "ok" if db_ok else "fail"},
    }


app.include_router(catalog.router)
app.include_router(auth.router)
app.include_router(payroll.router)
app.include_router(head.router)
app.include_router(admin.router)

app.mount("/", StaticFiles(directory="static", html=True), name="static")