def test_audit_login_success(client, registered_manager):
    r = client.post("/api/auth/login", json={
        "email": "manager@test.com",
        "password": "pass123",
    })
    assert r.status_code == 200
    token = r.json()["access_token"]

    r2 = client.get("/api/auth/audit/me", headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    events = r2.json()
    event_types = [e["event_type"] for e in events]
    assert "register" in event_types
    assert "login" in event_types
    for e in events:
        if e["event_type"] == "login":
            assert e["success"] is True


def test_audit_login_failure(client, registered_manager):
    r = client.post("/api/auth/login", json={
        "email": "manager@test.com",
        "password": "wrongpass",
    })
    assert r.status_code == 401

    r2 = client.post("/api/auth/login", json={
        "email": "manager@test.com",
        "password": "pass123",
    })
    token = r2.json()["access_token"]
    r3 = client.get("/api/auth/audit/me", headers={"Authorization": f"Bearer {token}"})
    events = r3.json()
    failed = [e for e in events if e["event_type"] == "login" and not e["success"]]
    assert len(failed) >= 1
    assert failed[0]["detail"] == "bad password"


def test_audit_department_requires_head(client, registered_manager):
    token = registered_manager["access_token"]
    r = client.get("/api/auth/audit/department", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_audit_department_visible_to_head(client, registered_manager):
    r = client.post("/api/auth/register", json={
        "full_name": "Head",
        "email": "head@test.com",
        "password": "pass123",
        "department_id": 1,
        "position_id": 2,
        "role": "head",
        "head_register_password": "123456789",
    })
    assert r.status_code == 201
    head_token = r.json()["access_token"]
    r2 = client.get("/api/auth/audit/department", headers={"Authorization": f"Bearer {head_token}"})
    assert r2.status_code == 200
    assert isinstance(r2.json(), list)
