from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_event
from app.config import settings
from app.database import get_db
from app.models import Department, Grade, LoginAudit, PasswordResetToken, Position, User
from app.rate_limit import forgot_limiter, login_limiter, register_limiter, reset_limiter
from app.security import (
    create_access_token,
    decode_access_token,
    generate_reset_code,
    hash_password,
    verify_password,
)


router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _validate_password(v: str) -> str:
    if not isinstance(v, str):
        raise ValueError("Пароль обязателен")
    v = v.strip()
    if len(v) < 6:
        raise ValueError("Пароль должен быть не короче 6 символов")
    if len(v) > 128:
        raise ValueError("Пароль слишком длинный (макс. 128 символов)")
    if not any(ch.isalpha() for ch in v):
        raise ValueError("Пароль должен содержать хотя бы одну букву")
    if not any(ch.isdigit() for ch in v):
        raise ValueError("Пароль должен содержать хотя бы одну цифру")
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(default="", max_length=255)
    department_id: int
    position_id: int
    grade_id: Optional[str] = None
    role: Literal["manager", "head"] = "manager"
    head_register_password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def _check_password(cls, v: str) -> str:
        return _validate_password(v)

    @field_validator("full_name")
    @classmethod
    def _check_full_name(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("ФИО обязательно")
        if len(v) < 2:
            raise ValueError("ФИО слишком короткое")
        return v

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return (v or "").strip().lower()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return (v or "").strip().lower()


class DepartmentBrief(BaseModel):
    id: int
    code: str
    name: str


class PositionBrief(BaseModel):
    id: int
    name: str


class TierBrief(BaseModel):
    min_pct: float
    bonus_percent: float


class GradeBrief(BaseModel):
    id: str | None = None
    name: str | None = None
    base_salary: float | None = None
    bonus_percent: float | None = None
    service_factor: float | None = None
    has_plan: bool | None = None
    plan_margin: float | None = None
    tiers: list[TierBrief] = []


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    department: DepartmentBrief
    position: PositionBrief
    grade: Optional[GradeBrief] = None


class UpdateMeRequest(BaseModel):
    full_name: str = Field(default="", max_length=255)
    position_id: int | None = None
    grade_id: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def _user_out(user: User) -> dict:
    grade_obj = user.grade
    grade_dict = None
    if grade_obj:
        grade_dict = {
            "id": grade_obj.id,
            "name": grade_obj.name,
            "base_salary": float(grade_obj.base_salary),
            "bonus_percent": float(grade_obj.bonus_percent),
            "service_factor": float(grade_obj.service_factor),
            "has_plan": bool(grade_obj.has_plan),
            "plan_margin": (float(grade_obj.plan_margin) if grade_obj.plan_margin is not None else None),
            "tiers": [{"min_pct": float(t.min_pct), "bonus_percent": float(t.bonus_percent)} for t in grade_obj.tiers] if grade_obj.tiers else [],
        }
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "department": {
            "id": user.department.id,
            "code": user.department.code,
            "name": user.department.name,
        },
        "position": {
            "id": user.position.id,
            "name": user.position.name,
        },
        "grade": grade_dict,
    }


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен")
    user = db.get(User, uid)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")
    return user


def get_current_head(current: User = Depends(get_current_user)) -> User:
    if current.role != "head":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Требуется роль руководителя")
    return current


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    register_limiter(request)
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        log_event(db, request, "register", payload.email, success=False, detail="email exists")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Пользователь с такой почтой уже зарегистрирован")

    dept = db.get(Department, payload.department_id)
    if not dept or not dept.is_active:
        log_event(db, request, "register", payload.email, success=False, detail="dept not found")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Отдел не найден")

    pos = db.get(Position, payload.position_id)
    if not pos or not pos.is_active or pos.department_id != dept.id:
        log_event(db, request, "register", payload.email, success=False, detail="position mismatch")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Должность не соответствует отделу")

    if payload.role == "head":
        if not payload.head_register_password or payload.head_register_password != settings.HEAD_REGISTER_PASSWORD:
            log_event(db, request, "register", payload.email, success=False, detail="bad head password")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Неверный пароль подтверждения руководителя",
            )
        grade = None
    else:
        if not payload.grade_id:
            log_event(db, request, "register", payload.email, success=False, detail="no grade")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Грейд обязателен для менеджера")
        grade = db.get(Grade, payload.grade_id)
        if not grade or not grade.is_active:
            log_event(db, request, "register", payload.email, success=False, detail="grade not found")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Грейд не найден")

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name.strip(),
        role=payload.role,
        password_hash=hash_password(payload.password),
        department_id=dept.id,
        position_id=pos.id,
        grade_id=grade.id if grade else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=str(user.id))
    log_event(db, request, "register", user.email, success=True, user_id=user.id)
    return TokenOut(access_token=token, user=_user_out(user))


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    login_limiter(request)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        log_event(db, request, "login", payload.email, success=False, user_id=(user.id if user else None), detail="bad password")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная почта или пароль")
    token = create_access_token(subject=str(user.id))
    log_event(db, request, "login", user.email, success=True, user_id=user.id)
    return TokenOut(access_token=token, user=_user_out(user))


@router.get("/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return _user_out(current)


@router.put("/me", response_model=UserOut)
def update_me(payload: UpdateMeRequest, db: Session = Depends(get_db), current: User = Depends(get_current_user)):
    if payload.full_name is not None:
        current.full_name = payload.full_name.strip()
    if payload.position_id is not None:
        pos = db.get(Position, payload.position_id)
        if not pos or not pos.is_active or pos.department_id != current.department_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Должность не соответствует отделу")
        current.position_id = pos.id
    if payload.grade_id is not None:
        grade = db.get(Grade, payload.grade_id)
        if not grade or not grade.is_active:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Грейд не найден")
        current.grade_id = grade.id
    db.commit()
    db.refresh(current)
    return _user_out(current)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return (v or "").strip().lower()


class VerifyCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return (v or "").strip().lower()


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=6, max_length=128)

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return (v or "").strip().lower()

    @field_validator("new_password")
    @classmethod
    def _check_password(cls, v: str) -> str:
        return _validate_password(v)


class ForgotOut(BaseModel):
    sent: bool = True
    ttl_minutes: int


class CodeVerifiedOut(BaseModel):
    verified: bool = True
    email: str


class ResetOut(BaseModel):
    reset: bool = True
    email: str


@router.post("/forgot-password", response_model=ForgotOut)
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    forgot_limiter(request)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user:
        log_event(db, request, "forgot", payload.email, success=False, detail="user not found")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь с такой почтой не найден")

    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=settings.PASSWORD_RESET_CODE_TTL_MINUTES)
    code = generate_reset_code()
    code_hash = hash_password(code)

    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).update({"used_at": now}, synchronize_session=False)

    token_row = PasswordResetToken(
        user_id=user.id,
        code_hash=code_hash,
        expires_at=expires_at,
    )
    db.add(token_row)
    db.commit()

    print(f"[PASSWORD RESET] email={user.email} code={code} ttl={settings.PASSWORD_RESET_CODE_TTL_MINUTES}m", flush=True)
    log_event(db, request, "forgot", user.email, success=True, user_id=user.id)
    return ForgotOut(sent=True, ttl_minutes=settings.PASSWORD_RESET_CODE_TTL_MINUTES)


@router.post("/verify-reset-code", response_model=CodeVerifiedOut)
def verify_reset_code(payload: VerifyCodeRequest, request: Request, db: Session = Depends(get_db)):
    reset_limiter(request)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user:
        log_event(db, request, "verify_code", payload.email, success=False, detail="user not found")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    now = datetime.utcnow()
    rows = db.scalars(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .order_by(PasswordResetToken.created_at.desc())
    ).all()
    valid = None
    for r in rows:
        if r.expires_at < now:
            continue
        if verify_password(payload.code, r.code_hash):
            valid = r
            break
    if valid is None:
        log_event(db, request, "verify_code", user.email, success=False, user_id=user.id, detail="bad code")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный или просроченный код")
    log_event(db, request, "verify_code", user.email, success=True, user_id=user.id)
    return CodeVerifiedOut(verified=True, email=user.email)


@router.post("/reset-password", response_model=ResetOut)
def reset_password(payload: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    reset_limiter(request)
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user:
        log_event(db, request, "reset", payload.email, success=False, detail="user not found")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    now = datetime.utcnow()
    rows = db.scalars(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .order_by(PasswordResetToken.created_at.desc())
    ).all()
    valid = None
    for r in rows:
        if r.expires_at < now:
            continue
        if verify_password(payload.code, r.code_hash):
            valid = r
            break
    if valid is None:
        log_event(db, request, "reset", user.email, success=False, user_id=user.id, detail="bad code")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный или просроченный код")

    user.password_hash = hash_password(payload.new_password)
    valid.used_at = now
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).update(
        {"used_at": now}, synchronize_session=False
    )
    db.commit()
    log_event(db, request, "reset", user.email, success=True, user_id=user.id)
    return ResetOut(reset=True, email=user.email)


class AuditOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    email: str
    event_type: str
    success: bool
    ip: str
    user_agent: str
    detail: Optional[str] = None
    created_at: str


@router.get("/audit/me", response_model=list[AuditOut])
def audit_me(
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
    limit: int = 50,
):
    rows = db.scalars(
        select(LoginAudit)
        .where(LoginAudit.user_id == current.id)
        .order_by(LoginAudit.created_at.desc())
        .limit(min(limit, 200))
    ).all()
    return [_audit_out(r) for r in rows]


@router.get("/audit/department", response_model=list[AuditOut], dependencies=[Depends(get_current_head)])
def audit_department(
    db: Session = Depends(get_db),
    head: User = Depends(get_current_head),
    limit: int = 100,
):
    user_ids = [u.id for u in db.scalars(
        select(User).where(User.department_id == head.department_id)
    ).all()]
    if not user_ids:
        return []
    rows = db.scalars(
        select(LoginAudit)
        .where(LoginAudit.user_id.in_(user_ids))
        .order_by(LoginAudit.created_at.desc())
        .limit(min(limit, 500))
    ).all()
    return [_audit_out(r) for r in rows]


def _audit_out(r: LoginAudit) -> dict:
    return {
        "id": r.id,
        "user_id": r.user_id,
        "email": r.email,
        "event_type": r.event_type,
        "success": bool(r.success),
        "ip": r.ip,
        "user_agent": r.user_agent,
        "detail": r.detail,
        "created_at": r.created_at.strftime("%d.%m.%Y %H:%M:%S") if r.created_at else "",
    }