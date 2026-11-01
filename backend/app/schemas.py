"""Pydantic request and response models."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Direction = Literal["take", "increase", "restrict", "avoid", "stop", "maintain", "neutral"]
Kind = Literal["medication", "diet", "lifestyle"]
Decision = Literal["confirmed", "rejected", "uncertain", "clarification_requested"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------- auth ----------------
class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RegisterIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=10, max_length=200)

    @field_validator("password")
    @classmethod
    def strong(cls, v: str) -> str:
        if not (any(c.isupper() for c in v) and any(c.islower() for c in v) and any(c.isdigit() for c in v)):
            raise ValueError("Password needs upper- and lower-case letters and a digit")
        return v


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: str
    is_demo: bool
    is_active: bool = True
    created_at: datetime
    last_login_at: datetime | None = None


# ---------------- cases & notes ----------------
class CaseIn(BaseModel):
    pseudonym: str = Field(min_length=2, max_length=120)
    age_band: str | None = Field(default=None, max_length=20)
    sex: str | None = Field(default=None, max_length=20)
    summary: str = Field(default="", max_length=2000)


class CaseUpdate(BaseModel):
    pseudonym: str | None = Field(default=None, min_length=2, max_length=120)
    age_band: str | None = Field(default=None, max_length=20)
    sex: str | None = Field(default=None, max_length=20)
    summary: str | None = Field(default=None, max_length=2000)


class NoteIn(BaseModel):
    specialist_name: str = Field(min_length=2, max_length=120)
    specialty: str = Field(min_length=2, max_length=60)
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=5, max_length=20000)
    category: Literal["medication", "diet", "lifestyle", "mixed"] = "mixed"
    note_date: datetime | None = None


class NoteUpdate(BaseModel):
    specialist_name: str | None = Field(default=None, min_length=2, max_length=120)
    specialty: str | None = Field(default=None, min_length=2, max_length=60)
    title: str | None = Field(default=None, min_length=2, max_length=200)
    content: str | None = Field(default=None, min_length=5, max_length=20000)
    category: Literal["medication", "diet", "lifestyle", "mixed"] | None = None


class PreviewIn(BaseModel):
    content: str = Field(min_length=1, max_length=20000)


class InstructionOut(ORM):
    id: int
    case_id: str
    note_id: int
    kind: str
    entity: str
    surface: str
    direction: str
    dose: str | None
    unit: str | None
    frequency: str | None
    timing: str | None
    context: str | None
    span_text: str
    span_start: int
    span_end: int
    confidence: float
    hedged: bool
    corrected: bool
    excluded: bool


class InstructionUpdate(BaseModel):
    kind: Kind | None = None
    entity: str | None = Field(default=None, min_length=1, max_length=120)
    direction: Direction | None = None
    dose: str | None = Field(default=None, max_length=40)
    unit: str | None = Field(default=None, max_length=20)
    frequency: str | None = Field(default=None, max_length=60)
    timing: str | None = Field(default=None, max_length=60)
    excluded: bool | None = None


class NoteOut(ORM):
    id: int
    case_id: str
    source_id: str
    specialist_name: str
    specialty: str
    title: str
    content: str
    category: str
    pii_redactions: int
    note_date: datetime
    diet_plan_id: int | None
    created_at: datetime
    updated_at: datetime


# ---------------- analysis ----------------
class AnalysisIn(BaseModel):
    config: Literal["full", "no_kg", "no_rag", "single_document"] = "full"
    use_llm: bool = True
    reextract: bool = False


class RunOut(ORM):
    id: int
    case_id: str
    status: str
    stage_index: int
    stages: list
    config: dict
    llm_used: bool
    conflicts_found: int
    error: str | None
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None


# ---------------- review ----------------
class ReviewIn(BaseModel):
    decision: Decision
    comment: str = Field(default="", max_length=4000)
    reason: str | None = Field(default=None, max_length=120)

    @field_validator("reason")
    @classmethod
    def _strip(cls, v):
        return v.strip() if v else v


class ReopenIn(BaseModel):
    comment: str = Field(min_length=3, max_length=4000)


# ---------------- guidelines ----------------
class GuidelineIn(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    issuer: str | None = Field(default=None, max_length=200)
    publication_date: str | None = Field(default=None, max_length=40)
    source_url: str | None = Field(default=None, max_length=500)
    license_note: str = Field(min_length=3, max_length=300, description="Confirm you are permitted to store this text")
    content: str = Field(min_length=50, max_length=400000)


class SearchIn(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    top_k: int = Field(default=5, ge=1, le=20)


# ---------------- diet plans ----------------
class MealItem(BaseModel):
    item: str = Field(min_length=1, max_length=120)
    portion: str | None = Field(default=None, max_length=60)


class Meals(BaseModel):
    breakfast: list[MealItem] = []
    lunch: list[MealItem] = []
    dinner: list[MealItem] = []
    snacks: list[MealItem] = []


class DietPlanIn(BaseModel):
    case_id: str
    title: str = Field(min_length=2, max_length=200)
    specialist_name: str = Field(min_length=2, max_length=120)
    specialty: str = Field(default="Nutrition", max_length=60)
    meals: Meals = Meals()
    restrictions: list[str] = Field(default_factory=list, max_length=30)
    nutrition_notes: str = Field(default="", max_length=4000)
    lifestyle_notes: str = Field(default="", max_length=4000)


class DietPlanUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    specialist_name: str | None = Field(default=None, min_length=2, max_length=120)
    meals: Meals | None = None
    restrictions: list[str] | None = None
    nutrition_notes: str | None = Field(default=None, max_length=4000)
    lifestyle_notes: str | None = Field(default=None, max_length=4000)
    status: Literal["draft", "analyzed", "awaiting_review", "reviewed", "archived"] | None = None


# ---------------- tests / settings ----------------
class RunTestsIn(BaseModel):
    session_ids: list[str] | None = None
    only_failed: bool = False


class PolicyIn(BaseModel):
    require_evidence_for_high: bool | None = None
    ambiguity_confidence_threshold: float | None = Field(default=None, ge=0, le=1)
    cap_ambiguous_at: Literal["low", "moderate", "high"] | None = None
    unknown_timing_policy: Literal["uncertain", "keep"] | None = None
    confidence_weights: dict[str, float] | None = None
    severity_overrides: dict[str, Literal["low", "moderate", "high", "critical"]] | None = None

    @field_validator("confidence_weights")
    @classmethod
    def weights(cls, v):
        if v is None:
            return v
        if set(v) != {"extraction", "rule_match", "evidence"} or abs(sum(v.values()) - 1) > 1e-6 or min(v.values()) < 0:
            raise ValueError("Weights must be extraction, rule_match, evidence; non-negative and summing to 1")
        return v


class UserRoleIn(BaseModel):
    role: Literal["clinician", "admin"] | None = None
    is_active: bool | None = None


class ReportIn(BaseModel):
    case_id: str
    title: str | None = Field(default=None, max_length=200)
