"""Privacy-by-design de-identification applied to note text before storage or LLM use.

Pattern-based scrubbing of common direct identifiers. This reduces, but does not
eliminate, re-identification risk; it is not a certified de-identification method.
"""
import re

_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("EMAIL", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")),
    ("PHONE", re.compile(r"(?<!\w)(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{3,4}[\s-]\d{3,4}(?:[\s-]\d{2,4})?(?!\w)")),
    ("ID", re.compile(r"\b(?:MRN|NHS|SSN|Aadhaar|UHID|Patient ID)[:#\s]*[A-Z0-9-]{4,}\b", re.I)),
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("DATE", re.compile(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b")),
    ("DOB", re.compile(r"\b(?:DOB|date of birth)[:\s]*[\w ,/-]{6,20}", re.I)),
    ("NAME", re.compile(r"\b(?:Patient|Pt)(?:\s+name)?[:\s]+(?:Mr\.?|Mrs\.?|Ms\.?)?\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)?")),
    ("ADDRESS", re.compile(r"\b\d{1,5}\s+[A-Z][a-z]+\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln)\b")),
]


def deidentify(text: str) -> tuple[str, int]:
    count = 0
    for label, pat in _PATTERNS:
        text, n = pat.subn(f"[REDACTED-{label}]", text)
        count += n
    return text, count
