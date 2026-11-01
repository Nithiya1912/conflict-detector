import { zodResolver } from '@hookform/resolvers/zod'
import { UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button, Field, Input } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/format'
import { AuthShell, PasswordInput } from './AuthShell'

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, 'Enter your full name'),
    email: z.string().trim().email('Enter a valid email address'),
    password: z
      .string()
      .min(10, 'Use at least 10 characters')
      .regex(/[A-Z]/, 'Include an upper-case letter')
      .regex(/[a-z]/, 'Include a lower-case letter')
      .regex(/\d/, 'Include a digit'),
    confirm: z.string(),
    ack: z.literal(true, { message: 'Please acknowledge the research-prototype terms' }),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Form = z.infer<typeof registerSchema>

function strength(p: string) {
  let s = 0
  if (p.length >= 10) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p) || p.length >= 14) s++
  return s
}

export default function Register() {
  const { register: signup } = useAuth()
  const nav = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(registerSchema) })
  const s = strength(watch('password') ?? '')

  async function onSubmit(v: Form) {
    setError(null)
    try {
      await signup(v.full_name, v.email, v.password)
      nav('/app', { replace: true })
    } catch (e) {
      const err = e as ApiError
      setError(err.fieldErrors?.[0]?.message ?? err.message)
    }
  }

  return (
    <AuthShell title="Create account" subtitle="New accounts get the clinician / reviewer role. Administrators can change roles.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="full_name" error={errors.full_name?.message}>
          <Input id="full_name" autoComplete="name" {...register('full_name')} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <PasswordInput id="password" autoComplete="new-password" {...register('password')} />
          <div className="mt-2 flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < s ? (s >= 3 ? 'bg-mint' : 'bg-amber') : 'bg-slate-200')} />)}
          </div>
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
          <PasswordInput id="confirm" autoComplete="new-password" {...register('confirm')} />
        </Field>
        <label className="flex items-start gap-2.5 text-[12.5px] text-ink-2">
          <input type="checkbox" className="mt-0.5 size-4 accent-[#4169f5]" {...register('ack')} />
          I understand this is a research prototype that must only be used with synthetic or properly de-identified data.
        </label>
        {errors.ack && <p className="text-[12px] font-medium text-danger">{errors.ack.message}</p>}
        {error && <p className="rounded-xl bg-danger-50 px-3 py-2 text-[13px] font-medium text-danger" role="alert">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting} icon={<UserPlus className="size-4" />}>Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-3">Already registered? <Link to="/login" className="font-semibold text-primary-600 hover:underline">Sign in</Link></p>
    </AuthShell>
  )
}
