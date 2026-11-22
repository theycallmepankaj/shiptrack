import { motion } from 'framer-motion';

// Scroll-reveal: fade + slight slide (§11.3). MotionConfig reducedMotion="user" drops the slide.
export function Reveal({ children, delay = 0, y = 16, className, as = 'div' }) {
  const Comp = motion[as];
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Comp>
  );
}
