import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, G, Line } from 'react-native-svg';
import { useTheme } from '../ThemeContext';

const fmtK = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return v.toFixed(0);
};

const niceMax = (v: number) => {
  if (v <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10];
  for (const s of steps) if (s * mag >= v) return s * mag;
  return Math.ceil(v / mag) * mag;
};

const smoothPath = (pts: { x: number; y: number }[]) => {
  if (pts.length < 2) return `M ${pts[0]?.x ?? 0} ${pts[0]?.y ?? 0}`;
  return pts.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = arr[i - 1];
    const tension = 0.35;
    const cpx = prev.x + (p.x - prev.x) * tension;
    return `${acc} C ${cpx} ${prev.y}, ${p.x - (p.x - prev.x) * tension} ${p.y}, ${p.x} ${p.y}`;
  }, '');
};

type LineProps = {
  data: number[];
  width: number;
  height: number;
  stroke?: string;
  incomeData?: number[];
  expenseData?: number[];
};

export const LineChart: React.FC<LineProps> = ({ data, width, height, stroke, incomeData, expenseData }) => {
  const { colors } = useTheme();
  const Y_AXIS_W = 40;
  const padTop = 20;
  const padBottom = 4;
  const chartW = width - Y_AXIS_W - 8;
  const chartH = height - padTop - padBottom;
  const N_GRID = 4;

  if (incomeData && expenseData) {
    const allValues = [...incomeData, ...expenseData];
    const hasData = allValues.some(v => v > 0);
    if (!hasData) return <View style={{ width, height }} />;

    const maxVal = niceMax(Math.max(...allValues, 1));
    const minVal = 0;
    const range = maxVal - minVal;
    const len = Math.max(incomeData.length, expenseData.length, 2);
    const stepX = chartW / Math.max(len - 1, 1);

    const toX = (i: number) => Y_AXIS_W + i * stepX;
    const toY = (v: number) => padTop + (1 - (v - minVal) / range) * chartH;

    const incPts = incomeData.map((v, i) => ({ x: toX(i), y: toY(v) }));
    const expPts = expenseData.map((v, i) => ({ x: toX(i), y: toY(v) }));
    const incPath = smoothPath(incPts);
    const expPath = smoothPath(expPts);
    const baseY = toY(0);

    const incArea = `${incPath} L ${incPts[incPts.length-1].x} ${baseY} L ${incPts[0].x} ${baseY} Z`;
    const expArea = `${expPath} L ${expPts[expPts.length-1].x} ${baseY} L ${expPts[0].x} ${baseY} Z`;

    const gridVals = Array.from({ length: N_GRID + 1 }, (_, i) => ({
      v: (maxVal * (N_GRID - i)) / N_GRID,
      y: toY((maxVal * (N_GRID - i)) / N_GRID),
    }));

    // Ponto mais alto da entrada
    const incMaxVal = Math.max(...incomeData);
    const incMaxIdx = incomeData.lastIndexOf(incMaxVal);
    const peakX = toX(incMaxIdx);
    const peakY = toY(incMaxVal);
    const tooltipW = 48;
    const tooltipX = Math.min(Math.max(peakX - tooltipW / 2, Y_AXIS_W), width - tooltipW - 4);

    return (
      <View style={{ width, height }}>
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="gi" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.primary} stopOpacity="0.4" />
              <Stop offset="1" stopColor={colors.primary} stopOpacity="0.02" />
            </LinearGradient>
            <LinearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.expense} stopOpacity="0.3" />
              <Stop offset="1" stopColor={colors.expense} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>

          {/* Grid horizontal */}
          {gridVals.map((g, i) => (
            <Line key={i} x1={Y_AXIS_W} y1={g.y} x2={width - 4} y2={g.y}
              stroke={colors.border} strokeWidth={i === N_GRID ? 1 : 0.5}
              strokeDasharray={i === N_GRID ? undefined : "3,5"} opacity={i === N_GRID ? 0.8 : 0.4} />
          ))}

          {/* Áreas */}
          <Path d={expArea} fill="url(#ge)" />
          <Path d={incArea} fill="url(#gi)" />

          {/* Linhas */}
          <Path d={expPath} stroke={colors.expense} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          <Path d={incPath} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />

          {/* Ponto final */}
          <Circle cx={incPts[incPts.length-1].x} cy={incPts[incPts.length-1].y} r={3.5} fill={colors.primary} />
          <Circle cx={expPts[expPts.length-1].x} cy={expPts[expPts.length-1].y} r={3} fill={colors.expense} />

          {/* Tooltip pico entrada */}
          {incMaxVal > 0 && (
            <G>
              <Line x1={peakX} y1={peakY + 6} x2={peakX} y2={baseY}
                stroke={colors.primary} strokeWidth={1} strokeDasharray="2,3" opacity={0.5} />
              <Circle cx={peakX} cy={peakY} r={5} fill={colors.primary} opacity={0.15} />
              <Circle cx={peakX} cy={peakY} r={3.5} fill={colors.primary} />
              <Path d={`M ${tooltipX} ${peakY - 26} h ${tooltipW} a 6 6 0 0 1 6 6 v 14 a 6 6 0 0 1 -6 6 h -${tooltipW} a 6 6 0 0 1 -6 -6 v -14 a 6 6 0 0 1 6 -6 Z`}
                fill={colors.primary} opacity={0.95} />
            </G>
          )}
        </Svg>

        {/* Labels Y */}
        <View style={{ position: 'absolute', left: 0, top: 0, width: Y_AXIS_W - 4, height }}>
          {gridVals.filter((_, i) => i % 2 === 0).map((g, i) => (
            <Text key={i} style={{
              position: 'absolute', top: g.y - 7, right: 0,
              fontSize: 9, fontWeight: '500',
              color: colors.textTertiary, textAlign: 'right',
            }}>{fmtK(g.v)}</Text>
          ))}
        </View>

        {/* Label tooltip */}
        {incMaxVal > 0 && (
          <Text style={{
            position: 'absolute',
            top: peakY - 19,
            left: tooltipX,
            width: tooltipW,
            fontSize: 10, fontWeight: '700',
            color: '#fff', textAlign: 'center',
          }}>
            {fmtK(incMaxVal)}
          </Text>
        )}
      </View>
    );
  }

  // Modo legado: linha única
  const activeStroke = stroke || colors.primary;
  if (!data.length) return <View style={{ width, height }} />;
  const maxVal = niceMax(Math.max(...data, 1));
  const range = maxVal;
  const stepX = chartW / Math.max(data.length - 1, 1);
  const toY = (v: number) => padTop + (1 - v / range) * chartH;
  const pts = data.map((v, i) => ({ x: Y_AXIS_W + i * stepX, y: toY(v) }));
  const path = smoothPath(pts);
  const baseY = toY(0);
  const area = `${path} L ${pts[pts.length-1].x} ${baseY} L ${pts[0].x} ${baseY} Z`;
  const gridVals = Array.from({ length: N_GRID + 1 }, (_, i) => ({
    v: (maxVal * (N_GRID - i)) / N_GRID, y: toY((maxVal * (N_GRID - i)) / N_GRID),
  }));

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={activeStroke} stopOpacity="0.4" />
            <Stop offset="1" stopColor={activeStroke} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {gridVals.map((g, i) => (
          <Line key={i} x1={Y_AXIS_W} y1={g.y} x2={width - 4} y2={g.y}
            stroke={colors.border} strokeWidth={i === N_GRID ? 1 : 0.5}
            strokeDasharray={i === N_GRID ? undefined : "3,5"} opacity={i === N_GRID ? 0.8 : 0.4} />
        ))}
        <Path d={area} fill="url(#lg)" />
        <Path d={path} stroke={activeStroke} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <Circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r={4} fill={activeStroke} />
      </Svg>
      <View style={{ position: 'absolute', left: 0, top: 0, width: Y_AXIS_W - 4, height }}>
        {gridVals.filter((_, i) => i % 2 === 0).map((g, i) => (
          <Text key={i} style={{
            position: 'absolute', top: g.y - 7, right: 0,
            fontSize: 9, fontWeight: '500',
            color: colors.textTertiary, textAlign: 'right',
          }}>{fmtK(g.v)}</Text>
        ))}
      </View>
    </View>
  );
};

type DonutSlice = { value: number; color: string };
type DonutProps = { slices: DonutSlice[]; size: number; thickness?: number; children?: React.ReactNode };

export const DonutChart: React.FC<DonutProps> = ({ slices, size, thickness = 18, children }) => {
  const { colors } = useTheme();
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const radius = size / 2 - thickness / 2;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -Math.PI / 2;
  const paths = slices.map((s, i) => {
    const slice = (s.value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + slice;
    angle = end;
    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);
    const large = slice > Math.PI ? 1 : 0;
    return <Path key={i} d={`M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`}
      stroke={s.color} strokeWidth={thickness} fill="none" strokeLinecap="round" />;
  });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G>
          <Circle cx={cx} cy={cy} r={radius} stroke={colors.surfaceElevated} strokeWidth={thickness} fill="none" />
          {paths}
        </G>
      </Svg>
      {children}
    </View>
  );
};

type BarProps = { values: { income: number; expense: number; label: string }[]; width: number; height: number };
export const BarsChart: React.FC<BarProps> = ({ values, width, height }) => {
  const { colors } = useTheme();
  if (!values.length) return null;
  const max = Math.max(...values.flatMap(v => [v.income, v.expense]), 1);
  const pad = 8;
  const groupW = (width - pad * 2) / values.length;
  const barW = (groupW - 6) / 2;
  return (
    <Svg width={width} height={height}>
      {values.map((v, i) => {
        const xBase = pad + i * groupW + 3;
        const hi = (v.income / max) * (height - pad * 2);
        const he = (v.expense / max) * (height - pad * 2);
        return (
          <G key={i}>
            <Path d={`M ${xBase} ${height-pad-hi} h ${barW} v ${hi} h -${barW} Z`} fill={colors.primary} opacity={0.95} />
            <Path d={`M ${xBase+barW+2} ${height-pad-he} h ${barW} v ${he} h -${barW} Z`} fill={colors.expense} opacity={0.85} />
          </G>
        );
      })}
    </Svg>
  );
};