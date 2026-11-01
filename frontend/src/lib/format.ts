import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Severity } from './types'

export const CATEGORIES = [
  'Drug–Drug',
  'Drug–Diet',
  'Diet–Diet',
  'Drug–Lifestyle',
  'Diet–Lifestyle',
  'Lifestyle–Lifestyle',
  'Other cross-instruction',
] as const
export const CORE_CATEGORIES = CATEGORIES.slice(0, 3) as readonly string[]

// Categorical palette validated with the dataviz validator (light surface): fixed order, never cycled.
export const CATEGORY_COLORS: Record<string, string> = {
  'Drug–Drug': '#4169f5',
  'Drug–Diet': '#eb6834',
  'Diet–Diet': '#1baf7a',
  'Drug–Lifestyle': '#eda100',
  'Diet–Lifestyle': '#e87ba4',
  'Lifestyle–Lifestyle': '#7b5cd6',
  'Other cross-instruction': '#0e9fb5',
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'moderate', 'low', 'uncertain']
export const SEVERITY_META: Record<Severity, { label: string; short: string; color: string; bg: string; text: string }> = {
  critical: { label: 'Critical', short: 'Critical', color: '#d03b3b', bg: 'bg-danger-50', text: 'text-danger' },
  high: { label: 'High', short: 'High', color: '#ec835a', bg: 'bg-coral-50', text: 'text-coral' },
  moderate: { label: 'Moderate', short: 'Moderate', color: '#fab219', bg: 'bg-amber-50', text: 'text-amber' },
  low: { label: 'Low', short: 'Low', color: '#76a9d8', bg: 'bg-primary-50', text: 'text-primary-600' },
  uncertain: { label: 'Uncertain / Insufficient Evidence', short: 'Uncertain', color: '#9a98a8', bg: 'bg-slate-100', text: 'text-slate-600' },
}

export const VALIDATION_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending review', cls: 'bg-primary-50 text-primary-600 ring-primary/20' },
  confirmed: { label: 'Confirmed', cls: 'bg-mint-50 text-mint ring-mint/25' },
  rejected: { label: 'Rejected', cls: 'bg-slate-100 text-slate-600 ring-slate-300' },
  uncertain: { label: 'Marked uncertain', cls: 'bg-amber-50 text-amber ring-amber/25' },
  clarification_requested: { label: 'Clarification requested', cls: 'bg-lavender/15 text-[#5b47c9] ring-lavender/40' },
  reopened: { label: 'Reopened', cls: 'bg-primary-50 text-primary-600 ring-primary/20' },
}

export const CASE_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-600' },
  analyzed: { label: 'Analyzed', cls: 'bg-mint-50 text-mint' },
  in_review: { label: 'In review', cls: 'bg-primary-50 text-primary-600' },
  reviewed: { label: 'Reviewed', cls: 'bg-mint-50 text-mint' },
  archived: { label: 'Archived', cls: 'bg-slate-100 text-slate-500' },
  awaiting_review: { label: 'Awaiting review', cls: 'bg-primary-50 text-primary-600' },
}

export const TEST_STATUS: Record<string, { label: string; cls: string }> = {
  pass: { label: 'Pass', cls: 'bg-mint-50 text-mint ring-mint/25' },
  fail: { label: 'Fail', cls: 'bg-danger-50 text-danger ring-danger/25' },
  needs_review: { label: 'Needs review', cls: 'bg-amber-50 text-amber ring-amber/25' },
  not_run: { label: 'Not run', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
}

export function pct(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return 'Undefined'
  return `${(v * 100).toFixed(digits)}%`
}

export function ratio(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return 'n/a'
  return v.toFixed(digits)
}

export function ms(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  if (v < 1000) return `${v} ms`
  return `${(v / 1000).toFixed(v < 10000 ? 1 : 0)} s`
}

export function dateTime(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s.endsWith('Z') || s.includes('+') ? s : `${s}Z`)
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function dateOnly(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s.endsWith('Z') || s.includes('+') ? s : `${s}Z`)
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function relTime(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s.endsWith('Z') || s.includes('+') ? s : `${s}Z`).getTime()
  const diff = (Date.now() - d) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`
  return `${Math.floor(diff / 86400)} d ago`
}

export function valueOrUnknown(v: string | null | undefined): string {
  return v === null || v === undefined || v === '' ? 'Not specified' : v
}

export const DIRECTION_LABEL: Record<string, string> = {
  take: 'Take / include',
  increase: 'Increase',
  restrict: 'Restrict',
  avoid: 'Avoid',
  stop: 'Stop',
  maintain: 'Keep consistent',
  neutral: 'Mentioned',
}

export function cn(...parts: ClassValue[]): string {
  return twMerge(clsx(parts))
}
