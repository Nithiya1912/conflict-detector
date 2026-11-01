"""Synthetic evidence corpus used when no external guideline corpus is configured.

Every document here is SYNTHETIC: short summaries written for this prototype that restate
widely documented interaction patterns in general terms. They are not published guidelines,
carry no real citation, and must not be quoted as clinical sources. A lithium–NSAID summary is
deliberately absent so the "missing evidence" path can be exercised.
"""

ISSUER = "CICD AI synthetic demonstration corpus"
LICENSE = "Synthetic text written for this prototype. Not a clinical guideline; do not cite."

DOCS: list[tuple[str, str]] = [
    ("SE-01 · Warfarin and dietary vitamin K (synthetic summary)", """
## Background
Warfarin is a vitamin K antagonist anticoagulant. Its effect is monitored with the INR.

## Dietary vitamin K
Leafy green vegetables such as spinach, kale and broccoli are rich in vitamin K. A sudden increase in vitamin K intake can reduce the anticoagulant effect of warfarin and lower the INR. Patients are usually advised to keep vitamin K intake consistent rather than to avoid green vegetables.

## Coordination point
When a dietary plan increases leafy greens for a patient taking warfarin, the prescriber and dietitian should agree a consistent intake and an INR monitoring plan.
"""),
    ("SE-02 · Anticoagulants with NSAIDs or antiplatelets (synthetic summary)", """
## Bleeding risk
Combining an anticoagulant such as warfarin with an NSAID (for example ibuprofen or naproxen) or with aspirin or another antiplatelet is commonly described as increasing bleeding risk, including gastrointestinal bleeding.

## Coordination point
When an analgesic NSAID is suggested by a different specialist for a patient on an anticoagulant, the combination should be reviewed by the prescribers.
"""),
    ("SE-03 · Grapefruit and CYP3A4-metabolised statins (synthetic summary)", """
## Interaction pattern
Grapefruit and grapefruit juice inhibit intestinal CYP3A4. Statins metabolised by CYP3A4, such as simvastatin and atorvastatin, can reach higher concentrations, raising the risk of muscle-related adverse effects.

## Note
Rosuvastatin is less dependent on CYP3A4. Advice to avoid grapefruit is often given with simvastatin.
"""),
    ("SE-04 · RAAS inhibitors, potassium-sparing diuretics and potassium (synthetic summary)", """
## Hyperkalaemia risk
ACE inhibitors (such as lisinopril), ARBs and potassium-sparing diuretics (such as spironolactone) reduce potassium excretion. Using spironolactone together with an ACE inhibitor is associated with hyperkalaemia and calls for potassium and renal monitoring.

## Dietary potassium and salt substitutes
Potassium-rich foods, potassium supplements and potassium-based salt substitutes add to the potassium load in patients on an ACE inhibitor, ARB or spironolactone. Advice to use a salt substitute should be checked against these prescriptions.
"""),
    ("SE-05 · MAO inhibitors, tyramine and serotonergic drugs (synthetic summary)", """
## Tyramine
Patients taking an MAO inhibitor (MAOI) such as phenelzine are usually told to avoid tyramine-rich foods, including aged cheese, cured meats and fermented soy products, because of the risk of a hypertensive reaction.

## Serotonergic combinations
Combining an MAOI with an SSRI such as sertraline or fluoxetine is generally considered contraindicated because of the risk of serotonin syndrome.
"""),
    ("SE-06 · Levothyroxine absorption (synthetic summary)", """
## Administration
Levothyroxine is usually taken on an empty stomach, commonly in the morning.

## Interfering items
Calcium supplements, iron supplements and coffee can reduce levothyroxine absorption when taken at the same time. Separation by several hours (often about four hours for calcium and iron) is commonly advised.
"""),
    ("SE-07 · Chelation with fluoroquinolones and tetracyclines (synthetic summary)", """
## Interaction pattern
Ciprofloxacin and doxycycline bind divalent cations. Dairy products such as milk, calcium supplements and iron supplements taken at the same time can reduce antibiotic absorption. Doses are usually separated from dairy and mineral supplements.
"""),
    ("SE-08 · Lithium and sodium balance (synthetic summary)", """
## Interaction pattern
Lithium is handled by the kidney in a similar way to sodium. Marked sodium restriction, for example a strict low-salt diet, or dehydration can increase lithium levels.

## Coordination point
A new low-sodium recommendation for a patient on lithium should be coordinated with the lithium prescriber and may warrant level monitoring.
"""),
    ("SE-09 · Insulin, sulfonylureas and fasting (synthetic summary)", """
## Hypoglycaemia
Insulin and sulfonylureas such as glipizide can cause hypoglycaemia when meals are skipped. Intermittent fasting or skipping breakfast may require dose review and closer glucose monitoring.

## Exercise
Vigorous exercise also lowers blood glucose; people using insulin are commonly advised to have an exercise glucose-monitoring plan.
"""),
    ("SE-10 · Metformin, sedatives and alcohol (synthetic summary)", """
## Metformin
Excessive alcohol intake is listed as a risk factor for lactic acidosis in patients taking metformin.

## Sedatives
Alcohol combined with a benzodiazepine such as lorazepam or a sedative such as zolpidem has additive sedative effects. Sedating medicines can also impair driving.
"""),
    ("SE-11 · Doxycycline photosensitivity (synthetic summary)", """
## Interaction pattern
Doxycycline can cause photosensitivity. Patients are usually advised to limit sun exposure and use sun protection during treatment.
"""),
    ("SE-12 · Potassium, protein and fluid targets in kidney and heart disease (synthetic summary)", """
## Potassium
In chronic kidney disease, potassium restriction is often advised when serum potassium is raised, whereas other plans may encourage potassium-rich foods. Conflicting potassium targets from different specialists need reconciliation.

## Protein
Protein restriction may be advised in some kidney disease stages while other plans recommend high-protein intake.

## Fluid
Fluid restriction is commonly used in heart failure; advice to drink large fluid volumes elsewhere conflicts with a fluid restriction.

## Sodium
Sodium restriction is commonly advised in hypertension and heart failure.
"""),
    ("SE-13 · Physical activity and bed rest (synthetic summary)", """
## Activity prescriptions
Instructions on physical activity can differ between specialists: post-operative or acute plans may require bed rest, while rehabilitation plans encourage walking and aerobic exercise. When both appear, the specialists should agree which physical activity instruction applies and when.
"""),
    ("SE-14 · Medication reconciliation and duplication (synthetic summary)", """
## Duplication
When several prescribers are involved, the same drug can appear twice with different doses, or two drugs from the same class can be prescribed together (therapeutic duplication).

## Reconciliation
Medication reconciliation compares all active medication lists to confirm a single intended regimen and remove unintended duplicate entries.
"""),
    ("SE-15 · Energy intake and exercise planning (synthetic summary)", """
## Fasting, calorie restriction and exercise
Intermittent fasting or calorie restriction combined with vigorous exercise programmes places competing demands on energy intake. Plans written separately should be reviewed together.
"""),
]
