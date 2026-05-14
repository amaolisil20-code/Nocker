import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

export function SubHeader({ title, subtitle, onAdd, addTestID }: { title: string; subtitle?: string; onAdd?: () => void; addTestID?: string }) {
  const router = useRouter();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/more');
  };
  return (
    <View style={s.row}>
      <TouchableOpacity testID="sub-back" style={s.backBtn} onPress={goBack}>
        <Ionicons name="chevron-back" size={22} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      </View>
      {onAdd && (
        <TouchableOpacity testID={addTestID || 'sub-add'} style={s.addBtn} onPress={onAdd}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center' },
});
