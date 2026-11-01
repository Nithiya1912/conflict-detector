export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'uncertain'
export type ValidationStatus = 'pending' | 'confirmed' | 'rejected' | 'uncertain' | 'clarification_requested'

export interface User {
  id: number
  email: string
  full_name: string
  role: 'clinician' | 'admin'
  is_demo: boolean
  created_at: string
  last_login_at?: string | null
}

export interface CaseSummary {
  id: string
  pseudonym: string
  age_band: string | null
  sex: string | null
  summary: string
  status: string
  is_demo: boolean
  archived: boolean
  created_at: string
  updated_at: string
  note_count: number
  specialties: string[]
  conflict_count: number
  pending_count: number
  top_severity: Severity | null
}

export interface Instruction {
  id: number
  case_id: string
  note_id: number
  kind: 'medication' | 'diet' | 'lifestyle'
  entity: string
  surface: string
  direction: string
  dose: string | null
  unit: string | null
  frequency: string | null
  timing: string | null
  context: string | null
  span_text: string
  span_start: number
  span_end: number
  confidence: number
  hedged: boolean
  corrected: boolean
  excluded: boolean
}

export interface Note {
  id: number
  case_id: string
  source_id: string
  specialist_name: string
  specialty: string
  title: string
  content: string
  category: string
  pii_redactions: number
  note_date: string
  diet_plan_id: number | null
  created_at: string
  updated_at: string
  instruction_count: number
  instructions?: Instruction[]
}

export interface Evidence {
  chunk_id: number
  document_id: number
  title: string
  issuer: string | null
  publication_date: string | null
  section: string | null
  page: string | null
  text: string
  score: number
  is_synthetic: boolean
  source_url: string | null
  supporting: boolean
  limitations: string
}

export interface Snapshot {
  id: number
  note_id: number
  source_id: string | null
  specialty: string | null
  specialist_name?: string | null
  kind: string
  entity: string
  surface: string
  direction: string
  dose?: string | null
  unit?: string | null
  frequency?: string | null
  timing?: string | null
  span_text: string
  confidence: number
  hedged: boolean
}

export interface Review {
  id: number
  conflict_id: string
  reviewer_id: number
  reviewer_name: string
  decision: string
  reason: string | null
  comment: string
  previous_status: string
  created_at: string
}

export interface BasisStep { step: string; rule: string; result: string }

export interface Conflict {
  id: string
  case_id: string
  run_id: number | null
  category: string
  is_extension: boolean
  rule_id: string
  source: 'rule' | 'llm'
  title: string
  instruction_ids: number[]
  instructions_snapshot: Snapshot[]
  note_ids: number[]
  matched_relationship: Record<string, unknown> & { description?: string; type?: string; cross_document?: boolean; path_a?: string[]; path_b?: string[] }
  severity: Severity
  severity_basis: { base: string; steps: BasisStep[]; final: string }
  confidence: number
  confidence_basis: { method: string; components: { name: string; value: number; weight: number }[]; total: number }
  reasoning_summary: string
  llm_explanation: { explanation: string; model: string; label: string; clarification_questions?: string[]; limitations?: string } | null
  evidence: Evidence[]
  evidence_supported: boolean
  uncertainty: string
  next_step: string
  validation_status: ValidationStatus
  created_at: string
  reviews?: Review[]
  case?: { id: string; pseudonym: string }
  notes?: { id: number; title: string; specialty: string; source_id: string; specialist_name: string; content: string }[]
}

export interface Stage {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  detail: string | null
  started_at: string | null
  finished_at: string | null
}

export interface Run {
  id: number
  case_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  stage_index: number
  stages: Stage[]
  config: { name: string; label: string; use_llm?: boolean; cross_document: boolean; use_kg: boolean; use_rag: boolean }
  llm_used: boolean
  conflicts_found: number
  error: string | null
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  conflicts?: Conflict[]
  pseudonym?: string
}

export interface CaseDetail extends CaseSummary {
  notes: Note[]
  conflicts: Conflict[]
  runs: Run[]
  reviews: Review[]
  diet_plans: { id: number; title: string; status: string; version: number }[]
}

export interface MealItem { item: string; portion?: string | null }
export interface Meals { breakfast: MealItem[]; lunch: MealItem[]; dinner: MealItem[]; snacks: MealItem[] }

export interface DietPlan {
  id: number
  case_id: string
  title: string
  specialist_name: string
  specialty: string
  version: number
  status: string
  meals: Meals
  restrictions: string[]
  nutrition_notes: string
  lifestyle_notes: string
  is_demo: boolean
  parent_id: number | null
  last_run_id: number | null
  created_at: string
  updated_at: string
  note_id: number | null
  flag_count?: number
  case_pseudonym?: string
}

export interface Metrics {
  sessions: number
  confusion: { tp: number; fp: number; fn: number; tn: number }
  precision: number | null
  recall: number | null
  f1: number | null
  accuracy: number | null
  per_category: Record<string, { tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null; f1: number | null; support: number }>
  session_level: { tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null }
  pass: number
  fail: number
  needs_review: number
  pass_rate: number | null
  evidence_coverage: number | null
  findings: number
}

export interface TestSessionSummary {
  id: string
  title: string
  description: string
  focus: string[]
  expected_categories: string[]
  expected_outcome: string
  expected_evidence: boolean
  expected_severity_band: string[] | null
  assumptions: string
  status: 'not_run' | 'pass' | 'fail' | 'needs_review'
  actual_categories: string[]
  actual_outcome: string | null
  executed_at: string | null
  duration_ms: number | null
  note_count?: number
}

export interface SuiteSummary {
  total: number
  executed: number
  completion_rate: number | null
  pass: number
  fail: number
  needs_review: number
  not_run: number
  total_duration_ms: number
  metrics: Metrics | null
}
