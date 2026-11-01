import json
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from . import database
from .api import analysis, auth, cases, diet, knowledge, misc, testing
from .config import get_settings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {"ts": self.formatTime(record), "level": record.levelname, "logger": record.name, "msg": record.getMessage()}
        for k in ("method", "path", "status", "ms"):
            if hasattr(record, k):
                payload[k] = getattr(record, k)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload)


def setup_logging() -> None:
    h = logging.StreamHandler()
    h.setFormatter(JsonFormatter())
    root = logging.getLogger("cicd")
    root.handlers[:] = [h]
    root.setLevel(get_settings().log_level)
    root.propagate = False


def init_db(seed: bool = True) -> None:
    from . import models  # noqa: F401 - register tables
    from .seed.demo import seed_all

    database.Base.metadata.create_all(database.engine)
    if seed and get_settings().demo_mode:
        with database.SessionLocal() as db:
            seed_all(db)


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()
    init_db()
    s = get_settings()
    if s.environment != "development" and s.jwt_secret.startswith("dev-only"):
        raise RuntimeError("JWT_SECRET must be set outside development")
    yield


app = FastAPI(title="CICD AI — Cross-Instruction Conflict Detector API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origin_list, allow_credentials=True,
                   allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"], allow_headers=["Content-Type", "X-Requested-With"])

log = logging.getLogger("cicd.http")


@app.middleware("http")
async def access_log(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    if request.url.path.startswith("/api"):
        log.info("request", extra={"method": request.method, "path": request.url.path, "status": response.status_code,
                                   "ms": round((time.perf_counter() - t0) * 1000, 1)})
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse({"detail": "Validation failed", "errors": errors}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    logging.getLogger("cicd").exception("unhandled error")
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": get_settings().app_name}


for r in (auth.router, cases.router, analysis.router, knowledge.router, diet.router, testing.router, misc.router):
    app.include_router(r)

# Serve the pre-built website (frontend/dist) so a single server runs the whole app.
DIST = (Path(__file__).resolve().parent.parent.parent / "frontend" / "dist").resolve()
if (DIST / "index.html").exists():
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        f = (DIST / full_path).resolve()
        if full_path and f.is_file() and DIST in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")  # client-side routes
