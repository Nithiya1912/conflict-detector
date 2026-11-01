import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CATEGORY_COLORS, SEVERITY_META, cn, pct } from '../lib/format'
import type { Severity } from '../lib/types'

const AXIS = { fontSize: 11, fill: '#7b86a3' }
const GRID = '#e8edf7'

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-[12px] shadow-[var(--shadow-lift)]">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-ink-2">
          {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} />}
          <span>{r.label}</span>
          <span className="num ml-auto pl-3 font-semibold text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  )
}

/** Horizontal bars for categories; value labels at bar end (identity + exact value never color-only). */
export function CategoryBars({ data, onSelect, height = 250 }: { data: { category: string; count: number; core?: boolean }[]; onSelect?: (c: string) => void; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 36, top: 4, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="category" width={128} tick={{ ...AXIS, fill: '#4a5677' }} axisLine={false} tickLine={false}
          tickFormatter={(v: string) => (data.find((d) => d.category === v)?.core === false ? `${v} ·ext` : v)} />
        <Tooltip cursor={{ fill: 'rgba(65,105,245,.06)' }} content={({ active, payload }) => active && payload?.[0] ? (
          <TipBox title={String(payload[0].payload.category)} rows={[{ label: 'Findings', value: String(payload[0].value), color: CATEGORY_COLORS[payload[0].payload.category] }, { label: 'Scope', value: payload[0].payload.core === false ? 'Extension' : 'Core (proposal)' }]} />
        ) : null} />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fontSize: 11, fontWeight: 700, fill: '#17213b' }} onClick={(d) => onSelect?.((d as unknown as { category: string }).category)} className={onSelect ? 'cursor-pointer' : ''} animationDuration={900}>
          {data.map((d) => <Cell key={d.category} fill={CATEGORY_COLORS[d.category]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Severity is ordered, so bars keep severity order; status colours with labels. */
export function SeverityBars({ data, onSelect, height = 220 }: { data: { severity: Severity; count: number }[]; onSelect?: (s: Severity) => void; height?: number }) {
  const rows = data.map((d) => ({ ...d, label: SEVERITY_META[d.severity].short }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ left: -18, right: 8, top: 18, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={{ ...AXIS, fill: '#4a5677' }} axisLine={{ stroke: '#d3dbef' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(65,105,245,.06)' }} content={({ active, payload }) => active && payload?.[0] ? (
          <TipBox title={SEVERITY_META[payload[0].payload.severity as Severity].label} rows={[{ label: 'Findings', value: String(payload[0].value), color: SEVERITY_META[payload[0].payload.severity as Severity].color }]} />
        ) : null} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={44} label={{ position: 'top', fontSize: 11, fontWeight: 700, fill: '#17213b' }} onClick={(d) => onSelect?.((d as unknown as { severity: Severity }).severity)} className={onSelect ? 'cursor-pointer' : ''} animationDuration={900}>
          {rows.map((d) => <Cell key={d.severity} fill={SEVERITY_META[d.severity].color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function TrendArea({ data, height = 220 }: { data: { date: string; analyses: number; findings: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ left: -18, right: 8, top: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="ta-f" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4169f5" stopOpacity={0.28} />
            <stop offset="1" stopColor="#4169f5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" tick={AXIS} axisLine={{ stroke: '#d3dbef' }} tickLine={false} interval={6}
          tickFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })} />
        <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ stroke: '#4169f5', strokeDasharray: '3 3' }} content={({ active, payload }) => active && payload?.length ? (
          <TipBox title={new Date(String(payload[0].payload.date)).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })}
            rows={[{ label: 'Findings produced', value: String(payload[0].payload.findings), color: '#4169f5' }, { label: 'Analyses completed', value: String(payload[0].payload.analyses) }]} />
        ) : null} />
        <Area type="monotone" dataKey="findings" stroke="#4169f5" strokeWidth={2} fill="url(#ta-f)" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} animationDuration={1200} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

const METRIC_COLORS = { precision: '#4169f5', recall: '#eb6834', f1: '#1baf7a' }

/** Grouped bars: metric per configuration. Undefined metrics render as gaps and are named in the tooltip. */
export function MetricGroups({ data, height = 280 }: { data: { name: string; precision: number | null; recall: number | null; f1: number | null }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: -12, right: 8, top: 22, bottom: 0 }} barGap={2} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="name" tick={{ ...AXIS, fill: '#4a5677' }} axisLine={{ stroke: '#d3dbef' }} tickLine={false} interval={0} />
        <YAxis domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={AXIS} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'rgba(65,105,245,.06)' }} content={({ active, payload }) => active && payload?.length ? (
          <TipBox title={String(payload[0].payload.name)} rows={(['precision', 'recall', 'f1'] as const).map((k) => ({
            label: k === 'f1' ? 'F1-score' : k[0].toUpperCase() + k.slice(1), value: pct(payload[0].payload[k], 1), color: METRIC_COLORS[k] }))} />
        ) : null} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 6 }} formatter={(v: string) => <span className="text-ink-2">{v === 'f1' ? 'F1-score' : v[0].toUpperCase() + v.slice(1)}</span>} />
        {(['precision', 'recall', 'f1'] as const).map((k) => (
          <Bar key={k} dataKey={k} fill={METRIC_COLORS[k]} radius={[4, 4, 0, 0]} maxBarSize={22} animationDuration={900}>
            {k === 'f1' && <LabelList dataKey="f1" position="top" formatter={(v: unknown) => (v === null || v === undefined ? 'n/a' : `${Math.round(Number(v) * 100)}%`)} style={{ fontSize: 10.5, fontWeight: 700, fill: '#17213b' }} />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ConfusionMatrix({ m }: { m: { tp: number; fp: number; fn: number; tn: number } }) {
  const max = Math.max(m.tp, m.fp, m.fn, m.tn, 1)
  const cell = (label: string, v: number, good: boolean) => (
    <div className="relative grid place-items-center rounded-xl border border-line p-3 text-center" style={{ background: `rgba(${good ? '65,105,245' : '224,96,63'},${0.06 + (v / max) * 0.32})` }}>
      <div>
        <div className="num text-2xl font-bold text-ink">{v}</div>
        <div className="text-[11px] font-semibold text-ink-2">{label}</div>
      </div>
    </div>
  )
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-[12px]">
      <div />
      <div className="label-xs text-center">Predicted: conflict</div>
      <div className="label-xs text-center">Predicted: none</div>
      <div className="label-xs flex items-center [writing-mode:vertical-rl] rotate-180 justify-center">Expected: conflict</div>
      {cell('True positive', m.tp, true)}
      {cell('False negative', m.fn, false)}
      <div className="label-xs flex items-center [writing-mode:vertical-rl] rotate-180 justify-center">Expected: none</div>
      {cell('False positive', m.fp, false)}
      {cell('True negative', m.tn, true)}
    </div>
  )
}

export function LegendList({ items, className }: { items: { label: string; color: string; value?: number | string; hatch?: boolean }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-[12px]', className)}>
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-ink-2">
          <span className={cn('size-2.5 rounded-sm', i.hatch && 'hatch')} style={{ background: i.color }} aria-hidden />
          {i.label}
          {i.value !== undefined && <span className="num font-semibold text-ink">{i.value}</span>}
        </li>
      ))}
    </ul>
  )
}
