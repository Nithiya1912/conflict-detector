import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, ClipboardCheck, GitBranch, PartyPopper } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CategoryChip, EvidenceCard, ReviewPanel } from '../components/conflict'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Ring, Select, SeverityBadge, Tabs, ValidationBadge } from '../components/ui'
import { CATEGORIES, SEVERITY_META, SEVERITY_ORDER, cn, relTime } from '../lib/format'
import type { Conflict } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function Validation() {
  const [params, setParams] = useSearchParams()
  const all = params.get('all') === '1'
  const { data, error, loading, reload, setData } = useApi<{ items: Conflict[]; reject_reasons: string[] }>(`/validation/queue?include_reviewed=${all}`, [all])
  const [selected, setSelected] = useState<string | null>(params.get('focus'))
  const category = params.get('category') ?? ''
  const severity = params.get('severity') ?? ''

  const items = useMemo(() => (data?.items ?? []).filter((c) => (!category || c.category === category) && (!severity || c.severity === severity)), [data, category, severity])
  const current = items.find((c) => c.id === selected) ?? items[0]
  useEffect(() => { if (current && current.id !== selected) setSelected(current.id) }, [current, selected])

  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }

  function onDone(updated: Conflict) {
    setData((d) => {
      if (!d) return d
      const pendingOnly = !all
      const stillOpen = ['pending', 'clarification_requested'].includes(updated.validation_status)
      const next = d.items.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)).filter((x) => !pendingOnly || x.id !== updated.id || stillOpen)
      return { ...d, items: next }
    })
    const idx = items.findIndex((x) => x.id === updated.id)
    const nextItem = items[idx + 1] ?? items[idx - 1]
    setSelected(nextItem?.id ?? null)
  }

  if (loading && !data) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />

  return (
    <div>
      <PageHeader eyebrow={<><ClipboardCheck className="size-3.5" /> Human-in-the-loop</>} title="Clinician validation queue"
        subtitle="Every candidate conflict is reviewed by a clinician. Decisions are appended to an immutable history; rejections and their reasons are kept for evaluation."
        actions={<Tabs value={all ? 'all' : 'open'} onChange={(v) => set('all', v === 'all' ? '1' : '')} items={[{ value: 'open', label: 'Awaiting review' }, { value: 'all', label: 'All findings' }]} />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Select className="w-56" value={category} onChange={(e) => set('category', e.target.value)} aria-label="Category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select className="w-56" value={severity} onChange={(e) => set('severity', e.target.value)} aria-label="Severity"><option value="">All severities</option>{SEVERITY_ORDER.map((s) => <option key={s} value={s}>{SEVERITY_META[s].short}</option>)}</Select>
        <Badge className="self-center bg-white text-ink-2 ring-1 ring-line"><span className="num">{items.length}</span> item(s)</Badge>
      </div>
      {items.length === 0 ? (
        <Card><EmptyState icon={<PartyPopper />} title={all ? 'No findings match' : 'Queue is clear'} body={all ? 'Adjust the filters.' : 'Every finding has a clinician decision. New analyses will add items here.'} action={<Link to="/app/analysis"><Button>Run an analysis</Button></Link>} /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <ul className="space-y-2 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto lg:pr-1">
            <AnimatePresence initial={false}>
              {items.map((c) => (
                <motion.li key={c.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -30, height: 0 }}>
                  <button onClick={() => setSelected(c.id)} className={cn('w-full rounded-2xl border p-3.5 text-left transition', current?.id === c.id ? 'border-primary/50 bg-white shadow-[var(--shadow-lift)]' : 'border-line bg-white/70 hover:bg-white')}>
                    <div className="flex items-center gap-2"><SeverityBadge severity={c.severity} /><span className="ml-auto text-[11px] text-ink-3">{relTime(c.created_at)}</span></div>
                    <p className="mt-1.5 text-[13.5px] font-semibold leading-snug text-ink">{c.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-3"><span className="font-mono">{c.case_id}</span> · {c.category} · {Math.round(c.confidence * 100)}% conf.</p>
                    {all && <div className="mt-1.5"><ValidationBadge status={c.validation_status} /></div>}
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {current && (
            <motion.div key={current.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-5 xl:grid-cols-[1fr_320px]">
              <Card className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-wrap items-start gap-4">
                  <Ring value={current.confidence} size={64} stroke={6} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2"><SeverityBadge severity={current.severity} full /><CategoryChip category={current.category} extension={current.is_extension} /><ValidationBadge status={current.validation_status} /></div>
                    <h2 className="display mt-1.5 text-[26px] leading-tight text-ink">{current.title}</h2>
                    <p className="text-[12px] text-ink-3"><span className="font-mono">{current.id}</span> · rule {current.rule_id} · {current.source === 'llm' ? 'LLM suggestion' : 'deterministic rule'}</p>
                  </div>
                </div>
                <section>
                  <p className="label-xs mb-2">Supporting instructions</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {current.instructions_snapshot.map((s) => (
                      <div key={s.id} className="rounded-2xl border border-line bg-canvas/50 p-3 text-[13px]">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-primary">{s.specialty} · <span className="font-mono">{s.source_id}</span></p>
                        <p className="mt-1 text-ink">“{s.span_text}”</p>
                        <p className="mt-1 text-[11.5px] text-ink-3">{s.entity} · {s.direction} · extraction {Math.round(s.confidence * 100)}%</p>
                      </div>
                    ))}
                  </div>
                </section>
                <section>
                  <p className="label-xs mb-2">Reasoning trace (summary)</p>
                  <p className="text-[13.5px] leading-relaxed text-ink-2">{current.reasoning_summary}</p>
                  <ol className="mt-2 space-y-1">{current.severity_basis.steps.map((s, i) => <li key={i} className="text-[12px] text-ink-3"><span className="font-mono font-bold text-primary">{s.step}</span> {s.rule} → <b className="capitalize text-ink-2">{s.result}</b></li>)}</ol>
                </section>
                <section>
                  <p className="label-xs mb-2">Retrieved evidence</p>
                  {current.evidence.length ? <div className="grid gap-2">{current.evidence.map((e) => <EvidenceCard key={e.chunk_id} e={e} />)}</div> : <p className="text-[13px] text-ink-3">No evidence retrieved.</p>}
                </section>
                <section className="rounded-2xl bg-amber-50 p-4 text-[13px]">
                  <p className="font-semibold text-amber">Missing evidence / uncertainty</p>
                  <p className="mt-1 text-ink-2">{current.uncertainty}</p>
                  <p className="mt-2 font-semibold text-ink">Suggested review action</p>
                  <p className="text-ink-2">{current.next_step}</p>
                </section>
                <Link to={`/app/conflicts/${current.id}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-600 hover:underline"><GitBranch className="size-4" />Open full 10-step trace <ArrowRight className="size-3.5" /></Link>
              </Card>
              <Card className="h-fit p-5 xl:sticky xl:top-20">
                <p className="label-xs mb-3">Your decision</p>
                <ReviewPanel c={current} reasons={data?.reject_reasons ?? []} onDone={onDone} />
              </Card>
            </motion.div>
          )}
        </div>
      )}
    </div>
  )
}
