'use client';

// 軽量 inline SVG チャート。依存ゼロで描画する。
// 余白・hairline・刻み を frontend-design 流に意識して、一目で「データを語る」サイズ感に。
// 共有コンポーネントなので /design (モック) と (admin) (本番) の両方から使う。
//
// Hover で詳細ツールチップ + 縦ガイド線を表示。
// preserveAspectRatio="none" を使うので、座標は SVG ピクセルではなく container px 基準で計算する。

import { useRef, useState, type ReactNode, type PointerEvent } from 'react';

export type DailyPoint = { date: string; events: number; images: number; downloads: number };

type SeriesAccent = { stroke: string; fill: string };

// ============================================================
// 共通ツールチップ
// ============================================================

type TooltipProps = {
  visible: boolean;
  /** container 横幅に対する相対位置 (0..1) */
  xRatio: number;
  /** container 縦幅に対する相対位置 (0..1) */
  yRatio?: number;
  children: ReactNode;
};

function ChartTooltip({ visible, xRatio, yRatio = 0, children }: TooltipProps) {
  if (!visible) return null;
  const xPercent = Math.max(0, Math.min(100, xRatio * 100));
  const flipRight = xRatio > 0.7;
  const flipLeft = xRatio < 0.3;
  const translateX = flipRight ? '-100%' : flipLeft ? '0%' : '-50%';
  const offsetX = flipRight ? '-6px' : flipLeft ? '6px' : '0px';
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border bg-popover/95 px-2.5 py-1.5 text-[11px] tabular-nums shadow-sm backdrop-blur"
      style={{
        left: `calc(${xPercent}% + ${offsetX})`,
        top: yRatio ? `${yRatio * 100}%` : '4px',
        transform: `translateX(${translateX})`,
        borderColor: 'var(--hairline)',
        color: 'var(--ink)',
      }}
    >
      {children}
    </div>
  );
}

// ============================================================
// SparkLine (折れ線スパーク)
// ============================================================

type SparkLineProps = {
  data: DailyPoint[];
  field: keyof Pick<DailyPoint, 'events' | 'images' | 'downloads'>;
  height?: number;
  accent: SeriesAccent;
  showAxis?: boolean;
  /** ツールチップに出すラベル: "DL"/"画像枚数" など */
  unit?: string;
};

export function SparkLine({ data, field, height = 56, accent, showAxis = false, unit }: SparkLineProps) {
  const w = 320;
  const h = height;
  const padX = 4;
  const padY = 6;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d[field] as number));
  const stepX = (w - padX * 2) / Math.max(1, data.length - 1);
  const points = data.map((d, i) => {
    const v = d[field] as number;
    const x = padX + i * stepX;
    const y = h - padY - (v / max) * (h - padY * 2);
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${path} L${points[points.length - 1][0].toFixed(1)},${h - padY} L${points[0][0].toFixed(1)},${h - padY} Z`;

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPx = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, xPx / rect.width));
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, idx)));
  };

  const hover = hoverIdx !== null ? data[hoverIdx] : null;
  const hoverXRatio = hoverIdx !== null && data.length > 1 ? hoverIdx / (data.length - 1) : 0;
  const hoverPx = hoverIdx !== null ? (hoverIdx / Math.max(1, data.length - 1)) * (w - padX * 2) + padX : 0;

  return (
    <div
      ref={containerRef}
      className="relative"
      onPointerMove={handleMove}
      onPointerLeave={() => setHoverIdx(null)}
    >
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden>
        {/* 縦ガイド線 (薄) */}
        {data.map((d, i) => (
          <line
            key={`g-${d.date}-${i}`}
            x1={padX + i * stepX}
            x2={padX + i * stepX}
            y1={padY}
            y2={h - padY}
            stroke="currentColor"
            strokeOpacity={0.06}
            strokeWidth={0.5}
          />
        ))}
        <path d={area} fill={accent.fill} />
        <path d={path} fill="none" stroke={accent.stroke} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
        {showAxis && (
          <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="currentColor" strokeOpacity={0.12} />
        )}
        {hoverIdx !== null && (
          <>
            <line
              x1={hoverPx}
              x2={hoverPx}
              y1={padY}
              y2={h - padY}
              stroke={accent.stroke}
              strokeOpacity={0.4}
              strokeWidth={1}
              strokeDasharray="2 2"
            />
            <circle cx={hoverPx} cy={points[hoverIdx][1]} r={2.5} fill={accent.stroke} />
          </>
        )}
      </svg>
      <ChartTooltip visible={!!hover} xRatio={hoverXRatio}>
        {hover && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] tracking-wider uppercase text-muted-foreground">
              {hover.date}
            </span>
            <span className="font-semibold" style={{ color: accent.stroke }}>
              {(hover[field] as number).toLocaleString()}
              {unit && <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>}
            </span>
          </div>
        )}
      </ChartTooltip>
    </div>
  );
}

// ============================================================
// Bars (単一バー)
// ============================================================

type BarsProps = {
  data: DailyPoint[];
  field: keyof Pick<DailyPoint, 'events' | 'images' | 'downloads'>;
  height?: number;
  accent: string;
  highlight?: number;
  highlightAccent?: string;
  unit?: string;
};

export function Bars({ data, field, height = 120, accent, highlight, highlightAccent, unit }: BarsProps) {
  const w = 640;
  const h = height;
  const padX = 8;
  const padY = 14;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d[field] as number));
  const slot = (w - padX * 2) / Math.max(1, data.length);
  const barW = Math.max(2, slot * 0.66);

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPx = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, xPx / rect.width));
    const idx = Math.min(data.length - 1, Math.floor(ratio * data.length));
    setHoverIdx(idx);
  };

  const hover = hoverIdx !== null ? data[hoverIdx] : null;
  const hoverXRatio = hoverIdx !== null ? (hoverIdx + 0.5) / data.length : 0;

  return (
    <div
      ref={containerRef}
      className="relative"
      onPointerMove={handleMove}
      onPointerLeave={() => setHoverIdx(null)}
    >
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden>
        {/* 縦ガイド線 — slot 中央 */}
        {data.map((d, i) => {
          const cx = padX + i * slot + slot / 2;
          return (
            <line
              key={`g-${d.date}-${i}`}
              x1={cx}
              x2={cx}
              y1={padY}
              y2={h - padY}
              stroke="currentColor"
              strokeOpacity={0.05}
              strokeWidth={0.5}
            />
          );
        })}
        {data.map((d, i) => {
          const v = d[field] as number;
          const barH = (v / max) * (h - padY * 2);
          const x = padX + i * slot + (slot - barW) / 2;
          const y = h - padY - barH;
          const isHi = i === highlight;
          const isHover = i === hoverIdx;
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                fill={isHi && highlightAccent ? highlightAccent : accent}
                rx={1}
                opacity={isHover || hoverIdx === null ? 1 : 0.55}
              />
            </g>
          );
        })}
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="currentColor" strokeOpacity={0.18} />
      </svg>
      <ChartTooltip visible={!!hover} xRatio={hoverXRatio}>
        {hover && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] tracking-wider uppercase text-muted-foreground">
              {hover.date}
            </span>
            <span className="font-semibold" style={{ color: accent }}>
              {(hover[field] as number).toLocaleString()}
              {unit && <span className="ml-1 text-[10px] text-muted-foreground">{unit}</span>}
            </span>
          </div>
        )}
      </ChartTooltip>
    </div>
  );
}

// ============================================================
// StackBars (events 全量 + downloads を内側に重ねる)
// ============================================================

type StackBarsProps = {
  data: DailyPoint[];
  height?: number;
  fills: { events: string; downloads: string };
};

export function StackBars({ data, height = 140, fills }: StackBarsProps) {
  const w = 640;
  const h = height;
  const padX = 8;
  const padY = 14;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d.events));
  const slot = (w - padX * 2) / Math.max(1, data.length);
  const barW = Math.max(2, slot * 0.66);

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xPx = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, xPx / rect.width));
    const idx = Math.min(data.length - 1, Math.floor(ratio * data.length));
    setHoverIdx(idx);
  };

  const hover = hoverIdx !== null ? data[hoverIdx] : null;
  const hoverXRatio = hoverIdx !== null ? (hoverIdx + 0.5) / data.length : 0;
  const dlRate = hover && hover.events > 0 ? (hover.downloads / hover.events) * 100 : null;

  return (
    <div
      ref={containerRef}
      className="relative"
      onPointerMove={handleMove}
      onPointerLeave={() => setHoverIdx(null)}
    >
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden>
        {/* 縦ガイド線 */}
        {data.map((d, i) => {
          const cx = padX + i * slot + slot / 2;
          return (
            <line
              key={`g-${d.date}-${i}`}
              x1={cx}
              x2={cx}
              y1={padY}
              y2={h - padY}
              stroke="currentColor"
              strokeOpacity={0.05}
              strokeWidth={0.5}
            />
          );
        })}
        {data.map((d, i) => {
          const eH = (d.events / max) * (h - padY * 2);
          const dH = (Math.min(d.downloads, d.events) / max) * (h - padY * 2);
          const x = padX + i * slot + (slot - barW) / 2;
          const yE = h - padY - eH;
          const yD = h - padY - dH;
          const isHover = i === hoverIdx;
          const dim = hoverIdx !== null && !isHover ? 0.55 : 1;
          return (
            <g key={d.date}>
              <rect x={x} y={yE} width={barW} height={eH} fill={fills.events} rx={1} opacity={dim} />
              <rect x={x} y={yD} width={barW} height={dH} fill={fills.downloads} rx={1} opacity={dim} />
            </g>
          );
        })}
        <line x1={padX} y1={h - padY} x2={w - padX} y2={h - padY} stroke="currentColor" strokeOpacity={0.18} />
        {hoverIdx !== null && (
          <line
            x1={padX + hoverIdx * slot + slot / 2}
            x2={padX + hoverIdx * slot + slot / 2}
            y1={padY}
            y2={h - padY}
            stroke={fills.downloads}
            strokeOpacity={0.45}
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}
      </svg>
      <ChartTooltip visible={!!hover} xRatio={hoverXRatio}>
        {hover && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] tracking-wider uppercase text-muted-foreground">
              {hover.date}
            </span>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: fills.events }} />
              <span className="text-muted-foreground">工程</span>
              <span className="ml-auto font-semibold">{hover.events.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: fills.downloads }} />
              <span className="text-muted-foreground">DL</span>
              <span className="ml-auto font-semibold" style={{ color: fills.downloads }}>
                {hover.downloads.toLocaleString()}
              </span>
            </div>
            {dlRate !== null && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                DL率 {dlRate.toFixed(1)}%
              </div>
            )}
          </div>
        )}
      </ChartTooltip>
    </div>
  );
}

// ============================================================
// Donut (ジャンル割合)
// ============================================================

type DonutProps = {
  data: { name: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
};

function buildDonutSegments(
  data: { name: string; value: number; color: string }[],
  total: number,
  c: number,
  r: number,
) {
  let acc = 0;
  return data.map((d) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += d.value;
    const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const x1 = c + r * Math.cos(start);
    const y1 = c + r * Math.sin(start);
    const x2 = c + r * Math.cos(end);
    const y2 = c + r * Math.sin(end);
    const large = end - start > Math.PI ? 1 : 0;
    const path = `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
    return { d: path, color: d.color, name: d.name, value: d.value };
  });
}

export function Donut({ data, size = 160, thickness = 18 }: DonutProps) {
  const r = (size - thickness) / 2;
  const c = size / 2;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const segments = buildDonutSegments(data, total, c, r);

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const innerR = (rect.width / 2) * (1 - thickness / size) - thickness / 2;
    const outerR = rect.width / 2;
    if (dist < innerR - 4 || dist > outerR + 4) {
      setHoverIdx(null);
      return;
    }
    // angle 0 = 12 時, 時計回り
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    const ratio = angle / (Math.PI * 2);
    const target = ratio * total;
    let cum = 0;
    for (let i = 0; i < data.length; i++) {
      cum += data[i].value;
      if (target <= cum) {
        setHoverIdx(i);
        return;
      }
    }
    setHoverIdx(data.length - 1);
  };

  const hover = hoverIdx !== null ? data[hoverIdx] : null;
  const hoverPct = hover ? (hover.value / total) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      style={{ width: size, height: size }}
      onPointerMove={handleMove}
      onPointerLeave={() => setHoverIdx(null)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeOpacity={0.06} strokeWidth={thickness} />
        {segments.map((s, i) => (
          <path
            key={s.name}
            d={s.d}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness + (i === hoverIdx ? 3 : 0)}
            strokeLinecap="butt"
            opacity={hoverIdx === null || i === hoverIdx ? 1 : 0.55}
          />
        ))}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
          style={{ color: 'var(--ink)' }}
        >
          <span className="text-[10px] tracking-wider uppercase text-muted-foreground">
            {hover.name}
          </span>
          <span
            className="tabular-nums font-semibold"
            style={{ color: hover.color, fontSize: Math.max(14, size * 0.13) }}
          >
            {hover.value.toLocaleString()}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {hoverPct.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// QuotaBar (装飾、hover なし)
// ============================================================

type QuotaBarProps = {
  used: number;
  quota: number | null;
  accent: string;
  warnAccent?: string;
};

export function QuotaBar({ used, quota, accent, warnAccent }: QuotaBarProps) {
  if (quota == null || quota <= 0) {
    return <div className="h-1 w-full rounded bg-current/10" aria-label="上限なし" />;
  }
  const ratio = Math.min(1.5, used / quota);
  const fillW = `${Math.min(100, ratio * 100).toFixed(1)}%`;
  const color = ratio >= 1 ? warnAccent ?? accent : accent;
  return (
    <div className="relative h-1 w-full rounded bg-current/10 overflow-hidden">
      <div className="h-full" style={{ width: fillW, background: color }} />
    </div>
  );
}
