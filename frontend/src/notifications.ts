import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppNotification = {
  id: string;
  type: 'monthly_limit' | 'category_limit' | 'income_goal';
  title: string;
  message: string;
  severity: 'warning' | 'success' | 'danger';
  icon: 'wallet-outline' | 'pricetag-outline' | 'trending-up-outline';
};

const READ_KEY = 'nocker_read_notifications';

function monthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function buildFinancialNotifications(params: {
  monthExpense: number;
  monthIncome: number;
  settings: { monthly_income: number; monthly_limit: number };
  categoryLimits: Array<{ category_name: string; monthly_limit: number }>;
  categorySpending: Record<string, number>;
  alerts: Array<{ type: string; threshold_pct: number; active: boolean }>;
}): AppNotification[] {
  const key = monthKey();
  const notifications: AppNotification[] = [];
  const alertMap = Object.fromEntries(params.alerts.map(a => [a.type, a]));

  const monthlyAlert = alertMap['monthly_limit'];
  if (monthlyAlert?.active && params.settings.monthly_limit > 0) {
    const pct = (params.monthExpense / params.settings.monthly_limit) * 100;
    if (pct >= monthlyAlert.threshold_pct) {
      notifications.push({
        id: `monthly_limit-${key}`,
        type: 'monthly_limit',
        title: pct >= 100 ? 'Limite mensal ultrapassado' : 'Limite mensal atingido',
        message: `Você gastou ${fmtBRL(params.monthExpense)} (${pct.toFixed(0)}% do limite de ${fmtBRL(params.settings.monthly_limit)}).`,
        severity: pct >= 100 ? 'danger' : 'warning',
        icon: 'wallet-outline',
      });
    }
  }

  const catAlert = alertMap['category_limit'];
  if (catAlert?.active) {
    for (const limit of params.categoryLimits) {
      if (limit.monthly_limit <= 0) continue;
      const spent = params.categorySpending[limit.category_name] || 0;
      const pct = (spent / limit.monthly_limit) * 100;
      if (pct >= catAlert.threshold_pct) {
        notifications.push({
          id: `category_limit-${key}-${limit.category_name}`,
          type: 'category_limit',
          title: `${limit.category_name}: limite ${pct >= 100 ? 'ultrapassado' : 'atingido'}`,
          message: `Gasto de ${fmtBRL(spent)} (${pct.toFixed(0)}% do limite de ${fmtBRL(limit.monthly_limit)}/mês).`,
          severity: pct >= 100 ? 'danger' : 'warning',
          icon: 'pricetag-outline',
        });
      }
    }
  }

  const incomeAlert = alertMap['income_goal'];
  if (incomeAlert?.active && params.settings.monthly_income > 0) {
    const pct = (params.monthIncome / params.settings.monthly_income) * 100;
    if (pct >= incomeAlert.threshold_pct) {
      notifications.push({
        id: `income_goal-${key}`,
        type: 'income_goal',
        title: 'Meta de receita atingida',
        message: `Receita de ${fmtBRL(params.monthIncome)} (${pct.toFixed(0)}% da meta de ${fmtBRL(params.settings.monthly_income)}).`,
        severity: 'success',
        icon: 'trending-up-outline',
      });
    }
  }

  return notifications;
}

export async function getReadNotificationIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export async function markNotificationsRead(ids: string[]) {
  const current = await getReadNotificationIds();
  ids.forEach(id => current.add(id));
  await AsyncStorage.setItem(READ_KEY, JSON.stringify([...current]));
}

export function countUnread(notifications: AppNotification[], readIds: Set<string>) {
  return notifications.filter(n => !readIds.has(n.id)).length;
}
