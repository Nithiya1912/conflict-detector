import random
import re
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..schemas import CaseIn, CaseUpdate, InstructionOut, InstructionUpdate, NoteIn, NoteUpdate, PreviewIn
from ..security import get_current_user
from ..seed.scenarios import SCENARIOS
from ..services.audit import audit
from ..services.deid import deidentify
from ..services.extraction import extract
from ..services.pipeline import extract_note
from .serializers import case_summary, conflict_out, note_out, review_out, run_out

router = APIRouter(prefix="/api", tags=["cases"])

PLANTS = ["Aster", "Birch", "Cedar", "Dahlia", "Elm", "Fern", "Gorse", "Hazel", "Iris", "Juniper", "Kale", "Laurel", "Maple",
          "Nettle", "Olive", "Poppy", "Quince", "Rowan", "Sage", "Tansy", "Umber", "Violet", "Willow", "Yarrow", "Zinnia"]


def _next_case_id(db: Session) -> str:
    ids = db.scalars(select(models.Case.id).where(models.Case.id.like("CASE-%"))).all()
    nums = [int(m.group(1)) for i in ids if (m := re.match(r"CASE-(\d+)$", i))]
    return f"CASE-{max(nums, default=1000) + 1}"


def _case_or_404(db: Session, case_id: str) -> models.Case:
    c = db.get(models.Case, case_id)
    if not c or c.is_test:
        raise HTTPException(404, "Case not found")
    return c


def _next_source_id(case: models.Case) -> str:
    return f"{case.id}-S{len(case.notes) + 1}"


@router.get("/cases")
def list_cases(q: str | None = None, status: str | None = None, specialty: str | None = None, severity: str | None = None,
               date_from: datetime | None = None, date_to: datetime | None = None, include_archived: bool = False,
               db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    stmt = select(models.Case).where(models.Case.is_test.is_(False)).order_by(models.Case.created_at.desc())
    if not include_archived:
        stmt = stmt.where(models.Case.archived.is_(False))
    if status:
        stmt = stmt.where(models.Case.status == status)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(models.Case.id.ilike(like), models.Case.pseudonym.ilike(like), models.Case.summary.ilike(like)))
    if date_from:
        stmt = stmt.where(models.Case.created_at >= date_from)
    if date_to:
        stmt = stmt.where(models.Case.created_at <= date_to)
    out = [case_summary(c) for c in db.scalars(stmt).all()]
    if specialty:
        out = [c for c in out if specialty in c["specialties"]]
    if severity:
        out = [c for c in out if c["top_severity"] == severity]
    return out


@router.post("/cases", status_code=201)
def create_case(body: CaseIn, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    summary, _ = deidentify(body.summary)
    c = models.Case(id=_next_case_id(db), pseudonym=body.pseudonym, age_band=body.age_band, sex=body.sex, summary=summary,
                    is_demo=True, created_by=user.id)
    db.add(c)
    audit(db, user, "case.create", "case", c.id, c.pseudonym, request)
    db.commit()
    return case_summary(c)


@router.post("/cases/generate", status_code=201)
def generate_case(request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    """Create a synthetic demo case by sampling fictional notes from the scenario library."""
    rng = random.Random()
    picks = rng.sample(SCENARIOS, 2)
    notes = [n for s in picks for n in s["notes"]]
    rng.shuffle(notes)
    notes = notes[: rng.randint(2, min(4, len(notes)))]
    cid = _next_case_id(db)
    c = models.Case(id=cid, pseudonym=f"Patient {rng.choice(PLANTS)}-{rng.randint(10, 99)}", age_band=rng.choice(["40-49", "50-59", "60-69", "70-79"]),
                    sex=rng.choice(["F", "M"]), summary="Synthetic demo case generated from the fictional scenario library: "
                    + "; ".join(s["title"] for s in picks), is_demo=True, created_by=user.id)
    db.add(c)
    for idx, n in enumerate(notes, 1):
        c.notes.append(models.Note(source_id=f"{cid}-S{idx}", specialist_name=n["specialist_name"], specialty=n["specialty"],
                                   title=n["title"], content=n["content"], category="mixed"))
    audit(db, user, "case.generate", "case", cid, f"{len(notes)} synthetic notes", request)
    db.commit()
    return case_summary(c)


@router.get("/cases/{case_id}")
def get_case(case_id: str, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    c = _case_or_404(db, case_id)
    runs = db.scalars(select(models.AnalysisRun).where(models.AnalysisRun.case_id == case_id).order_by(models.AnalysisRun.id.desc())).all()
    reviews = sorted((r for x in c.conflicts for r in x.reviews), key=lambda r: r.created_at, reverse=True)
    plans = db.scalars(select(models.DietPlan).where(models.DietPlan.case_id == case_id)).all()
    return {**case_summary(c), "notes": [note_out(n, True) for n in c.notes],
            "conflicts": [conflict_out(x) for x in sorted(c.conflicts, key=lambda x: x.created_at, reverse=True)],
            "runs": [run_out(r) for r in runs[:20]], "reviews": [review_out(r) for r in reviews],
            "diet_plans": [{"id": p.id, "title": p.title, "status": p.status, "version": p.version} for p in plans]}


@router.patch("/cases/{case_id}")
def update_case(case_id: str, body: CaseUpdate, request: Request, db: Session = Depends(get_db),
                user: models.User = Depends(get_current_user)):
    c = _case_or_404(db, case_id)
    changes = body.model_dump(exclude_none=True)
    if "summary" in changes:
        changes["summary"], _ = deidentify(changes["summary"])
    for k, v in changes.items():
        setattr(c, k, v)
    audit(db, user, "case.update", "case", c.id, ", ".join(changes), request)
    db.commit()
    return case_summary(c)


@router.post("/cases/{case_id}/archive")
def archive_case(case_id: str, request: Request, archived: bool = True, db: Session = Depends(get_db),
                 user: models.User = Depends(get_current_user)):
    c = _case_or_404(db, case_id)
    c.archived = archived
    if archived:
        c.status = "archived"
    elif c.status == "archived":
        c.status = "draft" if not c.conflicts else "analyzed"
    audit(db, user, "case.archive" if archived else "case.unarchive", "case", c.id, request=request)
    db.commit()
    return case_summary(c)


# ---------------- notes ----------------
@router.get("/notes")
def list_notes(case_id: str | None = None, specialty: str | None = None, q: str | None = None,
               db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    stmt = select(models.Note).join(models.Case).where(models.Case.is_test.is_(False), models.Case.archived.is_(False)) \
        .order_by(models.Note.created_at.desc())
    if case_id:
        stmt = stmt.where(models.Note.case_id == case_id)
    if specialty:
        stmt = stmt.where(models.Note.specialty == specialty)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(models.Note.title.ilike(like), models.Note.content.ilike(like), models.Note.specialist_name.ilike(like)))
    return [note_out(n, True) for n in db.scalars(stmt).all()]


def _add_note(db: Session, case: models.Case, body: NoteIn, user: models.User, request: Request) -> models.Note:
    content, red = deidentify(body.content)
    n = models.Note(source_id=_next_source_id(case), specialist_name=body.specialist_name, specialty=body.specialty, title=body.title,
                    content=content, category=body.category, pii_redactions=red, note_date=body.note_date or datetime.now())
    case.notes.append(n)
    db.flush()
    extract_note(db, n)
    audit(db, user, "note.create", "note", n.id, f"{case.id}: {n.title} ({red} redaction(s))", request)
    db.commit()
    return n


@router.post("/cases/{case_id}/notes", status_code=201)
def create_note(case_id: str, body: NoteIn, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    return note_out(_add_note(db, _case_or_404(db, case_id), body, user, request), True)


ALLOWED_UPLOAD = (".txt", ".md", ".text")


@router.post("/cases/{case_id}/notes/upload", status_code=201)
async def upload_note(case_id: str, request: Request, file: UploadFile = File(...), specialist_name: str = Form(...),
                      specialty: str = Form(...), title: str | None = Form(None), category: str = Form("mixed"),
                      db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    case = _case_or_404(db, case_id)
    name = (file.filename or "").lower()
    if not name.endswith(ALLOWED_UPLOAD):
        raise HTTPException(415, "Only plain-text files (.txt, .md) are supported")
    raw = await file.read(200_001)
    if len(raw) > 200_000:
        raise HTTPException(413, "File too large (max 200 KB)")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(422, "File must be UTF-8 text")
    body = NoteIn(specialist_name=specialist_name, specialty=specialty, title=title or file.filename or "Uploaded note",
                  content=text, category=category if category in ("medication", "diet", "lifestyle", "mixed") else "mixed")
    return note_out(_add_note(db, case, body, user, request), True)


def _note_or_404(db: Session, note_id: int) -> models.Note:
    n = db.get(models.Note, note_id)
    if not n:
        raise HTTPException(404, "Note not found")
    return n


@router.patch("/notes/{note_id}")
def update_note(note_id: int, body: NoteUpdate, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    n = _note_or_404(db, note_id)
    if n.diet_plan_id and body.content is not None:
        raise HTTPException(409, "This note is generated from a diet plan; edit the plan instead")
    changes = body.model_dump(exclude_none=True)
    if "content" in changes:
        changes["content"], red = deidentify(changes["content"])
        n.pii_redactions = red
    for k, v in changes.items():
        setattr(n, k, v)
    if "content" in changes:
        for i in list(n.instructions):  # content changed: corrections no longer line up with the text
            n.instructions.remove(i)
        db.flush()
        extract_note(db, n)
    audit(db, user, "note.update", "note", n.id, ", ".join(changes), request)
    db.commit()
    return note_out(n, True)


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    n = _note_or_404(db, note_id)
    if n.diet_plan_id:
        raise HTTPException(409, "This note belongs to a diet plan; archive the plan instead")
    audit(db, user, "note.delete", "note", n.id, f"{n.case_id}: {n.title}", request)
    db.delete(n)
    db.commit()


@router.post("/notes/{note_id}/extract")
def reextract(note_id: int, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    n = _note_or_404(db, note_id)
    extract_note(db, n)
    audit(db, user, "note.extract", "note", n.id, f"{len(n.instructions)} instructions", request)
    db.commit()
    return note_out(n, True)


@router.post("/extract/preview")
def preview(body: PreviewIn, _: models.User = Depends(get_current_user)):
    text, red = deidentify(body.content)
    return {"redactions": red, "deidentified_text": text, "instructions": [e.to_dict() for e in extract(text)]}


@router.patch("/instructions/{ins_id}", response_model=InstructionOut)
def correct_instruction(ins_id: int, body: InstructionUpdate, request: Request, db: Session = Depends(get_db),
                        user: models.User = Depends(get_current_user)):
    i = db.get(models.Instruction, ins_id)
    if not i:
        raise HTTPException(404, "Instruction not found")
    changes = body.model_dump(exclude_unset=True)
    before = {k: getattr(i, k) for k in changes}
    for k, v in changes.items():
        setattr(i, k, v)
    if set(changes) - {"excluded"}:
        i.corrected = True
        i.confidence = 1.0  # human-verified
        i.hedged = False
    audit(db, user, "instruction.correct", "instruction", i.id, f"{before} -> {changes}", request)
    db.commit()
    return i


@router.get("/specialties")
def specialties(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    return sorted(set(db.scalars(select(models.Note.specialty)).all()))


@router.get("/cases/{case_id}/instructions", response_model=list[InstructionOut])
def case_instructions(case_id: str, kind: str | None = Query(None), db: Session = Depends(get_db),
                      _: models.User = Depends(get_current_user)):
    _case_or_404(db, case_id)
    stmt = select(models.Instruction).where(models.Instruction.case_id == case_id)
    if kind:
        stmt = stmt.where(models.Instruction.kind == kind)
    return db.scalars(stmt).all()
