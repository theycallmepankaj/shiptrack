import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { ChevronsRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const HANDLE = 56;

/**
 * Swipe-to-confirm (§11.4 driver panel) — prevents accidental status changes.
 * Keyboard/screen-reader users can focus the handle and press Enter or Space.
 */
export function SwipeToConfirm({ label, onConfirm, loading = false, disabled = false, tone = 'primary' }) {
  const trackRef = useRef(null);
  const [max, setMax] = useState(0);
  const x = useMotionValue(0);
  const fill = useTransform(x, (v) => v + HANDLE);
  const textOpacity = useTransform(x, [0, Math.max(max * 0.6, 1)], [1, 0]);

  useEffect(() => {
    const measure = () => setMax((trackRef.current?.offsetWidth ?? 0) - HANDLE - 8);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (!loading) animate(x, 0, { type: 'spring', stiffness: 400, damping: 35 });
  }, [loading, x]);

  const confirm = () => {
    if (disabled || loading) return;
    animate(x, max, { duration: 0.15 });
    onConfirm();
  };

  const onDragEnd = () => {
    if (x.get() > max * 0.85) confirm();
    else animate(x, 0, { type: 'spring', stiffness: 400, damping: 35 });
  };

  const bg = tone === 'danger' ? 'bg-status-failed' : 'bg-primary';
  return (
    <div ref={trackRef} className={cn('relative h-16 select-none overflow-hidden rounded-2xl bg-ink/5 p-1', disabled && 'opacity-50')}>
      <motion.div aria-hidden className={cn('absolute inset-y-1 left-1 rounded-xl opacity-25', bg)} style={{ width: fill }} />
      <motion.p aria-hidden style={{ opacity: textOpacity }} className="pointer-events-none absolute inset-0 grid place-items-center pl-12 text-sm font-semibold">
        {label}
      </motion.p>
      <motion.button
        type="button"
        drag={disabled || loading ? false : 'x'}
        dragConstraints={{ left: 0, right: max }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={onDragEnd}
        style={{ x }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); confirm(); } }}
        aria-label={`${label}. Swipe right, or press Enter, to confirm.`}
        disabled={disabled}
        className={cn('relative z-10 grid h-14 w-14 cursor-grab touch-none place-items-center rounded-xl text-primary-foreground shadow-lift active:cursor-grabbing', bg, tone === 'danger' && 'text-white')}
      >
        {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ChevronsRight className="h-6 w-6" />}
      </motion.button>
    </div>
  );
}
