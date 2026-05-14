import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/AuthContext';
import { theme } from '../src/theme';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) router.replace('/(tabs)/dashboard');
      else router.replace('/login');
    }
  }, [user, loading]);

  return (
    <View style={styles.c}>
      <View style={styles.logoCircle}>
        <Text style={styles.logoText}>N</Text>
      </View>
      <Text style={styles.brand}>Nocker</Text>
      <Text style={styles.sub}>Sua inteligência financeira</Text>
      <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 32 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg },
  logoCircle: {
    width: 88, height: 88, borderRadius: 24, backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.primary, shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
  },
  logoText: { color: '#fff', fontSize: 44, fontWeight: '800' },
  brand: { color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 20, letterSpacing: -1 },
  sub: { color: theme.colors.textSecondary, fontSize: 14, marginTop: 6 },
});
