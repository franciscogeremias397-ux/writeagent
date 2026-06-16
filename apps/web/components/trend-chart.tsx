"use client";

import { weeklyTrendPoints } from "@shenbi/shared";

type ChartRow = { day: string } & Record<string, number | string>;
type ChartSeries = { key: string; label?: string; color: string };

const defaultSeries: ChartSeries[] = [
  { key: "女性成长", color: "#111111" },
  { key: "悬疑惊悚", color: "#77736b" },
  { key: "现言甜宠", color: "#c0a94d" }
];

export function TrendChart({ data = weeklyTrendPoints, series = defaultSeries }: { data?: ChartRow[]; series?: ChartSeries[] }) {
  const rows = (data.length >= 2 ? data : weeklyTrendPoints) as ChartRow[];
  const visibleSeries = (series.length > 0 ? series : defaultSeries).map((item, index) => ({
    ...item,
    renderKey: `${index}-${item.key}`
  }));
  const values = rows.flatMap((row) => visibleSeries.map((item) => Number(row[item.key])).filter(Number.isFinite));
  const minValue = Math.max(0, Math.floor(Math.min(...values, 60) / 5) * 5 - 5);
  const maxValue = Math.min(100, Math.ceil(Math.max(...values, 100) / 5) * 5);
  const width = 720;
  const height = 260;
  const padding = { top: 20, right: 22, bottom: 44, left: 46 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const yTicks = [maxValue, Math.round((maxValue + minValue) / 2), minValue];
  const range = maxValue - minValue || 1;

  const xFor = (index: number) => padding.left + (rows.length === 1 ? chartWidth / 2 : (chartWidth * index) / (rows.length - 1));
  const yFor = (value: number) => padding.top + chartHeight - ((value - minValue) / range) * chartHeight;

  return (
    <div className="grid min-h-80 w-full gap-3" aria-label="题材热度趋势图">
      <svg className="h-64 w-full overflow-visible" viewBox={`0 0 ${width} ${height}`} role="img">
        <title>题材热度趋势</title>
        {yTicks.map((tick) => {
          const y = yFor(tick);

          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#edeae3" strokeWidth="1" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" className="fill-muted text-[11px]">
                {tick}
              </text>
            </g>
          );
        })}

        {rows.map((row, index) => {
          const x = xFor(index);

          return (
            <g key={row.day}>
              <line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} stroke="#f3f1ec" strokeWidth="1" />
              <text x={x} y={height - 18} textAnchor="middle" className="fill-muted text-[11px]">
                {row.day}
              </text>
            </g>
          );
        })}

        {visibleSeries.map((item) => {
          const points = rows
            .map((row, index) => {
              const value = Number(row[item.key]);
              return Number.isFinite(value) ? `${xFor(index)},${yFor(value)}` : "";
            })
            .filter(Boolean)
            .join(" ");

          return (
            <g key={item.renderKey}>
              <polyline data-testid="trend-line" fill="none" points={points} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              {rows.map((row, index) => {
                const value = Number(row[item.key]);

                return Number.isFinite(value) ? (
                  <circle key={`${item.renderKey}-${row.day}`} cx={xFor(index)} cy={yFor(value)} r="3.5" fill="#fff" stroke={item.color} strokeWidth="2" />
                ) : null;
              })}
            </g>
          );
        })}
      </svg>

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {visibleSeries.map((item) => (
          <span key={item.renderKey} className="inline-flex items-center gap-2">
            <span className="h-2 w-5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label ?? item.key}
          </span>
        ))}
      </div>
    </div>
  );
}
