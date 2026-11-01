import { BarChart3, Download, FlaskConical, Info, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import { ConfusionMatrix, LegendList, MetricGroups } from '../components/charts'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageSkeleton, Ring, Stat, Tabs, TestBadge, useToast } from '../components/ui'
import { api, download, type ApiError } from '../lib/api'
import { CATEGORY_COLORS, CORE_CATEGORIES, cn, dateTime, ms, pct } from '../lib/format'
import type { Metrics, SuiteSummary } from '../lib/types'
import { useApi } from '../lib/useApi'

type ConfigResult = Metrics & { label: string; session_status: Record<string, string> }
interface EvalResp {
  latest: { id: number; label: string; created_at: string; duration_ms: number; sessions_count: number; results: Record<string, ConfigResult> } | null
  history: { id: number; label: string; created_at: string; duration_ms: number; f1: Record<string, number | null> }[]
  current_suite: SuiteSummary
  categories: string[]
  configs: Record<string, string>
  human_validation: { reviewed: number; confirmed: number; rejected: number; uncertain: number; agreement: number | null; sufficient: boolean; min_required: number; rejection_reasons: Record<string, number>; note: string }
  evidence_coverage_live: number | null
}
const ORDER = ['single_document', 'no_kg', 'no_rag', 'full']
const SHORT: Record<string, string> = { single_document: 'Single-doc baseline', no_kg: 'No KG', no_rag: 'No RAG', full: 'Full pipeline' }

export default function Evaluation() {
  const toast = useToast()
  const { data, error, loading, reload } = useApi<EvalResp>('/evaluation')
  const [busy, setBusy] = useState(false)
  const [cfg, setCfg] = useState('full')

  async function runEval() {
    setBusy(true)
    try {
      const r = await api<{ duration_ms: number }>('/evaluation/run', { method: 'POST' })
      toast({ kind: 'success', title: 'Ablation study complete', body: `20 sessions × 4 configurations in ${ms(r.duration_ms)}` })
      reload(true)
    } catch (e) {
      toast({ kind: 'error', title: 'Evaluation failed', body: (e as ApiError).message })
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null
  const L = data.latest
  const R = L?.results[cfg]
  const hv = data.human_validation

  return (
    <div>
      <PageHeader eyebrow={<><BarChart3 className="size-3.5" /> Evaluation & metrics</>} title="Evaluation & ablation study"
        subtitle="Metrics computed from recorded test-session outcomes. Precision = TP/(TP+FP), Recall = TP/(TP+FN), F1 = 2PR/(P+R). Undefined values are shown as undefined, never as 100%."
        actions={<>{L && <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={() => download(`/evaluation/${L.id}/export`)}>Export report</Button>}<Button icon={<PlayCircle className="size-4" />} loading={busy} onClick={runEval}>Run ablation study</Button></>} />

      <div className="mb-5 flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary-50/60 px-4 py-3 text-[12.5px] text-ink-2">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" />
        <p><b>How to read these numbers.</b> The 20 scenarios are synthetic and were written alongside the demonstration rule set, so high scores show the pipeline behaves as specified — not clinical accuracy. Unit of measurement: one category-level decision per session (7 categories × 20 sessions). TS-20 is deliberately out of scope and is expected to fail.</p>
      </div>

      {!L ? (
        <Card><EmptyState icon={<FlaskConical />} title="No evaluation run yet" body="Run the ablation study to execute all 20 sessions under the four pipeline configurations." action={<Button loading={busy} onClick={runEval}>Run ablation study</Button>} /></Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader title="Baseline vs full system — ablation" subtitle={`${L.label} · ${dateTime(L.created_at)} · ${ms(L.duration_ms)}`} />
            <div className="px-3"><MetricGroups data={ORDER.map((k) => ({ name: SHORT[k], precision: L.results[k].precision, recall: L.results[k].recall, f1: L.results[k].f1 }))} /></div>
            <div className="overflow-x-auto px-5 pb-5">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead><tr className="text-left text-ink-3">{['Configuration', 'Precision', 'Recall', 'F1', 'Accuracy', 'Pass', 'Fail', 'Needs review', 'Evidence coverage'].map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{ORDER.map((k) => { const m = L.results[k]; return (
                  <tr key={k} className={cn('border-t border-line', k === 'full' && 'font-semibold')}>
                    <td className="py-2 pr-3 text-ink">{m.label}</td><td className="num py-2 pr-3">{pct(m.precision, 1)}</td><td className="num py-2 pr-3">{pct(m.recall, 1)}</td><td className="num py-2 pr-3">{pct(m.f1, 1)}</td><td className="num py-2 pr-3">{pct(m.accuracy, 1)}</td>
                    <td className="num py-2 pr-3 text-mint">{m.pass}</td><td className="num py-2 pr-3 text-danger">{m.fail}</td><td className="num py-2 pr-3 text-amber">{m.needs_review}</td><td className="num py-2">{pct(m.evidence_coverage)}</td>
                  </tr>) })}</tbody>
              </table>
              <p className="mt-2 text-[12px] text-ink-3">The single-document baseline reports “Undefined” precision when it flags nothing (TP + FP = 0). Pass/fail uses the documented test policy; categories flagged as Uncertain still count as detected for P/R/F1.</p>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={cfg} onChange={setCfg} items={ORDER.map((k) => ({ value: k, label: SHORT[k] }))} />
          </div>
          {R && (
            <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
              <Card className="p-5">
                <p className="label-xs mb-3">Confusion matrix · {R.label}</p>
                <ConfusionMatrix m={R.confusion} />
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {(['precision', 'recall', 'f1'] as const).map((k) => <div key={k} className="text-center"><Ring value={R[k]} size={64} stroke={6} color={k === 'precision' ? '#4169f5' : k === 'recall' ? '#eb6834' : '#1baf7a'} /><p className="mt-1 text-[11.5px] font-semibold capitalize text-ink-2">{k === 'f1' ? 'F1-score' : k}</p></div>)}
                </div>
                <p className="mt-3 text-[12px] text-ink-3">Session-level (any conflict expected vs reported): precision {pct(R.session_level.precision, 1)}, recall {pct(R.session_level.recall, 1)}.</p>
              </Card>
              <Card>
                <CardHeader title="Per-category metrics" subtitle="Core categories from the proposal, then extensions" />
                <div className="overflow-x-auto px-5 pb-5">
                  <table className="w-full min-w-[600px] text-[13px]">
                    <thead><tr className="text-left text-ink-3">{['Category', 'Support', 'TP', 'FP', 'FN', 'Precision', 'Recall', 'F1'].map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
                    <tbody>{data.categories.map((c) => { const m = R.per_category[c]; return (
                      <tr key={c} className="border-t border-line">
                        <td className="py-2 pr-3"><span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: CATEGORY_COLORS[c] }} />{c}{!CORE_CATEGORIES.includes(c) && <Badge className="bg-slate-100 text-ink-3">ext</Badge>}</span></td>
                        <td className="num py-2 pr-3">{m.support}</td><td className="num py-2 pr-3">{m.tp}</td><td className="num py-2 pr-3">{m.fp}</td><td className="num py-2 pr-3">{m.fn}</td>
                        <td className="num py-2 pr-3">{pct(m.precision)}</td><td className="num py-2 pr-3">{pct(m.recall)}</td>
                        <td className="py-2"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(m.f1 ?? 0) * 100}%`, background: CATEGORY_COLORS[c] }} /></div><span className="num">{pct(m.f1)}</span></div></td>
                      </tr>) })}</tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-1.5 px-5 pb-5">
                  {Object.entries(R.session_status).map(([sid, st]) => <span key={sid} className="flex items-center gap-1 text-[11px]"><span className="font-mono text-ink-3">{sid}</span><TestBadge status={st} /></span>)}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="p-5">
          <p className="label-xs mb-2">Test suite completion</p>
          <Stat label="Executed sessions" value={`${data.current_suite.executed}/${data.current_suite.total}`} sub={pct(data.current_suite.completion_rate)} />
          <p className="mt-3 text-[12px] text-ink-3">Latest full-pipeline status: {data.current_suite.pass} pass · {data.current_suite.fail} fail · {data.current_suite.needs_review} needs review.</p>
        </Card>
        <Card className="p-5">
          <p className="label-xs mb-2">Evidence retrieval coverage</p>
          <div className="flex items-center gap-4"><Ring value={data.evidence_coverage_live} size={64} stroke={6} color="#0e9fb5" /><p className="text-[12.5px] text-ink-2">Share of live case findings with ≥1 supporting passage. Test-suite coverage (full): {pct(L?.results.full.evidence_coverage)}.</p></div>
        </Card>
        <Card className="p-5">
          <p className="label-xs mb-2">Human validation agreement</p>
          {hv.sufficient ? <div className="flex items-center gap-4"><Ring value={hv.agreement} size={64} stroke={6} color="#12a873" /><p className="text-[12.5px] text-ink-2">{hv.confirmed} confirmed · {hv.rejected} rejected · {hv.uncertain} uncertain</p></div>
            : <p className="text-[13px] text-ink-2">Insufficient data: {hv.confirmed + hv.rejected} decided finding(s); at least {hv.min_required} confirmed/rejected decisions are needed before agreement is reported.</p>}
          {Object.keys(hv.rejection_reasons).length > 0 && <LegendList className="mt-3" items={Object.entries(hv.rejection_reasons).map(([k, v]) => ({ label: k, value: v, color: '#7b86a3' }))} />}
          <p className="mt-2 text-[11.5px] text-ink-3">{hv.note}</p>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Evaluation run history" />
        <div className="overflow-x-auto px-5 pb-5">
          {data.history.length === 0 ? <p className="text-[13px] text-ink-3">No runs yet.</p> : (
            <table className="w-full min-w-[620px] text-[13px]">
              <thead><tr className="text-left text-ink-3"><th className="py-2 pr-3 font-semibold">Run</th><th className="py-2 pr-3 font-semibold">When</th>{ORDER.map((k) => <th key={k} className="py-2 pr-3 font-semibold">F1 · {SHORT[k]}</th>)}<th className="py-2 font-semibold">Duration</th></tr></thead>
              <tbody>{data.history.map((h) => (
                <tr key={h.id} className="border-t border-line"><td className="py-2 pr-3 font-mono">#{h.id}</td><td className="py-2 pr-3 text-ink-3">{dateTime(h.created_at)}</td>{ORDER.map((k) => <td key={k} className="num py-2 pr-3">{pct(h.f1[k], 1)}</td>)}<td className="num py-2">{ms(h.duration_ms)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
