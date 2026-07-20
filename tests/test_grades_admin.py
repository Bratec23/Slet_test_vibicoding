def _register_head(client):
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
    return r.json()["access_token"]


def test_admin_grades_requires_head(client, registered_manager):
    token = registered_manager["access_token"]
    r = client.get("/api/admin/grades", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403


def test_admin_grades_list(client):
    token = _register_head(client)
    r = client.get("/api/admin/grades", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    grades = r.json()
    assert len(grades) == 5
    for g in grades:
        assert "id" in g and "name" in g and "tiers" in g


def test_admin_grades_create_success(client):
    token = _register_head(client)
    r = client.post("/api/admin/grades", headers={"Authorization": f"Bearer {token}"}, json={
        "id": "mgr3",
        "name": "Менеджер 3 грейд",
        "base_salary": 40000,
        "bonus_percent": 0,
        "service_factor": 0.5,
        "sort_order": 6,
        "has_plan": True,
        "plan_margin": 280000,
        "tiers": [{"min_pct": 90, "bonus_percent": 5}, {"min_pct": 130, "bonus_percent": 8}],
    })
    assert r.status_code == 201
    data = r.json()
    assert data["id"] == "mgr3"
    assert data["name"] == "Менеджер 3 грейд"
    assert data["sort_order"] == 6
    assert data["has_plan"] is True
    assert data["plan_margin"] == 280000
    assert len(data["tiers"]) == 2


def test_admin_grades_create_duplicate_id(client):
    token = _register_head(client)
    r = client.post("/api/admin/grades", headers={"Authorization": f"Bearer {token}"}, json={
        "id": "trainee",
        "name": "Дубль",
        "base_salary": 40000,
        "bonus_percent": 4,
        "service_factor": 0.5,
        "sort_order": 1,
        "has_plan": False,
        "plan_margin": None,
        "tiers": [],
    })
    assert r.status_code == 409


def test_admin_grades_create_has_plan_without_margin(client):
    token = _register_head(client)
    r = client.post("/api/admin/grades", headers={"Authorization": f"Bearer {token}"}, json={
        "id": "bad1",
        "name": "Bad",
        "base_salary": 40000,
        "bonus_percent": 0,
        "service_factor": 0.5,
        "sort_order": 99,
        "has_plan": True,
        "plan_margin": None,
        "tiers": [],
    })
    assert r.status_code == 400


def test_admin_grades_create_no_plan_with_tiers(client):
    token = _register_head(client)
    r = client.post("/api/admin/grades", headers={"Authorization": f"Bearer {token}"}, json={
        "id": "bad2",
        "name": "Bad",
        "base_salary": 40000,
        "bonus_percent": 4,
        "service_factor": 0.5,
        "sort_order": 99,
        "has_plan": False,
        "plan_margin": None,
        "tiers": [{"min_pct": 90, "bonus_percent": 5}],
    })
    assert r.status_code == 400


def test_admin_grades_update_success(client):
    token = _register_head(client)
    r = client.put("/api/admin/grades/trainee", headers={"Authorization": f"Bearer {token}"}, json={
        "id": "trainee",
        "name": "Испытательный срок (обновлён)",
        "base_salary": 50000,
        "bonus_percent": 5,
        "service_factor": 0.6,
        "sort_order": 1,
        "has_plan": False,
        "plan_margin": None,
        "tiers": [],
    })
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Испытательный срок (обновлён)"
    assert data["base_salary"] == 50000
    assert data["bonus_percent"] == 5


def test_admin_grades_update_with_tiers(client):
    token = _register_head(client)
    r = client.put("/api/admin/grades/mgr1", headers={"Authorization": f"Bearer {token}"}, json={
        "id": "mgr1",
        "name": "Менеджер 1 грейд",
        "base_salary": 38000,
        "bonus_percent": 0,
        "service_factor": 0.5,
        "sort_order": 2,
        "has_plan": True,
        "plan_margin": 250000,
        "tiers": [{"min_pct": 100, "bonus_percent": 10}, {"min_pct": 150, "bonus_percent": 15}],
    })
    assert r.status_code == 200
    data = r.json()
    assert data["plan_margin"] == 250000
    assert len(data["tiers"]) == 2
    assert data["tiers"][0]["min_pct"] == 100
    assert data["tiers"][1]["bonus_percent"] == 15


def test_admin_grades_update_replaces_tiers(client):
    token = _register_head(client)
    r = client.get("/api/admin/grades", headers={"Authorization": f"Bearer {token}"})
    before = next(g for g in r.json() if g["id"] == "mgr1")
    assert len(before["tiers"]) == 6

    r2 = client.put("/api/admin/grades/mgr1", headers={"Authorization": f"Bearer {token}"}, json={
        "id": "mgr1",
        "name": before["name"],
        "base_salary": before["base_salary"],
        "bonus_percent": before["bonus_percent"],
        "service_factor": before["service_factor"],
        "sort_order": before["sort_order"],
        "has_plan": True,
        "plan_margin": before["plan_margin"],
        "tiers": [{"min_pct": 100, "bonus_percent": 7}],
    })
    assert r2.status_code == 200
    after = r2.json()
    assert len(after["tiers"]) == 1
    assert after["tiers"][0]["min_pct"] == 100


def test_admin_grades_archive_and_restore(client):
    token = _register_head(client)
    r = client.delete("/api/admin/grades/trainee", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["is_active"] is False

    r2 = client.get("/api/admin/grades", headers={"Authorization": f"Bearer {token}"})
    trainee = next(g for g in r2.json() if g["id"] == "trainee")
    assert trainee["is_active"] is False

    r3 = client.post("/api/admin/grades/trainee/restore", headers={"Authorization": f"Bearer {token}"})
    assert r3.status_code == 200
    assert r3.json()["is_active"] is True


def test_admin_grades_archive_blocked_if_has_users(client, registered_manager):
    token = _register_head(client)
    r = client.delete("/api/admin/grades/trainee", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 400
    assert "пользователей" in r.json()["detail"]


def test_admin_grades_archive_not_found(client):
    token = _register_head(client)
    r = client.delete("/api/admin/grades/nonexistent", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 404


def test_admin_grades_update_not_found(client):
    token = _register_head(client)
    r = client.put("/api/admin/grades/nonexistent", headers={"Authorization": f"Bearer {token}"}, json={
        "id": "x", "name": "Xx", "base_salary": 0, "bonus_percent": 0,
        "service_factor": 0.5, "sort_order": 1, "has_plan": False, "plan_margin": None, "tiers": [],
    })
    assert r.status_code == 404


def test_admin_grades_public_list_excludes_archived(client):
    token = _register_head(client)
    client.delete("/api/admin/grades/trainee", headers={"Authorization": f"Bearer {token}"})
    r = client.get("/api/grades")
    ids = [g["id"] for g in r.json()]
    assert "trainee" not in ids
    assert "mgr1" in ids
