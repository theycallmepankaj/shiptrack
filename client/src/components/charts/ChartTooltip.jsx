/** Shared tooltip card: text in ink tokens, a small swatch carries identity. */
export function ChartTooltip({ active, payload, label, formatLabel, formatValue, name, color }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lift">
      <p className="text-muted">{formatLabel ? formatLabel(label) : label}</p>
      <p className="mt-1 flex items-center gap-2 font-semibold text-ink">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        {name}: <span className="font-mono">{formatValue ? formatValue(payload[0].value) : payload[0].value}</span>
      </p>
    </div>
  );
}
