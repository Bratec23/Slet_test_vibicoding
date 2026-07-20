def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == "ok"
    assert "version" in body
    assert "time" in body


def test_health_has_service_name(client):
    r = client.get("/health")
    assert r.json()["service"] == "Бит.Serves"
