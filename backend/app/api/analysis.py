from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import AnalysisIn, ReopenIn, ReviewIn
from ..security import get_current_user
from ..services.audit import audit
from ..services.pipeline import start_analysis
from .serializers import conflict_out, run_out

router = APIRouter(prefix="/api", tags=["analysis"])

REJECT_REASONS = ["Not clinically relevant", "Instructions already reconciled", "Extraction error", "Evidence does not apply",
                  "Duplicate finding", "Other"]


@router.post("/cases/{case_id}/analyze", status_code=202)
def analyze(case_id: str, body: AnalysisIn, request: Request, db: Session = Depends(get_db),
            user: models.User = Depends(get_current_user)):
    case = db.get(models.Case, case_id)
    if not case or case.is_test:
        raise HTTPException(404, "Case not found")
    if case.archived:
        raise HTTPException(409, "Archived cases cannot be analysed")
    if len(case.notes) < 2:
        raise HTTPException(422, "Add at least two specialist notes before running cross-instruction analysis")
    active = db.scalar(select(models.AnalysisRun).where(models.AnalysisRun.case_id == case_id,
                                                        models.AnalysisRun.status.in_(["queued", "running"])))
    if active:
        raise HTTPException(409, f"Analysis run {active.id} is already in progress")
    audit(db, user, "analysis.start", "case", case_id, f"config={body.config}, llm={body.use_llm}", request)
    run = start_analysis(db, case, user, body.config, body.use_llm, body.reextract)
    return run_out(run)


@router.get("/runs")
def list_runs(case_id: str | None = None, limit: int = 50, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    stmt = select(models.AnalysisRun).join(models.Case).where(models.Case.is_test.is_(False)).order_by(models.AnalysisRun.id.desc()).limit(min(limit, 200))
    if case_id:
        stmt = stmt.where(models.AnalysisRun.case_id == case_id)
    return [run_out(r) for r in db.scalars(stmt).all()]


@router.get("/runs/{run_id}")
def get_run(run_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    r = db.get(models.AnalysisRun, run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    db.refresh(r)
    out = run_out(r)
    if r.status == "completed":
        out["conflicts"] = [conflict_out(c, False) for c in db.scalars(select(models.Conflict).where(models.Conflict.run_id == r.id)).all()]
    return out


@router.post("/runs/{run_id}/cancel")
def cancel_run(run_id: int, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    r = db.get(models.AnalysisRun, run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    if r.status not in ("queued", "running"):
        raise HTTPException(409, f"Run is already {r.status}")
    r.cancel_requested = True
    audit(db, user, "analysis.cancel", "run", r.id, request=request)
    db.commit()
    return run_out(r)


# ---------------- conflicts ----------------
@router.get("/conflicts")
def list_conflicts(case_id: str | None = None, category: str | None = None, severity: str | None = None,
                   status: str | None = None, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    stmt = select(models.Conflict).join(models.Case).where(models.Case.is_test.is_(False)).order_by(models.Conflict.created_at.desc())
    if case_id:
        stmt = stmt.where(models.Conflict.case_id == case_id)
    if category:
        stmt = stmt.where(models.Conflict.category == category)
    if severity:
        stmt = stmt.where(models.Conflict.severity == severity)
    if status:
        stmt = stmt.where(models.Conflict.validation_status == status)
    return [conflict_out(c) for c in db.scalars(stmt).all()]


@router.get("/conflicts/{conflict_id}")
def get_conflict(conflict_id: str, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    c = db.get(models.Conflict, conflict_id)
    if not c:
        raise HTTPException(404, "Conflict not found")
    out = conflict_out(c)
    case = c.case
    out["case"] = {"id": case.id, "pseudonym": case.pseudonym}
    notes = {n.id: n for n in case.notes}
    out["notes"] = [{"id": nid, "title": notes[nid].title, "specialty": notes[nid].specialty, "source_id": notes[nid].source_id,
                     "specialist_name": notes[nid].specialist_name, "content": notes[nid].content}
                    for nid in c.note_ids if nid in notes]
    return out


@router.get("/validation/queue")
def validation_queue(include_reviewed: bool = False, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    stmt = select(models.Conflict).join(models.Case).where(models.Case.is_test.is_(False), models.Case.archived.is_(False))
    if not include_reviewed:
        stmt = stmt.where(models.Conflict.validation_status.in_(["pending", "clarification_requested"]))
    order = {"critical": 0, "high": 1, "uncertain": 2, "moderate": 3, "low": 4}
    items = sorted(db.scalars(stmt).all(), key=lambda c: (order.get(c.severity, 9), c.created_at))
    return {"items": [conflict_out(c) for c in items], "reject_reasons": REJECT_REASONS}


@router.post("/conflicts/{conflict_id}/review")
def review(conflict_id: str, body: ReviewIn, request: Request, db: Session = Depends(get_db),
           user: models.User = Depends(get_current_user)):
    c = db.get(models.Conflict, conflict_id)
    if not c:
        raise HTTPException(404, "Conflict not found")
    if c.validation_status in ("confirmed", "rejected", "uncertain"):
        raise HTTPException(409, "This finding has already been reviewed; reopen it to record a new decision")
    if body.decision == "rejected" and not body.reason:
        raise HTTPException(422, "A reason is required when rejecting a finding")
    if body.decision == "clarification_requested" and not body.comment.strip():
        raise HTTPException(422, "Describe what needs clarification")
    db.add(models.ReviewDecision(conflict_id=c.id, reviewer_id=user.id, reviewer_name=user.full_name, decision=body.decision,
                                 reason=body.reason, comment=body.comment, previous_status=c.validation_status))
    c.validation_status = body.decision
    audit(db, user, f"review.{body.decision}", "conflict", c.id, body.reason or body.comment[:200], request)
    _sync_case_status(db, c.case)
    db.commit()
    db.refresh(c)
    return conflict_out(c)


@router.post("/conflicts/{conflict_id}/reopen")
def reopen(conflict_id: str, body: ReopenIn, request: Request, db: Session = Depends(get_db),
           user: models.User = Depends(get_current_user)):
    c = db.get(models.Conflict, conflict_id)
    if not c:
        raise HTTPException(404, "Conflict not found")
    if c.validation_status == "pending":
        raise HTTPException(409, "Finding is not reviewed")
    last = c.reviews[-1] if c.reviews else None
    if user.role != "admin" and (not last or last.reviewer_id != user.id):
        raise HTTPException(403, "Only the original reviewer or an administrator can reopen this finding")
    db.add(models.ReviewDecision(conflict_id=c.id, reviewer_id=user.id, reviewer_name=user.full_name, decision="reopened",
                                 comment=body.comment, previous_status=c.validation_status))
    c.validation_status = "pending"
    audit(db, user, "review.reopen", "conflict", c.id, body.comment[:200], request)
    _sync_case_status(db, c.case)
    db.commit()
    db.refresh(c)
    return conflict_out(c)


def _sync_case_status(db: Session, case: models.Case) -> None:
    if case.archived:
        return
    open_items = [x for x in case.conflicts if x.validation_status in ("pending", "clarification_requested")]
    case.status = "in_review" if open_items else ("reviewed" if case.conflicts else case.status)
    for plan in db.scalars(select(models.DietPlan).where(models.DietPlan.case_id == case.id)).all():
        note = db.scalar(select(models.Note).where(models.Note.diet_plan_id == plan.id))
        related = [x for x in case.conflicts if note and note.id in x.note_ids]
        if plan.status == "awaiting_review" and related and all(x.validation_status not in ("pending", "clarification_requested") for x in related):
            plan.status = "reviewed"
