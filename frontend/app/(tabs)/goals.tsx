import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { theme, fmtBRL } from '../../src/theme';

const COLORS = ['#16A34A', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4'];

export default function Goals() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ open?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('0');
  const [color, setColor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = async () => { try { setItems(await api.listGoals()); } catch { /* ignore */ } };
  useFocusEffect(useCallback(() => { load(); }, []));
  useEffect(() => { if (params.open) setModal(true); }, [params.open]);

  const save = async () => {
    if (!title.trim()) return Alert.alert('Atenção', 'Informe um título');
    const t = parseFloat(target.replace(',', '.'));
    const cu = parseFloat(current.replace(',', '.')) || 0;
    if (!t || t <= 0) return Alert.alert('Atenção', 'Meta inválida');
    setSaving(true);
    try {
      await api.createGoal({ title: title.trim(), target_amount: t, current_amount: cu, color });
      setModal(false); setTitle(''); setTarget(''); setCurrent('0');
      await load();
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setSaving(false); }
  };

  const addProgress = (g: any) => {
    Alert.prompt('Adicionar valor', `Quanto adicionar à meta "${g.title}"?`, async (v) => {
      const val = parseFloat((v || '').replace(',', '.'));
      if (!val) return;
      await api.updateGoal(g.id, { current_amount: g.current_amount + val });
      await load();
    });
  };

  const remove = (id: string) =>
    Alert.alert('Excluir', 'Excluir meta?', [
      { text: 'Cancelar' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await api.deleteGoal(id); await load(); } },
    ]);

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      <View style={s.headerRow}>
        <Text style={s.title}>Metas</Text>
        <TouchableOpacity testID="add-goal" style={s.addBtn} onPress={() => setModal(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <Text style={s.subtitle}>Conquiste seus objetivos financeiros 🎯</Text>

      <ScrollView contentContainerStyle={{ paddingBottom: 120, paddingTop: 14 }} showsVerticalScrollIndicator={false}>
        {items.length === 0 && (
          <View style={s.empty}>
            <Ionicons name="trophy-outline" size={48} color={theme.colors.textTertiary} />
            <Text style={s.emptyTxt}>Sem metas ainda</Text>
            <Text style={s.emptySub}>Crie sua primeira meta financeira</Text>
          </View>
        )}
        {items.map(g => {
          const pct = Math.min(100, (g.current_amount / g.target_amount) * 100);
          const done = pct >= 100;
          return (
            <TouchableOpacity key={g.id} onPress={() => addProgress(g)} onLongPress={() => remove(g.id)} activeOpacity={0.85}>
              <View style={[s.goalCard, { borderColor: `${g.color}44` }]}>
                <LinearGradient colors={[`${g.color}1f`, 'transparent']} style={StyleSheet.absoluteFill} />
                <View style={s.goalRow}>
                  <View style={[s.goalIcon, { backgroundColor: `${g.color}22`, borderColor: `${g.color}55` }]}>
                    <Ionicons name={done ? 'checkmark-circle' : 'trophy'} size={22} color={g.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.goalTitle}>{g.title}</Text>
                    <Text style={s.goalSub}>{fmtBRL(g.current_amount)} de {fmtBRL(g.target_amount)}</Text>
                  </View>
                  <Text style={[s.goalPct, { color: g.color }]}>{pct.toFixed(0)}%</Text>
                </View>
                <View style={s.progressBar}>
                  <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: g.color }]} />
                </View>
                <Text style={s.goalHint}>Toque para adicionar progresso • Pressione e segure para excluir</Text>
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
            <Text style={s.sheetTitle}>Nova meta</Text>

            <Text style={s.label}>Título</Text>
            <TextInput testID="goal-title" placeholder="Ex: Viagem, Carro novo..." placeholderTextColor={theme.colors.textTertiary}
              value={title} onChangeText={setTitle} style={s.input} />

            <Text style={s.label}>Valor da meta</Text>
            <TextInput testID="goal-target" placeholder="0,00" placeholderTextColor={theme.colors.textTertiary}
              value={target} onChangeText={setTarget} keyboardType="decimal-pad" style={s.input} />

            <Text style={s.label}>Valor inicial (opcional)</Text>
            <TextInput value={current} onChangeText={setCurrent} keyboardType="decimal-pad" style={s.input} />

            <Text style={s.label}>Cor</Text>
            <View style={s.colorRow}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorActive]} />
              ))}
            </View>

            <TouchableOpacity testID="save-goal" style={s.saveBtn} onPress={save} disabled={saving}>
              <Text style={s.saveTxt}>{saving ? 'Salvando...' : 'Criar meta'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: theme.colors.textSecondary, fontSize: 13, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  goalCard: { borderRadius: 20, padding: 18, marginVertical: 8, borderWidth: 1, backgroundColor: theme.colors.surface, overflow: 'hidden' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalIcon: { width: 50, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  goalTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  goalSub: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 3 },
  goalPct: { fontSize: 20, fontWeight: '800' },
  progressBar: { height: 8, borderRadius: 4, backgroundColor: theme.colors.surfaceElevated, marginTop: 14, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  goalHint: { color: theme.colors.textTertiary, fontSize: 10, marginTop: 8 },
  empty: { alignItems: 'center', paddingVertical: 80, gap: 6 },
  emptyTxt: { color: '#fff', fontSize: 15, fontWeight: '600', marginTop: 12 },
  emptySub: { color: theme.colors.textTertiary, fontSize: 12 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: '90%' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { color: theme.colors.textSecondary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 8 },
  input: { backgroundColor: theme.colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 48, color: '#fff',
    borderWidth: 1, borderColor: theme.colors.border, fontSize: 15 },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorActive: { borderColor: '#fff' },
  saveBtn: { backgroundColor: theme.colors.primary, borderRadius: 999, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
