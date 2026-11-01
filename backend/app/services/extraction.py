"""Deterministic NLP extraction of medication, diet and lifestyle instructions.

The extractor is lexicon-driven (see knowledge.LEXICON). It never invents values:
dose, unit, frequency and timing are only populated when explicitly present in the
same clause; otherwise they are None and shown as "Not specified".
"""
import re
from dataclasses import asdict, dataclass

from .knowledge import LEXICON, LexEntry

# Longest synonyms first so "grapefruit juice" wins over "grapefruit", "aged cheese" over "cheese".
_SURFACES: list[tuple[str, LexEntry]] = sorted(
    ((s.lower(), e) for e in LEXICON for s in e.synonyms), key=lambda t: -len(t[0])
)
_PATTERNS = [(re.compile(r"(?<![\w-])" + re.escape(s) + r"(?![\w])", re.I), s, e) for s, e in _SURFACES]

RESTRICT_CUES = [
    "avoid", "avoiding", "avoidance", "no", "not", "don't", "do not", "never", "limit", "limited", "limiting",
    "restrict", "restricted", "restriction", "reduce", "reduced", "reducing", "low", "low-", "lower", "minimize",
    "minimise", "cut down", "cut back", "abstain", "abstinence", "eliminate", "refrain", "without", "less",
    "under", "below", "max", "maximum", "no more than", "free",
]
STOP_CUES = ["stop", "discontinue", "discontinued", "hold", "cease", "withdraw"]
INCREASE_CUES = [
    "increase", "increased", "increasing", "more", "high", "high-", "higher", "rich", "plenty", "encourage",
    "encouraged", "at least", "liberal", "liberally", "generous", "extra", "boost", "double", "aim for",
    "add", "adding", "every day", "daily", "large", "larger", "maximize", "up to",
]
TAKE_CUES = ["take", "takes", "taking", "start", "started", "continue", "continuing", "prescribed", "eat", "drink",
             "include", "consume", "enjoy", "use", "begin", "permitted", "allowed", "fine", "ok", "okay", "resume"]
MAINTAIN_CUES = ["consistent", "consistently", "steady", "stable", "maintain", "same amount", "unchanged", "keep"]
HEDGE_CUES = ["may", "might", "consider", "if tolerated", "as needed", "prn", "possibly", "perhaps", "?", "unclear",
              "could", "as appropriate", "where possible", "occasionally"]
NEGATORS = {"no", "not", "don't", "never", "avoid", "without"}

DOSE_RE = re.compile(r"(\d+(?:\.\d+)?)\s?(mg|mcg|µg|g|units?|iu|ml|mmol|kcal|l|litres?|liters?)\b", re.I)
FREQ_RE = re.compile(
    r"\b(once daily|twice daily|three times daily|four times daily|once a day|twice a day|daily|nightly|weekly|"
    r"every \d+ hours|every morning|every evening|every night|bid|tid|qid|qd|qhs|as needed|prn|"
    r"\d+ times (?:a|per) (?:day|week)|most days|on weekends)\b", re.I)
TIMING_PATTERNS = [
    (re.compile(r"\b(on an empty stomach|empty stomach|before breakfast|on waking|first thing in the morning)\b", re.I), "morning (empty stomach)", "morning"),
    (re.compile(r"\b(with breakfast|at breakfast|in the morning|every morning|morning)\b", re.I), "morning / breakfast", "morning"),
    (re.compile(r"\b(with lunch|at lunch|midday|noon)\b", re.I), "midday / lunch", "midday"),
    (re.compile(r"\b(with dinner|at dinner|in the evening|every evening|evening|with supper)\b", re.I), "evening / dinner", "evening"),
    (re.compile(r"\b(at bedtime|before bed|at night|nightly|every night|qhs)\b", re.I), "bedtime", "night"),
    (re.compile(r"\b(with meals|with food|with each meal|after meals)\b", re.I), "with meals", "meals"),
    (re.compile(r"\b(separate(?:d)? by \d+ hours?|\d+ hours? apart|at least \d+ hours? (?:before|after))\b", re.I), "separated by interval", "separated"),
]
CONTEXT_RE = re.compile(
    r"\b(atrial fibrillation|heart failure|hypertension|type 2 diabetes|diabetes|chronic kidney disease|ckd|"
    r"hypothyroidism|depression|bipolar disorder|osteoporosis|hyperlipidemia|dyslipidaemia|dyslipidemia|"
    r"obesity|osteoarthritis|insomnia|anxiety|urinary tract infection|uti|pneumonia|acne|post-operative|"
    r"pregnancy|anemia|anaemia|crohn's disease|diverticulitis)\b", re.I)

CLAUSE_SPLIT = re.compile(r";|\bbut\b|\bhowever\b|\bwhereas\b|\bwhile\b|\balthough\b", re.I)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+|\n+")


@dataclass
class Extracted:
    kind: str
    entity: str
    surface: str
    direction: str
    dose: str | None
    unit: str | None
    frequency: str | None
    timing: str | None
    timing_slot: str | None
    context: str | None
    span_text: str
    span_start: int
    span_end: int
    confidence: float
    hedged: bool
    classes: list[str]
    intensity: str | None

    def to_dict(self) -> dict:
        return asdict(self)


def _segments(text: str):
    """Yield (clause_text, absolute_start) pairs."""
    pos = 0
    for sent in SENTENCE_SPLIT.split(text):
        if not sent:
            continue
        s_start = text.find(sent, pos)
        pos = s_start + len(sent)
        c_pos = 0
        for clause in CLAUSE_SPLIT.split(sent):
            if not clause.strip():
                continue
            c_start = sent.find(clause, c_pos)
            c_pos = c_start + len(clause)
            yield clause, s_start + c_start, sent


def _cue_positions(clause_l: str, cues: list[str]):
    for cue in cues:
        pat = r"(?<![\w])" + re.escape(cue) + (r"(?![\w])" if cue[-1].isalnum() or cue[-1] == "'" else "")
        for m in re.finditer(pat, clause_l):
            yield m.start(), m.end(), cue


def _direction(clause: str, ent_start: int, ent_end: int, entry: LexEntry) -> tuple[str, float]:
    """Return (direction, cue_strength). Nearest cue in the clause wins; negators flip increase/take."""
    if entry.fixed_direction:
        # Fixed phrases ("bed rest", "low-residue diet") can still be negated: "avoid bed rest".
        low = clause.lower()
        pre = low[max(0, ent_start - 25):ent_start]
        if entry.fixed_direction == "restrict" and re.search(r"\b(avoid|no longer|not|discontinue|end|stop)\b", pre):
            return "increase", 0.8
        if entry.fixed_direction == "increase" and re.search(r"\b(avoid|no|not|do not|don't|stop|never)\b", pre):
            return "avoid", 0.9
        return entry.fixed_direction, 0.95
    low = clause.lower()
    candidates: list[tuple[int, str, int, int]] = []
    for group, cues in (("restrict", RESTRICT_CUES), ("stop", STOP_CUES), ("increase", INCREASE_CUES),
                        ("take", TAKE_CUES), ("maintain", MAINTAIN_CUES)):
        for s, e, cue in _cue_positions(low, cues):
            if s >= ent_start and e <= ent_end:
                continue  # cue inside the entity itself (e.g. "low" in "low-residue")
            dist = ent_start - e if e <= ent_start else s - ent_end
            # Cues before the entity are more reliable than cues after it.
            weight = dist if e <= ent_start else dist * 1.6 + 4
            candidates.append((int(weight), group, s, e))
    if not candidates:
        return ("take" if entry.kind == "medication" else "neutral"), 0.6
    candidates.sort()
    _, group, s, _ = candidates[0]
    # Negation: "do not increase salt", "no more coffee", "not to exceed".
    before = low[max(0, s - 14):s]
    if group in ("increase", "take") and any(re.search(r"(?<![\w])" + n + r"(?![\w])", before) for n in NEGATORS):
        group = "avoid"
    if group == "restrict" and (low[s:s + 5] in ("avoid", "never") or low[s:s + 6] == "do not" or low[s:s + 3] == "no "):
        group = "avoid"
    if entry.kind == "medication" and group in ("increase", "maintain"):
        group = "take"
    if entry.kind == "medication" and group == "restrict":
        group = "avoid"
    return group, 0.9


def _nearest(regex: re.Pattern, clause: str, ent_start: int) -> re.Match | None:
    best = None
    for m in regex.finditer(clause):
        d = abs(m.start() - ent_start)
        if best is None or d < best[0]:
            best = (d, m)
    return best[1] if best else None


def extract(text: str) -> list[Extracted]:
    results: list[Extracted] = []
    for clause, c_abs, sentence in _segments(text):
        taken: list[tuple[int, int]] = []
        for pat, _surface_l, entry in _PATTERNS:
            for m in pat.finditer(clause):
                if any(not (m.end() <= a or m.start() >= b) for a, b in taken):
                    continue
                taken.append((m.start(), m.end()))
                direction, cue_strength = _direction(clause, m.start(), m.end(), entry)
                low = clause.lower()
                hedged = any(re.search(r"(?<![\w])" + re.escape(h) + (r"(?![\w])" if h[-1].isalnum() else ""), low)
                             for h in HEDGE_CUES)
                dose = unit = None
                if entry.kind in ("medication", "diet"):
                    dm = _nearest(DOSE_RE, clause, m.start())
                    # Only attach a dose when no other medication sits between it and the entity.
                    if dm and abs(dm.start() - m.end()) < 40:
                        dose, unit = dm.group(1), dm.group(2).lower()
                fm = _nearest(FREQ_RE, clause, m.start())
                frequency = fm.group(1).lower() if fm else None
                timing = timing_slot = None
                for tre, label, slot in TIMING_PATTERNS:
                    if tre.search(clause):
                        timing, timing_slot = label, slot
                        break
                ctx = CONTEXT_RE.search(sentence)
                conf = 0.55 + 0.35 * cue_strength
                if m.group(0).lower() == entry.canonical.lower():
                    conf += 0.05
                if hedged:
                    conf -= 0.25
                conf = round(max(0.05, min(conf, 0.99)), 2)
                results.append(Extracted(
                    kind=entry.kind, entity=entry.canonical, surface=m.group(0), direction=direction,
                    dose=dose, unit=unit, frequency=frequency, timing=timing, timing_slot=timing_slot,
                    context=ctx.group(0) if ctx else None, span_text=clause.strip(),
                    span_start=c_abs + m.start(), span_end=c_abs + m.end(), confidence=conf, hedged=hedged,
                    classes=list(entry.classes), intensity=entry.intensity,
                ))
    return results


TIMING_SLOT_BY_LABEL = {label: slot for _, label, slot in TIMING_PATTERNS}
LEX_BY_CANONICAL = {e.canonical: e for e in LEXICON}
