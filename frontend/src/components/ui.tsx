import { AnimatePresence, animate, motion, useInView, useReducedMotion } from 'motion/react'
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react'
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { CASE_STATUS, SEVERITY_META, TEST_STATUS, VALIDATION_META, cn } from '../lib/format'
import type { Severity } from '../lib/types'

/* ---------------- Button ---------------- */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger' | 'soft'
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-primary text-white shadow-[0_6px_16px_-6px_rgba(65,105,245,.7)] hover:bg-primary-600',
  secondary: 'bg-white text-ink border border-line-2 hover:border-primary/40 hover:text-primary-600',
  ghost: 'text-ink-2 hover:bg-primary-50 hover:text-primary-600',
  dark: 'bg-navy text-white hover:bg-navy-800 shadow-[0_8px_20px_-10px_rgba(17,26,56,.8)]',
  danger: 'bg-danger text-white hover:bg-[#b42f2f]',
  soft: 'bg-primary-50 text-primary-600 hover:bg-[#e2e9ff]',
}
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: ReactNode
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  const sz = size === 'sm' ? 'h-8 px-3 text-[13px] gap-1.5' : size === 'lg' ? 'h-12 px-6 text-[15px] gap-2' : 'h-10 px-4 text-sm gap-2'
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold transition-all duration-200 active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        sz,
        BTN[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
})

/* ---------------- Card ---------------- */
export function Card({ className, children, hover, ...rest }: { className?: string; children: ReactNode; hover?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', hover && 'card-hover', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="flex items-start gap-3 min-w-0">
        {icon && <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary">{icon}</div>}
        <div className="min-w-0">
          <h3 className="display text-[22px] leading-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

/* ---------------- Badges ---------------- */
export function Badge({ children, className, dot }: { children: ReactNode; className?: string; dot?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ring-transparent whitespace-nowrap', className ?? 'bg-slate-100 text-ink-2')}>
      {dot && <span className="size-1.5 rounded-full" style={{ background: dot }} aria-hidden />}
      {children}
    </span>
  )
}

export function SeverityBadge({ severity, full }: { severity: Severity; full?: boolean }) {
  const m = SEVERITY_META[severity]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold whitespace-nowrap', m.bg, m.text, severity === 'uncertain' && 'hatch')}
      title={m.label}
    >
      {severity === 'critical' || severity === 'high' ? <AlertTriangle className="size-3" aria-hidden /> : severity === 'uncertain' ? <Info className="size-3" aria-hidden /> : <span className="size-1.5 rounded-full" style={{ background: m.color }} aria-hidden />}
      {full ? m.label : m.short}
    </span>
  )
}

export function ValidationBadge({ status }: { status: string }) {
  const m = VALIDATION_META[status] ?? { label: status, cls: 'bg-slate-100 text-ink-2' }
  return <Badge className={cn(m.cls, 'ring-1')}>{m.label}</Badge>
}

export function StatusBadge({ status }: { status: string }) {
  const m = CASE_STATUS[status] ?? { label: status, cls: 'bg-slate-100 text-ink-2' }
  return <Badge className={m.cls}>{m.label}</Badge>
}

export function TestBadge({ status }: { status: string }) {
  const m = TEST_STATUS[status] ?? TEST_STATUS.not_run
  const Icon = status === 'pass' ? CheckCircle2 : status === 'fail' ? XCircle : status === 'needs_review' ? AlertTriangle : null
  return (
    <Badge className={cn(m.cls, 'ring-1')}>
      {Icon && <Icon className="size-3" aria-hidden />}
      {m.label}
    </Badge>
  )
}

export function SourceTag({ kind }: { kind: 'rule' | 'evidence' | 'llm' | 'human' }) {
  const map = {
    rule: ['Deterministic rule', 'bg-navy text-white'],
    evidence: ['Retrieved evidence', 'bg-cyan/15 text-[#0b7f8c]'],
    llm: ['LLM-generated', 'bg-lavender/20 text-[#5b47c9]'],
    human: ['Human decision', 'bg-mint-50 text-mint'],
  } as const
  const [label, cls] = map[kind]
  return <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', cls)}>{label}</span>
}

/* ---------------- Form controls ---------------- */
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-[12px] font-medium text-danger" role="alert">{error}</p> : hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  )
}

const inputCls =
  'w-full rounded-xl border border-line-2 bg-white px-3.5 text-sm text-ink placeholder:text-ink-3/70 transition focus:border-primary focus:ring-4 focus:ring-primary/10 focus:outline-none disabled:bg-slate-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputCls, 'h-10', className)} {...rest} />
})
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputCls, 'py-2.5 leading-relaxed', className)} {...rest} />
})
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(inputCls, 'h-10 pr-8 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%278%27%3E%3Cpath d=%27M1 1l5 5 5-5%27 stroke=%27%237b86a3%27 stroke-width=%271.6%27 fill=%27none%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[right_12px_center] bg-no-repeat', className)} {...rest}>
      {children}
    </select>
  )
})

/* ---------------- Modal ---------------- */
export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={id}
            className={cn('relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl', wide ? 'sm:max-w-4xl' : 'sm:max-w-lg')}
            initial={{ y: 30, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 id={id} className="display text-2xl text-ink">{title}</h2>
              <button onClick={onClose} className="rounded-full p-1.5 text-ink-3 hover:bg-slate-100" aria-label="Close dialog">
                <X className="size-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line bg-slate-50/60 px-6 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------------- Tabs ---------------- */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  const id = useId()
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-white p-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn('relative rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors', value === it.value ? 'text-white' : 'text-ink-2 hover:text-primary-600')}
        >
          {value === it.value && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-full bg-navy" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
          <span className="relative flex items-center gap-1.5">
            {it.label}
            {it.count !== undefined && <span className={cn('num rounded-full px-1.5 text-[11px]', value === it.value ? 'bg-white/20' : 'bg-slate-100')}>{it.count}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}

/* ---------------- Loading / empty ---------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} aria-hidden />
}

export function PageSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  )
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="relative mb-4 grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-primary-50 to-[#efeaff] text-primary">
        <div className="absolute inset-0 rounded-2xl ring-1 ring-primary/10" />
        {icon}
      </div>
      <h3 className="display text-2xl text-ink">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-sm text-ink-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: { message: string } | null; onRetry?: () => void }) {
  return (
    <div className="card flex items-start gap-3 border-danger/20 bg-danger-50/50 p-5" role="alert">
      <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />
      <div className="flex-1">
        <p className="font-semibold text-ink">Something went wrong</p>
        <p className="text-sm text-ink-2">{error?.message ?? 'Unknown error'}</p>
      </div>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

/* ---------------- Page header ---------------- */
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="label-xs mb-1.5 flex items-center gap-2">{eyebrow}</div>}
        <h1 className="display text-[34px] leading-[1.05] text-ink sm:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[14px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function DemoChip({ children = 'Synthetic demo data' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/30 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber">
      <span className="size-1.5 rounded-full bg-amber" aria-hidden />
      {children}
    </span>
  )
}

/* ---------------- Count-up ---------------- */
export function CountUp({ value, decimals = 0, suffix = '', className }: { value: number; decimals?: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = ref.current
    if (!el || !inView) return
    if (reduce) {
      el.textContent = value.toFixed(decimals) + suffix
      return
    }
    const ctl = animate(0, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (el.textContent = v.toFixed(decimals) + suffix),
    })
    return () => ctl.stop()
  }, [value, decimals, suffix, inView, reduce])
  return (
    <span ref={ref} className={cn('num', className)}>
      {(0).toFixed(decimals)}
      {suffix}
    </span>
  )
}

/* ---------------- Confidence ring ---------------- */
export function Ring({ value, size = 56, stroke = 6, color = '#4169f5', label, children }: { value: number | null; size?: number; stroke?: number; color?: string; label?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = value === null ? 0 : Math.max(0, Math.min(1, value))
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label ?? (value === null ? 'Undefined' : `${Math.round(v * 100)} percent`)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e8edf9" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children ?? <span className="num text-[12px] font-bold text-ink">{value === null ? '—' : `${Math.round(v * 100)}%`}</span>}</div>
    </div>
  )
}

/* ---------------- Toasts ---------------- */
type Toast = { id: number; kind: 'success' | 'error' | 'info'; title: string; body?: string }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random()
    setToasts((x) => [...x, { ...t, id }])
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4800)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-lift)]"
            >
              {t.kind === 'success' ? <CheckCircle2 className="size-5 text-mint" /> : t.kind === 'error' ? <XCircle className="size-5 text-danger" /> : <Info className="size-5 text-primary" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[13px] text-ink-2">{t.body}</p>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  return useContext(ToastCtx)
}

/* ---------------- Misc ---------------- */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <p className="label-xs">{label}</p>
      <p className="num mt-1 text-xl font-bold text-ink">{value}</p>
      {sub && <p className="text-[12px] text-ink-3">{sub}</p>}
    </div>
  )
}

export function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 last:border-0">
      <span className="text-[13px] text-ink-3">{k}</span>
      <span className={cn('text-right text-[13px] font-semibold text-ink', mono && 'font-mono font-medium')}>{v}</span>
    </div>
  )
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-xl border border-line bg-white/70 px-3 py-2 text-[12px] text-ink-3', className)}>
      <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
      Research prototype for clinical decision support. Findings are candidate conflicts for qualified clinician review — not diagnoses, prescriptions or treatment advice.
    </p>
  )
}
