import { AnimatePresence, motion } from 'motion/react'
import { BookOpen, FilePlus2, History, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EvidenceCard } from '../components/conflict'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageSkeleton, Tabs, Textarea, useToast } from '../components/ui'
import { api, type ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { cn, dateTime, relTime } from '../lib/format'
import type { Evidence } from '../lib/types'
import { useApi } from '../lib/useApi'

interface Doc { id: number; title: string; issuer: string | null; publication_date: string | null; source_url: string | null; license_note: string | null; is_synthetic: boolean; status: string; chunk_count: number; created_at: string; indexed_at: string | null; used_by_findings?: number }
interface DocDetail extends Doc { content: string; chunks: { id: number; ordinal: number; section: string | null; page: string | null; text: string }[]; used_by: { conflict_id: string; case_id: string; title: string; chunk_ids: number[] }[] }

function DocViewer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data } = useApi<DocDetail>(`/guidelines/${id}`)
  const highlight = new Set(data?.used_by.flatMap((u) => u.chunk_ids))
  return (
    <Modal open onClose={onClose} wide title={data?.title ?? 'Loading…'}>
      {!data ? <Loader2 className="mx-auto size-6 animate-spin text-primary" /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-[12.5px]">
            {data.is_synthetic && <Badge className="bg-amber-50 text-amber">Synthetic demonstration evidence</Badge>}
            <Badge>{data.issuer ?? 'Issuer unknown'}</Badge><Badge>Published: {data.publication_date ?? 'unknown'}</Badge><Badge>{data.chunk_count} indexed passages</Badge>
          </div>
          {data.license_note && <p className="text-[12px] text-ink-3">{data.license_note}</p>}
          {data.used_by.length > 0 && (
            <div className="rounded-2xl bg-cyan/10 p-3 text-[12.5px]"><p className="font-semibold text-[#0b7f8c]">Used as supporting evidence by {data.used_by.length} finding(s)</p>
              <ul className="mt-1 space-y-0.5">{data.used_by.map((u) => <li key={u.conflict_id}><Link className="text-primary-600 hover:underline" to={`/app/conflicts/${u.conflict_id}`}>{u.conflict_id}</Link> · {u.case_id} · {u.title}</li>)}</ul></div>
          )}
          {data.chunks.map((c) => (
            <div key={c.id} className={cn('rounded-2xl border p-4', highlight.has(c.id) ? 'border-[#0b7f8c]/40 bg-cyan/5' : 'border-line')}>
              <p className="label-xs mb-1">Passage {c.ordinal + 1}{c.section ? ` · ${c.section}` : ''}{c.page ? ` · page ${c.page}` : ''}{highlight.has(c.id) && ' · cited'}</p>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink-2">{c.text}</p>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

export default function Guidelines() {
  const { user } = useAuth()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const docId = params.get('doc')
  const [tab, setTab] = useState<'library' | 'history'>('library')
  const { data, error, loading, reload } = useApi<Doc[]>('/guidelines')
  const { data: history, reload: reloadHistory } = useApi<{ id: number; query: string; origin: string; case_id: string | null; results: { title: string; score: number; supporting?: boolean }[]; created_at: string }[]>(tab === 'history' ? '/retrieval/history' : null, [tab])
  const [q, setQ] = useState('')
  const [phase, setPhase] = useState(-1)
  const [results, setResults] = useState<{ results: Evidence[]; note: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', issuer: '', publication_date: '', source_url: '', license_note: '', content: '' })
  const [formErr, setFormErr] = useState<string | null>(null)
  const isAdmin = user?.role === 'admin'

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim().length < 2) return
    setResults(null)
    setPhase(0)
    const t0 = performance.now()
    try {
      const r = await api<{ results: Evidence[]; note: string }>('/guidelines/search', { body: { query: q, top_k: 5 } })
      setResults({ ...r, note: `${r.note} Retrieved in ${Math.round(performance.now() - t0)} ms.` })
    } finally {
      setPhase(-1)
    }
  }

  async function addDoc() {
    setFormErr(null)
    try {
      await api('/guidelines', { body: { ...form, issuer: form.issuer || null, publication_date: form.publication_date || null, source_url: form.source_url || null } })
      toast({ kind: 'success', title: 'Document indexed' })
      setAdding(false)
      setForm({ title: '', issuer: '', publication_date: '', source_url: '', license_note: '', content: '' })
      reload()
    } catch (e) {
      const err = e as ApiError
      setFormErr(err.fieldErrors.map((f) => `${f.field}: ${f.message}`).join('; ') || err.message)
    }
  }

  if (loading && !data) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  const synthetic = data?.every((d) => d.is_synthetic)

  return (
    <div>
      <PageHeader eyebrow={<><BookOpen className="size-3.5" /> RAG guideline library</>} title="Guideline & evidence library"
        subtitle="Documents indexed into the local vector store. Each candidate conflict retrieves passages from here; relevance scores measure retrieval similarity, not clinical truth."
        actions={isAdmin ? <Button icon={<FilePlus2 className="size-4" />} onClick={() => setAdding(true)}>Add document</Button> : <span className="text-[12px] text-ink-3">Administrators can add documents</span>} />
      {synthetic && <p className="mb-5 rounded-2xl border border-amber/30 bg-amber-50 px-4 py-3 text-[12.5px] text-amber"><b>Demo mode:</b> no external guideline corpus is configured. The library holds clearly labelled synthetic evidence summaries written for UI demonstration; they are not published guidelines and carry no real citations.</p>}

      <Card className="mb-5 p-5">
        <form onSubmit={search} className="flex flex-col gap-2 sm:flex-row" role="search">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input className="h-11 pl-9" placeholder="Search indexed content, e.g. “warfarin leafy greens INR”" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search guidelines" /></div>
          <Button size="lg" type="submit" loading={phase >= 0}>Retrieve passages</Button>
        </form>
        <AnimatePresence>
          {phase >= 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-2" aria-live="polite">
              <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-primary-600"><Loader2 className="size-3.5 animate-spin" />Querying the local TF-IDF vector index…</p>
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-2xl" />)}
            </motion.div>
          )}
        </AnimatePresence>
        {results && (
          <div className="mt-4 space-y-3">
            <p className="text-[12px] text-ink-3">{results.note}</p>
            {results.results.length === 0 ? <EmptyState icon={<Search />} title="No suitable evidence found" body="No indexed passage shares terms with this query. Absence of evidence is reported, never filled in." /> :
              results.results.map((r, i) => <motion.div key={r.chunk_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}><EvidenceCard e={{ ...r, supporting: false, limitations: r.is_synthetic ? 'Synthetic demonstration passage.' : 'Retrieved passage.' }} /></motion.div>)}
          </div>
        )}
      </Card>

      <div className="mb-4"><Tabs value={tab} onChange={(v) => { setTab(v); if (v === 'history') reloadHistory() }} items={[{ value: 'library', label: 'Documents', count: data?.length }, { value: 'history', label: 'Retrieval history' }]} /></div>
      {tab === 'library' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((d) => (
            <Card key={d.id} hover className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <BookOpen className="size-5 text-[#0b7f8c]" />
                <div className="flex gap-1">{d.is_synthetic && <Badge className="bg-amber-50 text-amber">Synthetic</Badge>}<Badge className={d.status === 'indexed' ? 'bg-mint-50 text-mint' : 'bg-danger-50 text-danger'}>{d.status}</Badge></div>
              </div>
              <button className="mt-3 text-left font-semibold leading-snug text-ink hover:text-primary-600" onClick={() => setParams({ doc: String(d.id) })}>{d.title}</button>
              <p className="mt-1 text-[12px] text-ink-3">{d.issuer ?? 'Issuer unknown'} · {d.publication_date ?? 'date unknown'}</p>
              <div className="mt-auto flex items-center gap-3 pt-4 text-[12px] text-ink-3">
                <span><b className="num text-ink">{d.chunk_count}</b> passages</span>
                <span><b className="num text-ink">{d.used_by_findings}</b> citing findings</span>
                {isAdmin && <span className="ml-auto flex gap-1">
                  <button className="rounded-lg p-1.5 hover:bg-primary-50 hover:text-primary" title="Re-index" aria-label="Re-index" onClick={async () => { await api(`/guidelines/${d.id}/reindex`, { method: 'POST' }); toast({ kind: 'success', title: 'Re-indexed' }); reload() }}><RefreshCw className="size-4" /></button>
                  <button className="rounded-lg p-1.5 hover:bg-danger-50 hover:text-danger" title="Delete" aria-label="Delete" onClick={async () => { if (confirm(`Delete “${d.title}” from the index?`)) { await api(`/guidelines/${d.id}`, { method: 'DELETE' }); reload() } }}><Trash2 className="size-4" /></button>
                </span>}
              </div>
              <p className="mt-2 text-[11px] text-ink-3">Indexed {dateTime(d.indexed_at)}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-x-auto p-2">
          {!history?.length ? <EmptyState icon={<History />} title="No retrievals yet" /> : (
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead><tr className="text-left text-ink-3">{['When', 'Origin', 'Query', 'Top result', 'Score'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{history.map((h) => (
                <tr key={h.id} className="border-t border-line"><td className="px-3 py-2 text-ink-3">{relTime(h.created_at)}</td><td className="px-3 py-2"><Badge>{h.origin}</Badge>{h.case_id && <span className="ml-1 font-mono text-[11px]">{h.case_id}</span>}</td><td className="max-w-[320px] truncate px-3 py-2 text-ink">{h.query}</td><td className="px-3 py-2 text-ink-2">{h.results[0]?.title ?? <span className="text-ink-3">No result above threshold</span>}{h.results[0]?.supporting && <Badge className="ml-1 bg-[#0b7f8c] text-white">supporting</Badge>}</td><td className="num px-3 py-2">{h.results[0]?.score?.toFixed(3) ?? '—'}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      )}

      {docId && <DocViewer id={Number(docId)} onClose={() => setParams({})} />}
      <Modal open={adding} onClose={() => setAdding(false)} wide title="Add guideline document" footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={addDoc}>Index document</Button></>}>
        <div className="space-y-3.5">
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber">Only add documents you are permitted to store. Enter metadata exactly as published — leave unknown fields blank rather than guessing. Use “## Heading” lines and “[page N]” markers to preserve section and page information.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Author / issuing organisation (if known)"><Input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} /></Field>
            <Field label="Publication date (if known)"><Input value={form.publication_date} onChange={(e) => setForm({ ...form, publication_date: e.target.value })} placeholder="e.g. 2024-03" /></Field>
            <Field label="Source URL (if any)"><Input value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} /></Field>
          </div>
          <Field label="Licence / permission note" hint="Required — how you are permitted to store this text."><Input value={form.license_note} onChange={(e) => setForm({ ...form, license_note: e.target.value })} /></Field>
          <Field label="Document text" hint="Minimum 50 characters."><Textarea rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></Field>
          {formErr && <p className="text-[13px] text-danger" role="alert">{formErr}</p>}
        </div>
      </Modal>
    </div>
  )
}
