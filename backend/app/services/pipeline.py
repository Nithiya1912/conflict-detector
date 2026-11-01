"""Analysis orchestration: persists extraction results, runs detection, records real stage progress."""
import logging
import secrets
import threading
import time
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .. import database, models
from ..config import get_settings
from . import kg, llm, retrieval
from .detection import PIPELINE_CONFIGS, DetectionContext, detect
from .extraction import extract
from .scoring import compute_confidence, merged_policy

log = logging.getLogger("cicd.pipeline")

STAGES = [
    ("read", "Reading specialist notes"),
    ("extract", "Extracting instructions with NLP"),
    ("normalize", "Normalizing entities"),
    ("map", "Mapping instruction relationships"),
    ("retrieve", "Retrieving guideline evidence"),
    ("compare", "Comparing cross-document instructions"),
    ("explain", "Generating explanations"),
    ("review", "Preparing clinician review"),
]


class Cancelled(Exception):
    pass


def get_policy(db: Session) -> dict:
    row = db.get(models.AppSetting, "scoring_policy")
    return merged_policy(row.value if row else None)


def extract_note(db: Session, note: models.Note) -> list[models.Instruction]:
    """(Re)extract a note. Instructions a user corrected are preserved."""
    kept = [i for i in note.instructions if i.corrected]
    for i in list(note.instructions):
        if not i.corrected:
            note.instructions.remove(i)
    db.flush()
    kept_spans = {(i.entity, i.span_start) for i in kept}
    for e in extract(note.content):
        if (e.entity, e.span_start) in kept_spans:
            continue
        note.instructions.append(models.Instruction(
            case_id=note.case_id, kind=e.kind, entity=e.entity, surface=e.surface, direction=e.direction,
            dose=e.dose, unit=e.unit, frequency=e.frequency, timing=e.timing, context=e.context,
            span_text=e.span_text, span_start=e.span_start, span_end=e.span_end, confidence=e.confidence, hedged=e.hedged,
        ))
    db.flush()
    return note.instructions


def instruction_dict(i: models.Instruction, note: models.Note) -> dict:
    from .extraction import TIMING_SLOT_BY_LABEL, LEX_BY_CANONICAL

    lex = LEX_BY_CANONICAL.get(i.entity)
    return {
        "id": i.id, "note_id": i.note_id, "source_id": note.source_id, "specialty": note.specialty,
        "specialist_name": note.specialist_name, "kind": i.kind, "entity": i.entity, "surface": i.surface,
        "direction": i.direction, "dose": i.dose, "unit": i.unit, "frequency": i.frequency, "timing": i.timing,
        "timing_slot": TIMING_SLOT_BY_LABEL.get(i.timing) if i.timing else None, "span_text": i.span_text,
        "confidence": i.confidence, "hedged": i.hedged, "excluded": i.excluded,
        "intensity": lex.intensity if lex else None,
    }


def make_context(db: Session, use_rag: bool = True) -> DetectionContext:
    s = get_settings()
    return DetectionContext(graph=kg.background_graph(db), store=retrieval.get_store(db) if use_rag else None,
                            policy=get_policy(db), top_k=s.retrieval_top_k, min_score=s.retrieval_min_score)


def new_conflict_id() -> str:
    return f"CNF-{secrets.token_hex(3).upper()}"


def start_analysis(db: Session, case: models.Case, user: models.User | None, config_name: str = "full",
                   use_llm: bool = True, reextract: bool = False) -> models.AnalysisRun:
    cfg = dict(PIPELINE_CONFIGS[config_name])
    cfg.update({"name": config_name, "use_llm": use_llm, "reextract": reextract})
    run = models.AnalysisRun(case_id=case.id, status="queued", config=cfg, triggered_by=user.id if user else None,
                             stages=[{"key": k, "label": l, "status": "pending", "detail": None,
                                      "started_at": None, "finished_at": None} for k, l in STAGES])
    db.add(run)
    db.commit()
    threading.Thread(target=_run_job, args=(run.id,), daemon=True, name=f"analysis-{run.id}").start()
    return run


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class _Progress:
    def __init__(self, db: Session, run: models.AnalysisRun):
        self.db, self.run, self.current = db, run, None

    def _set(self, key, **kw):
        stages = [dict(s) for s in self.run.stages]
        for s in stages:
            if s["key"] == key:
                s.update(kw)
        self.run.stages = stages
        self.db.commit()

    def check_cancel(self):
        self.db.refresh(self.run, attribute_names=["cancel_requested"])
        if self.run.cancel_requested:
            raise Cancelled()

    def enter(self, key: str, detail: str | None = None):
        self.check_cancel()
        if self.current:
            self.finish(self.current)
        self.current = key
        self.run.stage_index = [k for k, _ in STAGES].index(key)
        self._set(key, status="running", started_at=_now(), detail=detail)

    def finish(self, key: str, detail: str | None = None):
        kw = {"status": "done", "finished_at": _now()}
        if detail:
            kw["detail"] = detail
        self._set(key, **kw)
        if self.current == key:
            self.current = None

    def detail(self, key: str, detail: str):
        self._set(key, detail=detail)


def _run_job(run_id: int) -> None:
    db = database.SessionLocal()
    t0 = time.perf_counter()
    run = db.get(models.AnalysisRun, run_id)
    prog = _Progress(db, run)
    try:
        run.status = "running"
        db.commit()
        execute_analysis(db, run, prog)
        run.status = "completed"
    except Cancelled:
        db.rollback()
        run.status = "cancelled"
        if prog.current:
            prog._set(prog.current, status="cancelled", finished_at=_now())
    except Exception as exc:  # noqa: BLE001 - recorded and surfaced to the UI
        log.exception("analysis run %s failed", run_id)
        db.rollback()
        run.status = "failed"
        run.error = f"{type(exc).__name__}: {exc}"
        if prog.current:
            prog._set(prog.current, status="failed", finished_at=_now())
    finally:
        run.finished_at = datetime.now(timezone.utc)
        run.duration_ms = int((time.perf_counter() - t0) * 1000)
        db.add(models.AuditLog(actor_id=run.triggered_by, actor_email="analysis-worker", action=f"analysis.{run.status}",
                               entity_type="case", entity_id=run.case_id,
                               detail=f"run {run.id}: {run.conflicts_found} finding(s), {run.duration_ms} ms"))
        db.commit()
        db.close()


def execute_analysis(db: Session, run: models.AnalysisRun, prog: _Progress) -> None:
    cfg = run.config
    case = db.get(models.Case, run.case_id)

    prog.enter("read")
    notes = list(case.notes)
    if len(notes) < 2:
        raise ValueError("At least two specialist notes are required for cross-instruction analysis.")
    prog.finish("read", f"{len(notes)} notes from {len({n.specialty for n in notes})} specialties")

    prog.enter("extract")
    n_new = 0
    for n in notes:
        if cfg.get("reextract") or not n.instructions:
            extract_note(db, n)
            n_new += 1
    db.commit()
    all_ins = [(i, n) for n in notes for i in n.instructions]
    prog.finish("extract", f"{len(all_ins)} instructions ({n_new} note(s) newly extracted, corrections preserved)")

    prog.enter("normalize")
    dicts = [instruction_dict(i, n) for i, n in all_ins]
    ctx = make_context(db, use_rag=cfg.get("use_rag", True))
    active = [d for d in dicts if not d["excluded"]]
    mapped = sum(1 for d in active if ctx.graph.ancestors(d["entity"]))
    prog.finish("normalize", f"{len(active)} active entities; {mapped} linked to Knowledge Graph classes")

    prog.enter("map")
    rlog: list = []

    def on_stage(key, detail):
        if key == "retrieve":
            prog.finish("map", detail)
            prog.enter("retrieve")

    results = detect(dicts, ctx, cfg, retrieval_log=rlog, on_stage=on_stage)
    supported = sum(1 for r in results if r["evidence_supported"])
    prog.finish("retrieve", f"{len(rlog)} retrieval quer{'y' if len(rlog) == 1 else 'ies'}; {supported}/{len(results)} findings with supporting passages"
                if cfg.get("use_rag", True) else "Retrieval disabled for this configuration")
    for entry in rlog:
        db.add(models.RetrievalLog(query=entry["query"], origin="analysis", case_id=case.id, results=entry["results"]))

    prog.enter("compare")
    existing = db.scalars(select(models.Conflict).where(models.Conflict.case_id == case.id)).all()
    reviewed_sigs = {c.matched_relationship.get("signature") for c in existing if c.validation_status != "pending" or c.reviews}
    stale = [c.id for c in existing if c.validation_status == "pending" and not c.reviews]
    if stale:
        db.execute(delete(models.Conflict).where(models.Conflict.id.in_(stale)))
    fresh = [r for r in results if r["matched_relationship"]["signature"] not in reviewed_sigs]
    cross = sum(1 for r in results if r["matched_relationship"]["cross_document"])
    prog.finish("compare", f"{len(results)} candidate conflict(s), {cross} cross-document; "
                           f"{len(results) - len(fresh)} already reviewed and kept")

    prog.enter("explain")
    explain_detail = "Deterministic explanations generated from rules, entities and evidence"
    provider = llm.get_provider() if cfg.get("use_llm") else None
    llm_out = None
    if provider and active:
        try:
            llm_out = provider.analyze(active, fresh)
            run.llm_used = True
            explain_detail += f"; LLM explanations added ({provider.model})"
        except llm.LLMError as e:
            explain_detail += f"; LLM layer unavailable ({e}) — deterministic results kept"
    elif cfg.get("use_llm"):
        explain_detail += "; no LLM provider configured"
    prog.finish("explain", explain_detail)

    prog.enter("review")
    created = []
    for idx, r in enumerate(fresh, 1):
        c = models.Conflict(id=new_conflict_id(), case_id=case.id, run_id=run.id,
                            **{k: v for k, v in r.items() if k != "evidence_supported"})
        if llm_out:
            exp = next((e for e in llm_out.explanations if e.conflict_ref == f"C{idx}"), None)
            if exp:
                c.llm_explanation = {**exp.model_dump(), "model": provider.model, "label": "LLM-generated explanation"}
        db.add(c)
        created.append(c)
    if llm_out:
        id_map = {f"I{n}": d for n, d in enumerate(active, 1)}
        for sug in llm_out.additional_candidates:
            ins = [id_map[r] for r in sug.instruction_refs if r in id_map]
            if len(ins) < 2:
                continue
            conf, basis = compute_confidence(instructions=ins, match_kind="llm", best_evidence_score=None, policy=ctx.policy)
            c = models.Conflict(
                id=new_conflict_id(), case_id=case.id, run_id=run.id, category=sug.category,
                is_extension=sug.category not in ("Drug–Drug", "Drug–Diet", "Diet–Diet"), rule_id="LLM-SUGGESTION",
                source="llm", title=sug.title, instruction_ids=[i["id"] for i in ins],
                instructions_snapshot=[{k: i.get(k) for k in ("id", "note_id", "source_id", "specialty", "kind", "entity",
                                                               "surface", "direction", "span_text", "confidence", "hedged")} for i in ins],
                note_ids=sorted({i["note_id"] for i in ins}),
                matched_relationship={"type": "LLM_SUGGESTION", "signature": f"LLM|{sorted(i['id'] for i in ins)}",
                                      "cross_document": len({i['note_id'] for i in ins}) > 1},
                severity="uncertain",
                severity_basis={"base": "uncertain", "final": "uncertain", "steps": [
                    {"step": "S5", "rule": "LLM-only candidate: severity is never assigned by the model", "result": "uncertain"}]},
                confidence=conf, confidence_basis=basis, reasoning_summary=sug.rationale,
                llm_explanation={"explanation": sug.rationale, "model": provider.model, "label": "LLM-suggested candidate (unverified)",
                                 "clarification_questions": [], "limitations": "Not matched by any deterministic rule; no evidence check performed."},
                evidence=[], uncertainty="Suggested by the generative model only; not supported by a deterministic rule or retrieved evidence.",
                next_step="Clinician to judge whether this suggestion is clinically meaningful.",
            )
            db.add(c)
            created.append(c)
    run.conflicts_found = len(created)
    pending = db.scalars(select(models.Conflict).where(models.Conflict.case_id == case.id,
                                                       models.Conflict.validation_status.in_(["pending", "clarification_requested"]))).all()
    case.status = "in_review" if (created or pending) else "analyzed"
    for n in notes:
        if n.diet_plan_id:
            plan = db.get(models.DietPlan, n.diet_plan_id)
            if plan and plan.status in ("draft", "analyzed", "awaiting_review"):
                plan.status = "awaiting_review" if any(n.id in c.note_ids for c in created) else "analyzed"
                plan.last_run_id = run.id
    db.commit()
    prog.finish("review", f"{len(created)} finding(s) queued for clinician validation")
