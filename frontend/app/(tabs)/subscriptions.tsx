import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCachedLoad } from '../../src/useCachedLoad';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { staleWhileRevalidate } from '../../src/cache';
import { fmtBRL } from '../../src/theme';
import { useTheme } from '../../src/ThemeContext';
import { SubHeader } from '../../src/components/SubHeader';

const COLORS = ['#8B5CF6', '#EC4899', '#3B82F6', '#16A34A', '#F59E0B', '#EF4444'];
const ICONS = [
  { key: 'play-circle', label: 'Streaming' },
  { key: 'musical-notes', label: 'Música' },
  { key: 'cloud', label: 'Cloud' },
  { key: 'fitness', label: 'Fitness' },
  { key: 'book', label: 'Leitura' },
  { key: 'phone-portrait', label: 'App' },
  { key: 'cart', label: 'Loja' },
  { key: 'repeat', label: 'Outro' },
];

export default function Subscriptions() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [icon, setIcon] = useState('play-circle');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = async () => { try { setItems(await api.listSubscriptions()); } catch { /* ignore */ } };
  useCachedLoad('subscriptions_data', load, () => {});

  const save = async () => {
    if (!name.trim()) return Alert.alert('Atenção', 'Informe o nome');
    const v = parseFloat(amount.replace(',', '.'));
    if (!v || v <= 0) return Alert.alert('Atenção', 'Valor inválido');
    setSaving(true);
    try {
      await api.createSubscription({
        name: name.trim(), amount: v, billing_cycle: cycle,
        icon, color, active: true,
      });
      setModal(false); setName(''); setAmount('');
      await load();
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setSaving(false); }
  };

  const toggle = async (item: any) => {
    await api.updateSubscription(item.id, { active: !item.active });
    await load();
  };
  const remove = (id: string) =>
    Alert.alert('Excluir', 'Cancelar assinatura?', [
      { text: 'Não' },
      { text: 'Cancelar', style: 'destructive', onPress: async () => { await api.deleteSubscription(id); await load(); } },
    ]);

  const monthlyTotal = items.filter(i => i.active).reduce((s, i) => s + i.monthly_cost, 0);
  const yearlyTotal = monthlyTotal * 12;

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      <SubHeader title="Assinaturas" subtitle="Serviços recorrentes" onAdd={() => setModal(true)} addTestID="add-sub" />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={s.summaryRow}>
          <View style={s.sumBox}>
            <Text style={s.sumLabel}>Por mês</Text>
            <Text style={s.sumVal}>{fmtBRL(monthlyTotal)}</Text>
          </View>
          <View style={s.sumBox}>
            <Text style={s.sumLabel}>Por ano</Text>
            <Text style={s.sumVal}>{fmtBRL(yearlyTotal)}</Text>
          </View>
        </View>

        {items.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="repeat-outline" size={48} color={colors.textTertiary} />
            <Text style={s.emptyTxt}>Nenhuma assinatura</Text>
            <Text style={s.emptySub}>Adicione streamings, cloud, academia...</Text>
          </View>
        )}

        {items.map(item => (
          <TouchableOpacity key={item.id} style={s.row} onPress={() => toggle(item)} onLongPress={() => remove(item.id)} activeOpacity={0.85}>
            <View style={[s.itemIcon, { backgroundColor: `${item.color}22`, borderColor: `${item.color}55`, opacity: item.active ? 1 : 0.4 }]}>
              <Ionicons name={item.icon as any} size={22} color={item.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.itemName, !item.active && { color: colors.textTertiary }]}>{item.name}</Text>
              <Text style={s.itemSub}>
                {item.billing_cycle === 'monthly' ? 'Mensal' : 'Anual'} • {fmtBRL(item.amount)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.itemAmt, !item.active && { color: colors.textTertiary }]}>{fmtBRL(item.monthly_cost)}</Text>
              <Text style={s.itemMeta}>/mês</Text>
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
            <Text style={s.sheetTitle}>Nova assinatura</Text>

            <Text style={s.label}>Nome do serviço</Text>
            <TextInput testID="sub-name" placeholder="Ex: Netflix, Spotify..." placeholderTextColor={colors.textTertiary}
              value={name} onChangeText={setName} style={s.input} />

            <Text style={s.label}>Valor</Text>
            <TextInput testID="sub-amount" placeholder="0,00" placeholderTextColor={colors.textTertiary}
              value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={s.input} />

            <Text style={s.label}>Cobrança</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[s.cycleBtn, cycle === 'monthly' && s.cycleActive]} onPress={() => setCycle('monthly')}>
                <Text style={[s.cycleTxt, cycle === 'monthly' && { color: '#fff' }]}>Mensal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.cycleBtn, cycle === 'yearly' && s.cycleActive]} onPress={() => setCycle('yearly')}>
                <Text style={[s.cycleTxt, cycle === 'yearly' && { color: '#fff' }]}>Anual</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Ícone</Text>
            <View style={s.chipRow}>
              {ICONS.map(ic => (
                <TouchableOpacity key={ic.key} style={[s.iconBtn, icon === ic.key && s.iconActive]} onPress={() => setIcon(ic.key)}>
                  <Ionicons name={ic.key as any} size={18} color={icon === ic.key ? '#fff' : colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Cor</Text>
            <View style={s.chipRow}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorActive]} />
              ))}
            </View>

            <TouchableOpacity testID="save-sub" style={s.saveBtn} onPress={save} disabled={saving}>
              <Text style={s.saveTxt}>{saving ? 'Salvando...' : 'Adicionar assinatura'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  sumBox: { flex: 1, backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border },
  sumLabel: { color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  sumVal: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginVertical: 4,
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  itemIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  itemName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  itemSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  itemAmt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  itemMeta: { color: colors.textTertiary, fontSize: 10 },
  hint: { color: colors.textTertiary, fontSize: 10, textAlign: 'center', marginTop: 16 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 6 },
  emptyTxt: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptySub: { color: colors.textTertiary, fontSize: 12, textAlign: 'center', paddingHorizontal: 40 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: '90%' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  input: { backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 48, color: '#fff',
    borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  cycleBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, alignItems: 'center' },
  cycleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  cycleTxt: { color: colors.textSecondary, fontWeight: '700' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorActive: { borderColor: '#fff' },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 999, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});