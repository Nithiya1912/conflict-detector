import { Pill, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, DemoChip, EmptyState, ErrorState, Input, PageHeader, PageSkeleton, SeverityBadge, Stat, Tabs } from '../components/ui'
import { DIRECTION_LABEL, pct, valueOrUnknown } from '../lib/format'
import type { Severity } from '../lib/types'
import { useApi } from '../lib/useApi'

interface Med {
  id: number; case_id: string; pseudonym: string; entity: string; surface: string; direction: string; dose: string | null; unit: string | null
  frequency: string | null; timing: string | null; span_text: string; confidence: number; corrected: boolean; excluded: boolean
  note_id: number; note_title: string; specialty: string; source_id: string; specialist_name: string
  conflicts: { id: string; severity: Severity; category: string; title: string; validation_status: string }[]
}

export default function Medications() {
  const { data, error, loading, reload } = useApi<Med[]>('/medications')
  const [q, setQ] = useState('')
  const [view, setView] = useState<'case' | 'drug'>('case')
  const rows = useMemo(() => (data ?? []).filter((m) => !q || `${m.entity} ${m.pseudonym} ${m.case_id} ${m.specialty}`.toLowerCase().includes(q.toLowerCase())), [data, q])
  const groups = useMemo(() => {
    const g = new Map<string, Med[]>()
    rows.forEach((m) => { const k = view === 'case' ? `${m.case_id} · ${m.pseudonym}` : m.entity; g.set(k, [...(g.get(k) ?? []), m]) })
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows, view])

  if (loading && !data) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  const flagged = rows.filter((m) => m.conflicts.length).length
  const missingDose = rows.filter((m) => !m.dose).length
  const multi = new Set([...groups.map(([, ms]) => ms)].filter((ms) => new Set(ms.map((m) => m.specialty)).size > 1).flat().map((m) => m.case_id)).size

  return (
    <div>
      <PageHeader eyebrow={<><Pill className="size-3.5" /> Medication review <DemoChip /></>} title="Medication review"
        subtitle="Every medication instruction extracted from specialist notes, reconciled by case or by drug, with linked candidate conflicts. Doses and timings appear only when written in the source." />
      <div className="mb-5 grid gap-4 sm:grid-cols-4">
        <Card className="p-4"><Stat label="Medication instructions" value={rows.length} /></Card>
        <Card className="p-4"><Stat label="Linked to a finding" value={flagged} sub={pct(rows.length ? flagged / rows.length : null)} /></Card>
        <Card className="p-4"><Stat label="Dose not specified" value={missingDose} sub="Left blank — never inferred" /></Card>
        <Card className="p-4"><Stat label={view === 'case' ? 'Cases with multi-specialist meds' : 'Distinct drugs'} value={view === 'case' ? multi : groups.length} /></Card>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={view} onChange={setView} items={[{ value: 'case', label: 'By case' }, { value: 'drug', label: 'By drug' }]} />
        <div className="relative ml-auto w-full max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input className="pl-9" placeholder="Filter medications" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter medications" /></div>
      </div>
      {groups.length === 0 ? <Card><EmptyState icon={<Pill />} title="No medication instructions" /></Card> : (
        <div className="space-y-4">
          {groups.map(([k, ms]) => (
            <Card key={k} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-canvas/50 px-5 py-3">
                <p className="font-semibold text-ink">{k}</p>
                <span className="text-[12px] text-ink-3">{ms.length} instruction(s) · {new Set(ms.map((m) => m.specialty)).size} specialt{new Set(ms.map((m) => m.specialty)).size === 1 ? 'y' : 'ies'}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-[12.5px]">
                  <thead className="text-left text-ink-3"><tr>{[view === 'case' ? 'Medication' : 'Case', 'Direction', 'Dose', 'Frequency', 'Timing', 'Source', 'Conf.', 'Linked findings'].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{ms.map((m) => (
                    <tr key={m.id} className="border-t border-line align-top">
                      <td className="px-4 py-2.5 font-semibold text-ink">{view === 'case' ? m.entity : <Link className="hover:text-primary-600" to={`/app/cases/${m.case_id}`}>{m.case_id} · {m.pseudonym}</Link>}{m.excluded && <Badge className="ml-1">excluded</Badge>}{m.corrected && <Badge className="ml-1 bg-mint-50 text-mint">corrected</Badge>}</td>
                      <td className="px-4 py-2.5">{DIRECTION_LABEL[m.direction]}</td>
                      <td className="px-4 py-2.5">{m.dose ? `${m.dose} ${m.unit ?? ''}` : <span className="text-ink-3">Not specified</span>}</td>
                      <td className="px-4 py-2.5">{valueOrUnknown(m.frequency)}</td>
                      <td className="px-4 py-2.5">{valueOrUnknown(m.timing)}</td>
                      <td className="px-4 py-2.5 text-ink-2">{m.specialty} <span className="font-mono text-[11px] text-ink-3">{m.source_id}</span><span className="block text-[11.5px] text-ink-3">“{m.span_text}”</span></td>
                      <td className="num px-4 py-2.5">{pct(m.confidence)}</td>
                      <td className="px-4 py-2.5">{m.conflicts.length === 0 ? <span className="text-ink-3">—</span> : <div className="space-y-1">{m.conflicts.map((c) => <Link key={c.id} to={`/app/conflicts/${c.id}`} className="flex items-center gap-1.5 hover:text-primary-600"><SeverityBadge severity={c.severity} /><span className="truncate">{c.category}</span></Link>)}</div>}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
