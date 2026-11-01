import { AnimatePresence, motion } from 'motion/react'
import { Activity, Ban, BookOpen, Brain, Check, CircleDashed, ClipboardCheck, FileBarChart, FilePlus2, FileText, FolderPlus, GitCompare, Loader2, Network, RefreshCw, RotateCcw, ScanText, Sparkles, TriangleAlert, Wand2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ConflictCard } from '../components/conflict'
import { InstructionTable, NoteEditor } from '../components/notes'
import { Badge, Button, Card, DemoChip, EmptyState, PageHeader, Select, SeverityBadge, Skeleton, useToast } from '../components/ui'
import { api, type ApiError } from '../lib/api'
import { SEVERITY_ORDER, cn, ms } from '../lib/format'
import type { CaseDetail, CaseSummary, Instruction, Run, Stage } from '../lib/types'
import { useApi } from '../lib/useApi'
import { NewCaseModal } from './Cases'

const STAGE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  read: FileText, extract: ScanText, normalize: Wand2, map: Network, retrieve: BookOpen, compare: GitCompare, explain: Brain, review: ClipboardCheck,
}

const CONFIGS = [
  { v: 'full', label: 'Full configured pipeline', d: 'Cross-document · KG · RAG' },
  { v: 'no_rag', label: 'Without RAG', d: 'Evidence retrieval disabled' },
  { v: 'no_kg', label: 'Without Knowledge Graph', d: 'Literal terms only' },
  { v: 'single_document', label: 'Single-document baseline', d: 'Within-note comparison only' },
]

function Orb({ active }: { active: boolean }) {
  return (
    <div className="relative grid size-28 place-items-center" aria-hidden>
      <motion.div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30" animate={active ? { rotate: 360 } : {}} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }} />
      <motion.div className="absolute inset-3 rounded-full border border-lavender/60" animate={active ? { rotate: -360 } : {}} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} />
      <motion.div className="size-14 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#a8d8ff_40%,#4169f5)] shadow-[0_0_40px_rgba(65,105,245,.55)]" animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }} transition={{ duration: 1.6, repeat: Infinity }} />
    </div>
  )
}

function Timeline({ run, elapsed }: { run: Run; elapsed: number }) {
  const done = run.stages.filter((s) => s.status === 'done').length
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Orb active={run.status === 'running' || run.status === 'queued'} />
        <div className="min-w-0 flex-1">
          <p className="label-xs">Run #{run.id} · {run.config.label}</p>
          <p className="display text-[28px] leading-tight text-ink">
            {run.status === 'completed' ? 'Analysis complete' : run.status === 'failed' ? 'Analysis failed' : run.status === 'cancelled' ? 'Analysis cancelled' : run.stages[run.stage_index]?.label ?? 'Queued'}
          </p>
          <p className="num text-[13px] text-ink-3">Elapsed {ms(run.duration_ms ?? elapsed)} · {done}/{run.stages.length} stages · progress reported by the backend worker</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><motion.div className="h-full rounded-full bg-gradient-to-r from-primary via-sky to-lavender" animate={{ width: `${(done / run.stages.length) * 100}%` }} transition={{ duration: 0.4 }} /></div>
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {run.stages.map((s: Stage, i) => {
          const Icon = STAGE_ICONS[s.key] ?? CircleDashed
          return (
            <motion.li key={s.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className={cn('flex items-start gap-3 rounded-2xl border p-3 transition-colors', s.status === 'running' ? 'border-primary/40 bg-primary-50/70' : s.status === 'done' ? 'border-line bg-white' : s.status === 'failed' ? 'border-danger/30 bg-danger-50/60' : 'border-line/70 bg-white/50')}>
              <span className={cn('grid size-8 shrink-0 place-items-center rounded-xl', s.status === 'done' ? 'bg-mint text-white' : s.status === 'running' ? 'bg-primary text-white' : s.status === 'failed' ? 'bg-danger text-white' : 'bg-slate-100 text-ink-3')}>
                {s.status === 'done' ? <Check className="size-4" /> : s.status === 'running' ? <Loader2 className="size-4 animate-spin" /> : s.status === 'failed' ? <X className="size-4" /> : s.status === 'cancelled' ? <Ban className="size-4" /> : <Icon className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink"><span className="mr-1 text-ink-3">{i + 1}.</span>{s.label}</p>
                <p className="text-[12px] text-ink-3">{s.detail ?? (s.status === 'pending' ? 'Waiting' : '')}</p>
              </div>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}

export default function Analysis() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const caseId = params.get('case') ?? ''
  const { data: cases, reload: reloadCases } = useApi<CaseSummary[]>('/cases')
  const { data: c, reload, setData } = useApi<CaseDetail>(caseId ? `/cases/${caseId}` : null, [caseId])
  const { data: settings } = useApi<{ llm: { configured: boolean; model: string | null; note: string } }>('/settings')
  const [config, setConfig] = useState('full')
  const [useLlm, setUseLlm] = useState(true)
  const [run, setRun] = useState<Run | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [newCase, setNewCase] = useState(false)
  const timer = useRef<number | null>(null)

  const poll = useCallback(async (id: number) => {
    const t0 = Date.now()
    const tick = async () => {
      try {
        const r = await api<Run>(`/runs/${id}`)
        setRun(r)
        setElapsed(Date.now() - t0)
        if (r.status === 'queued' || r.status === 'running') timer.current = window.setTimeout(tick, 450)
        else {
          if (r.status === 'completed') toast({ kind: 'success', title: 'Analysis complete', body: `${r.conflicts_found} finding(s) sent to the validation queue.` })
          reload(true)
        }
      } catch (e) {
        setErr((e as ApiError).message)
      }
    }
    tick()
  }, [reload, toast])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  useEffect(() => { setRun(null); setErr(null) }, [caseId])

  async function start() {
    setErr(null)
    try {
      const r = await api<Run>(`/cases/${caseId}/analyze`, { body: { config, use_llm: useLlm } })
      setRun(r)
      poll(r.id)
    } catch (e) {
      setErr((e as ApiError).message)
    }
  }

  async function cancel() {
    if (!run) return
    try {
      await api(`/runs/${run.id}/cancel`, { method: 'POST' })
      toast({ kind: 'info', title: 'Cancellation requested', body: 'The worker stops at the next stage boundary.' })
    } catch (e) {
      toast({ kind: 'error', title: 'Could not cancel', body: (e as ApiError).message })
    }
  }

  async function generateCase() {
    const cs = await api<CaseSummary>('/cases/generate', { method: 'POST' })
    reloadCases()
    setParams({ case: cs.id })
  }

  const patch = (i: Instruction) => setData((d) => d && { ...d, notes: d.notes.map((n) => (n.id === i.note_id ? { ...n, instructions: n.instructions?.map((x) => (x.id === i.id ? i : x)) } : n)) })
  const notes = c?.notes ?? []
  const instrCount = notes.reduce((a, n) => a + (n.instructions?.length ?? 0), 0)
  const steps = [
    { label: 'Select case', done: !!caseId },
    { label: 'Add ≥ 2 sources', done: notes.length >= 2 },
    { label: 'NLP extraction', done: instrCount > 0 },
    { label: 'Review entities', done: instrCount > 0 },
    { label: 'Analyse', done: run?.status === 'completed' },
    { label: 'Clinician review', done: false },
    { label: 'Report', done: false },
  ]
  const running = run && (run.status === 'running' || run.status === 'queued')

  return (
    <div>
      <PageHeader eyebrow={<><Activity className="size-3.5" /> Conflict analysis <DemoChip /></>} title="Cross-instruction analysis"
        subtitle="Run the NLP → Knowledge Graph → RAG → comparison pipeline on a case. Stages below are reported live by the backend worker." />

      <ol className="mb-6 flex flex-wrap gap-2" aria-label="Workflow progress">
        {steps.map((s, i) => (
          <li key={s.label} className={cn('flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold', s.done ? 'border-mint/30 bg-mint-50 text-mint' : 'border-line bg-white text-ink-3')}>
            <span className={cn('grid size-5 place-items-center rounded-full text-[10.5px]', s.done ? 'bg-mint text-white' : 'bg-slate-100')}>{s.done ? <Check className="size-3" /> : i + 1}</span>{s.label}
          </li>
        ))}
      </ol>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <p className="label-xs mb-2">Step 1 · Case</p>
            <Select value={caseId} onChange={(e) => setParams(e.target.value ? { case: e.target.value } : {})} aria-label="Select case">
              <option value="">Select a synthetic case…</option>
              {cases?.map((x) => <option key={x.id} value={x.id}>{x.id} · {x.pseudonym} ({x.note_count} notes)</option>)}
            </Select>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="secondary" icon={<FolderPlus className="size-4" />} onClick={() => setNewCase(true)}>New case</Button>
              <Button size="sm" variant="soft" icon={<Sparkles className="size-4" />} onClick={generateCase}>Generate demo case</Button>
            </div>
          </Card>

          {c && (
            <Card className="p-5">
              <div className="mb-2 flex items-center justify-between"><p className="label-xs">Step 2 · Instruction sources</p><Badge className={notes.length >= 2 ? 'bg-mint-50 text-mint' : 'bg-amber-50 text-amber'}>{notes.length} note(s)</Badge></div>
              <ul className="space-y-1.5">
                {notes.map((n) => (
                  <li key={n.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-[12.5px]">
                    <FileText className="size-4 text-primary" /><span className="min-w-0 flex-1 truncate"><b className="text-ink">{n.specialty}</b> · {n.title}</span><span className="num text-ink-3">{n.instructions?.length ?? 0}</span>
                  </li>
                ))}
              </ul>
              {notes.length < 2 && <p className="mt-2 text-[12px] text-amber">Cross-instruction analysis needs at least two specialist notes.</p>}
              <Button size="sm" variant="secondary" className="mt-3" icon={<FilePlus2 className="size-4" />} onClick={() => setNoteOpen(true)}>Add specialist note</Button>
            </Card>
          )}

          {c && (
            <Card className="p-5">
              <p className="label-xs mb-2">Pipeline configuration</p>
              <div className="space-y-1.5">
                {CONFIGS.map((x) => (
                  <label key={x.v} className={cn('flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 transition', config === x.v ? 'border-primary/50 bg-primary-50/60' : 'border-line hover:border-line-2')}>
                    <input type="radio" name="cfg" className="mt-1 accent-[#4169f5]" checked={config === x.v} onChange={() => setConfig(x.v)} />
                    <span><span className="block text-[13px] font-semibold text-ink">{x.label}</span><span className="text-[11.5px] text-ink-3">{x.d}</span></span>
                  </label>
                ))}
              </div>
              <label className="mt-3 flex items-start gap-2 text-[12.5px] text-ink-2">
                <input type="checkbox" className="mt-0.5 accent-[#4169f5]" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} />
                <span>Use generative AI explanations{settings && <span className="block text-[11.5px] text-ink-3">{settings.llm.configured ? `Provider configured: ${settings.llm.model}` : settings.llm.note}</span>}</span>
              </label>
              {err && <p className="mt-3 rounded-xl bg-danger-50 px-3 py-2 text-[12.5px] font-medium text-danger" role="alert">{err}</p>}
              <Button className="mt-4 w-full" size="lg" variant="dark" disabled={notes.length < 2 || !!running || c.archived} loading={!!running} onClick={start} icon={<Activity className="size-4" />}>{running ? 'Analysing…' : 'Run analysis'}</Button>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {!caseId && <Card><EmptyState icon={<Activity />} title="Choose a case to begin" body="Select a synthetic case, create a new one, or generate a demo case from the fictional scenario library." /></Card>}
          {caseId && !c && <Skeleton className="h-96" />}

          <AnimatePresence>
            {run && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="p-5 sm:p-6">
                  <Timeline run={run} elapsed={elapsed} />
                  <div className="mt-4 flex flex-wrap gap-2">
                    {running && <Button variant="secondary" size="sm" icon={<Ban className="size-4" />} onClick={cancel}>Cancel</Button>}
                    {(run.status === 'failed' || run.status === 'cancelled') && <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={start}>Retry</Button>}
                  </div>
                  {run.status === 'failed' && <p className="mt-3 flex items-start gap-2 rounded-xl bg-danger-50 px-3 py-2 text-[13px] text-danger" role="alert"><TriangleAlert className="mt-0.5 size-4" />{run.error}</p>}
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {run?.status === 'completed' && run.conflicts && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="label-xs">Results summary</p>
                  <p className="display text-[28px] text-ink">{run.conflicts.length} new finding{run.conflicts.length === 1 ? '' : 's'}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">{SEVERITY_ORDER.map((s) => { const n = run.conflicts!.filter((x) => x.severity === s).length; return n ? <span key={s} className="flex items-center gap-1"><SeverityBadge severity={s} /><b className="num text-[13px]">{n}</b></span> : null })}</div>
              </div>
              <p className="mt-1 text-[12.5px] text-ink-3">Previously reviewed findings are kept unchanged. Deterministic rules, retrieved evidence and any LLM explanation are labelled separately in each trace.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/app/validation"><Button size="sm" variant="dark" icon={<ClipboardCheck className="size-4" />}>Go to validation queue</Button></Link>
                <Button size="sm" variant="secondary" icon={<FileBarChart className="size-4" />} onClick={async () => { const r = await api<{ id: number }>('/reports', { body: { case_id: caseId } }); nav(`/app/reports/${r.id}`) }}>Generate report</Button>
              </div>
            </Card>
          )}

          {c && (run?.status === 'completed' ? c.conflicts.length > 0 : c.conflicts.length > 0 && !running) && (
            <div className="space-y-3">
              <p className="label-xs">Findings for this case ({c.conflicts.length})</p>
              {c.conflicts.map((x, i) => <ConflictCard key={x.id} c={x} defaultOpen={i === 0 && run?.status === 'completed'} />)}
            </div>
          )}

          {c && !running && (
            <Card className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="label-xs">Steps 3–4 · Extracted entities</p>
                  <p className="text-[13px] text-ink-2">Review and correct before analysis. Unknown values stay “Not specified”.</p>
                </div>
                <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={async () => { for (const n of notes) await api(`/notes/${n.id}/extract`, { method: 'POST' }); reload(); toast({ kind: 'info', title: 'NLP extraction re-run', body: 'Corrections preserved.' }) }}>Re-run NLP</Button>
              </div>
              <div className="space-y-4">
                {notes.map((n) => (
                  <div key={n.id}>
                    <p className="mb-1.5 text-[13px] font-semibold text-ink">{n.specialty} · {n.title} <span className="font-mono text-[11.5px] text-ink-3">{n.source_id}</span></p>
                    <InstructionTable items={n.instructions ?? []} onChange={patch} />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
      {caseId && <NoteEditor open={noteOpen} onClose={() => setNoteOpen(false)} caseId={caseId} onSaved={() => { setNoteOpen(false); reload() }} />}
      <NewCaseModal open={newCase} onClose={() => setNewCase(false)} onCreated={(cs) => { setNewCase(false); reloadCases(); setParams({ case: cs.id }) }} />
    </div>
  )
}
