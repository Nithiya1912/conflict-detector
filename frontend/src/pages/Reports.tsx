import { motion } from 'motion/react'
import { FileBarChart, FilePlus2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState, ErrorState, PageHeader, PageSkeleton, Select, useToast } from '../components/ui'
import { api, type ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dateTime } from '../lib/format'
import type { CaseSummary } from '../lib/types'
import { useApi } from '../lib/useApi'

interface ReportRow { id: number; case_id: string; title: string; kind: string; created_by_name: string; created_at: string; summary: { findings: number; by_severity: Record<string, number>; by_status: Record<string, number>; evidence_supported: number } }

export default function Reports() {
  const { user } = useAuth()
  const nav = useNavigate()
  const toast = useToast()
  const { data, error, loading, reload } = useApi<ReportRow[]>('/reports')
  const { data: cases } = useApi<CaseSummary[]>('/cases')
  const [caseId, setCaseId] = useState('')
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    try {
      const r = await api<{ id: number }>('/reports', { body: { case_id: caseId } })
      nav(`/app/reports/${r.id}`)
    } catch (e) {
      toast({ kind: 'error', title: 'Could not generate report', body: (e as ApiError).message })
    } finally {
      setBusy(false)
    }
  }

  if (loading && !data) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  return (
    <div>
      <PageHeader eyebrow={<><FileBarChart className="size-3.5" /> Reports</>} title="Conflict reports" subtitle="Point-in-time snapshots of a case: sources, extracted instructions, findings with evidence, severity basis and validation status. Printable."
        actions={<div className="flex gap-2"><Select className="w-64" value={caseId} onChange={(e) => setCaseId(e.target.value)} aria-label="Case for report"><option value="">Select a case…</option>{cases?.filter((c) => c.conflict_count).map((c) => <option key={c.id} value={c.id}>{c.id} · {c.pseudonym} ({c.conflict_count})</option>)}</Select><Button icon={<FilePlus2 className="size-4" />} disabled={!caseId} loading={busy} onClick={create}>Generate</Button></div>} />
      {data?.length === 0 ? <Card><EmptyState icon={<FileBarChart />} title="No reports yet" body="Choose an analysed case above to generate its first report." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card hover className="flex h-full flex-col p-5">
                <Link to={`/app/reports/${r.id}`} className="font-semibold leading-snug text-ink hover:text-primary-600">{r.title}</Link>
                <p className="mt-1 text-[12px] text-ink-3">{r.created_by_name} · {dateTime(r.created_at)}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-canvas p-2"><p className="num text-lg font-bold">{r.summary.findings}</p><p className="text-[10.5px] text-ink-3">findings</p></div>
                  <div className="rounded-xl bg-canvas p-2"><p className="num text-lg font-bold">{(r.summary.by_severity.critical ?? 0) + (r.summary.by_severity.high ?? 0)}</p><p className="text-[10.5px] text-ink-3">critical/high</p></div>
                  <div className="rounded-xl bg-canvas p-2"><p className="num text-lg font-bold">{r.summary.by_status.confirmed ?? 0}</p><p className="text-[10.5px] text-ink-3">confirmed</p></div>
                </div>
                <div className="mt-auto flex items-center gap-2 pt-4">
                  <Link to={`/app/reports/${r.id}`} className="flex-1"><Button size="sm" variant="soft" className="w-full">Open</Button></Link>
                  {user?.role === 'admin' && <Button size="sm" variant="ghost" aria-label="Delete report" icon={<Trash2 className="size-4" />} onClick={async () => { if (confirm('Delete this report snapshot?')) { await api(`/reports/${r.id}`, { method: 'DELETE' }); reload() } }} />}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
