from .. import models
from ..schemas import InstructionOut, NoteOut, RunOut


def review_out(r: models.ReviewDecision) -> dict:
    return {"id": r.id, "conflict_id": r.conflict_id, "reviewer_id": r.reviewer_id, "reviewer_name": r.reviewer_name,
            "decision": r.decision, "reason": r.reason, "comment": r.comment, "previous_status": r.previous_status,
            "created_at": r.created_at}


def conflict_out(c: models.Conflict, with_reviews: bool = True) -> dict:
    d = {k: getattr(c, k) for k in (
        "id", "case_id", "run_id", "category", "is_extension", "rule_id", "source", "title", "instruction_ids",
        "instructions_snapshot", "note_ids", "matched_relationship", "severity", "severity_basis", "confidence",
        "confidence_basis", "reasoning_summary", "llm_explanation", "evidence", "uncertainty", "next_step",
        "validation_status", "created_at")}
    d["evidence_supported"] = any(e.get("supporting") for e in c.evidence)
    if with_reviews:
        d["reviews"] = [review_out(r) for r in c.reviews]
    return d


def case_summary(c: models.Case) -> dict:
    sev_order = ["critical", "high", "moderate", "low", "uncertain"]
    sevs = [x.severity for x in c.conflicts]
    return {
        "id": c.id, "pseudonym": c.pseudonym, "age_band": c.age_band, "sex": c.sex, "summary": c.summary,
        "status": c.status, "is_demo": c.is_demo, "archived": c.archived, "created_at": c.created_at, "updated_at": c.updated_at,
        "note_count": len(c.notes), "specialties": sorted({n.specialty for n in c.notes}),
        "conflict_count": len(c.conflicts),
        "pending_count": sum(1 for x in c.conflicts if x.validation_status in ("pending", "clarification_requested")),
        "top_severity": next((s for s in sev_order if s in sevs), None),
    }


def note_out(n: models.Note, with_instructions: bool = False) -> dict:
    d = NoteOut.model_validate(n).model_dump()
    d["instruction_count"] = len(n.instructions)
    if with_instructions:
        d["instructions"] = [InstructionOut.model_validate(i).model_dump() for i in n.instructions]
    return d


def run_out(r: models.AnalysisRun) -> dict:
    return RunOut.model_validate(r).model_dump()


def plan_out(p: models.DietPlan, note: models.Note | None = None) -> dict:
    d = {k: getattr(p, k) for k in ("id", "case_id", "title", "specialist_name", "specialty", "version", "status", "meals",
                                     "restrictions", "nutrition_notes", "lifestyle_notes", "is_demo", "parent_id",
                                     "last_run_id", "created_at", "updated_at")}
    d["note_id"] = note.id if note else None
    return d
