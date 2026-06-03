import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert, Dimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCachedLoad } from '../../src/useCachedLoad';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { staleWhileRevalidate } from '../../src/cache';
import { useTheme } from '../../src/ThemeContext';

const COLORS = ['#16A34A', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];
const BRANDS = ['Visa', 'Mastercard', 'Elo', 'Amex'];

export default function Cards() {
  const insets = useSafeAreaInsets();
  const { colors, t, themeMode } = useTheme();
  const s = makeStyles(colors);
  const params = useLocalSearchParams<{ open?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [digits, setDigits] = useState('');
  const [brand, setBrand] = useState('Visa');
  const [limit, setLimit] = useState('');
  const [closing, setClosing] = useState('5');
  const [due, setDue] = useState('15');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const load = async () => { try { setItems(await api.listCards()); } catch { /* ignore */ } };

  useCachedLoad('cards_data', load, () => {});
  useEffect(() => { if (params.open) setModal(true); }, [params.open]);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Atenção', 'Nome do cartão');
    if (digits.length < 4) return Alert.alert('Atenção', 'Últimos 4 dígitos');
    const lim = parseFloat(limit.replace(',', '.'));
    if (!lim || lim <= 0) return Alert.alert('Atenção', 'Limite válido');
    setSaving(true);
    try {
      await api.createCard({
        name: name.trim(), last_digits: digits, brand, limit: lim,
        closing_day: parseInt(closing) || 5, due_day: parseInt(due) || 15, color,
      });
      setModal(false); setName(''); setDigits(''); setLimit('');
      await load();
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setSaving(false); }
  };

  const remove = (id: string) =>
    Alert.alert(t.delete, 'Excluir cartão?', [
      { text: t.cancel },
      { text: t.delete, style: 'destructive', onPress: async () => { await api.deleteCard(id); await load(); } },
    ]);

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      <View style={s.headerRow}>
        <Text style={s.title}>{t.cards}</Text>
        <TouchableOpacity testID="add-card" style={s.addBtn} onPress={() => setModal(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 6 }} showsVerticalScrollIndicator={false}>
        {items.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="card-outline" size={48} color={colors.textTertiary} />
            <Text style={s.emptyTxt}>Nenhum cartão cadastrado</Text>
            <Text style={s.emptySub}>Adicione seu primeiro cartão para acompanhar o limite e os gastos</Text>
          </View>
        )}
        {items.map(card => {
          const pct = card.limit ? Math.min(100, (card.used / card.limit) * 100) : 0;
          return (
            <TouchableOpacity key={card.id} onLongPress={() => remove(card.id)} activeOpacity={0.85}>
              <View style={[s.cardBox, { borderColor: `${card.color}44` }]}>
                <LinearGradient
                  colors={themeMode === 'dark' ? [`${card.color}55`, `${card.color}11`, '#0A0A0A'] : [`${card.color}44`, `${card.color}11`, '#FFFFFF']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={[s.cardGlow, { backgroundColor: `${card.color}44` }]} />
                <View style={s.cardTopRow}>
                  <View>
                    <Text style={s.cardLabel}>Cartão</Text>
                    <Text style={s.cardName}>{card.name}</Text>
                  </View>
                  <Text style={s.brand}>{card.brand}</Text>
                </View>
                <View style={s.chip} />
                <Text style={s.digits}>•••• •••• •••• {card.last_digits}</Text>
                <View style={s.cardBottomRow}>
                  <View>
                    <Text style={s.cardLabel}>Usado</Text>
                    <Text style={s.cardVal}>{fmtBRL(card.used)}</Text>
                  </View>
                  <View>
                    <Text style={[s.cardLabel, { textAlign: 'right' }]}>Limite</Text>
                    <Text style={[s.cardVal, { textAlign: 'right' }]}>{fmtBRL(card.limit)}</Text>
                  </View>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: card.color }]} />
                </View>
                <Text style={s.cardMeta}>Fecha dia {card.closing_day} • Vence dia {card.due_day}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setModal(false)} />
          <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Novo cartão</Text>

            <Text style={s.label}>Apelido</Text>
            <TextInput testID="card-name" placeholder="Ex: Nubank" placeholderTextColor={colors.textTertiary}
              value={name} onChangeText={setName} style={s.input} />

            <Text style={s.label}>Últimos 4 dígitos</Text>
            <TextInput testID="card-digits" placeholder="1234" placeholderTextColor={colors.textTertiary}
              value={digits} onChangeText={t_text => setDigits(t_text.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" style={s.input} />

            <Text style={s.label}>Bandeira</Text>
            <View style={s.row}>
              {BRANDS.map(b => (
                <TouchableOpacity key={b} style={[s.chipBtn, brand === b && s.chipActive]} onPress={() => setBrand(b)}>
                  <Text style={[s.chipTxt, brand === b && { color: '#fff' }]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Limite</Text>
            <TextInput testID="card-limit" placeholder="0,00" placeholderTextColor={colors.textTertiary}
              value={limit} onChangeText={setLimit} keyboardType="decimal-pad" style={s.input} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Fecha dia</Text>
                <TextInput value={closing} onChangeText={setClosing} keyboardType="number-pad" style={s.input} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>Vence dia</Text>
                <TextInput value={due} onChangeText={setDue} keyboardType="number-pad" style={s.input} />
              </View>
            </View>

            <Text style={s.label}>Cor</Text>
            <View style={s.row}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorActive]} />
              ))}
            </View>

            <TouchableOpacity testID="save-card" style={s.saveBtn} onPress={save} disabled={saving}>
              <Text style={s.saveTxt}>{saving ? t.loading : t.save}</Text>
            </TouchableOpacity>
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
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  cardBox: { borderRadius: 24, padding: 22, marginVertical: 10, borderWidth: 1, overflow: 'hidden',
    backgroundColor: colors.surface, minHeight: 210 },
  cardGlow: { position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 80 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardName: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 2 },
  brand: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 1, opacity: 0.9 },
  chip: { width: 40, height: 28, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 18 },
  digits: { color: '#fff', fontSize: 18, fontWeight: '600', letterSpacing: 2, marginTop: 12, opacity: 0.95 },
  cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  cardVal: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 2 },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  cardMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 10 },
  empty: { alignItems: 'center', paddingVertical: 80, gap: 6 },
  emptyTxt: { color: colors.text, fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptySub: { color: colors.textTertiary, fontSize: 12, textAlign: 'center', paddingHorizontal: 40 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: '90%' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { color: colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  input: { backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 48, color: colors.text,
    borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chipBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorActive: { borderColor: colors.text },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 999, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});