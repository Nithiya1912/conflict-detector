import { ChevronLeft, Download, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import { CategoryChip } from '../components/conflict'
import { Button, ErrorState, PageSkeleton, SeverityBadge, ValidationBadge } from '../components/ui'
import { dateTime, pct, valueOrUnknown } from '../lib/format'
import type { CaseSummary, Conflict } from '../lib/types'
import { useApi } from '../lib/useApi'

interface Report {
  id: number; title: string; created_at: string; created_by_name: string
  content: {
    case: CaseSummary; generated_at: string; generated_by: string
    summary: { findings: number; by_severity: Record<string, number>; by_status: Record<string, number>; evidence_supported: number }
    notes: { source_id: string; specialist_name: string; specialty: string; title: string; content: string; instructions: number }[]
    conflicts: Conflict[]; policy: Record<string, unknown>; llm: { configured: boolean; model: string | null; note: string }; disclaimer: string
  }
}

export default function ReportView() {
  const { id } = useParams()
  const { data: r, error, loading, reload } = useApi<Report>(`/reports/${id}`)
  if (loading && !r) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!r) return null
  const c = r.content

  function exportJson() {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cicd-report-${r!.id}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link to="/app/reports" className="inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-primary"><ChevronLeft className="size-4" />All reports</Link>
        <div className="flex gap-2"><Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportJson}>JSON</Button><Button size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print / PDF</Button></div>
      </div>
      <article className="card mx-auto max-w-4xl p-6 sm:p-10">
        <header className="flex items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="label-xs">Cross-Instruction Conflict Detector · report #{r.id}</p>
            <h1 className="display mt-1 text-[34px] leading-tight text-ink">{r.title}</h1>
            <p className="mt-1 text-[13px] text-ink-3">Generated {dateTime(c.generated_at)} by {c.generated_by} · snapshot — later changes are not reflected</p>
          </div>
          <LogoMark size={48} animated={false} />
        </header>
        <p className="mt-5 rounded-xl border border-amber/30 bg-amber-50 px-4 py-3 text-[12.5px] text-amber">{c.disclaimer}</p>

        <section className="mt-6 grid gap-4 sm:grid-cols-4">
          {[['Findings', c.summary.findings], ['Critical / high', (c.summary.by_severity.critical ?? 0) + (c.summary.by_severity.high ?? 0)], ['With supporting evidence', c.summary.evidence_supported], ['Confirmed by reviewer', c.summary.by_status.confirmed ?? 0]].map(([k, v]) => (
            <div key={k as string} className="rounded-2xl bg-canvas p-4"><p className="num text-2xl font-bold text-ink">{v}</p><p className="text-[12px] text-ink-3">{k}</p></div>
          ))}
        </section>

        <section className="mt-8">
          <h2 className="display text-[24px] text-ink">Case</h2>
          <p className="mt-1 text-[13.5px] text-ink-2"><b>{c.case.id}</b> · {c.case.pseudonym} · {[c.case.age_band, c.case.sex].filter(Boolean).join(' · ') || 'demographics not specified'} · synthetic demonstration case</p>
          <p className="mt-1 text-[13.5px] text-ink-2">{c.case.summary}</p>
        </section>

        <section className="mt-8">
          <h2 className="display text-[24px] text-ink">Sources</h2>
          <div className="mt-2 space-y-2">{c.notes.map((n) => (
            <div key={n.source_id} className="print-break rounded-xl border border-line p-3 text-[13px]"><p className="font-semibold text-ink">{n.specialty} · {n.title} <span className="font-mono text-[11.5px] font-normal text-ink-3">{n.source_id} · {n.specialist_name} · {n.instructions} instruction(s)</span></p><p className="mt-1 whitespace-pre-line text-ink-2">{n.content}</p></div>
          ))}</div>
        </section>

        <section className="mt-8">
          <h2 className="display text-[24px] text-ink">Findings</h2>
          <div className="mt-2 space-y-4">{c.conflicts.map((f) => (
            <div key={f.id} className="print-break rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={f.severity} full /><CategoryChip category={f.category} extension={f.is_extension} /><ValidationBadge status={f.validation_status} /><span className="font-mono text-[11.5px] text-ink-3">{f.id} · {f.rule_id} · confidence {pct(f.confidence)}</span></div>
              <h3 className="mt-2 font-semibold text-ink">{f.title}</h3>
              <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">{f.instructions_snapshot.map((s) => <li key={s.id}>• <b>{s.specialty}</b> ({s.source_id}): “{s.span_text}” — {s.entity}, dose {s.dose ? `${s.dose} ${s.unit ?? ''}` : 'not specified'}, timing {valueOrUnknown(s.timing ?? null)}</li>)}</ul>
              <p className="mt-2 text-[12.5px] text-ink-2"><b>Reasoning (deterministic):</b> {f.reasoning_summary}</p>
              {f.llm_explanation && <p className="mt-1 text-[12.5px] text-ink-2"><b>{f.llm_explanation.label} ({f.llm_explanation.model}):</b> {f.llm_explanation.explanation}</p>}
              <p className="mt-1 text-[12.5px] text-ink-2"><b>Severity basis:</b> {f.severity_basis.steps.map((s) => `${s.step} ${s.rule} → ${s.result}`).join('; ')}</p>
              <p className="mt-1 text-[12.5px] text-ink-2"><b>Evidence:</b> {f.evidence.filter((e) => e.supporting).map((e) => `${e.title}${e.section ? ` §${e.section}` : ''} (retrieval score ${e.score.toFixed(3)}${e.is_synthetic ? ', synthetic' : ''})`).join('; ') || 'No supporting passage retrieved.'}</p>
              <p className="mt-1 text-[12.5px] text-ink-2"><b>Uncertainty:</b> {f.uncertainty}</p>
              <p className="mt-1 text-[12.5px] text-ink-2"><b>Suggested next step:</b> {f.next_step}</p>
              {!!f.reviews?.length && <p className="mt-1 text-[12.5px] text-ink-2"><b>Validation:</b> {f.reviews.map((rv) => `${rv.decision} by ${rv.reviewer_name} (${dateTime(rv.created_at)})${rv.reason ? ` — ${rv.reason}` : ''}${rv.comment ? `: ${rv.comment}` : ''}`).join('; ')}</p>}
            </div>
          ))}</div>
        </section>

        <footer className="mt-8 border-t border-line pt-4 text-[11.5px] text-ink-3">
          Scoring policy: evidence required for high/critical = {String(c.policy.require_evidence_for_high)}; ambiguity threshold = {String(c.policy.ambiguity_confidence_threshold)}. Generative layer: {c.llm.configured ? c.llm.model : 'not configured'}.
        </footer>
      </article>
    </div>
  )
}
