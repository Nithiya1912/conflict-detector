import { ChevronLeft, Printer } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { CategoryChip, ConflictTrace, NoteLink, ReviewPanel } from '../components/conflict'
import { Button, Card, ErrorState, KV, PageHeader, PageSkeleton, Ring, SeverityBadge, ValidationBadge } from '../components/ui'
import { dateTime, pct } from '../lib/format'
import type { Conflict } from '../lib/types'
import { useApi } from '../lib/useApi'

export default function ConflictDetail() {
  const { id } = useParams()
  const { data: c, error, loading, reload, setData } = useApi<Conflict>(`/conflicts/${id}`)
  const { data: q } = useApi<{ reject_reasons: string[] }>('/validation/queue')
  if (loading && !c) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!c) return null
  return (
    <div>
      <Link to={c.case ? `/app/cases/${c.case.id}` : '/app/validation'} className="no-print mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-primary"><ChevronLeft className="size-4" />{c.case ? `${c.case.id} · ${c.case.pseudonym}` : 'Back'}</Link>
      <PageHeader eyebrow={<><span className="font-mono">{c.id}</span> · explainability & evidence trace</>} title={c.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><SeverityBadge severity={c.severity} full /><CategoryChip category={c.category} extension={c.is_extension} /><ValidationBadge status={c.validation_status} /></span>}
        actions={<Button variant="secondary" size="sm" className="no-print" icon={<Printer className="size-4" />} onClick={() => window.print()}>Print trace</Button>} />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="p-5 sm:p-7"><ConflictTrace c={c} /></Card>
        <aside className="space-y-4 no-print xl:sticky xl:top-20 xl:self-start">
          <Card className="p-5">
            <div className="flex items-center gap-4">
              <Ring value={c.confidence} size={72} stroke={7} />
              <div><p className="text-[13px] font-semibold text-ink">System confidence</p><p className="text-[12px] text-ink-3">How sure the pipeline is that the pattern matched — not proof of clinical correctness.</p></div>
            </div>
            <div className="mt-4">
              <KV k="Severity" v={<SeverityBadge severity={c.severity} />} />
              <KV k="Confidence" v={pct(c.confidence)} />
              <KV k="Rule" v={c.rule_id} mono />
              <KV k="Source" v={c.source === 'llm' ? 'LLM suggestion' : 'Deterministic rule'} />
              <KV k="Detected" v={dateTime(c.created_at)} />
              <KV k="Run" v={c.run_id ? `#${c.run_id}` : '—'} />
            </div>
          </Card>
          <Card className="p-5">
            <p className="label-xs mb-3">Clinician decision</p>
            <ReviewPanel c={c} reasons={q?.reject_reasons ?? []} onDone={(x) => setData({ ...c, ...x })} />
          </Card>
          {c.notes && <Card className="p-5"><p className="label-xs mb-2">Source notes</p><div className="space-y-1.5">{c.notes.map((n) => <div key={n.id}><NoteLink n={n} /></div>)}</div></Card>}
        </aside>
      </div>
    </div>
  )
}
