import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { useChartColors } from './chartTheme';

/**
 * One series over time (single y-axis). `kind` = area for continuous totals (revenue),
 * bar for counts (shipments). Crosshair/per-bar tooltip on hover; data table for a11y.
 */
export function TimeSeriesChart({ data, dataKey, name, kind = 'area', formatX, formatY, formatValue, height = 260 }) {
  const c = useChartColors();
  const axis = { stroke: c.axis, fontSize: 11, tickLine: false, axisLine: false };
  const tooltip = <ChartTooltip name={name} color={c.series} formatLabel={formatX} formatValue={formatValue ?? formatY} />;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        {kind === 'bar' ? (
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="date" tickFormatter={formatX} {...axis} minTickGap={24} />
            <YAxis tickFormatter={formatY} {...axis} width={44} allowDecimals={false} />
            <Tooltip content={tooltip} cursor={{ fill: c.grid, opacity: 0.6 }} />
            <Bar dataKey={dataKey} fill={c.series} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`fill-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.series} stopOpacity={0.22} />
                <stop offset="100%" stopColor={c.series} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="date" tickFormatter={formatX} {...axis} minTickGap={24} />
            <YAxis tickFormatter={formatY} {...axis} width={52} />
            <Tooltip content={tooltip} cursor={{ stroke: c.cursor, strokeWidth: 1 }} />
            <Area type="monotone" dataKey={dataKey} stroke={c.series} strokeWidth={2} fill={`url(#fill-${dataKey})`} activeDot={{ r: 5, strokeWidth: 2, stroke: c.surface }} isAnimationActive={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/** Visually hidden-until-opened data table, so the numbers aren't locked in the chart. */
export function ChartTable({ data, columns, caption }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs font-medium text-muted hover:text-ink">Show data table</summary>
      <div className="mt-2 max-h-60 overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-background text-left text-muted">
            <tr>{columns.map((c) => <th key={c.key} scope="col" className="px-3 py-2 font-semibold">{c.label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((row, i) => (
              <tr key={i}>{columns.map((c) => <td key={c.key} className="px-3 py-1.5 font-mono">{c.format ? c.format(row[c.key]) : row[c.key]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
