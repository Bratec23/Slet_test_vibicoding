import re


def _get_reset_code_from_log(caplog):
    for record in caplog.records:
        m = re.search(r"code=(\d{6})", record.getMessage())
        if m:
            return m.group(1)
    return None


def test_forgot_password_existing_user(client, registered_manager, capsys):
    r = client.post("/api/auth/forgot-password", json={"email": "manager@test.com"})
    assert r.status_code == 200
    assert r.json()["sent"] is True
    assert r.json()["ttl_minutes"] == 15
    out = capsys.readouterr().out
    m = re.search(r"code=(\d{6})", out)
    assert m, f"code not found in stdout: {out}"


def test_forgot_password_nonexistent_user(client):
    r = client.post("/api/auth/forgot-password", json={"email": "nobody@test.com"})
    assert r.status_code == 404


def test_reset_password_full_flow(client, registered_manager, capsys):
    email = "manager@test.com"
    client.post("/api/auth/forgot-password", json={"email": email})
    out = capsys.readouterr().out
    m = re.search(r"code=(\d{6})", out)
    assert m
    code = m.group(1)

    r = client.post("/api/auth/verify-reset-code", json={"email": email, "code": code})
    assert r.status_code == 200
    assert r.json()["verified"] is True

    r = client.post("/api/auth/reset-password", json={
        "email": email,
        "code": code,
        "new_password": "newpass123",
    })
    assert r.status_code == 200

    r = client.post("/api/auth/login", json={"email": email, "password": "newpass123"})
    assert r.status_code == 200

    r = client.post("/api/auth/login", json={"email": email, "password": "pass123"})
    assert r.status_code == 401


def test_verify_wrong_code(client, registered_manager, capsys):
    client.post("/api/auth/forgot-password", json={"email": "manager@test.com"})
    capsys.readouterr()
    r = client.post("/api/auth/verify-reset-code", json={
        "email": "manager@test.com",
        "code": "000000",
    })
    assert r.status_code == 400


def test_reuse_reset_code_fails(client, registered_manager, capsys):
    email = "manager@test.com"
    client.post("/api/auth/forgot-password", json={"email": email})
    out = capsys.readouterr().out
    code = re.search(r"code=(\d{6})", out).group(1)

    r = client.post("/api/auth/reset-password", json={
        "email": email, "code": code, "new_password": "newpass123",
    })
    assert r.status_code == 200

    r2 = client.post("/api/auth/reset-password", json={
        "email": email, "code": code, "new_password": "another1",
    })
    assert r2.status_code == 400


def test_reset_weak_password_rejected(client, registered_manager, capsys):
    email = "manager@test.com"
    client.post("/api/auth/forgot-password", json={"email": email})
    out = capsys.readouterr().out
    code = re.search(r"code=(\d{6})", out).group(1)

    r = client.post("/api/auth/reset-password", json={
        "email": email, "code": code, "new_password": "12345",
    })
    assert r.status_code == 422
