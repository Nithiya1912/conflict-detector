import { ScrollText, Search } from 'lucide-react'
import { useState } from 'react'
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, Skeleton } from '../components/ui'
import { dateTime } from '../lib/format'
import { useApi } from '../lib/useApi'

interface Resp { total: number; page: number; page_size: number; scope: 'all' | 'own'; action_groups: string[]; items: { id: number; actor_email: string; action: string; entity_type: string; entity_id: string; detail: string; ip: string | null; created_at: string }[] }
const TONE: Record<string, string> = { review: 'bg-mint-50 text-mint', analysis: 'bg-primary-50 text-primary-600', auth: 'bg-slate-100 text-ink-2', settings: 'bg-amber-50 text-amber', case: 'bg-lavender/15 text-[#5b47c9]' }

export default function AuditLogs() {
  const [action, setAction] = useState('')
  const [actor, setActor] = useState('')
  const [page, setPage] = useState(1)
  const qs = new URLSearchParams({ page: String(page), page_size: '40', ...(action && { action }), ...(actor && { actor }) }).toString()
  const { data, error, loading, reload } = useApi<Resp>(`/audit?${qs}`)
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1

  return (
    <div>
      <PageHeader eyebrow={<><ScrollText className="size-3.5" /> Audit logs</>} title="Audit trail" subtitle={data?.scope === 'own' ? 'Showing your own actions. Administrators can see every actor.' : 'Every state-changing action across the system, newest first.'} />
      <Card className="mb-4 flex flex-wrap gap-2 p-3">
        <Select className="w-52" value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} aria-label="Action group"><option value="">All actions</option>{data?.action_groups.map((a) => <option key={a} value={a}>{a}</option>)}</Select>
        {data?.scope === 'all' && <div className="relative w-64"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" /><Input className="pl-9" placeholder="Filter by actor email" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1) }} aria-label="Actor" /></div>}
        <span className="ml-auto self-center text-[12.5px] text-ink-3">{data?.total ?? 0} entries</span>
      </Card>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data ? <Skeleton className="h-96" /> : data?.items.length === 0 ? <Card><EmptyState icon={<ScrollText />} title="No entries" /></Card> : (
        <Card className="overflow-x-auto p-2">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead><tr className="text-left text-ink-3">{['When', 'Actor', 'Action', 'Entity', 'Detail', 'IP'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{data?.items.map((a) => (
              <tr key={a.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-2 text-ink-3">{dateTime(a.created_at)}</td>
                <td className="px-3 py-2 text-ink">{a.actor_email}</td>
                <td className="px-3 py-2"><Badge className={`font-mono ${TONE[a.action.split('.')[0]] ?? 'bg-slate-100 text-ink-2'}`}>{a.action}</Badge></td>
                <td className="px-3 py-2 text-ink-2">{a.entity_type} <span className="font-mono text-ink-3">{a.entity_id}</span></td>
                <td className="max-w-[360px] px-3 py-2 text-ink-2">{a.detail}</td>
                <td className="px-3 py-2 font-mono text-ink-3">{a.ip ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="flex items-center justify-end gap-2 p-3">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <span className="text-[12.5px] text-ink-3">Page {page} of {pages}</span>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
