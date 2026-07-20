import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.main import app
from app.models import Base
import app.rate_limit as rate_limit_module


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    rate_limit_module._buckets.clear()
    yield
    rate_limit_module._buckets.clear()


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    from app.seed import seed
    db = TestingSession()
    try:
        seed(db)
    finally:
        db.close()

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def registered_manager(client):
    r = client.post("/api/auth/register", json={
        "full_name": "Test Manager",
        "email": "manager@test.com",
        "password": "pass123",
        "department_id": 1,
        "position_id": 1,
        "grade_id": "trainee",
        "role": "manager",
    })
    assert r.status_code == 201, r.text
    return r.json()
