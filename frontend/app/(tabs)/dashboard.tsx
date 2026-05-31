import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, Dimensions, Modal, Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { useAuth } from '../../src/AuthContext';
import { useTheme } from '../../src/ThemeContext';
import { LineChart, DonutChart } from '../../src/components/charts';
import {
  AppNotification,
  buildFinancialNotifications,
  countUnread,
  getReadNotificationIds,
  markNotificationsRead,
} from '../../src/notifications';

const PALETTE = ['#16A34A', '#22D3EE', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const W = Dimensions.get('window').width;

type Period = 'day' | 'week' | 'month';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function buildChartData(transactions: any[], period: Period, offset: number) {
  const now = new Date();

  if (period === 'day') {
    const target = new Date(now);
    target.setDate(target.getDate() + offset);
    const hours: { label: string; income: number; expense: number }[] = [];
    for (let h = 0; h < 24; h++) {
      hours.push({ label: `${String(h).padStart(2, '0')}h`, income: 0, expense: 0 });
    }
    transactions.forEach(tx => {
      const d = new Date(tx.date);
      if (isSameDay(d, target)) {
        const h = d.getHours();
        if (tx.type === 'income') hours[h].income += tx.amount;
        else hours[h].expense += tx.amount;
      }
    });
    const limit = isSameDay(target, now) ? now.getHours() + 1 : 24;
    return { points: hours.slice(0, limit), target };
  }

  if (period === 'week') {
    // início da semana = segunda-feira
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay(); // 0=dom
    const diff = day === 0 ? -6 : 1 - day;
    startOfWeek.setDate(startOfWeek.getDate() + diff + offset * 7);
    const days: { label: string; income: number; expense: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      days.push({
        label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        income: 0, expense: 0,
        _date: d.toDateString(),
      } as any);
    }
    transactions.forEach(tx => {
      const txDate = new Date(tx.date);
      days.forEach((day: any) => {
        if (txDate.toDateString() === day._date) {
          if (tx.type === 'income') day.income += tx.amount;
          else day.expense += tx.amount;
        }
      });
    });
    return { points: days, target: startOfWeek };
  }

  // month
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const days: { label: string; income: number; expense: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ label: `${d}`, income: 0, expense: 0 });
  }
  transactions.forEach(tx => {
    const txDate = new Date(tx.date);
    if (txDate.getMonth() === target.getMonth() && txDate.getFullYear() === target.getFullYear()) {
      const idx = txDate.getDate() - 1;
      if (tx.type === 'income') days[idx].income += tx.amount;
      else days[idx].expense += tx.amount;
    }
  });
  return { points: days, target };
}

function buildCategoryData(transactions: any[], period: Period, offset: number) {
  const now = new Date();
  const expenses = transactions.filter(tx => tx.type === 'expense');

  const inRange = (date: Date): boolean => {
    if (period === 'day') {
      const target = new Date(now);
      target.setDate(target.getDate() + offset);
      return isSameDay(date, target);
    }
    if (period === 'week') {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      startOfWeek.setDate(startOfWeek.getDate() + diff + offset * 7);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      return date >= startOfWeek && date < endOfWeek;
    }
    // month
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return date.getMonth() === target.getMonth() && date.getFullYear() === target.getFullYear();
  };

  const totals: Record<string, number> = {};
  let totalExpense = 0;
  expenses.forEach(tx => {
    const d = new Date(tx.date);
    if (inRange(d)) {
      totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
      totalExpense += tx.amount;
    }
  });

  const list = Object.entries(totals)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  return { categories: list, totalExpense };
}

function getPeriodLabel(period: Period, offset: number): string {
  const now = new Date();
  if (period === 'day') {
    const target = new Date(now);
    target.setDate(target.getDate() + offset);
    if (offset === 0) return 'Hoje';
    if (offset === -1) return 'Ontem';
    return target.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  if (period === 'week') {
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    startOfWeek.setDate(startOfWeek.getDate() + diff + offset * 7);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${fmt(startOfWeek)} – ${fmt(endOfWeek)}`;
  }
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return target.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase());
}

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { colors, t, themeMode } = useTheme();
  const s = makeStyles(colors, themeMode);
  const [data, setData] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [period, setPeriod] = useState<Period>('month');
  const [offset, setOffset] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifModal, setNotifModal] = useState(false);

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const loadNotifications = async (dashboardData: any, txs: any[]) => {
    try {
      const [settings, limits, alerts] = await Promise.all([
        api.getFinancialSettings(),
        api.listCategoryLimits(),
        api.listSpendingAlerts(),
      ]);
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const categorySpending: Record<string, number> = {};
      for (const tx of txs) {
        if (tx.type !== 'expense') continue;
        if (new Date(tx.date) >= monthStart) {
          categorySpending[tx.category] = (categorySpending[tx.category] || 0) + tx.amount;
        }
      }
      const built = buildFinancialNotifications({
        monthExpense: dashboardData?.month_expense || 0,
        monthIncome: dashboardData?.month_income || 0,
        settings,
        categoryLimits: limits,
        categorySpending,
        alerts,
      });
      const readIds = await getReadNotificationIds();
      setNotifications(built);
      setUnreadCount(countUnread(built, readIds));
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  const load = async () => {
    try {
      const [d, txs] = await Promise.all([api.dashboard(), api.listTransactions()]);
      setData(d);
      setTransactions(txs);
      await loadNotifications(d, txs);
    } catch (e) { /* ignore */ }
  };

  const openNotifications = async () => {
    setNotifModal(true);
    if (notifications.length > 0) {
      await markNotificationsRead(notifications.map(n => n.id));
      setUnreadCount(0);
    }
  };

  useFocusEffect(useCallback(() => {
    load().finally(() => setLoading(false));
  }, []));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const changePeriod = (p: Period) => { setPeriod(p); setOffset(0); };

  if (loading) {
    return <View style={[s.c, { justifyContent: 'center' }]}><ActivityIndicator color={colors.primary} /></View>;
  }

  const { points: chartPoints } = buildChartData(transactions, period, offset);
  const lineData = chartPoints.map((d: any) => d.income - d.expense);
  const incomeLineData = chartPoints.map((d: any) => d.income);
  const expenseLineData = chartPoints.map((d: any) => d.expense);
  const chartLabels = chartPoints.map((d: any) => d.label);

  const { categories: periodCategories, totalExpense: periodTotalExpense } =
    buildCategoryData(transactions, period, offset);

  const labelStep = period === 'month' ? 5 : period === 'day' ? 4 : 1;
  const visibleLabels = chartLabels.filter((_: any, i: number) => i % labelStep === 0 || i === chartLabels.length - 1);

  const periodStats = chartPoints.reduce((acc: any, d: any) => ({
    income: acc.income + d.income,
    expense: acc.expense + d.expense,
  }), { income: 0, expense: 0 });

  const isToday = offset === 0;

  return (
    <View style={s.c}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greet}>Olá, {getGreeting()} 👋</Text>
            <Text testID="user-name" style={s.userName}>{user?.name?.split(' ')[0] || 'Bem-vindo'}</Text>
          </View>
          <View style={s.headerActions}>
            <TouchableOpacity testID="open-notifications" style={s.bellBtn} onPress={openNotifications} activeOpacity={0.8}>
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
              {unreadCount > 0 && (
                <View style={s.bellBadge}>
                  <Text style={s.bellBadgeTxt}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity testID="open-settings" style={s.avatar} onPress={() => router.push('/(tabs)/settings')}>
              {user?.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={s.avatarImg} />
              ) : (
                <Text style={s.avatarTxt}>{user?.name?.[0]?.toUpperCase() || 'N'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Balance Card */}
        <View style={s.balanceCard}>
          <LinearGradient colors={themeMode === 'dark' ? ['rgba(22,163,74,0.25)', 'rgba(22,163,74,0.05)', 'transparent'] : ['rgba(22,163,74,0.1)', 'rgba(22,163,74,0.02)', 'transparent']} style={StyleSheet.absoluteFill} />
          <View style={s.glowDot} />
          <View style={s.balanceRow}>
            <Text style={s.balanceLabel}>{t.totalBalance}</Text>
            <TouchableOpacity onPress={() => setHideBalance(v => !v)}>
              <Ionicons name={hideBalance ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text testID="balance-value" style={s.balanceValue}>
            {hideBalance ? 'R$ ••••••' : fmtBRL(data?.balance || 0)}
          </Text>
          <View style={s.balanceMetrics}>
            <View style={s.metricMini}>
              <View style={[s.metricDot, { backgroundColor: colors.primary }]} />
              <View>
                <Text style={s.miniLabel}>{t.entries}</Text>
                <Text style={s.miniVal}>{fmtBRL(data?.month_income || 0)}</Text>
              </View>
            </View>
            <View style={s.metricMini}>
              <View style={[s.metricDot, { backgroundColor: colors.expense }]} />
              <View>
                <Text style={s.miniLabel}>{t.exits}</Text>
                <Text style={s.miniVal}>{fmtBRL(data?.month_expense || 0)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick actions */}
        <View style={s.quickRow}>
          <Quick testID="qa-add-income" icon="arrow-down-circle" label={t.entries} color={colors.primary}
            onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { open: 'income' } })} />
          <Quick testID="qa-add-expense" icon="arrow-up-circle" label={t.exits} color={colors.expense}
            onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { open: 'expense' } })} />
          <Quick testID="qa-add-card" icon="card" label={t.cards} color="#3B82F6"
            onPress={() => router.push({ pathname: '/(tabs)/cards', params: { open: '1' } })} />
          <Quick testID="qa-add-goal" icon="trophy" label="Meta" color="#F59E0B"
            onPress={() => router.push({ pathname: '/(tabs)/goals', params: { open: '1' } })} />
        </View>

        {/* Evolution chart */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>{t.financialEvolution}</Text>
          </View>

          {/* Period selector */}
          <View style={s.periodRow}>
            {(['day', 'week', 'month'] as Period[]).map(p => (
              <TouchableOpacity key={p} style={[s.periodChip, period === p && s.periodChipActive]} onPress={() => changePeriod(p)}>
                <Text style={[s.periodChipTxt, period === p && s.periodChipTxtActive]}>
                  {p === 'day' ? 'Dia' : p === 'week' ? 'Semana' : 'Mês'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Navigator */}
          <View style={s.navRow}>
            <TouchableOpacity style={s.navBtn} onPress={() => setOffset(o => o - 1)}>
              <Ionicons name="chevron-back" size={18} color={colors.primary} />
            </TouchableOpacity>
            <Text style={s.navLabel}>{getPeriodLabel(period, offset)}</Text>
            <TouchableOpacity style={s.navBtn} onPress={() => setOffset(o => o + 1)} disabled={isToday && period === 'day'}>
              <Ionicons name="chevron-forward" size={18} color={isToday && period === 'day' ? colors.border : colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Mini stats */}
          <View style={s.periodStats}>
            <View style={s.periodStat}>
              <Text style={s.periodStatLabel}>Entradas</Text>
              <Text style={[s.periodStatVal, { color: colors.primary }]}>{fmtBRL(periodStats.income)}</Text>
            </View>
            <View style={s.periodStatDivider} />
            <View style={s.periodStat}>
              <Text style={s.periodStatLabel}>Saídas</Text>
              <Text style={[s.periodStatVal, { color: colors.expense }]}>{fmtBRL(periodStats.expense)}</Text>
            </View>
            <View style={s.periodStatDivider} />
            <View style={s.periodStat}>
              <Text style={s.periodStatLabel}>Saldo</Text>
              <Text style={[s.periodStatVal, { color: periodStats.income - periodStats.expense >= 0 ? colors.primary : colors.expense }]}>
                {fmtBRL(periodStats.income - periodStats.expense)}
              </Text>
            </View>
          </View>

          {(incomeLineData.some((v: number) => v !== 0) || expenseLineData.some((v: number) => v !== 0)) ? (
            <>
              {/* Legenda */}
              <View style={s.chartLegend}>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: colors.primary }]} />
                  <Text style={s.legendTxt}>Entradas</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: colors.expense }]} />
                  <Text style={s.legendTxt}>Saídas</Text>
                </View>
              </View>

              <LineChart
                data={[]}
                incomeData={incomeLineData}
                expenseData={expenseLineData}
                width={W - 80}
                height={140}
              />
              <View style={s.evoLabels}>
                {visibleLabels.map((label: string, i: number) => (
                  <Text key={i} style={s.evoLabel}>{label}</Text>
                ))}
              </View>
            </>
          ) : (
            <Text style={s.emptyTxt}>Sem transações neste período.</Text>
          )}
        </View>

        {/* Categories Donut */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>{t.expensesByCategory}</Text>
            <Text style={s.cardSub}>{getPeriodLabel(period, offset)}</Text>
          </View>
          {periodCategories.length ? (
            <View style={s.donutRow}>
              <DonutChart size={140} slices={periodCategories.slice(0, 6).map((c: any, i: number) => ({ value: c.total, color: PALETTE[i % PALETTE.length] }))}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={s.donutCenterLabel}>Total</Text>
                  <Text style={s.donutCenterVal}>{fmtBRL(periodTotalExpense)}</Text>
                </View>
              </DonutChart>
              <View style={{ flex: 1, marginLeft: 16 }}>
                {periodCategories.slice(0, 6).map((c: any, i: number) => (
                  <View key={i} style={s.catRow}>
                    <View style={[s.dot, { backgroundColor: PALETTE[i % PALETTE.length] }]} />
                    <Text style={s.catName} numberOfLines={1}>{c.category}</Text>
                    <Text style={s.catVal}>{fmtBRL(c.total)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : <Text style={s.emptyTxt}>{t.noTransactions}</Text>}
        </View>

        {/* AI Insight */}
        <TouchableOpacity testID="ai-insight-card" style={s.aiCard} onPress={() => router.push('/(tabs)/chat')} activeOpacity={0.9}>
          <LinearGradient colors={themeMode === 'dark' ? ['rgba(22,163,74,0.2)', 'rgba(22,163,74,0.04)'] : ['rgba(22,163,74,0.1)', 'rgba(22,163,74,0.02)']} style={StyleSheet.absoluteFill} />
          <View style={s.aiBadge}>
            <Ionicons name="sparkles" size={14} color="#fff" />
            <Text style={s.aiBadgeTxt}>{t.nockerIA}</Text>
          </View>
          <Text style={s.aiTitle}>Pergunte ao seu assistente financeiro</Text>
          <Text style={s.aiSub}>{t.iaPrompt}</Text>
          <View style={s.aiCta}>
            <Text style={s.aiCtaTxt}>Conversar agora</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.primary} />
          </View>
        </TouchableOpacity>

        {/* Recent transactions */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>{t.lastTransactions}</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
              <Text style={s.linkTxt}>Ver tudo</Text>
            </TouchableOpacity>
          </View>
          {(data?.recent || []).length ? (data.recent.map((t_item: any) => (
            <View key={t_item.id} style={s.txRow}>
              <View style={[s.txIcon, { backgroundColor: t_item.type === 'income' ? colors.successSoft : colors.expenseSoft }]}>
                <Ionicons name={t_item.type === 'income' ? 'arrow-down' : 'arrow-up'} size={16}
                  color={t_item.type === 'income' ? colors.primary : colors.expense} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.txTitle}>{t_item.description}</Text>
                <Text style={s.txSub}>{t_item.category}</Text>
              </View>
              <Text style={[s.txAmt, { color: t_item.type === 'income' ? colors.primary : colors.text }]}>
                {t_item.type === 'income' ? '+' : '-'} {fmtBRL(t_item.amount)}
              </Text>
            </View>
          ))) : <Text style={s.emptyTxt}>{t.noTransactions}</Text>}
        </View>
      </ScrollView>

      {/* Notificações */}
      <Modal visible={notifModal} transparent animationType="slide" onRequestClose={() => setNotifModal(false)}>
        <View style={s.notifRoot}>
          <TouchableOpacity style={s.notifBackdrop} activeOpacity={1} onPress={() => setNotifModal(false)} />
          <View style={[s.notifSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.notifHandle} />
            <View style={s.notifHeader}>
              <Text style={s.notifTitle}>Notificações</Text>
              <TouchableOpacity onPress={() => setNotifModal(false)} style={s.notifClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {notifications.length === 0 ? (
              <View style={s.notifEmpty}>
                <Ionicons name="notifications-off-outline" size={40} color={colors.textTertiary} />
                <Text style={s.notifEmptyTxt}>Nenhum alerta no momento</Text>
                <Text style={s.notifEmptySub}>
                  Ative alertas em Configurações → Financeiro → Alertas para ser avisado sobre seus limites.
                </Text>
                <TouchableOpacity
                  style={s.notifSettingsBtn}
                  onPress={() => { setNotifModal(false); router.push('/(tabs)/settings'); }}
                >
                  <Text style={s.notifSettingsTxt}>Ir para configurações</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {notifications.map(n => {
                  const color = n.severity === 'danger' ? colors.expense
                    : n.severity === 'success' ? colors.primary
                    : colors.warning;
                  return (
                    <View key={n.id} style={s.notifItem}>
                      <View style={[s.notifIcon, { backgroundColor: `${color}22` }]}>
                        <Ionicons name={n.icon} size={20} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.notifItemTitle}>{n.title}</Text>
                        <Text style={s.notifItemMsg}>{n.message}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Quick({ icon, label, color, onPress, testID }: any) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity testID={testID} style={s_quick.quick} onPress={onPress} activeOpacity={0.85}>
      <View style={[s_quick.quickIcon, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[s_quick.quickLabel, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s_quick = StyleSheet.create({
  quick: { flex: 1, alignItems: 'center', gap: 8 },
  quickIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  quickLabel: { fontSize: 12, fontWeight: '600' },
});

const makeStyles = (colors: any, themeMode: string) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.expense, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    borderWidth: 2, borderColor: colors.bg },
  bellBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  greet: { color: colors.textSecondary, fontSize: 13 },
  userName: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarTxt: { color: colors.primary, fontWeight: '800', fontSize: 17 },
  balanceCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 22,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  glowDot: { position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: colors.primaryGlow },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceLabel: { color: colors.textSecondary, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  balanceValue: { color: colors.text, fontSize: 36, fontWeight: '800', letterSpacing: -1, marginTop: 6 },
  balanceMetrics: { flexDirection: 'row', gap: 24, marginTop: 18 },
  metricMini: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricDot: { width: 8, height: 8, borderRadius: 4 },
  miniLabel: { color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  miniVal: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, marginTop: 18, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardSub: { color: colors.textTertiary, fontSize: 12 },
  linkTxt: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  emptyTxt: { color: colors.textTertiary, fontSize: 13, textAlign: 'center', paddingVertical: 16 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  periodChip: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  periodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  periodChipTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  periodChipTxtActive: { color: '#fff' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 6, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  navBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  navLabel: { color: colors.text, fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'center' },
  periodStats: { flexDirection: 'row', backgroundColor: colors.surfaceElevated, borderRadius: 14,
    padding: 12, marginBottom: 14, borderWidth: 1, borderColor: colors.border },
  periodStat: { flex: 1, alignItems: 'center' },
  periodStatLabel: { color: colors.textTertiary, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  periodStatVal: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  periodStatDivider: { width: 1, backgroundColor: colors.border },
  chartLegend: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  evoLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 4 },
  evoLabel: { color: colors.textTertiary, fontSize: 10 },
  donutRow: { flexDirection: 'row', alignItems: 'center' },
  donutCenterLabel: { color: colors.textTertiary, fontSize: 10, textTransform: 'uppercase' },
  donutCenterVal: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  dot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  catName: { color: colors.text, flex: 1, fontSize: 12 },
  catVal: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  aiCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, marginTop: 18,
    borderWidth: 1, borderColor: 'rgba(22,163,74,0.3)', overflow: 'hidden' },
  aiBadge: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  aiBadgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  aiTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 12 },
  aiSub: { color: colors.textSecondary, fontSize: 13, marginTop: 6, lineHeight: 19 },
  aiCta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  aiCtaTxt: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  txTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  txSub: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  txAmt: { fontSize: 14, fontWeight: '700' },
  notifRoot: { flex: 1, justifyContent: 'flex-end' },
  notifBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  notifSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 12, maxHeight: '70%' },
  notifHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  notifHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  notifTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  notifClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  notifEmpty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 12, gap: 8 },
  notifEmptyTxt: { color: colors.text, fontSize: 16, fontWeight: '600', marginTop: 8 },
  notifEmptySub: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  notifSettingsBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999,
    borderWidth: 1, borderColor: colors.primary },
  notifSettingsTxt: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  notifItem: { flexDirection: 'row', gap: 12, padding: 14, marginBottom: 8, backgroundColor: colors.surfaceElevated,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  notifIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifItemTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  notifItemMsg: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
});
