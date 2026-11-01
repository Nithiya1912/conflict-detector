import { Check, ChevronLeft, Play, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CategoryChip } from '../components/conflict'
import { KindBadge } from '../components/notes'
import { Badge, Button, Card, CardHeader, DemoChip, ErrorState, KV, PageHeader, PageSkeleton, SeverityBadge, TestBadge, useToast } from '../components/ui'
import { api } from '../lib/api'
import { DIRECTION_LABEL, cn, dateTime, ms, pct, valueOrUnknown } from '../lib/format'
import type { Severity, TestSessionSummary } from '../lib/types'
import { useApi } from '../lib/useApi'

type Finding = { category: string; rule_id: string; title: string; severity: Severity; confidence: number; evidence_supported: boolean; reasoning_summary: string; uncertainty: string; severity_basis: { steps: { step: string; rule: string; result: string }[] } }
type Detail = TestSessionSummary & {
  notes: { specialist_name: string; specialty: string; title: string; content: string }[]
  result: { config?: string; checks?: { check: string; expected: unknown; actual: unknown; ok: boolean }[]; instructions?: { note_id: number; kind: string; entity: string; direction: string; dose: string | null; unit: string | null; frequency: string | null; timing: string | null; confidence: number; hedged: boolean; span_text: string }[]; findings?: Finding[] }
  history: { id: number; config_name: string; status: string; actual_categories: string[]; actual_outcome: string; executed_at: string; duration_ms: number; evaluation_run_id: number | null }[]
}
const fmt = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v))

export default function TestSessionDetail() {
  const { id } = useParams()
  const toast = useToast()
  const { data: t, error, loading, reload } = useApi<Detail>(`/test-sessions/${id}`)
  const [busy, setBusy] = useState(false)
  if (loading && !t) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!t) return null

  async function run() {
    setBusy(true)
    try {
      await api('/test-sessions/run', { body: { session_ids: [t!.id] } })
      toast({ kind: 'success', title: `${t!.id} executed` })
      reload(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Link to="/app/tests" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-primary"><ChevronLeft className="size-4" />All test sessions</Link>
      <PageHeader eyebrow={<><span className="font-mono">{t.id}</span> <DemoChip>Synthetic scenario</DemoChip></>} title={<span className="flex flex-wrap items-center gap-3">{t.title} <TestBadge status={t.status} /></span>} subtitle={t.description}
        actions={<Button icon={<Play className="size-4" />} loading={busy} onClick={run}>Run session</Button>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Expected vs actual" subtitle={t.executed_at ? `Last executed ${dateTime(t.executed_at)} · ${ms(t.duration_ms)} · configuration: ${t.result.config ?? 'full'}` : 'Not executed yet'} />
            <div className="overflow-x-auto px-5 pb-5">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead><tr className="text-left text-ink-3"><th className="py-2 pr-3 font-semibold">Check</th><th className="py-2 pr-3 font-semibold">Expected</th><th className="py-2 pr-3 font-semibold">Actual</th><th className="py-2 font-semibold">Result</th></tr></thead>
                <tbody>
                  {(t.result.checks ?? [
                    { check: 'C1 Categories', expected: t.expected_categories.length ? t.expected_categories : ['(none)'], actual: '—', ok: false },
                    { check: 'C2 Outcome', expected: t.expected_outcome, actual: '—', ok: false },
                  ]).map((c) => (
                    <tr key={c.check} className="border-t border-line">
                      <td className="py-2.5 pr-3 font-semibold text-ink">{c.check}</td>
                      <td className="py-2.5 pr-3 text-ink-2">{fmt(c.expected)}</td>
                      <td className="py-2.5 pr-3 text-ink-2">{fmt(c.actual)}</td>
                      <td className="py-2.5">{t.status === 'not_run' ? <span className="text-ink-3">—</span> : c.ok ? <span className="inline-flex items-center gap-1 font-semibold text-mint"><Check className="size-4" />Match</span> : <span className="inline-flex items-center gap-1 font-semibold text-danger"><X className="size-4" />Mismatch</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Synthetic specialist notes" subtitle="Input instructions for this scenario" />
            <div className="grid gap-3 px-5 pb-5 md:grid-cols-2">
              {t.notes.map((n, i) => (
                <div key={i} className="rounded-2xl border border-line bg-canvas/50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary">N{i + 1} · {n.specialty}</p>
                  <p className="font-semibold text-ink">{n.title} <span className="font-normal text-ink-3">— {n.specialist_name}</span></p>
                  <p className="mt-1 text-[13px] text-ink-2">{n.content}</p>
                </div>
              ))}
            </div>
          </Card>
          {t.result.instructions && (
            <Card>
              <CardHeader title="Extracted instructions" subtitle={`${t.result.instructions.length} instruction(s) from the latest execution`} />
              <div className="overflow-x-auto px-5 pb-5">
                <table className="w-full min-w-[640px] text-[12.5px]">
                  <thead className="text-left text-ink-3"><tr>{['Note', 'Type', 'Entity', 'Direction', 'Dose', 'Frequency', 'Timing', 'Conf.'].map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{t.result.instructions.map((i, k) => (
                    <tr key={k} className="border-t border-line"><td className="py-2 pr-3 font-mono">N{i.note_id}</td><td className="py-2 pr-3"><KindBadge kind={i.kind} /></td><td className="py-2 pr-3 font-semibold text-ink">{i.entity}</td><td className="py-2 pr-3">{DIRECTION_LABEL[i.direction]}</td><td className="py-2 pr-3">{i.dose ? `${i.dose} ${i.unit}` : <span className="text-ink-3">Not specified</span>}</td><td className="py-2 pr-3">{valueOrUnknown(i.frequency)}</td><td className="py-2 pr-3">{valueOrUnknown(i.timing)}</td><td className="num py-2">{pct(i.confidence)}{i.hedged && ' · hedged'}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          )}
          {t.result.findings && (
            <Card>
              <CardHeader title="Analysis result" subtitle={`${t.result.findings.length} finding(s)`} />
              <div className="space-y-3 px-5 pb-5">
                {t.result.findings.length === 0 && <p className="text-[13px] text-ink-3">No conflicts detected.</p>}
                {t.result.findings.map((f, i) => (
                  <div key={i} className="rounded-2xl border border-line p-4">
                    <div className="flex flex-wrap items-center gap-2"><SeverityBadge severity={f.severity} /><CategoryChip category={f.category} /><Badge className="font-mono">{f.rule_id}</Badge><span className="text-[12px] text-ink-3">conf. {pct(f.confidence)} · {f.evidence_supported ? 'evidence supported' : 'no supporting evidence'}</span></div>
                    <p className="mt-1.5 font-semibold text-ink">{f.title}</p>
                    <p className="mt-1 text-[12.5px] text-ink-2">{f.reasoning_summary}</p>
                    <p className="mt-1 text-[12px] text-ink-3">{f.severity_basis.steps.map((s) => `${s.step}: ${s.result}`).join(' → ')}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
        <aside className="space-y-5">
          <Card className="p-5">
            <p className="label-xs mb-2">Test specification</p>
            <KV k="Expected categories" v={t.expected_categories.join(', ') || 'None'} />
            <KV k="Expected outcome" v={t.expected_outcome.replace('_', ' ')} />
            <KV k="Evidence required" v={t.expected_evidence ? 'Yes' : 'No'} />
            <KV k="Severity band" v={t.expected_severity_band?.join(', ') ?? 'Not specified'} />
            <p className="mt-3 text-[12.5px] text-ink-2"><b>Documented assumption:</b> {t.assumptions}</p>
            <div className="mt-3 flex flex-wrap gap-1">{t.focus.map((f) => <Badge key={f} className="bg-canvas text-ink-2">{f}</Badge>)}</div>
          </Card>
          <Card className="p-5">
            <p className="label-xs mb-2">Execution history</p>
            {t.history.length === 0 ? <p className="text-[12.5px] text-ink-3">No executions yet.</p> : (
              <ul className="space-y-1.5">{t.history.map((h) => (
                <li key={h.id} className="flex items-center gap-2 text-[12px]"><TestBadge status={h.status} /><span className={cn('font-mono', h.config_name !== 'full' && 'text-ink-3')}>{h.config_name}</span><span className="ml-auto text-ink-3">{dateTime(h.executed_at)}</span></li>
              ))}</ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}
