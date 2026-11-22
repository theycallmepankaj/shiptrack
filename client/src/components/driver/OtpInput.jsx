import { useRef } from 'react';
import { cn } from '@/lib/utils';

/** Four large digit boxes with auto-advance, backspace and paste (§11.4). */
export function OtpInput({ value, onChange, length = 4, error, autoFocus }) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setAt = (i, d) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').slice(0, length));
  };

  const onInput = (i, e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) return setAt(i, '');
    if (raw.length > 1) return paste(raw, i);
    setAt(i, raw);
    refs.current[i + 1]?.focus();
  };

  const paste = (text, from = 0) => {
    const d = text.replace(/\D/g, '').slice(0, length - from);
    const next = digits.slice();
    d.split('').forEach((c, k) => (next[from + k] = c));
    onChange(next.join(''));
    refs.current[Math.min(from + d.length, length - 1)]?.focus();
  };

  return (
    <div className="flex justify-center gap-3" role="group" aria-label="Delivery code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d}
          onChange={(e) => onInput(i, e)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowLeft') refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight') refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => { e.preventDefault(); paste(e.clipboardData.getData('text'), i); }}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1} of ${length}`}
          aria-invalid={!!error}
          className={cn(
            'h-16 w-14 rounded-2xl border-2 bg-surface text-center font-mono text-3xl font-bold transition-colors focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-20 sm:w-16',
            error ? 'border-status-failed' : d ? 'border-ink/30' : 'border-border',
          )}
        />
      ))}
    </div>
  );
}
