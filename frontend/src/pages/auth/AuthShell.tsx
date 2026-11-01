import { motion } from 'motion/react'
import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../../components/Logo'
import { Input } from '../../components/ui'

export function AuthShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="aurora relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col">
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-50" />
        <Link to="/" className="relative"><Logo light /></Link>
        <div className="relative mt-auto max-w-lg">
          <motion.h2 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="display text-[52px] leading-[1.02]">
            Silent conflicts, <span className="italic">made visible.</span>
          </motion.h2>
          <p className="mt-4 text-[15px] text-white/85">NLP, a knowledge graph, retrieval-augmented evidence and generative reasoning — with every flag routed to a clinician.</p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {['Cross-document', 'Evidence-traced', 'Human-validated'].map((t, i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="rounded-2xl border border-white/25 bg-white/10 p-3 text-[12.5px] font-semibold backdrop-blur">{t}</motion.div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-5 sm:p-10">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="w-full max-w-md">
          <Link to="/" className="mb-8 inline-block lg:hidden"><Logo /></Link>
          <h1 className="display text-[40px] leading-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ink-3">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </motion.div>
      </div>
    </div>
  )
}

export const PasswordInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function PasswordInput(props, ref) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input ref={ref} type={show ? 'text' : 'password'} className="pr-11" {...props} />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-3 hover:text-primary" aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
})
