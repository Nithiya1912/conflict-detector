import { motion } from 'motion/react'
import { ChevronDown, FilePlus2, FileText, Pencil, Search } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { InstructionTable, KindBadge, NoteEditor } from '../components/notes'
import { Badge, Button, Card, DemoChip, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton } from '../components/ui'
import { cn, dateTime } from '../lib/format'
import type { CaseSummary, Instruction, Note } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function Notes() {
  const [caseId, setCaseId] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const [editor, setEditor] = useState<{ caseId: string; note: Note | null } | null>(null)
  const [targetCase, setTargetCase] = useState('')
  const qs = new URLSearchParams({ ...(caseId && { case_id: caseId }), ...(specialty && { specialty }), ...(q && { q }) }).toString()
  const { data, error, loading, reload, setData } = useApi<Note[]>(`/notes?${qs}`)
  const { data: cases } = useApi<CaseSummary[]>('/cases')
  const { data: specialties } = useApi<string[]>('/specialties')

  const patch = (i: Instruction) => setData((d) => d && d.map((n) => (n.id === i.note_id ? { ...n, instructions: n.instructions?.map((x) => (x.id === i.id ? i : x)) } : n)))

  return (
    <div>
      <PageHeader eyebrow={<><FileText className="size-3.5" /> Specialist notes <DemoChip /></>} title="Specialist notes workspace"
        subtitle="Notes from every specialist, with structured instructions extracted by the NLP layer. Correct or exclude an extraction before analysis — corrections are preserved on re-extraction."
        actions={<div className="flex items-center gap-2">
          <Select className="w-52" value={targetCase} onChange={(e) => setTargetCase(e.target.value)} aria-label="Case for new note"><option value="">Choose case for new note…</option>{cases?.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.pseudonym}</option>)}</Select>
          <Button icon={<FilePlus2 className="size-4" />} disabled={!targetCase} onClick={() => setEditor({ caseId: targetCase, note: null })}>Add note</Button>
        </div>} />
      <Card className="mb-5 grid gap-2 p-3 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input className="pl-9" placeholder="Search note text, title or specialist" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" /></div>
        <Select value={caseId} onChange={(e) => setCaseId(e.target.value)} aria-label="Filter by case"><option value="">All cases</option>{cases?.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.pseudonym}</option>)}</Select>
        <Select value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Filter by specialty"><option value="">All specialties</option>{specialties?.map((s) => <option key={s}>{s}</option>)}</Select>
      </Card>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div> : data?.length === 0 ? (
        <Card><EmptyState icon={<FileText />} title="No notes found" body="Try another filter or add a note to a case." /></Card>
      ) : (
        <div className="space-y-3">
          {data?.map((n, idx) => (
            <motion.div key={n.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.03, 0.3) }} className="card overflow-hidden">
              <button className="flex w-full items-center gap-4 p-4 text-left" onClick={() => setOpen(open === n.id ? null : n.id)} aria-expanded={open === n.id}>
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary"><FileText className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{n.title}</p>
                  <p className="truncate text-[12px] text-ink-3">{n.specialist_name} · {n.specialty} · <span className="font-mono">{n.source_id}</span> · {dateTime(n.note_date)}</p>
                </div>
                <div className="hidden gap-1 sm:flex">{[...new Set(n.instructions?.map((i) => i.kind))].map((k) => <KindBadge key={k} kind={k} />)}</div>
                <Badge className="bg-canvas text-ink-2"><span className="num">{n.instruction_count}</span> extracted</Badge>
                <ChevronDown className={cn('size-5 text-ink-3 transition', open === n.id && 'rotate-180')} />
              </button>
              {open === n.id && (
                <div className="space-y-3 border-t border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/app/cases/${n.case_id}`} className="font-mono text-[12px] font-semibold text-primary-600 hover:underline">{n.case_id}</Link>
                    <Badge className="bg-slate-100 text-ink-2">{n.category}</Badge>
                    {n.pii_redactions > 0 && <Badge className="bg-amber-50 text-amber">{n.pii_redactions} identifier(s) redacted</Badge>}
                    {!n.diet_plan_id && <Button size="sm" variant="ghost" className="ml-auto" icon={<Pencil className="size-4" />} onClick={() => setEditor({ caseId: n.case_id, note: n })}>Edit note</Button>}
                  </div>
                  <p className="whitespace-pre-line rounded-2xl bg-canvas px-4 py-3 text-[13px] leading-relaxed text-ink-2">{n.content}</p>
                  <InstructionTable items={n.instructions ?? []} onChange={patch} />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
      <NoteEditor open={!!editor} onClose={() => setEditor(null)} caseId={editor?.caseId ?? ''} note={editor?.note} onSaved={() => { setEditor(null); reload() }} />
    </div>
  )
}
