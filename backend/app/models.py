"""SQLAlchemy ORM models.

JSON columns are used for small nested structures (stage lists, evidence snapshots)
so the schema stays portable between SQLite and PostgreSQL.
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="clinician")  # clinician | admin
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    pseudonym: Mapped[str] = mapped_column(String(120))
    age_band: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sex: Mapped[str | None] = mapped_column(String(20), nullable=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|analyzed|in_review|reviewed|archived
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    is_test: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    notes: Mapped[list["Note"]] = relationship(back_populates="case", cascade="all, delete-orphan", order_by="Note.created_at")
    conflicts: Mapped[list["Conflict"]] = relationship(back_populates="case", cascade="all, delete-orphan")


class Note(Base):
    __tablename__ = "notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    source_id: Mapped[str] = mapped_column(String(40), index=True)
    specialist_name: Mapped[str] = mapped_column(String(120))
    specialty: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(20), default="mixed")  # medication|diet|lifestyle|mixed
    pii_redactions: Mapped[int] = mapped_column(Integer, default=0)
    note_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    diet_plan_id: Mapped[int | None] = mapped_column(ForeignKey("diet_plans.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    case: Mapped[Case] = relationship(back_populates="notes")
    instructions: Mapped[list["Instruction"]] = relationship(back_populates="note", cascade="all, delete-orphan")


class Instruction(Base):
    """A structured entity extracted from a note (medication, diet or lifestyle instruction)."""
    __tablename__ = "instructions"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # medication|diet|lifestyle
    entity: Mapped[str] = mapped_column(String(120))  # canonical name
    surface: Mapped[str] = mapped_column(String(200))  # text as written
    direction: Mapped[str] = mapped_column(String(20))  # take|increase|restrict|avoid|stop|maintain|neutral
    dose: Mapped[str | None] = mapped_column(String(40), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    frequency: Mapped[str | None] = mapped_column(String(60), nullable=True)
    timing: Mapped[str | None] = mapped_column(String(60), nullable=True)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    span_text: Mapped[str] = mapped_column(Text)
    span_start: Mapped[int] = mapped_column(Integer, default=0)
    span_end: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    hedged: Mapped[bool] = mapped_column(Boolean, default=False)
    corrected: Mapped[bool] = mapped_column(Boolean, default=False)
    excluded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    note: Mapped[Note] = relationship(back_populates="instructions")


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued|running|completed|failed|cancelled
    stage_index: Mapped[int] = mapped_column(Integer, default=0)
    stages: Mapped[list] = mapped_column(JSON, default=list)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    llm_used: Mapped[bool] = mapped_column(Boolean, default=False)
    conflicts_found: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    triggered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Conflict(Base):
    __tablename__ = "conflicts"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[int | None] = mapped_column(ForeignKey("analysis_runs.id", ondelete="SET NULL"), nullable=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    is_extension: Mapped[bool] = mapped_column(Boolean, default=False)
    rule_id: Mapped[str] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(20), default="rule")  # rule | llm
    title: Mapped[str] = mapped_column(String(300))
    instruction_ids: Mapped[list] = mapped_column(JSON, default=list)
    instructions_snapshot: Mapped[list] = mapped_column(JSON, default=list)
    note_ids: Mapped[list] = mapped_column(JSON, default=list)
    matched_relationship: Mapped[dict] = mapped_column(JSON, default=dict)
    severity: Mapped[str] = mapped_column(String(20), index=True)  # critical|high|moderate|low|uncertain
    severity_basis: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float)
    confidence_basis: Mapped[dict] = mapped_column(JSON, default=dict)
    reasoning_summary: Mapped[str] = mapped_column(Text)
    llm_explanation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    evidence: Mapped[list] = mapped_column(JSON, default=list)
    uncertainty: Mapped[str] = mapped_column(Text, default="")
    next_step: Mapped[str] = mapped_column(Text, default="")
    validation_status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    case: Mapped[Case] = relationship(back_populates="conflicts")
    reviews: Mapped[list["ReviewDecision"]] = relationship(back_populates="conflict", cascade="all, delete-orphan", order_by="ReviewDecision.created_at")


class ReviewDecision(Base):
    """Append-only history of clinician decisions. Never updated in place."""
    __tablename__ = "review_decisions"
    id: Mapped[int] = mapped_column(primary_key=True)
    conflict_id: Mapped[str] = mapped_column(ForeignKey("conflicts.id", ondelete="CASCADE"), index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reviewer_name: Mapped[str] = mapped_column(String(200))
    decision: Mapped[str] = mapped_column(String(30))  # confirmed|rejected|uncertain|clarification_requested|reopened
    reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    comment: Mapped[str] = mapped_column(Text, default="")
    previous_status: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    conflict: Mapped[Conflict] = relationship(back_populates="reviews")


class GuidelineDocument(Base):
    __tablename__ = "guideline_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    issuer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    publication_date: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    license_note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|indexed|failed
    content: Mapped[str] = mapped_column(Text)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    chunks: Mapped[list["GuidelineChunk"]] = relationship(back_populates="document", cascade="all, delete-orphan", order_by="GuidelineChunk.ordinal")


class GuidelineChunk(Base):
    __tablename__ = "guideline_chunks"
    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("guideline_documents.id", ondelete="CASCADE"), index=True)
    ordinal: Mapped[int] = mapped_column(Integer)
    section: Mapped[str | None] = mapped_column(String(200), nullable=True)
    page: Mapped[str | None] = mapped_column(String(20), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    term_counts: Mapped[dict] = mapped_column(JSON, default=dict)

    document: Mapped[GuidelineDocument] = relationship(back_populates="chunks")


class RetrievalLog(Base):
    __tablename__ = "retrieval_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    query: Mapped[str] = mapped_column(Text)
    origin: Mapped[str] = mapped_column(String(30), default="search")  # search|analysis|test
    case_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    results: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class KnowledgeRelation(Base):
    """Edges of the background knowledge graph (entity -> class, food -> nutrient, class -> rule)."""
    __tablename__ = "knowledge_relations"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(120), index=True)
    source_type: Mapped[str] = mapped_column(String(30))
    relation: Mapped[str] = mapped_column(String(40))
    target: Mapped[str] = mapped_column(String(120), index=True)
    target_type: Mapped[str] = mapped_column(String(30))
    provenance: Mapped[str] = mapped_column(String(200), default="CICD demo lexicon")


class DietPlan(Base):
    __tablename__ = "diet_plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    specialist_name: Mapped[str] = mapped_column(String(120))
    specialty: Mapped[str] = mapped_column(String(60), default="Nutrition")
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|analyzed|awaiting_review|reviewed|archived
    meals: Mapped[dict] = mapped_column(JSON, default=dict)  # {breakfast:[{item,portion}],lunch:[],dinner:[],snacks:[]}
    restrictions: Mapped[list] = mapped_column(JSON, default=list)
    nutrition_notes: Mapped[str] = mapped_column(Text, default="")
    lifestyle_notes: Mapped[str] = mapped_column(Text, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("diet_plans.id", ondelete="SET NULL"), nullable=True)
    last_run_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class TestSession(Base):
    __tablename__ = "test_sessions"
    id: Mapped[str] = mapped_column(String(10), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    focus: Mapped[list] = mapped_column(JSON, default=list)  # coverage tags
    notes: Mapped[list] = mapped_column(JSON, default=list)  # [{specialist_name, specialty, title, content}]
    expected_categories: Mapped[list] = mapped_column(JSON, default=list)
    expected_outcome: Mapped[str] = mapped_column(String(20))  # conflict|no_conflict|needs_review
    expected_evidence: Mapped[bool] = mapped_column(Boolean, default=False)
    expected_severity_band: Mapped[list | None] = mapped_column(JSON, nullable=True)
    assumptions: Mapped[str] = mapped_column(Text, default="")
    # Latest execution snapshot (full-pipeline config)
    status: Mapped[str] = mapped_column(String(20), default="not_run")  # not_run|pass|fail|needs_review
    actual_categories: Mapped[list] = mapped_column(JSON, default=list)
    actual_outcome: Mapped[str | None] = mapped_column(String(20), nullable=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class TestExecution(Base):
    __tablename__ = "test_executions"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("test_sessions.id", ondelete="CASCADE"), index=True)
    config_name: Mapped[str] = mapped_column(String(40), default="full")
    evaluation_run_id: Mapped[int | None] = mapped_column(ForeignKey("evaluation_runs.id", ondelete="CASCADE"), nullable=True)
    status: Mapped[str] = mapped_column(String(20))
    actual_categories: Mapped[list] = mapped_column(JSON, default=list)
    actual_outcome: Mapped[str] = mapped_column(String(20))
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)


class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(120))
    configs: Mapped[list] = mapped_column(JSON, default=list)
    results: Mapped[dict] = mapped_column(JSON, default=dict)  # {config_name: metrics}
    sessions_count: Mapped[int] = mapped_column(Integer, default=0)
    triggered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30), default="case")  # case|diet_plan
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by_name: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_email: Mapped[str] = mapped_column(String(255), default="system")
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str] = mapped_column(String(60), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class AppSetting(Base):
    __tablename__ = "app_settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
