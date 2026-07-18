from typing import List
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.export import generate_payroll_xlsx
from app.models import PayrollRecord, User
from app.routers.auth import get_current_user


router = APIRouter(prefix="/api/payroll", tags=["payroll"])

PAYROLL_DEPARTMENT_CODE = "dev_art"


class PayrollCalcIn(BaseModel):
    period: str = Field(description="ГГГГ-ММ, например 2026-07")
    worked_days: int = Field(ge=0, le=31)
    working_days: int = Field(ge=1, le=31)
    service_margin: float = Field(ge=0, default=0)
    goods_margin: float = Field(ge=0, default=0)
    tax_rate: float = Field(ge=0, le=100, default=13.0)


class PayrollOut(BaseModel):
    id: int
    period: str
    worked_days: int
    working_days: int
    service_margin: float
    goods_margin: float
    bonus_percent: float
    service_factor: float
    base_salary: float
    accrued_base: float
    services_bonus: float
    goods_bonus: float
    bonus_total: float
    tax_rate: float
    gross_pay: float
    tax_amount: float
    net_pay: float
    grade_id: str
    grade_name: str

    class Config:
        from_attributes = False


def _ensure_can_calculate(user: User) -> None:
    if user.department is None or user.department.code != PAYROLL_DEPARTMENT_CODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Расчёт заработной платы доступен только для отдела Развитие АРТ",
        )


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


def _payroll_out(rec: PayrollRecord) -> dict:
    return {
        "id": rec.id,
        "period": rec.period,
        "worked_days": rec.worked_days,
        "working_days": rec.working_days,
        "service_margin": float(rec.service_margin),
        "goods_margin": float(rec.goods_margin),
        "bonus_percent": float(rec.bonus_percent),
        "service_factor": float(rec.service_factor),
        "base_salary": float(rec.base_salary),
        "accrued_base": float(rec.accrued_base),
        "services_bonus": float(rec.services_bonus),
        "goods_bonus": float(rec.goods_bonus),
        "bonus_total": float(rec.bonus_total),
        "tax_rate": float(rec.tax_rate),
        "gross_pay": float(rec.gross_pay),
        "tax_amount": float(rec.tax_amount),
        "net_pay": float(rec.net_pay),
        "grade_id": rec.grade_id,
        "grade_name": (rec.grade.name if rec.grade else rec.grade_id),
    }


@router.post("/calculate", response_model=PayrollOut, status_code=status.HTTP_201_CREATED)
def calculate_payroll(payload: PayrollCalcIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_can_calculate(user)
    if payload.worked_days > payload.working_days:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Отработано дней не может быть больше рабочих дней в месяце")
    grade = user.grade
    base_salary = float(grade.base_salary)
    bonus_percent = float(grade.bonus_percent)
    service_factor = float(grade.service_factor)
    calc = _calc(base_salary, bonus_percent, service_factor, payload)
    record = PayrollRecord(
        user_id=user.id,
        period=payload.period,
        worked_days=payload.worked_days,
        working_days=payload.working_days,
        service_margin=payload.service_margin,
        goods_margin=payload.goods_margin,
        bonus_percent=bonus_percent,
        service_factor=service_factor,
        base_salary=base_salary,
        tax_rate=payload.tax_rate,
        grade_id=grade.id,
        **calc,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _payroll_out(record)


@router.get("/history", response_model=List[PayrollOut])
def history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(
        select(PayrollRecord)
        .where(PayrollRecord.user_id == user.id)
        .order_by(PayrollRecord.created_at.desc())
    ).all()
    return [_payroll_out(r) for r in rows]


@router.get("/records/{record_id}/export")
def export_record(record_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    record = db.get(PayrollRecord, record_id)
    if not record or record.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Расчёт не найден")
    content = generate_payroll_xlsx(record, user)
    safe_name = (user.full_name or "employee").replace(" ", "_").replace("/", "_")
    ascii_name = f"Raschet_ZP_{record.id}_{record.period}"
    utf8_name = f"Raschet_ZP_{safe_name}_{record.period}.xlsx"
    disposition = f"attachment; filename=\"{ascii_name}.xlsx\"; filename*=UTF-8''{quote(utf8_name)}"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": disposition},
    )