import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import { theme, fmtBRL } from '../../src/theme';
import { LineChart, DonutChart } from '../../src/components/charts';

const PALETTE = ['#16A34A', '#22D3EE', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const W = Dimensions.get('window').width;

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);

  const load = async () => {
    try {
      const d = await api.dashboard();
      setData(d);
    } catch (e) { /* ignore */ }
  };

  useFocusEffect(useCallback(() => {
    load().finally(() => setLoading(false));
  }, []));

  const onRefresh = async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  };

  if (loading) {
    return <View style={[s.c, { justifyContent: 'center' }]}><ActivityIndicator color={theme.colors.primary} /></View>;
  }

  const evolution = data?.evolution || [];
  const lineData = evolution.map((e: any) => e.income - e.expense);
  const categories = (data?.categories || []).slice(0, 6);

  return (
    <View style={s.c}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greet}>Olá,</Text>
            <Text testID="user-name" style={s.userName}>{user?.name?.split(' ')[0] || 'Bem-vindo'} 👋</Text>
          </View>
          <TouchableOpacity testID="open-settings" style={s.avatar} onPress={() => router.push('/(tabs)/settings')}>
            <Text style={s.avatarTxt}>{user?.name?.[0]?.toUpperCase() || 'N'}</Text>
          </TouchableOpacity>
        </View>

        {/* Balance Card */}
        <View style={s.balanceCard}>
          <LinearGradient colors={['rgba(22,163,74,0.25)', 'rgba(22,163,74,0.05)', 'transparent']} style={StyleSheet.absoluteFill} />
          <View style={s.glowDot} />
          <View style={s.balanceRow}>
            <Text style={s.balanceLabel}>Saldo total</Text>
            <TouchableOpacity onPress={() => setHideBalance(v => !v)}>
              <Ionicons name={hideBalance ? 'eye-off' : 'eye'} size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text testID="balance-value" style={s.balanceValue}>
            {hideBalance ? 'R$ ••••••' : fmtBRL(data?.balance || 0)}
          </Text>
          <View style={s.balanceMetrics}>
            <View style={s.metricMini}>
              <View style={[s.metricDot, { backgroundColor: theme.colors.primary }]} />
              <View>
                <Text style={s.miniLabel}>Entradas</Text>
                <Text style={s.miniVal}>{fmtBRL(data?.month_income || 0)}</Text>
              </View>
            </View>
            <View style={s.metricMini}>
              <View style={[s.metricDot, { backgroundColor: theme.colors.expense }]} />
              <View>
                <Text style={s.miniLabel}>Saídas</Text>
                <Text style={s.miniVal}>{fmtBRL(data?.month_expense || 0)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick actions */}
        <View style={s.quickRow}>
          <Quick testID="qa-add-income" icon="arrow-down-circle" label="Entrada" color={theme.colors.primary}
            onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { open: 'income' } })} />
          <Quick testID="qa-add-expense" icon="arrow-up-circle" label="Saída" color={theme.colors.expense}
            onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { open: 'expense' } })} />
          <Quick testID="qa-add-card" icon="card" label="Cartão" color="#3B82F6"
            onPress={() => router.push({ pathname: '/(tabs)/cards', params: { open: '1' } })} />
          <Quick testID="qa-add-goal" icon="trophy" label="Meta" color="#F59E0B"
            onPress={() => router.push({ pathname: '/(tabs)/goals', params: { open: '1' } })} />
        </View>

        {/* Evolution chart */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Evolução financeira</Text>
            <Text style={s.cardSub}>últimos 6 meses</Text>
          </View>
          {lineData.length ? (
            <>
              <LineChart data={lineData} width={W - 80} height={140} />
              <View style={s.evoLabels}>
                {evolution.map((e: any, i: number) => (
                  <Text key={i} style={s.evoLabel}>{e.month}</Text>
                ))}
              </View>
            </>
          ) : (
            <Text style={s.emptyTxt}>Sem dados ainda. Adicione transações para ver sua evolução.</Text>
          )}
        </View>

        {/* Categories Donut */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Gastos por categoria</Text>
            <Text style={s.cardSub}>este mês</Text>
          </View>
          {categories.length ? (
            <View style={s.donutRow}>
              <DonutChart
                size={140}
                slices={categories.map((c: any, i: number) => ({ value: c.total, color: PALETTE[i % PALETTE.length] }))}
              >
                <View style={{ alignItems: 'center' }}>
                  <Text style={s.donutCenterLabel}>Total</Text>
                  <Text style={s.donutCenterVal}>{fmtBRL(data?.month_expense || 0)}</Text>
                </View>
              </DonutChart>
              <View style={{ flex: 1, marginLeft: 16 }}>
                {categories.map((c: any, i: number) => (
                  <View key={i} style={s.catRow}>
                    <View style={[s.dot, { backgroundColor: PALETTE[i % PALETTE.length] }]} />
                    <Text style={s.catName} numberOfLines={1}>{c.category}</Text>
                    <Text style={s.catVal}>{fmtBRL(c.total)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : <Text style={s.emptyTxt}>Sem gastos categorizados ainda.</Text>}
        </View>

        {/* AI Insight */}
        <TouchableOpacity testID="ai-insight-card" style={s.aiCard} onPress={() => router.push('/(tabs)/chat')} activeOpacity={0.9}>
          <LinearGradient colors={['rgba(22,163,74,0.2)', 'rgba(22,163,74,0.04)']} style={StyleSheet.absoluteFill} />
          <View style={s.aiBadge}>
            <Ionicons name="sparkles" size={14} color="#fff" />
            <Text style={s.aiBadgeTxt}>Nocker IA</Text>
          </View>
          <Text style={s.aiTitle}>Pergunte ao seu assistente financeiro</Text>
          <Text style={s.aiSub}>Analise gastos, planeje metas e receba insights inteligentes em segundos.</Text>
          <View style={s.aiCta}>
            <Text style={s.aiCtaTxt}>Conversar agora</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.colors.primary} />
          </View>
        </TouchableOpacity>

        {/* Recent transactions */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Últimas transações</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
              <Text style={s.linkTxt}>Ver tudo</Text>
            </TouchableOpacity>
          </View>
          {(data?.recent || []).length ? (data.recent.map((t: any) => (
            <View key={t.id} style={s.txRow}>
              <View style={[s.txIcon, { backgroundColor: t.type === 'income' ? theme.colors.successSoft : theme.colors.expenseSoft }]}>
                <Ionicons name={t.type === 'income' ? 'arrow-down' : 'arrow-up'} size={16}
                  color={t.type === 'income' ? theme.colors.primary : theme.colors.expense} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.txTitle}>{t.description}</Text>
                <Text style={s.txSub}>{t.category}</Text>
              </View>
              <Text style={[s.txAmt, { color: t.type === 'income' ? theme.colors.primary : '#fff' }]}>
                {t.type === 'income' ? '+' : '-'} {fmtBRL(t.amount)}
              </Text>
            </View>
          ))) : <Text style={s.emptyTxt}>Nenhuma transação ainda.</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

function Quick({ icon, label, color, onPress, testID }: any) {
  return (
    <TouchableOpacity testID={testID} style={s.quick} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.quickIcon, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={s.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  greet: { color: theme.colors.textSecondary, fontSize: 13 },
  userName: { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: theme.colors.primary, fontWeight: '800', fontSize: 17 },
  balanceCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, padding: 22,
    borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden',
  },
  glowDot: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70,
    backgroundColor: theme.colors.primaryGlow },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { color: theme.colors.textSecondary, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  balanceValue: { color: '#fff', fontSize: 36, fontWeight: '800', letterSpacing: -1, marginTop: 6 },
  balanceMetrics: { flexDirection: 'row', gap: 24, marginTop: 18 },
  metricMini: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricDot: { width: 8, height: 8, borderRadius: 4 },
  miniLabel: { color: theme.colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  miniVal: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 2 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, gap: 10 },
  quick: { flex: 1, alignItems: 'center', gap: 8 },
  quickIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  quickLabel: { color: '#fff', fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, padding: 18, marginTop: 18,
    borderWidth: 1, borderColor: theme.colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cardSub: { color: theme.colors.textTertiary, fontSize: 12 },
  linkTxt: { color: theme.colors.primary, fontSize: 12, fontWeight: '700' },
  emptyTxt: { color: theme.colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  evoLabels: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 },
  evoLabel: { color: theme.colors.textTertiary, fontSize: 10 },
  donutRow: { flexDirection: 'row', alignItems: 'center' },
  donutCenterLabel: { color: theme.colors.textTertiary, fontSize: 10, textTransform: 'uppercase' },
  donutCenterVal: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 2 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  catName: { color: '#fff', flex: 1, fontSize: 12 },
  catVal: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  aiCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.xl, padding: 20, marginTop: 18,
    borderWidth: 1, borderColor: 'rgba(22,163,74,0.3)', overflow: 'hidden' },
  aiBadge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6,
    backgroundColor: theme.colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  aiBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  aiTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 12 },
  aiSub: { color: theme.colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 19 },
  aiCta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  aiCtaTxt: { color: theme.colors.primary, fontWeight: '700', fontSize: 13 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  txTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  txSub: { color: theme.colors.textTertiary, fontSize: 12, marginTop: 2 },
  txAmt: { fontSize: 14, fontWeight: '700' },
});
