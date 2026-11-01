import { Activity, Apple, Archive, ArchiveRestore, ChevronLeft, FileBarChart, FilePlus2, History, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ConflictCard, ReviewHistory } from '../components/conflict'
import { InstructionTable, NoteEditor } from '../components/notes'
import { Badge, Button, Card, CardHeader, DemoChip, EmptyState, ErrorState, Field, Input, KV, Modal, PageHeader, PageSkeleton, Select, StatusBadge, Tabs, Textarea, useToast } from '../components/ui'
import { api, type ApiError } from '../lib/api'
import { dateTime, ms } from '../lib/format'
import type { CaseDetail as TCase, Instruction, Note } from '../lib/types'
import { useApi } from '../lib/useApi'

type Tab = 'instructions' | 'conflicts' | 'validation' | 'runs'

export default function CaseDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { data, error, loading, reload, setData } = useApi<TCase>(`/cases/${id}`)
  const [tab, setTab] = useState<Tab>('instructions')
  const [editingNote, setEditingNote] = useState<Note | null | undefined>(undefined)
  const [meta, setMeta] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  if (loading && !data) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data) return null
  const c = data

  function patchInstruction(i: Instruction) {
    setData((d) => d && { ...d, notes: d.notes.map((n) => (n.id === i.note_id ? { ...n, instructions: n.instructions?.map((x) => (x.id === i.id ? i : x)) } : n)) })
  }

  async function archive() {
    setBusy('archive')
    try {
      await api(`/cases/${c.id}/archive?archived=${!c.archived}`, { method: 'POST' })
      toast({ kind: 'success', title: c.archived ? 'Case restored' : 'Case archived' })
      reload()
    } finally {
      setBusy(null)
    }
  }

  async function report() {
    setBusy('report')
    try {
      const r = await api<{ id: number }>('/reports', { body: { case_id: c.id } })
      nav(`/app/reports/${r.id}`)
    } catch (e) {
      toast({ kind: 'error', title: 'Report failed', body: (e as ApiError).message })
    } finally {
      setBusy(null)
    }
  }

  async function removeNote(n: Note) {
    if (!confirm(`Remove note “${n.title}”? Its extracted instructions are removed too.`)) return
    try {
      await api(`/notes/${n.id}`, { method: 'DELETE' })
      toast({ kind: 'success', title: 'Note removed' })
      reload()
    } catch (e) {
      toast({ kind: 'error', title: 'Cannot remove note', body: (e as ApiError).message })
    }
  }

  async function reextract(n: Note) {
    await api(`/notes/${n.id}/extract`, { method: 'POST' })
    toast({ kind: 'info', title: 'Re-extracted', body: 'Human corrections were preserved.' })
    reload()
  }

  const instructionCount = c.notes.reduce((a, n) => a + (n.instructions?.length ?? 0), 0)

  return (
    <div>
      <Link to="/app/cases" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-primary"><ChevronLeft className="size-4" />All cases</Link>
      <PageHeader
        eyebrow={<><span className="font-mono">{c.id}</span>{c.is_demo && <DemoChip />}</>}
        title={<span className="flex flex-wrap items-center gap-3">{c.pseudonym} <StatusBadge status={c.status} /></span>}
        subtitle={c.summary || 'No summary recorded.'}
        actions={<>
          <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => setMeta(true)}>Edit details</Button>
          <Button variant="secondary" size="sm" loading={busy === 'archive'} icon={c.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />} onClick={archive}>{c.archived ? 'Restore' : 'Archive'}</Button>
          <Button variant="secondary" size="sm" loading={busy === 'report'} icon={<FileBarChart className="size-4" />} onClick={report} disabled={!c.conflicts.length}>Report</Button>
          <Link to={`/app/analysis?case=${c.id}`}><Button size="sm" icon={<Activity className="size-4" />} disabled={c.archived}>Open in analysis</Button></Link>
        </>}
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Tabs value={tab} onChange={setTab} items={[
            { value: 'instructions', label: 'Notes & instructions', count: instructionCount },
            { value: 'conflicts', label: 'Conflict history', count: c.conflicts.length },
            { value: 'validation', label: 'Validation decisions', count: c.reviews.length },
            { value: 'runs', label: 'Analysis runs', count: c.runs.length },
          ]} />

          {tab === 'instructions' && (
            <div className="space-y-4">
              {c.notes.length === 0 && <Card><EmptyState icon={<FilePlus2 />} title="No notes yet" body="Add at least two specialist notes to analyse this case." action={<Button onClick={() => setEditingNote(null)}>Add note</Button>} /></Card>}
              {c.notes.map((n) => (
                <Card key={n.id}>
                  <CardHeader title={n.title} subtitle={<>{n.specialist_name} · {n.specialty} · <span className="font-mono">{n.source_id}</span> · {dateTime(n.note_date)}{n.pii_redactions ? ` · ${n.pii_redactions} redaction(s)` : ''}</>}
                    action={<div className="flex gap-1">
                      {n.diet_plan_id ? <Link to={`/app/diet-plans/${n.diet_plan_id}`}><Button size="sm" variant="soft" icon={<Apple className="size-4" />}>Diet plan</Button></Link> : <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditingNote(n)}>Edit</Button>}
                      <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={() => reextract(n)} aria-label="Re-extract" />
                      {!n.diet_plan_id && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => removeNote(n)} aria-label="Remove note" />}
                    </div>} />
                  <p className="mx-5 mb-3 whitespace-pre-line rounded-2xl bg-canvas px-4 py-3 text-[13px] leading-relaxed text-ink-2">{n.content}</p>
                  <div className="px-5 pb-5"><InstructionTable items={n.instructions ?? []} onChange={patchInstruction} /></div>
                </Card>
              ))}
              {c.notes.length > 0 && <Button variant="secondary" icon={<FilePlus2 className="size-4" />} onClick={() => setEditingNote(null)} disabled={c.archived}>Add specialist note</Button>}
            </div>
          )}

          {tab === 'conflicts' && (
            <div className="space-y-3">
              {c.conflicts.length === 0 ? <Card><EmptyState icon={<Activity />} title="No findings" body="This case has not produced any candidate conflicts yet." action={<Link to={`/app/analysis?case=${c.id}`}><Button>Run analysis</Button></Link>} /></Card>
                : c.conflicts.map((x) => <ConflictCard key={x.id} c={x} />)}
            </div>
          )}

          {tab === 'validation' && (
            <Card className="p-5">
              {c.conflicts.filter((x) => x.reviews?.length).length === 0 ? <EmptyState icon={<History />} title="No decisions yet" body="Reviewer decisions appear here with full history." /> : (
                <div className="space-y-5">
                  {c.conflicts.filter((x) => x.reviews?.length).map((x) => (
                    <div key={x.id}>
                      <Link to={`/app/conflicts/${x.id}`} className="mb-2 block font-semibold text-ink hover:text-primary-600">{x.title} <span className="font-mono text-[12px] text-ink-3">{x.id}</span></Link>
                      <ReviewHistory c={x} />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {tab === 'runs' && (
            <Card className="overflow-x-auto p-2">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead><tr className="text-left text-ink-3">{['Run', 'Configuration', 'Status', 'Findings', 'LLM', 'Duration', 'Started'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{c.runs.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-3 py-2 font-mono">#{r.id}</td><td className="px-3 py-2">{r.config.label}</td>
                    <td className="px-3 py-2 capitalize">{r.status}{r.error && <span className="block text-[11.5px] text-danger">{r.error}</span>}</td>
                    <td className="num px-3 py-2">{r.conflicts_found}</td><td className="px-3 py-2">{r.llm_used ? 'Yes' : 'No'}</td>
                    <td className="num px-3 py-2">{ms(r.duration_ms)}</td><td className="px-3 py-2 text-ink-3">{dateTime(r.started_at)}</td>
                  </tr>))}</tbody>
              </table>
              {c.runs.length === 0 && <EmptyState icon={<Activity />} title="Never analysed" />}
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <p className="label-xs mb-2">Case metadata</p>
            <KV k="Case ID" v={c.id} mono />
            <KV k="Age band" v={c.age_band ?? 'Not specified'} />
            <KV k="Sex" v={c.sex ?? 'Not specified'} />
            <KV k="Specialties" v={c.specialties.length} />
            <KV k="Created" v={dateTime(c.created_at)} />
            <KV k="Open findings" v={c.pending_count} />
          </Card>
          <Card className="p-5">
            <p className="label-xs mb-2">Diet plans</p>
            {c.diet_plans.length === 0 ? <p className="text-[13px] text-ink-3">None linked.</p> : c.diet_plans.map((p) => (
              <Link key={p.id} to={`/app/diet-plans/${p.id}`} className="flex items-center justify-between border-b border-line py-2 text-[13px] last:border-0 hover:text-primary-600"><span>{p.title} <span className="text-ink-3">v{p.version}</span></span><StatusBadge status={p.status} /></Link>
            ))}
            <Link to={`/app/diet-plans?new=${c.id}`} className="mt-3 block"><Button size="sm" variant="soft" className="w-full" icon={<Apple className="size-4" />}>New diet plan</Button></Link>
          </Card>
          <Card className="p-5 text-[12.5px] text-ink-3">
            <p className="label-xs mb-2">Specialties involved</p>
            <div className="flex flex-wrap gap-1.5">{c.specialties.map((s) => <Badge key={s} className="bg-canvas text-ink-2">{s}</Badge>)}</div>
          </Card>
        </aside>
      </div>

      <NoteEditor open={editingNote !== undefined} onClose={() => setEditingNote(undefined)} caseId={c.id} note={editingNote} onSaved={() => { setEditingNote(undefined); reload() }} />
      <MetaModal open={meta} c={c} onClose={() => setMeta(false)} onSaved={() => { setMeta(false); reload() }} />
    </div>
  )
}

function MetaModal({ open, c, onClose, onSaved }: { open: boolean; c: TCase; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ pseudonym: c.pseudonym, age_band: c.age_band ?? '', sex: c.sex ?? '', summary: c.summary })
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await api(`/cases/${c.id}`, { method: 'PATCH', body: { ...v, age_band: v.age_band || null, sex: v.sex || null } })
      onSaved()
    } catch (e) {
      setErr((e as ApiError).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Edit case details" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-3.5">
        <Field label="Pseudonym"><Input value={v.pseudonym} onChange={(e) => setV({ ...v, pseudonym: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age band"><Select value={v.age_band} onChange={(e) => setV({ ...v, age_band: e.target.value })}><option value="">Not specified</option>{['18-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80+'].map((a) => <option key={a}>{a}</option>)}</Select></Field>
          <Field label="Sex"><Select value={v.sex} onChange={(e) => setV({ ...v, sex: e.target.value })}><option value="">Not specified</option><option value="F">Female</option><option value="M">Male</option><option value="X">Other</option></Select></Field>
        </div>
        <Field label="Summary" hint="De-identified on save."><Textarea rows={3} value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} /></Field>
        {err && <p className="text-[13px] text-danger">{err}</p>}
      </div>
    </Modal>
  )
}
