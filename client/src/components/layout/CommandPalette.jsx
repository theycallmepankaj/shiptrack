import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Ctrl/Cmd + K quick navigation (§11.4, admin panel). */
export function CommandPalette({ items, open, onOpenChange }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(
    () => items.filter((i) => i.label.toLowerCase().includes(query.trim().toLowerCase())),
    [items, query],
  );

  const go = (item) => {
    onOpenChange(false);
    navigate(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && results[active]) go(results[active]);
    if (e.key === 'Escape') onOpenChange(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] grid items-start justify-items-center bg-navy-900/40 px-4 pt-[15vh] backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onOpenChange(false)}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-label="Command palette"
            initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface shadow-lift"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-4 w-4 text-muted" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onKeyDown}
                placeholder="Jump to…"
                aria-label="Search pages"
                role="combobox"
                aria-expanded="true"
                aria-controls="cmdk-list"
                aria-activedescendant={results[active] ? `cmdk-${active}` : undefined}
                className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-muted focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted">ESC</kbd>
            </div>
            <ul id="cmdk-list" role="listbox" className="max-h-80 overflow-y-auto p-2">
              {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No results</li>}
              {results.map((item, i) => (
                <li
                  key={item.to}
                  id={`cmdk-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm', i === active && 'bg-primary/10 text-ink')}
                >
                  <item.icon className={cn('h-4 w-4', i === active ? 'text-primary-text' : 'text-muted')} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-muted" aria-hidden />}
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
