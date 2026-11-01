import { zodResolver } from '@hookform/resolvers/zod'
import { Check, EyeOff, Pencil, Upload, Wand2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { api, type ApiError } from '../lib/api'
import { DIRECTION_LABEL, cn, pct, valueOrUnknown } from '../lib/format'
import type { Instruction, Note } from '../lib/types'
import { Badge, Button, Field, Input, Modal, Select, Tabs, Textarea, useToast } from './ui'

export const SPECIALTIES = ['Cardiology', 'Endocrinology', 'Nephrology', 'Nutrition', 'General Medicine', 'Psychiatry', 'Orthopaedics', 'Rheumatology', 'Physiotherapy', 'Urology', 'Cardiac Rehabilitation', 'Integrative Medicine']

const noteSchema = z.object({
  specialist_name: z.string().trim().min(2, 'Specialist name or role is required'),
  specialty: z.string().trim().min(2, 'Choose a specialty'),
  title: z.string().trim().min(2, 'Give the note a title'),
  category: z.enum(['medication', 'diet', 'lifestyle', 'mixed']),
  content: z.string().trim().min(5, 'Paste the note text (at least 5 characters)'),
})
type NoteForm = z.infer<typeof noteSchema>

type Preview = { redactions: number; deidentified_text: string; instructions: (Omit<Instruction, 'id' | 'case_id' | 'note_id' | 'corrected' | 'excluded'> & { timing_slot: string | null })[] }

export function NoteEditor({ open, onClose, caseId, note, onSaved }: { open: boolean; onClose: () => void; caseId: string; note?: Note | null; onSaved: (n: Note) => void }) {
  const toast = useToast()
  const [mode, setMode] = useState<'paste' | 'upload'>('paste')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<NoteForm>({ resolver: zodResolver(noteSchema) })
  const content = watch('content')

  useEffect(() => {
    if (!open) return
    reset(note ? { specialist_name: note.specialist_name, specialty: note.specialty, title: note.title, category: note.category as NoteForm['category'], content: note.content }
      : { specialist_name: '', specialty: 'Cardiology', title: '', category: 'mixed', content: '' })
    setPreview(null)
    setFile(null)
    setErr(null)
    setMode('paste')
  }, [open, note, reset])

  // Live extraction preview (debounced)
  useEffect(() => {
    if (!open || !content || content.trim().length < 5) return setPreview(null)
    const t = setTimeout(() => api<Preview>('/extract/preview', { body: { content } }).then(setPreview).catch(() => {}), 450)
    return () => clearTimeout(t)
  }, [content, open])

  async function onFile(f: File | null) {
    setFile(f)
    if (!f) return
    if (!/\.(txt|md|text)$/i.test(f.name)) return setErr('Only .txt or .md files are supported')
    if (f.size > 200_000) return setErr('File too large (max 200 KB)')
    setErr(null)
    const text = await f.text()
    setValue('content', text, { shouldValidate: true })
    if (!watch('title')) setValue('title', f.name.replace(/\.[^.]+$/, ''))
  }

  async function submit(v: NoteForm) {
    setErr(null)
    try {
      let saved: Note
      if (note) saved = await api<Note>(`/notes/${note.id}`, { method: 'PATCH', body: v })
      else if (mode === 'upload' && file) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('specialist_name', v.specialist_name)
        fd.append('specialty', v.specialty)
        fd.append('title', v.title)
        fd.append('category', v.category)
        saved = await api<Note>(`/cases/${caseId}/notes/upload`, { form: fd, method: 'POST' })
      } else saved = await api<Note>(`/cases/${caseId}/notes`, { body: v })
      toast({ kind: 'success', title: note ? 'Note updated' : 'Note added', body: `${saved.instruction_count} instruction(s) extracted${saved.pii_redactions ? ` · ${saved.pii_redactions} identifier(s) redacted` : ''}` })
      onSaved(saved)
    } catch (e) {
      setErr((e as ApiError).message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} wide title={note ? 'Edit specialist note' : 'Add specialist note'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button form="note-form" type="submit" loading={isSubmitting}>{note ? 'Save & re-extract' : 'Add note'}</Button></>}>
      <form id="note-form" onSubmit={handleSubmit(submit)} className="grid gap-5 lg:grid-cols-[1fr_1fr]" noValidate>
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Specialist name or role" error={errors.specialist_name?.message} htmlFor="sn"><Input id="sn" placeholder="Dr. A. Rao" {...register('specialist_name')} /></Field>
            <Field label="Specialty" error={errors.specialty?.message} htmlFor="sp"><Select id="sp" {...register('specialty')}>{SPECIALTIES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
          </div>
          <div className="grid grid-cols-[1.5fr_1fr] gap-3">
            <Field label="Note title" error={errors.title?.message} htmlFor="tt"><Input id="tt" placeholder="AF follow-up" {...register('title')} /></Field>
            <Field label="Instruction category" htmlFor="ct"><Select id="ct" {...register('category')}>{['mixed', 'medication', 'diet', 'lifestyle'].map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</Select></Field>
          </div>
          {!note && <Tabs value={mode} onChange={setMode} items={[{ value: 'paste', label: 'Paste text' }, { value: 'upload', label: 'Upload file' }]} />}
          {mode === 'upload' && !note && (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line-2 bg-canvas/60 px-4 py-6 text-[13px] text-ink-2 transition hover:border-primary/50">
              <Upload className="size-5 text-primary" />
              {file ? <span className="font-semibold text-ink">{file.name}</span> : <span>Choose a .txt or .md file (max 200 KB)</span>}
              <input ref={fileRef} type="file" accept=".txt,.md,text/plain,text/markdown" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </button>
          )}
          <Field label="Note content" error={errors.content?.message} hint="Identifiers such as emails, phone numbers, record IDs and dates are redacted on save." htmlFor="cc">
            <Textarea id="cc" rows={8} placeholder="e.g. Continue warfarin 5 mg once daily in the evening. INR in 2 weeks." {...register('content')} />
          </Field>
          {note?.diet_plan_id && <p className="text-[12px] text-amber">This note is generated from a diet plan — edit the plan to change its content.</p>}
          {err && <p className="text-[13px] font-medium text-danger" role="alert">{err}</p>}
        </div>
        <div className="rounded-2xl border border-line bg-canvas/60 p-4">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink"><Wand2 className="size-4 text-primary" /> Extraction preview</p>
          <p className="text-[12px] text-ink-3">Deterministic NLP runs as you type. Nothing is stored until you save.</p>
          {preview?.redactions ? <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[12px] text-amber">{preview.redactions} identifier(s) will be redacted.</p> : null}
          <div className="mt-3 space-y-2">
            {!preview && <p className="py-8 text-center text-[12.5px] text-ink-3">Start typing to preview extracted instructions.</p>}
            {preview && preview.instructions.length === 0 && <p className="py-8 text-center text-[12.5px] text-ink-3">No medication, diet or lifestyle instruction recognised in the demonstration lexicon.</p>}
            {preview?.instructions.map((i, k) => (
              <div key={k} className="rounded-xl border border-line bg-white px-3 py-2 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <KindBadge kind={i.kind} />
                  <b className="text-ink">{i.entity}</b>
                  <span className="text-ink-3">· {DIRECTION_LABEL[i.direction] ?? i.direction}</span>
                  <span className="num ml-auto text-ink-3">{pct(i.confidence)}{i.hedged && ' · hedged'}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-ink-3">Dose: {i.dose ? `${i.dose} ${i.unit ?? ''}` : 'Not specified'} · Frequency: {valueOrUnknown(i.frequency)} · Timing: {valueOrUnknown(i.timing)}</p>
              </div>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}

export function KindBadge({ kind }: { kind: string }) {
  const m: Record<string, string> = { medication: 'bg-primary-50 text-primary-600', diet: 'bg-mint-50 text-mint', lifestyle: 'bg-lavender/15 text-[#5b47c9]' }
  return <Badge className={m[kind] ?? 'bg-slate-100'}>{kind}</Badge>
}

/** Table of extracted instructions with inline human correction. */
export function InstructionTable({ items, onChange, editable = true }: { items: Instruction[]; onChange?: (i: Instruction) => void; editable?: boolean }) {
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState<Partial<Instruction>>({})
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function save(i: Instruction, patch: Partial<Instruction>) {
    setBusy(true)
    try {
      const out = await api<Instruction>(`/instructions/${i.id}`, { method: 'PATCH', body: patch })
      onChange?.(out)
      setEditing(null)
      toast({ kind: 'success', title: patch.excluded !== undefined ? (patch.excluded ? 'Instruction excluded from analysis' : 'Instruction restored') : 'Correction saved', body: 'Recorded in the audit log.' })
    } catch (e) {
      toast({ kind: 'error', title: 'Could not save', body: (e as ApiError).message })
    } finally {
      setBusy(false)
    }
  }

  if (items.length === 0) return <p className="px-1 py-4 text-[13px] text-ink-3">No instructions extracted from this note.</p>
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[760px] text-[12.5px]">
        <thead className="bg-slate-50 text-left text-ink-3">
          <tr>{['Type', 'Entity', 'Direction', 'Dose', 'Frequency', 'Timing', 'Source span', 'Conf.', ''].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const ed = editing === i.id
            return (
              <tr key={i.id} className={cn('border-t border-line align-top', i.excluded && 'opacity-50')}>
                <td className="px-3 py-2"><KindBadge kind={i.kind} /></td>
                <td className="px-3 py-2 font-semibold text-ink">{ed ? <Input className="h-8" defaultValue={i.entity} onChange={(e) => setDraft((d) => ({ ...d, entity: e.target.value }))} /> : <>{i.entity}{i.corrected && <Badge className="ml-1 bg-mint-50 text-mint">corrected</Badge>}</>}</td>
                <td className="px-3 py-2">{ed ? (
                  <Select className="h-8" defaultValue={i.direction} onChange={(e) => setDraft((d) => ({ ...d, direction: e.target.value }))}>{Object.entries(DIRECTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
                ) : DIRECTION_LABEL[i.direction] ?? i.direction}</td>
                <td className="px-3 py-2">{ed ? <div className="flex gap-1"><Input className="h-8 w-16" defaultValue={i.dose ?? ''} placeholder="dose" onChange={(e) => setDraft((d) => ({ ...d, dose: e.target.value || null }))} /><Input className="h-8 w-14" defaultValue={i.unit ?? ''} placeholder="unit" onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value || null }))} /></div> : i.dose ? `${i.dose} ${i.unit ?? ''}` : <span className="text-ink-3">Not specified</span>}</td>
                <td className="px-3 py-2">{ed ? <Input className="h-8" defaultValue={i.frequency ?? ''} onChange={(e) => setDraft((d) => ({ ...d, frequency: e.target.value || null }))} /> : <span className={!i.frequency ? 'text-ink-3' : ''}>{valueOrUnknown(i.frequency)}</span>}</td>
                <td className="px-3 py-2">{ed ? (
                  <Select className="h-8" defaultValue={i.timing ?? ''} onChange={(e) => setDraft((d) => ({ ...d, timing: e.target.value || null }))}>
                    <option value="">Not specified</option>{['morning (empty stomach)', 'morning / breakfast', 'midday / lunch', 'evening / dinner', 'bedtime', 'with meals', 'separated by interval'].map((t) => <option key={t}>{t}</option>)}
                  </Select>
                ) : <span className={!i.timing ? 'text-ink-3' : ''}>{valueOrUnknown(i.timing)}</span>}</td>
                <td className="max-w-[240px] px-3 py-2 text-ink-2">“{i.span_text}”</td>
                <td className="num px-3 py-2">{pct(i.confidence)}{i.hedged && <span className="block text-[10.5px] text-amber">hedged</span>}</td>
                <td className="px-3 py-2">
                  {editable && (ed ? (
                    <div className="flex gap-1">
                      <button className="rounded-lg p-1.5 text-mint hover:bg-mint-50" disabled={busy} onClick={() => save(i, draft)} aria-label="Save correction"><Check className="size-4" /></button>
                      <button className="rounded-lg p-1.5 text-ink-3 hover:bg-slate-100" onClick={() => setEditing(null)} aria-label="Cancel"><X className="size-4" /></button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <button className="rounded-lg p-1.5 text-ink-3 hover:bg-primary-50 hover:text-primary" onClick={() => { setEditing(i.id); setDraft({}) }} aria-label="Correct instruction"><Pencil className="size-3.5" /></button>
                      <button className="rounded-lg p-1.5 text-ink-3 hover:bg-slate-100" onClick={() => save(i, { excluded: !i.excluded })} aria-label={i.excluded ? 'Include in analysis' : 'Exclude from analysis'} title={i.excluded ? 'Include in analysis' : 'Exclude from analysis'}><EyeOff className="size-3.5" /></button>
                    </div>
                  ))}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
