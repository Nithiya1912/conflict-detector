"""Documented, configurable severity and confidence policy.

Severity (clinical priority for review) and confidence (how sure the *system* is that the
pattern was matched correctly) are computed separately. Neither is proof of clinical
correctness. The LLM layer never changes severity.

SEVERITY POLICY (applied in order):
  S1  Start from the matched rule's base severity (or an admin override for that rule).
  S2  Timing-sensitive rules with unspecified timing -> "uncertain" (if policy says so).
  S3  Any involved instruction hedged or below the ambiguity threshold -> cap at `cap_ambiguous_at`.
  S4  If `require_evidence_for_high` and no supporting passage was retrieved, critical/high -> "uncertain".
  S5  LLM-only candidates are always "uncertain".

CONFIDENCE (0-1):
  w_extraction * min(extraction confidence of involved instructions)
+ w_rule_match * rule-match strength (direct term 1.0, via KG class 0.85, opposite-direction 0.8, ...)
+ w_evidence   * min(1, best supporting retrieval score / evidence_score_scale)   (0 when none)
"""
from copy import deepcopy

SEVERITY_ORDER = ["low", "moderate", "high", "critical"]
SEVERITY_LABELS = {"critical": "Critical", "high": "High", "moderate": "Moderate", "low": "Low",
                   "uncertain": "Uncertain / Insufficient Evidence"}

DEFAULT_POLICY = {
    "require_evidence_for_high": True,
    "ambiguity_confidence_threshold": 0.6,
    "cap_ambiguous_at": "moderate",
    "unknown_timing_policy": "uncertain",  # "uncertain" | "keep"
    "confidence_weights": {"extraction": 0.4, "rule_match": 0.35, "evidence": 0.25},
    "rule_match_strength": {"direct": 1.0, "kg_class": 0.85, "opposite_direction": 0.8, "duplicate": 0.9, "llm": 0.5},
    "evidence_score_scale": 0.35,
    "severity_overrides": {},
}


def merged_policy(stored: dict | None) -> dict:
    p = deepcopy(DEFAULT_POLICY)
    for k, v in (stored or {}).items():
        if isinstance(v, dict) and isinstance(p.get(k), dict):
            p[k].update(v)
        else:
            p[k] = v
    return p


def _cap(sev: str, cap: str) -> str:
    if sev == "uncertain":
        return sev
    return SEVERITY_ORDER[min(SEVERITY_ORDER.index(sev), SEVERITY_ORDER.index(cap))]


def compute_severity(*, rule_id: str, base: str, instructions: list[dict], evidence_supported: bool,
                     timing_status: str | None, source: str, policy: dict) -> tuple[str, dict]:
    steps = []
    sev = policy["severity_overrides"].get(rule_id, base)
    steps.append({"step": "S1", "rule": "Rule base severity" + (" (admin override)" if rule_id in policy["severity_overrides"] else ""),
                  "result": sev})
    if source == "llm":
        steps.append({"step": "S5", "rule": "LLM-only candidate: severity is never assigned by the model", "result": "uncertain"})
        return "uncertain", {"base": base, "steps": steps, "final": "uncertain"}
    if timing_status == "unknown" and policy["unknown_timing_policy"] == "uncertain":
        sev = "uncertain"
        steps.append({"step": "S2", "rule": "Timing-sensitive rule but administration timing not specified", "result": sev})
    ambiguous = [i for i in instructions if i.get("hedged") or i.get("confidence", 1) < policy["ambiguity_confidence_threshold"]]
    if ambiguous and sev != "uncertain":
        new = _cap(sev, policy["cap_ambiguous_at"])
        steps.append({"step": "S3", "rule": f"Ambiguous/hedged instruction(s): {', '.join(i['surface'] for i in ambiguous)} -> cap at {policy['cap_ambiguous_at']}",
                      "result": new})
        sev = new
    if policy["require_evidence_for_high"] and not evidence_supported and sev in ("high", "critical"):
        steps.append({"step": "S4", "rule": "High/critical requires a supporting retrieved passage; none found", "result": "uncertain"})
        sev = "uncertain"
    return sev, {"base": base, "steps": steps, "final": sev}


def compute_confidence(*, instructions: list[dict], match_kind: str, best_evidence_score: float | None,
                       policy: dict) -> tuple[float, dict]:
    w = policy["confidence_weights"]
    ext = min((i.get("confidence", 0.0) for i in instructions), default=0.0)
    rm = policy["rule_match_strength"].get(match_kind, 0.5)
    ev = min(1.0, (best_evidence_score or 0.0) / policy["evidence_score_scale"]) if best_evidence_score else 0.0
    total = w["extraction"] * ext + w["rule_match"] * rm + w["evidence"] * ev
    total = round(min(max(total, 0.0), 1.0), 3)
    return total, {
        "method": "weighted sum (documented policy); not a probability of clinical correctness",
        "components": [
            {"name": "Extraction confidence (min)", "value": round(ext, 3), "weight": w["extraction"]},
            {"name": f"Rule match strength ({match_kind})", "value": rm, "weight": w["rule_match"]},
            {"name": "Evidence retrieval (normalised)", "value": round(ev, 3), "weight": w["evidence"]},
        ],
        "total": total,
    }
