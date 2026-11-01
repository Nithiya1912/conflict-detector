from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..database import get_db
from ..schemas import PolicyIn, ReportIn
from ..security import get_current_user, require_admin
from ..services import kg, llm, scoring
from ..services.audit import audit
from ..services.knowledge import ALL_CATEGORIES, CORE_CATEGORIES
from ..services.pipeline import get_policy
from .serializers import case_summary, conflict_out, run_out

router = APIRouter(prefix="/api", tags=["misc"])


def _as_utc(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    cases = db.scalars(select(models.Case).where(models.Case.is_test.is_(False), models.Case.archived.is_(False))).all()
    case_ids = {c.id for c in cases}
    conflicts = [x for c in cases for x in c.conflicts]
    runs = db.scalars(select(models.AnalysisRun).where(models.AnalysisRun.case_id.in_(case_ids)).order_by(models.AnalysisRun.id.desc())).all()
    completed = [r for r in runs if r.status == "completed"]
    pending = [x for x in conflicts if x.validation_status in ("pending", "clarification_requested")]
    latest_eval = db.scalars(select(models.EvaluationRun).order_by(models.EvaluationRun.id.desc()).limit(1)).first()

    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=i) for i in range(29, -1, -1)]
    trend = {d.isoformat(): {"date": d.isoformat(), "analyses": 0, "findings": 0} for d in days}
    for r in completed:
        k = _as_utc(r.started_at).date().isoformat()
        if k in trend:
            trend[k]["analyses"] += 1
            trend[k]["findings"] += r.conflicts_found
    # Seeded runs happen at install time; show case creation dates too for context.
    created = Counter(_as_utc(c.created_at).date().isoformat() for c in cases)
    for k, v in trend.items():
        v["cases_created"] = created.get(k, 0)

    graph = kg.explorer_graph(db)
    audit_rows = db.scalars(select(models.AuditLog).order_by(models.AuditLog.id.desc()).limit(8)).all()
    return {
        "data_label": "Synthetic demonstration data — not live patient statistics",
        "cards": {
            "total_cases": len(cases),
            "demo_cases": sum(c.is_demo for c in cases),
            "cases_analyzed": len({r.case_id for r in completed}),
            "conflicts": len(conflicts),
            "high_priority_open": sum(1 for x in pending if x.severity in ("critical", "high")),
            "pending_validations": len(pending),
            "avg_analysis_ms": round(sum(r.duration_ms or 0 for r in completed) / len(completed)) if completed else None,
            "evidence_coverage": round(sum(any(e.get("supporting") for e in x.evidence) for x in conflicts) / len(conflicts), 4) if conflicts else None,
            "latest_evaluation": ({"id": latest_eval.id, "created_at": latest_eval.created_at,
                                   **{k: latest_eval.results.get("full", {}).get(k) for k in ("precision", "recall", "f1", "pass_rate")}}
                                  if latest_eval else None),
        },
        "category_distribution": [{"category": c, "count": sum(x.category == c for x in conflicts), "core": c in CORE_CATEGORIES}
                                  for c in ALL_CATEGORIES],
        "severity_distribution": [{"severity": s, "label": scoring.SEVERITY_LABELS[s], "count": sum(x.severity == s for x in conflicts)}
                                  for s in ["critical", "high", "moderate", "low", "uncertain"]],
        "validation_distribution": dict(Counter(x.validation_status for x in conflicts)),
        "trend": list(trend.values()),
        "recent_runs": [{**run_out(r), "pseudonym": next((c.pseudonym for c in cases if c.id == r.case_id), r.case_id)} for r in runs[:8]],
        "queue_preview": [conflict_out(x, False) for x in sorted(pending, key=lambda x: (
            {"critical": 0, "high": 1, "uncertain": 2, "moderate": 3, "low": 4}[x.severity], x.created_at))[:5]],
        "recent_audit": [{"id": a.id, "actor_email": a.actor_email, "action": a.action, "entity_type": a.entity_type,
                          "entity_id": a.entity_id, "detail": a.detail, "created_at": a.created_at} for a in audit_rows],
        "graph_preview": {"nodes": graph["nodes"], "edges": graph["edges"],
                          "counts": dict(Counter(n["type"] for n in graph["nodes"]))},
    }


@router.get("/medications")
def medications(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    rows = db.execute(select(models.Instruction, models.Note, models.Case).join(models.Note, models.Instruction.note_id == models.Note.id)
                      .join(models.Case, models.Instruction.case_id == models.Case.id)
                      .where(models.Instruction.kind == "medication", models.Case.is_test.is_(False), models.Case.archived.is_(False))).all()
    conflicts = db.scalars(select(models.Conflict)).all()
    out = []
    for i, n, c in rows:
        linked = [x for x in conflicts if i.id in x.instruction_ids]
        out.append({"id": i.id, "case_id": c.id, "pseudonym": c.pseudonym, "entity": i.entity, "surface": i.surface,
                    "direction": i.direction, "dose": i.dose, "unit": i.unit, "frequency": i.frequency, "timing": i.timing,
                    "span_text": i.span_text, "confidence": i.confidence, "corrected": i.corrected, "excluded": i.excluded,
                    "note_id": n.id, "note_title": n.title, "specialty": n.specialty, "source_id": n.source_id,
                    "specialist_name": n.specialist_name,
                    "conflicts": [{"id": x.id, "severity": x.severity, "category": x.category, "title": x.title,
                                   "validation_status": x.validation_status} for x in linked]})
    return out


# ---------------- reports ----------------
def _report_out(r: models.Report, full: bool = False) -> dict:
    d = {"id": r.id, "case_id": r.case_id, "title": r.title, "kind": r.kind, "created_by_name": r.created_by_name, "created_at": r.created_at}
    if full:
        d["content"] = r.content
    else:
        s = r.content.get("summary", {})
        d["summary"] = s
    return d


@router.get("/reports")
def list_reports(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    return [_report_out(r) for r in db.scalars(select(models.Report).order_by(models.Report.id.desc())).all()]


@router.post("/reports", status_code=201)
def create_report(body: ReportIn, request: Request, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    case = db.get(models.Case, body.case_id)
    if not case or case.is_test:
        raise HTTPException(404, "Case not found")
    cs = [conflict_out(x) for x in case.conflicts]
    sev = Counter(x["severity"] for x in cs)
    content = {
        "case": case_summary(case),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": user.full_name,
        "summary": {"findings": len(cs), "by_severity": dict(sev), "by_status": dict(Counter(x["validation_status"] for x in cs)),
                    "evidence_supported": sum(x["evidence_supported"] for x in cs)},
        "notes": [{"source_id": n.source_id, "specialist_name": n.specialist_name, "specialty": n.specialty, "title": n.title,
                   "content": n.content, "instructions": len(n.instructions)} for n in case.notes],
        "conflicts": cs,
        "policy": get_policy(db),
        "llm": llm.provider_status(),
        "disclaimer": ("Research prototype output based on synthetic demonstration data. Findings are candidate conflicts for "
                       "clinician review, not diagnoses or treatment recommendations."),
    }
    r = models.Report(case_id=case.id, title=body.title or f"Conflict report — {case.id} ({case.pseudonym})", content=jsonable_encoder(content),
                      created_by=user.id, created_by_name=user.full_name)
    db.add(r)
    db.flush()
    audit(db, user, "report.create", "report", r.id, case.id, request)
    db.commit()
    return _report_out(r, True)


@router.get("/reports/{report_id}")
def get_report(report_id: int, db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    r = db.get(models.Report, report_id)
    if not r:
        raise HTTPException(404, "Report not found")
    return _report_out(r, True)


@router.delete("/reports/{report_id}", status_code=204)
def delete_report(report_id: int, request: Request, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    r = db.get(models.Report, report_id)
    if not r:
        raise HTTPException(404, "Report not found")
    audit(db, user, "report.delete", "report", r.id, r.title, request)
    db.delete(r)
    db.commit()


# ---------------- audit ----------------
@router.get("/audit")
def audit_logs(action: str | None = None, entity_type: str | None = None, actor: str | None = None, page: int = 1, page_size: int = 50,
               db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    stmt = select(models.AuditLog)
    if user.role != "admin":
        stmt = stmt.where(models.AuditLog.actor_id == user.id)
    elif actor:
        stmt = stmt.where(models.AuditLog.actor_email.ilike(f"%{actor}%"))
    if action:
        stmt = stmt.where(models.AuditLog.action.ilike(f"{action}%"))
    if entity_type:
        stmt = stmt.where(models.AuditLog.entity_type == entity_type)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    page_size = max(1, min(page_size, 200))
    rows = db.scalars(stmt.order_by(models.AuditLog.id.desc()).offset((max(page, 1) - 1) * page_size).limit(page_size)).all()
    actions = sorted({a.split(".")[0] for a in db.scalars(select(models.AuditLog.action).distinct()).all()})
    return {"total": total, "page": page, "page_size": page_size, "scope": "all" if user.role == "admin" else "own",
            "action_groups": actions,
            "items": [{"id": a.id, "actor_email": a.actor_email, "action": a.action, "entity_type": a.entity_type,
                       "entity_id": a.entity_id, "detail": a.detail, "ip": a.ip, "created_at": a.created_at} for a in rows]}


# ---------------- settings ----------------
@router.get("/settings")
def get_settings_view(db: Session = Depends(get_db), _: models.User = Depends(get_current_user)):
    s = get_settings()
    return {"policy": get_policy(db), "default_policy": scoring.DEFAULT_POLICY, "policy_doc": scoring.__doc__,
            "severity_labels": scoring.SEVERITY_LABELS, "llm": llm.provider_status(),
            "system": {"environment": s.environment, "demo_mode": s.demo_mode,
                       "database": s.database_url.split(":", 1)[0], "retrieval": "Local TF-IDF vector index (development adapter)",
                       "retrieval_top_k": s.retrieval_top_k, "retrieval_min_score": s.retrieval_min_score,
                       "knowledge_graph": "NetworkX (in-process), relations stored in database"},
            "privacy": ["Pattern-based de-identification of emails, phone numbers, IDs, dates and names on every note before storage",
                        "Only de-identified text is sent to an LLM provider, and only when one is configured",
                        "Role-based access (clinician / administrator); audit log of every state-changing action",
                        "Session in httpOnly SameSite cookie; CSRF header required on writes; scrypt password hashing",
                        "Synthetic demonstration data only — no real patient information should be entered"]}


@router.put("/settings/policy")
def update_policy(body: PolicyIn, request: Request, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    row = db.get(models.AppSetting, "scoring_policy") or models.AppSetting(key="scoring_policy", value={})
    value = dict(row.value or {})
    value.update(body.model_dump(exclude_none=True))
    row.value = value
    db.merge(row)
    audit(db, user, "settings.policy", "settings", "scoring_policy", str(body.model_dump(exclude_none=True)), request)
    db.commit()
    return get_policy(db)


@router.delete("/settings/policy")
def reset_policy(request: Request, db: Session = Depends(get_db), user: models.User = Depends(require_admin)):
    row = db.get(models.AppSetting, "scoring_policy")
    if row:
        db.delete(row)
    audit(db, user, "settings.policy_reset", "settings", "scoring_policy", request=request)
    db.commit()
    return get_policy(db)
