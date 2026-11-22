import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { useChartColors } from './chartTheme';

/** Tiny trend line for a stat tile — no axes; the tile's number is the readout. */
export function Sparkline({ data, dataKey }) {
  const c = useChartColors();
  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <Line type="monotone" dataKey={dataKey} stroke={c.series} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
