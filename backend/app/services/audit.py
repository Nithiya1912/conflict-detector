from fastapi import Request
from sqlalchemy.orm import Session

from .. import models


def audit(db: Session, user: models.User | None, action: str, entity_type: str, entity_id: str | int = "",
          detail: str = "", request: Request | None = None) -> None:
    db.add(models.AuditLog(
        actor_id=user.id if user else None,
        actor_email=user.email if user else "system",
        action=action, entity_type=entity_type, entity_id=str(entity_id), detail=detail[:2000],
        ip=request.client.host if request and request.client else None,
    ))
