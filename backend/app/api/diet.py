from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import DietPlanIn, DietPlanUpdate
from ..security import get_current_user
from ..seed.demo import diet_plan_text
from ..services.audit import audit
from ..services.deid import deidentify
from ..services.detection import PIPELINE_CONFIGS, detect
from ..services.extraction import extract
from ..services.pipeline import extract_note, instruction_dict, make_context, start_analysis
from .serializers import conflict_out, plan_out, run_out

router = APIRouter(prefix="/api/diet-plans", tags=["diet"])

CONTENT_FIELDS = {"title", "meals", "restrictions", "nutrition_notes", "lifestyle_notes"}


def _plan(db: Session, plan_id: int) -> models.DietPlan:
    p = db.get(models.DietPlan, plan_id)
    if not p:
        raise HTTPException(404, "Diet plan not found")
    return p


def _note(db: Session, plan: models.DietPlan) -> models.Note | None:
    return db.scalar(select(models.Note).where(models.Note.diet_plan_id == plan.id))


@router.get("")
def list_plans(case_id: str | None = None, status: str | None = None, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    stmt = select(models.DietPlan).order_by(models.DietPlan.updated_at.desc())
    if case_id:
        stmt = stmt.where(models.DietPlan.case_id == case_id)
    if status:
        stmt = stmt.where(models.DietPlan.status == status)
    out = []
    for p in db.scalars(stmt).all():
        note = _note(db, p)
        flags = db.scalars(select(models.Conflict).where(models.Conflict.case_id == p.case_id)).all()
        d = plan_out(p, note)
        d["flag_count"] = sum(1 for c in flags if note and note.id in c.note_ids)
        d["case_pseudonym"] = db.get(models.Case, p.case_id).pseudonym
        out.append(d)
    return out


def _sync_note(db: Session, plan: models.DietPlan) -> models.Note:
    case = db.get(models.Case, plan.case_id)
    text, red = deidentify(diet_plan_text(plan))
    note = _note(db, plan)
    if not note:
        note = models.Note(source_id=f"{case.id}-DP{plan.id}", specialist_name=plan.specialist_name, specialty=plan.specialty,
                           title=f"Diet plan: {plan.title}", content=text, category="diet", diet_plan_id=plan.id, pii_redactions=red)
        case.notes.append(note)
    else:
        note.content, note.title, note.specialist_name, note.pii_redactions = text, f"Diet plan: {plan.title}", plan.specialist_name, red
        for i in list(note.instructions):
            note.instructions.remove(i)
    db.flush()
    extract_note(db, note)
    return note


@router.post("", status_code=201)
def create_plan(body: DietPlanIn, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    case = db.get(models.Case, body.case_id)
    if not case or case.is_test or case.archived:
        raise HTTPException(404, "Case not found or archived")
    data = body.model_dump()
    p = models.DietPlan(**data, version=1, status="draft", is_demo=case.is_demo)
    db.add(p)
    db.flush()
    note = _sync_note(db, p)
    audit(db, user, "diet_plan.create", "diet_plan", p.id, p.title, request)
    db.commit()
    return plan_out(p, note)


@router.get("/{plan_id}")
def get_plan(plan_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    p = _plan(db, plan_id)
    note = _note(db, p)
    case = db.get(models.Case, p.case_id)
    flags = [conflict_out(c) for c in case.conflicts if note and note.id in c.note_ids]
    meds = [instruction_dict(i, n) for n in case.notes for i in n.instructions if i.kind == "medication" and not i.excluded]
    versions = db.scalars(select(models.DietPlan).where(models.DietPlan.case_id == p.case_id, models.DietPlan.title == p.title)).all()
    return {**plan_out(p, note), "case": {"id": case.id, "pseudonym": case.pseudonym},
            "plan_text": note.content if note else diet_plan_text(p),
            "extracted": [instruction_dict(i, note) for i in note.instructions] if note else [],
            "medications": meds, "flags": flags,
            "other_notes": [{"id": n.id, "title": n.title, "specialty": n.specialty} for n in case.notes if not n.diet_plan_id],
            "related_plans": [{"id": v.id, "version": v.version, "status": v.status} for v in versions if v.id != p.id]}


@router.patch("/{plan_id}")
def update_plan(plan_id: int, body: DietPlanUpdate, request: Request, db: Session = Depends(get_db),
                user: models.User = Depends(get_current_user)):
    p = _plan(db, plan_id)
    if p.status == "archived" and body.status != "draft":
        raise HTTPException(409, "Archived plans are read-only; restore to draft first")
    changes = body.model_dump(exclude_none=True)
    for k, v in changes.items():
        setattr(p, k, v)
    if CONTENT_FIELDS & set(changes):
        p.version += 1
        p.status = "draft"
        _sync_note(db, p)
    audit(db, user, "diet_plan.update", "diet_plan", p.id, f"v{p.version}: {', '.join(changes)}", request)
    db.commit()
    return plan_out(p, _note(db, p))


@router.post("/{plan_id}/duplicate", status_code=201)
def duplicate(plan_id: int, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    src = _plan(db, plan_id)
    p = models.DietPlan(case_id=src.case_id, title=f"{src.title} (copy)", specialist_name=src.specialist_name, specialty=src.specialty,
                        meals=src.meals, restrictions=src.restrictions, nutrition_notes=src.nutrition_notes,
                        lifestyle_notes=src.lifestyle_notes, version=1, status="draft", is_demo=src.is_demo, parent_id=src.id)
    db.add(p)
    db.flush()
    note = _sync_note(db, p)
    audit(db, user, "diet_plan.duplicate", "diet_plan", p.id, f"from {src.id}", request)
    db.commit()
    return plan_out(p, note)


@router.post("/{plan_id}/analyze", status_code=202)
def analyze_plan(plan_id: int, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    p = _plan(db, plan_id)
    case = db.get(models.Case, p.case_id)
    if len(case.notes) < 2:
        raise HTTPException(422, "The case needs at least one other specialist note to compare against")
    active = db.scalar(select(models.AnalysisRun).where(models.AnalysisRun.case_id == case.id, models.AnalysisRun.status.in_(["queued", "running"])))
    if active:
        raise HTTPException(409, "An analysis is already running for this case")
    audit(db, user, "diet_plan.analyze", "diet_plan", p.id, request=request)
    return run_out(start_analysis(db, case, user, "full", True, False))


def _plan_instrs(plan: models.DietPlan, note_id: int) -> list[dict]:
    out = []
    for k, e in enumerate(extract(diet_plan_text(plan))):
        d = e.to_dict()
        d.update({"id": note_id * 1000 + k, "note_id": note_id, "source_id": f"PLAN-{plan.id}", "specialty": plan.specialty,
                  "specialist_name": plan.specialist_name, "excluded": False})
        out.append(d)
    return out


@router.get("/{plan_id}/compare")
def compare(plan_id: int, other_plan_id: int | None = None, against: str = "medications", db: Session = Depends(get_db),
            _: models.User = Depends(get_current_user)):
    """Compare a plan with another plan, or with the case's medication instructions / other notes (not persisted)."""
    p = _plan(db, plan_id)
    a = _plan_instrs(p, -1)
    if other_plan_id:
        q = _plan(db, other_plan_id)
        b = _plan_instrs(q, -2)
        label = f"Plan #{q.id} ({q.title} v{q.version})"
        items_a = {i["item"].lower() for s in p.meals.values() for i in s}
        items_b = {i["item"].lower() for s in q.meals.values() for i in s}
        diff = {"only_in_a": sorted(items_a - items_b), "only_in_b": sorted(items_b - items_a), "shared": sorted(items_a & items_b),
                "restrictions_a": p.restrictions, "restrictions_b": q.restrictions}
    else:
        case = db.get(models.Case, p.case_id)
        notes = [n for n in case.notes if n.diet_plan_id != p.id]
        b = [instruction_dict(i, n) for n in notes for i in n.instructions if not i.excluded
             and (against == "notes" or i.kind == "medication")]
        label = "Medication instructions in this case" if against == "medications" else "All other specialist notes"
        diff = None
    findings = detect(a + b, make_context(db), PIPELINE_CONFIGS["full"])
    findings = [f for f in findings if any(s["note_id"] == -1 for s in f["instructions_snapshot"])
                and any(s["note_id"] != -1 for s in f["instructions_snapshot"])]
    return {"plan_id": p.id, "against": label, "diff": diff, "plan_instructions": a, "other_instructions": b,
            "findings": findings, "note": "Comparison preview only — not saved and not sent to the review queue."}
