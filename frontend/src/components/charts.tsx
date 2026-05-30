import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, G } from 'react-native-svg';
import { useTheme } from '../ThemeContext';

type LineProps = {
  data: number[];
  width: number;
  height: number;
  stroke?: string;
  // Nova prop: dados de duas séries independentes
  incomeData?: number[];
  expenseData?: number[];
};

export const LineChart: React.FC<LineProps> = ({ data, width, height, stroke, incomeData, expenseData }) => {
  const { colors } = useTheme();

  // Modo dual: duas linhas (entrada verde + saída vermelha)
  if (incomeData && expenseData) {
    const allValues = [...incomeData, ...expenseData, 0];
    const max = Math.max(...allValues, 1);
    const min = Math.min(...allValues, 0);
    const range = max - min || 1;
    const pad = 8;
    const len = Math.max(incomeData.length, expenseData.length);
    const stepX = (width - pad * 2) / Math.max(len - 1, 1);

    const toPoints = (arr: number[]) =>
      arr.map((v, i) => ({
        x: pad + i * stepX,
        y: pad + (1 - (v - min) / range) * (height - pad * 2),
      }));

    const buildPath = (pts: { x: number; y: number }[]) =>
      pts.reduce((acc, p, i, arr) => {
        if (i === 0) return `M ${p.x} ${p.y}`;
        const prev = arr[i - 1];
        const cx = (prev.x + p.x) / 2;
        return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
      }, '');

    const buildArea = (pts: { x: number; y: number }[], path: string) =>
      `${path} L ${pts[pts.length - 1].x} ${height - pad} L ${pts[0].x} ${height - pad} Z`;

    const incPts = toPoints(incomeData);
    const expPts = toPoints(expenseData);
    const incPath = buildPath(incPts);
    const expPath = buildPath(expPts);
    const incArea = buildArea(incPts, incPath);
    const expArea = buildArea(expPts, expPath);

    return (
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="lgInc" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.primary} stopOpacity="0.3" />
            <Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="lgExp" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.expense} stopOpacity="0.25" />
            <Stop offset="1" stopColor={colors.expense} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Áreas preenchidas */}
        <Path d={expArea} fill="url(#lgExp)" />
        <Path d={incArea} fill="url(#lgInc)" />

        {/* Linha de saída (vermelha) */}
        <Path d={expPath} stroke={colors.expense} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {expPts.map((p, i) => (
          <Circle key={`e${i}`} cx={p.x} cy={p.y} r={i === expPts.length - 1 ? 4 : 0} fill={colors.expense} />
        ))}

        {/* Linha de entrada (verde) — renderizada por cima */}
        <Path d={incPath} stroke={colors.primary} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        {incPts.map((p, i) => (
          <Circle key={`i${i}`} cx={p.x} cy={p.y} r={i === incPts.length - 1 ? 4 : 0} fill={colors.primary} />
        ))}
      </Svg>
    );
  }

  // Modo legado: linha única (compatibilidade com código antigo)
  const activeStroke = stroke || colors.primary;
  if (!data.length) return <View style={{ width, height }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pad = 8;
  const stepX = (width - pad * 2) / Math.max(data.length - 1, 1);
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return { x, y };
  });
  const path = points.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = arr[i - 1];
    const cx = (prev.x + p.x) / 2;
    return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
  }, '');
  const areaPath = `${path} L ${points[points.length - 1].x} ${height - pad} L ${points[0].x} ${height - pad} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={activeStroke} stopOpacity="0.35" />
          <Stop offset="1" stopColor={activeStroke} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill="url(#lg)" />
      <Path d={path} stroke={activeStroke} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      {points.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 4 : 0} fill={activeStroke} />
      ))}
    </Svg>
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
    const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
    return <Path key={i} d={d} stroke={s.color} strokeWidth={thickness} fill="none" strokeLinecap="round" />;
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
            <Path d={`M ${xBase} ${height - pad - hi} h ${barW} v ${hi} h -${barW} Z`} fill={colors.primary} opacity={0.95} />
            <Path d={`M ${xBase + barW + 2} ${height - pad - he} h ${barW} v ${he} h -${barW} Z`} fill={colors.expense} opacity={0.85} />
          </G>
        );
      })}
    </Svg>
  );
};
