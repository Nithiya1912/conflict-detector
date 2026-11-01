from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..database import get_db
from ..schemas import LoginIn, RegisterIn, UserOut, UserRoleIn
from ..security import (check_throttle, clear_failures, create_token, get_current_user, hash_password, record_failure,
                        require_admin, verify_password)
from ..seed.demo import DEMO_USERS
from ..services.audit import audit

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _csrf(request: Request):
    if request.headers.get("x-requested-with") != "cicd":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing CSRF header")


def _set_cookie(resp: Response, token: str):
    s = get_settings()
    resp.set_cookie(s.cookie_name, token, httponly=True, samesite="lax", secure=s.cookie_secure,
                    max_age=s.access_token_minutes * 60, path="/")


@router.get("/config")
def auth_config():
    s = get_settings()
    return {"demo_mode": s.demo_mode,
            "demo_accounts": [{"email": e, "role": r, "password": p, "name": n} for e, n, r, p in DEMO_USERS] if s.demo_mode else []}


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    _csrf(request)
    key = f"{body.email.lower()}|{request.client.host if request.client else ''}"
    check_throttle(key)
    user = db.scalar(select(models.User).where(models.User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash) or not user.is_active:
        record_failure(key)
        audit(db, None, "auth.login_failed", "user", body.email.lower(), request=request)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    clear_failures(key)
    user.last_login_at = datetime.now(timezone.utc)
    audit(db, user, "auth.login", "user", user.id, request=request)
    db.commit()
    _set_cookie(response, create_token(user))
    return user


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    _csrf(request)
    email = body.email.lower()
    if db.scalar(select(models.User).where(models.User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = models.User(email=email, full_name=body.full_name.strip(), role="clinician", password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    audit(db, user, "auth.register", "user", user.id, request=request)
    db.commit()
    _set_cookie(response, create_token(user))
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    audit(db, user, "auth.logout", "user", user.id, request=request)
    db.commit()
    response.delete_cookie(get_settings().cookie_name, path="/")


@router.get("/me", response_model=UserOut)
def me(user: models.User = Depends(get_current_user)):
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(_: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(models.User).order_by(models.User.created_at)).all()


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserRoleIn, request: Request, admin: models.User = Depends(require_admin),
                db: Session = Depends(get_db)):
    u = db.get(models.User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == admin.id and (body.role == "clinician" or body.is_active is False):
        raise HTTPException(400, "You cannot demote or deactivate your own account")
    changes = body.model_dump(exclude_none=True)
    for k, v in changes.items():
        setattr(u, k, v)
    audit(db, admin, "user.update", "user", u.id, str(changes), request)
    db.commit()
    return u
