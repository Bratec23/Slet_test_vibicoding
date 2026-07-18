from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Department, Grade, Position, User
from app.security import create_access_token, decode_access_token, hash_password, verify_password


router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(default="", max_length=255)
    department_id: int
    position_id: int
    grade_id: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class DepartmentBrief(BaseModel):
    id: int
    code: str
    name: str


class PositionBrief(BaseModel):
    id: int
    name: str


class GradeBrief(BaseModel):
    id: str
    name: str
    base_salary: float
    bonus_percent: float
    service_factor: float
    has_plan: bool


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    department: DepartmentBrief
    position: PositionBrief
    grade: GradeBrief


class UpdateMeRequest(BaseModel):
    full_name: str = Field(default="", max_length=255)
    position_id: int | None = None
    grade_id: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


def _user_out(user: User) -> dict:
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
        "grade": {
            "id": user.grade.id,
            "name": user.grade.name,
            "base_salary": float(user.grade.base_salary),
            "bonus_percent": float(user.grade.bonus_percent),
            "service_factor": float(user.grade.service_factor),
            "has_plan": bool(user.grade.has_plan),
        },
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


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email.lower()))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Пользователь с такой почтой уже зарегистрирован")

    dept = db.get(Department, payload.department_id)
    if not dept or not dept.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Отдел не найден")

    pos = db.get(Position, payload.position_id)
    if not pos or not pos.is_active or pos.department_id != dept.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Должность не соответствует отделу")

    grade = db.get(Grade, payload.grade_id)
    if not grade or not grade.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Грейд не найден")

    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name.strip(),
        role="manager",
        password_hash=hash_password(payload.password),
        department_id=dept.id,
        position_id=pos.id,
        grade_id=grade.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(subject=str(user.id))
    return TokenOut(access_token=token, user=_user_out(user))


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверная почта или пароль")
    token = create_access_token(subject=str(user.id))
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