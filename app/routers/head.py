from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Department, PayrollRecord, User
from app.routers.auth import get_current_head


router = APIRouter(prefix="/api/head", tags=["head"])


class TeamMemberOut(BaseModel):
    user_id: int
    full_name: str
    position_name: str
    grade_name: str
    base_salary: float
    record: dict | None = None


class TeamOut(BaseModel):
    period: str
    department_name: str
    total_managers: int
    total_margin: float
    total_gross: float
    total_net: float
    members: List[TeamMemberOut]


class ProfitabilityItemIn(BaseModel):
    user_id: int
    cost_price: float = Field(ge=0, default=0)


class ProfitabilityRequest(BaseModel):
    period: str
    items: List[ProfitabilityItemIn]


class ProfitabilityRowOut(BaseModel):
    user_id: int
    full_name: str
    cost_price: float
    margin: float
    gross: float
    ndfl: float
    insurance: float
    vat: float
    office: float
    labor_cost: float
    operating_cost: float
    total_cost: float
    profit: float
    profitability_pct: float | None
    has_record: bool


class ProfitabilityResponse(BaseModel):
    period: str
    department_name: str
    rows: List[ProfitabilityRowOut]
    totals: dict


def _latest_record_for(user_id: int, period: str, db: Session) -> PayrollRecord | None:
    return db.scalar(
        select(PayrollRecord)
        .where(PayrollRecord.user_id == user_id, PayrollRecord.period == period)
        .order_by(PayrollRecord.created_at.desc())
        .limit(1)
    )


@router.get("/team", response_model=TeamOut)
def team(period: str = Query(..., description="ГГГГ-ММ"), db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    members_q = db.scalars(
        select(User).where(User.department_id == head.department_id, User.role == "manager").order_by(User.full_name)
    ).all()
    dept = db.get(Department, head.department_id)
    dept_name = dept.name if dept else "—"
    members: list[TeamMemberOut] = []
    total_margin = 0.0
    total_gross = 0.0
    total_net = 0.0
    for m in members_q:
        rec = _latest_record_for(m.id, period, db)
        rec_out = None
        if rec:
            rec_out = {
                "id": rec.id,
                "period": rec.period,
                "service_margin": float(rec.service_margin),
                "goods_margin": float(rec.goods_margin),
                "bonus_total": float(rec.bonus_total),
                "gross_pay": float(rec.gross_pay),
                "tax_amount": float(rec.tax_amount),
                "net_pay": float(rec.net_pay),
                "base_salary": float(rec.base_salary),
                "created_at": rec.created_at.strftime("%d.%m.%Y %H:%M") if rec.created_at else "",
            }
            total_margin += float(rec.service_margin) + float(rec.goods_margin)
            total_gross += float(rec.gross_pay)
            total_net += float(rec.net_pay)
        members.append(TeamMemberOut(
            user_id=m.id,
            full_name=m.full_name,
            position_name=m.position.name if m.position else "—",
            grade_name=m.grade.name if m.grade else "—",
            base_salary=float(m.grade.base_salary) if m.grade else 0.0,
            record=rec_out,
        ))
    return TeamOut(
        period=period,
        department_name=dept_name,
        total_managers=len(members_q),
        total_margin=round(total_margin, 2),
        total_gross=round(total_gross, 2),
        total_net=round(total_net, 2),
        members=members,
    )


def _calc_profitability(rec: PayrollRecord, cost_price: float) -> dict:
    margin = round(float(rec.service_margin) + float(rec.goods_margin), 2)
    gross = float(rec.gross_pay)
    ndfl = float(rec.tax_amount)
    insurance = round(gross * settings.INSURANCE_RATE_PERCENT / 100, 2)
    vat = round(margin * settings.VAT_RATE_PERCENT / 100, 2)
    office = settings.OFFICE_COST_PER_EMPLOYEE
    labor_cost = round(gross + ndfl + insurance, 2)
    operating_cost = round(vat + office, 2)
    total_cost = round(labor_cost + operating_cost + cost_price, 2)
    profit = round(margin - total_cost, 2)
    profitability_pct = round(profit / margin * 100, 2) if margin > 0 else None
    return {
        "margin": margin,
        "gross": gross,
        "ndfl": ndfl,
        "insurance": insurance,
        "vat": vat,
        "office": office,
        "labor_cost": labor_cost,
        "operating_cost": operating_cost,
        "total_cost": total_cost,
        "profit": profit,
        "profitability_pct": profitability_pct,
    }


@router.post("/profitability", response_model=ProfitabilityResponse)
def profitability(payload: ProfitabilityRequest, db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    dept = db.get(Department, head.department_id)
    dept_name = dept.name if dept else "—"
    rows: list[ProfitabilityRowOut] = []
    totals = {
        "margin": 0.0, "gross": 0.0, "ndfl": 0.0, "insurance": 0.0, "vat": 0.0,
        "office": 0.0, "labor_cost": 0.0, "operating_cost": 0.0, "total_cost": 0.0,
        "profit": 0.0, "cost_price": 0.0, "managers_with_data": 0,
    }
    for item in payload.items:
        user = db.get(User, item.user_id)
        if not user or user.department_id != head.department_id or user.role != "manager":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Менеджер {item.user_id} не найден или не входит в ваш отдел")
        rec = _latest_record_for(user.id, payload.period, db)
        if not rec:
            rows.append(ProfitabilityRowOut(
                user_id=user.id, full_name=user.full_name, cost_price=item.cost_price,
                margin=0, gross=0, ndfl=0, insurance=0, vat=0, office=0,
                labor_cost=0, operating_cost=0, total_cost=0, profit=0,
                profitability_pct=None, has_record=False,
            ))
            continue
        calc = _calc_profitability(rec, item.cost_price)
        rows.append(ProfitabilityRowOut(
            user_id=user.id, full_name=user.full_name, cost_price=item.cost_price,
            has_record=True, **calc,
        ))
        for k in ("margin", "gross", "ndfl", "insurance", "vat", "office", "labor_cost", "operating_cost", "total_cost", "profit"):
            totals[k] += calc[k]
        totals["cost_price"] += item.cost_price
        totals["managers_with_data"] += 1
    for k in totals:
        if k != "managers_with_data":
            totals[k] = round(totals[k], 2)
    return ProfitabilityResponse(
        period=payload.period,
        department_name=dept_name,
        rows=rows,
        totals=totals,
    )


@router.get("/costs", response_model=dict)
def costs(period: str = Query(...), db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    dept = db.get(Department, head.department_id)
    dept_name = dept.name if dept else "—"
    managers = db.scalars(
        select(User).where(User.department_id == head.department_id, User.role == "manager")
    ).all()
    items = []
    total_office = 0.0
    total_labor = 0.0
    total_vat = 0.0
    total_ndfl = 0.0
    total_insurance = 0.0
    total_gross = 0.0
    total_margin = 0.0
    for m in managers:
        rec = _latest_record_for(m.id, period, db)
        office = settings.OFFICE_COST_PER_EMPLOYEE
        total_office += office
        row = {
            "user_id": m.id,
            "full_name": m.full_name,
            "office": office,
            "has_record": False,
            "gross": 0.0, "ndfl": 0.0, "insurance": 0.0, "vat": 0.0, "margin": 0.0,
        }
        if rec:
            gross = float(rec.gross_pay)
            ndfl = float(rec.tax_amount)
            insurance = round(gross * settings.INSURANCE_RATE_PERCENT / 100, 2)
            margin = round(float(rec.service_margin) + float(rec.goods_margin), 2)
            vat = round(margin * settings.VAT_RATE_PERCENT / 100, 2)
            row.update({
                "has_record": True, "gross": gross, "ndfl": ndfl,
                "insurance": insurance, "vat": vat, "margin": margin,
            })
            total_gross += gross
            total_ndfl += ndfl
            total_insurance += insurance
            total_vat += vat
            total_margin += margin
        items.append(row)
    return {
        "period": period,
        "department_name": dept_name,
        "office_per_employee": settings.OFFICE_COST_PER_EMPLOYEE,
        "insurance_rate_pct": settings.INSURANCE_RATE_PERCENT,
        "vat_rate_pct": settings.VAT_RATE_PERCENT,
        "items": items,
        "totals": {
            "managers": len(managers),
            "office": round(total_office, 2),
            "gross": round(total_gross, 2),
            "ndfl": round(total_ndfl, 2),
            "insurance": round(total_insurance, 2),
            "vat": round(total_vat, 2),
            "margin": round(total_margin, 2),
            "labor_cost": round(total_gross + total_ndfl + total_insurance, 2),
            "operating_cost": round(total_vat + total_office, 2),
        },
    }