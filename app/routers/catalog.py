from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Department, Grade, Position


router = APIRouter(prefix="/api", tags=["catalog"])


class DepartmentOut(BaseModel):
    id: int
    code: str
    name: str
    is_active: bool


class PositionOut(BaseModel):
    id: int
    name: str
    department_id: int
    is_active: bool


class GradeOut(BaseModel):
    id: str
    name: str
    base_salary: float
    bonus_percent: float
    service_factor: float
    has_plan: bool
    is_active: bool


@router.get("/departments", response_model=List[DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    rows = db.scalars(select(Department).where(Department.is_active.is_(True)).order_by(Department.name)).all()
    return rows


@router.get("/positions", response_model=List[PositionOut])
def list_positions(department_id: Optional[int] = Query(default=None), db: Session = Depends(get_db)):
    stmt = select(Position).where(Position.is_active.is_(True))
    if department_id is not None:
        stmt = stmt.where(Position.department_id == department_id)
    stmt = stmt.order_by(Position.name)
    return db.scalars(stmt).all()


@router.get("/grades", response_model=List[GradeOut])
def list_grades(db: Session = Depends(get_db)):
    rows = db.scalars(select(Grade).where(Grade.is_active.is_(True)).order_by(Grade.name)).all()
    return rows