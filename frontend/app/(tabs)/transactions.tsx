import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, FlatList, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { theme, fmtBRL } from '../../src/theme';

const CATEGORIES = ['Alimentação', 'Transporte', 'Moradia', 'Lazer', 'Saúde', 'Educação', 'Compras', 'Salário', 'Investimentos', 'Outros'];

export default function Transactions() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ open?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Outros');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try { setItems(await api.listTransactions()); } catch { /* ignore */ }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  useEffect(() => {
    if (params.open === 'income' || params.open === 'expense') {
      setType(params.open);
      setModal(true);
    }
  }, [params.open]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const save = async () => {
    const v = parseFloat(amount.replace(',', '.'));
    if (!v || v <= 0) return Alert.alert('Atenção', 'Informe um valor válido');
    if (!description.trim()) return Alert.alert('Atenção', 'Informe uma descrição');
    setSaving(true);
    try {
      await api.createTransaction({ type, amount: v, category, description: description.trim() });
      setModal(false); setAmount(''); setDescription(''); setCategory('Outros');
      await load();
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setSaving(false); }
  };

  const remove = (id: string) =>
    Alert.alert('Excluir', 'Deseja excluir esta transação?', [
      { text: 'Cancelar' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await api.deleteTransaction(id); await load(); } },
    ]);

  const filtered = items
    .filter(t => filter === 'all' || t.type === filter)
    .filter(t => !search || t.description.toLowerCase().includes(search.toLowerCase()) || t.category.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      <View style={s.headerRow}>
        <Text style={s.title}>Movimentos</Text>
        <TouchableOpacity testID="add-tx" style={s.addBtn} onPress={() => { setType('expense'); setModal(true); }}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={s.searchBox}>
        <Ionicons name="search" size={16} color={theme.colors.textTertiary} />
        <TextInput testID="search-tx" placeholder="Buscar..." placeholderTextColor={theme.colors.textTertiary}
          value={search} onChangeText={setSearch} style={s.searchInput} />
      </View>

      <View style={s.filters}>
        {(['all', 'income', 'expense'] as const).map(f => (
          <TouchableOpacity key={f} testID={`filter-${f}`} style={[s.chip, filter === f && s.chipActive]} onPress={() => setFilter(f)}>
            <Text style={[s.chipTxt, filter === f && s.chipTxtActive]}>
              {f === 'all' ? 'Todos' : f === 'income' ? 'Entradas' : 'Saídas'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
        renderItem={({ item }) => (
          <TouchableOpacity onLongPress={() => remove(item.id)} activeOpacity={0.7}>
            <View style={s.txRow}>
              <View style={[s.txIcon, { backgroundColor: item.type === 'income' ? theme.colors.successSoft : theme.colors.expenseSoft }]}>
                <Ionicons name={item.type === 'income' ? 'arrow-down' : 'arrow-up'} size={18}
                  color={item.type === 'income' ? theme.colors.primary : theme.colors.expense} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.txTitle}>{item.description}</Text>
                <Text style={s.txSub}>{item.category} • {new Date(item.date).toLocaleDateString('pt-BR')}</Text>
              </View>
              <Text style={[s.txAmt, { color: item.type === 'income' ? theme.colors.primary : '#fff' }]}>
                {item.type === 'income' ? '+' : '-'} {fmtBRL(item.amount)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="receipt-outline" size={48} color={theme.colors.textTertiary} />
            <Text style={s.emptyTxt}>Nenhuma transação encontrada</Text>
            <Text style={s.emptySub}>Toque no + para adicionar a primeira</Text>
          </View>
        }
      />

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setModal(false)} />
          <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Nova transação</Text>

            <View style={s.typeRow}>
              <TouchableOpacity testID="type-expense" style={[s.typeBtn, type === 'expense' && s.typeBtnActiveExp]} onPress={() => setType('expense')}>
                <Ionicons name="arrow-up" size={16} color={type === 'expense' ? '#fff' : theme.colors.expense} />
                <Text style={[s.typeBtnTxt, type === 'expense' && { color: '#fff' }]}>Saída</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="type-income" style={[s.typeBtn, type === 'income' && s.typeBtnActiveInc]} onPress={() => setType('income')}>
                <Ionicons name="arrow-down" size={16} color={type === 'income' ? '#fff' : theme.colors.primary} />
                <Text style={[s.typeBtnTxt, type === 'income' && { color: '#fff' }]}>Entrada</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Valor</Text>
            <TextInput testID="input-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
              placeholder="0,00" placeholderTextColor={theme.colors.textTertiary} style={s.bigInput} />

            <Text style={s.label}>Descrição</Text>
            <TextInput testID="input-desc" value={description} onChangeText={setDescription}
              placeholder="Ex: Mercado, Uber..." placeholderTextColor={theme.colors.textTertiary} style={s.input} />

            <Text style={s.label}>Categoria</Text>
            <View style={s.catGrid}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c} style={[s.catChip, category === c && s.catChipActive]} onPress={() => setCategory(c)}>
                  <Text style={[s.catChipTxt, category === c && { color: '#fff' }]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity testID="save-tx" style={s.saveBtn} onPress={save} disabled={saving}>
              <Text style={s.saveTxt}>{saving ? 'Salvando...' : 'Salvar transação'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.primary, shadowOpacity: 0.4, shadowRadius: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderRadius: 14,
    paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: theme.colors.border },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTxt: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, marginVertical: 4,
    backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border },
  txIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  txTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  txSub: { color: theme.colors.textTertiary, fontSize: 11, marginTop: 2 },
  txAmt: { fontSize: 15, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 80, gap: 6 },
  emptyTxt: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptySub: { color: theme.colors.textTertiary, fontSize: 12 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: '90%' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
  typeBtnActiveExp: { backgroundColor: theme.colors.expense, borderColor: theme.colors.expense },
  typeBtnActiveInc: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  typeBtnTxt: { color: '#fff', fontWeight: '700' },
  label: { color: theme.colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  input: { backgroundColor: theme.colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 48, color: '#fff',
    borderWidth: 1, borderColor: theme.colors.border, fontSize: 15 },
  bigInput: { backgroundColor: theme.colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 64, color: '#fff',
    borderWidth: 1, borderColor: theme.colors.border, fontSize: 28, fontWeight: '700' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
    borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
  catChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  catChipTxt: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 999, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
