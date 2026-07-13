import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, {
  Path, Defs, LinearGradient as SvgLinearGradient, Stop,
  Circle, G, Line, Text as SvgText, Rect,
} from 'react-native-svg';
import { useTheme } from '../ThemeContext';

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtY(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(1).replace('.0', '')}k`;
  return `R$ ${v.toFixed(0)}`;
}

function fmtTooltip(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

// ─── niceScale ────────────────────────────────────────────────────────────────
// Produces 4 human-friendly grid levels above 0

function niceScale(rawMax: number, steps = 4): number[] {
  if (rawMax <= 0) return [0, 1, 2, 3, 4].map(i => i * 25);
  const rough = rawMax / steps;
  const mag   = Math.pow(10, Math.floor(Math.log10(rough)));
  const nice  = [1, 2, 2.5, 5, 10].find(n => n * mag >= rough) ?? 10;
  const tick  = nice * mag;
  return Array.from({ length: steps + 1 }, (_, i) => i * tick);
}

// ─── Smooth path helpers ──────────────────────────────────────────────────────

function smoothPath(pts: { x: number; y: number }[]): string {
  if (!pts.length) return '';
  return pts.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    const prev = arr[i - 1];
    const cx = ((prev.x + p.x) / 2).toFixed(2);
    return `${acc} C ${cx} ${prev.y.toFixed(2)}, ${cx} ${p.y.toFixed(2)}, ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }, '');
}

function areaPath(pts: { x: number; y: number }[], linePath: string, baseY: number): string {
  if (!pts.length) return '';
  return `${linePath} L ${pts[pts.length - 1].x.toFixed(2)} ${baseY} L ${pts[0].x.toFixed(2)} ${baseY} Z`;
}

// ─── LineChart ────────────────────────────────────────────────────────────────

type LineProps = {
  data:        number[];
  width:       number;
  height:      number;
  stroke?:     string;
  incomeData?:  number[];
  expenseData?: number[];
  labels?:     string[];
};

export const LineChart: React.FC<LineProps> = ({
  data, width, height, stroke,
  incomeData, expenseData, labels = [],
}) => {
  const { colors } = useTheme();
  const [sel, setSel] = useState<number | null>(null);

  /* ── dual-series ── */
  if (incomeData && expenseData) {

    // Layout constants
    const Y_W   = 50;   // y-axis column width (enough for "R$ 20k")
    const P_TOP = 12;
    const P_BOT = labels.length ? 24 : 10;
    const P_R   = 6;

    const cW = width - Y_W - P_R;   // chart area width
    const cH = height - P_TOP - P_BOT;
    const baseY = P_TOP + cH;

    // Scale
    const allVals = [...incomeData, ...expenseData, 0];
    const rawMax  = Math.max(...allVals);
    const ticks   = niceScale(rawMax, 4);           // e.g. [0, 5000, 10000, 15000, 20000]
    const maxTick = ticks[ticks.length - 1];
    const range   = maxTick || 1;

    const len   = Math.max(incomeData.length, expenseData.length, 1);
    const stepX = len > 1 ? cW / (len - 1) : cW;

    const toX = (i: number) => Y_W + (len > 1 ? i * stepX : cW / 2);
    const toY = (v: number) => P_TOP + (1 - Math.min(v, range) / range) * cH;

    const iPts = incomeData.map((v, i)  => ({ x: toX(i), y: toY(v) }));
    const ePts = expenseData.map((v, i) => ({ x: toX(i), y: toY(v) }));

    const iLine = smoothPath(iPts);
    const eLine = smoothPath(ePts);
    const iArea = areaPath(iPts, iLine, baseY);
    const eArea = areaPath(ePts, eLine, baseY);

    // X-axis labels: show at most ~6, evenly spaced
    const maxXLabels = Math.max(2, Math.floor(cW / 36));
    const xStep = Math.max(1, Math.round((len - 1) / (maxXLabels - 1)));
    const xLabelIdxs = new Set<number>([0]);
    for (let i = xStep; i < len - 1; i += xStep) xLabelIdxs.add(i);
    xLabelIdxs.add(len - 1);

    // Tooltip
    const TW = 130; const TH = 52; const TR = 8;
    const tInc = sel !== null ? (incomeData[sel]  ?? 0) : 0;
    const tExp = sel !== null ? (expenseData[sel] ?? 0) : 0;
    const tX   = sel !== null ? toX(sel) : 0;
    const tY   = sel !== null ? Math.min(toY(tInc), toY(tExp)) - TH - 10 : 0;
    const ttX  = Math.min(Math.max(tX - TW / 2, Y_W + 2), width - TW - P_R - 2);
    const ttY  = Math.max(tY, P_TOP + 2);

    // Tap zones
    const zoneW = stepX;

    return (
      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          <Defs>
            <SvgLinearGradient id="giA" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0"   stopColor={colors.primary} stopOpacity="0.25" />
              <Stop offset="1"   stopColor={colors.primary} stopOpacity="0.01" />
            </SvgLinearGradient>
            <SvgLinearGradient id="geA" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0"   stopColor={colors.expense} stopOpacity="0.20" />
              <Stop offset="1"   stopColor={colors.expense} stopOpacity="0.01" />
            </SvgLinearGradient>
          </Defs>

          {/* ── Y-axis grid + labels ── */}
          {ticks.map((v, gi) => {
            const gy = toY(v);
            const isBase = gi === 0;
            return (
              <G key={`y${gi}`}>
                <Line
                  x1={Y_W} y1={gy} x2={width - P_R} y2={gy}
                  stroke={isBase ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)'}
                  strokeWidth={isBase ? 1 : 0.8}
                  strokeDasharray={isBase ? undefined : '3 5'}
                />
                <SvgText
                  x={Y_W - 6} y={gy + 4}
                  fontSize={8.5} fill="rgba(255,255,255,0.38)"
                  textAnchor="end" fontWeight="500"
                >
                  {fmtY(v)}
                </SvgText>
              </G>
            );
          })}

          {/* ── Vertical cursor ── */}
          {sel !== null && (
            <Line
              x1={toX(sel)} y1={P_TOP} x2={toX(sel)} y2={baseY}
              stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 4"
            />
          )}

          {/* ── Areas ── */}
          {eArea ? <Path d={eArea} fill="url(#geA)" /> : null}
          {iArea ? <Path d={iArea} fill="url(#giA)" /> : null}

          {/* ── Lines ── */}
          {eLine ? <Path d={eLine} stroke={colors.expense} strokeWidth={2}   fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {iLine ? <Path d={iLine} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}

          {/* ── Dots — income ── */}
          {iPts.map((p, i) =>
            sel === i ? (
              <G key={`id${i}`}>
                <Circle cx={p.x} cy={p.y} r={9}   fill={colors.primary} opacity={0.12} />
                <Circle cx={p.x} cy={p.y} r={5}   fill={colors.primary} />
                <Circle cx={p.x} cy={p.y} r={2.2} fill="#fff" />
              </G>
            ) : (
              <Circle key={`id${i}`} cx={p.x} cy={p.y} r={3} fill={colors.primary} />
            )
          )}

          {/* ── Dots — expense ── */}
          {ePts.map((p, i) =>
            sel === i ? (
              <G key={`ed${i}`}>
                <Circle cx={p.x} cy={p.y} r={9}   fill={colors.expense} opacity={0.12} />
                <Circle cx={p.x} cy={p.y} r={5}   fill={colors.expense} />
                <Circle cx={p.x} cy={p.y} r={2.2} fill="#fff" />
              </G>
            ) : (
              <Circle key={`ed${i}`} cx={p.x} cy={p.y} r={2.5} fill={colors.expense} opacity={0.75} />
            )
          )}

          {/* ── Tooltip ── */}
          {sel !== null && (
            <G>
              {/* shadow / border rect */}
              <Rect x={ttX} y={ttY} width={TW} height={TH} rx={TR}
                fill="#1C1C1E" stroke="rgba(255,255,255,0.13)" strokeWidth={1} />
              {/* label */}
              {labels[sel] ? (
                <SvgText x={ttX + TW / 2} y={ttY + 13}
                  fontSize={9} fill="rgba(255,255,255,0.45)" textAnchor="middle" fontWeight="600">
                  {labels[sel]}
                </SvgText>
              ) : null}
              {/* income row */}
              <Circle cx={ttX + 11} cy={ttY + 26} r={4} fill={colors.primary} />
              <SvgText x={ttX + 20} y={ttY + 30}
                fontSize={10} fill={colors.primary} fontWeight="700">
                {fmtTooltip(tInc)}
              </SvgText>
              {/* expense row */}
              <Circle cx={ttX + 11} cy={ttY + 42} r={4} fill={colors.expense} />
              <SvgText x={ttX + 20} y={ttY + 46}
                fontSize={10} fill={colors.expense} fontWeight="700">
                {fmtTooltip(tExp)}
              </SvgText>
            </G>
          )}

          {/* ── X-axis labels ── */}
          {labels.length > 0 && Array.from(xLabelIdxs).map(i => (
            <SvgText
              key={`xl${i}`}
              x={toX(i)} y={height - 5}
              fontSize={9}
              fill={sel === i ? colors.primary : 'rgba(255,255,255,0.32)'}
              textAnchor="middle"
              fontWeight={sel === i ? '700' : '400'}
            >
              {labels[i]}
            </SvgText>
          ))}

          {/* ── Invisible tap zones (full height) ── */}
          {Array.from({ length: len }, (_, i) => (
            <Rect
              key={`tz${i}`}
              x={toX(i) - zoneW / 2}
              y={P_TOP}
              width={zoneW}
              height={cH}
              fill="transparent"
              onPress={() => setSel(p => (p === i ? null : i))}
            />
          ))}
        </Svg>
      </View>
    );
  }

  /* ── legacy single line ── */
  const activeStroke = stroke || colors.primary;
  if (!data.length) return <View style={{ width, height }} />;

  const Y_W   = 50;
  const P_TOP = 12;
  const P_BOT = 10;
  const P_R   = 6;
  const cW = width - Y_W - P_R;
  const cH = height - P_TOP - P_BOT;
  const baseY = P_TOP + cH;

  const ticks  = niceScale(Math.max(...data), 4);
  const maxT   = ticks[ticks.length - 1] || 1;
  const stepX  = data.length > 1 ? cW / (data.length - 1) : cW;
  const toX    = (i: number) => Y_W + i * stepX;
  const toY    = (v: number) => P_TOP + (1 - Math.min(v, maxT) / maxT) * cH;

  const pts   = data.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const lPath = smoothPath(pts);
  const aPath = areaPath(pts, lPath, baseY);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgLinearGradient id="lgS" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={activeStroke} stopOpacity="0.28" />
            <Stop offset="1" stopColor={activeStroke} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        {ticks.map((v, gi) => {
          const gy = toY(v);
          return (
            <G key={`g${gi}`}>
              <Line x1={Y_W} y1={gy} x2={width - P_R} y2={gy}
                stroke="rgba(255,255,255,0.06)" strokeWidth={gi === 0 ? 1 : 0.8}
                strokeDasharray={gi === 0 ? undefined : '3 5'} />
              <SvgText x={Y_W - 6} y={gy + 4} fontSize={8.5}
                fill="rgba(255,255,255,0.35)" textAnchor="end" fontWeight="500">
                {fmtY(v)}
              </SvgText>
            </G>
          );
        })}
        <Path d={aPath} fill="url(#lgS)" />
        <Path d={lPath} stroke={activeStroke} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y}
            r={i === pts.length - 1 ? 4.5 : 3} fill={activeStroke} />
        ))}
      </Svg>
    </View>
  );
};

// ─── DonutChart ───────────────────────────────────────────────────────────────

type DonutSlice = { value: number; color: string };
type DonutProps = { slices: DonutSlice[]; size: number; thickness?: number; children?: React.ReactNode };

export const DonutChart: React.FC<DonutProps> = ({ slices, size, thickness = 18, children }) => {
  const { colors } = useTheme();
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r  = size / 2 - thickness / 2;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -Math.PI / 2;
  const paths = slices.map((s, i) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const start = angle; angle += sweep;
    const x1 = cx + r * Math.cos(start); const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(angle); const y2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return (
      <Path key={i}
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
        stroke={s.color} strokeWidth={thickness} fill="none" strokeLinecap="round" />
    );
  });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G>
          <Circle cx={cx} cy={cy} r={r}
            stroke={colors.surfaceElevated} strokeWidth={thickness} fill="none" />
          {paths}
        </G>
      </Svg>
      {children}
    </View>
  );
};

// ─── BarsChart ────────────────────────────────────────────────────────────────

type BarProps = { values: { income: number; expense: number; label: string }[]; width: number; height: number };

export const BarsChart: React.FC<BarProps> = ({ values, width, height }) => {
  const { colors } = useTheme();
  if (!values.length) return null;
  const max  = Math.max(...values.flatMap(v => [v.income, v.expense]), 1);
  const pad  = 8;
  const gW   = (width - pad * 2) / values.length;
  const bW   = (gW - 6) / 2;
  return (
    <Svg width={width} height={height}>
      {values.map((v, i) => {
        const xb = pad + i * gW + 3;
        const hi = (v.income  / max) * (height - pad * 2);
        const he = (v.expense / max) * (height - pad * 2);
        return (
          <G key={i}>
            <Path d={`M ${xb}      ${height - pad - hi} h ${bW} v ${hi} h -${bW} Z`} fill={colors.primary} opacity={0.95} />
            <Path d={`M ${xb+bW+2} ${height - pad - he} h ${bW} v ${he} h -${bW} Z`} fill={colors.expense} opacity={0.85} />
          </G>
        );
      })}
    </Svg>
  );
};