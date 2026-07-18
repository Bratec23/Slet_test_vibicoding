from sqlalchemy.orm import Session

from app.models import Department, Grade, Position


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
        if mnt:
            db.add(Position(name="Специалист сопровождения", department_id=mnt.id, is_active=True))
        db.flush()

    if not db.query(Grade).first():
        db.add(Grade(
            id="trainee",
            name="Испытательный срок",
            base_salary=45000,
            bonus_percent=4.0,
            service_factor=0.5,
            has_plan=False,
            is_active=True,
        ))
        db.flush()

    db.commit()