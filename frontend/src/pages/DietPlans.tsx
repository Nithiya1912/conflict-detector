import { motion } from 'motion/react'
import { Apple, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { DietPlanForm } from '../components/DietPlanForm'
import { Badge, Button, Card, DemoChip, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, Tabs, useToast } from '../components/ui'
import { cn, dateOnly } from '../lib/format'
import type { CaseSummary, DietPlan } from '../lib/types'
import { useApi } from '../lib/useApi'

const LIFECYCLE = ['draft', 'analyzed', 'awaiting_review', 'reviewed', 'archived']

export function Lifecycle({ status }: { status: string }) {
  const idx = LIFECYCLE.indexOf(status)
  return (
    <ol className="flex items-center gap-1" aria-label={`Plan lifecycle: ${status}`}>
      {LIFECYCLE.map((s, i) => (
        <li key={s} className="flex items-center gap-1">
          <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold capitalize', i < idx ? 'bg-mint-50 text-mint' : i === idx ? 'bg-navy text-white' : 'bg-slate-100 text-ink-3')}>{s.replace('_', ' ')}</span>
          {i < LIFECYCLE.length - 1 && <ChevronRight className="size-3 text-ink-3" />}
        </li>
      ))}
    </ol>
  )
}

export default function DietPlans() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const [status, setStatus] = useState('all')
  const { data, error, loading, reload } = useApi<DietPlan[]>('/diet-plans')
  const { data: cases } = useApi<CaseSummary[]>('/cases')
  const newFor = params.get('new')
  const [open, setOpen] = useState(!!newFor)
  const shown = (data ?? []).filter((p) => status === 'all' || p.status === status)

  return (
    <div>
      <PageHeader eyebrow={<><Apple className="size-3.5" /> Diet plans <DemoChip>Fictional sample plans</DemoChip></>} title="Diet plans & compatibility"
        subtitle="Specialist-authored diet plans checked against medication instructions and other specialists’ notes. CICD AI flags incompatibilities; it never writes or approves a diet."
        actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New plan</Button>} />
      <div className="mb-4"><Tabs value={status} onChange={setStatus} items={['all', ...LIFECYCLE].map((s) => ({ value: s, label: s === 'all' ? 'All' : s.replace('_', ' ').replace(/^\w/, (m) => m.toUpperCase()), count: s === 'all' ? data?.length : data?.filter((p) => p.status === s).length }))} /></div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}</div> : shown.length === 0 ? (
        <Card><EmptyState icon={<Apple />} title="No diet plans" body="Create a plan for a case to check it against medication and other specialist instructions." action={<Button onClick={() => setOpen(true)}>New plan</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/app/diet-plans/${p.id}`} className="card card-hover block p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] text-ink-3"><span className="font-mono">{p.case_id}</span> · {p.case_pseudonym}</p>
                    <p className="display text-[26px] leading-tight text-ink">{p.title}</p>
                    <p className="text-[12.5px] text-ink-3">{p.specialist_name} · version {p.version} · updated {dateOnly(p.updated_at)}</p>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {(['breakfast', 'lunch', 'dinner', 'snacks'] as const).map((s) => (
                    <div key={s} className="rounded-xl bg-canvas px-2 py-2"><p className="num text-lg font-bold text-ink">{p.meals[s]?.length ?? 0}</p><p className="text-[10.5px] font-semibold capitalize text-ink-3">{s}</p></div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {p.restrictions.slice(0, 3).map((r) => <Badge key={r} className="bg-primary-50 text-primary-600">{r}</Badge>)}
                  <span className={cn('ml-auto text-[12.5px] font-semibold', p.flag_count ? 'text-coral' : 'text-mint')}>{p.flag_count ? `${p.flag_count} conflict flag(s)` : 'No flags yet'}</span>
                </div>
                <div className="mt-3"><Lifecycle status={p.status} /></div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
      <DietPlanForm open={open} onClose={() => { setOpen(false); if (newFor) setParams({}) }} cases={cases} defaultCase={newFor ?? undefined}
        onSaved={(p) => { setOpen(false); toast({ kind: 'success', title: 'Diet plan created', body: 'Draft saved and linked to the case as a nutrition note.' }); nav(`/app/diet-plans/${p.id}`) }} />
    </div>
  )
}
