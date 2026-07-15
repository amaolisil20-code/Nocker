import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert, Dimensions,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Redirect, useRouter } from 'expo-router';
import { useCachedLoad } from '../../src/useCachedLoad';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { staleWhileRevalidate } from '../../src/cache';
import { useTheme } from '../../src/ThemeContext';
import { useAuth } from '../../src/AuthContext';
import { PluggyConnectFlow } from '../../src/components/PluggyConnectFlow';

const COLORS = ['#16A34A', '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];
const BRANDS = ['Visa', 'Mastercard', 'Elo', 'Amex'];

export default function Cards() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, t, themeMode } = useTheme();
  const { user, loading: authLoading } = useAuth();
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
  const [bankModal, setBankModal] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [openFinanceMode, setOpenFinanceMode] = useState<'real' | 'mock'>('mock');
  const [openFinanceProvider, setOpenFinanceProvider] = useState<string>('mock');
  const [openFinanceReason, setOpenFinanceReason] = useState<string | null>(null);
  const [loadingInstitutions, setLoadingInstitutions] = useState(false);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [connectingBankId, setConnectingBankId] = useState<string | null>(null);
  const [syncingConnectionId, setSyncingConnectionId] = useState<string | null>(null);
  const [selectedInstitution, setSelectedInstitution] = useState<any | null>(null);
  const [pluggyConnectVisible, setPluggyConnectVisible] = useState(false);

  if (!authLoading && !user) {
    return <Redirect href="/login" />;
  }

  const fmtBRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const load = async () => {
    try {
      const [cards, connected, ofStatus] = await Promise.all([
        api.listCards(),
        api.listOpenFinanceConnections().catch(() => []),
        api.getOpenFinanceStatus?.().catch(() => ({ mode: 'mock', provider: 'mock', fallback_reason: null })),
      ]);
      setItems(cards);
      setConnections(connected || []);
      setOpenFinanceMode(ofStatus?.mode === 'real' ? 'real' : 'mock');
      setOpenFinanceProvider(ofStatus?.provider || 'mock');
      setOpenFinanceReason(ofStatus?.fallback_reason || null);
    } catch {
      /* ignore */
    }
  };

  useCachedLoad('cards_data', load, () => {});
  useEffect(() => {
    if (params.open === 'bank') openBankConnect();
    else if (params.open) setModal(true);
  }, [params.open]);

  const openBankConnect = async () => {
    if (!user) {
      Alert.alert('Sessão expirada', 'Entre novamente para conectar um banco.');
      router.replace('/login');
      return;
    }
    setBankModal(true);
    if (institutions.length > 0) return;
    setLoadingInstitutions(true);
    try {
      const rows = await api.listOpenFinanceInstitutions();
      setInstitutions(rows || []);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível carregar instituições.');
    } finally {
      setLoadingInstitutions(false);
    }
  };

  const connectInstitution = async (institution: any, providerItemId?: string) => {
    if (!user) {
      Alert.alert('Sessão expirada', 'Entre novamente para conectar um banco.');
      router.replace('/login');
      return;
    }
    if (openFinanceMode === 'real' && openFinanceProvider === 'pluggy' && !providerItemId?.trim()) {
      return Alert.alert('Pluggy Connect', 'O itemId precisa vir do fluxo oficial do Pluggy Connect.');
    }
    setConnectingBankId(institution.id);
    try {
      await api.connectOpenFinanceBank(
        institution.id,
        institution.name,
        openFinanceMode === 'real' && openFinanceProvider === 'pluggy' ? providerItemId?.trim() : undefined
      );
      setBankModal(false);
      setBankSearch('');
      await load();
      Alert.alert('Conectado', `${institution.name} conectado com sucesso.`);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível conectar o banco.');
    } finally {
      setConnectingBankId(null);
    }
  };

  const beginInstitutionConnect = (institution: any) => {
    if (openFinanceMode === 'real' && openFinanceProvider === 'pluggy') {
      if (Platform.OS === 'web') {
        Alert.alert('Pluggy Connect', 'Abra o app no Android ou iPhone para concluir a conexão real com o Pluggy.');
        return;
      }
      setSelectedInstitution(institution);
      setPluggyConnectVisible(true);
      setBankModal(false);
      return;
    }

    void connectInstitution(institution);
  };

  const handlePluggySuccess = async (itemId: string) => {
    if (!selectedInstitution) {
      setPluggyConnectVisible(false);
      return;
    }

    setPluggyConnectVisible(false);
    try {
      await connectInstitution(selectedInstitution, itemId);
    } finally {
      setSelectedInstitution(null);
    }
  };

  const handlePluggyClose = () => {
    setPluggyConnectVisible(false);
    setSelectedInstitution(null);
  };

  const syncConnection = async (connectionId: string) => {
    setSyncingConnectionId(connectionId);
    try {
      await api.syncOpenFinanceConnection(connectionId);
      await load();
      Alert.alert('Sincronizado', 'Dados atualizados com sucesso.');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao sincronizar conexão.');
    } finally {
      setSyncingConnectionId(null);
    }
  };

  const disconnectConnection = async (connectionId: string, institutionName: string) => {
    Alert.alert('Desconectar', `Desconectar ${institutionName}?`, [
      { text: 'Cancelar' },
      {
        text: 'Desconectar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.disconnectOpenFinanceConnection(connectionId);
            await load();
          } catch (e: any) {
            Alert.alert('Erro', e.message || 'Não foi possível desconectar.');
          }
        },
      },
    ]);
  };

  const filteredInstitutions = institutions.filter((i) =>
    (i.name || '').toLowerCase().includes(bankSearch.trim().toLowerCase())
  );

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
        <TouchableOpacity
          testID="add-card"
          style={s.addBtn}
          onPress={() => {
            Alert.alert('Adicionar', 'Escolha como deseja adicionar', [
              { text: 'Conectar banco', onPress: openBankConnect },
              { text: 'Cartão manual', onPress: () => setModal(true) },
              { text: 'Cancelar', style: 'cancel' },
            ]);
          }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 6 }} showsVerticalScrollIndicator={false}>
        <View style={s.connCard}>
          <View style={s.connHeader}>
            <Text style={s.connTitle}>Contas conectadas</Text>
            <TouchableOpacity onPress={openBankConnect} style={s.linkBtn}>
              <Text style={s.linkBtnText}>Conectar banco</Text>
            </TouchableOpacity>
          </View>

          {openFinanceMode !== 'real' && (
            <View style={s.demoWarning}>
              <Text style={s.demoWarningTitle}>Modo demonstração ativo</Text>
              <Text style={s.demoWarningText}>
                PIX e transações reais ainda não são importados automaticamente.
              </Text>
              {!!openFinanceReason && <Text style={s.demoWarningReason}>{openFinanceReason}</Text>}
            </View>
          )}

          {connections.length === 0 ? (
            <Text style={s.connEmpty}>Nenhuma conta conectada ainda.</Text>
          ) : (
            connections.map((entry: any) => {
              const conn = entry.connection || entry;
              const accounts = entry.accounts || [];
              const cards = entry.cards || [];
              return (
                <View key={conn.id} style={s.connItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.connBank}>{conn.institution_name}</Text>
                    <Text style={s.connMeta}>
                      {accounts.length} conta(s) • {cards.length} cartão(ões) • {conn.status}
                    </Text>
                    <Text style={s.connMetaSmall}>
                      Última sync: {conn.last_sync ? new Date(conn.last_sync).toLocaleString('pt-BR') : 'Nunca'}
                    </Text>
                  </View>
                  <View style={s.connActions}>
                    <TouchableOpacity onPress={() => syncConnection(conn.id)}>
                      <Text style={s.connActionTxt}>{syncingConnectionId === conn.id ? 'Sync...' : 'Atualizar'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => disconnectConnection(conn.id, conn.institution_name)}>
                      <Text style={[s.connActionTxt, { color: '#EF4444' }]}>Desconectar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

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

      <Modal visible={bankModal} transparent animationType="slide" onRequestClose={() => setBankModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setBankModal(false)} />
          <ScrollView style={s.sheet} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Conectar instituição</Text>

            <TextInput
              placeholder="Buscar banco"
              placeholderTextColor={colors.textTertiary}
              value={bankSearch}
              onChangeText={setBankSearch}
              style={s.input}
            />

            {loadingInstitutions ? (
              <Text style={s.connEmpty}>Carregando instituições...</Text>
            ) : filteredInstitutions.length === 0 ? (
              <Text style={s.connEmpty}>Nenhuma instituição encontrada.</Text>
            ) : (
              filteredInstitutions.map((inst) => (
                <TouchableOpacity
                  key={inst.id}
                  style={s.bankItem}
                  onPress={() => beginInstitutionConnect(inst)}
                  disabled={connectingBankId === inst.id}
                >
                  <Text style={s.bankName}>{inst.name}</Text>
                  <Text style={s.bankAction}>{connectingBankId === inst.id ? 'Conectando...' : 'Conectar'}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <PluggyConnectFlow
        visible={pluggyConnectVisible}
        userId={user?.id || ''}
        institutionName={selectedInstitution?.name}
        onSuccess={handlePluggySuccess}
        onClose={handlePluggyClose}
        onError={(message) => Alert.alert('Pluggy Connect', message)}
      />

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
  connCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  connHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  connTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  linkBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surfaceElevated },
  linkBtnText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  demoWarning: {
    borderWidth: 1,
    borderColor: '#F59E0B66',
    backgroundColor: '#F59E0B1A',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  demoWarningTitle: { color: '#F59E0B', fontWeight: '700', fontSize: 12 },
  demoWarningText: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  demoWarningReason: { color: colors.textTertiary, fontSize: 11, marginTop: 4 },
  connEmpty: { color: colors.textSecondary, fontSize: 13, paddingVertical: 8 },
  connItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  connBank: { color: colors.text, fontSize: 14, fontWeight: '700' },
  connMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  connMetaSmall: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  connActions: { gap: 10, alignItems: 'flex-end' },
  connActionTxt: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 10,
  },
  bankName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  bankAction: { color: colors.primary, fontSize: 12, fontWeight: '700' },
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