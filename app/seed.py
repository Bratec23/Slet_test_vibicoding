from sqlalchemy.orm import Session

from app.models import Department, Grade, GradeTier, Position


GRADES_SEED = [
    {
        "id": "trainee",
        "name": "Испытательный срок",
        "base_salary": 45000,
        "bonus_percent": 4.0,
        "service_factor": 0.5,
        "has_plan": False,
        "plan_margin": None,
        "sort_order": 1,
        "kpi2_enabled": False,
        "tiers": [],
    },
    {
        "id": "mgr1",
        "name": "Менеджер по продажам, 1 грейд",
        "base_salary": 37500,
        "bonus_percent": 0.0,
        "service_factor": 0.5,
        "has_plan": True,
        "plan_margin": 230000,
        "kpi2_enabled": True,
        "sort_order": 2,
        "tiers": [(0, 0), (90, 4), (101, 5), (130, 6), (150, 7), (200, 9)],
    },
    {
        "id": "mgr2",
        "name": "Менеджер по продажам, 2 грейд",
        "base_salary": 37500,
        "bonus_percent": 0.0,
        "service_factor": 0.5,
        "has_plan": True,
        "plan_margin": 300000,
        "kpi2_enabled": True,
        "sort_order": 3,
        "tiers": [(0, 0), (90, 5), (101, 6), (130, 7), (150, 8), (200, 10)],
    },
    {
        "id": "lead1",
        "name": "Ведущий менеджер, 1 грейд",
        "base_salary": 42000,
        "bonus_percent": 0.0,
        "service_factor": 0.5,
        "has_plan": True,
        "plan_margin": 370000,
        "kpi2_enabled": True,
        "sort_order": 4,
        "tiers": [(0, 0), (90, 3), (101, 6), (130, 10), (150, 12), (200, 14)],
    },
    {
        "id": "lead2",
        "name": "Ведущий менеджер, 2 грейд",
        "base_salary": 50000,
        "bonus_percent": 0.0,
        "service_factor": 0.5,
        "has_plan": True,
        "plan_margin": 420000,
        "kpi2_enabled": True,
        "sort_order": 5,
        "tiers": [(0, 0), (90, 3), (101, 5), (130, 10), (150, 12), (200, 14)],
    },
]


def seed(db: Session) -> None:
    if not db.query(Department).first():
        dev = Department(code="dev_art", name="Отдел развитие АРТ", is_active=True)
        mnt = Department(code="maintenance", name="Отдел Сопровождение", is_active=True)
        db.add_all([dev, mnt])
        db.flush()

    if not db.query(Position).first():
        dev = db.query(Department).filter(Department.code == "dev_art").first()
        mnt = db.query(Department).filter(Department.code == "maintenance").first()
        if dev:
            db.add(Position(name="Менеджер отдела развитие АРТ", department_id=dev.id, is_active=True))
            db.add(Position(name="Руководитель отдела развитие АРТ", department_id=dev.id, is_active=True))
        if mnt:
            db.add(Position(name="Специалист сопровождения", department_id=mnt.id, is_active=True))
        db.flush()

    if not db.query(Grade).first():
        for g in GRADES_SEED:
            tiers_data = g.get("tiers", [])
            grade_data = {k: v for k, v in g.items() if k != "tiers"}
            grade = Grade(**grade_data, is_active=True)
            db.add(grade)
            db.flush()
            for min_pct, bonus_pct in tiers_data:
                db.add(GradeTier(grade_id=grade.id, min_pct=min_pct, bonus_percent=bonus_pct))
        db.flush()
    else:
        for g in GRADES_SEED:
            existing = db.get(Grade, g["id"])
            if existing:
                existing.sort_order = g["sort_order"]
        db.flush()

    db.commit()