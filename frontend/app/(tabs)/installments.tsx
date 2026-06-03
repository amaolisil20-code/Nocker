import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCachedLoad } from '../../src/useCachedLoad';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { staleWhileRevalidate } from '../../src/cache';
import { fmtBRL } from '../../src/theme';
import { useTheme } from '../../src/ThemeContext';
import { SubHeader } from '../../src/components/SubHeader';

const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#16A34A', '#F59E0B', '#EF4444'];

export default function Installments() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [installmentsTotal, setInstallmentsTotal] = useState('');
  const [installmentsPaid, setInstallmentsPaid] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const expenseCategories = categories.filter(c => c.type === 'expense').map(c => c.name);

  const load = async () => {
    try {
      const [inst, cats] = await Promise.all([api.listInstallments(), api.listCategories()]);
      setItems(inst);
      setCategories(cats);
    } catch { /* ignore */ }
  };
  useCachedLoad('installments_data', load, () => {});

  const save = async () => {
    if (!name.trim()) return Alert.alert('Atenção', 'Informe o nome');
    const t = parseFloat(total.replace(',', '.'));
    const it = parseInt(installmentsTotal);
    const ip = parseInt(installmentsPaid);
    if (!t || t <= 0) return Alert.alert('Atenção', 'Valor inválido');
    if (!it || it < 1) return Alert.alert('Atenção', 'Número de parcelas inválido');
    if (isNaN(ip) || ip < 0 || ip > it) return Alert.alert('Atenção', 'Parcelas pagas inválido');
    if (!category) return Alert.alert('Atenção', 'Selecione uma categoria. Crie categorias na aba Categorias.');
    setSaving(true);
    try {
      await api.createInstallment({
        name: name.trim(), total_amount: t,
        installments_total: it, installments_paid: ip,
        category, color,
      });
      setModal(false); setName(''); setTotal(''); setInstallmentsTotal(''); setInstallmentsPaid(''); setCategory('');
      await load();
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setSaving(false); }
  };

  const payInstallment = (item: any) => {
    if (item.installments_paid >= item.installments_total) return;
    const parcelNum = item.installments_paid + 1;
    const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.monthly_amount);
    Alert.alert(
      'Confirmar pagamento',
      `Registrar parcela ${parcelNum}/${item.installments_total} de ${item.name}?\n\nValor: ${valor}\n\nIsso criará automaticamente uma despesa no seu extrato.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              // 1. Marca a parcela como paga
              await api.updateInstallment(item.id, { installments_paid: parcelNum });

              // 2. Cria a transação de despesa diretamente pelo frontend
              await api.createTransaction({
                type: 'expense',
                amount: item.monthly_amount,
                category: item.category,
                description: `${item.name} — parcela ${parcelNum}/${item.installments_total}`,
                date: new Date().toISOString(),
              });

              await load();
              Alert.alert(
                '✅ Parcela registrada!',
                `${item.name} — parcela ${parcelNum}/${item.installments_total}\n${valor} adicionado às suas despesas.`,
                [{ text: 'OK' }]
              );
            } catch (e: any) {
              Alert.alert('Erro', e.message || 'Não foi possível registrar o pagamento');
            }
          },
        },
      ]
    );
  };

  const remove = (id: string) =>
    Alert.alert('Excluir', 'Excluir parcelamento?', [
      { text: 'Cancelar' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await api.deleteInstallment(id); await load(); } },
    ]);

  const monthlyTotal = items.reduce((sum, i) => i.installments_paid < i.installments_total ? sum + i.monthly_amount : sum, 0);
  const remainingTotal = items.reduce((sum, i) => sum + i.remaining_amount, 0);

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      <SubHeader title="Parcelados" subtitle="Compras em parcelas" onAdd={() => { setCategory(''); setModal(true); }} addTestID="add-inst" />

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <View style={s.summaryRow}>
          <View style={s.sumBox}>
            <Text style={s.sumLabel}>Mensal</Text>
            <Text style={s.sumVal}>{fmtBRL(monthlyTotal)}</Text>
          </View>
          <View style={s.sumBox}>
            <Text style={s.sumLabel}>A pagar</Text>
            <Text style={s.sumVal}>{fmtBRL(remainingTotal)}</Text>
          </View>
        </View>

        {items.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="layers-outline" size={48} color={colors.textTertiary} />
            <Text style={s.emptyTxt}>Nenhum parcelamento</Text>
            <Text style={s.emptySub}>Adicione compras parceladas para acompanhar</Text>
          </View>
        )}

        {items.map(item => {
          const pct = (item.installments_paid / item.installments_total) * 100;
          const done = item.installments_paid >= item.installments_total;
          return (
            <TouchableOpacity key={item.id} onPress={() => payInstallment(item)} onLongPress={() => remove(item.id)} activeOpacity={0.85}>
              <View style={[s.instCard, { borderColor: `${item.color}44` }]}>
                <LinearGradient colors={[`${item.color}1f`, 'transparent']} style={StyleSheet.absoluteFill} />
                <View style={s.instTopRow}>
                  <View style={[s.instIcon, { backgroundColor: `${item.color}22`, borderColor: `${item.color}55` }]}>
                    <Ionicons name={done ? 'checkmark-done' : 'layers'} size={20} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.instName}>{item.name}</Text>
                    <Text style={s.instSub}>{item.category}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.instAmt}>{fmtBRL(item.monthly_amount)}</Text>
                    <Text style={s.instSub}>por mês</Text>
                  </View>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: item.color }]} />
                </View>
                <View style={s.instBottomRow}>
                  <Text style={s.instMeta}>{item.installments_paid}/{item.installments_total} parcelas</Text>
                  <Text style={s.instMeta}>Falta: {fmtBRL(item.remaining_amount)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
        {items.length > 0 && <Text style={s.hint}>Toque para pagar parcela e registrar despesa • Pressione e segure para excluir</Text>}
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setModal(false)} />
          <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Novo parcelamento</Text>

            <Text style={s.label}>Nome</Text>
            <TextInput testID="inst-name" placeholder="Ex: Notebook, Sofá..." placeholderTextColor={colors.textTertiary}
              value={name} onChangeText={setName} style={s.input} />

            <Text style={s.label}>Valor total</Text>
            <TextInput testID="inst-total" placeholder="0,00" placeholderTextColor={colors.textTertiary}
              value={total} onChangeText={setTotal} keyboardType="decimal-pad" style={s.input} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Parcelas total</Text>
                <TextInput value={installmentsTotal} onChangeText={setInstallmentsTotal} keyboardType="number-pad" placeholder="12" placeholderTextColor={colors.textTertiary} style={s.input} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Já pagas</Text>
                <TextInput value={installmentsPaid} onChangeText={setInstallmentsPaid} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textTertiary} style={s.input} />
              </View>
            </View>

            <Text style={s.label}>Categoria</Text>
            {expenseCategories.length === 0 ? (
              <Text style={s.noCatHint}>Nenhuma categoria de despesa. Crie na aba Categorias.</Text>
            ) : (
              <View style={s.chipRow}>
                {expenseCategories.map(c => (
                  <TouchableOpacity key={c} style={[s.chip, category === c && s.chipActive]} onPress={() => setCategory(c)}>
                    <Text style={[s.chipTxt, category === c && { color: '#fff' }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={s.label}>Cor</Text>
            <View style={s.chipRow}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorActive]} />
              ))}
            </View>

            <TouchableOpacity testID="save-inst" style={s.saveBtn} onPress={save} disabled={saving}>
              <Text style={s.saveTxt}>{saving ? 'Salvando...' : 'Salvar parcelamento'}</Text>
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
  instCard: { borderRadius: 20, padding: 16, marginVertical: 6, borderWidth: 1, backgroundColor: colors.surface, overflow: 'hidden' },
  instTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  instIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  instName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  instSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  instAmt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceElevated, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  instBottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  instMeta: { color: colors.textSecondary, fontSize: 11 },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  noCatHint: { color: colors.textTertiary, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorActive: { borderColor: '#fff' },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 999, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});