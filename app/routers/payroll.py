from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, PayrollRecord, User
from app.routers.auth import get_current_user


router = APIRouter(prefix="/api/payroll", tags=["payroll"])


class EmployeeIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    position: str = Field(default="", max_length=255)
    base_salary: float = Field(ge=0, default=0)


class EmployeeOut(EmployeeIn):
    id: int

    class Config:
        from_attributes = True


class PayrollCalcIn(BaseModel):
    employee_id: int
    period: str = Field(description="ГГГГ-ММ, например 2026-07")
    worked_days: int = Field(ge=0, le=31)
    total_days: int = Field(ge=1, le=31)
    bonus_percent: float = Field(ge=0, le=100, default=0)
    overtime_hours: float = Field(ge=0, default=0)
    overtime_rate: float = Field(ge=0, default=0)
    deductions: float = Field(ge=0, default=0)
    tax_rate: float = Field(ge=0, le=100, default=13.0)


class PayrollOut(PayrollCalcIn):
    id: int
    base_salary: float
    accrued_base: float
    bonus_amount: float
    overtime_amount: float
    gross_pay: float
    tax_amount: float
    net_pay: float

    class Config:
        from_attributes = False


def _calc(params: PayrollCalcIn, base_salary: float) -> dict:
    accrued_base = round(base_salary * params.worked_days / params.total_days, 2)
    bonus_amount = round(accrued_base * params.bonus_percent / 100, 2)
    overtime_amount = round(params.overtime_hours * params.overtime_rate, 2)
    gross_pay = round(accrued_base + bonus_amount + overtime_amount - params.deductions, 2)
    tax_amount = round(gross_pay * params.tax_rate / 100, 2)
    net_pay = round(gross_pay - tax_amount, 2)
    return {
        "base_salary": base_salary,
        "accrued_base": accrued_base,
        "bonus_amount": bonus_amount,
        "overtime_amount": overtime_amount,
        "gross_pay": gross_pay,
        "tax_amount": tax_amount,
        "net_pay": net_pay,
    }


@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(payload: EmployeeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    emp = Employee(user_id=user.id, **payload.model_dump())
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


@router.get("/employees", response_model=List[EmployeeOut])
def list_employees(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(select(Employee).where(Employee.user_id == user.id).order_by(Employee.full_name)).all()
    return rows


@router.put("/employees/{emp_id}", response_model=EmployeeOut)
def update_employee(emp_id: int, payload: EmployeeIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    emp = db.get(Employee, emp_id)
    if not emp or emp.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сотрудник не найден")
    for k, v in payload.model_dump().items():
        setattr(emp, k, v)
    db.commit()
    db.refresh(emp)
    return emp


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
    if payload.total_days < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="total_days должен быть >= 1")
    calc = _calc(payload, float(emp.base_salary))
    record = PayrollRecord(
        employee_id=emp.id,
        period=payload.period,
        worked_days=payload.worked_days,
        total_days=payload.total_days,
        bonus_percent=payload.bonus_percent,
        overtime_hours=payload.overtime_hours,
        overtime_rate=payload.overtime_rate,
        deductions=payload.deductions,
        tax_rate=payload.tax_rate,
        gross_pay=calc["gross_pay"],
        tax_amount=calc["tax_amount"],
        net_pay=calc["net_pay"],
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return PayrollOut(**payload.model_dump(), id=record.id, **calc)


@router.get("/history", response_model=List[PayrollOut])
def history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (
        db.execute(
            select(PayrollRecord, Employee.base_salary)
            .join(Employee, PayrollRecord.employee_id == Employee.id)
            .where(Employee.user_id == user.id)
            .order_by(PayrollRecord.created_at.desc())
        )
        .all()
    )
    result = []
    for rec, base_salary in rows:
        calc = _calc(PayrollCalcIn(
            employee_id=rec.employee_id,
            period=rec.period,
            worked_days=rec.worked_days,
            total_days=rec.total_days,
            bonus_percent=float(rec.bonus_percent),
            overtime_hours=float(rec.overtime_hours),
            overtime_rate=float(rec.overtime_rate),
            deductions=float(rec.deductions),
            tax_rate=float(rec.tax_rate),
        ), float(base_salary))
        result.append(PayrollOut(
            id=rec.id,
            employee_id=rec.employee_id,
            period=rec.period,
            worked_days=rec.worked_days,
            total_days=rec.total_days,
            bonus_percent=float(rec.bonus_percent),
            overtime_hours=float(rec.overtime_hours),
            overtime_rate=float(rec.overtime_rate),
            deductions=float(rec.deductions),
            tax_rate=float(rec.tax_rate),
            **calc,
        ))
    return result