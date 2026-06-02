import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/AuthContext';
import { ThemeProvider, useTheme } from '../src/ThemeContext';
import { useAppLock } from '../src/useAppLock';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
