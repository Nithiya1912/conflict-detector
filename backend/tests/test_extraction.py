from app.services.deid import deidentify
from app.services.extraction import extract
from app.services.test_runner import compute_metrics


def by_entity(text):
    return {e.entity: e for e in extract(text)}


def test_medication_dose_frequency_timing():
    e = by_entity("Continue warfarin 5 mg once daily in the evening.")["warfarin"]
    assert (e.kind, e.direction, e.dose, e.unit, e.frequency) == ("medication", "take", "5", "mg", "once daily")
    assert e.timing_slot == "evening"


def test_missing_values_are_not_invented():
    e = by_entity("Continue levothyroxine.")["levothyroxine"]
    assert e.dose is None and e.unit is None and e.frequency is None and e.timing is None


def test_direction_restrict_and_avoid():
    ents = by_entity("Avoid grapefruit juice. Restrict potassium. Increase spinach.")
    assert ents["grapefruit"].direction == "avoid"
    assert ents["potassium"].direction == "restrict"
    assert ents["spinach"].direction == "increase"


def test_negated_increase_becomes_avoid():
    assert by_entity("Do not increase salt intake.")["sodium"].direction == "avoid"


def test_fixed_direction_phrases():
    assert by_entity("Strict bed rest for two weeks.")["bed rest"].direction == "restrict"
    assert by_entity("Follow a low sodium diet.")["sodium"].direction == "restrict"


def test_hedging_lowers_confidence():
    hedged = by_entity("Ibuprofen may be used as needed.")["ibuprofen"]
    firm = by_entity("Start ibuprofen 400 mg.")["ibuprofen"]
    assert hedged.hedged and hedged.confidence < firm.confidence


def test_longest_match_wins():
    ents = by_entity("Drink grapefruit juice daily and eat aged cheese.")
    assert "grapefruit" in ents and "aged cheese" in ents and "dairy" not in ents


def test_deidentification():
    text, n = deidentify("Patient: John Smith, MRN: 445566, phone 555-123-4567, email j@x.org on 12/03/2026.")
    assert n >= 4
    for leaked in ("John Smith", "445566", "555-123-4567", "j@x.org", "12/03/2026"):
        assert leaked not in text


def test_metrics_zero_denominator_is_undefined():
    m = compute_metrics([([], [], "pass", None)])
    assert m["precision"] is None and m["recall"] is None and m["f1"] is None


def test_metrics_standard_definitions():
    rows = [(["Drug–Drug"], ["Drug–Drug"], "pass", None),  # TP
            (["Drug–Drug"], [], "fail", None),  # FN
            ([], ["Drug–Drug"], "fail", None)]  # FP
    m = compute_metrics(rows)["per_category"]["Drug–Drug"]
    assert (m["tp"], m["fp"], m["fn"]) == (1, 1, 1)
    assert m["precision"] == 0.5 and m["recall"] == 0.5 and m["f1"] == 0.5
