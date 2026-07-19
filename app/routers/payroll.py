from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.export import generate_payroll_xlsx
from app.models import CostPriceRecord, Grade, GradeTier, PayrollRecord, User
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
    has_plan: bool = False
    plan_margin: Optional[float] = None
    margin_total: float = 0
    margin_for_plan: float = 0
    performance_pct: Optional[float] = None

    class Config:
        from_attributes = False


def _ensure_can_calculate(user: User) -> None:
    if user.department is None or user.department.code != PAYROLL_DEPARTMENT_CODE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Расчёт заработной платы доступен только для отдела Развитие АРТ",
        )


def _margin_for_plan(service_margin: float, goods_margin: float) -> float:
    return round((float(service_margin) + float(goods_margin)) * (1 - settings.VAT_RATE_PERCENT / 100), 2)


def _resolve_bonus_percent(grade: Grade, margin_for_plan: float, db: Session) -> float:
    if not grade.has_plan or grade.plan_margin is None or float(grade.plan_margin) <= 0:
        return float(grade.bonus_percent)
    if margin_for_plan <= 0:
        return 0.0
    plan = float(grade.plan_margin)
    performance_pct = margin_for_plan / plan * 100
    tiers = db.scalars(
        select(GradeTier).where(GradeTier.grade_id == grade.id).order_by(GradeTier.min_pct.desc())
    ).all()
    for tier in tiers:
        if performance_pct >= float(tier.min_pct):
            return float(tier.bonus_percent)
    return 0.0


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
    grade = rec.grade
    plan_margin = float(rec.plan_margin) if rec.plan_margin is not None else None
    performance_pct = float(rec.performance_pct) if rec.performance_pct is not None else None
    has_plan = bool(grade.has_plan) if grade else False
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
        "grade_name": (grade.name if grade else rec.grade_id),
        "has_plan": has_plan,
        "plan_margin": plan_margin,
        "margin_total": round(float(rec.service_margin) + float(rec.goods_margin), 2),
        "margin_for_plan": float(rec.margin_for_plan),
        "performance_pct": performance_pct,
    }


@router.post("/calculate", response_model=PayrollOut, status_code=status.HTTP_201_CREATED)
def calculate_payroll(payload: PayrollCalcIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _ensure_can_calculate(user)
    if payload.worked_days > payload.working_days:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Отработано дней не может быть больше рабочих дней в месяце")
    grade = user.grade
    base_salary = float(grade.base_salary)
    service_factor = float(grade.service_factor)
    margin_for_plan = _margin_for_plan(payload.service_margin, payload.goods_margin)
    bonus_percent = _resolve_bonus_percent(grade, margin_for_plan, db)
    calc = _calc(base_salary, bonus_percent, service_factor, payload)
    if grade.has_plan and grade.plan_margin is not None and float(grade.plan_margin) > 0:
        performance_pct = round(margin_for_plan / float(grade.plan_margin) * 100, 2)
    else:
        performance_pct = None
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
        plan_margin=(float(grade.plan_margin) if grade.plan_margin is not None else None),
        margin_for_plan=margin_for_plan,
        performance_pct=performance_pct,
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


class SummaryOut(BaseModel):
    period: str
    record_id: int
    created_at: str
    accrued_base: float
    services_bonus: float
    goods_bonus: float
    bonus_total: float
    gross_pay: float
    tax_amount: float
    net_pay: float


@router.get("/summary", response_model=List[SummaryOut])
def summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(
        select(PayrollRecord)
        .where(PayrollRecord.user_id == user.id)
        .order_by(PayrollRecord.created_at.desc())
    ).all()
    latest_by_period: dict[str, PayrollRecord] = {}
    for r in rows:
        if r.period not in latest_by_period:
            latest_by_period[r.period] = r
    items = list(latest_by_period.values())
    items.sort(key=lambda x: x.period)
    return [
        SummaryOut(
            period=r.period,
            record_id=r.id,
            created_at=r.created_at.strftime("%d.%m.%Y %H:%M") if r.created_at else "",
            accrued_base=float(r.accrued_base),
            services_bonus=float(r.services_bonus),
            goods_bonus=float(r.goods_bonus),
            bonus_total=float(r.bonus_total),
            gross_pay=float(r.gross_pay),
            tax_amount=float(r.tax_amount),
            net_pay=float(r.net_pay),
        )
        for r in items
    ]


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


class CostPriceIn(BaseModel):
    period: str = Field(description="ГГГГ-ММ, например 2026-07")
    cost_price: float = Field(ge=0, default=0)


class CostPriceOut(BaseModel):
    period: str
    cost_price: float
    updated_at: str


@router.post("/cost-price", response_model=CostPriceOut)
def save_cost_price(payload: CostPriceIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    existing = db.scalar(
        select(CostPriceRecord).where(
            CostPriceRecord.user_id == user.id,
            CostPriceRecord.period == payload.period,
        )
    )
    if existing:
        existing.cost_price = payload.cost_price
    else:
        existing = CostPriceRecord(
            user_id=user.id,
            period=payload.period,
            cost_price=payload.cost_price,
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return CostPriceOut(
        period=existing.period,
        cost_price=float(existing.cost_price),
        updated_at=existing.created_at.strftime("%d.%m.%Y %H:%M") if existing.created_at else "",
    )


@router.get("/cost-price", response_model=List[CostPriceOut])
def list_cost_price(
    period: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(CostPriceRecord).where(CostPriceRecord.user_id == user.id)
    if period:
        stmt = stmt.where(CostPriceRecord.period == period)
    stmt = stmt.order_by(CostPriceRecord.period.desc())
    rows = db.scalars(stmt).all()
    return [
        CostPriceOut(
            period=r.period,
            cost_price=float(r.cost_price),
            updated_at=r.created_at.strftime("%d.%m.%Y %H:%M") if r.created_at else "",
        )
        for r in rows
    ]