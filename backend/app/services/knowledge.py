"""Demonstration knowledge base: lexicon, entity classes and interaction rules.

IMPORTANT: This is a small, hand-curated demonstration rule set covering widely documented
interaction *patterns* (e.g. warfarin + vitamin K intake changes). Severity values are
demonstration policy values for this research prototype. They are not a validated clinical
knowledge base and must be verified by qualified clinicians before any real use.
"""
from dataclasses import dataclass, field

# --------------------------------------------------------------------------------------
# Lexicon: canonical entity -> kind, surface synonyms, classes (IS_A / CONTAINS edges)
# --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class LexEntry:
    canonical: str
    kind: str  # medication | diet | lifestyle
    synonyms: tuple[str, ...]
    classes: tuple[str, ...] = ()
    fixed_direction: str | None = None  # direction implied by the phrase itself
    intensity: str | None = None  # e.g. "vigorous" for lifestyle activity


def _m(c, syn=(), classes=()):
    return LexEntry(c, "medication", (c, *syn), tuple(classes))


def _d(c, syn=(), classes=(), fixed=None):
    return LexEntry(c, "diet", (c, *syn), tuple(classes), fixed)


def _l(c, syn=(), classes=(), fixed=None, intensity=None):
    return LexEntry(c, "lifestyle", (c, *syn), tuple(classes), fixed, intensity)


LEXICON: list[LexEntry] = [
    # ---- Medications ----
    _m("warfarin", ("coumadin",), ("vitamin_k_antagonist", "anticoagulant")),
    _m("apixaban", ("eliquis",), ("doac", "anticoagulant")),
    _m("aspirin", ("acetylsalicylic acid",), ("antiplatelet", "nsaid")),
    _m("clopidogrel", (), ("antiplatelet",)),
    _m("ibuprofen", (), ("nsaid",)),
    _m("naproxen", (), ("nsaid",)),
    _m("atorvastatin", (), ("cyp3a4_statin", "statin")),
    _m("simvastatin", (), ("cyp3a4_statin", "statin")),
    _m("rosuvastatin", (), ("statin",)),
    _m("lisinopril", (), ("ace_inhibitor", "raas_inhibitor")),
    _m("enalapril", (), ("ace_inhibitor", "raas_inhibitor")),
    _m("ramipril", (), ("ace_inhibitor", "raas_inhibitor")),
    _m("losartan", (), ("arb", "raas_inhibitor")),
    _m("spironolactone", (), ("potassium_sparing_diuretic",)),
    _m("furosemide", (), ("loop_diuretic",)),
    _m("metformin", (), ("biguanide", "glucose_lowering")),
    _m("insulin", ("insulin glargine", "insulin aspart"), ("insulin_class", "hypoglycemia_risk_agent", "glucose_lowering")),
    _m("glipizide", (), ("sulfonylurea", "hypoglycemia_risk_agent", "glucose_lowering")),
    _m("glimepiride", (), ("sulfonylurea", "hypoglycemia_risk_agent", "glucose_lowering")),
    _m("levothyroxine", ("thyroxine",), ("thyroid_hormone",)),
    _m("ciprofloxacin", (), ("fluoroquinolone", "chelation_sensitive_antibiotic")),
    _m("doxycycline", (), ("tetracycline_class", "chelation_sensitive_antibiotic", "photosensitizer")),
    _m("phenelzine", (), ("maoi",)),
    _m("tranylcypromine", (), ("maoi",)),
    _m("sertraline", (), ("ssri", "serotonergic")),
    _m("fluoxetine", (), ("ssri", "serotonergic")),
    _m("lithium", ("lithium carbonate",), ("lithium_salt",)),
    _m("amlodipine", (), ("calcium_channel_blocker",)),
    _m("lorazepam", (), ("benzodiazepine", "cns_depressant")),
    _m("diazepam", (), ("benzodiazepine", "cns_depressant")),
    _m("zolpidem", (), ("sedative_hypnotic", "cns_depressant")),
    _m("omeprazole", (), ("proton_pump_inhibitor",)),
    # ---- Diet: foods ----
    _d("spinach", (), ("vitamin_k_rich",)),
    _d("kale", (), ("vitamin_k_rich",)),
    _d("broccoli", (), ("vitamin_k_rich",)),
    _d("leafy greens", ("green leafy vegetables", "leafy green vegetables", "dark leafy greens", "collard greens"), ("vitamin_k_rich",)),
    _d("vitamin k", ("vitamin k intake",), ("vitamin_k_rich",)),
    _d("grapefruit", ("grapefruit juice",), ("grapefruit_product",)),
    _d("banana", ("bananas",), ("potassium_rich",)),
    _d("orange juice", (), ("potassium_rich",)),
    _d("potatoes", ("potato",), ("potassium_rich",)),
    _d("coconut water", (), ("potassium_rich",)),
    _d("salt substitute", ("salt substitutes", "potassium chloride salt"), ("potassium_rich",)),
    _d("potassium supplement", ("potassium supplements",), ("potassium_rich",)),
    _d("potassium-rich foods", ("potassium rich foods", "high-potassium foods"), ("potassium_rich",), "increase"),
    _d("dairy", ("dairy products", "milk", "yogurt", "yoghurt", "cheese"), ("calcium_rich",)),
    _d("calcium supplement", ("calcium supplements", "calcium carbonate"), ("calcium_rich",)),
    _d("iron supplement", ("iron supplements", "ferrous sulfate"), ("iron_source",)),
    _d("aged cheese", ("aged cheeses", "cured meats", "fermented soy", "soy sauce"), ("tyramine_rich",)),
    _d("coffee", ("caffeine",), ("caffeine_source",)),
    _d("intermittent fasting", ("fasting", "skip breakfast", "skipping breakfast", "time-restricted eating"), ("fasting_pattern",), "increase"),
    _d("very low calorie diet", ("very low-calorie diet", "calorie restriction", "800 kcal"), ("calorie",), "restrict"),
    # ---- Diet: nutrients (direction words like "low"/"high" attach to these) ----
    _d("sodium", ("salt", "salty foods", "salty snacks", "added salt"), ("sodium_nutrient",)),
    _d("potassium", (), ("potassium_nutrient",)),
    _d("protein", (), ("protein_nutrient",)),
    _d("fiber", ("fibre", "roughage"), ("fiber_nutrient",)),
    _d("fluids", ("fluid", "fluid intake", "water", "liquids"), ("fluid_volume",)),
    _d("carbohydrates", ("carbohydrate", "carbs"), ("carbohydrate_nutrient",)),
    _d("saturated fat", ("dietary fat",), ("fat_nutrient",)),
    _d("sugar", ("added sugar", "sweets"), ("sugar_nutrient",)),
    _d("low-residue diet", ("low residue diet", "low-fiber diet", "low fibre diet"), ("fiber_nutrient",), "restrict"),
    _d("ketogenic diet", ("keto diet",), ("carbohydrate_nutrient",), "restrict"),
    # ---- Lifestyle ----
    _l("alcohol", ("alcoholic drinks", "alcoholic beverages", "red wine", "wine", "beer", "spirits"), ("alcohol_use",)),
    _l("bed rest", ("strict bed rest", "complete bed rest"), ("physical_activity",), "restrict"),
    _l("strenuous activity", ("strenuous exercise", "heavy exertion", "exertion", "heavy lifting"), ("physical_activity",), None, "vigorous"),
    _l("high-intensity exercise", ("high intensity exercise", "high-intensity interval training", "hiit", "vigorous exercise", "running", "marathon training"), ("physical_activity",), "increase", "vigorous"),
    _l("aerobic exercise", ("exercise", "physical activity", "brisk walking", "walking", "walk", "swimming", "cycling", "jogging"), ("physical_activity",), None, "moderate"),
    _l("resistance training", ("strength training", "weight training"), ("physical_activity",), None, "moderate"),
    _l("driving", ("drive", "operate machinery", "operating machinery"), ("driving_activity",)),
    _l("sun exposure", ("sunbathing", "direct sunlight", "outdoor sun", "tanning"), ("sun_exposure_activity",)),
    _l("smoking", ("cigarettes", "tobacco"), ("tobacco_use",)),
]

# Class -> parent concept edges (KG hierarchy). Food classes map to nutrients so that
# "banana" (increase) can be compared with "potassium" (restrict).
CLASS_PARENTS: dict[str, list[str]] = {
    "vitamin_k_antagonist": ["anticoagulant"],
    "doac": ["anticoagulant"],
    "cyp3a4_statin": ["statin"],
    "ace_inhibitor": ["raas_inhibitor"],
    "arb": ["raas_inhibitor"],
    "sulfonylurea": ["hypoglycemia_risk_agent"],
    "insulin_class": ["hypoglycemia_risk_agent"],
    "potassium_rich": ["potassium_nutrient"],
    "vitamin_k_rich": ["vitamin_k_nutrient"],
    "calcium_rich": ["calcium_nutrient"],
    "benzodiazepine": ["cns_depressant"],
    "sedative_hypnotic": ["cns_depressant"],
}

# Nutrient/factor axes used for opposite-direction checks (Diet–Diet, Lifestyle–Lifestyle).
DIRECTIONAL_AXES = {
    "sodium_nutrient", "potassium_nutrient", "protein_nutrient", "fiber_nutrient", "fluid_volume",
    "carbohydrate_nutrient", "fat_nutrient", "sugar_nutrient", "calorie", "vitamin_k_nutrient",
    "calcium_nutrient", "physical_activity", "alcohol_use", "driving_activity", "fasting_pattern",
}

# Phrases inside axes that should not count as the "same" target for opposite checks.
AXIS_LABEL = {
    "sodium_nutrient": "sodium", "potassium_nutrient": "potassium", "protein_nutrient": "protein",
    "fiber_nutrient": "fiber", "fluid_volume": "fluid volume", "carbohydrate_nutrient": "carbohydrate",
    "fat_nutrient": "dietary fat", "sugar_nutrient": "sugar", "calorie": "energy intake",
    "vitamin_k_nutrient": "vitamin K", "calcium_nutrient": "calcium", "physical_activity": "physical activity",
    "alcohol_use": "alcohol", "driving_activity": "driving", "fasting_pattern": "fasting",
}

# --------------------------------------------------------------------------------------
# Interaction rules
# --------------------------------------------------------------------------------------

CORE_CATEGORIES = ["Drug–Drug", "Drug–Diet", "Diet–Diet"]
EXTENSION_CATEGORIES = ["Drug–Lifestyle", "Diet–Lifestyle", "Lifestyle–Lifestyle", "Other cross-instruction"]
ALL_CATEGORIES = CORE_CATEGORIES + EXTENSION_CATEGORIES

ACTIVE = {"take", "increase", "neutral", "maintain"}  # instruction is in effect / consumed
CONSUMING = {"take", "increase", "neutral"}  # consumption encouraged or unrestricted
RESTRICTING = {"restrict", "avoid", "stop"}


@dataclass(frozen=True)
class Rule:
    id: str
    category: str
    title: str
    a_classes: tuple[str, ...]
    b_classes: tuple[str, ...]
    # Literal canonical terms used when the Knowledge Graph is disabled (ablation).
    a_terms: tuple[str, ...]
    b_terms: tuple[str, ...]
    a_directions: frozenset[str]
    b_directions: frozenset[str]
    base_severity: str
    mechanism: str
    evidence_query: str
    evidence_terms_a: tuple[str, ...]
    evidence_terms_b: tuple[str, ...]
    next_step: str
    timing_sensitive: bool = False
    b_intensity: str | None = None
    relation: str = "INTERACTS_WITH"
    extra: dict = field(default_factory=dict)


def _rule(**kw) -> Rule:
    kw.setdefault("a_directions", frozenset(ACTIVE))
    kw.setdefault("b_directions", frozenset(CONSUMING))
    for k in ("a_classes", "b_classes", "a_terms", "b_terms", "evidence_terms_a", "evidence_terms_b"):
        kw[k] = tuple(kw[k])
    kw["a_directions"] = frozenset(kw["a_directions"])
    kw["b_directions"] = frozenset(kw["b_directions"])
    return Rule(**kw)


RULES: list[Rule] = [
    # ---------------- Drug–Drug ----------------
    _rule(id="R-DD-01", category="Drug–Drug", title="Anticoagulant combined with antiplatelet/NSAID",
          a_classes=["anticoagulant"], b_classes=["nsaid", "antiplatelet"], a_terms=["warfarin"], b_terms=["aspirin", "ibuprofen"],
          b_directions=ACTIVE, base_severity="high",
          mechanism="Both agents affect haemostasis; concurrent use is commonly documented as increasing bleeding risk.",
          evidence_query="anticoagulant warfarin nsaid aspirin ibuprofen bleeding risk combination",
          evidence_terms_a=["anticoagulant", "warfarin"], evidence_terms_b=["nsaid", "aspirin", "ibuprofen", "antiplatelet"],
          next_step="Confirm whether both agents are intended; review bleeding-risk monitoring with the prescribing specialists."),
    _rule(id="R-DD-02", category="Drug–Drug", title="RAAS inhibitor combined with potassium-sparing diuretic",
          a_classes=["raas_inhibitor"], b_classes=["potassium_sparing_diuretic"], a_terms=["lisinopril"], b_terms=["spironolactone"],
          b_directions=ACTIVE, base_severity="high",
          mechanism="Both drug classes can raise serum potassium; combined use is commonly documented as a hyperkalaemia risk.",
          evidence_query="ace inhibitor spironolactone potassium sparing diuretic hyperkalemia potassium monitoring",
          evidence_terms_a=["ace inhibitor", "raas", "lisinopril"], evidence_terms_b=["spironolactone", "potassium-sparing"],
          next_step="Verify the combination is intentional and that potassium/renal monitoring is planned."),
    _rule(id="R-DD-03", category="Drug–Drug", title="MAO inhibitor combined with serotonergic antidepressant",
          a_classes=["maoi"], b_classes=["serotonergic"], a_terms=["phenelzine"], b_terms=["sertraline"],
          b_directions=ACTIVE, base_severity="critical",
          mechanism="Combining MAO inhibitors with SSRIs is commonly documented as a serotonin toxicity risk.",
          evidence_query="maoi ssri serotonin syndrome combination contraindicated",
          evidence_terms_a=["maoi", "mao inhibitor", "phenelzine"], evidence_terms_b=["ssri", "sertraline", "serotonergic"],
          next_step="Escalate immediately to the prescribing clinicians for medication reconciliation."),
    _rule(id="R-DD-04", category="Drug–Drug", title="Lithium combined with NSAID",
          a_classes=["lithium_salt"], b_classes=["nsaid"], a_terms=["lithium"], b_terms=["ibuprofen"],
          b_directions=ACTIVE, base_severity="high",
          mechanism="NSAIDs are commonly documented as able to raise lithium concentrations.",
          evidence_query="lithium nsaid ibuprofen lithium level increase",
          evidence_terms_a=["lithium"], evidence_terms_b=["nsaid", "ibuprofen", "naproxen"],
          next_step="Confirm the NSAID is needed; review lithium level monitoring with psychiatry."),
    _rule(id="R-DD-05", category="Drug–Drug", title="Two CNS depressants prescribed together",
          a_classes=["benzodiazepine"], b_classes=["sedative_hypnotic"], a_terms=["lorazepam"], b_terms=["zolpidem"],
          b_directions=ACTIVE, base_severity="moderate",
          mechanism="Concurrent CNS depressants are commonly documented as having additive sedative effects.",
          evidence_query="benzodiazepine zolpidem sedative combination additive sedation",
          evidence_terms_a=["benzodiazepine", "lorazepam", "diazepam"], evidence_terms_b=["zolpidem", "sedative"],
          next_step="Confirm whether both sedatives are intended and clarify timing."),
    # ---------------- Drug–Diet ----------------
    _rule(id="R-DF-01", category="Drug–Diet", title="Vitamin K antagonist with increased vitamin K intake",
          a_classes=["vitamin_k_antagonist"], b_classes=["vitamin_k_rich"], a_terms=["warfarin"], b_terms=["vitamin k"],
          b_directions={"increase"}, base_severity="high",
          mechanism="Warfarin response is commonly documented as sensitive to changes in vitamin K intake; a sudden increase may reduce anticoagulant effect. Consistent intake is the usual advice.",
          evidence_query="warfarin vitamin k leafy greens consistent intake INR",
          evidence_terms_a=["warfarin", "vitamin k antagonist"], evidence_terms_b=["vitamin k", "leafy", "spinach", "kale", "green"],
          next_step="Ask nutrition and the anticoagulation prescriber to agree on a consistent vitamin K intake plan and INR monitoring."),
    _rule(id="R-DF-02", category="Drug–Diet", title="CYP3A4-metabolised statin with grapefruit",
          a_classes=["cyp3a4_statin"], b_classes=["grapefruit_product"], a_terms=["simvastatin", "atorvastatin"], b_terms=["grapefruit"],
          base_severity="moderate",
          mechanism="Grapefruit products are commonly documented as inhibiting CYP3A4, which can raise levels of statins such as simvastatin and atorvastatin.",
          evidence_query="grapefruit juice statin simvastatin atorvastatin cyp3a4",
          evidence_terms_a=["statin", "simvastatin", "atorvastatin"], evidence_terms_b=["grapefruit"],
          next_step="Clarify whether grapefruit should be avoided or the statin choice reviewed."),
    _rule(id="R-DF-03", category="Drug–Diet", title="Potassium-sparing diuretic with increased potassium intake",
          a_classes=["potassium_sparing_diuretic"], b_classes=["potassium_rich"], a_terms=["spironolactone"], b_terms=["potassium"],
          b_directions={"increase", "take"}, base_severity="high",
          mechanism="Potassium-sparing diuretics reduce potassium excretion; added potassium intake is commonly documented as a hyperkalaemia risk.",
          evidence_query="spironolactone potassium rich foods salt substitute hyperkalemia",
          evidence_terms_a=["spironolactone", "potassium-sparing"], evidence_terms_b=["potassium", "salt substitute", "banana"],
          next_step="Reconcile the potassium recommendation with the diuretic prescription; consider potassium monitoring."),
    _rule(id="R-DF-04", category="Drug–Diet", title="ACE inhibitor/ARB with increased potassium intake",
          a_classes=["raas_inhibitor"], b_classes=["potassium_rich"], a_terms=["lisinopril"], b_terms=["potassium"],
          b_directions={"increase", "take"}, base_severity="moderate",
          mechanism="ACE inhibitors and ARBs can raise serum potassium; high potassium intake or potassium-based salt substitutes add to this.",
          evidence_query="ace inhibitor arb potassium rich diet salt substitute hyperkalemia",
          evidence_terms_a=["ace inhibitor", "arb", "lisinopril", "losartan"], evidence_terms_b=["potassium", "salt substitute"],
          next_step="Confirm the intended potassium intake given the RAAS inhibitor; check recent potassium results."),
    _rule(id="R-DF-05", category="Drug–Diet", title="MAO inhibitor with tyramine-rich foods",
          a_classes=["maoi"], b_classes=["tyramine_rich"], a_terms=["phenelzine"], b_terms=["aged cheese"],
          base_severity="critical",
          mechanism="Tyramine-rich foods are commonly documented as a hypertensive-reaction risk in patients taking MAO inhibitors.",
          evidence_query="maoi tyramine aged cheese cured meats hypertensive crisis",
          evidence_terms_a=["maoi", "mao inhibitor", "phenelzine"], evidence_terms_b=["tyramine", "aged cheese", "cured"],
          next_step="Escalate: confirm dietary tyramine restrictions are communicated alongside the MAOI prescription."),
    _rule(id="R-DF-06", category="Drug–Diet", title="Levothyroxine taken together with calcium/iron/coffee",
          a_classes=["thyroid_hormone"], b_classes=["calcium_rich", "iron_source", "caffeine_source"], a_terms=["levothyroxine"], b_terms=["calcium supplement"],
          base_severity="moderate", timing_sensitive=True,
          mechanism="Calcium, iron and coffee are commonly documented as reducing levothyroxine absorption when taken at the same time; separation is usually advised.",
          evidence_query="levothyroxine absorption calcium iron coffee separate hours empty stomach",
          evidence_terms_a=["levothyroxine"], evidence_terms_b=["calcium", "iron", "coffee"],
          next_step="Clarify administration timing so levothyroxine is separated from the interacting item."),
    _rule(id="R-DF-07", category="Drug–Diet", title="Chelation-sensitive antibiotic taken with dairy/calcium/iron",
          a_classes=["chelation_sensitive_antibiotic"], b_classes=["calcium_rich", "iron_source"], a_terms=["ciprofloxacin", "doxycycline"], b_terms=["dairy"],
          base_severity="moderate", timing_sensitive=True,
          mechanism="Fluoroquinolones and tetracyclines are commonly documented as binding divalent cations (calcium, iron), reducing antibiotic absorption.",
          evidence_query="ciprofloxacin doxycycline dairy calcium iron absorption chelation",
          evidence_terms_a=["ciprofloxacin", "doxycycline", "fluoroquinolone", "tetracycline"], evidence_terms_b=["dairy", "calcium", "iron", "milk"],
          next_step="Clarify timing so the antibiotic is separated from dairy/mineral intake."),
    _rule(id="R-DF-08", category="Drug–Diet", title="Lithium with sodium restriction",
          a_classes=["lithium_salt"], b_classes=["sodium_nutrient"], a_terms=["lithium"], b_terms=["sodium"],
          b_directions={"restrict", "avoid"}, base_severity="high",
          mechanism="Lithium handling is commonly documented as linked to sodium balance; marked sodium restriction can raise lithium levels.",
          evidence_query="lithium low sodium diet salt restriction lithium level",
          evidence_terms_a=["lithium"], evidence_terms_b=["sodium", "salt"],
          next_step="Coordinate the sodium recommendation with the lithium prescriber; consider level monitoring."),
    _rule(id="R-DF-09", category="Drug–Diet", title="Hypoglycaemia-risk agent with fasting pattern",
          a_classes=["hypoglycemia_risk_agent"], b_classes=["fasting_pattern"], a_terms=["insulin"], b_terms=["intermittent fasting"],
          b_directions={"increase", "take"}, base_severity="high",
          mechanism="Insulin and sulfonylureas are commonly documented as increasing hypoglycaemia risk when meals are skipped or fasting is undertaken.",
          evidence_query="insulin sulfonylurea fasting skipped meals hypoglycemia dose adjustment",
          evidence_terms_a=["insulin", "sulfonylurea", "glipizide"], evidence_terms_b=["fasting", "skipped meal", "skip"],
          next_step="Ask the diabetes prescriber whether dose adjustment or glucose monitoring is needed during fasting."),
    # ---------------- Drug–Lifestyle (extension) ----------------
    _rule(id="R-DL-01", category="Drug–Lifestyle", title="Metformin with alcohol use",
          a_classes=["biguanide"], b_classes=["alcohol_use"], a_terms=["metformin"], b_terms=["alcohol"],
          base_severity="moderate",
          mechanism="Excess alcohol is commonly documented in metformin labelling as a lactic acidosis risk factor.",
          evidence_query="metformin alcohol lactic acidosis",
          evidence_terms_a=["metformin"], evidence_terms_b=["alcohol"],
          next_step="Clarify the intended alcohol guidance for a patient on metformin."),
    _rule(id="R-DL-02", category="Drug–Lifestyle", title="CNS depressant with alcohol use",
          a_classes=["cns_depressant"], b_classes=["alcohol_use"], a_terms=["lorazepam"], b_terms=["alcohol"],
          base_severity="high",
          mechanism="Alcohol and CNS depressants are commonly documented as having additive sedative and respiratory depressant effects.",
          evidence_query="benzodiazepine sedative alcohol additive sedation",
          evidence_terms_a=["benzodiazepine", "sedative", "lorazepam", "zolpidem"], evidence_terms_b=["alcohol"],
          next_step="Confirm alcohol avoidance advice accompanies the sedative prescription."),
    _rule(id="R-DL-03", category="Drug–Lifestyle", title="CNS depressant with driving",
          a_classes=["cns_depressant"], b_classes=["driving_activity"], a_terms=["lorazepam"], b_terms=["driving"],
          b_directions={"take", "increase", "neutral"}, base_severity="moderate",
          mechanism="Sedating medicines are commonly documented as impairing driving ability.",
          evidence_query="sedative benzodiazepine driving impairment",
          evidence_terms_a=["sedative", "benzodiazepine"], evidence_terms_b=["driving", "drive"],
          next_step="Clarify driving advice in light of the sedative prescription."),
    _rule(id="R-DL-04", category="Drug–Lifestyle", title="Photosensitising antibiotic with increased sun exposure",
          a_classes=["photosensitizer"], b_classes=["sun_exposure_activity"], a_terms=["doxycycline"], b_terms=["sun exposure"],
          b_directions={"increase", "take", "neutral"}, base_severity="low",
          mechanism="Doxycycline is commonly documented as causing photosensitivity.",
          evidence_query="doxycycline photosensitivity sun exposure",
          evidence_terms_a=["doxycycline"], evidence_terms_b=["sun", "photosensitivity"],
          next_step="Clarify sun-protection advice during the antibiotic course."),
    _rule(id="R-DL-05", category="Drug–Lifestyle", title="Hypoglycaemia-risk agent with vigorous exercise",
          a_classes=["hypoglycemia_risk_agent"], b_classes=["physical_activity"], a_terms=["insulin"], b_terms=["high-intensity exercise"],
          b_directions={"increase", "take", "neutral"}, b_intensity="vigorous", base_severity="low",
          mechanism="Vigorous exercise can lower blood glucose; with insulin or sulfonylureas a monitoring plan is usually advised.",
          evidence_query="insulin exercise hypoglycemia glucose monitoring",
          evidence_terms_a=["insulin", "sulfonylurea"], evidence_terms_b=["exercise", "activity"],
          next_step="Confirm an exercise glucose-monitoring plan with the diabetes team."),
    # ---------------- Diet–Lifestyle (extension) ----------------
    _rule(id="R-FL-01", category="Diet–Lifestyle", title="Fasting or very-low-calorie intake with vigorous exercise",
          a_classes=["fasting_pattern", "calorie"], b_classes=["physical_activity"], a_terms=["intermittent fasting"], b_terms=["high-intensity exercise"],
          a_directions={"increase", "take", "restrict"}, b_directions={"increase", "take", "neutral"}, b_intensity="vigorous", base_severity="low",
          mechanism="Two independent plans place competing demands on energy intake and expenditure; the combination has not been reconciled.",
          evidence_query="fasting calorie restriction vigorous exercise energy intake",
          evidence_terms_a=["fasting", "calorie"], evidence_terms_b=["exercise"],
          next_step="Ask both specialists whether the energy plan and exercise plan were designed together."),
    # Opposite-direction rules are generated dynamically (see detection.opposite_direction_conflicts).
]

RULES_BY_ID = {r.id: r for r in RULES}

OPPOSITE_RULE_META = {
    "Diet–Diet": dict(id="R-OPP-DIET", base_severity="moderate",
                      next_step="Ask the authoring specialists to agree a single target for this nutrient."),
    "Lifestyle–Lifestyle": dict(id="R-OPP-LIFE", base_severity="moderate",
                                next_step="Ask the authoring specialists which activity instruction takes precedence."),
    "Diet–Lifestyle": dict(id="R-OPP-MIX", base_severity="low",
                           next_step="Clarify which instruction applies."),
}

DUPLICATE_RULE_META = dict(id="R-DUP", category="Other cross-instruction")

# Synthetic evidence queries for opposite-direction checks.
AXIS_EVIDENCE_QUERY = {
    "sodium_nutrient": "sodium salt intake restriction recommendation",
    "potassium_nutrient": "potassium intake restriction chronic kidney disease",
    "protein_nutrient": "protein intake restriction kidney disease high protein",
    "fiber_nutrient": "fiber intake low residue diet high fiber",
    "fluid_volume": "fluid restriction heart failure fluid intake",
    "physical_activity": "physical activity bed rest exercise recommendation",
    "alcohol_use": "alcohol intake recommendation",
    "carbohydrate_nutrient": "carbohydrate intake ketogenic diet",
    "calorie": "calorie restriction energy intake",
}


def all_relations() -> list[tuple[str, str, str, str, str]]:
    """Return (source, source_type, relation, target, target_type) edges for the KG seed."""
    edges: list[tuple[str, str, str, str, str]] = []
    for e in LEXICON:
        for c in e.classes:
            rel = "IS_A" if e.kind == "medication" else ("CONTAINS" if e.kind == "diet" else "IS_A")
            edges.append((e.canonical, e.kind, rel, c, "class"))
    for child, parents in CLASS_PARENTS.items():
        for p in parents:
            edges.append((child, "class", "SUBCLASS_OF", p, "class"))
    for r in RULES:
        for a in r.a_classes:
            for b in r.b_classes:
                edges.append((a, "class", f"{r.relation}:{r.id}", b, "class"))
    return edges


def kind_pair_category(k1: str, k2: str) -> str:
    pair = frozenset((k1, k2))
    return {
        frozenset(("medication",)): "Drug–Drug",
        frozenset(("medication", "diet")): "Drug–Diet",
        frozenset(("diet",)): "Diet–Diet",
        frozenset(("medication", "lifestyle")): "Drug–Lifestyle",
        frozenset(("diet", "lifestyle")): "Diet–Lifestyle",
        frozenset(("lifestyle",)): "Lifestyle–Lifestyle",
    }[pair]
