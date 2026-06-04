import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/AuthContext';
import { useTheme } from '../../src/ThemeContext';

export default function More() {
  const insets = useSafeAreaInsets();
  const { colors, t, themeMode } = useTheme();
  const s = makeStyles(colors, themeMode);
  const router = useRouter();
  const { user } = useAuth();

  const ITEMS = [
    { key: 'goals', label: 'Metas', icon: 'trophy', color: '#F59E0B', route: '/(tabs)/goals', desc: 'Acompanhe seus objetivos' },
    { key: 'fixed-expenses', label: 'Gastos Fixos', icon: 'calendar', color: '#EF4444', route: '/(tabs)/fixed-expenses', desc: 'Contas que se repetem' },
    { key: 'installments', label: 'Parcelados', icon: 'layers', color: '#3B82F6', route: '/(tabs)/installments', desc: 'Compras em parcelas' },
    { key: 'subscriptions', label: 'Assinaturas', icon: 'repeat', color: '#8B5CF6', route: '/(tabs)/subscriptions', desc: 'Serviços recorrentes' },
    { key: 'projection', label: 'Projeção', icon: 'analytics', color: '#06B6D4', route: '/(tabs)/projection', desc: 'Previsão financeira' },
    { key: 'categories', label: 'Categorias', icon: 'pricetags', color: '#EC4899', route: '/(tabs)/categories', desc: 'Organize seus gastos' },
    { key: 'plans', label: 'Planos', icon: 'star', color: '#F59E0B', route: '/(tabs)/plans', desc: 'Gratuito, Pro e Premium' },
    { key: 'settings', label: t.settings, icon: 'settings', color: '#16A34A', route: '/(tabs)/settings', desc: 'Perfil e preferências' },
  ];

  return (
    <ScrollView style={s.c} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}>
      <Text style={s.title}>{t.more}</Text>
      <Text style={s.subtitle}>Tudo sobre suas finanças em um lugar</Text>

      <TouchableOpacity testID="profile-card" style={s.profileCard} onPress={() => router.push('/(tabs)/settings')} activeOpacity={0.9}>
        <LinearGradient colors={themeMode === 'dark' ? ['rgba(22,163,74,0.25)', 'rgba(22,163,74,0.04)'] : ['rgba(22,163,74,0.1)', 'rgba(22,163,74,0.02)']} style={StyleSheet.absoluteFill} />
        <View style={s.profileAvatar}>
          <Text style={s.profileInitial}>{user?.name?.[0]?.toUpperCase() || 'N'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.profileName}>{user?.name}</Text>
          <Text style={s.profileEmail}>{user?.email}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
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

const makeStyles = (colors: any, themeMode: string) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 2, marginBottom: 18 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface,
    borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 18 },
  profileAvatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { color: '#fff', fontSize: 22, fontWeight: '800' },
  profileName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  profileEmail: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: { width: '48%', backgroundColor: colors.surface, borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border, minHeight: 130 },
  tileIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 12 },
  tileLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  tileDesc: { color: colors.textTertiary, fontSize: 11, marginTop: 3 },
});