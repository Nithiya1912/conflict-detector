import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'motion/react'
import { Archive, FolderPlus, Search, Sparkles, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { Badge, Button, Card, DemoChip, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select, SeverityBadge, Skeleton, StatusBadge, Textarea, useToast } from '../components/ui'
import { api, type ApiError } from '../lib/api'
import { CASE_STATUS, SEVERITY_ORDER, SEVERITY_META, dateOnly } from '../lib/format'
import type { CaseSummary } from '../lib/types'
import { useApi } from '../lib/useApi'

const caseSchema = z.object({
  pseudonym: z.string().trim().min(2, 'Use a fictional pseudonym, e.g. “Patient Oak-12”').refine((v) => /^(patient|pt|case)\b/i.test(v), 'Start with “Patient …” to keep identifiers fictional'),
  age_band: z.string().optional(),
  sex: z.string().optional(),
  summary: z.string().max(2000).optional(),
})
type CaseForm = z.infer<typeof caseSchema>

export function NewCaseModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: CaseSummary) => void }) {
  const [err, setErr] = useState<string | null>(null)
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CaseForm>({ resolver: zodResolver(caseSchema), defaultValues: { pseudonym: 'Patient ' } })
  async function submit(v: CaseForm) {
    setErr(null)
    try {
      const c = await api<CaseSummary>('/cases', { body: { ...v, age_band: v.age_band || null, sex: v.sex || null, summary: v.summary ?? '' } })
      reset()
      onCreated(c)
    } catch (e) {
      setErr((e as ApiError).message)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="New synthetic case" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button form="new-case" type="submit" loading={isSubmitting}>Create case</Button></>}>
      <form id="new-case" onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber">Use fictional identifiers only. Do not enter real names, record numbers or dates of birth.</p>
        <Field label="Pseudonym" error={errors.pseudonym?.message} htmlFor="pseudonym"><Input id="pseudonym" {...register('pseudonym')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age band" htmlFor="age_band"><Select id="age_band" {...register('age_band')}><option value="">Not specified</option>{['18-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'].map((a) => <option key={a}>{a}</option>)}</Select></Field>
          <Field label="Sex" htmlFor="sex"><Select id="sex" {...register('sex')}><option value="">Not specified</option><option value="F">Female</option><option value="M">Male</option><option value="X">Other</option></Select></Field>
        </div>
        <Field label="Clinical summary" hint="Free text is de-identified before storage." error={errors.summary?.message} htmlFor="summary"><Textarea id="summary" rows={3} {...register('summary')} /></Field>
        {err && <p className="text-[13px] font-medium text-danger" role="alert">{err}</p>}
      </form>
    </Modal>
  )
}

export default function Cases() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [generating, setGenerating] = useState(false)
  const q = params.get('q') ?? ''
  const qs = useMemo(() => {
    const p = new URLSearchParams()
    ;['q', 'status', 'specialty', 'severity', 'date_from', 'date_to', 'include_archived'].forEach((k) => params.get(k) && p.set(k, params.get(k)!))
    return p.toString()
  }, [params])
  const { data, error, loading, reload } = useApi<CaseSummary[]>(`/cases?${qs}`)
  const { data: specialties } = useApi<string[]>('/specialties')

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }

  async function generate() {
    setGenerating(true)
    try {
      const c = await api<CaseSummary>('/cases/generate', { method: 'POST' })
      toast({ kind: 'success', title: `Synthetic case ${c.id} generated`, body: `${c.note_count} fictional notes added.` })
      nav(`/app/cases/${c.id}`)
    } catch (e) {
      toast({ kind: 'error', title: 'Could not generate case', body: (e as ApiError).message })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={<><Users className="size-3.5" /> Patients / Demo cases <DemoChip /></>}
        title="Synthetic case workspace"
        subtitle="Fictional patients with notes from multiple specialists. Open a case to review its instructions, conflict history and validation decisions."
        actions={<><Button variant="secondary" icon={<Sparkles className="size-4" />} loading={generating} onClick={generate}>Generate demo case</Button><Button icon={<FolderPlus className="size-4" />} onClick={() => setCreating(true)}>New case</Button></>}
      />
      <Card className="mb-5 p-3">
        <div className="grid gap-2 md:grid-cols-[1.6fr_repeat(3,1fr)] lg:grid-cols-[1.6fr_repeat(3,1fr)_auto_auto]">
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input className="pl-9" placeholder="Search by ID, pseudonym or summary" defaultValue={q} onChange={(e) => set('q', e.target.value)} aria-label="Search cases" /></div>
          <Select value={params.get('status') ?? ''} onChange={(e) => set('status', e.target.value)} aria-label="Status"><option value="">All statuses</option>{['draft', 'analyzed', 'in_review', 'reviewed', 'archived'].map((s) => <option key={s} value={s}>{CASE_STATUS[s].label}</option>)}</Select>
          <Select value={params.get('specialty') ?? ''} onChange={(e) => set('specialty', e.target.value)} aria-label="Specialty"><option value="">All specialties</option>{specialties?.map((s) => <option key={s}>{s}</option>)}</Select>
          <Select value={params.get('severity') ?? ''} onChange={(e) => set('severity', e.target.value)} aria-label="Highest severity"><option value="">Any severity</option>{SEVERITY_ORDER.map((s) => <option key={s} value={s}>{SEVERITY_META[s].short}</option>)}</Select>
          <Input type="date" value={params.get('date_from') ?? ''} onChange={(e) => set('date_from', e.target.value)} aria-label="Created from" />
          <label className="flex items-center gap-2 px-2 text-[13px] text-ink-2"><input type="checkbox" className="accent-[#4169f5]" checked={params.get('include_archived') === 'true'} onChange={(e) => set('include_archived', e.target.checked ? 'true' : '')} />Archived</label>
        </div>
      </Card>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : data && data.length === 0 ? (
        <Card><EmptyState icon={<Users />} title="No cases match" body="Adjust the filters, create a case, or generate a synthetic demo case." action={<Button onClick={() => setCreating(true)}>New case</Button>} /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.4) }}>
              <Link to={`/app/cases/${c.id}`} className="card card-hover flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11.5px] text-ink-3">{c.id}</p>
                    <p className="display text-[24px] leading-tight text-ink">{c.pseudonym}</p>
                    <p className="text-[12px] text-ink-3">{[c.age_band, c.sex].filter(Boolean).join(' · ') || 'Demographics not specified'}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-3 line-clamp-2 text-[13px] text-ink-2">{c.summary || 'No summary'}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{c.specialties.map((s) => <Badge key={s} className="bg-canvas text-ink-2">{s}</Badge>)}</div>
                <div className="mt-auto flex items-center gap-3 border-t border-line pt-3 text-[12px] text-ink-3">
                  <span><b className="num text-ink">{c.note_count}</b> notes</span>
                  <span><b className="num text-ink">{c.conflict_count}</b> findings</span>
                  {c.pending_count > 0 && <span className="text-primary-600"><b className="num">{c.pending_count}</b> pending</span>}
                  <span className="ml-auto">{c.top_severity ? <SeverityBadge severity={c.top_severity} /> : c.archived ? <Archive className="size-4" /> : dateOnly(c.created_at)}</span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
      <NewCaseModal open={creating} onClose={() => setCreating(false)} onCreated={(c) => { setCreating(false); toast({ kind: 'success', title: `Case ${c.id} created` }); nav(`/app/cases/${c.id}`) }} />
    </div>
  )
}
