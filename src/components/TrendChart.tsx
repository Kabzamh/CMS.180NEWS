export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  fill: string;
  values: number[];
}

/**
 * Lightweight multi-series area/line chart rendered with inline SVG — no
 * charting dependency required. Used for the colour-coded traffic timeline
 * on the Analytics page.
 */
export function TrendChart({
  labels,
  series,
  height = 220,
}: {
  labels: string[];
  series: TrendSeries[];
  height?: number;
}) {
  const width = 960;
  const padding = { top: 16, right: 12, bottom: 24, left: 12 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const n = labels.length || 1;
  const max = Math.max(1, ...series.flatMap((s) => s.values));

  const xAt = (i: number) => padding.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padding.top + innerH - (v / max) * innerH;

  const linePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ');

  const areaPath = (values: number[]) =>
    `${linePath(values)} L ${xAt(values.length - 1).toFixed(1)} ${(padding.top + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padding.top + innerH).toFixed(1)} Z`;

  const tickEvery = Math.max(1, Math.ceil(n / 8));
  const shortDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex flex-wrap gap-4">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" preserveAspectRatio="none" role="img" aria-label="Traffic over time">
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + innerH * f}
            y2={padding.top + innerH * f}
            stroke="var(--color-line)"
            strokeWidth={1}
          />
        ))}
        {series.map((s) => (
          <path key={`${s.key}-area`} d={areaPath(s.values)} fill={s.fill} stroke="none" />
        ))}
        {series.map((s) => (
          <path key={`${s.key}-line`} d={linePath(s.values)} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.map((s) =>
          s.values.map((v, i) =>
            i % tickEvery === 0 || i === s.values.length - 1 ? (
              <circle key={`${s.key}-pt-${i}`} cx={xAt(i)} cy={yAt(v)} r={3} fill={s.color} />
            ) : null
          )
        )}
        {labels.map((label, i) =>
          i % tickEvery === 0 || i === labels.length - 1 ? (
            <text
              key={`x-${i}`}
              x={xAt(i)}
              y={height - 6}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-off)"
              fontFamily="inherit"
            >
              {shortDate(label)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}
