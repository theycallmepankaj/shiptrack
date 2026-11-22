const TZ = 'Asia/Kolkata';

export const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '—';

export const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—');

export const formatTime = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: TZ }) : '—');

/** "Today, 4:30 pm" / "Tomorrow, 9:00 am" / "Tue 25 Nov, 4:30 pm" */
export function formatEta(d) {
  if (!d) return '—';
  const date = new Date(d);
  const dayKey = (x) => x.toLocaleDateString('en-CA', { timeZone: TZ });
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  const time = formatTime(date);
  if (dayKey(date) === dayKey(today)) return `Today, ${time}`;
  if (dayKey(date) === dayKey(tomorrow)) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ })}, ${time}`;
}

/** 37.5 → "1 day 14 h", 5.2 → "5 h 12 min" */
export function formatDuration(hours) {
  if (hours == null) return '—';
  const totalMin = Math.max(0, Math.round(hours * 60));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d) return `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} h` : ''}`;
  if (h) return `${h} h${m ? ` ${m} min` : ''}`;
  return `${m} min`;
}
