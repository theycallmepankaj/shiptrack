import { useEffect, useRef, useState } from 'react';
import { animate, useInView } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export function CountUp({ to, decimals = 0, suffix = '', prefix = '', duration = 1.6 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) return setValue(to);
    const controls = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setValue });
    return () => controls.stop();
  }, [inView, reduced, to, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {value.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
