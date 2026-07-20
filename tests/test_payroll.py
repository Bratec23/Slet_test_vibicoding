def test_calculate_payroll_success(client, registered_manager):
    token = registered_manager["access_token"]
    r = client.post("/api/payroll/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "period": "2026-07",
            "worked_days": 22,
            "working_days": 22,
            "service_margin": 150000,
            "goods_margin": 80000,
            "tax_rate": 13,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["net_pay"] > 0
    assert data["gross_pay"] > 0
    assert data["grade_id"] == "trainee"
    assert data["period"] == "2026-07"


def test_calculate_payroll_worked_more_than_working(client, registered_manager):
    token = registered_manager["access_token"]
    r = client.post("/api/payroll/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "period": "2026-07",
            "worked_days": 25,
            "working_days": 22,
            "service_margin": 100000,
            "goods_margin": 50000,
            "tax_rate": 13,
        },
    )
    assert r.status_code == 400


def test_payroll_history(client, registered_manager):
    token = registered_manager["access_token"]
    client.post("/api/payroll/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "2026-07", "worked_days": 22, "working_days": 22,
              "service_margin": 100000, "goods_margin": 50000, "tax_rate": 13},
    )
    r = client.get("/api/payroll/history", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) == 1


def test_payroll_summary(client, registered_manager):
    token = registered_manager["access_token"]
    client.post("/api/payroll/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "2026-07", "worked_days": 22, "working_days": 22,
              "service_margin": 100000, "goods_margin": 50000, "tax_rate": 13},
    )
    r = client.get("/api/payroll/summary", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["period"] == "2026-07"


def test_cost_price_save_and_get(client, registered_manager):
    token = registered_manager["access_token"]
    r = client.post("/api/payroll/cost-price",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "2026-07", "cost_price": 75000},
    )
    assert r.status_code == 200
    assert r.json()["cost_price"] == 75000

    r2 = client.get("/api/payroll/cost-price?period=2026-07",
        headers={"Authorization": f"Bearer {token}"})
    assert r2.status_code == 200
    assert r2.json()[0]["cost_price"] == 75000


def test_cost_price_update_same_period(client, registered_manager):
    token = registered_manager["access_token"]
    client.post("/api/payroll/cost-price",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "2026-07", "cost_price": 50000})
    r = client.post("/api/payroll/cost-price",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "2026-07", "cost_price": 90000})
    assert r.status_code == 200
    assert r.json()["cost_price"] == 90000

    r2 = client.get("/api/payroll/cost-price?period=2026-07",
        headers={"Authorization": f"Bearer {token}"})
    assert len(r2.json()) == 1
    assert r2.json()[0]["cost_price"] == 90000


def test_export_xlsx(client, registered_manager):
    token = registered_manager["access_token"]
    calc = client.post("/api/payroll/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "2026-07", "worked_days": 22, "working_days": 22,
              "service_margin": 100000, "goods_margin": 50000, "tax_rate": 13})
    rid = calc.json()["id"]
    r = client.get(f"/api/payroll/records/{rid}/export",
        headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.content[:2] == b"PK"
    assert "spreadsheet" in r.headers["content-type"]
