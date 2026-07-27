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

    if insp.has_table("users"):
        user_cols = {c["name"] for c in insp.get_columns("users")}
        if "is_active" not in user_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"))

    if insp.has_table("grades"):
        grade_cols = {c["name"] for c in insp.get_columns("grades")}
        migrations = [
            ("kpi2_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
            ("kpi2_bonus_percent", "NUMERIC(5,2) NOT NULL DEFAULT 5.0"),
            ("kpi2_min_retention_pct", "NUMERIC(5,2) NOT NULL DEFAULT 80.0"),
        ]
        for col_name, col_def in migrations:
            if col_name not in grade_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE grades ADD COLUMN {col_name} {col_def}"))

    if insp.has_table("payroll_records"):
        pr_cols = {c["name"] for c in insp.get_columns("payroll_records")}
        pr_migrations = [
            ("kpi2_revenue", "NUMERIC(14,2) NOT NULL DEFAULT 0"),
            ("kpi2_retention_pct", "NUMERIC(5,2) NOT NULL DEFAULT 0"),
            ("kpi2_bonus_amount", "NUMERIC(14,2) NOT NULL DEFAULT 0"),
            ("kpi2_paid", "BOOLEAN NOT NULL DEFAULT 0"),
        ]
        for col_name, col_def in pr_migrations:
            if col_name not in pr_cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE payroll_records ADD COLUMN {col_name} {col_def}"))


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