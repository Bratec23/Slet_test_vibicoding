from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Grade, GradeTier, User
from app.routers.auth import get_current_head


router = APIRouter(prefix="/api/admin", tags=["admin"])


class TierIn(BaseModel):
    min_pct: float = Field(ge=0, le=1000)
    bonus_percent: float = Field(ge=0, le=100)


class GradeIn(BaseModel):
    id: Optional[str] = Field(default=None, max_length=50)
    name: str = Field(min_length=2, max_length=255)
    base_salary: float = Field(ge=0)
    bonus_percent: float = Field(ge=0, le=100)
    service_factor: float = Field(ge=0, le=10)
    has_plan: bool = False
    plan_margin: Optional[float] = Field(default=None, ge=0)
    sort_order: int = Field(default=0, ge=0, le=999)
    tiers: List[TierIn] = []


class TierOut(BaseModel):
    id: int
    min_pct: float
    bonus_percent: float


class GradeOut(BaseModel):
    id: str
    name: str
    base_salary: float
    bonus_percent: float
    service_factor: float
    has_plan: bool
    plan_margin: Optional[float] = None
    sort_order: int
    is_active: bool
    tiers: List[TierOut] = []


def _grade_out(g: Grade, db: Session) -> dict:
    tiers = db.scalars(
        select(GradeTier).where(GradeTier.grade_id == g.id).order_by(GradeTier.min_pct)
    ).all()
    return {
        "id": g.id,
        "name": g.name,
        "base_salary": float(g.base_salary),
        "bonus_percent": float(g.bonus_percent),
        "service_factor": float(g.service_factor),
        "has_plan": bool(g.has_plan),
        "plan_margin": (float(g.plan_margin) if g.plan_margin is not None else None),
        "sort_order": int(g.sort_order or 0),
        "is_active": bool(g.is_active),
        "tiers": [{"id": t.id, "min_pct": float(t.min_pct), "bonus_percent": float(t.bonus_percent)} for t in tiers],
    }


@router.get("/grades", response_model=List[GradeOut])
def list_grades_admin(db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    rows = db.scalars(select(Grade).order_by(Grade.sort_order, Grade.name)).all()
    return [_grade_out(g, db) for g in rows]


@router.post("/grades", response_model=GradeOut, status_code=status.HTTP_201_CREATED)
def create_grade(payload: GradeIn, db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    gid = (payload.id or "").strip().lower()
    if not gid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Идентификатор грейда обязателен")
    if db.get(Grade, gid):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Грейд с таким идентификатором уже существует")
    if payload.has_plan and (payload.plan_margin is None or payload.plan_margin <= 0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="При has_plan=true укажите plan_margin > 0")
    if not payload.has_plan and payload.tiers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tiers имеют смысл только при has_plan=true")

    grade = Grade(
        id=gid,
        name=payload.name.strip(),
        base_salary=payload.base_salary,
        bonus_percent=payload.bonus_percent,
        service_factor=payload.service_factor,
        has_plan=payload.has_plan,
        plan_margin=payload.plan_margin if payload.has_plan else None,
        sort_order=payload.sort_order,
        is_active=True,
    )
    db.add(grade)
    db.flush()
    for t in payload.tiers:
        db.add(GradeTier(grade_id=grade.id, min_pct=t.min_pct, bonus_percent=t.bonus_percent))
    db.commit()
    db.refresh(grade)
    return _grade_out(grade, db)


@router.put("/grades/{grade_id}", response_model=GradeOut)
def update_grade(grade_id: str, payload: GradeIn, db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    grade = db.get(Grade, grade_id)
    if not grade:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Грейд не найден")
    if payload.has_plan and (payload.plan_margin is None or payload.plan_margin <= 0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="При has_plan=true укажите plan_margin > 0")
    if not payload.has_plan and payload.tiers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tiers имеют смысл только при has_plan=true")

    grade.name = payload.name.strip()
    grade.base_salary = payload.base_salary
    grade.bonus_percent = payload.bonus_percent
    grade.service_factor = payload.service_factor
    grade.has_plan = payload.has_plan
    grade.plan_margin = payload.plan_margin if payload.has_plan else None
    grade.sort_order = payload.sort_order

    db.query(GradeTier).filter(GradeTier.grade_id == grade.id).delete()
    for t in payload.tiers:
        db.add(GradeTier(grade_id=grade.id, min_pct=t.min_pct, bonus_percent=t.bonus_percent))
    db.commit()
    db.refresh(grade)
    return _grade_out(grade, db)


@router.delete("/grades/{grade_id}", response_model=GradeOut)
def archive_grade(grade_id: str, db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    grade = db.get(Grade, grade_id)
    if not grade:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Грейд не найден")
    if not grade.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Грейд уже архивирован")
    users_count = db.scalars(select(User).where(User.grade_id == grade_id)).all()
    if users_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Нельзя архивировать: у грейда {len(users_count)} активных пользователей",
        )
    grade.is_active = False
    db.commit()
    db.refresh(grade)
    return _grade_out(grade, db)


@router.post("/grades/{grade_id}/restore", response_model=GradeOut)
def restore_grade(grade_id: str, db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    grade = db.get(Grade, grade_id)
    if not grade:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Грейд не найден")
    if grade.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Грейд уже активен")
    grade.is_active = True
    db.commit()
    db.refresh(grade)
    return _grade_out(grade, db)
