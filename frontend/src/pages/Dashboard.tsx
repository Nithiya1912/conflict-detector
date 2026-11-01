import { motion } from 'motion/react'
import { Activity, AlertTriangle, ArrowUpRight, BookOpenCheck, ClipboardCheck, FileBarChart, FolderHeart, Gauge, Network, Sparkles, Timer } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CategoryBars, LegendList, SeverityBars, TrendArea } from '../components/charts'
import { GraphView, NODE_TYPES_META, type GEdge, type GNode } from '../components/GraphView'
import { Button, Card, CardHeader, CountUp, DemoChip, Disclaimer, EmptyState, ErrorState, PageSkeleton, Ring, SeverityBadge, useToast } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { SEVERITY_META, cn, dateTime, ms, pct, relTime } from '../lib/format'
import type { CaseSummary, Conflict, Run, Severity } from '../lib/types'
import { useApi } from '../lib/useApi'

interface Dash {
  data_label: string
  cards: {
    total_cases: number; demo_cases: number; cases_analyzed: number; conflicts: number; high_priority_open: number
    pending_validations: number; avg_analysis_ms: number | null; evidence_coverage: number | null
    latest_evaluation: { id: number; created_at: string; precision: number | null; recall: number | null; f1: number | null; pass_rate: number | null } | null
  }
  category_distribution: { category: string; count: number; core: boolean }[]
  severity_distribution: { severity: Severity; label: string; count: number }[]
  validation_distribution: Record<string, number>
  trend: { date: string; analyses: number; findings: number; cases_created: number }[]
  recent_runs: Run[]
  queue_preview: Conflict[]
  recent_audit: { id: number; actor_email: string; action: string; entity_type: string; entity_id: string; detail: string; created_at: string }[]
  graph_preview: { nodes: GNode[]; edges: GEdge[]; counts: Record<string, number> }
}

function Kpi({ label, icon, children, sub, to, accent, delay = 0 }: { label: string; icon: ReactNode; children: ReactNode; sub?: ReactNode; to: string; accent?: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <Link to={to} className="card card-hover group block h-full p-5">
        <div className="flex items-start justify-between">
          <span className={cn('grid size-10 place-items-center rounded-xl', accent ?? 'bg-primary-50 text-primary')}>{icon}</span>
          <ArrowUpRight className="size-4 text-ink-3 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
        </div>
        <p className="mt-4 text-[13px] font-semibold text-ink-2">{label}</p>
        <div className="display mt-0.5 text-[40px] leading-none text-ink">{children}</div>
        {sub && <p className="mt-2 text-[12px] text-ink-3">{sub}</p>}
      </Link>
    </motion.div>
  )
}

export default function Dashboard() {
  const { data, error, loading, reload } = useApi<Dash>('/dashboard')
  const { user } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  if (loading && !data) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null
  const c = data.cards

  async function newDemoCase() {
    setBusy('gen')
    try {
      const cs = await api<CaseSummary>('/cases/generate', { method: 'POST' })
      toast({ kind: 'success', title: `${cs.id} created`, body: `${cs.pseudonym} · ${cs.note_count} synthetic notes` })
      nav(`/app/analysis?case=${cs.id}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="hero-sky relative overflow-hidden rounded-[28px] px-6 py-7 sm:px-8 sm:py-9">
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <DemoChip>{data.data_label}</DemoChip>
            </div>
            <h1 className="display mt-3 text-[38px] leading-[1.02] text-white sm:text-[48px]">Health Intelligence Overview</h1>
            <p className="mt-2 max-w-xl text-[14px] text-white/90">Good to see you, {user?.full_name.split(' ').slice(-1)[0]}. {c.pending_validations > 0 ? `${c.pending_validations} finding${c.pending_validations === 1 ? '' : 's'} await clinician validation${c.high_priority_open ? `, ${c.high_priority_open} high-priority` : ''}.` : 'The validation queue is clear.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/app/analysis"><Button variant="dark" icon={<Activity className="size-4" />}>New case analysis</Button></Link>
            <Button variant="secondary" className="bg-white/90" loading={busy === 'gen'} onClick={newDemoCase} icon={<Sparkles className="size-4" />}>Generate demo case</Button>
            <Link to="/app/reports"><Button variant="secondary" className="bg-white/90" icon={<FileBarChart className="size-4" />}>Generate report</Button></Link>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi delay={0} label="Synthetic cases" icon={<FolderHeart className="size-5" />} to="/app/cases" sub={`${c.cases_analyzed} analysed · all ${c.demo_cases} flagged as demo`}><CountUp value={c.total_cases} /></Kpi>
        <Kpi delay={0.05} label="Potential conflicts identified" icon={<Sparkles className="size-5" />} to="/app/validation?all=1" sub="Candidate findings across active cases"><CountUp value={c.conflicts} /></Kpi>
        <Kpi delay={0.1} label="High-priority awaiting review" icon={<AlertTriangle className="size-5" />} accent="bg-danger-50 text-danger" to="/app/validation" sub={`${c.pending_validations} pending validations in total`}><CountUp value={c.high_priority_open} /></Kpi>
        <Kpi delay={0.15} label="Pending clinician validations" icon={<ClipboardCheck className="size-5" />} accent="bg-lavender/15 text-[#5b47c9]" to="/app/validation" sub="Includes clarification requests"><CountUp value={c.pending_validations} /></Kpi>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <Ring value={c.evidence_coverage} size={78} stroke={7} color="#0e9fb5" label="Evidence coverage" />
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2"><BookOpenCheck className="size-4 text-[#0e9fb5]" />Evidence coverage</p>
              <p className="text-[12px] text-ink-3">Share of findings with at least one supporting retrieved passage.</p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <div className="grid size-[78px] place-items-center rounded-full bg-primary-50 text-primary"><Timer className="size-7" /></div>
            <div>
              <p className="text-[13px] font-semibold text-ink-2">Average analysis time</p>
              <p className="display text-[34px] leading-none text-ink">{ms(c.avg_analysis_ms)}</p>
              <p className="text-[12px] text-ink-3">Measured end-to-end per completed run</p>
            </div>
          </div>
        </Card>
        <Link to="/app/evaluation" className="card card-hover block p-5">
          <div className="flex items-center gap-4">
            <Ring value={c.latest_evaluation?.f1 ?? null} size={78} stroke={7} color="#4169f5" label="Latest F1"><span className="num text-[13px] font-bold">{c.latest_evaluation ? pct(c.latest_evaluation.f1) : '—'}</span></Ring>
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2"><Gauge className="size-4 text-primary" />Latest evaluation (full pipeline)</p>
              {c.latest_evaluation ? (
                <p className="text-[12px] text-ink-3">F1 {pct(c.latest_evaluation.f1, 1)} · precision {pct(c.latest_evaluation.precision, 1)} · recall {pct(c.latest_evaluation.recall, 1)} · {relTime(c.latest_evaluation.created_at)}</p>
              ) : <p className="text-[12px] text-ink-3">No evaluation run yet — run the ablation study on the Evaluation page.</p>}
            </div>
          </div>
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader title="Conflict categories" subtitle="Click a bar to open matching findings · ext = extension category" />
          <div className="px-3 pb-4">
            {c.conflicts ? <CategoryBars data={data.category_distribution} onSelect={(cat) => nav(`/app/validation?all=1&category=${encodeURIComponent(cat)}`)} /> : <EmptyState icon={<Sparkles />} title="No findings yet" body="Run an analysis to populate this chart." />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Severity distribution" subtitle="Policy-computed severity, separate from confidence" />
          <div className="px-3">
            <SeverityBars data={data.severity_distribution} onSelect={(s) => nav(`/app/validation?all=1&severity=${s}`)} />
          </div>
          <LegendList className="px-5 pb-5" items={data.severity_distribution.map((s) => ({ label: SEVERITY_META[s.severity].short, color: SEVERITY_META[s.severity].color, value: s.count, hatch: s.severity === 'uncertain' }))} />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardHeader title="Case analysis trend" subtitle="Findings produced per day by completed analysis runs (last 30 days)" />
          <div className="px-3 pb-4"><TrendArea data={data.trend} /></div>
        </Card>
        <Card className="flex flex-col">
          <CardHeader title="Validation queue" subtitle="Highest priority first" action={<Link to="/app/validation" className="text-[13px] font-semibold text-primary-600 hover:underline">Open queue</Link>} />
          <ul className="flex-1 space-y-2 px-5 pb-5">
            {data.queue_preview.length === 0 && <EmptyState icon={<ClipboardCheck />} title="All clear" body="No findings awaiting review." />}
            {data.queue_preview.map((q, i) => (
              <motion.li key={q.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                <Link to={`/app/validation?focus=${q.id}`} className="flex items-center gap-3 rounded-2xl border border-line p-3 transition hover:border-primary/30 hover:bg-primary-50/40">
                  <SeverityBadge severity={q.severity} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">{q.title}</p>
                    <p className="truncate text-[11.5px] text-ink-3"><span className="font-mono">{q.case_id}</span> · {q.category}</p>
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Recent analyses" subtitle="Live analysis runs recorded in the database" action={<Link to="/app/analysis" className="text-[13px] font-semibold text-primary-600 hover:underline">Analysis workspace</Link>} />
          <div className="overflow-x-auto px-2 pb-3">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead><tr className="text-left text-ink-3">{['Case', 'Configuration', 'Status', 'Findings', 'Duration', 'Started'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {data.recent_runs.map((r) => (
                  <tr key={r.id} onClick={() => nav(`/app/cases/${r.case_id}`)} className="cursor-pointer border-t border-line transition hover:bg-primary-50/40">
                    <td className="px-3 py-2.5"><span className="font-semibold text-ink">{r.pseudonym}</span> <span className="font-mono text-[11.5px] text-ink-3">{r.case_id}</span></td>
                    <td className="px-3 py-2.5 text-ink-2">{r.config.label}</td>
                    <td className="px-3 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-[11.5px] font-semibold capitalize', r.status === 'completed' ? 'bg-mint-50 text-mint' : r.status === 'failed' ? 'bg-danger-50 text-danger' : 'bg-primary-50 text-primary-600')}>{r.status}</span></td>
                    <td className="num px-3 py-2.5 font-semibold">{r.conflicts_found}</td>
                    <td className="num px-3 py-2.5 text-ink-2">{ms(r.duration_ms)}</td>
                    <td className="px-3 py-2.5 text-ink-3">{dateTime(r.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.recent_runs.length === 0 && <EmptyState icon={<Activity />} title="No analyses yet" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Knowledge Graph" subtitle={`${data.graph_preview.nodes.length} nodes · ${data.graph_preview.edges.length} relationships from stored entities`} action={<Link to="/app/graph"><Button size="sm" variant="soft" icon={<Network className="size-4" />}>Explore</Button></Link>} />
          <div className="mx-5 overflow-hidden rounded-2xl border border-line bg-[#f8faff]">
            <GraphView nodes={data.graph_preview.nodes} edges={data.graph_preview.edges} compact height={230} />
          </div>
          <div className="flex flex-wrap gap-1.5 p-5">
            {Object.entries(data.graph_preview.counts).map(([t, n]) => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[11.5px] text-ink-2"><span className="size-2 rounded-full" style={{ background: NODE_TYPES_META[t]?.color }} />{NODE_TYPES_META[t]?.label ?? t} <b className="num text-ink">{n}</b></span>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Latest audit activity" action={<Link to="/app/audit" className="text-[13px] font-semibold text-primary-600 hover:underline">All logs</Link>} />
        <ul className="grid gap-x-6 px-5 pb-5 md:grid-cols-2">
          {data.recent_audit.map((a) => (
            <li key={a.id} className="flex items-center gap-3 border-b border-line py-2.5 text-[12.5px] last:border-0">
              <span className="size-2 shrink-0 rounded-full bg-primary" />
              <span className="font-mono text-[11.5px] text-primary-600">{a.action}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{a.actor_email} · {a.entity_type} {a.entity_id}</span>
              <span className="shrink-0 text-ink-3">{relTime(a.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Disclaimer />
    </div>
  )
}
