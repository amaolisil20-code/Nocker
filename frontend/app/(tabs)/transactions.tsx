import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, FlatList, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../src/api';
import { useTheme } from '../../src/ThemeContext';

export default function Transactions() {
  const insets = useSafeAreaInsets();
  const { colors, t } = useTheme();
  const s = makeStyles(colors);
  const params = useLocalSearchParams<{ open?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [search, setSearch] = useState('');

  // ── Modal de criação/edição ──────────────────────────────────────────────
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  // ── Menu de ações (segurar) ──────────────────────────────────────────────
  const [actionItem, setActionItem] = useState<any | null>(null);

  const fmtDate = (d: Date) => d.toLocaleDateString('pt-BR');
  const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const load = async () => {
    try {
      const [txs, cats] = await Promise.all([api.listTransactions(), api.listCategories()]);
      setItems(txs);
      setCategories(cats);
    } catch { /* ignore */ }
  };

  const availableCategories = categories.filter(c => c.type === type).map(c => c.name);

  useFocusEffect(useCallback(() => { load(); }, []));

  useEffect(() => {
    if (params.open === 'income' || params.open === 'expense') {
      openNew(params.open);
    }
  }, [params.open]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const onDateChange = (_: any, selected?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (selected) setDate(selected);
  };

  // Abre modal para nova transação
  const openNew = (t_type: 'income' | 'expense' = 'expense') => {
    setEditingId(null);
    setType(t_type);
    setAmount('');
    setDescription('');
    setCategory('');
    setDate(new Date());
    setModal(true);
  };

  // Abre modal para editar transação existente
  const openEdit = (item: any) => {
    setEditingId(item.id);
    setType(item.type);
    setAmount(String(item.amount).replace('.', ','));
    setDescription(item.description);
    setCategory(item.category);
    setDate(new Date(item.date));
    setActionItem(null);
    setModal(true);
  };

  const save = async () => {
    const v = parseFloat(amount.replace(',', '.'));
    if (!v || v <= 0) return Alert.alert('Atenção', 'Informe um valor válido');
    if (!description.trim()) return Alert.alert('Atenção', 'Informe uma descrição');
    if (!category) return Alert.alert('Atenção', 'Selecione uma categoria. Crie categorias na aba Categorias.');
    setSaving(true);
    try {
      const iso = date.toISOString().split('T')[0];
      if (editingId) {
        await api.updateTransaction(editingId, {
          type, amount: v, category, description: description.trim(), date: iso,
        });
      } else {
        await api.createTransaction({ type, amount: v, category, description: description.trim(), date: iso });
      }
      setModal(false);
      await load();
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setSaving(false); }
  };

  const remove = (id: string) => {
    setActionItem(null);
    Alert.alert(t.delete, 'Deseja excluir esta transação?', [
      { text: t.cancel },
      {
        text: t.delete, style: 'destructive',
        onPress: async () => { await api.deleteTransaction(id); await load(); },
      },
    ]);
  };

  const filtered = items
    .filter(i => filter === 'all' || i.type === filter)
    .filter(i => !search || i.description.toLowerCase().includes(search.toLowerCase()) || i.category.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      <View style={s.headerRow}>
        <Text style={s.title}>{t.transactions}</Text>
        <TouchableOpacity testID="add-tx" style={s.addBtn} onPress={() => openNew('expense')}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={s.searchBox}>
        <Ionicons name="search" size={16} color={colors.textTertiary} />
        <TextInput testID="search-tx" placeholder="Buscar..." placeholderTextColor={colors.textTertiary}
          value={search} onChangeText={setSearch} style={s.searchInput} />
      </View>

      <View style={s.filters}>
        {(['all', 'income', 'expense'] as const).map(f => (
          <TouchableOpacity key={f} testID={`filter-${f}`} style={[s.chip, filter === f && s.chipActive]} onPress={() => setFilter(f)}>
            <Text style={[s.chipTxt, filter === f && s.chipTxtActive]}>
              {f === 'all' ? 'Todos' : f === 'income' ? t.entries : t.exits}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <TouchableOpacity onLongPress={() => setActionItem(item)} activeOpacity={0.7}>
            <View style={s.txRow}>
              <View style={[s.txIcon, { backgroundColor: item.type === 'income' ? colors.successSoft : colors.expenseSoft }]}>
                <Ionicons name={item.type === 'income' ? 'arrow-down' : 'arrow-up'} size={18}
                  color={item.type === 'income' ? colors.primary : colors.expense} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.txTitle}>{item.description}</Text>
                <Text style={s.txSub}>{item.category} • {new Date(item.date).toLocaleDateString('pt-BR')}</Text>
              </View>
              <Text style={[s.txAmt, { color: item.type === 'income' ? colors.primary : colors.text }]}>
                {item.type === 'income' ? '+' : '-'} {fmtBRL(item.amount)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="receipt-outline" size={48} color={colors.textTertiary} />
            <Text style={s.emptyTxt}>{t.noTransactions}</Text>
            <Text style={s.emptySub}>Toque no + para adicionar a primeira</Text>
          </View>
        }
      />

      {/* ── Menu de ações (segurar transação) ───────────────────────── */}
      <Modal
        visible={!!actionItem}
        transparent
        animationType="fade"
        onRequestClose={() => setActionItem(null)}
      >
        <TouchableOpacity style={s.actionOverlay} activeOpacity={1} onPress={() => setActionItem(null)}>
          <View style={s.actionSheet}>
            {/* Cabeçalho com info da transação */}
            <View style={s.actionHeader}>
              <View style={[s.actionIcon, {
                backgroundColor: actionItem?.type === 'income' ? colors.successSoft : colors.expenseSoft,
              }]}>
                <Ionicons
                  name={actionItem?.type === 'income' ? 'arrow-down' : 'arrow-up'}
                  size={20}
                  color={actionItem?.type === 'income' ? colors.primary : colors.expense}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionTitle} numberOfLines={1}>{actionItem?.description}</Text>
                <Text style={s.actionSub}>
                  {actionItem?.category} • {actionItem ? new Date(actionItem.date).toLocaleDateString('pt-BR') : ''}
                </Text>
              </View>
              <Text style={[s.actionAmt, {
                color: actionItem?.type === 'income' ? colors.primary : colors.expense,
              }]}>
                {actionItem?.type === 'income' ? '+' : '-'} {actionItem ? fmtBRL(actionItem.amount) : ''}
              </Text>
            </View>

            <View style={s.actionDivider} />

            {/* Botão Editar */}
            <TouchableOpacity style={s.actionBtn} onPress={() => openEdit(actionItem)}>
              <View style={[s.actionBtnIcon, { backgroundColor: colors.primary + '22' }]}>
                <Ionicons name="pencil" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.actionBtnLabel}>Editar transação</Text>
                <Text style={s.actionBtnSub}>Alterar valor, categoria ou descrição</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Botão Excluir */}
            <TouchableOpacity style={s.actionBtn} onPress={() => remove(actionItem?.id)}>
              <View style={[s.actionBtnIcon, { backgroundColor: colors.expense + '22' }]}>
                <Ionicons name="trash" size={18} color={colors.expense} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionBtnLabel, { color: colors.expense }]}>Excluir transação</Text>
                <Text style={s.actionBtnSub}>Esta ação não pode ser desfeita</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Cancelar */}
            <TouchableOpacity style={s.actionCancel} onPress={() => setActionItem(null)}>
              <Text style={s.actionCancelTxt}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Modal de criação / edição ─────────────────────────────────── */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setModal(false)} />
          <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>{editingId ? 'Editar transação' : 'Nova transação'}</Text>

            <View style={s.typeRow}>
              <TouchableOpacity testID="type-expense" style={[s.typeBtn, type === 'expense' && s.typeBtnActiveExp]} onPress={() => { setType('expense'); setCategory(''); }}>
                <Ionicons name="arrow-up" size={16} color={type === 'expense' ? '#fff' : colors.expense} />
                <Text style={[s.typeBtnTxt, type === 'expense' && { color: '#fff' }]}>{t.exits}</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="type-income" style={[s.typeBtn, type === 'income' && s.typeBtnActiveInc]} onPress={() => { setType('income'); setCategory(''); }}>
                <Ionicons name="arrow-down" size={16} color={type === 'income' ? '#fff' : colors.primary} />
                <Text style={[s.typeBtnTxt, type === 'income' && { color: '#fff' }]}>{t.entries}</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.label}>Valor</Text>
            <TextInput testID="input-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
              placeholder="0,00" placeholderTextColor={colors.textTertiary} style={s.bigInput} />

            <Text style={s.label}>Descrição</Text>
            <TextInput testID="input-desc" value={description} onChangeText={setDescription}
              placeholder="Ex: Mercado, Uber..." placeholderTextColor={colors.textTertiary} style={s.input} />

            <Text style={s.label}>Data da transação</Text>
            <TouchableOpacity style={s.dateBtn} onPress={() => setShowPicker(true)}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={s.dateBtnTxt}>{fmtDate(date)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {showPicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
                maximumDate={new Date()}
                locale="pt-BR"
              />
            )}

            {Platform.OS === 'ios' && showPicker && (
              <TouchableOpacity style={s.confirmDateBtn} onPress={() => setShowPicker(false)}>
                <Text style={s.confirmDateTxt}>Confirmar data</Text>
              </TouchableOpacity>
            )}

            <Text style={s.label}>Categoria</Text>
            {availableCategories.length === 0 ? (
              <Text style={s.noCatHint}>Nenhuma categoria de {type === 'expense' ? 'despesa' : 'receita'}. Crie na aba Categorias.</Text>
            ) : (
              <View style={s.catGrid}>
                {availableCategories.map(c => (
                  <TouchableOpacity key={c} style={[s.catChip, category === c && s.catChipActive]} onPress={() => setCategory(c)}>
                    <Text style={[s.catChipTxt, category === c && { color: '#fff' }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity testID="save-tx" style={s.saveBtn} onPress={save} disabled={saving}>
              <Text style={s.saveTxt}>{saving ? t.loading : (editingId ? 'Salvar alterações' : t.save)}</Text>
            </TouchableOpacity>

            {editingId && (
              <TouchableOpacity style={s.cancelEditBtn} onPress={() => setModal(false)}>
                <Text style={s.cancelEditTxt}>Cancelar</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 14,
    paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  filters: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  chipTxtActive: { color: '#fff' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, marginVertical: 4,
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  txIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  txTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  txSub: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  txAmt: { fontSize: 15, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 80, gap: 6 },
  emptyTxt: { color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptySub: { color: colors.textTertiary, fontSize: 12 },

  // Action sheet (long press)
  actionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36 },
  actionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 16 },
  actionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  actionSub: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  actionAmt: { fontSize: 15, fontWeight: '700' },
  actionDivider: { height: 1, backgroundColor: colors.border, marginBottom: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14,
    borderRadius: 16, paddingHorizontal: 4 },
  actionBtnIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionBtnLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  actionBtnSub: { color: colors.textTertiary, fontSize: 12, marginTop: 2 },
  actionCancel: { marginTop: 8, backgroundColor: colors.surfaceElevated, borderRadius: 14,
    height: 50, alignItems: 'center', justifyContent: 'center' },
  actionCancelTxt: { color: colors.textSecondary, fontWeight: '700', fontSize: 15 },

  // Create/Edit modal
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: '90%' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 16 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  typeBtnActiveExp: { backgroundColor: colors.expense, borderColor: colors.expense },
  typeBtnActiveInc: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeBtnTxt: { color: colors.text, fontWeight: '700' },
  label: { color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  input: { backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 48, color: colors.text,
    borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  bigInput: { backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 64, color: colors.text,
    borderWidth: 1, borderColor: colors.border, fontSize: 28, fontWeight: '700' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceElevated,
    borderRadius: 14, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: colors.primary },
  dateBtnTxt: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  confirmDateBtn: { backgroundColor: colors.primary, borderRadius: 12, height: 44,
    alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  confirmDateTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  noCatHint: { color: colors.textTertiary, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 999, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelEditBtn: { borderRadius: 999, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10,
    borderWidth: 1, borderColor: colors.border },
  cancelEditTxt: { color: colors.textSecondary, fontWeight: '600', fontSize: 15 },
});
