import { useTheme } from '@/context/ThemeContext';

// Validated (dataviz validator) against this app's surfaces: light #FFFFFF, dark #0F172A.
const LIGHT = { series: '#2a78d6', grid: '#E5E7EB', axis: '#64748B', cursor: 'rgba(11,18,32,0.25)', surface: '#FFFFFF' };
const DARK = { series: '#3987e5', grid: '#1E293B', axis: '#94A3B8', cursor: 'rgba(241,245,249,0.3)', surface: '#0F172A' };

/** Recharts takes colors as SVG attributes (no CSS vars), so pick concrete hex per theme. */
export function useChartColors() {
  const { theme } = useTheme();
  return theme === 'dark' ? DARK : LIGHT;
}
