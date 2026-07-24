from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_event
from app.config import settings
from app.database import get_db
from app.models import Grade, GradeTier, Position, User
from app.routers.auth import get_current_head
from app.security import hash_password


router = APIRouter(prefix="/api/admin", tags=["admin"])

DEFAULT_RESET_PASSWORD = "changeme123"


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
    kpi2_enabled: bool = False
    kpi2_bonus_percent: float = Field(default=5.0, ge=0, le=100)
    kpi2_min_retention_pct: float = Field(default=80.0, ge=0, le=100)
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
    kpi2_enabled: bool = False
    kpi2_bonus_percent: float = 5.0
    kpi2_min_retention_pct: float = 80.0
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
        "kpi2_enabled": bool(g.kpi2_enabled),
        "kpi2_bonus_percent": float(g.kpi2_bonus_percent),
        "kpi2_min_retention_pct": float(g.kpi2_min_retention_pct),
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
        kpi2_enabled=payload.kpi2_enabled,
        kpi2_bonus_percent=payload.kpi2_bonus_percent,
        kpi2_min_retention_pct=payload.kpi2_min_retention_pct,
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
    grade.kpi2_enabled = payload.kpi2_enabled
    grade.kpi2_bonus_percent = payload.kpi2_bonus_percent
    grade.kpi2_min_retention_pct = payload.kpi2_min_retention_pct

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


class ManagedUserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    department_id: int
    department_name: str
    position_id: int
    position_name: str
    grade_id: Optional[str] = None
    grade_name: Optional[str] = None
    created_at: str


def _managed_user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "role": u.role,
        "is_active": bool(u.is_active),
        "department_id": u.department_id,
        "department_name": (u.department.name if u.department else "—"),
        "position_id": u.position_id,
        "position_name": (u.position.name if u.position else "—"),
        "grade_id": u.grade_id,
        "grade_name": (u.grade.name if u.grade else None),
        "created_at": (u.created_at.strftime("%d.%m.%Y %H:%M") if u.created_at else ""),
    }


@router.get("/users", response_model=List[ManagedUserOut])
def list_users(db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    rows = db.scalars(
        select(User)
        .where(User.department_id == head.department_id, User.role == "manager")
        .order_by(User.is_active.desc(), User.full_name)
    ).all()
    return [_managed_user_out(u) for u in rows]


def _get_managed_user(user_id: int, head: User, db: Session) -> User:
    u = db.get(User, user_id)
    if not u or u.department_id != head.department_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден в вашем отделе")
    return u


class ChangeGradeIn(BaseModel):
    grade_id: str = Field(min_length=1, max_length=50)


@router.put("/users/{user_id}/grade", response_model=ManagedUserOut)
def change_user_grade(user_id: int, payload: ChangeGradeIn, request: Request,
                      db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    u = _get_managed_user(user_id, head, db)
    grade = db.get(Grade, payload.grade_id)
    if not grade or not grade.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Грейд не найден или архивирован")
    old_grade = u.grade_id
    u.grade_id = grade.id
    db.commit()
    db.refresh(u)
    log_event(db, request, "change_grade", head.email, success=True, user_id=head.id,
              detail=f"{u.email}: {old_grade} -> {grade.id}")
    return _managed_user_out(u)


class ChangePositionIn(BaseModel):
    position_id: int


@router.put("/users/{user_id}/position", response_model=ManagedUserOut)
def change_user_position(user_id: int, payload: ChangePositionIn, request: Request,
                         db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    u = _get_managed_user(user_id, head, db)
    pos = db.get(Position, payload.position_id)
    if not pos or not pos.is_active or pos.department_id != u.department_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Должность не найдена или не соответствует отделу")
    old_pos = u.position_id
    u.position_id = pos.id
    db.commit()
    db.refresh(u)
    log_event(db, request, "change_position", head.email, success=True, user_id=head.id,
              detail=f"{u.email}: pos_id {old_pos} -> {pos.id}")
    return _managed_user_out(u)


@router.delete("/users/{user_id}", response_model=ManagedUserOut)
def deactivate_user(user_id: int, request: Request,
                    db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    u = _get_managed_user(user_id, head, db)
    if not u.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Сотрудник уже деактивирован")
    u.is_active = False
    db.commit()
    db.refresh(u)
    log_event(db, request, "deactivate_user", head.email, success=True, user_id=head.id, detail=u.email)
    return _managed_user_out(u)


@router.post("/users/{user_id}/restore", response_model=ManagedUserOut)
def restore_user(user_id: int, request: Request,
                 db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    u = _get_managed_user(user_id, head, db)
    if u.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Сотрудник уже активен")
    u.is_active = True
    db.commit()
    db.refresh(u)
    log_event(db, request, "restore_user", head.email, success=True, user_id=head.id, detail=u.email)
    return _managed_user_out(u)


class ResetUserPasswordOut(BaseModel):
    user_id: int
    email: str
    new_password: str


@router.post("/users/{user_id}/reset-password", response_model=ResetUserPasswordOut)
def reset_user_password(user_id: int, request: Request,
                        db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    u = _get_managed_user(user_id, head, db)
    new_password = DEFAULT_RESET_PASSWORD
    u.password_hash = hash_password(new_password)
    db.commit()
    db.refresh(u)
    log_event(db, request, "reset_user_password", head.email, success=True, user_id=head.id, detail=u.email)
    return ResetUserPasswordOut(user_id=u.id, email=u.email, new_password=new_password)
