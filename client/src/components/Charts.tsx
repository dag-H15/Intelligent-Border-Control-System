// Lightweight SVG charts — no external chart dependency, matches enterprise aesthetic.

interface BarDatum { label: string; value: number; }

export function BarChart({ data, height = 200, color = '#102a43' }: { data: BarDatum[]; height?: number; color?: string }) {
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const barW = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height / 2}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height / 2 - 10);
        const x = i * barW + barW * 0.2;
        const w = barW * 0.6;
        return (
          <g key={d.label}>
            <rect x={x} y={height / 2 - h - 4} width={w} height={h} rx="1" fill={color} opacity={0.85} />
          </g>
        );
      })}
    </svg>
  );
}

interface GroupedBarDatum { label: string; a: number; b: number; c: number; }

export function GroupedBarChart({ data, height = 220 }: { data: GroupedBarDatum[]; height?: number }) {
  const max = Math.max(...data.flatMap((d) => [d.a, d.b, d.c])) || 1;
  const groupW = 100 / data.length;
  const barW = groupW * 0.22;
  return (
    <svg viewBox={`0 0 100 ${height / 2}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const gx = i * groupW + groupW * 0.1;
        const ha = (d.a / max) * (height / 2 - 10);
        const hb = (d.b / max) * (height / 2 - 10);
        const hc = (d.c / max) * (height / 2 - 10);
        return (
          <g key={d.label}>
            <rect x={gx} y={height / 2 - ha - 4} width={barW} height={ha} rx="1" fill="#16a34a" opacity={0.85} />
            <rect x={gx + barW + 1} y={height / 2 - hb - 4} width={barW} height={hb} rx="1" fill="#d97706" opacity={0.85} />
            <rect x={gx + (barW + 1) * 2} y={height / 2 - hc - 4} width={barW} height={hc} rx="1" fill="#dc2626" opacity={0.85} />
          </g>
        );
      })}
    </svg>
  );
}

interface LineDatum { label: string; value: number; }

export function LineChart({ data, height = 220, color = '#102a43' }: { data: LineDatum[]; height?: number; color?: string }) {
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const min = Math.min(...data.map((d) => d.value)) || 0;
  const range = max - min || 1;
  const w = 100;
  const h = height / 2;
  const stepX = w / (data.length - 1 || 1);
  const pts = data.map((d, i) => {
    const x = i * stepX;
    const y = h - 6 - ((d.value - min) / range) * (h - 16);
    return { x, y };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lineFill)" />
      <path d={path} fill="none" stroke={color} strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="0.9" fill={color} />
      ))}
    </svg>
  );
}

interface PieSlice { label: string; value: number; color: string; }

export function DonutChart({ data, size = 180 }: { data: PieSlice[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 40;
  const cx = 50;
  const cy = 50;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }}>
      {data.map((d, i) => {
        const frac = d.value / total;
        const dash = frac * circumference;
        const seg = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={d.color}
            strokeWidth="14"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 50 50)"
          />
        );
        offset += dash;
        return seg;
      })}
      <text x="50" y="47" textAnchor="middle" className="fill-navy-800" style={{ fontSize: 10, fontWeight: 700 }}>
        {total.toLocaleString()}
      </text>
      <text x="50" y="58" textAnchor="middle" className="fill-navy-400" style={{ fontSize: 5 }}>
        Total
      </text>
    </svg>
  );
}

export function ChartLabels({ data }: { data: { label: string; color: string; value: number | string }[] }) {
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.label} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="text-navy-600">{d.label}</span>
          </div>
          <span className="font-semibold text-navy-800">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

export function AxisLabels({ labels }: { labels: string[] }) {
  return (
    <div className="flex justify-between mt-2 px-1">
      {labels.map((l) => (
        <span key={l} className="text-[10px] text-navy-400 font-medium">{l}</span>
      ))}
    </div>
  );
}
