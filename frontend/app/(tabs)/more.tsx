import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/AuthContext';
import { theme } from '../../src/theme';

const ITEMS = [
  { key: 'goals', label: 'Metas', icon: 'trophy', color: '#F59E0B', route: '/(tabs)/goals', desc: 'Acompanhe seus objetivos' },
  { key: 'fixed-expenses', label: 'Gastos Fixos', icon: 'calendar', color: '#EF4444', route: '/(tabs)/fixed-expenses', desc: 'Contas que se repetem' },
  { key: 'installments', label: 'Parcelados', icon: 'layers', color: '#3B82F6', route: '/(tabs)/installments', desc: 'Compras em parcelas' },
  { key: 'subscriptions', label: 'Assinaturas', icon: 'repeat', color: '#8B5CF6', route: '/(tabs)/subscriptions', desc: 'Serviços recorrentes' },
  { key: 'projection', label: 'Projeção', icon: 'analytics', color: '#06B6D4', route: '/(tabs)/projection', desc: 'Previsão financeira' },
  { key: 'categories', label: 'Categorias', icon: 'pricetags', color: '#EC4899', route: '/(tabs)/categories', desc: 'Organize seus gastos' },
  { key: 'settings', label: 'Configurações', icon: 'settings', color: '#16A34A', route: '/(tabs)/settings', desc: 'Perfil e preferências' },
];

export default function More() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <ScrollView style={s.c} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 120, paddingHorizontal: 20 }}>
      <Text style={s.title}>Mais</Text>
      <Text style={s.subtitle}>Tudo sobre suas finanças em um lugar</Text>

      <TouchableOpacity testID="profile-card" style={s.profileCard} onPress={() => router.push('/(tabs)/settings')} activeOpacity={0.9}>
        <LinearGradient colors={['rgba(22,163,74,0.25)', 'rgba(22,163,74,0.04)']} style={StyleSheet.absoluteFill} />
        <View style={s.profileAvatar}>
          <Text style={s.profileInitial}>{user?.name?.[0]?.toUpperCase() || 'N'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.profileName}>{user?.name}</Text>
          <Text style={s.profileEmail}>{user?.email}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textTertiary} />
      </TouchableOpacity>

      <View style={s.grid}>
        {ITEMS.map(item => (
          <TouchableOpacity
            key={item.key}
            testID={`more-${item.key}`}
            style={s.tile}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.85}
          >
            <View style={[s.tileIcon, { backgroundColor: `${item.color}22`, borderColor: `${item.color}55` }]}>
              <Ionicons name={item.icon as any} size={22} color={item.color} />
            </View>
            <Text style={s.tileLabel}>{item.label}</Text>
            <Text style={s.tileDesc}>{item.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.bg },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: theme.colors.textSecondary, fontSize: 13, marginTop: 2, marginBottom: 18 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.colors.surface,
    borderRadius: 20, padding: 16, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', marginBottom: 18 },
  profileAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { color: '#fff', fontSize: 22, fontWeight: '800' },
  profileName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  profileEmail: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: { width: '48%', backgroundColor: theme.colors.surface, borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: theme.colors.border, minHeight: 130 },
  tileIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 12 },
  tileLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  tileDesc: { color: theme.colors.textTertiary, fontSize: 11, marginTop: 3 },
});
