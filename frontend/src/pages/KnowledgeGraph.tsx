import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, Network, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GraphView, NODE_TYPES_META, type GEdge, type GNode } from '../components/GraphView'
import { Badge, Button, Card, DemoChip, ErrorState, Input, PageHeader, Select, SeverityBadge, Skeleton } from '../components/ui'
import { cn } from '../lib/format'
import type { CaseSummary, Severity } from '../lib/types'
import { useApi } from '../lib/useApi'

const RELATIONS = [
  ['', 'All relationships'], ['INSTRUCTS', 'Note → entity (instructs)'], ['IS_A', 'Entity → class (is a)'], ['CONTAINS', 'Food → nutrient (contains)'],
  ['SUBCLASS_OF', 'Class hierarchy'], ['INTERACTS_WITH', 'Rule edges (interacts with)'], ['TRIGGERS', 'Entity → conflict (triggers)'], ['SUPPORTS', 'Evidence → conflict (supports)'],
]

export default function KnowledgeGraph() {
  const [caseId, setCaseId] = useState('CASE-1001')
  const [background, setBackground] = useState(true)
  const { data, error, loading, reload } = useApi<{ nodes: GNode[]; edges: GEdge[]; stats: { background_nodes: number; background_edges: number } }>(`/graph?${new URLSearchParams({ ...(caseId && { case_id: caseId }), background: String(background) })}`)
  const { data: cases } = useApi<CaseSummary[]>('/cases')
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [relation, setRelation] = useState('')
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState<GNode | null>(null)

  const counts = useMemo(() => { const m: Record<string, number> = {}; data?.nodes.forEach((n) => (m[n.type] = (m[n.type] ?? 0) + 1)); return m }, [data])
  const connected = useMemo(() => {
    if (!sel || !data) return []
    return data.edges.filter((e) => e.source === sel.id || e.target === sel.id).map((e) => ({ e, other: data.nodes.find((n) => n.id === (e.source === sel.id ? e.target : e.source)) })).filter((x) => x.other)
  }, [sel, data])

  const toggle = (t: string) => setHidden((h) => { const n = new Set(h); if (n.has(t)) n.delete(t); else n.add(t); return n })

  return (
    <div>
      <PageHeader eyebrow={<><Network className="size-3.5" /> Knowledge graph <DemoChip /></>} title="Knowledge Graph explorer"
        subtitle="Built with NetworkX from stored instructions, the curated relation set and detected conflicts. Drag nodes, zoom, click to inspect provenance and see which relationships triggered a finding." />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <Select className="w-60" value={caseId} onChange={(e) => { setCaseId(e.target.value); setSel(null) }} aria-label="Case"><option value="">All active cases</option>{cases?.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.pseudonym}</option>)}</Select>
        <Select className="w-64" value={relation} onChange={(e) => setRelation(e.target.value)} aria-label="Relationship type">{RELATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <div className="relative w-56"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input className="pl-9" placeholder="Find entity…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search entity" /></div>
        <label className="flex items-center gap-2 px-2 text-[13px] text-ink-2"><input type="checkbox" className="accent-[#4169f5]" checked={background} onChange={(e) => setBackground(e.target.checked)} />Show KG classes</label>
      </Card>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter node categories">
        {Object.entries(NODE_TYPES_META).map(([t, m]) => (
          <button key={t} onClick={() => toggle(t)} aria-pressed={!hidden.has(t)} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold transition', hidden.has(t) ? 'border-line bg-white text-ink-3 line-through' : 'border-transparent text-ink')} style={hidden.has(t) ? undefined : { background: m.bg }}>
            <m.icon className="size-3.5" />{m.label}<span className="num opacity-70">{counts[t] ?? 0}</span>
          </button>
        ))}
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      <div className="relative">
        <Card className="overflow-hidden bg-[#f8faff]">
          {loading && !data ? <Skeleton className="h-[640px]" /> : data && <GraphView nodes={data.nodes} edges={data.edges} hiddenTypes={hidden} relationFilter={relation} search={search} selected={sel?.id ?? null} onSelect={setSel} height="min(72vh, 720px)" />}
        </Card>
        <AnimatePresence>
          {sel && (
            <motion.aside initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} className="absolute right-3 top-3 bottom-3 z-10 w-[min(360px,calc(100%-24px))] overflow-y-auto rounded-2xl border border-line bg-white/95 p-5 shadow-[var(--shadow-lift)] backdrop-blur">
              <button className="absolute right-3 top-3 rounded-full p-1 text-ink-3 hover:bg-slate-100" onClick={() => setSel(null)} aria-label="Close details"><X className="size-4" /></button>
              <span className="inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-bold text-white" style={{ background: NODE_TYPES_META[sel.type]?.color }}>{NODE_TYPES_META[sel.type]?.label}</span>
              <h2 className="display mt-2 text-[26px] leading-tight text-ink">{sel.label}</h2>
              {sel.type === 'conflict' && (
                <div className="mt-2 space-y-2 text-[13px]">
                  <div className="flex flex-wrap gap-2"><SeverityBadge severity={sel.data.severity as Severity} /><Badge>{String(sel.data.category)}</Badge></div>
                  <p className="text-ink-2">{String(sel.data.title)}</p>
                  <Link to={`/app/conflicts/${sel.label}`}><Button size="sm" variant="dark">Open evidence trace</Button></Link>
                </div>
              )}
              {sel.type === 'note' && <p className="mt-2 text-[13px] text-ink-2">{String(sel.data.specialist)} · <span className="font-mono">{String(sel.data.source_id)}</span></p>}
              {sel.type === 'guideline' && <p className="mt-2 text-[13px] text-ink-2">{String(sel.data.issuer ?? 'Issuer unknown')}{sel.data.is_synthetic ? ' · synthetic' : ''} · <Link className="text-primary-600 hover:underline" to={`/app/guidelines?doc=${sel.data.document_id}`}>open</Link></p>}
              {sel.type === 'class' && <p className="mt-2 text-[13px] text-ink-2">Background concept from the curated demonstration relation set (requires clinical verification).</p>}
              {Array.isArray(sel.data.sources) && (
                <div className="mt-4">
                  <p className="label-xs mb-2">Source provenance</p>
                  <ul className="space-y-2">{(sel.data.sources as { note_id: number; case_id: string; span: string; direction: string; source_id: string }[]).map((s, i) => (
                    <li key={i} className="rounded-xl border border-line p-2.5 text-[12.5px]"><p className="text-ink">“{s.span}”</p><p className="mt-0.5 text-ink-3"><span className="font-mono">{s.source_id}</span> · {s.direction}</p></li>
                  ))}</ul>
                </div>
              )}
              {(typeof sel.data.case_id === 'string' || Array.isArray(sel.data.cases)) && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(Array.isArray(sel.data.cases) ? (sel.data.cases as string[]) : [sel.data.case_id as string]).map((cid) => <Link key={cid} to={`/app/cases/${cid}`} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[12px] font-semibold text-primary-600 hover:bg-[#e2e9ff]">{cid}<ExternalLink className="size-3" /></Link>)}
                </div>
              )}
              <div className="mt-4">
                <p className="label-xs mb-2">Connected ({connected.length})</p>
                <ul className="space-y-1">{connected.map(({ e, other }) => (
                  <li key={e.id}><button onClick={() => setSel(other!)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-canvas">
                    <span className="size-2 rounded-full" style={{ background: NODE_TYPES_META[other!.type]?.color }} />
                    <span className="font-mono text-[10.5px] text-ink-3">{e.relation.replace('INSTRUCTS:', '→')}</span>
                    <span className="truncate text-ink">{other!.label}</span>
                    {typeof e.data.rule_id === 'string' && <span className="ml-auto font-mono text-[10.5px] text-coral">{e.data.rule_id}</span>}
                  </button></li>
                ))}</ul>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      {data && <p className="mt-3 text-[12px] text-ink-3">Showing {data.nodes.length} nodes and {data.edges.length} edges. Background graph: {data.stats.background_nodes} concepts, {data.stats.background_edges} curated relations.</p>}
    </div>
  )
}
