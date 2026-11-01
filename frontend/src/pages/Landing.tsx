import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Eye,
  FileSearch,
  FlaskConical,
  GitBranch,
  Lock,
  Network,
  Pill,
  ScanText,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo, LogoMark } from '../components/Logo'
import { Button } from '../components/ui'
import { useAuth } from '../lib/auth'
import { CATEGORY_COLORS } from '../lib/format'

const SOURCES = [
  { spec: 'Cardiology', text: 'Continue warfarin 5 mg daily.', color: '#4169f5', y: 40 },
  { spec: 'Nutrition', text: 'Increase spinach and kale daily.', color: '#1baf7a', y: 130 },
  { spec: 'Nephrology', text: 'Restrict potassium.', color: '#7b5cd6', y: 220 },
  { spec: 'Orthopaedics', text: 'Start ibuprofen 400 mg TID.', color: '#eb6834', y: 310 },
]

function HeroVisual() {
  const reduce = useReducedMotion()
  return (
    <div className="relative mx-auto w-full max-w-[620px]">
      <svg viewBox="0 0 620 400" className="w-full" aria-label="Four specialist instructions flow into one analysis engine, which outputs a flagged cross-instruction conflict">
        <defs>
          <radialGradient id="orb" cx="50%" cy="45%" r="60%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".35" stopColor="#a8d8ff" />
            <stop offset="1" stopColor="#4169f5" />
          </radialGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="8" /></filter>
        </defs>
        {SOURCES.map((s, i) => {
          const d = `M 200 ${s.y + 22} C 260 ${s.y + 22}, 260 200, 330 200`
          return (
            <g key={s.spec}>
              <path d={d} stroke="white" strokeOpacity=".55" strokeWidth="1.5" fill="none" strokeDasharray="3 5" />
              {!reduce && (
                <circle r="4" fill={s.color}>
                  <animateMotion dur={`${2.4 + i * 0.35}s`} repeatCount="indefinite" path={d} begin={`${i * 0.4}s`} />
                </circle>
              )}
            </g>
          )
        })}
        <path d="M 410 200 C 450 200, 450 200, 470 200" stroke="white" strokeOpacity=".7" strokeWidth="2" fill="none" />
        {!reduce && (
          <circle r="5" fill="#ff8a66">
            <animateMotion dur="1.6s" repeatCount="indefinite" path="M 410 200 L 470 200" />
          </circle>
        )}
        <circle cx="370" cy="200" r="58" fill="#4169f5" opacity=".45" filter="url(#glow)" />
        <motion.circle cx="370" cy="200" r="46" fill="url(#orb)" animate={reduce ? undefined : { r: [44, 48, 44] }} transition={{ duration: 3, repeat: Infinity }} />
        <circle cx="370" cy="200" r="62" stroke="white" strokeOpacity=".35" fill="none" strokeDasharray="2 6" >
          {!reduce && <animateTransform attributeName="transform" type="rotate" from="0 370 200" to="360 370 200" dur="24s" repeatCount="indefinite" />}
        </circle>
        <text x="370" y="196" textAnchor="middle" fontSize="11" fontWeight="800" fill="#111a38" letterSpacing="1.5">CICD</text>
        <text x="370" y="211" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#111a38" opacity=".75">ENGINE</text>
      </svg>
      {SOURCES.map((s, i) => (
        <motion.div
          key={s.spec}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 + i * 0.12 }}
          className="glass absolute left-0 w-[33%] rounded-2xl px-3 py-2 shadow-lg"
          style={{ top: `${(s.y / 400) * 100}%` }}
        >
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: s.color }}>
            <span className="size-1.5 rounded-full" style={{ background: s.color }} />{s.spec}
          </p>
          <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-ink">{s.text}</p>
        </motion.div>
      ))}
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.1, type: 'spring' }} className="absolute right-0 top-[30%] w-[36%] rounded-2xl bg-white p-3 shadow-[0_20px_50px_-20px_rgba(17,26,56,.6)] float-y">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-coral-50 px-2 py-0.5 text-[10px] font-bold text-coral">High</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-ink-2">Drug–Drug</span>
        </div>
        <p className="mt-1.5 text-[12px] font-bold leading-snug text-ink">Anticoagulant + NSAID across two notes</p>
        <p className="mt-1 text-[10.5px] leading-snug text-ink-3">Cardiology ↔ Orthopaedics · evidence attached · awaiting clinician review</p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100"><motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: '78%' }} transition={{ delay: 1.4, duration: 1 }} /></div>
      </motion.div>
    </div>
  )
}

function NetworkViz() {
  const reduce = useReducedMotion()
  const nodes = [
    { x: 80, y: 90, c: '#4169f5', l: 'warfarin' }, { x: 230, y: 50, c: '#0e9fb5', l: 'vitamin K antagonist' },
    { x: 380, y: 110, c: '#1baf7a', l: 'spinach' }, { x: 300, y: 210, c: '#d03b3b', l: 'Conflict' },
    { x: 140, y: 230, c: '#eb6834', l: 'ibuprofen' }, { x: 470, y: 220, c: '#c27c00', l: 'Evidence' },
    { x: 520, y: 70, c: '#7b5cd6', l: 'bed rest' }, { x: 60, y: 300, c: '#111a38', l: 'Cardiology note' },
  ]
  const links = [[0, 1], [2, 1], [0, 3], [2, 3], [4, 3], [5, 3], [7, 0], [7, 4], [6, 5], [0, 4]]
  return (
    <svg viewBox="0 0 580 330" className="w-full" role="img" aria-label="Illustrative knowledge graph linking medications, foods, classes, evidence and a conflict">
      {links.map(([a, b], i) => (
        <motion.line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={b === 3 ? '#d03b3b' : '#9fb3e8'} strokeWidth={b === 3 ? 1.8 : 1.2}
          initial={{ pathLength: 0, opacity: 0 }} whileInView={{ pathLength: 1, opacity: 0.8 }} viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.6 }} />
      ))}
      {nodes.map((n, i) => (
        <g key={n.l}>
          {!reduce && <motion.circle cx={n.x} cy={n.y} r={14} fill={n.c} opacity={0.15} animate={{ r: [12, 20, 12], opacity: [0.25, 0, 0.25] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.3 }} />}
          <motion.circle cx={n.x} cy={n.y} r={9} fill={n.c} initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 + i * 0.06, type: 'spring' }} style={{ originX: `${n.x}px`, originY: `${n.y}px` }} />
          <text x={n.x} y={n.y + 24} textAnchor="middle" fontSize="11" fontWeight="600" fill="#4a5677">{n.l}</text>
        </g>
      ))}
    </svg>
  )
}

const PIPE = [
  { icon: ScanText, t: 'NLP extraction', d: 'Medication, diet and lifestyle instructions are pulled from free-text notes with dose, timing and source spans. Missing values stay “Not specified”.' },
  { icon: Network, t: 'Knowledge Graph', d: 'Entities map to drug classes and nutrients (e.g. spinach → vitamin K), so related instructions meet even when written differently.' },
  { icon: FileSearch, t: 'Retrieval-augmented evidence', d: 'Each candidate relation retrieves guideline passages from a vector index. Retrieval scores are shown for what they are: relevance, not truth.' },
  { icon: Brain, t: 'Generative reasoning', d: 'When configured, an LLM writes auditable explanations and flags extra candidates — always as “uncertain”, never setting severity.' },
]

export default function Landing() {
  const { user } = useAuth()
  return (
    <div className="min-h-screen bg-canvas">
      <section className="hero-sky relative overflow-hidden">
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <header className="relative mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Logo light />
          <nav className="hidden items-center gap-1 rounded-full border border-white/40 bg-white/15 p-1 backdrop-blur md:flex" aria-label="Sections">
            {[['#pipeline', 'Pipeline'], ['#categories', 'Conflicts'], ['#trust', 'Explainability'], ['#privacy', 'Privacy'], ['#evaluation', 'Evaluation']].map(([h, l]) => (
              <a key={h} href={h} className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-white/90 hover:bg-white/20">{l}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {!user && <Link to="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 sm:block">Sign in</Link>}
            <Link to="/app"><Button variant="dark" size="sm">Launch Dashboard</Button></Link>
          </div>
        </header>

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-24 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/20 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] text-white backdrop-blur">
              <Sparkles className="size-3.5" /> Cross-Instruction Conflict Detector
            </motion.p>
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="display mt-5 text-[46px] leading-[1.02] text-white sm:text-[64px]">
              Each instruction was right.<br /><span className="italic text-navy">Together</span>, they weren’t.
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-5 max-w-xl text-[16px] leading-relaxed text-white/90">
              <b>Detecting Silent Drug–Diet–Lifestyle Conflicts in Multi-Specialist Patient Care Using Generative AI.</b> CICD AI reads notes from every specialist involved in a patient’s care and surfaces the instructions that cannot safely be followed together, with the evidence behind each flag.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8 flex flex-wrap gap-3">
              <Link to="/app"><Button size="lg" variant="dark" icon={<ArrowRight className="size-4" />}>Launch Dashboard</Button></Link>
              <Link to="/login?demo=1"><Button size="lg" variant="secondary" className="border-white/60 bg-white/85">Explore Demo</Button></Link>
            </motion.div>
            <p className="mt-5 text-[12px] font-medium text-white/80">Research prototype · synthetic case data · clinician review required for every finding</p>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section id="pipeline" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <p className="label-xs">How it works</p>
        <h2 className="display mt-2 max-w-3xl text-[40px] leading-tight text-ink">Four complementary layers, one auditable trace.</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {PIPE.map((p, i) => (
            <motion.div key={p.t} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="card card-hover relative p-6">
              <span className="absolute right-5 top-5 font-mono text-[12px] text-ink-3">0{i + 1}</span>
              <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-primary to-lavender text-white"><p.icon className="size-5" /></div>
              <h3 className="mt-5 text-[17px] font-bold text-ink">{p.t}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{p.d}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-8 grid items-center gap-8 rounded-[28px] bg-navy p-8 text-white lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="label-xs !text-sky">Knowledge graph</p>
            <h3 className="display mt-2 text-[32px] leading-tight">Relationships, not keyword matches.</h3>
            <p className="mt-3 text-[14px] leading-relaxed text-white/75">A medication in one note and a food in another are linked through classes and nutrients stored in the graph. That is how the system notices that “increase spinach” and “continue warfarin” belong in the same conversation.</p>
          </div>
          <div className="rounded-2xl bg-white p-3"><NetworkViz /></div>
        </div>
      </section>

      <section id="categories" className="bg-white py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <p className="label-xs">Conflict categories</p>
          <h2 className="display mt-2 text-[40px] leading-tight text-ink">Beyond drug–drug checking.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { c: 'Drug–Drug', icon: Pill, ex: 'Warfarin from cardiology + ibuprofen from orthopaedics', d: 'Interacting medicines prescribed by different specialists who never saw each other’s list.' },
              { c: 'Drug–Diet', icon: FlaskConical, ex: 'Simvastatin + “grapefruit is a good snack”', d: 'Dietary advice that changes how a prescribed medicine behaves — buried in free-text notes.' },
              { c: 'Diet–Diet', icon: GitBranch, ex: '“Restrict potassium” vs “eat a banana every day”', d: 'Two dietary targets that pull in opposite directions on the same nutrient.' },
            ].map((x, i) => (
              <motion.div key={x.c} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="card card-hover overflow-hidden">
                <div className="h-1.5" style={{ background: CATEGORY_COLORS[x.c] }} />
                <div className="p-6">
                  <x.icon className="size-6" style={{ color: CATEGORY_COLORS[x.c] }} />
                  <h3 className="display mt-3 text-[28px] text-ink">{x.c}</h3>
                  <p className="mt-2 text-[13.5px] text-ink-2">{x.d}</p>
                  <p className="mt-4 rounded-xl bg-canvas px-3 py-2 text-[12.5px] font-medium text-ink">{x.ex}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <p className="mt-6 text-[13px] text-ink-3">Core categories from the project proposal. The prototype also explores <b>extension</b> categories — Drug–Lifestyle, Diet–Lifestyle, Lifestyle–Lifestyle and duplicate/contradictory instructions — and labels them as extensions everywhere they appear.</p>
        </div>
      </section>

      <section id="trust" className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2">
        <div>
          <p className="label-xs">Explainability & human review</p>
          <h2 className="display mt-2 text-[40px] leading-tight text-ink">Every flag shows its work.</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">A ten-step trace links each finding to the exact sentences, the extracted entities, the rule and graph path that matched, the retrieved passages and the severity and confidence calculations. Each step is labelled as a deterministic rule, retrieved evidence, an LLM output or a human decision.</p>
          <ul className="mt-6 space-y-3">
            {[
              [Eye, 'Severity and confidence are computed separately by a documented policy — the model never assigns severity.'],
              [UserCheck, 'Clinicians confirm, reject, mark uncertain or request clarification. Decisions are appended, never overwritten.'],
              [BookOpenCheck, 'High-severity flags without supporting evidence are downgraded to “Uncertain / Insufficient Evidence”.'],
            ].map(([I, t], i) => {
              const Icon = I as typeof Eye
              return <li key={i} className="flex gap-3 text-[14px] text-ink-2"><Icon className="mt-0.5 size-5 shrink-0 text-primary" />{t as string}</li>
            })}
          </ul>
        </div>
        <div className="card p-6">
          {['Source instruction A', 'Source instruction B', 'Extracted entities', 'Matched rule / KG path', 'Retrieved evidence', 'Relevance & limitations', 'Conflict reasoning', 'Severity calculation', 'Confidence calculation', 'Human validation'].map((s, i) => (
            <motion.div key={s} initial={{ opacity: 0, x: 12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              <span className="grid size-7 place-items-center rounded-full bg-navy text-[11px] font-bold text-white">{i + 1}</span>
              <span className="text-[14px] font-semibold text-ink">{s}</span>
              <span className="ml-auto text-[10.5px] font-bold uppercase tracking-wider text-ink-3">{i < 2 ? 'input' : i === 4 || i === 5 ? 'evidence' : i === 6 ? 'rule + LLM' : i === 9 ? 'human' : 'rule'}</span>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="privacy" className="bg-navy py-20 text-white">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <p className="label-xs !text-sky">Privacy by design</p>
          <h2 className="display mt-2 max-w-3xl text-[40px] leading-tight">Built for sensitive data, demonstrated on synthetic data.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-4">
            {[
              [ShieldCheck, 'De-identification', 'Emails, phone numbers, record IDs, dates and names are scrubbed from every note before storage.'],
              [Lock, 'Access control', 'Role-based access for clinicians and administrators, httpOnly sessions and CSRF protection.'],
              [ClipboardCheck, 'Audit trail', 'Every state-changing action is logged with actor and timestamp.'],
              [Database, 'Data minimisation', 'Only de-identified text reaches an LLM provider, and only when one is configured.'],
            ].map(([I, t, d]) => {
              const Icon = I as typeof Lock
              return (
                <div key={t as string} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <Icon className="size-5 text-sky" />
                  <h3 className="mt-3 font-bold">{t as string}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/70">{d as string}</p>
                </div>
              )
            })}
          </div>
          <p className="mt-6 text-[12.5px] text-white/60">Design aligned with HIPAA / DPDP principles. This prototype has not been certified for either and must not be used with real patient data.</p>
        </div>
      </section>

      <section id="evaluation" className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="label-xs">Research evaluation</p>
            <h2 className="display mt-2 text-[40px] leading-tight text-ink">Measured, not asserted.</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Twenty synthetic case scenarios — modelled on clinical-note phrasing — are executed by the real pipeline. Precision, recall and F1 are computed from recorded outcomes, with undefined values shown as undefined rather than rounded up.</p>
            <Link to="/app/evaluation" className="mt-6 inline-block"><Button variant="soft" icon={<ArrowRight className="size-4" />}>See live metrics</Button></Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {['Single-document baseline', 'Cross-document without Knowledge Graph', 'Cross-document without RAG', 'Full configured pipeline'].map((c, i) => (
              <div key={c} className="card p-5">
                <p className="font-mono text-[11px] text-ink-3">Configuration {i + 1}</p>
                <p className="mt-1 font-semibold text-ink">{c}</p>
                <p className="mt-2 text-[12.5px] text-ink-3">{['Compares instructions only within the same note.', 'Disables class/nutrient expansion — literal terms only.', 'Disables evidence retrieval; high-severity flags need evidence.', 'NLP + KG + RAG (+ LLM explanations when configured).'][i]}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 overflow-hidden rounded-[28px] aurora p-10 text-center text-white">
          <LogoMark size={56} className="mx-auto" />
          <h2 className="display mt-4 text-[40px] leading-tight">See the conflicts a single chart review would miss.</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/app"><Button size="lg" variant="dark">Launch Dashboard</Button></Link>
            <Link to="/login?demo=1"><Button size="lg" variant="secondary">Explore Demo</Button></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1.2fr_1fr]">
          <div>
            <Logo />
            <p className="mt-3 max-w-md text-[13px] text-ink-3">Cross-Instruction Conflict Detector — Detecting Silent Drug–Diet–Lifestyle Conflicts in Multi-Specialist Patient Care Using Generative AI. Professional Training project, Department of Computer Science and Engineering.</p>
          </div>
          <div className="rounded-2xl bg-canvas p-4 text-[12.5px] leading-relaxed text-ink-2">
            <p className="flex items-center gap-1.5 font-bold text-ink"><CheckCircle2 className="size-4 text-primary" />Research-prototype disclaimer</p>
            <p className="mt-1">CICD AI is a clinical decision-support research prototype. It is not an autonomous diagnostic or prescribing system, does not provide medical advice and uses synthetic, fictional case data. All findings require review by qualified clinicians.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
