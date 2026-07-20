def test_register_manager_success(client):
    r = client.post("/api/auth/register", json={
        "full_name": "Иван Иванов",
        "email": "ivan@test.com",
        "password": "pass123",
        "department_id": 1,
        "position_id": 1,
        "grade_id": "trainee",
        "role": "manager",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["access_token"]
    assert data["user"]["email"] == "ivan@test.com"
    assert data["user"]["role"] == "manager"
    assert data["user"]["grade"]["id"] == "trainee"


def test_register_short_password_rejected(client):
    r = client.post("/api/auth/register", json={
        "full_name": "X",
        "email": "x@test.com",
        "password": "12345",
        "department_id": 1,
        "position_id": 1,
        "grade_id": "trainee",
        "role": "manager",
    })
    assert r.status_code == 422


def test_register_password_without_letter_rejected(client):
    r = client.post("/api/auth/register", json={
        "full_name": "Ivan",
        "email": "x@test.com",
        "password": "123456",
        "department_id": 1,
        "position_id": 1,
        "grade_id": "trainee",
        "role": "manager",
    })
    assert r.status_code == 422


def test_register_password_without_digit_rejected(client):
    r = client.post("/api/auth/register", json={
        "full_name": "Ivan",
        "email": "x@test.com",
        "password": "abcdef",
        "department_id": 1,
        "position_id": 1,
        "grade_id": "trainee",
        "role": "manager",
    })
    assert r.status_code == 422


def test_register_empty_full_name_rejected(client):
    r = client.post("/api/auth/register", json={
        "full_name": "",
        "email": "x@test.com",
        "password": "pass123",
        "department_id": 1,
        "position_id": 1,
        "grade_id": "trainee",
        "role": "manager",
    })
    assert r.status_code == 422


def test_register_duplicate_email(client):
    payload = {
        "full_name": "Ivan",
        "email": "dup@test.com",
        "password": "pass123",
        "department_id": 1,
        "position_id": 1,
        "grade_id": "trainee",
        "role": "manager",
    }
    r1 = client.post("/api/auth/register", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/api/auth/register", json=payload)
    assert r2.status_code == 409


def test_register_head_without_head_password(client):
    r = client.post("/api/auth/register", json={
        "full_name": "Head",
        "email": "head@test.com",
        "password": "pass123",
        "department_id": 1,
        "position_id": 2,
        "role": "head",
    })
    assert r.status_code == 400


def test_register_head_with_correct_password(client):
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
    assert r.json()["user"]["role"] == "head"


def test_login_success(client, registered_manager):
    r = client.post("/api/auth/login", json={
        "email": "manager@test.com",
        "password": "pass123",
    })
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_login_wrong_password(client, registered_manager):
    r = client.post("/api/auth/login", json={
        "email": "manager@test.com",
        "password": "wrong123",
    })
    assert r.status_code == 401


def test_login_nonexistent_user(client):
    r = client.post("/api/auth/login", json={
        "email": "nobody@test.com",
        "password": "pass123",
    })
    assert r.status_code == 401


def test_me_without_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_me_with_token(client, registered_manager):
    token = registered_manager["access_token"]
    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "manager@test.com"
