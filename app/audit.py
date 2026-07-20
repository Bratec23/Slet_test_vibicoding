from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.models import LoginAudit


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _user_agent(request: Request) -> str:
    ua = request.headers.get("user-agent", "")
    return (ua or "")[:500]


def log_event(
    db: Session,
    request: Request,
    event_type: str,
    email: str,
    success: bool,
    user_id: Optional[int] = None,
    detail: Optional[str] = None,
) -> None:
    try:
        row = LoginAudit(
            user_id=user_id,
            email=(email or "")[:255],
            event_type=event_type,
            success=success,
            ip=_client_ip(request),
            user_agent=_user_agent(request),
            detail=detail,
        )
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
