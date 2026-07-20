def test_grades_sorted_by_sort_order(client):
    r = client.get("/api/grades")
    assert r.status_code == 200
    grades = r.json()
    assert len(grades) == 5
    orders = [g["sort_order"] for g in grades]
    assert orders == sorted(orders)
    assert grades[0]["id"] == "trainee"
    assert grades[0]["sort_order"] == 1
    assert grades[-1]["id"] == "lead2"
    assert grades[-1]["sort_order"] == 5


def test_grades_have_tiers(client):
    r = client.get("/api/grades")
    for g in r.json():
        if g["has_plan"]:
            assert len(g["tiers"]) > 0
        else:
            assert g["id"] == "trainee"


def test_departments_list(client):
    r = client.get("/api/departments")
    assert r.status_code == 200
    codes = [d["code"] for d in r.json()]
    assert "dev_art" in codes
    assert "maintenance" in codes


def test_positions_by_department(client):
    r = client.get("/api/positions?department_id=1")
    assert r.status_code == 200
    assert len(r.json()) >= 1
    for p in r.json():
        assert p["department_id"] == 1
