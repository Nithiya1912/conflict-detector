import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConflictTrace } from '../components/conflict'
import { SeverityBadge } from '../components/ui'
import { pct, valueOrUnknown } from '../lib/format'
import type { Conflict } from '../lib/types'
import { registerSchema } from '../pages/auth/Register'
import { MemoryRouter } from 'react-router-dom'

describe('format helpers', () => {
  it('never renders undefined metrics as 100%', () => {
    expect(pct(null)).toBe('Undefined')
    expect(pct(undefined)).toBe('Undefined')
    expect(pct(0.5)).toBe('50%')
  })
  it('shows missing clinical values explicitly', () => {
    expect(valueOrUnknown(null)).toBe('Not specified')
    expect(valueOrUnknown('')).toBe('Not specified')
    expect(valueOrUnknown('once daily')).toBe('once daily')
  })
})

describe('register schema', () => {
  const base = { full_name: 'Dr Test', email: 'a@b.org', password: 'Abcdefgh12', confirm: 'Abcdefgh12', ack: true as const }
  it('accepts a strong password', () => expect(registerSchema.safeParse(base).success).toBe(true))
  it('rejects weak password and mismatch', () => {
    expect(registerSchema.safeParse({ ...base, password: 'short', confirm: 'short' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, confirm: 'Different12' }).success).toBe(false)
  })
  it('requires the research-prototype acknowledgement', () => expect(registerSchema.safeParse({ ...base, ack: false }).success).toBe(false))
})

describe('SeverityBadge', () => {
  it('labels uncertain findings fully', () => {
    render(<SeverityBadge severity="uncertain" full />)
    expect(screen.getByText('Uncertain / Insufficient Evidence')).toBeInTheDocument()
  })
})

const conflict: Conflict = {
  id: 'CNF-TEST', case_id: 'CASE-1', run_id: 1, category: 'Drug–Drug', is_extension: false, rule_id: 'R-DD-01', source: 'rule',
  title: 'Anticoagulant combined with antiplatelet/NSAID', instruction_ids: [1, 2],
  instructions_snapshot: [
    { id: 1, note_id: 1, source_id: 'S1', specialty: 'Cardiology', kind: 'medication', entity: 'warfarin', surface: 'warfarin', direction: 'take', dose: '5', unit: 'mg', frequency: null, timing: null, span_text: 'Continue warfarin 5 mg', confidence: 0.95, hedged: false },
    { id: 2, note_id: 2, source_id: 'S2', specialty: 'Orthopaedics', kind: 'medication', entity: 'ibuprofen', surface: 'ibuprofen', direction: 'take', dose: null, unit: null, frequency: null, timing: null, span_text: 'Start ibuprofen', confidence: 0.9, hedged: false },
  ],
  note_ids: [1, 2], matched_relationship: { description: 'warfarin → anticoagulant —[R-DD-01]— nsaid ← ibuprofen', type: 'INTERACTS_WITH', cross_document: true },
  severity: 'high', severity_basis: { base: 'high', steps: [{ step: 'S1', rule: 'Rule base severity', result: 'high' }], final: 'high' },
  confidence: 0.82, confidence_basis: { method: 'weighted sum', components: [{ name: 'Extraction', value: 0.9, weight: 0.4 }], total: 0.82 },
  reasoning_summary: 'Deterministic summary.', llm_explanation: null, evidence: [], evidence_supported: false,
  uncertainty: 'No retrieved passage supports this relation.', next_step: 'Reconcile.', validation_status: 'pending', created_at: new Date().toISOString(), reviews: [],
}

describe('ConflictTrace', () => {
  it('renders all ten explainability steps with provenance labels', () => {
    render(<MemoryRouter><ConflictTrace c={conflict} /></MemoryRouter>)
    for (const t of ['Source instruction A', 'Extracted entities', 'Matched relationship or rule', 'Retrieved evidence', 'Severity calculation', 'Confidence calculation', 'Human validation decision'])
      expect(screen.getByRole('heading', { name: t })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(10)
    expect(screen.getAllByText('Deterministic rule').length).toBeGreaterThan(2)
    expect(screen.getByText('Human decision')).toBeInTheDocument()
    // missing dose is shown, not inferred
    expect(screen.getAllByText('Not specified').length).toBeGreaterThan(0)
    expect(screen.getByText(/No passage met the retrieval threshold/)).toBeInTheDocument()
  })
})

describe('ReviewPanel', () => {
  it('requires a reason before a rejection can be submitted', async () => {
    const { ReviewPanel } = await import('../components/conflict')
    const onDone = vi.fn()
    render(<ReviewPanel c={conflict} reasons={['Extraction error']} onDone={onDone} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Reject/ }))
    expect(screen.getByRole('button', { name: /Record decision/ })).toBeDisabled()
    await user.selectOptions(screen.getByRole('combobox'), 'Extraction error')
    expect(screen.getByRole('button', { name: /Record decision/ })).toBeEnabled()
  })
})
