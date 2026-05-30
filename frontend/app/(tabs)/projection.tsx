import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { fmtBRL } from '../../src/theme';
import { useTheme } from '../../src/ThemeContext';
import { SubHeader } from '../../src/components/SubHeader';
import { LineChart } from '../../src/components/charts';

const W = Dimensions.get('window').width;
const RANGES = [
  { months: 3, label: '3 meses' },
  { months: 6, label: '6 meses' },
  { months: 12, label: '1 ano' },
];

export default function Projection() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(6);

  const load = async (months: number) => {
    setLoading(true);
    try { setData(await api.projection(months)); } catch { /* ignore */ } finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(range); }, [range]));

  const positive = (data?.monthly_net || 0) >= 0;
  const projValues = (data?.projection || []).map((p: any) => p.projected_balance);
  const finalBalance = projValues.length ? projValues[projValues.length - 1] : (data?.current_balance || 0);

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      <SubHeader title="Projeção Financeira" subtitle="Previsão do seu futuro financeiro" />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={s.rangeRow}>
          {RANGES.map(r => (
            <TouchableOpacity key={r.months} style={[s.rangeBtn, range === r.months && s.rangeActive]} onPress={() => setRange(r.months)}>
              <Text style={[s.rangeTxt, range === r.months && { color: '#fff' }]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        ) : data ? (
          <>
            <View style={s.heroCard}>
              <LinearGradient colors={[positive ? 'rgba(22,163,74,0.25)' : 'rgba(239,68,68,0.18)', 'transparent']} style={StyleSheet.absoluteFill} />
              <Text style={s.heroLabel}>Saldo projetado em {range} {range === 1 ? 'mês' : 'meses'}</Text>
              <Text style={[s.heroVal, { color: positive ? colors.primary : colors.expense }]}>{fmtBRL(finalBalance)}</Text>
              <View style={s.netRow}>
                <Ionicons name={positive ? 'trending-up' : 'trending-down'} size={16} color={positive ? colors.primary : colors.expense} />
                <Text style={[s.netTxt, { color: positive ? colors.primary : colors.expense }]}>
                  {positive ? '+' : ''}{fmtBRL(data.monthly_net)} por mês
                </Text>
              </View>
            </View>

            <View style={s.chartCard}>
              <Text style={s.cardTitle}>Evolução prevista</Text>
              {projValues.length > 0 && (
                <>
                  <LineChart data={[data.current_balance, ...projValues]} width={W - 80} height={160}
                    stroke={positive ? colors.primary : colors.expense} />
                  <View style={s.labelsRow}>
                    <Text style={s.evoLabel}>Hoje</Text>
                    {data.projection.map((p: any, i: number) => (
                      i % Math.ceil(data.projection.length / 4) === 0 ? <Text key={i} style={s.evoLabel}>{p.month}</Text> : null
                    ))}
                  </View>
                </>
              )}
            </View>

            <View style={s.metricsGrid}>
              <View style={s.metric}>
                <Text style={s.metricLabel}>Saldo atual</Text>
                <Text style={s.metricVal}>{fmtBRL(data.current_balance)}</Text>
              </View>
              <View style={s.metric}>
                <Text style={s.metricLabel}>Receita média/mês</Text>
                <Text style={[s.metricVal, { color: colors.primary }]}>{fmtBRL(data.avg_monthly_income)}</Text>
              </View>
              <View style={s.metric}>
                <Text style={s.metricLabel}>Despesa média/mês</Text>
                <Text style={[s.metricVal, { color: colors.expense }]}>{fmtBRL(data.avg_monthly_expense)}</Text>
              </View>
              <View style={s.metric}>
                <Text style={s.metricLabel}>Saldo mensal</Text>
                <Text style={[s.metricVal, { color: positive ? colors.primary : colors.expense }]}>
                  {positive ? '+' : ''}{fmtBRL(data.monthly_net)}
                </Text>
              </View>
            </View>

            <View style={s.breakdown}>
              <Text style={s.breakdownTitle}>Compromissos mensais</Text>
              <BreakdownRow icon="calendar" color={colors.expense} label="Gastos fixos" value={data.fixed_total} />
              <BreakdownRow icon="repeat" color="#8B5CF6" label="Assinaturas" value={data.subscriptions_monthly} />
              <BreakdownRow icon="layers" color="#3B82F6" label="Parcelados" value={data.installments_monthly} />
              <View style={s.divider} />
              <BreakdownRow icon="receipt" color={colors.textSecondary} label="Total comprometido"
                value={data.fixed_total + data.subscriptions_monthly + data.installments_monthly} bold />
            </View>

            <View style={s.tipCard}>
              <Ionicons name="bulb" size={20} color={colors.warning} />
              <Text style={s.tipTxt}>
                {positive
                  ? 'Você está economizando! Continue assim e considere investir o excedente para acelerar suas metas.'
                  : 'Atenção: suas despesas estão acima das receitas. Revise gastos fixos e assinaturas para equilibrar o orçamento.'}
              </Text>
            </View>
          </>
        ) : (
          <Text style={s.empty}>Sem dados para projeção.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function BreakdownRow({ icon, color, label, value, bold }: any) {
  return (
    <View style={s.bRow}>
      <View style={[s.bIcon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={[s.bLabel, bold && { color: '#fff', fontWeight: '700' }]}>{label}</Text>
      <Text style={[s.bVal, bold && { fontWeight: '800' }]}>{fmtBRL(value)}</Text>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  rangeBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
  rangeActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rangeTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: 12 },
  heroCard: { borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  heroLabel: { color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  heroVal: { fontSize: 36, fontWeight: '800', letterSpacing: -1, marginTop: 6 },
  netRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  netTxt: { fontSize: 13, fontWeight: '700' },
  chartCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, marginTop: 14, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  labelsRow: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 },
  evoLabel: { color: colors.textTertiary, fontSize: 10 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 14 },
  metric: { width: '48%', backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  metricLabel: { color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricVal: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 4 },
  breakdown: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, marginTop: 6, borderWidth: 1, borderColor: colors.border },
  breakdownTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  bRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  bIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bLabel: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  bVal: { color: '#fff', fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  tipCard: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', marginTop: 14 },
  tipTxt: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 18 },
  empty: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 40 },
});
