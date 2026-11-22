import { useId, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { api, parseApiError } from '@/api/client';
import { cn } from '@/lib/utils';

/**
 * Address lookup (FR-10). Searches on Enter / button press rather than on every keystroke,
 * which keeps us within the public Nominatim usage policy (no autocomplete).
 */
export function AddressSearch({ label, value, onChange, error, placeholder = 'Search for an address, area or landmark' }) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const inputRef = useRef(null);

  const search = async () => {
    if (query.trim().length < 3) return setSearchError('Type at least 3 characters');
    setLoading(true);
    setSearchError('');
    try {
      const { data } = await api.get('/geo/search', { params: { q: query } });
      setResults(data.results);
      if (!data.results.length) setSearchError('No matches — try adding the area or city.');
    } catch (err) {
      setSearchError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const pick = (place) => {
    onChange(place);
    setResults(null);
    setQuery('');
  };

  if (value) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-start gap-3 rounded-[10px] border border-primary/40 bg-primary/5 p-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{value.city || 'Selected location'}</p>
            <p className="line-clamp-2 text-xs text-muted">{value.label}</p>
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink"
            aria-label={`Change ${label.toLowerCase()}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const shownError = searchError || error;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="relative">
        <div className={cn('flex rounded-[10px] border bg-surface transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30', shownError ? 'border-status-failed' : 'border-border')}>
          <input
            ref={inputRef}
            id={id}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } if (e.key === 'Escape') setResults(null); }}
            placeholder={placeholder}
            autoComplete="off"
            aria-invalid={!!shownError}
            aria-describedby={shownError ? `${id}-err` : undefined}
            className="h-11 min-w-0 flex-1 bg-transparent px-3.5 text-sm outline-none placeholder:text-muted focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          <button type="button" onClick={search} disabled={loading} aria-label={`Search ${label.toLowerCase()}`} className="m-1 inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-semibold text-background disabled:opacity-60">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Search
          </button>
        </div>
        {results?.length > 0 && (
          <ul role="listbox" aria-label={`${label} results`} className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-lift">
            {results.map((r) => (
              <li key={`${r.lat},${r.lng}`} role="option" aria-selected="false">
                <button type="button" onClick={() => pick(r)} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-ink/5 focus-visible:bg-ink/5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{r.city || r.label.split(',')[0]}</span>
                    <span className="line-clamp-2 block text-xs text-muted">{r.label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {shownError && <p id={`${id}-err`} role="alert" className="text-xs font-medium text-status-failed">{shownError}</p>}
    </div>
  );
}
