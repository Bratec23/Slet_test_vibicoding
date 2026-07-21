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


def _register_manager_with_calc_and_cost(client, service=150000, goods=80000, cost_price=50000):
    r = client.post("/api/auth/register", json={
        "full_name": "Test Manager",
        "email": "mgr@test.com",
        "password": "pass123",
        "department_id": 1,
        "position_id": 1,
        "grade_id": "trainee",
        "role": "manager",
    })
    token = r.json()["access_token"]
    client.post("/api/payroll/cost-price",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "2026-07", "cost_price": cost_price})
    client.post("/api/payroll/calculate",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "2026-07", "worked_days": 22, "working_days": 22,
              "service_margin": service, "goods_margin": goods, "tax_rate": 13})
    return token


def test_profitability_formula_uses_margin_net(client):
    _register_manager_with_calc_and_cost(client, service=150000, goods=80000, cost_price=50000)
    token = _register_head(client)

    r = client.get("/api/head/dashboard?period=2026-07", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    d = r.json()

    margin_gross = 150000 + 80000
    margin_net = round(margin_gross * 0.95, 2)
    expected_profit = round(margin_net - 50000, 2)
    expected_rent = round(expected_profit / margin_net * 100, 2)

    kpis = d["kpis"]
    assert kpis["margin"] == margin_gross
    assert kpis["margin_net"] == margin_net
    assert kpis["profit"] == expected_profit
    assert kpis["profitability_pct"] == expected_rent

    for m in d["metrics"]:
        if m["has_record"]:
            assert m["margin_net"] == margin_net
            assert m["profit"] == expected_profit
            assert m["profitability_pct"] == expected_rent
            assert m["cost_price"] == 50000


def test_profitability_formula_zero_cost_price(client):
    _register_manager_with_calc_and_cost(client, service=100000, goods=50000, cost_price=0)
    token = _register_head(client)
    r = client.get("/api/head/dashboard?period=2026-07", headers={"Authorization": f"Bearer {token}"})
    d = r.json()
    margin_net = round(150000 * 0.95, 2)
    assert d["kpis"]["profit"] == margin_net
    assert d["kpis"]["profitability_pct"] == 100.0


def test_profitability_head_override_takes_precedence(client):
    _register_manager_with_calc_and_cost(client, service=150000, goods=80000, cost_price=50000)
    token = _register_head(client)
    r = client.post("/api/head/profitability",
        headers={"Authorization": f"Bearer {token}"},
        json={"period": "2026-07", "items": [{"user_id": 1, "cost_price": 100000}]})
    assert r.status_code == 200
    row = r.json()["rows"][0]
    assert row["cost_price"] == 100000
    margin_net = round(230000 * 0.95, 2)
    assert row["profit"] == round(margin_net - 100000, 2)


def test_fot_margin_pct_uses_margin_net(client):
    _register_manager_with_calc_and_cost(client, service=150000, goods=80000, cost_price=0)
    token = _register_head(client)
    r = client.get("/api/head/dashboard?period=2026-07", headers={"Authorization": f"Bearer {token}"})
    d = r.json()
    margin_net = round(230000 * 0.95, 2)
    for m in d["metrics"]:
        if m["has_record"]:
            expected_fot = round(m["gross"] / margin_net * 100, 2)
            assert m["fot_margin_pct"] == expected_fot


def test_costs_endpoint_has_margin_net_and_profit(client):
    _register_manager_with_calc_and_cost(client, service=150000, goods=80000, cost_price=50000)
    token = _register_head(client)
    r = client.get("/api/head/costs?period=2026-07", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    t = r.json()["totals"]
    assert "margin_net" in t
    assert "profit" in t
    assert t["margin_net"] == round(230000 * 0.95, 2)
    assert t["profit"] == round(t["margin_net"] - 50000, 2)
    assert "profitability_pct" in t


def test_history_has_margin_net(client):
    _register_manager_with_calc_and_cost(client, service=150000, goods=80000, cost_price=50000)
    token = _register_head(client)
    r = client.get("/api/head/history?from=2026-07&to=2026-07", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    monthly = r.json()["monthly"]
    assert len(monthly) == 1
    assert "margin_net" in monthly[0]
    assert monthly[0]["margin_net"] == round(230000 * 0.95, 2)
