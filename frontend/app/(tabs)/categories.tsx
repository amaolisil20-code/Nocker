import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { useTheme } from '../../src/ThemeContext';
import { SubHeader } from '../../src/components/SubHeader';

const COLORS = ['#16A34A', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#EF4444', '#06B6D4', '#F97316'];
const ICONS = ['pricetag', 'fast-food', 'car', 'home', 'game-controller', 'medkit', 'school', 'bag', 'cash', 'trending-up', 'gift', 'airplane'];

export default function Categories() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [saving, setSaving] = useState(false);

  const load = async () => { try { setItems(await api.listCategories()); } catch { /* ignore */ } };
  useFocusEffect(useCallback(() => { load(); }, []));

  const save = async () => {
    if (!name.trim()) return Alert.alert('Atenção', 'Informe o nome');
    setSaving(true);
    try {
      await api.createCategory({ name: name.trim(), type, color, icon });
      setModal(false); setName('');
      await load();
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setSaving(false); }
  };

  const remove = (id: string) =>
    Alert.alert('Excluir', 'Excluir categoria?', [
      { text: 'Cancelar' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await api.deleteCategory(id); await load(); } },
    ]);

  const expense = items.filter(i => i.type === 'expense');
  const income = items.filter(i => i.type === 'income');

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      <SubHeader title="Categorias" subtitle="Organize suas transações" onAdd={() => setModal(true)} addTestID="add-cat" />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Text style={s.section}>Despesas</Text>
        <View style={s.grid}>
          {expense.map(c => (
            <TouchableOpacity key={c.id} style={s.catTile} onLongPress={() => remove(c.id)} activeOpacity={0.85}>
              <View style={[s.catIcon, { backgroundColor: `${c.color}22`, borderColor: `${c.color}55` }]}>
                <Ionicons name={c.icon as any} size={20} color={c.color} />
              </View>
              <Text style={s.catName} numberOfLines={1}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.section}>Receitas</Text>
        <View style={s.grid}>
          {income.map(c => (
            <TouchableOpacity key={c.id} style={s.catTile} onLongPress={() => remove(c.id)} activeOpacity={0.85}>
              <View style={[s.catIcon, { backgroundColor: `${c.color}22`, borderColor: `${c.color}55` }]}>
                <Ionicons name={c.icon as any} size={20} color={c.color} />
              </View>
              <Text style={s.catName} numberOfLines={1}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.hint}>Pressione e segure uma categoria para excluir</Text>
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setModal(false)} />
          <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Nova categoria</Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[s.typeBtn, type === 'expense' && s.typeExpActive]} onPress={() => setType('expense')}>
                <Text style={[s.typeTxt, type === 'expense' && { color: '#fff' }]}>Despesa</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.typeBtn, type === 'income' && s.typeIncActive]} onPress={() => setType('income')}>
                <Text style={[s.typeTxt, type === 'income' && { color: '#fff' }]}>Receita</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Nome</Text>
            <TextInput testID="cat-name" placeholder="Ex: Pet, Restaurantes..." placeholderTextColor={colors.textTertiary}
              value={name} onChangeText={setName} style={s.input} />

            <Text style={s.label}>Ícone</Text>
            <View style={s.iconGrid}>
              {ICONS.map(ic => (
                <TouchableOpacity key={ic} style={[s.iconBtn, icon === ic && s.iconActive]} onPress={() => setIcon(ic)}>
                  <Ionicons name={ic as any} size={20} color={icon === ic ? '#fff' : colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Cor</Text>
            <View style={s.colorRow}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorActive]} />
              ))}
            </View>

            <TouchableOpacity testID="save-cat" style={s.saveBtn} onPress={save} disabled={saving}>
              <Text style={s.saveTxt}>{saving ? 'Salvando...' : 'Criar categoria'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  section: { color: colors.textTertiary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catTile: { width: '22%', alignItems: 'center', padding: 10, backgroundColor: colors.surface,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  catIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 6 },
  catName: { color: '#fff', fontSize: 11, textAlign: 'center' },
  hint: { color: colors.textTertiary, fontSize: 10, textAlign: 'center', marginTop: 20 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: '90%' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  typeBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, alignItems: 'center' },
  typeExpActive: { backgroundColor: colors.expense, borderColor: colors.expense },
  typeIncActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeTxt: { color: colors.textSecondary, fontWeight: '700' },
  label: { color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  input: { backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 48, color: '#fff',
    borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorActive: { borderColor: '#fff' },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 999, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
