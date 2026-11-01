"""Authentication helpers: scrypt password hashing, JWT session cookie, role checks.

Controls implemented and tested: salted scrypt hashes (no plaintext storage), httpOnly SameSite=Lax
session cookie, CSRF header requirement on state-changing requests, simple in-memory login
throttling, role-based authorization. Not implemented: MFA, account lockout persistence,
key rotation, external audit — so this is not claimed to be production-grade.
"""
import base64
import hashlib
import hmac
import os
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from . import models
from .config import get_settings
from .database import get_db

_N, _R, _P = 2 ** 14, 8, 1


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, dk_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        dk = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), n=int(n), r=int(r), p=int(p), dklen=32)
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except (ValueError, TypeError):
        return False


def create_token(user: models.User) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user.id), "role": user.role, "iat": now, "exp": now + timedelta(minutes=s.access_token_minutes)},
                      s.jwt_secret, algorithm=s.jwt_algorithm)


# ---- login throttling (per email + ip, sliding window) ----
_attempts: dict[str, deque] = defaultdict(deque)
MAX_ATTEMPTS, WINDOW_S = 5, 300


def check_throttle(key: str) -> None:
    q = _attempts[key]
    now = time.monotonic()
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    if len(q) >= MAX_ATTEMPTS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many failed sign-in attempts. Try again in a few minutes.")


def record_failure(key: str) -> None:
    _attempts[key].append(time.monotonic())


def clear_failures(key: str) -> None:
    _attempts.pop(key, None)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> models.User:
    s = get_settings()
    token = request.cookies.get(s.cookie_name)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or invalid")
    user = db.get(models.User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not available")
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-requested-with") != "cicd":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing CSRF header")
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator role required")
    return user
