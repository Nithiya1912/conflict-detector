import { zodResolver } from '@hookform/resolvers/zod'
import { motion } from 'motion/react'
import { FlaskConical, LogIn, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { Button, Field, Input } from '../../components/ui'
import { api, ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { AuthShell, PasswordInput } from './AuthShell'

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type Form = z.infer<typeof schema>
type DemoAccount = { email: string; role: string; password: string; name: string }

export default function Login() {
  const { login, user } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [demo, setDemo] = useState<{ demo_mode: boolean; demo_accounts: DemoAccount[] } | null>(null)
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })
  const from = (loc.state as { from?: string } | null)?.from ?? '/app'

  useEffect(() => {
    api<{ demo_mode: boolean; demo_accounts: DemoAccount[] }>('/auth/config').then(setDemo).catch(() => setDemo(null))
  }, [])
  useEffect(() => {
    if (user) nav(from, { replace: true })
  }, [user, from, nav])

  async function onSubmit(v: Form) {
    setError(null)
    try {
      await login(v.email, v.password)
    } catch (e) {
      setError((e as ApiError).message)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to the CICD AI clinical review workspace.">
      {demo?.demo_mode && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`mb-6 rounded-2xl border p-4 ${params.get('demo') ? 'border-primary/40 bg-primary-50' : 'border-amber/30 bg-amber-50/60'}`}>
          <p className="flex items-center gap-2 text-[13px] font-bold text-ink"><FlaskConical className="size-4 text-primary" />Local demonstration mode</p>
          <p className="mt-1 text-[12.5px] text-ink-2">Demo accounts exist only in this local install and use synthetic data. Choose one to fill the form:</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {demo.demo_accounts.map((a) => (
              <button key={a.email} type="button" onClick={() => { setValue('email', a.email); setValue('password', a.password) }} className="rounded-xl border border-line-2 bg-white px-3 py-2 text-left text-[12px] transition hover:border-primary hover:shadow-sm">
                <span className="block font-bold capitalize text-ink">{a.role === 'admin' ? 'Administrator' : a.email.startsWith('reviewer') ? 'Reviewer' : 'Clinician'}</span>
                <span className="block truncate text-ink-3">{a.email}</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="username" placeholder="you@hospital.org" {...register('email')} aria-invalid={!!errors.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="current-password" placeholder="••••••••" {...register('password')} aria-invalid={!!errors.password} />
        </Field>
        {error && <p className="rounded-xl bg-danger-50 px-3 py-2 text-[13px] font-medium text-danger" role="alert">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting} icon={<LogIn className="size-4" />}>Sign in</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-3">New to CICD AI? <Link to="/register" className="font-semibold text-primary-600 hover:underline">Create an account</Link></p>
      <p className="mt-8 flex items-start gap-2 text-[11.5px] text-ink-3"><ShieldCheck className="mt-0.5 size-4 shrink-0" />Passwords are stored as salted scrypt hashes. Sessions use an httpOnly cookie. This prototype is not certified for real patient data.</p>
    </AuthShell>
  )
}
