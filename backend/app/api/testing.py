import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import RunTestsIn
from ..security import get_current_user
from ..services import test_runner
from ..services.audit import audit
from ..services.detection import PIPELINE_CONFIGS
from ..services.knowledge import ALL_CATEGORIES

router = APIRouter(prefix="/api", tags=["testing"])

SESSION_FIELDS = ("id", "title", "description", "focus", "notes", "expected_categories", "expected_outcome", "expected_evidence",
                  "expected_severity_band", "assumptions", "status", "actual_categories", "actual_outcome", "result",
                  "executed_at", "duration_ms")


def _s_out(s: models.TestSession, full: bool = False) -> dict:
    d = {k: getattr(s, k) for k in SESSION_FIELDS}
    if not full:
        d.pop("result")
        d.pop("notes")
        d["note_count"] = len(s.notes)
    return d


def _summary(sessions: list[models.TestSession]) -> dict:
    executed = [s for s in sessions if s.status != "not_run"]
    m = test_runner.compute_metrics([(s.expected_categories, s.actual_categories, s.status, s.result) for s in executed]) if executed else None
    return {"total": len(sessions), "executed": len(executed),
            "completion_rate": round(len(executed) / len(sessions), 4) if sessions else None,
            "pass": sum(s.status == "pass" for s in sessions), "fail": sum(s.status == "fail" for s in sessions),
            "needs_review": sum(s.status == "needs_review" for s in sessions), "not_run": sum(s.status == "not_run" for s in sessions),
            "total_duration_ms": sum(s.duration_ms or 0 for s in executed), "metrics": m}


@router.get("/test-sessions")
def list_sessions(category: str | None = None, status: str | None = None, db: Session = Depends(get_db),
                  _: models.User = Depends(get_current_user)):
    sessions = db.scalars(select(models.TestSession).order_by(models.TestSession.id)).all()
    shown = [s for s in sessions if (not category or category in s.expected_categories or category in s.focus)
             and (not status or s.status == status)]
    return {"sessions": [_s_out(s) for s in shown], "summary": _summary(sessions), "policy": test_runner.__doc__}


@router.get("/test-sessions/export")
def export(fmt: str = "csv", db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    sessions = db.scalars(select(models.TestSession).order_by(models.TestSession.id)).all()
    if fmt == "json":
        body = json.dumps({"summary": _summary(sessions), "sessions": [_s_out(s, True) for s in sessions]}, default=str, indent=2)
        return Response(body, media_type="application/json", headers={"Content-Disposition": "attachment; filename=cicd-test-sessions.json"})
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "title", "expected_categories", "expected_outcome", "actual_categories", "actual_outcome", "status",
                "executed_at", "duration_ms"])
    for s in sessions:
        w.writerow([s.id, s.title, "; ".join(s.expected_categories), s.expected_outcome, "; ".join(s.actual_categories),
                    s.actual_outcome or "", s.status, s.executed_at or "", s.duration_ms or ""])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=cicd-test-sessions.csv"})


@router.get("/test-sessions/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    s = db.get(models.TestSession, session_id)
    if not s:
        raise HTTPException(404, "Test session not found")
    history = db.scalars(select(models.TestExecution).where(models.TestExecution.session_id == s.id)
                         .order_by(models.TestExecution.id.desc()).limit(30)).all()
    return {**_s_out(s, True), "history": [{"id": e.id, "config_name": e.config_name, "status": e.status,
                                            "actual_categories": e.actual_categories, "actual_outcome": e.actual_outcome,
                                            "executed_at": e.executed_at, "duration_ms": e.duration_ms,
                                            "evaluation_run_id": e.evaluation_run_id} for e in history]}


@router.post("/test-sessions/run")
def run_tests(body: RunTestsIn, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    stmt = select(models.TestSession).order_by(models.TestSession.id)
    sessions = db.scalars(stmt).all()
    if body.session_ids:
        wanted = set(body.session_ids)
        sessions = [s for s in sessions if s.id in wanted]
        if not sessions:
            raise HTTPException(404, "No matching test sessions")
    if body.only_failed:
        sessions = [s for s in sessions if s.status in ("fail", "needs_review")]
    test_runner.run_sessions(db, sessions, "full")
    audit(db, user, "tests.run", "test_session", ",".join(s.id for s in sessions)[:60], f"{len(sessions)} session(s)", request)
    db.commit()
    return {"ran": [s.id for s in sessions], "summary": _summary(db.scalars(select(models.TestSession)).all())}


# ---------------- evaluation ----------------
def _eval_out(e: models.EvaluationRun) -> dict:
    return {"id": e.id, "label": e.label, "configs": e.configs, "results": e.results, "sessions_count": e.sessions_count,
            "created_at": e.created_at, "duration_ms": e.duration_ms}


@router.get("/evaluation")
def evaluation(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    runs = db.scalars(select(models.EvaluationRun).order_by(models.EvaluationRun.id.desc()).limit(20)).all()
    sessions = db.scalars(select(models.TestSession)).all()
    reviewed = db.scalars(select(models.Conflict).join(models.Case).where(
        models.Case.is_test.is_(False), models.Conflict.validation_status.in_(["confirmed", "rejected", "uncertain"]))).all()
    confirmed = sum(c.validation_status == "confirmed" for c in reviewed)
    rejected = sum(c.validation_status == "rejected" for c in reviewed)
    decided = confirmed + rejected
    reasons: dict[str, int] = {}
    for c in reviewed:
        if c.validation_status == "rejected" and c.reviews:
            r = next((x.reason for x in reversed(c.reviews) if x.decision == "rejected"), None) or "Unspecified"
            reasons[r] = reasons.get(r, 0) + 1
    all_conf = db.scalars(select(models.Conflict).join(models.Case).where(models.Case.is_test.is_(False))).all()
    return {
        "latest": _eval_out(runs[0]) if runs else None,
        "history": [{"id": r.id, "label": r.label, "created_at": r.created_at, "duration_ms": r.duration_ms,
                     "f1": {k: v.get("f1") for k, v in r.results.items()}} for r in runs],
        "current_suite": _summary(sessions),
        "categories": ALL_CATEGORIES,
        "configs": {k: v["label"] for k, v in PIPELINE_CONFIGS.items()},
        "human_validation": {
            "reviewed": len(reviewed), "confirmed": confirmed, "rejected": rejected,
            "uncertain": sum(c.validation_status == "uncertain" for c in reviewed),
            "agreement": round(confirmed / decided, 4) if decided >= 5 else None,
            "sufficient": decided >= 5, "min_required": 5, "rejection_reasons": reasons,
            "note": "Agreement = share of decided findings (confirmed + rejected) that reviewers confirmed. "
                    "Rejections are stored for evaluation; the system does not learn from them automatically."},
        "evidence_coverage_live": round(sum(any(e.get("supporting") for e in c.evidence) for c in all_conf) / len(all_conf), 4) if all_conf else None,
    }


@router.post("/evaluation/run", status_code=201)
def run_evaluation(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    ev = test_runner.run_evaluation(db, user)
    audit(db, user, "evaluation.run", "evaluation", ev.id, f"{ev.sessions_count} sessions × {len(ev.configs)} configs", request)
    db.commit()
    return _eval_out(ev)


@router.get("/evaluation/{run_id}/export")
def export_eval(run_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    e = db.get(models.EvaluationRun, run_id)
    if not e:
        raise HTTPException(404, "Evaluation run not found")
    body = json.dumps({"evaluation": _eval_out(e), "metric_definitions": {
        "precision": "TP / (TP + FP); undefined (null) when TP + FP = 0",
        "recall": "TP / (TP + FN); undefined (null) when TP + FN = 0",
        "f1": "2PR / (P + R); null when P or R undefined", "unit": "category-level decision per test session"}},
        default=str, indent=2)
    return Response(body, media_type="application/json", headers={"Content-Disposition": f"attachment; filename=cicd-evaluation-{run_id}.json"})
