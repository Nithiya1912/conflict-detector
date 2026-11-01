import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, ExternalLink, FileText, GitBranch, HelpCircle, MessageSquareText, RotateCcw, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { CATEGORY_COLORS, DIRECTION_LABEL, cn, dateTime, pct, valueOrUnknown } from '../lib/format'
import type { Conflict, Evidence, Snapshot } from '../lib/types'
import { Badge, Button, Field, Ring, Select, SeverityBadge, SourceTag, Textarea, ValidationBadge, useToast } from './ui'

export function CategoryChip({ category, extension }: { category: string; extension?: boolean }) {
  return (
    <Badge className="bg-white text-ink-2 ring-1 ring-line" dot={CATEGORY_COLORS[category]}>
      {category}
      {extension && <span className="text-[10px] font-bold uppercase text-ink-3">ext</span>}
    </Badge>
  )
}

function InstructionQuote({ s, label }: { s: Snapshot; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-gradient-to-br from-white to-[#f7f9ff] p-3.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-3">
        <span className="font-bold uppercase tracking-wider text-primary">{label}</span>
        <span>·</span>
        <span className="font-semibold text-ink-2">{s.specialty ?? 'Source'}</span>
        <span className="font-mono">{s.source_id}</span>
      </div>
      <p className="text-[13.5px] leading-relaxed text-ink">“{s.span_text}”</p>
    </div>
  )
}

export function ConflictCard({ c, defaultOpen, showCase }: { c: Conflict; defaultOpen?: boolean; showCase?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [a, b] = c.instructions_snapshot
  return (
    <motion.div layout className={cn('card overflow-hidden', c.severity === 'critical' && 'border-danger/30', c.severity === 'high' && 'border-coral/30')}>
      <button className="flex w-full items-start gap-4 p-4 text-left sm:p-5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Ring value={c.confidence} size={48} stroke={5} color={c.severity === 'uncertain' ? '#9a98a8' : '#4169f5'} label={`Confidence ${Math.round(c.confidence * 100)}%`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={c.severity} />
            <CategoryChip category={c.category} extension={c.is_extension} />
            <ValidationBadge status={c.validation_status} />
            {c.source === 'llm' && <SourceTag kind="llm" />}
            {c.matched_relationship.cross_document && <Badge className="bg-cyan/10 text-[#0b7f8c]">Cross-document</Badge>}
          </div>
          <p className="mt-1.5 font-semibold leading-snug text-ink">{c.title}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
            <span className="font-mono">{c.id}</span>
            {showCase && <> · <span className="font-mono">{c.case_id}</span></>} · {a?.entity} <ArrowRight className="inline size-3" /> {b?.entity} · rule {c.rule_id}
          </p>
        </div>
        <ChevronDown className={cn('mt-1 size-5 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
            <div className="space-y-4 border-t border-line px-4 pb-5 pt-4 sm:px-5">
              <div className="grid gap-3 md:grid-cols-2">
                {a && <InstructionQuote s={a} label="Instruction A" />}
                {b && <InstructionQuote s={b} label="Instruction B" />}
              </div>
              <p className="text-[13.5px] leading-relaxed text-ink-2">{c.reasoning_summary}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/app/conflicts/${c.id}`}><Button size="sm" variant="dark" icon={<GitBranch className="size-4" />}>Full evidence trace</Button></Link>
                {c.validation_status === 'pending' || c.validation_status === 'clarification_requested' ? (
                  <Link to={`/app/validation?focus=${c.id}`}><Button size="sm" variant="soft" icon={<ShieldCheck className="size-4" />}>Review</Button></Link>
                ) : null}
                {showCase && <Link to={`/app/cases/${c.case_id}`}><Button size="sm" variant="ghost">Open case</Button></Link>}
                <span className="ml-auto text-[12px] text-ink-3">{c.evidence_supported ? 'Supported by retrieved passage' : 'No supporting passage'}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/* ---------------- Explainability trace ---------------- */
function Step({ n, title, tag, children }: { n: number; title: string; tag?: ReactNode; children: ReactNode }) {
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.35 }} className="relative pl-12 print-break">
      <span className="absolute left-0 top-0 grid size-8 place-items-center rounded-full bg-navy text-[12px] font-bold text-white">{n}</span>
      <span className="absolute left-[15px] top-9 bottom-[-18px] w-px bg-line-2" aria-hidden />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-ink">{title}</h3>
        {tag}
      </div>
      <div className="pb-6">{children}</div>
    </motion.li>
  )
}

function EntityTable({ rows }: { rows: Snapshot[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] text-[12.5px]">
        <thead className="bg-slate-50 text-left text-ink-3">
          <tr>{['Entity', 'Type', 'Direction', 'Dose', 'Frequency', 'Timing', 'Extraction conf.'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-line">
              <td className="px-3 py-2 font-semibold text-ink">{s.entity} <span className="font-normal text-ink-3">(“{s.surface}”)</span></td>
              <td className="px-3 py-2 capitalize">{s.kind}</td>
              <td className="px-3 py-2">{DIRECTION_LABEL[s.direction] ?? s.direction}</td>
              <td className="px-3 py-2">{s.dose ? `${s.dose} ${s.unit ?? ''}` : <span className="text-ink-3">Not specified</span>}</td>
              <td className="px-3 py-2">{valueOrUnknown(s.frequency)}</td>
              <td className="px-3 py-2">{valueOrUnknown(s.timing)}</td>
              <td className="num px-3 py-2">{pct(s.confidence)}{s.hedged && <span className="ml-1 text-amber">· hedged</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EvidenceCard({ e }: { e: Evidence }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={cn('rounded-2xl border p-3.5', e.supporting ? 'border-[#0b7f8c]/25 bg-cyan/5' : 'border-line bg-white')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><BookOpen className="size-3.5 text-[#0b7f8c]" /> {e.title}</p>
          <p className="text-[11.5px] text-ink-3">
            {e.issuer ?? 'Issuer unknown'} · {e.publication_date ?? 'date unknown'}{e.section ? ` · §${e.section}` : ''}{e.page ? ` · p.${e.page}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {e.is_synthetic && <Badge className="bg-amber-50 text-amber">Synthetic</Badge>}
          <Badge className={e.supporting ? 'bg-[#0b7f8c] text-white' : 'bg-slate-100 text-ink-2'}>{e.supporting ? 'Supporting' : 'Related only'}</Badge>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100" title="Retrieval score — lexical relevance, not clinical truth">
          <motion.div className="h-full rounded-full bg-[#0b7f8c]" initial={{ width: 0 }} animate={{ width: `${Math.min(100, e.score * 200)}%` }} transition={{ duration: 0.8 }} />
        </div>
        <span className="num text-[11px] font-semibold text-ink-2">retrieval score {e.score.toFixed(3)}</span>
      </div>
      <button onClick={() => setOpen((o) => !o)} className="mt-2 text-[12px] font-semibold text-primary-600 hover:underline">{open ? 'Hide passage' : 'Open source passage'}</button>
      <AnimatePresence>{open && (
        <motion.blockquote initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-2 overflow-hidden whitespace-pre-line border-l-2 border-[#0b7f8c]/40 pl-3 text-[12.5px] leading-relaxed text-ink-2">
          {e.text}
        </motion.blockquote>)}
      </AnimatePresence>
      <p className="mt-2 text-[11.5px] text-ink-3">{e.limitations}</p>
      <Link to={`/app/guidelines?doc=${e.document_id}`} className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-2 hover:text-primary-600">View in Guideline Library <ExternalLink className="size-3" /></Link>
    </div>
  )
}

export function ConflictTrace({ c }: { c: Conflict }) {
  const [a, b] = c.instructions_snapshot
  const mr = c.matched_relationship
  const supporting = c.evidence.filter((e) => e.supporting)
  return (
    <ol className="relative">
      <Step n={1} title="Source instruction A" tag={<Badge className="bg-slate-100 text-ink-2">Input</Badge>}>{a && <InstructionQuote s={a} label={a.specialist_name ?? 'Source'} />}</Step>
      <Step n={2} title="Source instruction B" tag={<Badge className="bg-slate-100 text-ink-2">Input</Badge>}>{b && <InstructionQuote s={b} label={b.specialist_name ?? 'Source'} />}</Step>
      <Step n={3} title="Extracted entities" tag={<SourceTag kind="rule" />}>
        <EntityTable rows={c.instructions_snapshot} />
        <p className="mt-2 text-[12px] text-ink-3">Values not written in the source note are shown as “Not specified”; they are never inferred.</p>
      </Step>
      <Step n={4} title="Matched relationship or rule" tag={<SourceTag kind="rule" />}>
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="font-mono text-[12.5px] text-ink">{mr.description ?? c.rule_id}</p>
          <div className="mt-3 grid gap-2 text-[12.5px] sm:grid-cols-2">
            {(['path_a', 'path_b'] as const).map((k) => Array.isArray(mr[k]) && (mr[k] as string[]).length > 0 && (
              <div key={k} className="flex flex-wrap items-center gap-1">
                <span className="text-ink-3">KG path {k === 'path_a' ? 'A' : 'B'}:</span>
                {(mr[k] as string[]).map((p, i) => <span key={i} className="flex items-center gap-1"><Badge className="bg-primary-50 text-primary-600">{p}</Badge>{i < (mr[k] as string[]).length - 1 && <ArrowRight className="size-3 text-ink-3" />}</span>)}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-ink-3">Rule <span className="font-mono">{c.rule_id}</span> · type {String(mr.type)} {mr.timing_status ? `· timing ${String(mr.timing_status)}` : ''} · {mr.cross_document ? 'instructions from different notes' : 'instructions from the same note'}</p>
        </div>
      </Step>
      <Step n={5} title="Retrieved evidence" tag={<SourceTag kind="evidence" />}>
        {c.evidence.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-2 p-4 text-[13px] text-ink-3">No passage met the retrieval threshold for this relation.</p>
        ) : <div className="grid gap-3">{c.evidence.map((e) => <EvidenceCard key={e.chunk_id} e={e} />)}</div>}
      </Step>
      <Step n={6} title="Evidence relevance and limitations" tag={<SourceTag kind="evidence" />}>
        <p className="text-[13px] text-ink-2">{supporting.length} supporting passage(s), {c.evidence.length - supporting.length} related-only. A passage counts as supporting only when it mentions both sides of the relation. Scores reflect lexical retrieval relevance, not clinical validity.</p>
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber"><b>Uncertainty:</b> {c.uncertainty}</p>
      </Step>
      <Step n={7} title="Conflict reasoning" tag={<><SourceTag kind="rule" />{c.llm_explanation && <SourceTag kind="llm" />}</>}>
        <p className="text-[13.5px] leading-relaxed text-ink-2">{c.reasoning_summary}</p>
        {c.llm_explanation ? (
          <div className="mt-3 rounded-2xl border border-lavender/40 bg-lavender/10 p-4">
            <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-[#5b47c9]"><Sparkles className="size-3.5" />{c.llm_explanation.label} · {c.llm_explanation.model}</p>
            <p className="text-[13px] leading-relaxed text-ink">{c.llm_explanation.explanation}</p>
            {!!c.llm_explanation.clarification_questions?.length && <ul className="mt-2 list-disc pl-5 text-[12.5px] text-ink-2">{c.llm_explanation.clarification_questions.map((q) => <li key={q}>{q}</li>)}</ul>}
            {c.llm_explanation.limitations && <p className="mt-2 text-[12px] text-ink-3">Limitations: {c.llm_explanation.limitations}</p>}
          </div>
        ) : <p className="mt-2 text-[12px] text-ink-3">No LLM explanation for this finding (no provider configured, or the generative layer was not used). The summary above is generated deterministically from the rule, the entities and the evidence.</p>}
        <p className="mt-2 text-[12.5px] text-ink-2"><b>Suggested next step for clinician review:</b> {c.next_step}</p>
      </Step>
      <Step n={8} title="Severity calculation" tag={<SourceTag kind="rule" />}>
        <div className="space-y-1.5">
          {c.severity_basis.steps.map((s, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-line bg-white px-3 py-2 text-[12.5px]">
              <span className="font-mono font-bold text-primary">{s.step}</span>
              <span className="flex-1 text-ink-2">{s.rule}</span>
              <span className="font-semibold capitalize text-ink">{s.result}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-2">Final: <SeverityBadge severity={c.severity} full /> — the generative layer never sets severity.</p>
      </Step>
      <Step n={9} title="Confidence calculation" tag={<SourceTag kind="rule" />}>
        <div className="grid gap-2 sm:grid-cols-3">
          {c.confidence_basis.components.map((k) => (
            <div key={k.name} className="rounded-xl border border-line bg-white p-3">
              <p className="text-[11.5px] text-ink-3">{k.name}</p>
              <p className="num mt-0.5 text-lg font-bold text-ink">{(k.value * 100).toFixed(0)}% <span className="text-[12px] font-medium text-ink-3">× {k.weight}</span></p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-ink-2">Total <b className="num">{pct(c.confidence)}</b> — {c.confidence_basis.method}.</p>
      </Step>
      <Step n={10} title="Human validation decision" tag={<SourceTag kind="human" />}>
        <ReviewHistory c={c} />
      </Step>
    </ol>
  )
}

export function ReviewHistory({ c }: { c: Conflict }) {
  if (!c.reviews?.length) return <p className="text-[13px] text-ink-3">No reviewer decision yet. Status: <ValidationBadge status={c.validation_status} /></p>
  return (
    <ul className="space-y-2">
      {c.reviews.map((r) => (
        <li key={r.id} className="rounded-xl border border-line bg-white px-3.5 py-2.5 text-[12.5px]">
          <div className="flex flex-wrap items-center gap-2">
            <ValidationBadge status={r.decision} />
            <span className="font-semibold text-ink">{r.reviewer_name}</span>
            <span className="text-ink-3">{dateTime(r.created_at)}</span>
            <span className="text-ink-3">· from “{r.previous_status}”</span>
          </div>
          {r.reason && <p className="mt-1 text-ink-2">Reason: {r.reason}</p>}
          {r.comment && <p className="mt-1 text-ink-2">{r.comment}</p>}
        </li>
      ))}
    </ul>
  )
}

/* ---------------- Review actions ---------------- */
const DECISIONS = [
  { v: 'confirmed', label: 'Confirm conflict', icon: Check, cls: 'data-[on=true]:bg-mint data-[on=true]:text-white' },
  { v: 'rejected', label: 'Reject', icon: X, cls: 'data-[on=true]:bg-ink-2 data-[on=true]:text-white' },
  { v: 'uncertain', label: 'Mark uncertain', icon: CircleHelp, cls: 'data-[on=true]:bg-amber data-[on=true]:text-white' },
  { v: 'clarification_requested', label: 'Request clarification', icon: MessageSquareText, cls: 'data-[on=true]:bg-[#5b47c9] data-[on=true]:text-white' },
] as const

export function ReviewPanel({ c, reasons, onDone }: { c: Conflict; reasons: string[]; onDone: (c: Conflict) => void }) {
  const toast = useToast()
  const [decision, setDecision] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const reviewed = ['confirmed', 'rejected', 'uncertain'].includes(c.validation_status)

  async function submit() {
    if (!decision) return
    setBusy(true)
    setErr(null)
    try {
      const out = await api<Conflict>(`/conflicts/${c.id}/review`, { body: { decision, comment, reason: decision === 'rejected' ? reason : null } })
      setSuccess(decision)
      setTimeout(() => {
        setSuccess(null)
        setDecision(null)
        setComment('')
        setReason('')
        onDone(out)
      }, 1300)
    } catch (e) {
      setErr((e as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  async function reopen() {
    if (comment.trim().length < 3) return setErr('Add a short comment explaining why this finding is reopened.')
    setBusy(true)
    try {
      const out = await api<Conflict>(`/conflicts/${c.id}/reopen`, { body: { comment } })
      toast({ kind: 'info', title: 'Finding reopened', body: 'Previous decisions remain in the history.' })
      setComment('')
      onDone(out)
    } catch (e) {
      setErr((e as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <AnimatePresence>
        {success && (
          <motion.div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-white/90 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="text-center">
              <motion.div className="mx-auto grid size-16 place-items-center rounded-full bg-mint text-white" initial={{ scale: 0 }} animate={{ scale: [0, 1.15, 1] }} transition={{ duration: 0.5 }}>
                <motion.svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.2, duration: 0.4 }} />
                </motion.svg>
              </motion.div>
              {[...Array(8)].map((_, i) => (
                <motion.span key={i} className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-primary" initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos((i / 8) * Math.PI * 2) * 60, y: Math.sin((i / 8) * Math.PI * 2) * 60 - 10, opacity: 0 }} transition={{ duration: 0.7, delay: 0.15 }} />
              ))}
              <p className="mt-3 font-semibold text-ink">Decision recorded</p>
              <p className="text-[12px] text-ink-3">Stored in the audit trail</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {reviewed ? (
        <div className="space-y-3">
          <p className="text-[13px] text-ink-2">This finding was reviewed. Reopening keeps every earlier decision in the history.</p>
          <Field label="Reason for reopening"><Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. new specialist note received" /></Field>
          {err && <p className="text-[12px] font-medium text-danger">{err}</p>}
          <Button variant="secondary" icon={<RotateCcw className="size-4" />} loading={busy} onClick={reopen}>Reopen finding</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {DECISIONS.map((d) => (
              <button key={d.v} data-on={decision === d.v} onClick={() => setDecision(d.v)} className={cn('flex items-center justify-center gap-1.5 rounded-xl border border-line-2 bg-white px-3 py-2.5 text-[13px] font-semibold text-ink-2 transition hover:border-primary/40', d.cls)}>
                <d.icon className="size-4" /> {d.label}
              </button>
            ))}
          </div>
          {decision === 'rejected' && (
            <Field label="Rejection reason (stored for evaluation)">
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Select a reason…</option>
                {reasons.map((r) => <option key={r}>{r}</option>)}
              </Select>
            </Field>
          )}
          <Field label={decision === 'clarification_requested' ? 'What needs clarification? (required)' : 'Reviewer comment'}>
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add context for the care team…" />
          </Field>
          {err && <p className="text-[12px] font-medium text-danger" role="alert">{err}</p>}
          <Button className="w-full" variant="dark" disabled={!decision || (decision === 'rejected' && !reason)} loading={busy} onClick={submit} icon={<ShieldCheck className="size-4" />}>Record decision</Button>
          <p className="flex items-center gap-1.5 text-[11.5px] text-ink-3"><HelpCircle className="size-3.5" />Decisions are appended to history and never overwrite earlier records. The model does not learn from them automatically.</p>
        </div>
      )}
    </div>
  )
}

export function NoteLink({ n }: { n: { id: number; title: string; specialty: string; source_id: string } }) {
  return <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-2"><FileText className="size-3.5" />{n.specialty}: {n.title} <span className="font-mono text-ink-3">{n.source_id}</span></span>
}
