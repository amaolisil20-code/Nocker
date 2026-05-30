import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  Switch, Modal, TextInput, KeyboardAvoidingView, Platform, Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/AuthContext';
import { useTheme } from '../../src/ThemeContext';
import { api } from '../../src/api';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function formatBirthDate(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0,2)}/${d.slice(2)}`;
  return `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
}

function birthDisplayToISO(display: string): string | undefined {
  const parts = display.split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return undefined;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function isoToBirthDisplay(iso?: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatCurrency(val: string): string {
  const nums = val.replace(/\D/g, '');
  if (!nums) return '';
  const n = parseInt(nums, 10) / 100;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCurrency(val: string): number {
  return parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type FinancialTab = 'geral' | 'categorias' | 'alertas';

interface CategoryLimit {
  id: string;
  category_name: string;
  monthly_limit: number;
  color: string;
}

interface SpendingAlert {
  id: string;
  type: 'monthly_limit' | 'category_limit' | 'income_goal';
  threshold_pct: number;
  active: boolean;
}

interface UserCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  icon: string;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, setUser } = useAuth();
  const { themeMode, language, colors, t, toggleTheme, setLanguage } = useTheme();
  const s = makeStyles(colors);

  // ── Profile modal state ──────────────────────────────────────
  const [profileModal, setProfileModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBirth, setEditBirth] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Financial modal state ────────────────────────────────────
  const [financialModal, setFinancialModal] = useState(false);
  const [financialTab, setFinancialTab] = useState<FinancialTab>('geral');

  // Geral
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [savingFinancial, setSavingFinancial] = useState(false);

  // Categorias — usa as categorias JÁ criadas pelo usuário
  const [userCategories, setUserCategories] = useState<UserCategory[]>([]);
  const [categoryLimits, setCategoryLimits] = useState<CategoryLimit[]>([]);
  const [catLimitModal, setCatLimitModal] = useState(false);
  const [selectedCat, setSelectedCat] = useState<UserCategory | null>(null);
  const [catLimitValue, setCatLimitValue] = useState('');
  const [savingCatLimit, setSavingCatLimit] = useState(false);

  // Alertas
  const [alerts, setAlerts] = useState<SpendingAlert[]>([]);
  const [savingAlert, setSavingAlert] = useState<string | null>(null);

  // ── Load profile modal ───────────────────────────────────────
  const openProfile = () => {
    setEditName(user?.name || '');
    setEditUsername(user?.username || '');
    setEditEmail(user?.email || '');
    setEditPhone(user?.phone || '');
    setEditBirth(isoToBirthDisplay(user?.birth_date));
    setProfileModal(true);
  };

  const saveProfile = async () => {
    if (!editName.trim()) return Alert.alert('Atenção', 'O nome não pode ficar vazio.');
    setSaving(true);
    try {
      const birthISO = birthDisplayToISO(editBirth);
      const updated = await api.updateProfile({
        name: editName.trim(),
        username: editUsername.trim() || undefined,
        phone: editPhone.replace(/\D/g, '') || undefined,
        birth_date: birthISO,
      });
      setUser(updated);
      setProfileModal(false);
      Alert.alert('Sucesso', 'Perfil atualizado com sucesso!');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  // ── Load financial modal ─────────────────────────────────────
  const loadFinancialData = async () => {
    try {
      const [settings, limits, alertsData, cats] = await Promise.all([
        api.getFinancialSettings(),
        api.listCategoryLimits(),
        api.listSpendingAlerts(),
        api.listCategories(),
      ]);
      // Geral
      setMonthlyIncome(
        settings.monthly_income > 0
          ? settings.monthly_income.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : ''
      );
      setMonthlyLimit(
        settings.monthly_limit > 0
          ? settings.monthly_limit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : ''
      );
      // Categorias do usuário (apenas despesas fazem sentido para limite)
      setUserCategories(cats.filter((c: UserCategory) => c.type === 'expense'));
      setCategoryLimits(limits);
      // Alertas — garante os 3 tipos existem na lista local
      const defaultAlerts: SpendingAlert[] = [
        { id: '', type: 'monthly_limit',   threshold_pct: 80, active: false },
        { id: '', type: 'category_limit',  threshold_pct: 80, active: false },
        { id: '', type: 'income_goal',     threshold_pct: 80, active: false },
      ];
      const merged = defaultAlerts.map(def => {
        const found = alertsData.find((a: SpendingAlert) => a.type === def.type);
        return found || def;
      });
      setAlerts(merged);
    } catch (e: any) {
      Alert.alert('Erro', 'Não foi possível carregar configurações financeiras.');
    }
  };

  const openFinancial = () => {
    setFinancialTab('geral');
    setFinancialModal(true);
    loadFinancialData();
  };

  // ── Save Geral ───────────────────────────────────────────────
  const saveFinancialGeral = async () => {
    setSavingFinancial(true);
    try {
      await api.updateFinancialSettings({
        monthly_income: parseCurrency(monthlyIncome),
        monthly_limit: parseCurrency(monthlyLimit),
      });
      Alert.alert('Salvo!', 'Configurações financeiras atualizadas.');
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSavingFinancial(false);
    }
  };

  // ── Category limit ───────────────────────────────────────────
  const getLimitForCategory = (name: string): CategoryLimit | undefined =>
    categoryLimits.find(l => l.category_name === name);

  const openCatLimit = (cat: UserCategory) => {
    const existing = getLimitForCategory(cat.name);
    setSelectedCat(cat);
    setCatLimitValue(
      existing
        ? existing.monthly_limit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : ''
    );
    setCatLimitModal(true);
  };

  const saveCatLimit = async () => {
    if (!selectedCat) return;
    const value = parseCurrency(catLimitValue);
    if (!value || value <= 0) return Alert.alert('Atenção', 'Informe um valor válido.');
    setSavingCatLimit(true);
    try {
      await api.upsertCategoryLimit({
        category_name: selectedCat.name,
        monthly_limit: value,
        color: selectedCat.color,
      });
      const updated = await api.listCategoryLimits();
      setCategoryLimits(updated);
      setCatLimitModal(false);
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSavingCatLimit(false);
    }
  };

  const removeCatLimit = (limit: CategoryLimit) => {
    Alert.alert('Remover limite', `Remover limite de "${limit.category_name}"?`, [
      { text: 'Cancelar' },
      {
        text: 'Remover', style: 'destructive', onPress: async () => {
          try {
            await api.deleteCategoryLimit(limit.id);
            setCategoryLimits(prev => prev.filter(l => l.id !== limit.id));
          } catch (e: any) { Alert.alert('Erro', e.message); }
        },
      },
    ]);
  };

  // ── Spending alerts ──────────────────────────────────────────
  const toggleAlert = async (alert: SpendingAlert) => {
    setSavingAlert(alert.type);
    try {
      const updated = await api.upsertSpendingAlert({
        type: alert.type,
        threshold_pct: alert.threshold_pct,
        active: !alert.active,
      });
      setAlerts(prev => prev.map(a => a.type === alert.type ? { ...a, ...updated } : a));
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSavingAlert(null);
    }
  };

  const updateAlertThreshold = async (alert: SpendingAlert, pct: number) => {
    setSavingAlert(alert.type);
    try {
      const updated = await api.upsertSpendingAlert({
        type: alert.type,
        threshold_pct: pct,
        active: alert.active,
      });
      setAlerts(prev => prev.map(a => a.type === alert.type ? { ...a, ...updated } : a));
    } catch (e: any) {
      Alert.alert('Erro', e.message);
    } finally {
      setSavingAlert(null);
    }
  };

  // ── Misc ─────────────────────────────────────────────────────
  const doLogout = () => {
    Alert.alert(t.logout, t.logoutConfirm, [
      { text: t.cancel },
      { text: t.logout, style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const showLanguagePicker = () => {
    Alert.alert(t.selectLanguage, '', [
      { text: t.portuguese, onPress: () => setLanguage('pt') },
      { text: t.english,    onPress: () => setLanguage('en') },
      { text: t.spanish,    onPress: () => setLanguage('es') },
      { text: t.cancel, style: 'cancel' },
    ]);
  };

  const langLabel = language === 'pt' ? t.portuguese : language === 'en' ? t.english : t.spanish;

  // ── Reusable list item ───────────────────────────────────────
  const Item = ({ icon, label, hint, onPress, color, right }: any) => (
    <TouchableOpacity style={s.item} onPress={onPress} activeOpacity={0.8}>
      <View style={s.itemIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.itemLabel, color && { color }]}>{label}</Text>
        {hint ? <Text style={s.itemHint}>{hint}</Text> : null}
      </View>
      {right || <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />}
    </TouchableOpacity>
  );

  // ── Avatar initials ──────────────────────────────────────────
  const initials = (user?.name || 'N')
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const alertLabels: Record<string, string> = {
    monthly_limit:  'Limite mensal geral',
    category_limit: 'Limite por categoria',
    income_goal:    'Meta de receita',
  };
  const alertHints: Record<string, string> = {
    monthly_limit:  'Alerta quando os gastos do mês atingirem o percentual do limite',
    category_limit: 'Alerta quando uma categoria atingir o percentual do limite dela',
    income_goal:    'Alerta quando a receita atingir o percentual da renda configurada',
  };

  // ─── Render ────────────────────────────────────────────────
  return (
    <>
      <ScrollView
        style={s.c}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 120, paddingHorizontal: 20 }}
      >
        {/* Header */}
        <View style={s.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.title}>{t.settings}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Profile card */}
        <TouchableOpacity style={s.profileCard} onPress={openProfile} activeOpacity={0.85}>
          <View style={s.avatarWrap}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={s.avatarImg} />
            ) : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarInitials}>{initials}</Text>
              </View>
            )}
            <View style={s.avatarEditBadge}>
              <Ionicons name="pencil" size={11} color="#fff" />
            </View>
          </View>
          <View style={s.profileInfo}>
            <Text style={s.profileName}>{user?.name}</Text>
            {user?.username ? <Text style={s.profileUsername}>@{user.username}</Text> : null}
            <Text style={s.profileEmail}>{user?.email}</Text>
          </View>
          <View style={s.profileEditHint}>
            <Text style={s.profileEditHintTxt}>Editar</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </View>
        </TouchableOpacity>

        {/* Account section */}
        <Text style={s.section}>{t.account}</Text>
        <View style={s.group}>
          <Item icon="person-outline" label={t.profile} hint={t.profileHint} onPress={openProfile} />
          {/* ← Item Financeiro conectado ao modal */}
          <Item
            icon="cash-outline"
            label="Financeiro"
            hint="Renda, limites e alertas"
            onPress={openFinancial}
          />
          <Item icon="shield-checkmark-outline" label={t.security} hint={t.securityHint} onPress={() => Alert.alert(t.comingSoon, '')} />
          <Item icon="notifications-outline" label={t.notifications} hint={t.notificationsHint} onPress={() => Alert.alert(t.comingSoon, '')} />
        </View>

        {/* Preferences section */}
        <Text style={s.section}>{t.preferences}</Text>
        <View style={s.group}>
          <Item
            icon={themeMode === 'dark' ? 'moon-outline' : 'sunny-outline'}
            label={t.appearance}
            hint={themeMode === 'dark' ? t.appearanceDark : t.appearanceLight}
            onPress={toggleTheme}
            right={
              <Switch
                value={themeMode === 'dark'}
                onValueChange={toggleTheme}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            }
          />
          <Item icon="language-outline" label={t.language} hint={langLabel} onPress={showLanguagePicker} />
        </View>

        {/* More section */}
        <Text style={s.section}>{t.more}</Text>
        <View style={s.group}>
          <Item icon="cloud-upload-outline" label={t.export}  hint={t.exportHint}  onPress={() => Alert.alert(t.comingSoon, '')} />
          <Item icon="link-outline"         label={t.banking} hint={t.bankingHint} onPress={() => Alert.alert(t.comingSoon, '')} />
          <Item icon="help-circle-outline"  label={t.help}    hint={t.helpHint}    onPress={() => Alert.alert(t.comingSoon, '')} />
        </View>

        {/* Logout */}
        <TouchableOpacity style={s.logout} onPress={doLogout}>
          <Ionicons name="log-out-outline" size={18} color="#EF4444" />
          <Text style={s.logoutTxt}>{t.logout}</Text>
        </TouchableOpacity>

        <Text style={s.foot}>{t.version}</Text>
      </ScrollView>

      {/* ═══ Profile Edit Modal ═══════════════════════════════════ */}
      <Modal visible={profileModal} transparent animationType="slide" onRequestClose={() => setProfileModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setProfileModal(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Editar Perfil</Text>
              <TouchableOpacity onPress={() => setProfileModal(false)} style={s.sheetClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.avatarSection}>
                {user?.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={s.avatarLarge} />
                ) : (
                  <View style={s.avatarLargeFallback}>
                    <Text style={s.avatarLargeInitials}>{initials}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={s.changePhotoBtn}
                  onPress={() => Alert.alert('Em breve', 'Upload de foto via câmera/galeria em desenvolvimento.')}
                >
                  <Ionicons name="camera-outline" size={16} color={colors.primary} />
                  <Text style={s.changePhotoTxt}>Alterar foto</Text>
                </TouchableOpacity>
              </View>

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Nome completo</Text>
                <View style={s.fieldRow}>
                  <View style={s.fieldIcon}><Ionicons name="person-outline" size={16} color={colors.primary} /></View>
                  <TextInput style={s.fieldInput} value={editName} onChangeText={setEditName} placeholder="Seu nome" placeholderTextColor={colors.textTertiary} autoCapitalize="words" />
                </View>
              </View>

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Username</Text>
                <View style={s.fieldRow}>
                  <View style={s.fieldIcon}><Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>@</Text></View>
                  <TextInput style={s.fieldInput} value={editUsername} onChangeText={v => setEditUsername(v.replace(/\s/g, '').toLowerCase())} placeholder="seu_username" placeholderTextColor={colors.textTertiary} autoCapitalize="none" autoCorrect={false} />
                </View>
              </View>

              <View style={s.fieldGroup}>
                <View style={s.fieldLabelRow}>
                  <Text style={s.fieldLabel}>E-mail</Text>
                  <View style={s.readOnlyBadge}>
                    <Ionicons name="lock-closed" size={10} color={colors.textTertiary} />
                    <Text style={s.readOnlyTxt}>Não editável</Text>
                  </View>
                </View>
                <View style={[s.fieldRow, s.fieldRowDisabled]}>
                  <View style={s.fieldIcon}><Ionicons name="mail-outline" size={16} color={colors.textTertiary} /></View>
                  <Text style={[s.fieldInput, { color: colors.textSecondary }]}>{editEmail}</Text>
                </View>
              </View>

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Número de telefone</Text>
                <View style={s.fieldRow}>
                  <View style={s.fieldIcon}><Ionicons name="call-outline" size={16} color={colors.primary} /></View>
                  <TextInput style={s.fieldInput} value={editPhone} onChangeText={v => setEditPhone(formatPhone(v))} placeholder="(00) 00000-0000" placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" />
                </View>
              </View>

              <View style={s.fieldGroup}>
                <Text style={s.fieldLabel}>Data de nascimento</Text>
                <View style={s.fieldRow}>
                  <View style={s.fieldIcon}><Ionicons name="calendar-outline" size={16} color={colors.primary} /></View>
                  <TextInput style={s.fieldInput} value={editBirth} onChangeText={v => setEditBirth(formatBirthDate(v))} placeholder="DD/MM/AAAA" placeholderTextColor={colors.textTertiary} keyboardType="numeric" maxLength={10} />
                </View>
              </View>

              <TouchableOpacity style={s.saveBtn} onPress={saveProfile} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={s.saveTxt}>Salvar alterações</Text></>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setProfileModal(false)}>
                <Text style={s.cancelTxt}>Cancelar</Text>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ Financial Modal ══════════════════════════════════════ */}
      <Modal visible={financialModal} transparent animationType="slide" onRequestClose={() => setFinancialModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setFinancialModal(false)} />
          <View style={[s.sheet, { maxHeight: '92%' }]}>
            <View style={s.sheetHandle} />

            {/* Sheet header */}
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Financeiro</Text>
              <TouchableOpacity onPress={() => setFinancialModal(false)} style={s.sheetClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={s.tabRow}>
              {(['geral', 'categorias', 'alertas'] as FinancialTab[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[s.tabBtn, financialTab === tab && s.tabBtnActive]}
                  onPress={() => setFinancialTab(tab)}
                >
                  <Text style={[s.tabTxt, financialTab === tab && s.tabTxtActive]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Tab: Geral ── */}
            {financialTab === 'geral' && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={s.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={s.infoTxt}>
                    Configure sua renda mensal e o limite total de gastos para acompanhar sua saúde financeira.
                  </Text>
                </View>

                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>Renda mensal</Text>
                  <View style={s.fieldRow}>
                    <View style={s.fieldIcon}><Text style={{ color: colors.primary, fontWeight: '700' }}>R$</Text></View>
                    <TextInput
                      style={s.fieldInput}
                      value={monthlyIncome}
                      onChangeText={v => setMonthlyIncome(formatCurrency(v))}
                      placeholder="0,00"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>Limite de gastos mensais</Text>
                  <View style={s.fieldRow}>
                    <View style={s.fieldIcon}><Text style={{ color: colors.expense || '#EF4444', fontWeight: '700' }}>R$</Text></View>
                    <TextInput
                      style={s.fieldInput}
                      value={monthlyLimit}
                      onChangeText={v => setMonthlyLimit(formatCurrency(v))}
                      placeholder="0,00"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <TouchableOpacity style={s.saveBtn} onPress={saveFinancialGeral} disabled={savingFinancial}>
                  {savingFinancial ? <ActivityIndicator color="#fff" /> : (
                    <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={s.saveTxt}>Salvar</Text></>
                  )}
                </TouchableOpacity>
                <View style={{ height: 20 }} />
              </ScrollView>
            )}

            {/* ── Tab: Categorias ── */}
            {financialTab === 'categorias' && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={s.infoTxt}>
                    Defina um limite mensal para cada categoria de despesa que você já criou.
                    Para adicionar novas categorias, vá à aba Categorias do app.
                  </Text>
                </View>

                {userCategories.length === 0 ? (
                  <View style={s.emptyBox}>
                    <Ionicons name="pricetag-outline" size={32} color={colors.textTertiary} />
                    <Text style={s.emptyTxt}>Nenhuma categoria de despesa encontrada.</Text>
                    <Text style={s.emptyHint}>Crie categorias na aba Categorias do app.</Text>
                  </View>
                ) : (
                  userCategories.map(cat => {
                    const limit = getLimitForCategory(cat.name);
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={s.catLimitRow}
                        onPress={() => openCatLimit(cat)}
                        activeOpacity={0.8}
                      >
                        {/* Bolinha colorida da categoria */}
                        <View style={[s.catDot, { backgroundColor: cat.color }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.catLimitName}>{cat.name}</Text>
                          {limit ? (
                            <Text style={s.catLimitValue}>
                              Limite: R$ {limit.monthly_limit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                            </Text>
                          ) : (
                            <Text style={s.catLimitEmpty}>Sem limite definido — toque para configurar</Text>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                          {limit && (
                            <TouchableOpacity onPress={() => removeCatLimit(limit)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Ionicons name="trash-outline" size={18} color="#EF4444" />
                            </TouchableOpacity>
                          )}
                          <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}

            {/* ── Tab: Alertas ── */}
            {financialTab === 'alertas' && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={s.infoTxt}>
                    Ative alertas para ser avisado quando seus gastos atingirem um percentual dos limites configurados.
                  </Text>
                </View>

                {alerts.map(alert => (
                  <View key={alert.type} style={s.alertCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.alertLabel}>{alertLabels[alert.type]}</Text>
                      <Text style={s.alertHint}>{alertHints[alert.type]}</Text>

                      {/* Percentual */}
                      <View style={s.pctRow}>
                        <Text style={s.pctLabel}>Percentual de alerta</Text>
                        <View style={s.pctBtns}>
                          {[50, 70, 80, 90].map(pct => (
                            <TouchableOpacity
                              key={pct}
                              style={[s.pctBtn, alert.threshold_pct === pct && s.pctBtnActive]}
                              onPress={() => updateAlertThreshold(alert, pct)}
                              disabled={savingAlert === alert.type}
                            >
                              <Text style={[s.pctBtnTxt, alert.threshold_pct === pct && s.pctBtnTxtActive]}>
                                {pct}%
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    </View>

                    <Switch
                      value={alert.active}
                      onValueChange={() => toggleAlert(alert)}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#fff"
                      disabled={savingAlert === alert.type}
                    />
                  </View>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ Category Limit Value Modal ══════════════════════════ */}
      <Modal visible={catLimitModal} transparent animationType="slide" onRequestClose={() => setCatLimitModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setCatLimitModal(false)} />
          <View style={[s.sheet, { maxHeight: '50%' }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>
                Limite — {selectedCat?.name}
              </Text>
              <TouchableOpacity onPress={() => setCatLimitModal(false)} style={s.sheetClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Limite mensal para esta categoria</Text>
              <View style={s.fieldRow}>
                <View style={s.fieldIcon}><Text style={{ color: colors.primary, fontWeight: '700' }}>R$</Text></View>
                <TextInput
                  style={s.fieldInput}
                  value={catLimitValue}
                  onChangeText={v => setCatLimitValue(formatCurrency(v))}
                  placeholder="0,00"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
            </View>

            <TouchableOpacity style={s.saveBtn} onPress={saveCatLimit} disabled={savingCatLimit}>
              {savingCatLimit ? <ActivityIndicator color="#fff" /> : (
                <Text style={s.saveTxt}>Salvar limite</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 20 }} />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const makeStyles = (colors: any) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },

  // header
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },

  // profile card
  profileCard: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { position: 'relative' },
  avatarImg: { width: 68, height: 68, borderRadius: 34 },
  avatarFallback: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#fff', fontSize: 26, fontWeight: '800' },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  profileInfo: { flex: 1 },
  profileName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  profileUsername: { color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 1 },
  profileEmail: { color: colors.textTertiary, fontSize: 12, marginTop: 3 },
  profileEditHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  profileEditHintTxt: { color: colors.primary, fontSize: 12, fontWeight: '600' },

  // section / group / item
  section: { color: colors.textTertiary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  group: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: `${colors.primary}22`, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  itemHint: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },

  // logout
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  logoutTxt: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  foot: { color: colors.textTertiary, fontSize: 11, textAlign: 'center', marginTop: 24 },

  // modal base
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 22, paddingTop: 12, maxHeight: '92%' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  sheetClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },

  // financial tabs
  tabRow: { flexDirection: 'row', backgroundColor: colors.surfaceElevated, borderRadius: 14, padding: 4, marginBottom: 18, gap: 4 },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabTxt: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  tabTxtActive: { color: colors.text },

  // info box
  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: colors.surfaceElevated, borderRadius: 12, padding: 12, marginBottom: 16, alignItems: 'flex-start' },
  infoTxt: { color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 18 },

  // category limit list
  catLimitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceElevated, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  catDot: { width: 12, height: 12, borderRadius: 6 },
  catLimitName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  catLimitValue: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  catLimitEmpty: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },

  // empty state
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTxt: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  emptyHint: { color: colors.textTertiary, fontSize: 12 },

  // alerts
  alertCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: colors.surfaceElevated, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  alertLabel: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  alertHint: { color: colors.textTertiary, fontSize: 11, lineHeight: 16, marginBottom: 10 },
  pctRow: { gap: 6 },
  pctLabel: { color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
  pctBtns: { flexDirection: 'row', gap: 6 },
  pctBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pctBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pctBtnTxt: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  pctBtnTxtActive: { color: '#fff' },

  // avatar section (profile edit)
  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarLarge: { width: 96, height: 96, borderRadius: 48, marginBottom: 12 },
  avatarLargeFallback: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarLargeInitials: { color: '#fff', fontSize: 38, fontWeight: '800' },
  changePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.primary, backgroundColor: `${colors.primary}15` },
  changePhotoTxt: { color: colors.primary, fontSize: 13, fontWeight: '600' },

  // fields
  fieldGroup: { marginBottom: 14 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  readOnlyBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surfaceElevated, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  readOnlyTxt: { color: colors.textTertiary, fontSize: 10 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 52, borderWidth: 1, borderColor: colors.border },
  fieldRowDisabled: { opacity: 0.6 },
  fieldIcon: { width: 28, alignItems: 'center' },
  fieldInput: { flex: 1, color: colors.text, fontSize: 15 },

  // save / cancel
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 999, height: 54, marginTop: 16 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { borderRadius: 999, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderWidth: 1, borderColor: colors.border },
  cancelTxt: { color: colors.textSecondary, fontWeight: '600', fontSize: 15 },
});
