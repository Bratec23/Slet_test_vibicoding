from typing import List, Optional, Tuple
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import CostPriceRecord, Department, PayrollRecord, User
from app.routers.auth import get_current_head


router = APIRouter(prefix="/api/head", tags=["head"])


def _latest_record_for(user_id: int, period: str, db: Session) -> Optional[PayrollRecord]:
    return db.scalar(
        select(PayrollRecord)
        .where(PayrollRecord.user_id == user_id, PayrollRecord.period == period)
        .order_by(PayrollRecord.created_at.desc())
        .limit(1)
    )


def _cost_price_for(user_id: int, period: str, db: Session) -> float:
    row = db.scalar(
        select(CostPriceRecord)
        .where(CostPriceRecord.user_id == user_id, CostPriceRecord.period == period)
        .order_by(CostPriceRecord.created_at.desc())
        .limit(1)
    )
    return float(row.cost_price) if row else 0.0


def _calc_metrics(rec: PayrollRecord, cost_price: float = 0.0) -> dict:
    margin = round(float(rec.service_margin) + float(rec.goods_margin), 2)
    margin_net = round(margin * (1 - settings.VAT_RATE_PERCENT / 100), 2)
    gross = float(rec.gross_pay)
    ndfl = float(rec.tax_amount)
    insurance = round(gross * settings.INSURANCE_RATE_PERCENT / 100, 2)
    vat = round(margin * settings.VAT_RATE_PERCENT / 100, 2)
    office = settings.OFFICE_COST_PER_EMPLOYEE
    labor_cost = round(gross + ndfl + insurance, 2)
    operating_cost = round(vat + office, 2)
    total_cost = round(cost_price, 2)
    profit = round(margin_net - cost_price, 2)
    profitability_pct = round(profit / margin_net * 100, 2) if margin_net > 0 else None
    fot_margin_pct = round(gross / margin_net * 100, 2) if margin_net > 0 else None
    return {
        "margin": margin, "margin_net": margin_net, "gross": gross, "ndfl": ndfl, "insurance": insurance,
        "vat": vat, "office": office, "labor_cost": labor_cost, "operating_cost": operating_cost,
        "total_cost": total_cost, "cost_price": round(cost_price, 2),
        "profit": profit, "profitability_pct": profitability_pct,
        "fot_margin_pct": fot_margin_pct,
        "kpi2_revenue": float(rec.kpi2_revenue),
        "kpi2_bonus_amount": float(rec.kpi2_bonus_amount),
        "kpi2_paid": bool(rec.kpi2_paid),
        "kpi2_retention_pct": float(rec.kpi2_retention_pct),
    }


def _fot_status(pct: Optional[float]) -> Optional[str]:
    if pct is None:
        return None
    if pct > settings.FOT_MARGIN_CRITICAL_PCT:
        return "critical"
    if pct > settings.FOT_MARGIN_NORMAL_PCT:
        return "warning"
    return "normal"


class TeamMemberOut(BaseModel):
    user_id: int
    full_name: str
    position_name: str
    grade_name: Optional[str] = None
    base_salary: Optional[float] = None
    record: Optional[dict] = None


class MetricsRowOut(BaseModel):
    user_id: int
    full_name: str
    has_record: bool
    margin: float = 0
    margin_net: float = 0
    gross: float = 0
    ndfl: float = 0
    insurance: float = 0
    vat: float = 0
    office: float = 0
    labor_cost: float = 0
    operating_cost: float = 0
    cost_price: float = 0
    total_cost: float = 0
    profit: float = 0
    profitability_pct: Optional[float] = None
    fot_margin_pct: Optional[float] = None
    fot_status: Optional[str] = None
    kpi2_revenue: float = 0
    kpi2_bonus_amount: float = 0
    kpi2_paid: bool = False
    kpi2_retention_pct: float = 0


class DashboardOut(BaseModel):
    period: str
    department_name: str
    total_managers: int
    kpis: dict
    members: List[TeamMemberOut]
    metrics: List[MetricsRowOut]
    totals: dict


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(period: str = Query(...), db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    dept = db.get(Department, head.department_id)
    dept_name = dept.name if dept else "вЂ”"
    members_q = db.scalars(
        select(User).where(User.department_id == head.department_id, User.role == "manager", User.is_active.is_(True)).order_by(User.full_name)
    ).all()
    members: list[TeamMemberOut] = []
    metrics: list[MetricsRowOut] = []
    totals = {
        "margin": 0.0, "margin_net": 0.0, "gross": 0.0, "ndfl": 0.0, "insurance": 0.0, "vat": 0.0,
        "office": 0.0, "labor_cost": 0.0, "operating_cost": 0.0, "total_cost": 0.0,
        "cost_price": 0.0, "profit": 0.0, "kpi2_revenue": 0.0, "kpi2_bonus_amount": 0.0, "managers_with_data": 0,
    }
    for m in members_q:
        rec = _latest_record_for(m.id, period, db)
        rec_dict = None
        if rec:
            rec_dict = {
                "id": rec.id, "period": rec.period,
                "service_margin": float(rec.service_margin),
                "goods_margin": float(rec.goods_margin),
                "bonus_total": float(rec.bonus_total),
                "gross_pay": float(rec.gross_pay),
                "tax_amount": float(rec.tax_amount),
                "net_pay": float(rec.net_pay),
                "base_salary": float(rec.base_salary),
                "created_at": rec.created_at.strftime("%d.%m.%Y %H:%M") if rec.created_at else "",
            }
        members.append(TeamMemberOut(
            user_id=m.id, full_name=m.full_name,
            position_name=m.position.name if m.position else "вЂ”",
            grade_name=(m.grade.name if m.grade else None),
            base_salary=(float(m.grade.base_salary) if m.grade else None),
            record=rec_dict,
        ))
        if rec:
            cp = _cost_price_for(m.id, period, db)
            cm = _calc_metrics(rec, cp)
            metrics.append(MetricsRowOut(
                user_id=m.id, full_name=m.full_name, has_record=True,
                **cm, fot_status=_fot_status(cm["fot_margin_pct"]),
            ))
            for k in ("margin", "margin_net", "gross", "ndfl", "insurance", "vat", "office", "labor_cost", "operating_cost", "total_cost", "cost_price", "profit"):
                totals[k] += cm[k]
            totals["managers_with_data"] += 1
            totals["kpi2_revenue"] += cm["kpi2_revenue"]
            totals["kpi2_bonus_amount"] += cm["kpi2_bonus_amount"]
        else:
            metrics.append(MetricsRowOut(user_id=m.id, full_name=m.full_name, has_record=False))
    for k in list(totals.keys()):
        if k != "managers_with_data":
            totals[k] = round(totals[k], 2)
    totals["profitability_pct"] = round(totals["profit"] / totals["margin_net"] * 100, 2) if totals["margin_net"] > 0 else None
    totals["fot_margin_pct"] = round(totals["gross"] / totals["margin_net"] * 100, 2) if totals["margin_net"] > 0 else None
    totals["fot_status"] = _fot_status(totals["fot_margin_pct"])
    kpis = {
        "margin": totals["margin"], "margin_net": totals["margin_net"], "gross": totals["gross"], "profit": totals["profit"],
        "profitability_pct": totals["profitability_pct"],
        "fot_margin_pct": totals["fot_margin_pct"], "fot_status": totals["fot_status"],
        "managers_total": len(members_q), "managers_with_data": totals["managers_with_data"],
    }
    return DashboardOut(
        period=period, department_name=dept_name, total_managers=len(members_q),
        kpis=kpis, members=members, metrics=metrics, totals=totals,
    )


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
    margin_net: float
    gross: float
    ndfl: float
    insurance: float
    vat: float
    office: float
    labor_cost: float
    operating_cost: float
    total_cost: float
    profit: float
    profitability_pct: Optional[float]
    fot_margin_pct: Optional[float]
    fot_status: Optional[str]
    has_record: bool


class ProfitabilityResponse(BaseModel):
    period: str
    department_name: str
    rows: List[ProfitabilityRowOut]
    totals: dict


@router.post("/profitability", response_model=ProfitabilityResponse)
def profitability(payload: ProfitabilityRequest, db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    dept = db.get(Department, head.department_id)
    dept_name = dept.name if dept else "вЂ”"
    rows: list[ProfitabilityRowOut] = []
    totals = {
        "margin": 0.0, "margin_net": 0.0, "gross": 0.0, "ndfl": 0.0, "insurance": 0.0, "vat": 0.0,
        "office": 0.0, "labor_cost": 0.0, "operating_cost": 0.0, "total_cost": 0.0,
        "profit": 0.0, "cost_price": 0.0, "managers_with_data": 0,
    }
    for item in payload.items:
        user = db.get(User, item.user_id)
        if not user or user.department_id != head.department_id or user.role != "manager":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"РњРµРЅРµРґР¶РµСЂ {item.user_id} РЅРµ РЅР°Р№РґРµРЅ РёР»Рё РЅРµ РІС…РѕРґРёС‚ РІ РІР°С€ РѕС‚РґРµР»")
        rec = _latest_record_for(user.id, payload.period, db)
        if not rec:
            rows.append(ProfitabilityRowOut(
                user_id=user.id, full_name=user.full_name, cost_price=item.cost_price,
                margin=0, margin_net=0, gross=0, ndfl=0, insurance=0, vat=0, office=0,
                labor_cost=0, operating_cost=0, total_cost=0, profit=0,
                profitability_pct=None, fot_margin_pct=None, fot_status=None, has_record=False,
            ))
            continue
        cp = item.cost_price if item.cost_price > 0 else _cost_price_for(user.id, payload.period, db)
        cm = _calc_metrics(rec, cp)
        cm.pop("cost_price", None)
        rows.append(ProfitabilityRowOut(
            user_id=user.id, full_name=user.full_name, cost_price=cp,
            has_record=True, **cm, fot_status=_fot_status(cm["fot_margin_pct"]),
        ))
        for k in ("margin", "margin_net", "gross", "ndfl", "insurance", "vat", "office", "labor_cost", "operating_cost", "total_cost", "profit"):
            totals[k] += cm[k]
        totals["cost_price"] += cp
        totals["managers_with_data"] += 1
        totals["kpi2_revenue"] += cm["kpi2_revenue"]
        totals["kpi2_bonus_amount"] += cm["kpi2_bonus_amount"]
    for k in list(totals.keys()):
        if k != "managers_with_data":
            totals[k] = round(totals[k], 2)
    totals["profitability_pct"] = round(totals["profit"] / totals["margin_net"] * 100, 2) if totals["margin_net"] > 0 else None
    totals["fot_margin_pct"] = round(totals["gross"] / totals["margin_net"] * 100, 2) if totals["margin_net"] > 0 else None
    totals["fot_status"] = _fot_status(totals["fot_margin_pct"])
    return ProfitabilityResponse(period=payload.period, department_name=dept_name, rows=rows, totals=totals)


@router.get("/costs", response_model=dict)
def costs(period: str = Query(...), db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    dept = db.get(Department, head.department_id)
    dept_name = dept.name if dept else "вЂ”"
    managers = db.scalars(
        select(User).where(User.department_id == head.department_id, User.role == "manager", User.is_active.is_(True))
    ).all()
    items = []
    totals = {
        "managers": 0, "office": 0.0, "gross": 0.0, "ndfl": 0.0, "insurance": 0.0,
        "vat": 0.0, "margin": 0.0, "margin_net": 0.0, "cost_price": 0.0,
        "profit": 0.0, "labor_cost": 0.0, "operating_cost": 0.0,
    }
    for m in managers:
        rec = _latest_record_for(m.id, period, db)
        office = settings.OFFICE_COST_PER_EMPLOYEE
        cp = _cost_price_for(m.id, period, db)
        row = {
            "user_id": m.id, "full_name": m.full_name, "office": office,
            "cost_price": cp,
            "has_record": False, "gross": 0.0, "ndfl": 0.0, "insurance": 0.0,
            "vat": 0.0, "margin": 0.0, "margin_net": 0.0, "profit": 0.0,
            "fot_margin_pct": None, "fot_status": None,
            "labor_cost": 0.0, "operating_cost": 0.0,
        }
        if rec:
            cm = _calc_metrics(rec, cp)
            row.update({
                "has_record": True, "gross": cm["gross"], "ndfl": cm["ndfl"],
                "insurance": cm["insurance"], "vat": cm["vat"], "margin": cm["margin"],
                "margin_net": cm["margin_net"], "profit": cm["profit"],
                "fot_margin_pct": cm["fot_margin_pct"], "fot_status": _fot_status(cm["fot_margin_pct"]),
                "labor_cost": cm["labor_cost"], "operating_cost": cm["operating_cost"],
            })
            totals["gross"] += cm["gross"]; totals["ndfl"] += cm["ndfl"]
            totals["insurance"] += cm["insurance"]; totals["vat"] += cm["vat"]
            totals["margin"] += cm["margin"]; totals["margin_net"] += cm["margin_net"]
            totals["profit"] += cm["profit"]
        totals["office"] += office
        totals["cost_price"] += cp
        totals["managers"] += 1
        items.append(row)
    for k in ("office", "gross", "ndfl", "insurance", "vat", "margin", "margin_net", "cost_price", "profit"):
        totals[k] = round(totals[k], 2)
    totals["labor_cost"] = round(totals["gross"] + totals["ndfl"] + totals["insurance"], 2)
    totals["operating_cost"] = round(totals["vat"] + totals["office"], 2)
    totals["profitability_pct"] = round(totals["profit"] / totals["margin_net"] * 100, 2) if totals["margin_net"] > 0 else None
    totals["fot_margin_pct"] = round(totals["gross"] / totals["margin_net"] * 100, 2) if totals["margin_net"] > 0 else None
    totals["fot_status"] = _fot_status(totals["fot_margin_pct"])
    return {
        "period": period, "department_name": dept_name,
        "office_per_employee": settings.OFFICE_COST_PER_EMPLOYEE,
        "insurance_rate_pct": settings.INSURANCE_RATE_PERCENT,
        "vat_rate_pct": settings.VAT_RATE_PERCENT,
        "ndfl_rate_pct": settings.NDFL_RATE_PERCENT,
        "fot_normal_pct": settings.FOT_MARGIN_NORMAL_PCT,
        "fot_critical_pct": settings.FOT_MARGIN_CRITICAL_PCT,
        "items": items, "totals": totals,
    }


def _prev_period(period: str) -> str:
    try:
        y, m = map(int, period.split("-"))
        m -= 1
        if m == 0:
            m = 12; y -= 1
        return f"{y:04d}-{m:02d}"
    except Exception:
        return period


class HistoryOut(BaseModel):
    from_period: str
    to_period: str
    department_name: str
    managers: List[dict]
    monthly: List[dict]
    by_manager: List[dict]


@router.get("/history", response_model=HistoryOut)
def history(from_period: str = Query(..., alias="from"), to_period: str = Query(..., alias="to"),
            db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    dept = db.get(Department, head.department_id)
    dept_name = dept.name if dept else "вЂ”"
    managers = db.scalars(
        select(User).where(User.department_id == head.department_id, User.role == "manager", User.is_active.is_(True)).order_by(User.full_name)
    ).all()
    periods = _period_range(from_period, to_period)
    by_manager = []
    monthly = []
    for p in periods:
        margins = 0.0; margins_net = 0.0; gross = 0.0; profit = 0.0; fot_pct_sum = 0.0; fot_count = 0
        for m in managers:
            rec = _latest_record_for(m.id, p, db)
            if rec:
                cp = _cost_price_for(m.id, p, db)
                cm = _calc_metrics(rec, cp)
                margins += cm["margin"]; margins_net += cm["margin_net"]
                gross += cm["gross"]; profit += cm["profit"]
                if cm["fot_margin_pct"] is not None:
                    fot_pct_sum += cm["fot_margin_pct"]; fot_count += 1
        monthly.append({
            "period": p,
            "margin": round(margins, 2),
            "margin_net": round(margins_net, 2),
            "gross": round(gross, 2),
            "profit": round(profit, 2),
            "profitability_pct": round(profit / margins_net * 100, 2) if margins_net > 0 else None,
            "fot_margin_pct": round(fot_pct_sum / fot_count, 2) if fot_count > 0 else None,
        })
    for m in managers:
        per_period = []
        for p in periods:
            rec = _latest_record_for(m.id, p, db)
            if rec:
                cp = _cost_price_for(m.id, p, db)
                cm = _calc_metrics(rec, cp)
                per_period.append({
                    "period": p, "margin": cm["margin"], "margin_net": cm["margin_net"],
                    "profit": cm["profit"],
                    "profitability_pct": cm["profitability_pct"],
                    "fot_margin_pct": cm["fot_margin_pct"],
                })
            else:
                per_period.append({"period": p, "margin": 0, "margin_net": 0, "profit": 0, "profitability_pct": None, "fot_margin_pct": None})
        by_manager.append({
            "user_id": m.id, "full_name": m.full_name,
            "data": per_period,
        })
    return HistoryOut(
        from_period=from_period, to_period=to_period,
        department_name=dept_name,
        managers=[{"user_id": m.id, "full_name": m.full_name} for m in managers],
        monthly=monthly, by_manager=by_manager,
    )


class WaterfallItemOut(BaseModel):
    user_id: int
    full_name: str
    current_margin: float
    previous_margin: float
    delta: float
    has_current: bool
    has_previous: bool


class WaterfallOut(BaseModel):
    period: str
    previous_period: str
    previous_total: float
    current_total: float
    total_delta: float
    items: List[WaterfallItemOut]


@router.get("/waterfall", response_model=WaterfallOut)
def waterfall(period: str = Query(...), db: Session = Depends(get_db), head: User = Depends(get_current_head)):
    prev_p = _prev_period(period)
    managers = db.scalars(
        select(User).where(User.department_id == head.department_id, User.role == "manager", User.is_active.is_(True)).order_by(User.full_name)
    ).all()
    items: list[WaterfallItemOut] = []
    prev_total = 0.0
    cur_total = 0.0
    for m in managers:
        cur_rec = _latest_record_for(m.id, period, db)
        prev_rec = _latest_record_for(m.id, prev_p, db)
        cur_m = round(float(cur_rec.service_margin) + float(cur_rec.goods_margin), 2) if cur_rec else 0.0
        prev_m = round(float(prev_rec.service_margin) + float(prev_rec.goods_margin), 2) if prev_rec else 0.0
        delta = round(cur_m - prev_m, 2)
        items.append(WaterfallItemOut(
            user_id=m.id, full_name=m.full_name,
            current_margin=cur_m, previous_margin=prev_m, delta=delta,
            has_current=cur_rec is not None, has_previous=prev_rec is not None,
        ))
        cur_total += cur_m
        prev_total += prev_m
    return WaterfallOut(
        period=period, previous_period=prev_p,
        previous_total=round(prev_total, 2),
        current_total=round(cur_total, 2),
        total_delta=round(cur_total - prev_total, 2),
        items=items,
    )


def _period_range(start: str, end: str) -> List[str]:
    try:
        y, m = map(int, start.split("-"))
        ey, em = map(int, end.split("-"))
        out = []
        cy, cm = y, m
        while (cy, cm) <= (ey, em):
            out.append(f"{cy:04d}-{cm:02d}")
            cm += 1
            if cm > 12:
                cm = 1; cy += 1
            if len(out) > 120:
                break
        return out
    except Exception:
        return [start]
