"""Synthetic demonstration cases, diet plans and seed routine. All identifiers are fictional."""
import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..security import hash_password
from ..services import kg, retrieval
from ..services.knowledge import all_relations
from .corpus import DOCS, ISSUER, LICENSE
from .scenarios import SCENARIOS

log = logging.getLogger("cicd.seed")

DEMO_USERS = [
    ("admin@cicd.demo", "Demo Administrator", "admin", "Admin#2026demo"),
    ("clinician@cicd.demo", "Dr. Demo Clinician", "clinician", "Clinician#2026demo"),
    ("reviewer@cicd.demo", "Dr. Demo Reviewer", "clinician", "Reviewer#2026demo"),
]

CASES = [
    dict(id="CASE-1001", pseudonym="Patient Aster-01", age_band="70-79", sex="F",
         summary="Atrial fibrillation and knee osteoarthritis; seen by cardiology, orthopaedics and nutrition.", days_ago=26,
         notes=[("Dr. A. Rao", "Cardiology", "AF review", "medication",
                 "Atrial fibrillation, rate controlled. Continue warfarin 5 mg once daily in the evening. INR check in 2 weeks."),
                ("Dr. K. Mehta", "Orthopaedics", "Knee osteoarthritis", "medication",
                 "Bilateral knee osteoarthritis. Start naproxen 500 mg twice daily with food. Continue walking 20 minutes daily as tolerated."),
                ("M. Iyer, RD", "Nutrition", "Dietary review", "diet",
                 "Increase leafy greens such as spinach and kale daily. Limit added salt.")]),
    dict(id="CASE-1002", pseudonym="Patient Birch-02", age_band="60-69", sex="M",
         summary="Heart failure with chronic kidney disease stage 4.", days_ago=21,
         notes=[("Dr. A. Rao", "Cardiology", "Heart failure plan", "mixed",
                 "Heart failure with reduced ejection fraction. Continue lisinopril 10 mg daily and spironolactone 25 mg once daily. Fluid restriction 1.5 L per day."),
                ("Dr. P. Nair", "Nephrology", "CKD stage 4", "diet",
                 "Chronic kidney disease stage 4. Restrict potassium. Limit protein to moderate portions."),
                ("Dr. L. Thomas", "Urology", "Stone prevention", "diet",
                 "History of kidney stones. Drink at least 3 litres of water daily.")]),
    dict(id="CASE-1003", pseudonym="Patient Cedar-03", age_band="50-59", sex="M",
         summary="Type 2 diabetes and hyperlipidaemia; weight-management programme.", days_ago=17,
         notes=[("Dr. R. Das", "Endocrinology", "Diabetes review", "medication",
                 "Type 2 diabetes. Continue metformin 1000 mg twice daily with meals. Insulin glargine 18 units at bedtime."),
                ("Dr. S. Khan", "Cardiology", "Lipid clinic", "medication",
                 "Hyperlipidemia. Start simvastatin 40 mg at bedtime."),
                ("M. Iyer, RD", "Nutrition", "Weight plan", "diet",
                 "Begin intermittent fasting 16:8 and skip breakfast. Grapefruit is a good low-calorie snack."),
                ("Dr. F. Ali", "General Medicine", "Lifestyle", "lifestyle",
                 "Occasional alcohol is acceptable, up to one drink a day.")]),
    dict(id="CASE-1004", pseudonym="Patient Dahlia-04", age_band="60-69", sex="F",
         summary="Hypothyroidism and osteoporosis.", days_ago=12,
         notes=[("Dr. R. Das", "Endocrinology", "Thyroid", "medication",
                 "Hypothyroidism. Take levothyroxine 88 mcg every morning with breakfast."),
                ("Dr. V. Joseph", "Rheumatology", "Bone health", "medication",
                 "Osteoporosis. Take calcium supplement 600 mg with breakfast and vitamin D daily.")]),
    dict(id="CASE-1005", pseudonym="Patient Elm-05", age_band="40-49", sex="F",
         summary="Bipolar disorder and newly diagnosed hypertension.", days_ago=8,
         notes=[("Dr. N. George", "Psychiatry", "Mood stabiliser", "medication",
                 "Bipolar disorder, stable. Continue lithium 400 mg twice daily."),
                ("Dr. S. Khan", "Cardiology", "Hypertension", "diet",
                 "Hypertension. Follow a low sodium diet with no added salt. Start amlodipine 5 mg daily.")]),
    dict(id="CASE-1006", pseudonym="Patient Fern-06", age_band="30-39", sex="M",
         summary="Post-operative spinal fracture with insomnia.", days_ago=4,
         notes=[("Dr. K. Mehta", "Orthopaedics", "Post-op", "lifestyle",
                 "Strict bed rest for 10 days after spinal fixation."),
                ("J. Paul, PT", "Physiotherapy", "Early mobilisation", "lifestyle",
                 "Walk 15 minutes three times daily from day 2."),
                ("Dr. N. George", "Psychiatry", "Sleep", "medication",
                 "Insomnia. Lorazepam 1 mg at bedtime. A glass of wine in the evening is fine.")]),
    dict(id="CASE-1007", pseudonym="Patient Gorse-07", age_band="50-59", sex="F",
         summary="Draft case awaiting first analysis.", days_ago=1, analyze=False,
         notes=[("Dr. R. Das", "Endocrinology", "Diabetes", "medication",
                 "Type 2 diabetes. Start glipizide 5 mg once daily before breakfast."),
                ("J. Paul, PT", "Physiotherapy", "Exercise", "lifestyle",
                 "Start high-intensity interval training three times a week.")]),
]

DIET_PLANS = [
    dict(case_id="CASE-1002", title="Renal-cardiac meal plan", specialist_name="M. Iyer, RD", status="draft",
         meals={"breakfast": [{"item": "oat porridge", "portion": "1 bowl"}, {"item": "banana", "portion": "1 medium"}],
                "lunch": [{"item": "rice with dal", "portion": "1 plate"}],
                "dinner": [{"item": "grilled fish with vegetables", "portion": "150 g"}],
                "snacks": [{"item": "coconut water", "portion": "1 glass"}]},
         restrictions=["Limit added salt", "Moderate protein portions"],
         nutrition_notes="Increase potassium-rich foods to support heart health.",
         lifestyle_notes="Gentle walking 15 minutes daily."),
    dict(case_id="CASE-1003", title="Weight-loss plan v1", specialist_name="M. Iyer, RD", status="draft",
         meals={"breakfast": [], "lunch": [{"item": "grilled chicken salad", "portion": "1 bowl"}],
                "dinner": [{"item": "vegetable curry with brown rice", "portion": "1 plate"}],
                "snacks": [{"item": "grapefruit", "portion": "half"}]},
         restrictions=["Avoid sugar-sweetened drinks"],
         nutrition_notes="Intermittent fasting 16:8 on weekdays.",
         lifestyle_notes="Brisk walking 30 minutes daily."),
    dict(case_id="CASE-1004", title="Bone health plan", specialist_name="M. Iyer, RD", status="draft",
         meals={"breakfast": [{"item": "yogurt with fruit", "portion": "1 cup"}], "lunch": [{"item": "lentil soup", "portion": "1 bowl"}],
                "dinner": [{"item": "paneer with vegetables", "portion": "1 plate"}], "snacks": [{"item": "almonds", "portion": "20 g"}]},
         restrictions=["Limit caffeine to one cup of coffee"],
         nutrition_notes="Dairy at each meal for calcium.", lifestyle_notes="Resistance training twice a week."),
]


def diet_plan_text(p) -> str:
    g = (lambda k: getattr(p, k)) if not isinstance(p, dict) else p.get
    parts = [f"Diet plan: {g('title')} (version {g('version') or 1})."]
    for r in g("restrictions") or []:
        parts.append(r.rstrip(".") + ".")
    for slot in ("breakfast", "lunch", "dinner", "snacks"):
        items = (g("meals") or {}).get(slot) or []
        if items:
            parts.append(f"{slot.capitalize()} includes " + ", ".join(
                f"{i['item']}" + (f" ({i['portion']})" if i.get("portion") else "") for i in items) + ".")
    if g("nutrition_notes"):
        parts.append(g("nutrition_notes").rstrip(".") + ".")
    if g("lifestyle_notes"):
        parts.append(g("lifestyle_notes").rstrip(".") + ".")
    return "\n".join(parts)


def seed_knowledge(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(models.KnowledgeRelation)):
        return
    for s, st, rel, t, tt in all_relations():
        db.add(models.KnowledgeRelation(source=s, source_type=st, relation=rel, target=t, target_type=tt,
                                        provenance="CICD demo lexicon & rule set (requires clinical verification)"))
    db.commit()
    kg.invalidate()


def seed_corpus(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(models.GuidelineDocument)):
        return
    for title, content in DOCS:
        doc = models.GuidelineDocument(title=title, issuer=ISSUER, license_note=LICENSE, is_synthetic=True,
                                       content=content.strip(), status="pending")
        db.add(doc)
        db.flush()
        retrieval.index_document(db, doc)
    db.commit()


def seed_scenarios(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(models.TestSession)):
        return
    for s in SCENARIOS:
        db.add(models.TestSession(**s))
    db.commit()


def seed_users(db: Session) -> None:
    for email, name, role, pw in DEMO_USERS:
        if not db.scalar(select(models.User).where(models.User.email == email)):
            db.add(models.User(email=email, full_name=name, role=role, password_hash=hash_password(pw), is_demo=True))
    db.commit()


def seed_cases(db: Session, analyze: bool = True) -> None:
    from ..services.deid import deidentify
    from ..services.pipeline import STAGES, _run_job

    if db.scalar(select(func.count()).select_from(models.Case)):
        return
    clinician = db.scalar(select(models.User).where(models.User.email == "clinician@cicd.demo"))
    now = datetime.now(timezone.utc)
    for c in CASES:
        created = now - timedelta(days=c["days_ago"])
        case = models.Case(id=c["id"], pseudonym=c["pseudonym"], age_band=c["age_band"], sex=c["sex"], summary=c["summary"],
                           is_demo=True, created_by=clinician.id if clinician else None, created_at=created, updated_at=created)
        db.add(case)
        for idx, (who, spec, title, cat, content) in enumerate(c["notes"], 1):
            text, red = deidentify(content)
            case.notes.append(models.Note(source_id=f"{c['id']}-S{idx}", specialist_name=who, specialty=spec, title=title,
                                          content=text, category=cat, pii_redactions=red,
                                          note_date=created + timedelta(hours=idx), created_at=created + timedelta(hours=idx)))
    db.flush()
    for p in DIET_PLANS:
        plan = models.DietPlan(**p, version=1)
        db.add(plan)
        db.flush()
        case = db.get(models.Case, p["case_id"])
        case.notes.append(models.Note(source_id=f"{case.id}-DP{plan.id}", specialist_name=p["specialist_name"], specialty="Nutrition",
                                      title=f"Diet plan: {p['title']}", content=diet_plan_text(plan), category="diet", diet_plan_id=plan.id))
    db.add(models.AuditLog(actor_email="system", action="seed.demo_data", entity_type="system", detail="Synthetic demonstration cases created"))
    db.commit()
    if not analyze:
        return
    for c in CASES:
        if c.get("analyze", True):
            run = models.AnalysisRun(case_id=c["id"], status="queued", config={
                "name": "full", "label": "Full configured pipeline", "cross_document": True, "use_kg": True, "use_rag": True,
                "use_llm": False, "reextract": False}, triggered_by=clinician.id if clinician else None,
                stages=[{"key": k, "label": l, "status": "pending", "detail": None, "started_at": None, "finished_at": None}
                        for k, l in STAGES])
            db.add(run)
            db.commit()
            _run_job(run.id)  # synchronous at seed time
            db.expire_all()


def seed_all(db: Session) -> None:
    seed_users(db)
    seed_knowledge(db)
    seed_corpus(db)
    seed_scenarios(db)
    seed_cases(db, analyze=os.environ.get("CICD_SEED_ANALYZE", "1") == "1")
