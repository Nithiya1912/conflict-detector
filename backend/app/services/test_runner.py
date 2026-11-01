"""Execution of the 20 synthetic test sessions and evaluation metrics.

TEST POLICY (deterministic):
  actual_outcome = "no_conflict"  if no finding was produced
                 = "needs_review" if every finding is "Uncertain / Insufficient Evidence"
                 = "conflict"     otherwise
  Checks:
    C1 categories : set(actual categories) == set(expected categories)
    C2 outcome    : actual_outcome == expected_outcome
    C3 evidence   : if evidence is expected, every expected category has >=1 finding with a supporting passage
    C4 severity   : if a severity band is specified, the highest non-uncertain severity lies in the band
  Status = PASS if C1-C4 hold; NEEDS REVIEW if C1 and C2 hold but C3 or C4 fails; FAIL otherwise.

METRICS: computed per conflict category over sessions (a session either expects a category or not,
and the system either reports it or not). Precision/Recall/F1 are None (undefined) when the
denominator is zero; they are never replaced with 100%.
"""
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from .detection import PIPELINE_CONFIGS, detect
from .extraction import extract
from .knowledge import ALL_CATEGORIES
from .pipeline import make_context

SEV_RANK = {"low": 1, "moderate": 2, "high": 3, "critical": 4}


def _session_instructions(session: models.TestSession) -> list[dict]:
    out, nid = [], 0
    for n_idx, note in enumerate(session.notes, 1):
        for e in extract(note["content"]):
            nid += 1
            d = e.to_dict()
            d.update({"id": nid, "note_id": n_idx, "source_id": f"{session.id}-N{n_idx}", "specialty": note["specialty"],
                      "specialist_name": note["specialist_name"], "excluded": False})
            out.append(d)
    return out


def execute_session(db: Session, session: models.TestSession, config_name: str = "full", ctx_cache: dict | None = None) -> dict:
    t0 = time.perf_counter()
    cfg = PIPELINE_CONFIGS[config_name]
    key = cfg["use_rag"]
    if ctx_cache is not None and key in ctx_cache:
        ctx = ctx_cache[key]
    else:
        ctx = make_context(db, use_rag=cfg["use_rag"])
        if ctx_cache is not None:
            ctx_cache[key] = ctx
    instrs = _session_instructions(session)
    findings = detect(instrs, ctx, cfg)
    actual_cats = sorted({f["category"] for f in findings})
    if not findings:
        outcome = "no_conflict"
    elif all(f["severity"] == "uncertain" for f in findings):
        outcome = "needs_review"
    else:
        outcome = "conflict"

    expected = set(session.expected_categories)
    c1 = set(actual_cats) == expected
    c2 = outcome == session.expected_outcome
    if session.expected_evidence:
        c3 = all(any(f["category"] == cat and f["evidence_supported"] for f in findings) for cat in expected)
    else:
        c3 = True
    sevs = [f["severity"] for f in findings if f["severity"] != "uncertain"]
    top = max(sevs, key=lambda s: SEV_RANK[s]) if sevs else None
    band = session.expected_severity_band
    c4 = True if not band else (top in band)
    status = "pass" if (c1 and c2 and c3 and c4) else ("needs_review" if (c1 and c2) else "fail")

    checks = [
        {"check": "C1 Categories", "expected": sorted(expected) or ["(none)"], "actual": actual_cats or ["(none)"], "ok": c1},
        {"check": "C2 Outcome", "expected": session.expected_outcome, "actual": outcome, "ok": c2},
        {"check": "C3 Evidence", "expected": "supporting passage per expected category" if session.expected_evidence else "not required",
         "actual": f"{sum(1 for f in findings if f['evidence_supported'])}/{len(findings)} findings supported", "ok": c3},
        {"check": "C4 Severity band", "expected": band or "not specified", "actual": top or "(none)", "ok": c4},
    ]
    duration = int((time.perf_counter() - t0) * 1000)
    return {
        "status": status, "actual_categories": actual_cats, "actual_outcome": outcome, "duration_ms": duration,
        "result": {
            "config": config_name, "checks": checks, "instructions_extracted": len(instrs),
            "instructions": [{k: i[k] for k in ("note_id", "kind", "entity", "direction", "dose", "unit", "frequency",
                                                 "timing", "confidence", "hedged", "span_text")} for i in instrs],
            "findings": [{k: f[k] for k in ("category", "rule_id", "title", "severity", "confidence", "evidence_supported",
                                            "reasoning_summary", "uncertainty")} | {"severity_basis": f["severity_basis"]}
                         for f in findings],
        },
    }


def run_sessions(db: Session, sessions: list[models.TestSession], config_name: str = "full",
                 evaluation_run_id: int | None = None, update_snapshot: bool = True) -> list[models.TestExecution]:
    cache: dict = {}
    executions = []
    for s in sessions:
        r = execute_session(db, s, config_name, cache)
        now = datetime.now(timezone.utc)
        ex = models.TestExecution(session_id=s.id, config_name=config_name, evaluation_run_id=evaluation_run_id,
                                  status=r["status"], actual_categories=r["actual_categories"], actual_outcome=r["actual_outcome"],
                                  result=r["result"], executed_at=now, duration_ms=r["duration_ms"])
        db.add(ex)
        executions.append(ex)
        if update_snapshot:
            s.status, s.actual_categories, s.actual_outcome = r["status"], r["actual_categories"], r["actual_outcome"]
            s.result, s.executed_at, s.duration_ms = r["result"], now, r["duration_ms"]
    db.flush()
    return executions


def _ratio(n: int, d: int) -> float | None:
    return round(n / d, 4) if d else None


def compute_metrics(rows: list[tuple[list[str], list[str], str, dict | None]]) -> dict:
    """rows: (expected_categories, actual_categories, status, result) per session."""
    per_cat = {}
    tot = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
    for cat in ALL_CATEGORIES:
        c = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
        for exp, act, _, _ in rows:
            e, a = cat in exp, cat in act
            c["tp" if e and a else "fp" if a else "fn" if e else "tn"] += 1
        for k in tot:
            tot[k] += c[k]
        p, r = _ratio(c["tp"], c["tp"] + c["fp"]), _ratio(c["tp"], c["tp"] + c["fn"])
        per_cat[cat] = {**c, "precision": p, "recall": r, "f1": _f1(p, r), "support": c["tp"] + c["fn"]}
    p, r = _ratio(tot["tp"], tot["tp"] + tot["fp"]), _ratio(tot["tp"], tot["tp"] + tot["fn"])
    n = len(rows)
    findings = [f for *_, res in rows if res for f in res.get("findings", [])]
    statuses = [s for _, _, s, _ in rows]
    # Session-level (any conflict expected vs reported)
    sl = {"tp": 0, "fp": 0, "fn": 0, "tn": 0}
    for exp, act, _, _ in rows:
        e, a = bool(exp), bool(act)
        sl["tp" if e and a else "fp" if a else "fn" if e else "tn"] += 1
    return {
        "sessions": n,
        "confusion": tot,
        "precision": p, "recall": r, "f1": _f1(p, r),
        "accuracy": _ratio(tot["tp"] + tot["tn"], sum(tot.values())),
        "per_category": per_cat,
        "session_level": {**sl, "precision": _ratio(sl["tp"], sl["tp"] + sl["fp"]), "recall": _ratio(sl["tp"], sl["tp"] + sl["fn"])},
        "pass": statuses.count("pass"), "fail": statuses.count("fail"), "needs_review": statuses.count("needs_review"),
        "pass_rate": _ratio(statuses.count("pass"), n),
        "evidence_coverage": _ratio(sum(1 for f in findings if f["evidence_supported"]), len(findings)),
        "findings": len(findings),
    }


def _f1(p: float | None, r: float | None) -> float | None:
    if p is None or r is None:
        return None
    return round(2 * p * r / (p + r), 4) if (p + r) else 0.0


def run_evaluation(db: Session, user: models.User | None, label: str | None = None) -> models.EvaluationRun:
    t0 = time.perf_counter()
    sessions = db.scalars(select(models.TestSession).order_by(models.TestSession.id)).all()
    ev = models.EvaluationRun(label=label or f"Ablation study ({len(sessions)} sessions × {len(PIPELINE_CONFIGS)} configurations)",
                              configs=list(PIPELINE_CONFIGS), sessions_count=len(sessions), triggered_by=user.id if user else None)
    db.add(ev)
    db.flush()
    results = {}
    for name, cfg in PIPELINE_CONFIGS.items():
        exs = run_sessions(db, sessions, name, evaluation_run_id=ev.id, update_snapshot=(name == "full"))
        by_id = {s.id: s for s in sessions}
        m = compute_metrics([(by_id[e.session_id].expected_categories, e.actual_categories, e.status, e.result) for e in exs])
        results[name] = {"label": cfg["label"], "config": cfg, **m,
                         "session_status": {e.session_id: e.status for e in exs}}
    ev.results = results
    ev.duration_ms = int((time.perf_counter() - t0) * 1000)
    db.commit()
    return ev
