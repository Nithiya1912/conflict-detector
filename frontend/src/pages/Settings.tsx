import { Brain, Lock, RotateCcw, Save, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, KV, PageHeader, PageSkeleton, Select, useToast } from '../components/ui'
import { api, type ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dateTime } from '../lib/format'
import type { User } from '../lib/types'
import { useApi } from '../lib/useApi'

interface Policy { require_evidence_for_high: boolean; ambiguity_confidence_threshold: number; cap_ambiguous_at: string; unknown_timing_policy: string; confidence_weights: Record<string, number>; severity_overrides: Record<string, string> }
interface S { policy: Policy; default_policy: Policy; policy_doc: string; llm: { provider: string; configured: boolean; model: string | null; note: string }; system: Record<string, string | number | boolean>; privacy: string[] }

export default function SettingsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'
  const { data, error, loading, reload } = useApi<S>('/settings')
  const { data: users, reload: reloadUsers } = useApi<User[]>(isAdmin ? '/auth/users' : null, [isAdmin])
  const { data: rules } = useApi<{ rules: { id: string; title: string; base_severity: string; category: string }[] }>('/rules')
  const [p, setP] = useState<Policy | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (data) setP(data.policy) }, [data])

  if (loading && !data) return <PageSkeleton />
  if (error) return <ErrorState error={error} onRetry={reload} />
  if (!data || !p) return null

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      const out = await api<Policy>('/settings/policy', { method: 'PUT', body: p })
      setP(out)
      toast({ kind: 'success', title: 'Scoring policy saved', body: 'Applies to new analyses; existing findings keep their recorded basis.' })
    } catch (e) {
      const x = e as ApiError
      setErr(x.fieldErrors.map((f) => f.message).join('; ') || x.message)
    } finally {
      setBusy(false)
    }
  }
  async function reset() {
    const out = await api<Policy>('/settings/policy', { method: 'DELETE' })
    setP(out)
    toast({ kind: 'info', title: 'Policy reset to defaults' })
  }
  const w = p.confidence_weights
  const wSum = Object.values(w).reduce((a, b) => a + b, 0)

  return (
    <div>
      <PageHeader eyebrow={<><SettingsIcon className="size-3.5" /> Settings</>} title="Settings & policy" subtitle="Scoring policy, generative AI provider, privacy controls and access management." />
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader icon={<SlidersHorizontal className="size-4" />} title="Severity & confidence policy" subtitle={isAdmin ? 'Administrators can tune the documented policy' : 'Read-only — administrator role required to edit'} />
          <div className="space-y-4 px-5 pb-5">
            <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-[13px]">
              <input type="checkbox" className="mt-0.5 accent-[#4169f5]" disabled={!isAdmin} checked={p.require_evidence_for_high} onChange={(e) => setP({ ...p, require_evidence_for_high: e.target.checked })} />
              <span><b className="text-ink">S4 · Require supporting evidence for High/Critical</b><span className="block text-ink-3">Without a supporting passage, high/critical findings become “Uncertain / Insufficient Evidence”.</span></span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="S3 · Ambiguity threshold"><Input type="number" step="0.05" min={0} max={1} disabled={!isAdmin} value={p.ambiguity_confidence_threshold} onChange={(e) => setP({ ...p, ambiguity_confidence_threshold: Number(e.target.value) })} /></Field>
              <Field label="S3 · Cap ambiguous at"><Select disabled={!isAdmin} value={p.cap_ambiguous_at} onChange={(e) => setP({ ...p, cap_ambiguous_at: e.target.value })}>{['low', 'moderate', 'high'].map((s) => <option key={s}>{s}</option>)}</Select></Field>
              <Field label="S2 · Unknown timing"><Select disabled={!isAdmin} value={p.unknown_timing_policy} onChange={(e) => setP({ ...p, unknown_timing_policy: e.target.value })}><option value="uncertain">Mark uncertain</option><option value="keep">Keep rule severity</option></Select></Field>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink-2">Confidence weights <span className={wSum.toFixed(2) === '1.00' ? 'text-mint' : 'text-danger'}>(sum {wSum.toFixed(2)})</span></p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(['extraction', 'rule_match', 'evidence'] as const).map((k) => <Field key={k} label={k.replace('_', ' ')}><Input type="number" step="0.05" min={0} max={1} disabled={!isAdmin} value={w[k]} onChange={(e) => setP({ ...p, confidence_weights: { ...w, [k]: Number(e.target.value) } })} /></Field>)}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink-2">S1 · Rule base severities (override)</p>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-line">
                {rules?.rules.filter((r) => r.id.startsWith('R-D') || r.id.startsWith('R-F')).filter((r) => !r.id.includes('DUP')).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12.5px] last:border-0">
                    <span className="w-20 font-mono text-ink-3">{r.id}</span><span className="flex-1 truncate text-ink">{r.title}</span>
                    <Select className="h-8 w-32" disabled={!isAdmin} value={p.severity_overrides[r.id] ?? ''} onChange={(e) => { const o = { ...p.severity_overrides }; if (e.target.value) o[r.id] = e.target.value; else delete o[r.id]; setP({ ...p, severity_overrides: o }) }}>
                      <option value="">{r.base_severity} (default)</option>{['low', 'moderate', 'high', 'critical'].map((s) => <option key={s} value={s}>{s}</option>)}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
            {err && <p className="text-[13px] text-danger" role="alert">{err}</p>}
            {isAdmin && <div className="flex gap-2"><Button loading={busy} icon={<Save className="size-4" />} onClick={save}>Save policy</Button><Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reset}>Reset to defaults</Button></div>}
            <details className="rounded-xl bg-canvas p-3 text-[12px]"><summary className="cursor-pointer font-semibold text-ink-2">Full policy documentation</summary><pre className="mt-2 whitespace-pre-wrap font-mono text-[11.5px] text-ink-2">{data.policy_doc.trim()}</pre></details>
          </div>
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <p className="mb-2 flex items-center gap-2 font-semibold text-ink"><Brain className="size-4 text-[#5b47c9]" />Generative AI provider</p>
            <KV k="Provider" v={data.llm.provider} />
            <KV k="Status" v={data.llm.configured ? <Badge className="bg-mint-50 text-mint">Configured</Badge> : <Badge>Not configured</Badge>} />
            <KV k="Model" v={data.llm.model ?? '—'} mono />
            <p className="mt-2 text-[12px] text-ink-3">{data.llm.note} Set <code className="font-mono">LLM_PROVIDER=anthropic</code> and <code className="font-mono">ANTHROPIC_API_KEY</code> in <code className="font-mono">backend/.env</code> to enable. The model never sets severity.</p>
          </Card>
          <Card className="p-5">
            <p className="mb-2 flex items-center gap-2 font-semibold text-ink"><SettingsIcon className="size-4 text-primary" />System</p>
            {Object.entries(data.system).map(([k, v]) => <KV key={k} k={k.replace(/_/g, ' ')} v={String(v)} />)}
          </Card>
          <Card className="p-5">
            <p className="mb-2 flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="size-4 text-mint" />Privacy & security controls</p>
            <ul className="space-y-1.5 text-[12.5px] text-ink-2">{data.privacy.map((x) => <li key={x} className="flex gap-2"><Lock className="mt-0.5 size-3.5 shrink-0 text-ink-3" />{x}</li>)}</ul>
          </Card>
        </div>
      </div>
      {isAdmin && users && (
        <Card className="mt-5">
          <CardHeader icon={<Users className="size-4" />} title="Users & roles" subtitle="Role-based authorisation: clinician / reviewer and administrator" />
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead><tr className="text-left text-ink-3">{['Name', 'Email', 'Role', 'Status', 'Last login', ''].map((h) => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
              <tbody>{users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="py-2 pr-3 font-semibold text-ink">{u.full_name}{u.is_demo && <Badge className="ml-1 bg-amber-50 text-amber">demo</Badge>}</td>
                  <td className="py-2 pr-3 text-ink-2">{u.email}</td>
                  <td className="py-2 pr-3"><Select className="h-8 w-36" value={u.role} disabled={u.id === user?.id} onChange={async (e) => { try { await api(`/auth/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } }); reloadUsers(); toast({ kind: 'success', title: 'Role updated' }) } catch (x) { toast({ kind: 'error', title: (x as ApiError).message }) } }}><option value="clinician">Clinician</option><option value="admin">Administrator</option></Select></td>
                  <td className="py-2 pr-3">{(u as User & { is_active?: boolean }).is_active === false ? 'Inactive' : 'Active'}</td>
                  <td className="py-2 pr-3 text-ink-3">{dateTime(u.last_login_at)}</td>
                  <td className="py-2">{u.id !== user?.id && <Button size="sm" variant="ghost" onClick={async () => { await api(`/auth/users/${u.id}`, { method: 'PATCH', body: { is_active: false } }); reloadUsers() }}>Deactivate</Button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
