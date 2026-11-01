import { motion, useReducedMotion } from 'motion/react'
import { cn } from '../lib/format'

/** Brand mark: three specialist "sources" converging into one analysis node. */
export function LogoMark({ size = 36, animated = true, className }: { size?: number; animated?: boolean; className?: string }) {
  const reduce = useReducedMotion()
  const anim = animated && !reduce
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="lm-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4169F5" />
          <stop offset=".55" stopColor="#76C8FF" />
          <stop offset="1" stopColor="#A99BFF" />
        </linearGradient>
      </defs>
      <motion.rect width="64" height="64" rx="18" fill="#111A38" initial={anim ? { scale: 0.6, opacity: 0 } : false} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }} style={{ originX: '50%', originY: '50%' }} />
      {[
        [18, 20],
        [46, 20],
        [32, 46],
      ].map(([x, y], i) => (
        <motion.circle key={i} cx={x} cy={y} r={i === 2 ? 7.5 : 6} fill="url(#lm-g)" initial={anim ? { scale: 0 } : false} animate={{ scale: 1 }} transition={{ delay: 0.25 + i * 0.12, type: 'spring', stiffness: 300, damping: 14 }} style={{ originX: `${x}px`, originY: `${y}px` }} />
      ))}
      <motion.path d="M18 20 L32 46 L46 20" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" initial={anim ? { pathLength: 0, opacity: 0 } : false} animate={{ pathLength: 1, opacity: 0.9 }} transition={{ delay: 0.6, duration: 0.8, ease: 'easeInOut' }} />
      <motion.path d="M18 20 L46 20" stroke="white" strokeWidth="1.6" strokeDasharray="2 4" strokeLinecap="round" fill="none" initial={anim ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ delay: 1.1, duration: 0.6 }} opacity={0.6} />
    </svg>
  )
}

export function Logo({ light, className, compact }: { light?: boolean; className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={compact ? 32 : 38} />
      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="leading-none">
        <div className={cn('display text-[24px]', light ? 'text-white' : 'text-ink')}>
          CICD <span className={light ? 'text-sky' : 'text-primary'}>AI</span>
        </div>
        {!compact && <div className={cn('mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.16em]', light ? 'text-white/70' : 'text-ink-3')}>Conflict Detector</div>}
      </motion.div>
    </div>
  )
}
