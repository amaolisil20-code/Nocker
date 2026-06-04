import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/AuthContext';
import { ThemeProvider, useTheme } from '../src/ThemeContext';
import { useAppLock } from '../src/useAppLock';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { api } from '../src/api';
import { cacheSet } from '../src/cache';

// Pré-carrega todas as telas em background logo após o login
function usePrefetch(isLoggedIn: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (!isLoggedIn || done.current) return;
    done.current = true;
    // Fire-and-forget — não bloqueia nada
    setTimeout(() => {
      Promise.all([
        api.syncOpenFinanceAll?.().catch(() => {}),
        api.listTransactions().then(v => cacheSet('transactions_bundle', { txs: v, cats: [] })),
        api.listCategories().then(v => cacheSet('categories_data', v)),
        api.listGoals?.().then((v: any) => cacheSet('goals_data', v)).catch(() => {}),
        api.listCards?.().then((v: any) => cacheSet('cards_data', v)).catch(() => {}),
        api.listSubscriptions?.().then((v: any) => cacheSet('subscriptions_data', v)).catch(() => {}),
        api.listFixedExpenses?.().then((v: any) => cacheSet('fixed_expenses_data', v)).catch(() => {}),
        api.listInstallments?.().then((v: any) => cacheSet('installments_data', v)).catch(() => {}),
      ]).catch(() => {});
    }, 1500); // Aguarda 1.5s após login para não competir com o dashboard
  }, [isLoggedIn]);
}

function LockScreen({ onTryAgain }: { onTryAgain: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.lockContainer, { backgroundColor: colors.bg }]}>
      <Ionicons name="finger-print" size={72} color={colors.primary} />
      <Text style={[styles.lockTitle, { color: colors.text }]}>Nocker bloqueado</Text>
      <Text style={[styles.lockSub, { color: colors.textSecondary }]}>
        Use sua biometria ou Face ID para continuar
      </Text>
      <TouchableOpacity style={[styles.lockBtn, { backgroundColor: colors.primary }]} onPress={onTryAgain}>
        <Text style={styles.lockBtnText}>Tentar novamente</Text>
      </TouchableOpacity>
    </View>
  );
}

function AppContent() {
  const { themeMode, colors } = useTheme();
  const { user, loading } = useAuth();
  const { locked, authenticate } = useAppLock(!!user);
  usePrefetch(!!user);

  if (loading) {
    return (
      <View style={[styles.lockContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (locked) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <LockScreen onTryAgain={authenticate} />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  lockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  lockTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 16,
  },
  lockSub: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  lockBtn: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  lockBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default function RootLayout() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}