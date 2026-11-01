import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type ApiError } from '../lib/api'
import type { CaseSummary, DietPlan, Meals } from '../lib/types'
import { Button, Field, Input, Modal, Select, Textarea } from './ui'

const SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const
const empty: Meals = { breakfast: [], lunch: [], dinner: [], snacks: [] }

export function DietPlanForm({ open, onClose, plan, cases, defaultCase, onSaved }: { open: boolean; onClose: () => void; plan?: DietPlan | null; cases?: CaseSummary[] | null; defaultCase?: string; onSaved: (p: DietPlan) => void }) {
  const [v, setV] = useState({ case_id: '', title: '', specialist_name: '', meals: empty, restrictions: [] as string[], nutrition_notes: '', lifestyle_notes: '' })
  const [newRestriction, setNewRestriction] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setV(plan ? { case_id: plan.case_id, title: plan.title, specialist_name: plan.specialist_name, meals: { ...empty, ...plan.meals }, restrictions: plan.restrictions, nutrition_notes: plan.nutrition_notes, lifestyle_notes: plan.lifestyle_notes }
      : { case_id: defaultCase ?? '', title: '', specialist_name: '', meals: empty, restrictions: [], nutrition_notes: '', lifestyle_notes: '' })
  }, [open, plan, defaultCase])

  function validate() {
    const e: Record<string, string> = {}
    if (!plan && !v.case_id) e.case_id = 'Choose the case this plan belongs to'
    if (v.title.trim().length < 2) e.title = 'Give the plan a title'
    if (v.specialist_name.trim().length < 2) e.specialist_name = 'Enter the authoring specialist'
    const items = SLOTS.flatMap((s) => v.meals[s])
    if (items.some((i) => !i.item.trim())) e.meals = 'Every meal row needs a food item (or remove the row)'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate()) return
    setBusy(true)
    try {
      const body = { ...v, meals: Object.fromEntries(SLOTS.map((s) => [s, v.meals[s].map((i) => ({ item: i.item.trim(), portion: i.portion?.trim() || null }))])) }
      const out = plan ? await api<DietPlan>(`/diet-plans/${plan.id}`, { method: 'PATCH', body: { ...body, case_id: undefined } }) : await api<DietPlan>('/diet-plans', { body })
      onSaved(out)
    } catch (e) {
      setErrors({ form: (e as ApiError).fieldErrors?.[0]?.message ?? (e as ApiError).message })
    } finally {
      setBusy(false)
    }
  }

  const setItem = (slot: (typeof SLOTS)[number], i: number, k: 'item' | 'portion', val: string) =>
    setV((x) => ({ ...x, meals: { ...x.meals, [slot]: x.meals[slot].map((m, j) => (j === i ? { ...m, [k]: val } : m)) } }))

  return (
    <Modal open={open} onClose={onClose} wide title={plan ? `Edit plan · v${plan.version} → v${plan.version + 1}` : 'New diet plan'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>{plan ? 'Save new version' : 'Create plan'}</Button></>}>
      <div className="space-y-4">
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] text-amber">Plans entered here are specialist-authored inputs for compatibility checking. CICD AI does not generate, approve or prescribe diets.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {!plan && <Field label="Case" error={errors.case_id}><Select value={v.case_id} onChange={(e) => setV({ ...v, case_id: e.target.value })}><option value="">Select…</option>{cases?.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.pseudonym}</option>)}</Select></Field>}
          <Field label="Plan title" error={errors.title}><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Heart-healthy plan" /></Field>
          <Field label="Source specialist" error={errors.specialist_name}><Input value={v.specialist_name} onChange={(e) => setV({ ...v, specialist_name: e.target.value })} placeholder="M. Iyer, RD" /></Field>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-2">Meal schedule</p>
          <div className="grid gap-3 md:grid-cols-2">
            {SLOTS.map((slot) => (
              <div key={slot} className="rounded-2xl border border-line bg-canvas/50 p-3">
                <div className="mb-2 flex items-center justify-between"><p className="text-[13px] font-bold capitalize text-ink">{slot}</p><button type="button" className="flex items-center gap-1 text-[12px] font-semibold text-primary-600" onClick={() => setV((x) => ({ ...x, meals: { ...x.meals, [slot]: [...x.meals[slot], { item: '', portion: '' }] } }))}><Plus className="size-3.5" />Add item</button></div>
                {v.meals[slot].length === 0 && <p className="text-[12px] text-ink-3">No items.</p>}
                <div className="space-y-1.5">
                  {v.meals[slot].map((m, i) => (
                    <div key={i} className="flex gap-1.5">
                      <Input className="h-9" placeholder="Food item" value={m.item} onChange={(e) => setItem(slot, i, 'item', e.target.value)} aria-label={`${slot} item ${i + 1}`} />
                      <Input className="h-9 w-28" placeholder="Portion" value={m.portion ?? ''} onChange={(e) => setItem(slot, i, 'portion', e.target.value)} aria-label={`${slot} portion ${i + 1}`} />
                      <button type="button" className="rounded-lg px-2 text-ink-3 hover:text-danger" onClick={() => setV((x) => ({ ...x, meals: { ...x.meals, [slot]: x.meals[slot].filter((_, j) => j !== i) } }))} aria-label="Remove item"><Trash2 className="size-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {errors.meals && <p className="mt-1 text-[12px] text-danger">{errors.meals}</p>}
        </div>
        <Field label="Dietary restrictions">
          <div className="flex gap-2"><Input value={newRestriction} onChange={(e) => setNewRestriction(e.target.value)} placeholder="e.g. Limit added salt" onKeyDown={(e) => { if (e.key === 'Enter' && newRestriction.trim()) { e.preventDefault(); setV({ ...v, restrictions: [...v.restrictions, newRestriction.trim()] }); setNewRestriction('') } }} /><Button type="button" variant="secondary" onClick={() => { if (newRestriction.trim()) { setV({ ...v, restrictions: [...v.restrictions, newRestriction.trim()] }); setNewRestriction('') } }}>Add</Button></div>
          <div className="mt-2 flex flex-wrap gap-1.5">{v.restrictions.map((r, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1 text-[12px] font-semibold text-primary-600">{r}<button type="button" onClick={() => setV({ ...v, restrictions: v.restrictions.filter((_, j) => j !== i) })} aria-label={`Remove ${r}`}>×</button></span>)}</div>
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nutrition notes"><Textarea rows={3} value={v.nutrition_notes} onChange={(e) => setV({ ...v, nutrition_notes: e.target.value })} /></Field>
          <Field label="Lifestyle recommendations"><Textarea rows={3} value={v.lifestyle_notes} onChange={(e) => setV({ ...v, lifestyle_notes: e.target.value })} /></Field>
        </div>
        {errors.form && <p className="text-[13px] font-medium text-danger" role="alert">{errors.form}</p>}
      </div>
    </Modal>
  )
}
