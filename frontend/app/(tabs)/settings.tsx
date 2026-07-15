import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  Switch, Modal, TextInput, KeyboardAvoidingView, Platform, Image,
  ActivityIndicator, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/AuthContext';
import { useTheme } from '../../src/ThemeContext';
import { api } from '../../src/api';
import {
  AI_TONE_OPTIONS, AiTone,
  getAiSettings, saveAiSettings,
} from '../../src/aiSettings';
import * as ImagePicker from 'expo-image-picker';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const SUPPORT_EMAIL = 'amaolisil20@gmail.com';

function openSupportEmail(subject: string) {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  Linking.openURL(url).catch(() => {
    Alert.alert('Não foi possível abrir o e-mail', `Envie sua mensagem para ${SUPPORT_EMAIL}.`);
  });
}

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
type FinancialTab = 'geral' | 'categorias';
type NotificationTab = 'lembretes' | 'alertas' | 'sons';
type AiTab = 'personalidade' | 'tom';

const NOTIF_PREFS_KEY = 'nocker_notification_prefs';
const SECURITY_PREFS_KEY = 'nocker_security_prefs';

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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

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
  const [categorySpending, setCategorySpending] = useState<Record<string, number>>({});

  // Notificações
  const [notificationsModal, setNotificationsModal] = useState(false);
  const [notificationTab, setNotificationTab] = useState<NotificationTab>('lembretes');
  const [billReminders, setBillReminders] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [alerts, setAlerts] = useState<SpendingAlert[]>([]);
  const [savingAlert, setSavingAlert] = useState<string | null>(null);

  // Exportar dados
  const [exporting, setExporting] = useState(false);

  // Segurança
  const [securityModal, setSecurityModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [faceIdEnabled, setFaceIdEnabled] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [savingPin, setSavingPin] = useState(false);

  // Ajuda e Suporte
  const [helpModal, setHelpModal] = useState(false);

  // IA / Assistente
  const [aiModal, setAiModal] = useState(false);
  const [aiTab, setAiTab] = useState<AiTab>('personalidade');
  const [aiPersonality, setAiPersonality] = useState('');
  const [aiTone, setAiTone] = useState<AiTone>('motivador');
  const [savingAiPersonality, setSavingAiPersonality] = useState(false);

  // ── Load profile modal ───────────────────────────────────────
  const openProfile = () => {
    setEditName(user?.name || '');
    setEditUsername(user?.username || '');
    setEditEmail(user?.email || '');
    setEditPhone(user?.phone || '');
    setEditBirth(isoToBirthDisplay(user?.birth_date));
    setPreviewAvatar(user?.avatar_url || null);
    setProfileModal(true);
  };

  const pickPhoto = async (useCamera: boolean) => {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert('Permissão necessária', 'Autorize o acesso para alterar sua foto de perfil.');
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });

    if (result.canceled || !result.assets[0]) return;

    setUploadingPhoto(true);
    setPreviewAvatar(result.assets[0].uri);
    try {
      const updated = await api.uploadAvatar(result.assets[0].uri);
      setUser(updated);
      setPreviewAvatar(updated.avatar_url || result.assets[0].uri);
      Alert.alert('Sucesso', 'Foto de perfil atualizada!');
    } catch (e: any) {
      setPreviewAvatar(user?.avatar_url || null);
      Alert.alert('Erro', e.message || 'Não foi possível enviar a foto.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const changePhoto = () => {
    Alert.alert('Alterar foto', 'Escolha uma opção', [
      { text: 'Galeria', onPress: () => pickPhoto(false) },
      { text: 'Câmera', onPress: () => pickPhoto(true) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const displayAvatar = previewAvatar || user?.avatar_url;

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
      const [settings, limits, cats, txs] = await Promise.all([
        api.getFinancialSettings(),
        api.listCategoryLimits(),
        api.listCategories(),
        api.listTransactions(),
      ]);
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const spending: Record<string, number> = {};
      for (const tx of txs) {
        if (tx.type !== 'expense') continue;
        if (new Date(tx.date) >= monthStart) {
          spending[tx.category] = (spending[tx.category] || 0) + tx.amount;
        }
      }
      setCategorySpending(spending);
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
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar configurações financeiras.');
    }
  };

  const loadAlertsData = async () => {
    try {
      const alertsData = await api.listSpendingAlerts();
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
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar alertas de gastos.');
    }
  };

  const loadNotificationPrefs = async () => {
    try {
      const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (typeof prefs.billReminders === 'boolean') setBillReminders(prefs.billReminders);
      if (typeof prefs.sound === 'boolean') setSoundEnabled(prefs.sound);
      if (typeof prefs.vibration === 'boolean') setVibrationEnabled(prefs.vibration);
    } catch { /* ignore */ }
  };

  const saveNotificationPrefs = async (prefs: { billReminders?: boolean; sound?: boolean; vibration?: boolean }) => {
    try {
      const raw = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
      const current = raw ? JSON.parse(raw) : {};
      await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
    } catch { /* ignore */ }
  };

  const openFinancial = () => {
    setFinancialTab('geral');
    setFinancialModal(true);
    loadFinancialData();
  };

  const openNotifications = () => {
    setNotificationTab('lembretes');
    setNotificationsModal(true);
    loadNotificationPrefs();
  };

  const loadAiSettings = async () => {
    const prefs = await getAiSettings();
    setAiPersonality(prefs.personality);
    setAiTone(prefs.tone);
  };

  const openAiAssistant = () => {
    setAiTab('personalidade');
    setAiModal(true);
    loadAiSettings();
  };

  const saveAiPersonality = async () => {
    setSavingAiPersonality(true);
    try {
      await saveAiSettings({ personality: aiPersonality.trim() });
      Alert.alert('Salvo!', 'Personalidade da IA atualizada.');
    } finally {
      setSavingAiPersonality(false);
    }
  };

  const selectAiTone = async (tone: AiTone) => {
    setAiTone(tone);
    await saveAiSettings({ tone });
  };

  const setNotificationTabAndLoad = (tab: NotificationTab) => {
    setNotificationTab(tab);
    if (tab === 'alertas') loadAlertsData();
  };

  const toggleBillReminders = async (value: boolean) => {
    setBillReminders(value);
    await saveNotificationPrefs({ billReminders: value });
  };

  const toggleSound = async (value: boolean) => {
    setSoundEnabled(value);
    await saveNotificationPrefs({ sound: value });
  };

  const toggleVibration = async (value: boolean) => {
    setVibrationEnabled(value);
    await saveNotificationPrefs({ vibration: value });
  };

  const loadSecurityPrefs = async () => {
    try {
      const raw = await AsyncStorage.getItem(SECURITY_PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (typeof prefs.pinEnabled === 'boolean') setPinEnabled(prefs.pinEnabled);
      if (typeof prefs.biometricsEnabled === 'boolean') setBiometricsEnabled(prefs.biometricsEnabled);
      if (typeof prefs.faceIdEnabled === 'boolean') setFaceIdEnabled(prefs.faceIdEnabled);
    } catch { /* ignore */ }
  };

  const saveSecurityPrefs = async (prefs: Record<string, boolean | string>) => {
    try {
      const raw = await AsyncStorage.getItem(SECURITY_PREFS_KEY);
      const current = raw ? JSON.parse(raw) : {};
      await AsyncStorage.setItem(SECURITY_PREFS_KEY, JSON.stringify({ ...current, ...prefs }));
    } catch { /* ignore */ }
  };

  const openSecurity = () => {
    setSecurityModal(true);
    loadSecurityPrefs();
  };

  const savePassword = async () => {
    if (!currentPassword || !newPassword) return Alert.alert('Atenção', 'Preencha todos os campos.');
    if (newPassword.length < 6) return Alert.alert('Atenção', 'A nova senha deve ter ao menos 6 caracteres.');
    if (newPassword !== confirmPassword) return Alert.alert('Atenção', 'As senhas não coincidem.');
    setSavingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Sucesso', 'Senha alterada com sucesso!');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível alterar a senha.');
    } finally {
      setSavingPassword(false);
    }
  };

  const savePin = async () => {
    if (pinValue.length < 4) return Alert.alert('Atenção', 'O PIN deve ter 4 dígitos.');
    if (pinValue !== pinConfirm) return Alert.alert('Atenção', 'Os PINs não coincidem.');
    setSavingPin(true);
    try {
      await saveSecurityPrefs({ pinEnabled: true, pin: pinValue });
      setPinEnabled(true);
      setPinModal(false);
      setPinValue('');
      setPinConfirm('');
      Alert.alert('Sucesso', 'PIN configurado com sucesso!');
    } finally {
      setSavingPin(false);
    }
  };

  const disablePin = () => {
    Alert.alert('Desativar PIN', 'Deseja remover o PIN do app?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desativar', style: 'destructive', onPress: async () => {
          await saveSecurityPrefs({ pinEnabled: false, pin: '' });
          setPinEnabled(false);
          setPinModal(false);
        },
      },
    ]);
  };

  const toggleBiometrics = async (value: boolean) => {
    setBiometricsEnabled(value);
    await saveSecurityPrefs({ biometricsEnabled: value });
  };

  const toggleFaceId = async (value: boolean) => {
    setFaceIdEnabled(value);
    await saveSecurityPrefs({ faceIdEnabled: value });
  };

  const confirmDeleteAccount = async () => {
    if (!deletePassword) return Alert.alert('Atenção', 'Informe sua senha para confirmar.');
    setDeletingAccount(true);
    try {
      await api.deleteAccount(deletePassword);
      setDeleteModal(false);
      setSecurityModal(false);
      setDeletePassword('');
      await logout();
      router.replace('/login');
      Alert.alert('Conta excluída', 'Sua conta foi removida permanentemente.');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível excluir a conta.');
    } finally {
      setDeletingAccount(false);
    }
  };

  // ── Exportar dados ──────────────────────────────────────────
  const handleExportData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const txs = await api.listTransactions();
      if (!txs || txs.length === 0) {
        Alert.alert('Nada para exportar', 'Você ainda não tem transações registradas.');
        return;
      }
      const escapeCsv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const header = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor'].map(escapeCsv).join(';');
      const rows = txs.map((tx: any) => [
        new Date(tx.date).toLocaleDateString('pt-BR'),
        tx.type === 'income' ? 'Receita' : 'Despesa',
        tx.category,
        tx.description,
        Number(tx.amount).toFixed(2).replace('.', ','),
      ].map(escapeCsv).join(';'));
      // BOM no início ajuda o Excel a abrir os acentos corretamente
      const csv = '﻿' + [header, ...rows].join('\n');

      const file = new File(Paths.cache, `nocker-transacoes-${Date.now()}.csv`);
      file.create({ overwrite: true });
      file.write(csv);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Exportar transações' });
      } else {
        Alert.alert('Exportado', `Arquivo salvo em: ${file.uri}`);
      }
    } catch (e: any) {
      Alert.alert('Erro ao exportar', e.message || 'Não foi possível exportar seus dados.');
    } finally {
      setExporting(false);
    }
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
      Alert.alert('Salvo!', `Limite de ${selectedCat.name} definido com sucesso.`);
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
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
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
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={s.avatarImg} />
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
          <Item
            icon="cash-outline"
            label="Financeiro"
            hint="Renda e limites de gastos"
            onPress={openFinancial}
          />
          <Item icon="shield-checkmark-outline" label={t.security} hint={t.securityHint} onPress={openSecurity} />
          <Item icon="notifications-outline" label={t.notifications} hint={t.notificationsHint} onPress={openNotifications} />
          <Item icon="sparkles-outline" label={t.aiAssistant} hint={t.aiAssistantHint} onPress={openAiAssistant} />
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
          <Item
            icon="cloud-upload-outline" label={t.export} hint={t.exportHint}
            onPress={handleExportData}
            right={exporting ? <ActivityIndicator size="small" color={colors.primary} /> : undefined}
          />
          <Item icon="link-outline" label={t.banking} hint={t.bankingHint}
            onPress={() => router.push({ pathname: '/(tabs)/cards', params: { open: 'bank' } })} />
          <Item icon="help-circle-outline"  label={t.help}    hint={t.helpHint}    onPress={() => setHelpModal(true)} />
        </View>

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
                {displayAvatar ? (
                  <Image source={{ uri: displayAvatar }} style={s.avatarLarge} />
                ) : (
                  <View style={s.avatarLargeFallback}>
                    <Text style={s.avatarLargeInitials}>{initials}</Text>
                  </View>
                )}
                {uploadingPhoto && (
                  <ActivityIndicator color={colors.primary} style={{ marginBottom: 12 }} />
                )}
                <TouchableOpacity
                  style={s.changePhotoBtn}
                  onPress={changePhoto}
                  disabled={uploadingPhoto}
                >
                  <Ionicons name="camera-outline" size={16} color={colors.primary} />
                  <Text style={s.changePhotoTxt}>{uploadingPhoto ? 'Enviando...' : 'Alterar foto'}</Text>
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

            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Financeiro</Text>
              <TouchableOpacity onPress={() => setFinancialModal(false)} style={s.sheetClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={s.tabRow}>
              {(['geral', 'categorias'] as FinancialTab[]).map(tab => (
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

            {financialTab === 'categorias' && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={s.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={s.infoTxt}>
                    Toque em cada categoria para definir quanto você pode gastar no mês. O app acompanha seus gastos e avisa quando se aproximar do limite.
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
                    const spent = categorySpending[cat.name] || 0;
                    const pct = limit && limit.monthly_limit > 0
                      ? Math.min(100, (spent / limit.monthly_limit) * 100)
                      : 0;
                    const overLimit = limit ? spent > limit.monthly_limit : false;
                    return (
                      <View key={cat.id} style={s.catLimitRow}>
                        <TouchableOpacity
                          style={s.catLimitMain}
                          onPress={() => openCatLimit(cat)}
                          activeOpacity={0.8}
                        >
                          <View style={[s.catDot, { backgroundColor: cat.color }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.catLimitName}>{cat.name}</Text>
                            {limit ? (
                              <>
                                <Text style={[s.catLimitValue, overLimit && { color: colors.expense || '#EF4444' }]}>
                                  Limite: R$ {limit.monthly_limit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês
                                </Text>
                                <Text style={s.catLimitSpent}>
                                  Gasto este mês: R$ {spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  {overLimit ? ' · acima do limite' : ''}
                                </Text>
                                <View style={s.catLimitBar}>
                                  <View style={[s.catLimitBarFill, {
                                    width: `${pct}%`,
                                    backgroundColor: overLimit ? (colors.expense || '#EF4444') : colors.primary,
                                  }]} />
                                </View>
                              </>
                            ) : (
                              <Text style={s.catLimitEmpty}>Toque para definir o limite mensal</Text>
                            )}
                          </View>
                          <Ionicons name="create-outline" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        {limit && (
                          <TouchableOpacity
                            onPress={() => removeCatLimit(limit)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={s.catLimitTrash}
                          >
                            <Ionicons name="trash-outline" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}

            {catLimitModal && selectedCat && (
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={s.catLimitOverlay}
              >
                <TouchableOpacity style={s.catLimitBackdrop} activeOpacity={1} onPress={() => setCatLimitModal(false)} />
                <View style={s.catLimitSheet}>
                  <View style={s.sheetHandle} />
                  <View style={s.sheetHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.sheetTitle}>Limite — {selectedCat.name}</Text>
                      <Text style={s.catLimitSheetSub}>Quanto você pode gastar nesta categoria por mês</Text>
                    </View>
                    <TouchableOpacity onPress={() => setCatLimitModal(false)} style={s.sheetClose}>
                      <Ionicons name="close" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  <View style={s.fieldGroup}>
                    <Text style={s.fieldLabel}>Limite máximo mensal</Text>
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
                      <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={s.saveTxt}>Salvar limite</Text></>
                    )}
                  </TouchableOpacity>
                  <View style={{ height: 16 }} />
                </View>
              </KeyboardAvoidingView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ Notifications Modal ════════════════════════════════════ */}
      <Modal visible={notificationsModal} transparent animationType="slide" onRequestClose={() => setNotificationsModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setNotificationsModal(false)} />
          <View style={[s.sheet, { maxHeight: '92%' }]}>
            <View style={s.sheetHandle} />

            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{t.notifications}</Text>
              <TouchableOpacity onPress={() => setNotificationsModal(false)} style={s.sheetClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={s.tabRow}>
              {([
                { key: 'lembretes' as NotificationTab, label: 'Lembretes' },
                { key: 'alertas' as NotificationTab, label: 'Alertas' },
                { key: 'sons' as NotificationTab, label: 'Sons' },
              ]).map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[s.tabBtn, notificationTab === tab.key && s.tabBtnActive]}
                  onPress={() => setNotificationTabAndLoad(tab.key)}
                >
                  <Text style={[s.tabTxt, notificationTab === tab.key && s.tabTxtActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {notificationTab === 'lembretes' && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={s.infoTxt}>
                    Receba lembretes antes do vencimento dos seus gastos fixos e contas recorrentes.
                  </Text>
                </View>
                <View style={s.alertCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertLabel}>Lembretes de contas</Text>
                    <Text style={s.alertHint}>
                      Aviso alguns dias antes do vencimento de gastos fixos cadastrados no app.
                    </Text>
                  </View>
                  <Switch
                    value={billReminders}
                    onValueChange={toggleBillReminders}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            )}

            {notificationTab === 'alertas' && (
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

            {notificationTab === 'sons' && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={s.infoTxt}>
                    Personalize como o app chama sua atenção ao exibir notificações.
                  </Text>
                </View>
                <View style={s.alertCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertLabel}>Som</Text>
                    <Text style={s.alertHint}>Reproduzir som ao receber notificações.</Text>
                  </View>
                  <Switch
                    value={soundEnabled}
                    onValueChange={toggleSound}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={s.alertCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.alertLabel}>Vibração</Text>
                    <Text style={s.alertHint}>Vibrar o dispositivo ao receber notificações.</Text>
                  </View>
                  <Switch
                    value={vibrationEnabled}
                    onValueChange={toggleVibration}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ AI Assistant Modal ═════════════════════════════════════ */}
      <Modal visible={aiModal} transparent animationType="slide" onRequestClose={() => setAiModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setAiModal(false)} />
          <View style={[s.sheet, { maxHeight: '92%' }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{t.aiAssistant}</Text>
              <TouchableOpacity onPress={() => setAiModal(false)} style={s.sheetClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Tabs: apenas Personalidade e Tom */}
            <View style={s.tabRow}>
              {([
                { key: 'personalidade' as AiTab, label: 'Personalidade' },
                { key: 'tom' as AiTab, label: 'Tom' },
              ]).map(tab => (
                <TouchableOpacity
                  key={tab.key}
                  style={[s.tabBtn, aiTab === tab.key && s.tabBtnActive]}
                  onPress={() => setAiTab(tab.key)}
                >
                  <Text style={[s.tabTxt, aiTab === tab.key && s.tabTxtActive]}>{tab.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {aiTab === 'personalidade' && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={s.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={s.infoTxt}>
                    Configure como a Nocker IA deve se comportar nas conversas. Descreva traços, estilo ou preferências.
                  </Text>
                </View>
                <View style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>Personalidade da IA</Text>
                  <View style={[s.fieldRow, { height: 120, alignItems: 'flex-start', paddingVertical: 12 }]}>
                    <TextInput
                      style={[s.fieldInput, { height: 96, textAlignVertical: 'top' }]}
                      value={aiPersonality}
                      onChangeText={setAiPersonality}
                      placeholder="Ex: Seja objetiva, use analogias simples e chame o usuário pelo nome."
                      placeholderTextColor={colors.textTertiary}
                      multiline
                    />
                  </View>
                </View>
                <TouchableOpacity style={s.saveBtn} onPress={saveAiPersonality} disabled={savingAiPersonality}>
                  {savingAiPersonality ? <ActivityIndicator color="#fff" /> : (
                    <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={s.saveTxt}>Salvar personalidade</Text></>
                  )}
                </TouchableOpacity>
                <View style={{ height: 20 }} />
              </ScrollView>
            )}

            {aiTab === 'tom' && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.infoBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
                  <Text style={s.infoTxt}>Escolha o tom das mensagens da IA no chat financeiro.</Text>
                </View>
                {AI_TONE_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.key}
                    style={[s.toneCard, aiTone === option.key && s.toneCardActive]}
                    onPress={() => selectAiTone(option.key)}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.alertLabel, aiTone === option.key && { color: colors.primary }]}>{option.label}</Text>
                      <Text style={s.alertHint}>{option.hint}</Text>
                    </View>
                    {aiTone === option.key && (
                      <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ Help Modal ═════════════════════════════════════════════ */}
      <Modal visible={helpModal} transparent animationType="slide" onRequestClose={() => setHelpModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setHelpModal(false)} />
          <View style={[s.sheet, { maxHeight: '92%' }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Ajuda e Suporte</Text>
              <TouchableOpacity onPress={() => setHelpModal(false)} style={s.sheetClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Central de ajuda */}
              <View style={s.helpGroup}>
                <TouchableOpacity style={s.helpRow} onPress={() => openSupportEmail('Ajuda com o Nocker')} activeOpacity={0.8}>
                  <View style={s.helpRowIcon}>
                    <Ionicons name="help-buoy-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.helpRowLabel}>Central de ajuda</Text>
                    <Text style={s.helpRowHint}>Dúvidas frequentes e tutoriais</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>

                {/* Reportar bug */}
                <TouchableOpacity style={s.helpRow} onPress={() => openSupportEmail('Relatório de bug — Nocker')} activeOpacity={0.8}>
                  <View style={s.helpRowIcon}>
                    <Ionicons name="bug-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.helpRowLabel}>Reportar bug</Text>
                    <Text style={s.helpRowHint}>Encontrou um problema? Nos avise</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>

                {/* Sugerir funcionalidade */}
                <TouchableOpacity style={s.helpRow} onPress={() => openSupportEmail('Sugestão de funcionalidade — Nocker')} activeOpacity={0.8}>
                  <View style={s.helpRowIcon}>
                    <Ionicons name="bulb-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.helpRowLabel}>Sugerir funcionalidade</Text>
                    <Text style={s.helpRowHint}>Tem uma ideia? Adoramos ouvir</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>

                {/* Avaliar app */}
                <TouchableOpacity style={[s.helpRow, { borderBottomWidth: 0 }]} onPress={() => Alert.alert('Avaliar app', 'Em breve disponível.')} activeOpacity={0.8}>
                  <View style={s.helpRowIcon}>
                    <Ionicons name="star-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.helpRowLabel}>Avaliar app</Text>
                    <Text style={s.helpRowHint}>Deixe sua avaliação na loja</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>

              {/* Legal */}
              <View style={[s.helpGroup, { marginTop: 12 }]}>
                <TouchableOpacity style={s.helpRow} onPress={() => { setHelpModal(false); router.push('/terms'); }} activeOpacity={0.8}>
                  <View style={s.helpRowIcon}>
                    <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.helpRowLabel}>Termos de uso</Text>
                    <Text style={s.helpRowHint}>Condições de utilização do app</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>

                <TouchableOpacity style={[s.helpRow, { borderBottomWidth: 0 }]} onPress={() => { setHelpModal(false); router.push('/privacy'); }} activeOpacity={0.8}>
                  <View style={s.helpRowIcon}>
                    <Ionicons name="shield-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.helpRowLabel}>Política de privacidade</Text>
                    <Text style={s.helpRowHint}>Como tratamos seus dados</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ═══ Security Modal ═════════════════════════════════════════ */}
      <Modal visible={securityModal} transparent animationType="slide" onRequestClose={() => setSecurityModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setSecurityModal(false)} />
          <View style={[s.sheet, { maxHeight: '92%' }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>{t.security}</Text>
              <TouchableOpacity onPress={() => setSecurityModal(false)} style={s.sheetClose}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={s.securityGroup}>
                <TouchableOpacity style={s.securityRow} onPress={() => setPasswordModal(true)} activeOpacity={0.8}>
                  <View style={s.securityRowIcon}><Ionicons name="key-outline" size={18} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.securityRowLabel}>Alterar senha</Text>
                    <Text style={s.securityRowHint}>Atualize a senha da sua conta</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>

                <TouchableOpacity style={s.securityRow} onPress={() => setPinModal(true)} activeOpacity={0.8}>
                  <View style={s.securityRowIcon}><Ionicons name="keypad-outline" size={18} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.securityRowLabel}>PIN do app</Text>
                    <Text style={s.securityRowHint}>{pinEnabled ? 'PIN ativo — toque para alterar' : 'Proteja o app com um PIN de 4 dígitos'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </TouchableOpacity>

                <View style={s.securityRow}>
                  <View style={s.securityRowIcon}><Ionicons name="finger-print-outline" size={18} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.securityRowLabel}>Biometria</Text>
                    <Text style={s.securityRowHint}>Use impressão digital para desbloquear</Text>
                  </View>
                  <Switch
                    value={biometricsEnabled}
                    onValueChange={toggleBiometrics}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>

                <View style={[s.securityRow, { borderBottomWidth: 0 }]}>
                  <View style={s.securityRowIcon}><Ionicons name="scan-outline" size={18} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.securityRowLabel}>Face ID</Text>
                    <Text style={s.securityRowHint}>Use reconhecimento facial para desbloquear</Text>
                  </View>
                  <Switch
                    value={faceIdEnabled}
                    onValueChange={toggleFaceId}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                </View>
              </View>

              <TouchableOpacity style={s.logout} onPress={doLogout}>
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                <Text style={s.logoutTxt}>Sair da conta</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.deleteAccountBtn} onPress={() => setDeleteModal(true)}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" />
                <Text style={s.deleteAccountTxt}>Excluir conta</Text>
              </TouchableOpacity>
              <View style={{ height: 24 }} />
            </ScrollView>

            {passwordModal && (
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.catLimitOverlay}>
                <TouchableOpacity style={s.catLimitBackdrop} activeOpacity={1} onPress={() => setPasswordModal(false)} />
                <View style={s.catLimitSheet}>
                  <View style={s.sheetHandle} />
                  <View style={s.sheetHeader}>
                    <Text style={s.sheetTitle}>Alterar senha</Text>
                    <TouchableOpacity onPress={() => setPasswordModal(false)} style={s.sheetClose}>
                      <Ionicons name="close" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={s.fieldGroup}>
                    <Text style={s.fieldLabel}>Senha atual</Text>
                    <View style={s.fieldRow}>
                      <View style={s.fieldIcon}><Ionicons name="lock-closed-outline" size={16} color={colors.primary} /></View>
                      <TextInput style={s.fieldInput} value={currentPassword} onChangeText={setCurrentPassword} placeholder="Senha atual" placeholderTextColor={colors.textTertiary} secureTextEntry autoCapitalize="none" />
                    </View>
                  </View>
                  <View style={s.fieldGroup}>
                    <Text style={s.fieldLabel}>Nova senha</Text>
                    <View style={s.fieldRow}>
                      <View style={s.fieldIcon}><Ionicons name="lock-closed-outline" size={16} color={colors.primary} /></View>
                      <TextInput style={s.fieldInput} value={newPassword} onChangeText={setNewPassword} placeholder="Mínimo 6 caracteres" placeholderTextColor={colors.textTertiary} secureTextEntry autoCapitalize="none" />
                    </View>
                  </View>
                  <View style={s.fieldGroup}>
                    <Text style={s.fieldLabel}>Confirmar nova senha</Text>
                    <View style={s.fieldRow}>
                      <View style={s.fieldIcon}><Ionicons name="lock-closed-outline" size={16} color={colors.primary} /></View>
                      <TextInput style={s.fieldInput} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repita a nova senha" placeholderTextColor={colors.textTertiary} secureTextEntry autoCapitalize="none" />
                    </View>
                  </View>
                  <TouchableOpacity style={s.saveBtn} onPress={savePassword} disabled={savingPassword}>
                    {savingPassword ? <ActivityIndicator color="#fff" /> : (
                      <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={s.saveTxt}>Salvar nova senha</Text></>
                    )}
                  </TouchableOpacity>
                  <View style={{ height: 16 }} />
                </View>
              </KeyboardAvoidingView>
            )}

            {pinModal && (
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.catLimitOverlay}>
                <TouchableOpacity style={s.catLimitBackdrop} activeOpacity={1} onPress={() => setPinModal(false)} />
                <View style={s.catLimitSheet}>
                  <View style={s.sheetHandle} />
                  <View style={s.sheetHeader}>
                    <Text style={s.sheetTitle}>PIN do app</Text>
                    <TouchableOpacity onPress={() => setPinModal(false)} style={s.sheetClose}>
                      <Ionicons name="close" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={s.fieldGroup}>
                    <Text style={s.fieldLabel}>Novo PIN (4 dígitos)</Text>
                    <View style={s.fieldRow}>
                      <View style={s.fieldIcon}><Ionicons name="keypad-outline" size={16} color={colors.primary} /></View>
                      <TextInput style={s.fieldInput} value={pinValue} onChangeText={v => setPinValue(v.replace(/\D/g, '').slice(0, 4))} placeholder="••••" placeholderTextColor={colors.textTertiary} secureTextEntry keyboardType="number-pad" maxLength={4} />
                    </View>
                  </View>
                  <View style={s.fieldGroup}>
                    <Text style={s.fieldLabel}>Confirmar PIN</Text>
                    <View style={s.fieldRow}>
                      <View style={s.fieldIcon}><Ionicons name="keypad-outline" size={16} color={colors.primary} /></View>
                      <TextInput style={s.fieldInput} value={pinConfirm} onChangeText={v => setPinConfirm(v.replace(/\D/g, '').slice(0, 4))} placeholder="••••" placeholderTextColor={colors.textTertiary} secureTextEntry keyboardType="number-pad" maxLength={4} />
                    </View>
                  </View>
                  <TouchableOpacity style={s.saveBtn} onPress={savePin} disabled={savingPin}>
                    {savingPin ? <ActivityIndicator color="#fff" /> : (
                      <><Ionicons name="checkmark" size={18} color="#fff" /><Text style={s.saveTxt}>{pinEnabled ? 'Atualizar PIN' : 'Ativar PIN'}</Text></>
                    )}
                  </TouchableOpacity>
                  {pinEnabled && (
                    <TouchableOpacity style={s.cancelBtn} onPress={disablePin}>
                      <Text style={[s.cancelTxt, { color: '#EF4444' }]}>Desativar PIN</Text>
                    </TouchableOpacity>
                  )}
                  <View style={{ height: 16 }} />
                </View>
              </KeyboardAvoidingView>
            )}

            {deleteModal && (
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.catLimitOverlay}>
                <TouchableOpacity style={s.catLimitBackdrop} activeOpacity={1} onPress={() => setDeleteModal(false)} />
                <View style={s.catLimitSheet}>
                  <View style={s.sheetHandle} />
                  <View style={s.sheetHeader}>
                    <Text style={s.sheetTitle}>Excluir conta</Text>
                    <TouchableOpacity onPress={() => setDeleteModal(false)} style={s.sheetClose}>
                      <Ionicons name="close" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <View style={s.infoBox}>
                    <Ionicons name="warning-outline" size={16} color="#EF4444" />
                    <Text style={s.infoTxt}>
                      Esta ação é permanente. Todos os seus dados serão apagados e não poderão ser recuperados.
                    </Text>
                  </View>
                  <View style={s.fieldGroup}>
                    <Text style={s.fieldLabel}>Confirme sua senha</Text>
                    <View style={s.fieldRow}>
                      <View style={s.fieldIcon}><Ionicons name="lock-closed-outline" size={16} color={colors.primary} /></View>
                      <TextInput style={s.fieldInput} value={deletePassword} onChangeText={setDeletePassword} placeholder="Sua senha" placeholderTextColor={colors.textTertiary} secureTextEntry autoCapitalize="none" />
                    </View>
                  </View>
                  <TouchableOpacity style={s.deleteAccountBtn} onPress={confirmDeleteAccount} disabled={deletingAccount}>
                    {deletingAccount ? <ActivityIndicator color="#EF4444" /> : (
                      <><Ionicons name="trash-outline" size={18} color="#EF4444" /><Text style={s.deleteAccountTxt}>Excluir permanentemente</Text></>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => setDeleteModal(false)}>
                    <Text style={s.cancelTxt}>Cancelar</Text>
                  </TouchableOpacity>
                  <View style={{ height: 16 }} />
                </View>
              </KeyboardAvoidingView>
            )}
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

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },

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

  section: { color: colors.textTertiary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  group: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: `${colors.primary}22`, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  itemHint: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },

  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  logoutTxt: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  deleteAccountBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, backgroundColor: 'rgba(239,68,68,0.06)', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  deleteAccountTxt: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  foot: { color: colors.textTertiary, fontSize: 11, textAlign: 'center', marginTop: 24 },

  securityGroup: { backgroundColor: colors.surfaceElevated, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 8 },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  securityRowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: `${colors.primary}22`, alignItems: 'center', justifyContent: 'center' },
  securityRowLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  securityRowHint: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },

  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 22, paddingTop: 12, maxHeight: '92%', overflow: 'hidden' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  sheetClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },

  tabRow: { flexDirection: 'row', backgroundColor: colors.surfaceElevated, borderRadius: 14, padding: 4, marginBottom: 18, gap: 4 },
  tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tabTxt: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  tabTxtActive: { color: colors.text },

  infoBox: { flexDirection: 'row', gap: 8, backgroundColor: colors.surfaceElevated, borderRadius: 12, padding: 12, marginBottom: 16, alignItems: 'flex-start' },
  infoTxt: { color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 18 },

  catLimitRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceElevated, borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  catLimitMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  catLimitTrash: { paddingHorizontal: 14, paddingVertical: 14, borderLeftWidth: 1, borderLeftColor: colors.border },
  catDot: { width: 12, height: 12, borderRadius: 6 },
  catLimitName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  catLimitValue: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  catLimitSpent: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  catLimitBar: { height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 8, overflow: 'hidden' },
  catLimitBarFill: { height: 4, borderRadius: 2 },
  catLimitEmpty: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
  catLimitOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 20 },
  catLimitBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  catLimitSheet: { backgroundColor: colors.surfaceElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1, borderColor: colors.border },
  catLimitSheetSub: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },

  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTxt: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  emptyHint: { color: colors.textTertiary, fontSize: 12 },

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

  toneCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceElevated, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  toneCardActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}12` },

  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarLarge: { width: 96, height: 96, borderRadius: 48, marginBottom: 12 },
  avatarLargeFallback: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarLargeInitials: { color: '#fff', fontSize: 38, fontWeight: '800' },
  changePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.primary, backgroundColor: `${colors.primary}15` },
  changePhotoTxt: { color: colors.primary, fontSize: 13, fontWeight: '600' },

  fieldGroup: { marginBottom: 14 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  fieldLabel: { color: colors.textSecondary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  readOnlyBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surfaceElevated, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  readOnlyTxt: { color: colors.textTertiary, fontSize: 10 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingHorizontal: 14, height: 52, borderWidth: 1, borderColor: colors.border },
  fieldRowDisabled: { opacity: 0.6 },
  fieldIcon: { width: 28, alignItems: 'center' },
  fieldInput: { flex: 1, color: colors.text, fontSize: 15 },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: 999, height: 54, marginTop: 16 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelBtn: { borderRadius: 999, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderWidth: 1, borderColor: colors.border },
  cancelTxt: { color: colors.textSecondary, fontWeight: '600', fontSize: 15 },

  // help modal
  helpGroup: { backgroundColor: colors.surfaceElevated, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  helpRowIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: `${colors.primary}22`, alignItems: 'center', justifyContent: 'center' },
  helpRowLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
  helpRowHint: { color: colors.textTertiary, fontSize: 11, marginTop: 2 },
});