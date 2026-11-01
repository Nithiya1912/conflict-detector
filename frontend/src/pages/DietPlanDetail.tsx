import { Activity, Archive, ChevronLeft, Copy, GitCompare, Pencil, Pill, Printer, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CategoryChip, ConflictCard } from '../components/conflict'
import { DietPlanForm } from '../components/DietPlanForm'
import { KindBadge } from '../components/notes'
import { Badge, Button, Card, CardHeader, DemoChip, EmptyState, ErrorState, Modal, PageHeader, PageSkeleton, Select, SeverityBadge, StatusBadge, useToast } from '../components/ui'
import { api, type ApiError } from '../lib/api'
import { DIRECTION_LABEL, dateTime } from '../lib/format'
import type { Conflict, DietPlan, Severity } from '../lib/types'
import { useApi } from '../lib/useApi'
import { Lifecycle } from './DietPlans'

type Ins = { entity: string; kind: string; direction: string; dose: string | null; unit: string | null; specialty: string; span_text: string; note_id: number }
type Detail = DietPlan & {
  case: { id: string; pseudonym: string }
  plan_text: string
  extracted: Ins[]
  medications: Ins[]
  flags: Conflict[]
  other_notes: { id: number; title: string; specialty: string }[]
  related_plans: { id: number; version: number; status: string }[]
}
type Compare = { against: string; diff: null | { only_in_a: string[]; only_in_b: string[]; shared: string[]; restrictions_a: string[]; restrictions_b: string[] }; findings: Conflict[]; note: string }

export default function DietPlanDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { data: p, error, loading, reload } = useApi<Detail>(`/diet-plans/${id}`)
  const { data: allPlans } = useApi<DietPlan[]>('/diet-plans')
  const [edit, setEdit] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [cmpOpen, setCmpOpen] = useState(false)
  const [cmpTarget, setCmpTarget] = useState('medications')
  const [cmp, setCmp] = useState<Compare | null>(null)

  if (loading && !p) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!p) return null

  async function act(kind: string, fn: () => Promise<unknown>, msg: string) {
    setBusy(kind)
    try {
      await fn()
      toast({ kind: 'success', title: msg })
      reload()
    } catch (e) {
      toast({ kind: 'error', title: 'Action failed', body: (e as ApiError).message })
    } finally {
      setBusy(null)
    }
  }

  async function runCompare() {
    setBusy('cmp')
    try {
      const q = cmpTarget.startsWith('plan:') ? `other_plan_id=${cmpTarget.slice(5)}` : `against=${cmpTarget}`
      setCmp(await api<Compare>(`/diet-plans/${p!.id}/compare?${q}`))
    } finally {
      setBusy(null)
    }
  }

  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
  return (
    <div>
      <Link to="/app/diet-plans" className="no-print mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-primary"><ChevronLeft className="size-4" />All diet plans</Link>
      <PageHeader eyebrow={<><Link to={`/app/cases/${p.case.id}`} className="font-mono hover:text-primary">{p.case.id}</Link> · {p.case.pseudonym} <DemoChip>Fictional plan</DemoChip></>}
        title={<span className="flex flex-wrap items-center gap-3">{p.title} <StatusBadge status={p.status} /></span>}
        subtitle={`${p.specialist_name} · ${p.specialty} · version ${p.version} · updated ${dateTime(p.updated_at)}`}
        actions={<div className="no-print flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEdit(true)} disabled={p.status === 'archived'}>Edit</Button>
          <Button size="sm" variant="secondary" icon={<Copy className="size-4" />} loading={busy === 'dup'} onClick={() => act('dup', async () => { const n = await api<DietPlan>(`/diet-plans/${p.id}/duplicate`, { method: 'POST' }); nav(`/app/diet-plans/${n.id}`) }, 'Plan duplicated')}>Duplicate</Button>
          <Button size="sm" variant="secondary" icon={<GitCompare className="size-4" />} onClick={() => setCmpOpen(true)}>Compare</Button>
          <Button size="sm" variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
          {p.status === 'archived'
            ? <Button size="sm" variant="ghost" onClick={() => act('arch', () => api(`/diet-plans/${p.id}`, { method: 'PATCH', body: { status: 'draft' } }), 'Plan restored to draft')}>Restore</Button>
            : <Button size="sm" variant="ghost" icon={<Archive className="size-4" />} onClick={() => act('arch', () => api(`/diet-plans/${p.id}`, { method: 'PATCH', body: { status: 'archived' } }), 'Plan archived')}>Archive</Button>}
          <Button size="sm" icon={<Activity className="size-4" />} loading={busy === 'an'} disabled={p.status === 'archived'} onClick={() => act('an', async () => { await api(`/diet-plans/${p.id}/analyze`, { method: 'POST' }); nav(`/app/analysis?case=${p.case_id}`) }, 'Analysis started')}>Analyse compatibility</Button>
        </div>} />
      <div className="mb-5"><Lifecycle status={p.status} /></div>
      <p className="mb-5 flex items-start gap-2 rounded-2xl border border-amber/30 bg-amber-50 px-4 py-3 text-[12.5px] text-amber"><ShieldAlert className="mt-0.5 size-4 shrink-0" />This sample plan is fictional and is not medically approved. Compatibility flags are candidate findings for qualified clinician review; CICD AI does not prescribe diets or change medications.</p>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Meal schedule" subtitle="Food items and portions as supplied by the specialist" />
            <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              {SLOTS.map((s) => (
                <div key={s} className="rounded-2xl border border-line bg-canvas/40 p-4 print-break">
                  <p className="label-xs mb-2">{s}</p>
                  {(p.meals[s] ?? []).length === 0 ? <p className="text-[12.5px] text-ink-3">No items</p> : (
                    <ul className="space-y-1">{p.meals[s].map((m, i) => <li key={i} className="flex justify-between gap-2 text-[13.5px]"><span className="font-semibold text-ink">{m.item}</span><span className="text-ink-3">{m.portion ?? 'portion not specified'}</span></li>)}</ul>
                  )}
                </div>
              ))}
            </div>
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5"><p className="label-xs mb-2">Dietary restrictions</p>{p.restrictions.length ? <ul className="space-y-1 text-[13.5px] text-ink">{p.restrictions.map((r) => <li key={r}>• {r}</li>)}</ul> : <p className="text-[13px] text-ink-3">None</p>}</Card>
            <Card className="p-5"><p className="label-xs mb-2">Nutrition notes</p><p className="text-[13.5px] text-ink-2">{p.nutrition_notes || '—'}</p><p className="label-xs mb-1 mt-4">Lifestyle recommendations</p><p className="text-[13.5px] text-ink-2">{p.lifestyle_notes || '—'}</p></Card>
          </div>
          <Card>
            <CardHeader title="Conflict flags" subtitle="Findings from the latest case analysis that involve this plan" />
            <div className="space-y-3 px-5 pb-5">
              {p.flags.length === 0 ? <EmptyState icon={<Activity />} title={p.status === 'draft' ? 'Not analysed yet' : 'No flags'} body="Run a compatibility analysis to check this plan against the case’s medications and other notes." /> : p.flags.map((c) => <ConflictCard key={c.id} c={c} />)}
            </div>
          </Card>
        </div>
        <aside className="space-y-5">
          <Card className="p-5">
            <p className="label-xs mb-2">Extracted from this plan</p>
            <ul className="space-y-1.5">{p.extracted.map((i, k) => <li key={k} className="flex items-center gap-2 text-[12.5px]"><KindBadge kind={i.kind} /><b className="text-ink">{i.entity}</b><span className="text-ink-3">{DIRECTION_LABEL[i.direction]}</span></li>)}</ul>
            {p.extracted.length === 0 && <p className="text-[12.5px] text-ink-3">No recognised entities.</p>}
          </Card>
          <Card className="p-5">
            <p className="label-xs mb-2 flex items-center gap-1.5"><Pill className="size-3.5" />Related medication instructions</p>
            {p.medications.length === 0 ? <p className="text-[12.5px] text-ink-3">No medications in this case.</p> : (
              <ul className="space-y-2">{p.medications.map((m, k) => <li key={k} className="rounded-xl border border-line p-2.5 text-[12.5px]"><p className="font-semibold text-ink">{m.entity} {m.dose && <span className="font-normal text-ink-3">{m.dose} {m.unit}</span>}</p><p className="text-ink-3">{m.specialty}: “{m.span_text}”</p></li>)}</ul>
            )}
          </Card>
          <Card className="p-5">
            <p className="label-xs mb-2">Evidence references</p>
            {p.flags.flatMap((f) => f.evidence.filter((e) => e.supporting)).length === 0 ? <p className="text-[12.5px] text-ink-3">None yet.</p> :
              <ul className="space-y-1.5 text-[12.5px]">{[...new Map(p.flags.flatMap((f) => f.evidence.filter((e) => e.supporting)).map((e) => [e.document_id, e])).values()].map((e) => <li key={e.document_id}><Link to={`/app/guidelines?doc=${e.document_id}`} className="text-primary-600 hover:underline">{e.title}</Link>{e.is_synthetic && <Badge className="ml-1 bg-amber-50 text-amber">synthetic</Badge>}</li>)}</ul>}
          </Card>
          <Card className="p-5">
            <p className="label-xs mb-2">Review status</p>
            <p className="text-[13px] text-ink-2">{p.flags.filter((f) => f.validation_status === 'pending').length} pending · {p.flags.filter((f) => f.validation_status === 'confirmed').length} confirmed · {p.flags.filter((f) => f.validation_status === 'rejected').length} rejected</p>
            {p.flags.some((f) => f.validation_status === 'pending') && <Link to="/app/validation" className="mt-2 inline-block text-[13px] font-semibold text-primary-600 hover:underline">Open validation queue →</Link>}
          </Card>
        </aside>
      </div>

      <DietPlanForm open={edit} onClose={() => setEdit(false)} plan={p} onSaved={() => { setEdit(false); toast({ kind: 'success', title: 'New version saved', body: 'Plan returned to draft; re-run analysis to refresh flags.' }); reload() }} />
      <Modal open={cmpOpen} onClose={() => setCmpOpen(false)} wide title="Compare plan" footer={<Button loading={busy === 'cmp'} onClick={runCompare} icon={<GitCompare className="size-4" />}>Run comparison</Button>}>
        <Select value={cmpTarget} onChange={(e) => { setCmpTarget(e.target.value); setCmp(null) }} aria-label="Compare against">
          <option value="medications">Against medication instructions in this case</option>
          <option value="notes">Against all other specialist notes in this case</option>
          {allPlans?.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={`plan:${x.id}`}>Against plan #{x.id}: {x.title} v{x.version} ({x.case_id})</option>)}
        </Select>
        {cmp && (
          <div className="mt-4 space-y-4">
            <p className="text-[12.5px] text-ink-3">{cmp.note}</p>
            {cmp.diff && (
              <div className="grid gap-3 sm:grid-cols-3 text-[12.5px]">
                <div className="rounded-xl bg-canvas p-3"><p className="label-xs mb-1">Only in this plan</p>{cmp.diff.only_in_a.join(', ') || '—'}</div>
                <div className="rounded-xl bg-canvas p-3"><p className="label-xs mb-1">Shared items</p>{cmp.diff.shared.join(', ') || '—'}</div>
                <div className="rounded-xl bg-canvas p-3"><p className="label-xs mb-1">Only in other plan</p>{cmp.diff.only_in_b.join(', ') || '—'}</div>
              </div>
            )}
            <p className="font-semibold text-ink">{cmp.findings.length} potential incompatibilit{cmp.findings.length === 1 ? 'y' : 'ies'} vs {cmp.against}</p>
            {cmp.findings.map((f, i) => (
              <div key={i} className="rounded-2xl border border-line p-3">
                <div className="flex flex-wrap gap-2"><SeverityBadge severity={f.severity as Severity} /><CategoryChip category={f.category} extension={f.is_extension} /></div>
                <p className="mt-1 font-semibold text-ink">{f.title}</p>
                <p className="mt-1 text-[12.5px] text-ink-2">{f.reasoning_summary}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
