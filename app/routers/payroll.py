from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.grades import GRADES, get_grade
from app.models import Employee, PayrollRecord, User
from app.routers.auth import get_current_user


router = APIRouter(prefix="/api/payroll", tags=["payroll"])


class GradeOut(BaseModel):
    id: str
    name: str
    base_salary: float
    bonus_percent: float
    service_factor: float
    has_plan: bool


class EmployeeIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    position: str = Field(default="", max_length=255)
    grade: str = Field(default="trainee", max_length=50)


class EmployeeOut(BaseModel):
    id: int
    full_name: str
    position: str
    grade: str
    grade_name: str
    base_salary: float
    bonus_percent: float
    service_factor: float

    class Config:
        from_attributes = False


class PayrollCalcIn(BaseModel):
    employee_id: int
    period: str = Field(description="ГГГГ-ММ, например 2026-07")
    worked_days: int = Field(ge=0, le=31)
    working_days: int = Field(ge=1, le=31)
    service_margin: float = Field(ge=0, default=0)
    goods_margin: float = Field(ge=0, default=0)
    tax_rate: float = Field(ge=0, le=100, default=13.0)


class PayrollOut(PayrollCalcIn):
    id: int
    grade: str
    base_salary: float
    bonus_percent: float
    service_factor: float
    accrued_base: float
    services_bonus: float
    goods_bonus: float
    bonus_total: float
    gross_pay: float
    tax_amount: float
    net_pay: float

    class Config:
        from_attributes = False


def _employee_out(emp: Employee) -> dict:
    grade = get_grade(emp.grade) or {}
    return {
        "id": emp.id,
        "full_name": emp.full_name,
        "position": emp.position,
        "grade": emp.grade,
        "grade_name": grade.get("name", emp.grade),
        "base_salary": float(emp.base_salary),
        "bonus_percent": float(emp.bonus_percent),
        "service_factor": float(emp.service_factor),
    }


def _payroll_out(rec: PayrollRecord, emp: Employee) -> dict:
    return {
        "id": rec.id,
        "employee_id": rec.employee_id,
        "period": rec.period,
        "worked_days": rec.worked_days,
        "working_days": rec.working_days,
        "service_margin": float(rec.service_margin),
        "goods_margin": float(rec.goods_margin),
        "tax_rate": float(rec.tax_rate),
        "grade": rec.employee.grade,
        "base_salary": float(emp.base_salary),
        "bonus_percent": float(rec.bonus_percent),
        "service_factor": float(rec.service_factor),
        "accrued_base": float(rec.accrued_base),
        "services_bonus": float(rec.services_bonus),
        "goods_bonus": float(rec.goods_bonus),
        "bonus_total": float(rec.bonus_total),
        "gross_pay": float(rec.gross_pay),
        "tax_amount": float(rec.tax_amount),
        "net_pay": float(rec.net_pay),
    }


def _calc(base_salary: float, bonus_percent: float, service_factor: float, p: PayrollCalcIn) -> dict:
    accrued_base = round(base_salary * p.worked_days / p.working_days, 2)
    services_bonus = round(p.service_margin * service_factor * bonus_percent / 100, 2)
    goods_bonus = round(p.goods_margin * bonus_percent / 100, 2)
    bonus_total = round(services_bonus + goods_bonus, 2)
    gross_pay = round(accrued_base + bonus_total, 2)
    tax_amount = round(gross_pay * p.tax_rate / 100, 2)
    net_pay = round(gross_pay - tax_amount, 2)
    return {
        "accrued_base": accrued_base,
        "services_bonus": services_bonus,
        "goods_bonus": goods_bonus,
        "bonus_total": bonus_total,
        "gross_pay": gross_pay,
        "tax_amount": tax_amount,
        "net_pay": net_pay,
    }


def _apply_grade(emp: Employee, grade_id: str) -> None:
    grade = get_grade(grade_id)
    if not grade:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Неизвестный грейд: {grade_id}")
    emp.grade = grade["id"]
    emp.base_salary = grade["base_salary"]
    emp.bonus_percent = grade["bonus_percent"]
    emp.service_factor = grade["service_factor"]


@router.get("/grades", response_model=List[GradeOut])
def list_grades():
    return GRADES


@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(payload: EmployeeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    emp = Employee(
        user_id=user.id,
        full_name=payload.full_name.strip(),
        position=payload.position.strip(),
    )
    _apply_grade(emp, payload.grade)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return _employee_out(emp)


@router.get("/employees", response_model=List[EmployeeOut])
def list_employees(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Employee).where(Employee.user_id == user.id).order_by(Employee.full_name)).all()
    return [_employee_out(e) for e in rows]


@router.put("/employees/{emp_id}", response_model=EmployeeOut)
def update_employee(emp_id: int, payload: EmployeeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    emp = db.get(Employee, emp_id)
    if not emp or emp.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден")
    emp.full_name = payload.full_name.strip()
    emp.position = payload.position.strip()
    _apply_grade(emp, payload.grade)
    db.commit()
    db.refresh(emp)
    return _employee_out(emp)


@router.delete("/employees/{emp_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(emp_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    emp = db.get(Employee, emp_id)
    if not emp or emp.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден")
    db.delete(emp)
    db.commit()


@router.post("/calculate", response_model=PayrollOut, status_code=status.HTTP_201_CREATED)
def calculate_payroll(payload: PayrollCalcIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    emp = db.get(Employee, payload.employee_id)
    if not emp or emp.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден")
    if payload.working_days < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="working_days должен быть >= 1")
    if payload.worked_days > payload.working_days:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Отработано дней не может быть больше рабочих дней в месяце")
    calc = _calc(float(emp.base_salary), float(emp.bonus_percent), float(emp.service_factor), payload)
    record = PayrollRecord(
        employee_id=emp.id,
        period=payload.period,
        worked_days=payload.worked_days,
        working_days=payload.working_days,
        service_margin=payload.service_margin,
        goods_margin=payload.goods_margin,
        bonus_percent=float(emp.bonus_percent),
        service_factor=float(emp.service_factor),
        tax_rate=payload.tax_rate,
        **calc,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _payroll_out(record, emp)


@router.get("/history", response_model=List[PayrollOut])
def history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (
        db.execute(
            select(PayrollRecord, Employee)
            .join(Employee, PayrollRecord.employee_id == Employee.id)
            .where(Employee.user_id == user.id)
            .order_by(PayrollRecord.created_at.desc())
        )
        .all()
    )
    return [_payroll_out(rec, emp) for rec, emp in rows]