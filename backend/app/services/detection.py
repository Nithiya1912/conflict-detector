"""Cross-instruction conflict detection.

`detect()` is a pure function over instruction dicts so that the live analysis pipeline,
the 20 test sessions and the ablation study all exercise exactly the same logic.

Pipeline configurations (ablation study):
  single_document : only compares instructions that come from the same note (baseline)
  no_kg           : cross-document, but entity->class/nutrient expansion via the KG is disabled,
                    so rules only fire on literal canonical terms
  no_rag          : cross-document with KG, evidence retrieval disabled
  full            : cross-document + KG + RAG (+ LLM explanations when configured)
"""
from dataclasses import dataclass
from itertools import combinations

from .kg import BackgroundGraph
from .knowledge import (AXIS_EVIDENCE_QUERY, AXIS_LABEL, CORE_CATEGORIES, DIRECTIONAL_AXES,
                        DUPLICATE_RULE_META, OPPOSITE_RULE_META, RESTRICTING, RULES, Rule, kind_pair_category)
from .retrieval import TfidfStore, supports
from .scoring import compute_confidence, compute_severity

PIPELINE_CONFIGS = {
    "single_document": {"label": "Single-document baseline", "cross_document": False, "use_kg": True, "use_rag": True},
    "no_kg": {"label": "Cross-document without Knowledge Graph", "cross_document": True, "use_kg": False, "use_rag": True},
    "no_rag": {"label": "Cross-document without RAG", "cross_document": True, "use_kg": True, "use_rag": False},
    "full": {"label": "Full configured pipeline", "cross_document": True, "use_kg": True, "use_rag": True},
}

INCREASING = {"increase", "take"}
THERAPEUTIC_DUP_CLASSES = {"nsaid": "moderate", "statin": "moderate", "raas_inhibitor": "moderate", "ssri": "moderate",
                           "benzodiazepine": "moderate", "anticoagulant": "high", "sulfonylurea": "moderate"}


@dataclass
class DetectionContext:
    graph: BackgroundGraph
    store: TfidfStore | None
    policy: dict
    top_k: int = 3
    min_score: float = 0.08


def _expand(ins: dict, ctx: DetectionContext, use_kg: bool) -> set[str]:
    return ctx.graph.ancestors(ins["entity"]) if use_kg else set()


def _matches(ins: dict, classes: set[str], cls_sel: tuple, terms: tuple, dirs, use_kg: bool) -> str | None:
    if ins["direction"] not in dirs:
        return None
    if ins["entity"] in terms:
        return "direct"
    if use_kg and classes & set(cls_sel):
        return "kg_class"
    return None


def _timing_status(a: dict, b: dict) -> str:
    sa, sb = a.get("timing_slot"), b.get("timing_slot")
    if "separated" in (sa, sb):
        return "separated"
    if not sa or not sb:
        return "unknown"
    if sa == sb or "meals" in (sa, sb):
        return "same"
    return "separated"


def _retrieve(ctx: DetectionContext, query: str, terms_a, terms_b, use_rag: bool, log: list | None):
    if not use_rag or ctx.store is None:
        return [], False, None
    hits = ctx.store.search(query, top_k=ctx.top_k)
    evidence = []
    for h in hits:
        if h.score < ctx.min_score:
            continue
        sup = supports(h.text, terms_a, terms_b)
        d = h.to_dict()
        d["supporting"] = sup
        d["limitations"] = ("Synthetic demonstration passage — not a published guideline." if h.is_synthetic else
                            "Retrieved passage; relevance score reflects lexical similarity only.")
        if not sup:
            d["limitations"] += " Passage does not mention both sides of the relation, so it is shown as related context only."
        evidence.append(d)
    if log is not None:
        log.append({"query": query, "results": [{"chunk_id": e["chunk_id"], "title": e["title"], "score": e["score"],
                                                 "supporting": e["supporting"]} for e in evidence]})
    supporting = [e for e in evidence if e["supporting"]]
    best = max((e["score"] for e in supporting), default=None)
    return evidence, bool(supporting), best


def _snap(i: dict) -> dict:
    keys = ("id", "note_id", "source_id", "specialty", "specialist_name", "kind", "entity", "surface", "direction", "dose",
            "unit", "frequency", "timing", "span_text", "confidence", "hedged")
    return {k: i.get(k) for k in keys}


def _uncertainty(instrs: list[dict], evidence: list, supported: bool, timing_status: str | None, use_rag: bool) -> str:
    notes = []
    for i in instrs:
        if i.get("hedged"):
            notes.append(f"'{i['surface']}' is phrased tentatively in the source note.")
        if i["kind"] == "medication" and not i.get("dose"):
            notes.append(f"Dose for {i['entity']} not specified in the source.")
    if timing_status == "unknown":
        notes.append("Administration timing is not specified for at least one instruction, so separation cannot be verified.")
    if not use_rag:
        notes.append("Evidence retrieval was disabled for this configuration.")
    elif not supported:
        notes.append("No retrieved passage supports this relation; finding relies on the rule base only.")
    elif all(e.get("is_synthetic") for e in evidence if e["supporting"]):
        notes.append("Supporting evidence comes from the synthetic demonstration corpus, not a published guideline.")
    return " ".join(notes) or "No specific uncertainty recorded beyond the general limits of rule-based matching."


def _source_phrase(i: dict) -> str:
    return f"{i.get('specialty') or 'Source'} note ({i.get('source_id') or i['note_id']})"


def detect(instructions: list[dict], ctx: DetectionContext, config: dict, retrieval_log: list | None = None,
           on_stage=None) -> list[dict]:
    cross = config.get("cross_document", True)
    use_kg = config.get("use_kg", True)
    use_rag = config.get("use_rag", True)
    active = [i for i in instructions if not i.get("excluded")]
    classes = {i["id"]: _expand(i, ctx, use_kg) for i in active}

    candidates: list[dict] = []

    def eligible(a, b):
        same_note = a["note_id"] == b["note_id"]
        return same_note if not cross else True

    # ---- 1. Rule-based relations ----
    for a, b in combinations(active, 2):
        if not eligible(a, b) or a["entity"] == b["entity"]:
            continue
        for rule in RULES:
            for x, y in ((a, b), (b, a)):
                mx = _matches(x, classes[x["id"]], rule.a_classes, rule.a_terms, rule.a_directions, use_kg)
                my = _matches(y, classes[y["id"]], rule.b_classes, rule.b_terms, rule.b_directions, use_kg)
                if not (mx and my):
                    continue
                if rule.b_intensity and y.get("intensity") != rule.b_intensity:
                    continue
                timing = _timing_status(x, y) if rule.timing_sensitive else None
                if timing == "separated":
                    continue
                candidates.append({"rule": rule, "a": x, "b": y, "match": "direct" if mx == my == "direct" else "kg_class",
                                   "timing": timing})
                break

    # ---- 2. Opposite-direction instructions on the same nutrient / factor axis ----
    for a, b in combinations(active, 2):
        if not eligible(a, b) or "medication" in (a["kind"], b["kind"]):
            continue
        if use_kg:
            axes = (classes[a["id"]] | {a["entity"]}) & (classes[b["id"]] | {b["entity"]}) & DIRECTIONAL_AXES
        else:
            axes = {a["entity"]} if a["entity"] == b["entity"] else set()
        if not axes:
            continue
        da, db_ = a["direction"], b["direction"]
        if not ((da in INCREASING and db_ in RESTRICTING) or (db_ in INCREASING and da in RESTRICTING)):
            continue
        axis = sorted(axes)[0]
        category = kind_pair_category(a["kind"], b["kind"])
        meta = OPPOSITE_RULE_META.get(category)
        if not meta:
            continue
        label = AXIS_LABEL.get(axis, axis)
        candidates.append({"opposite": True, "axis": axis, "a": a, "b": b, "category": category, "meta": meta,
                           "title": f"Opposing instructions on {label}", "match": "opposite_direction" if use_kg else "direct",
                           "query": AXIS_EVIDENCE_QUERY.get(axis, f"{label} intake recommendation"), "label": label})

    # ---- 3. Duplicate / contradictory medication instructions across notes ----
    meds = [i for i in active if i["kind"] == "medication"]
    for a, b in combinations(meds, 2):
        if a["note_id"] == b["note_id"] or not cross:
            continue
        if a["entity"] == b["entity"]:
            act_a, act_b = a["direction"] not in RESTRICTING, b["direction"] not in RESTRICTING
            if act_a != act_b:
                title, sev, kind = f"Contradictory instructions for {a['entity']} (continue vs stop/avoid)", "moderate", "contradiction"
            elif not act_a:
                continue
            elif (a.get("dose") and b.get("dose") and (a["dose"], a.get("unit")) != (b["dose"], b.get("unit"))) or \
                    (a.get("frequency") and b.get("frequency") and a["frequency"] != b["frequency"]):
                title, sev, kind = f"Different dose or frequency for {a['entity']} across notes", "moderate", "dose_mismatch"
            else:
                title, sev, kind = f"Duplicate instruction for {a['entity']} from two sources", "low", "duplicate"
            candidates.append({"duplicate": True, "a": a, "b": b, "title": title, "sev": sev, "kind": kind, "match": "duplicate"})
        elif use_kg:
            shared = classes[a["id"]] & classes[b["id"]] & set(THERAPEUTIC_DUP_CLASSES)
            if shared and a["direction"] not in RESTRICTING and b["direction"] not in RESTRICTING:
                cls = sorted(shared)[0]
                candidates.append({"therapeutic_dup": True, "a": a, "b": b, "cls": cls, "sev": THERAPEUTIC_DUP_CLASSES[cls],
                                   "title": f"Two {cls.replace('_', ' ')} agents prescribed ({a['entity']} + {b['entity']})",
                                   "match": "kg_class"})

    if on_stage:
        on_stage("retrieve", f"{len(candidates)} candidate relation(s) mapped")

    # ---- 4. Evidence retrieval + scoring ----
    results: list[dict] = []
    seen: set = set()
    groups: dict = {}
    for c in candidates:
        a, b = c["a"], c["b"]
        if c.get("opposite"):
            meta = c["meta"]
            rule_id, category, base, title = meta["id"], c["category"], meta["base_severity"], c["title"]
            terms_a = terms_b = (c["label"].split()[0].lower(),)
            query = c["query"]
            mechanism = (f"One instruction asks to {_verb(a)} {c['label']} while another asks to {_verb(b)} it; "
                         f"the instructions cannot both be followed as written.")
            next_step = meta["next_step"]
            relationship = {"type": "OPPOSITE_DIRECTION", "axis": c["axis"], "description": f"{a['entity']} ({a['direction']}) vs {b['entity']} ({b['direction']}) on {c['label']}"}
            timing = None
        elif c.get("duplicate") or c.get("therapeutic_dup"):
            rule_id = DUPLICATE_RULE_META["id"] if c.get("duplicate") else "R-DD-DUPCLASS"
            category = DUPLICATE_RULE_META["category"] if c.get("duplicate") else "Drug–Drug"
            base, title = c["sev"], c["title"]
            terms_a = (a["entity"], "duplicate", "duplication")
            terms_b = (b["entity"], "same class", "duplicat", "reconcil")
            query = "therapeutic duplication medication reconciliation multiple prescribers same drug"
            mechanism = ("The same medication appears in more than one specialist note" if c.get("duplicate")
                         else f"Both medicines belong to the {c['cls'].replace('_', ' ')} class") + \
                        "; medication reconciliation is needed to confirm a single intended regimen."
            next_step = "Perform medication reconciliation with all prescribing specialists."
            relationship = {"type": "DUPLICATE" if c.get("duplicate") else "SAME_CLASS", "kind": c.get("kind", "therapeutic_duplication"),
                            "description": f"{a['entity']} / {b['entity']}"}
            if c.get("therapeutic_dup"):
                relationship["class"] = c["cls"]
                relationship["path_a"] = ctx.graph.path(a["entity"], c["cls"])
                relationship["path_b"] = ctx.graph.path(b["entity"], c["cls"])
            timing = None
        else:
            rule: Rule = c["rule"]
            rule_id, category, base, title = rule.id, rule.category, rule.base_severity, rule.title
            terms_a, terms_b = rule.evidence_terms_a, rule.evidence_terms_b
            query = f"{rule.evidence_query} {a['entity']} {b['entity']}"
            mechanism, next_step, timing = rule.mechanism, rule.next_step, c["timing"]
            cls_a = next((x for x in rule.a_classes if x in classes[a["id"]]), None)
            cls_b = next((x for x in rule.b_classes if x in classes[b["id"]]), None)
            relationship = {"type": rule.relation, "rule_id": rule.id, "class_a": cls_a, "class_b": cls_b,
                            "path_a": ctx.graph.path(a["entity"], cls_a) if cls_a else [a["entity"]],
                            "path_b": ctx.graph.path(b["entity"], cls_b) if cls_b else [b["entity"]],
                            "match": c["match"], "timing_status": timing,
                            "description": f"{a['entity']} → {cls_a or a['entity']} —[{rule.id}]— {cls_b or b['entity']} ← {b['entity']}"}

        sig = (rule_id, tuple(sorted([(a["entity"], a["note_id"]), (b["entity"], b["note_id"])])))
        if sig in seen:
            continue
        seen.add(sig)
        # One finding per rule and source pair: "spinach and kale" in the same note extend the first match.
        group = (rule_id, a["note_id"], a["entity"], b["note_id"]) if c.get("rule") else None
        if group in groups:
            g = groups[group]
            if b["entity"] not in g["matched_relationship"]["also_matched"]:
                g["matched_relationship"]["also_matched"].append(b["entity"])
                g["instruction_ids"].append(b["id"])
            continue

        evidence, supported, best = _retrieve(ctx, query, terms_a, terms_b, use_rag, retrieval_log)
        instrs = [a, b]
        severity, sev_basis = compute_severity(rule_id=rule_id, base=base, instructions=instrs, evidence_supported=supported,
                                               timing_status=timing, source="rule", policy=ctx.policy)
        confidence, conf_basis = compute_confidence(instructions=instrs, match_kind=c["match"], best_evidence_score=best,
                                                    policy=ctx.policy)
        same_note = a["note_id"] == b["note_id"]
        reasoning = (f"{_source_phrase(a)} instructs: “{a['span_text']}”. {_source_phrase(b)} instructs: “{b['span_text']}”. "
                     f"{mechanism} Matched by deterministic rule {rule_id}"
                     f"{' via Knowledge Graph class expansion' if c['match'] == 'kg_class' else ''}."
                     f"{' Both instructions come from the same note.' if same_note else ' The instructions come from different notes, so a single-document check would not see them together.'}")
        results.append({
            "category": category,
            "is_extension": category not in CORE_CATEGORIES,
            "rule_id": rule_id,
            "source": "rule",
            "title": title,
            "instruction_ids": [a["id"], b["id"]],
            "instructions_snapshot": [_snap(a), _snap(b)],
            "note_ids": sorted({a["note_id"], b["note_id"]}),
            "matched_relationship": {**relationship, "signature": f"{rule_id}|{sig[1]}", "cross_document": not same_note},
            "severity": severity,
            "severity_basis": sev_basis,
            "confidence": confidence,
            "confidence_basis": conf_basis,
            "reasoning_summary": reasoning,
            "evidence": evidence,
            "evidence_supported": supported,
            "uncertainty": _uncertainty(instrs, evidence, supported, timing, use_rag),
            "next_step": next_step,
        })
        if group:
            results[-1]["matched_relationship"]["also_matched"] = []
            groups[group] = results[-1]
    for r in results:
        also = r["matched_relationship"].get("also_matched")
        if also:
            r["title"] += f" ({r['instructions_snapshot'][1]['entity']}, {', '.join(also)})"
            r["reasoning_summary"] += f" The same source also lists {', '.join(also)}, matched by the same rule."
    order ={"critical": 0, "high": 1, "moderate": 2, "low": 3, "uncertain": 4}
    results.sort(key=lambda r: (order[r["severity"]], -r["confidence"]))
    return results


def _verb(i: dict) -> str:
    return {"increase": "increase", "take": "include", "restrict": "restrict", "avoid": "avoid", "stop": "stop"}.get(i["direction"], "follow")
