import { AnimatePresence, motion } from 'motion/react'
import {
  Activity,
  Apple,
  BarChart3,
  Bell,
  BookOpen,
  ClipboardCheck,
  FileBarChart,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Pill,
  ScrollText,
  Search,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { DemoChip } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/format'

type Item = { to: string; label: string; icon: ComponentType<{ className?: string }>; badge?: 'queue' }
const NAV: { group: string; items: Item[] }[] = [
  { group: 'Workspace', items: [
    { to: '/app', label: 'Overview', icon: LayoutDashboard },
    { to: '/app/cases', label: 'Patients / Demo Cases', icon: Users },
    { to: '/app/notes', label: 'Specialist Notes', icon: FileText },
    { to: '/app/analysis', label: 'Conflict Analysis', icon: Activity },
    { to: '/app/diet-plans', label: 'Diet Plans', icon: Apple },
    { to: '/app/medications', label: 'Medication Review', icon: Pill },
  ] },
  { group: 'Knowledge', items: [
    { to: '/app/graph', label: 'Knowledge Graph', icon: Network },
    { to: '/app/guidelines', label: 'Guideline Library', icon: BookOpen },
  ] },
  { group: 'Quality', items: [
    { to: '/app/validation', label: 'Validation Queue', icon: ClipboardCheck, badge: 'queue' },
    { to: '/app/tests', label: 'Test Sessions', icon: FlaskConical },
    { to: '/app/evaluation', label: 'Evaluation & Metrics', icon: BarChart3 },
    { to: '/app/reports', label: 'Reports', icon: FileBarChart },
    { to: '/app/audit', label: 'Audit Logs', icon: ScrollText },
    { to: '/app/settings', label: 'Settings', icon: Settings },
  ] },
]

function Sidebar({ queue, onNavigate }: { queue: number; onNavigate?: () => void }) {
  return (
    <nav className="flex h-full flex-col" aria-label="Main">
      <Link to="/" className="px-5 pt-5 pb-6" onClick={onNavigate}><Logo /></Link>
      <div className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV.map((g) => (
          <div key={g.group}>
            <p className="label-xs px-3 pb-1.5">{g.group}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.to === '/app'}
                    onClick={onNavigate}
                    className={({ isActive }) => cn('group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-semibold transition-colors', isActive ? 'text-white' : 'text-ink-2 hover:bg-white hover:text-ink')}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-navy shadow-[0_8px_18px_-10px_rgba(17,26,56,.9)]" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
                        <it.icon className={cn('relative size-[18px]', isActive ? 'text-sky' : 'text-ink-3 group-hover:text-primary')} />
                        <span className="relative flex-1">{it.label}</span>
                        {it.badge === 'queue' && queue > 0 && <span className={cn('num relative rounded-full px-1.5 text-[11px] font-bold', isActive ? 'bg-white/20 text-white' : 'bg-primary text-white')}>{queue}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="m-3 rounded-2xl border border-line bg-white p-3 text-[11.5px] leading-snug text-ink-3">
        <DemoChip>Local demonstration mode</DemoChip>
        <p className="mt-1.5">Research prototype · synthetic, fictional cases only.</p>
      </div>
    </nav>
  )
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [queue, setQueue] = useState(0)
  const [high, setHigh] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const [menu, setMenu] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    let alive = true
    const load = () =>
      api<{ items: { severity: string }[] }>('/validation/queue')
        .then((d) => {
          if (!alive) return
          setQueue(d.items.length)
          setHigh(d.items.filter((i) => i.severity === 'critical' || i.severity === 'high').length)
        })
        .catch(() => {})
    load()
    const t = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [loc.pathname])

  useEffect(() => setMenu(false), [loc.pathname])

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-[#eef2fc]/70 lg:block no-print"><Sidebar queue={queue} /></aside>
      <AnimatePresence>
        {drawer && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-navy/40" onClick={() => setDrawer(false)} />
            <motion.aside className="absolute inset-y-0 left-0 w-[280px] bg-[#eef2fc]" initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
              <button className="absolute right-3 top-5 rounded-full p-1.5 text-ink-3 hover:bg-white" onClick={() => setDrawer(false)} aria-label="Close menu"><X className="size-5" /></button>
              <Sidebar queue={queue} onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-line/80 bg-canvas/80 backdrop-blur-xl no-print">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button className="rounded-xl p-2 text-ink-2 hover:bg-white lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu className="size-5" /></button>
            <div className="hidden min-w-0 md:block">
              <p className="truncate text-[12px] font-extrabold uppercase tracking-[0.14em] text-ink">Cross-Instruction Conflict Detector</p>
              <p className="truncate text-[11.5px] text-ink-3">AI-assisted analysis of cross-specialist clinical instructions.</p>
            </div>
            <form className="ml-auto flex max-w-xs flex-1 items-center gap-2 rounded-full border border-line bg-white px-3.5 h-10" onSubmit={(e) => { e.preventDefault(); if (q.trim()) nav(`/app/cases?q=${encodeURIComponent(q.trim())}`) }} role="search">
              <Search className="size-4 text-ink-3" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases…" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-3" aria-label="Search cases" />
            </form>
            <Link to="/app/validation" className="relative grid size-10 place-items-center rounded-full border border-line bg-white text-ink-2 hover:text-primary" aria-label={`${queue} findings awaiting review`}>
              <Bell className="size-[18px]" />
              {queue > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid size-[18px] place-items-center">
                  {high > 0 && <span className="absolute inset-0 animate-ping rounded-full bg-danger/60" />}
                  <span className={cn('num relative grid size-[18px] place-items-center rounded-full text-[10px] font-bold text-white', high > 0 ? 'bg-danger' : 'bg-primary')}>{queue > 9 ? '9+' : queue}</span>
                </span>
              )}
            </Link>
            <div className="relative">
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3" aria-haspopup="menu" aria-expanded={menu}>
                <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-primary to-lavender text-[12px] font-bold text-white">{user?.full_name.split(' ').map((w) => w[0]).filter((c) => /[A-Z]/.test(c)).slice(0, 2).join('')}</span>
                <span className="hidden text-left sm:block">
                  <span className="block text-[12.5px] font-semibold leading-tight text-ink">{user?.full_name}</span>
                  <span className="block text-[11px] capitalize leading-tight text-ink-3">{user?.role === 'admin' ? 'Administrator' : 'Clinician / reviewer'}</span>
                </span>
              </button>
              <AnimatePresence>
                {menu && (
                  <motion.div role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="absolute right-0 mt-2 w-56 rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)]">
                    <p className="truncate px-3 py-2 text-[12px] text-ink-3">{user?.email}</p>
                    <Link to="/app/settings" className="block rounded-xl px-3 py-2 text-sm text-ink-2 hover:bg-primary-50" role="menuitem">Settings</Link>
                    <button role="menuitem" onClick={async () => { await logout(); nav('/login') }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-danger hover:bg-danger-50"><LogOut className="size-4" /> Sign out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.main key={loc.pathname} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  )
}
