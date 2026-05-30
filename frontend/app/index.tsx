import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/AuthContext';
import { useTheme } from '../src/ThemeContext';

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (!loading) {
      if (user) router.replace('/(tabs)/dashboard');
      else router.replace('/login');
    }
  }, [user, loading]);

  return (
    <View style={[styles.c, { backgroundColor: colors.bg }]}>
      <View style={[styles.logoCircle, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
        <Text style={styles.logoText}>N</Text>
      </View>
      <Text style={[styles.brand, { color: colors.text }]}>Nocker</Text>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>Sua inteligência financeira</Text>
      <ActivityIndicator color={colors.primary} style={{ marginTop: 32 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoCircle: {
    width: 88, height: 88, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
  },
  logoText: { color: '#fff', fontSize: 44, fontWeight: '800' },
  brand: { fontSize: 36, fontWeight: '800', marginTop: 20, letterSpacing: -1 },
  sub: { fontSize: 14, marginTop: 6 },
});
