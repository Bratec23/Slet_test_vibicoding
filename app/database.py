import os

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import Base  # noqa: F401
from app.seed import seed


engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _migrate(db) -> None:
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    insp = inspect(engine)
    if not insp.has_table("grades"):
        return
    cols = {c["name"] for c in insp.get_columns("grades")}
    if "sort_order" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE grades ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"))


def init_db() -> None:
    db_path = settings.DATABASE_URL.replace("sqlite:///./", "")
    db_dir = os.path.dirname(db_path)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        _migrate(db)
        seed(db)
    finally:
        db.close()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()