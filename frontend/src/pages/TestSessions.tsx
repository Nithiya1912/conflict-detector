import { motion } from 'motion/react'
import { Download, FlaskConical, Play, PlayCircle, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CategoryChip } from '../components/conflict'
import { Badge, Button, Card, DemoChip, ErrorState, PageHeader, PageSkeleton, Ring, Select, Stat, TestBadge, useToast } from '../components/ui'
import { api, download, type ApiError } from '../lib/api'
import { CATEGORIES, cn, ms, pct, relTime } from '../lib/format'
import type { SuiteSummary, TestSessionSummary } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function TestSessions() {
  const toast = useToast()
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const qs = new URLSearchParams({ ...(category && { category }), ...(status && { status }) }).toString()
  const { data, error, loading, reload } = useApi<{ sessions: TestSessionSummary[]; summary: SuiteSummary; policy: string }>(`/test-sessions?${qs}`)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState<string | null>(null)
  const [showPolicy, setShowPolicy] = useState(false)

  async function run(body: { session_ids?: string[]; only_failed?: boolean }, label: string) {
    setRunning(label)
    try {
      const r = await api<{ ran: string[]; summary: SuiteSummary }>('/test-sessions/run', { body })
      toast({ kind: 'success', title: `Executed ${r.ran.length} session(s)`, body: `${r.summary.pass} pass · ${r.summary.fail} fail · ${r.summary.needs_review} needs review` })
      setSel(new Set())
      reload(true)
    } catch (e) {
      toast({ kind: 'error', title: 'Run failed', body: (e as ApiError).message })
    } finally {
      setRunning(null)
    }
  }

  if (loading && !data) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null
  const s = data.summary
  const toggle = (id: string) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div>
      <PageHeader eyebrow={<><FlaskConical className="size-3.5" /> Test sessions <DemoChip>20 synthetic scenarios</DemoChip></>} title="Synthetic test suite"
        subtitle="Twenty individually stored scenarios (proposal: 15–20 synthetic case pairs). Each run executes the real detection pipeline; pass/fail is computed from the recorded outcome under a deterministic policy."
        actions={<>
          <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={() => download('/test-sessions/export?fmt=csv')}>CSV</Button>
          <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={() => download('/test-sessions/export?fmt=json')}>JSON</Button>
          <Button variant="secondary" size="sm" icon={<RotateCcw className="size-4" />} loading={running === 'failed'} disabled={!s.fail && !s.needs_review} onClick={() => run({ only_failed: true }, 'failed')}>Re-run failed</Button>
          <Button variant="secondary" size="sm" icon={<Play className="size-4" />} loading={running === 'sel'} disabled={!sel.size} onClick={() => run({ session_ids: [...sel] }, 'sel')}>Run selected ({sel.size})</Button>
          <Button size="sm" icon={<PlayCircle className="size-4" />} loading={running === 'all'} onClick={() => run({}, 'all')}>Run all 20</Button>
        </>} />

      <Card className="mb-5 grid items-center gap-5 p-5 md:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-4">
          <Ring value={s.completion_rate} size={84} stroke={8} color="#4169f5" label="Suite completion"><span className="num text-[13px] font-bold">{s.executed}/{s.total}</span></Ring>
          <div><p className="font-semibold text-ink">Suite completion</p><p className="text-[12px] text-ink-3">{s.not_run ? `${s.not_run} not yet executed` : 'All sessions executed'}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Pass" value={<span className="text-mint">{s.pass}</span>} />
          <Stat label="Fail" value={<span className="text-danger">{s.fail}</span>} />
          <Stat label="Needs review" value={<span className="text-amber">{s.needs_review}</span>} />
          <Stat label="F1 (category-level)" value={s.metrics ? pct(s.metrics.f1, 1) : '—'} sub={s.metrics ? `P ${pct(s.metrics.precision, 0)} · R ${pct(s.metrics.recall, 0)}` : 'Run the suite'} />
          <Stat label="Total run time" value={ms(s.total_duration_ms)} />
        </div>
        <div className="md:col-span-2">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${s.pass} pass, ${s.fail} fail, ${s.needs_review} needs review, ${s.not_run} not run`}>
            {[['pass', s.pass, '#12a873'], ['needs', s.needs_review, '#fab219'], ['fail', s.fail, '#d03b3b']].map(([k, n, c]) => <motion.div key={k as string} initial={{ width: 0 }} animate={{ width: `${((n as number) / s.total) * 100}%` }} transition={{ duration: 0.8 }} style={{ background: c as string }} className="h-full border-r-2 border-white last:border-0" />)}
          </div>
          <button className="mt-2 text-[12px] font-semibold text-primary-600 hover:underline" onClick={() => setShowPolicy((x) => !x)}>{showPolicy ? 'Hide' : 'Show'} deterministic test policy</button>
          {showPolicy && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-navy p-4 font-mono text-[11.5px] leading-relaxed text-white/85">{data.policy.trim()}</pre>}
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="w-60" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"><option value="">All categories & focus areas</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}{['No conflict', 'Ambiguous', 'Missing evidence', 'Duplicate instructions', 'Multiple specialists', 'False-positive prevention', 'Human-review escalation', 'Timing conflict', 'Known limitation'].map((f) => <option key={f}>{f}</option>)}</Select>
        <Select className="w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="needs_review">Needs review</option><option value="not_run">Not run</option></Select>
        <Button variant="ghost" size="sm" onClick={() => setSel(new Set(data.sessions.map((x) => x.id)))}>Select all shown</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {data.sessions.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.025, 0.4) }}
            className={cn('card flex gap-3 p-4', sel.has(t.id) && 'ring-2 ring-primary/40')}>
            <input type="checkbox" className="mt-1 size-4 accent-[#4169f5]" checked={sel.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Select ${t.id}`} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-bold text-primary-600">{t.id}</span><TestBadge status={t.status} />{t.executed_at && <span className="text-[11px] text-ink-3">{relTime(t.executed_at)} · {ms(t.duration_ms)}</span>}</div>
              <Link to={`/app/tests/${t.id}`} className="mt-1 block font-semibold leading-snug text-ink hover:text-primary-600">{t.title}</Link>
              <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-3">{t.description}</p>
              <div className="mt-2 grid gap-1 text-[11.5px] text-ink-2 sm:grid-cols-2">
                <div><span className="text-ink-3">Expected:</span> {t.expected_categories.length ? t.expected_categories.join(', ') : 'no conflict'} · {t.expected_outcome.replace('_', ' ')}</div>
                <div><span className="text-ink-3">Actual:</span> {t.status === 'not_run' ? '—' : `${t.actual_categories.length ? t.actual_categories.join(', ') : 'no conflict'} · ${t.actual_outcome?.replace('_', ' ')}`}</div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">{t.expected_categories.map((c) => <CategoryChip key={c} category={c} />)}{t.focus.filter((f) => !CATEGORIES.includes(f as never)).slice(0, 3).map((f) => <Badge key={f} className="bg-canvas text-ink-3">{f}</Badge>)}</div>
            </div>
            <Button size="sm" variant="soft" className="self-start" loading={running === t.id} onClick={() => run({ session_ids: [t.id] }, t.id)} aria-label={`Run ${t.id}`} icon={<Play className="size-3.5" />}>Run</Button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
