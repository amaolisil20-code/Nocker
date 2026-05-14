import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { theme, fmtBRL } from '../../src/theme';
import { SubHeader } from '../../src/components/SubHeader';

const COLORS = ['#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#16A34A', '#EC4899'];
const CATEGORIES = ['Moradia', 'Transporte', 'Alimentação', 'Lazer', 'Saúde', 'Educação', 'Outros'];

export default function FixedExpenses() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('10');
  const [category, setCategory] = useState('Moradia');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = async () => { try { setItems(await api.listFixedExpenses()); } catch { /* ignore */ } };
  useFocusEffect(useCallback(() => { load(); }, []));

  const save = async () => {
    if (!name.trim()) return Alert.alert('Atenção', 'Informe um nome');
    const v = parseFloat(amount.replace(',', '.'));
    const d = parseInt(dueDay);
    if (!v || v <= 0) return Alert.alert('Atenção', 'Valor inválido');
    if (!d || d < 1 || d > 31) return Alert.alert('Atenção', 'Dia inválido (1-31)');
    setSaving(true);
    try {
      await api.createFixedExpense({ name: name.trim(), amount: v, due_day: d, category, color, active: true });
      setModal(false); setName(''); setAmount(''); setDueDay('10');
      await load();
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setSaving(false); }
  };

  const toggle = async (item: any) => {
    await api.updateFixedExpense(item.id, { active: !item.active });
    await load();
  };
  const remove = (id: string) =>
    Alert.alert('Excluir', 'Excluir gasto fixo?', [
      { text: 'Cancelar' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await api.deleteFixedExpense(id); await load(); } },
    ]);

  const total = items.filter(i => i.active).reduce((s, i) => s + i.amount, 0);

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      <SubHeader title="Gastos Fixos" subtitle="Contas mensais recorrentes" onAdd={() => setModal(true)} addTestID="add-fixed" />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={s.totalCard}>
          <Text style={s.totalLabel}>Total mensal ativo</Text>
          <Text style={s.totalVal}>{fmtBRL(total)}</Text>
          <Text style={s.totalSub}>{items.filter(i => i.active).length} de {items.length} ativos</Text>
        </View>

        {items.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={48} color={theme.colors.textTertiary} />
            <Text style={s.emptyTxt}>Nenhum gasto fixo</Text>
            <Text style={s.emptySub}>Adicione contas recorrentes (aluguel, luz, internet)</Text>
          </View>
        )}

        {items.map(item => (
          <TouchableOpacity key={item.id} style={s.row} onPress={() => toggle(item)} onLongPress={() => remove(item.id)} activeOpacity={0.85}>
            <View style={[s.itemIcon, { backgroundColor: `${item.color}22`, borderColor: `${item.color}55`, opacity: item.active ? 1 : 0.5 }]}>
              <Ionicons name="calendar" size={20} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.itemName, !item.active && { color: theme.colors.textTertiary }]}>{item.name}</Text>
              <Text style={s.itemSub}>{item.category} • dia {item.due_day}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.itemAmt, !item.active && { color: theme.colors.textTertiary }]}>{fmtBRL(item.amount)}</Text>
              <Text style={[s.statusPill, item.active ? s.statusActive : s.statusInactive]}>
                {item.active ? 'ativo' : 'pausado'}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
        {items.length > 0 && <Text style={s.hint}>Toque para ativar/pausar • Pressione e segure para excluir</Text>}
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setModal(false)} />
          <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Novo gasto fixo</Text>

            <Text style={s.label}>Nome</Text>
            <TextInput testID="fe-name" placeholder="Ex: Aluguel, Internet..." placeholderTextColor={theme.colors.textTertiary}
              value={name} onChangeText={setName} style={s.input} />

            <Text style={s.label}>Valor mensal</Text>
            <TextInput testID="fe-amount" placeholder="0,00" placeholderTextColor={theme.colors.textTertiary}
              value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={s.input} />

            <Text style={s.label}>Dia do vencimento</Text>
            <TextInput placeholder="10" placeholderTextColor={theme.colors.textTertiary}
              value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" style={s.input} />

            <Text style={s.label}>Categoria</Text>
            <View style={s.chipRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[s.chip, category === c && s.chipActive]} onPress={() => setCategory(c)}>
                  <Text style={[s.chipTxt, category === c && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Cor</Text>
            <View style={s.chipRow}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorActive]} />
              ))}
            </View>

            <TouchableOpacity testID="save-fe" style={s.saveBtn} onPress={save} disabled={saving}>
              <Text style={s.saveTxt}>{saving ? 'Salvando...' : 'Salvar'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 20 },
  totalCard: { backgroundColor: theme.colors.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 16 },
  totalLabel: { color: theme.colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  totalVal: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.6, marginTop: 4 },
  totalSub: { color: theme.colors.textTertiary, fontSize: 12, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginVertical: 4,
    backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border },
  itemIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  itemName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  itemSub: { color: theme.colors.textTertiary, fontSize: 11, marginTop: 2 },
  itemAmt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  statusPill: { fontSize: 10, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, marginTop: 4, overflow: 'hidden', fontWeight: '700' },
  statusActive: { color: theme.colors.primary, backgroundColor: theme.colors.successSoft },
  statusInactive: { color: theme.colors.textTertiary, backgroundColor: 'rgba(255,255,255,0.05)' },
  hint: { color: theme.colors.textTertiary, fontSize: 10, textAlign: 'center', marginTop: 16 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 6 },
  emptyTxt: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptySub: { color: theme.colors.textTertiary, fontSize: 12, textAlign: 'center', paddingHorizontal: 40 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: '90%' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { color: theme.colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  input: { backgroundColor: theme.colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 48, color: '#fff',
    borderWidth: 1, borderColor: theme.colors.border, fontSize: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTxt: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorActive: { borderColor: '#fff' },
  saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 999, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
