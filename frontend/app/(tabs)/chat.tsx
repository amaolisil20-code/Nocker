import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ActionSheetIOS, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../../src/api';
import { staleWhileRevalidate } from '../../src/cache';
import { getAiSettings } from '../../src/aiSettings';
import { useTheme } from '../../src/ThemeContext';
import { fmtBRL } from '../../src/theme';
import DocumentScanConfirmModal, { DocumentParseResult } from '../../src/components/DocumentScanConfirmModal';
import { emptyScanResult, scanDocumentFromUri } from '../../src/ocr/scanDocument';

type Msg = { role: 'user' | 'assistant'; content: string; pending?: boolean };

type ScannedDoc = {
  id: string;
  establishment: string;
  amount: number;
  category: string;
  transaction_date: string;
  created_at: string;
};

const SUGGESTIONS = [
  '💡 Como economizar este mês?',
  '📊 Analise meus gastos',
  '🎯 Crie um plano de poupança',
  '💰 Onde estou gastando mais?',
];

function formatScanDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

export default function Chat() {
  const insets = useSafeAreaInsets();
  const { colors, t, themeMode } = useTheme();
  const s = makeStyles(colors, themeMode);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanConfirm, setScanConfirm] = useState<DocumentParseResult | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [savingScan, setSavingScan] = useState(false);
  const [scannedDocs, setScannedDocs] = useState<ScannedDoc[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  const aiSettingsRef = useRef<Awaited<ReturnType<typeof getAiSettings>> | null>(null);

  useEffect(() => {
    getAiSettings().then(st => { aiSettingsRef.current = st; });
  }, []);

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: 'Olá! Eu sou a Nocker IA 🤖✨\n\nEstou aqui para te ajudar a entender seus gastos, criar planos, economizar e atingir suas metas. Como posso ajudar hoje?\n\n📷 Use o ícone da câmera para escanear notas e cupons.',
    }]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      staleWhileRevalidate(
        'scanned_documents',
        () => api.listScannedDocuments(),
        (list) => setScannedDocs(Array.isArray(list) ? list : []),
      ).catch(() => {});
    }, []),
  );

  const send = async (msg?: string) => {
    const content = (msg ?? text).trim();
    if (!content || sending) return;
    setText('');
    setMessages(m => [...m, { role: 'user', content }, { role: 'assistant', content: '', pending: true }]);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const ai = aiSettingsRef.current || await getAiSettings();
      aiSettingsRef.current = ai;
      if (!ai.financialChatEnabled) {
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: 'assistant',
            content: 'O chat financeiro está desativado. Ative em Configurações → IA / Assistente → Chat.',
          };
          return copy;
        });
        return;
      }
      const r = await api.chat(content, sessionId, {
        tone: ai.tone,
        personality: ai.personality || undefined,
      });
      setSessionId(r.session_id);
      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: r.reply };
        return copy;
      });
    } catch {
      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: '⚠️ Não consegui responder agora. Tente novamente em instantes.' };
        return copy;
      });
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const openScanConfirm = (parsed: DocumentParseResult) => {
    setScanConfirm(parsed);
    setConfirmVisible(true);
  };

  const appendScanToChat = (parsed: DocumentParseResult) => {
    const est = parsed.establishment?.trim();
    const amount = parsed.amount;
    const hasCore = Boolean(est) && amount != null && amount > 0;
    if (hasCore) {
      setMessages(m => [
        ...m,
        { role: 'user', content: `📷 Nota fiscal: ${est}` },
        {
          role: 'assistant',
          content: `Li sua nota!\n\n🏪 ${est}\n💰 ${fmtBRL(amount!)}\n📂 ${parsed.category}\n📅 ${formatScanDate(parsed.transaction_date || '')}\n\nConfira os dados e toque em Confirmar para salvar a despesa.`,
        },
      ]);
    } else {
      setMessages(m => [
        ...m,
        { role: 'user', content: '📷 Enviei uma foto de nota fiscal' },
        {
          role: 'assistant',
          content: 'Não consegui ler todos os dados automaticamente. Preencha o que faltar na janela de confirmação — o texto detectado está em "Texto OCR completo".',
        },
      ]);
    }
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
  };

  const processImageUri = async (uri: string) => {
    setScanning(true);
    try {
      const parsed = await scanDocumentFromUri(uri);
      appendScanToChat(parsed);
      openScanConfirm(parsed);
      const est = parsed.establishment?.trim();
      const amt = parsed.amount;
      if (est && amt != null && amt > 0) {
        const insight = `Acabei de escanear uma nota de ${est} no valor de ${fmtBRL(amt)} (categoria ${parsed.category}). Me dê um insight rápido sobre esse gasto.`;
        setTimeout(() => { send(insight); }, 600);
      }
    } catch (e: any) {
      const msg = String(e?.message || 'Falha ao processar o documento.');
      if (msg.toLowerCase().includes('login')) {
        Alert.alert('Login necessário', msg);
        return;
      }
      if (msg.toLowerCase().includes('sem conexão') || msg.toLowerCase().includes('internet')) {
        Alert.alert('Sem conexão', msg);
        return;
      }
      Alert.alert('Erro ao analisar nota', msg);
      openScanConfirm(emptyScanResult(msg));
    } finally {
      setScanning(false);
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão necessária', 'Permita o acesso à câmera para escanear documentos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
      exif: false,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await processImageUri(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão necessária', 'Permita o acesso à galeria para enviar documentos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
      exif: false,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await processImageUri(result.assets[0].uri);
    }
  };

  const openScanOptions = () => {
    if (scanning) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Tirar foto', 'Escolher da galeria', 'Cancelar'],
          cancelButtonIndex: 2,
        },
        (idx) => {
          if (idx === 0) pickFromCamera();
          if (idx === 1) pickFromGallery();
        },
      );
    } else {
      Alert.alert('Escanear documento', 'Como deseja enviar?', [
        { text: 'Tirar foto', onPress: pickFromCamera },
        { text: 'Galeria', onPress: pickFromGallery },
        { text: 'Cancelar', style: 'cancel' },
      ]);
    }
  };

  const handleConfirmScan = async (payload: {
    establishment: string;
    amount: number;
    category: string;
    transaction_date: string;
    ocr_text: string;
  }) => {
    setSavingScan(true);
    try {
      await api.confirmScannedDocument({ ...payload, type: 'expense' });
      await api.refreshTransactionsCache();
      const list = await api.listScannedDocuments();
      setScannedDocs(Array.isArray(list) ? list : []);
      setConfirmVisible(false);
      setScanConfirm(null);
      setMessages(m => [
        ...m,
        { role: 'user', content: `📷 Documento: ${payload.establishment}` },
        {
          role: 'assistant',
          content: `✅ Transação registrada!\n\n• ${payload.establishment}\n• ${fmtBRL(payload.amount)}\n• ${payload.category}\n• ${formatScanDate(payload.transaction_date)}`,
        },
      ]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert('Erro ao salvar', String(e?.message || 'Não foi possível salvar a transação.'));
    } finally {
      setSavingScan(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      style={s.c}
    >
      <LinearGradient colors={themeMode === 'dark' ? ['#0F1F14', '#0A0A0A'] : ['#E8F5E9', '#F5F5F5']} style={[StyleSheet.absoluteFill, { height: 200 }]} />
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.aiAvatar}>
          <Ionicons name="sparkles" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{t.nockerIA}</Text>
          <View style={s.statusRow}>
            <View style={s.statusDot} />
            <Text style={s.statusTxt}>Online</Text>
          </View>
        </View>
        <TouchableOpacity
          testID="scan-document-btn"
          style={s.scanHeaderBtn}
          onPress={openScanOptions}
          disabled={scanning}
        >
          {scanning ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Ionicons name="camera" size={22} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m, i) => (
          <View key={i} style={[s.bubbleRow, m.role === 'user' && { justifyContent: 'flex-end' }]}>
            {m.role === 'assistant' && (
              <View style={s.smallAi}>
                <Ionicons name="sparkles" size={12} color="#fff" />
              </View>
            )}
            <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAi]}>
              {m.pending ? (
                <View style={s.typingRow}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={s.typingTxt}>Nocker está pensando...</Text>
                </View>
              ) : (
                <Text style={[s.bubbleTxt, m.role === 'user' ? { color: '#fff' } : { color: colors.text }]}>{m.content}</Text>
              )}
            </View>
          </View>
        ))}

        {messages.length === 1 && (
          <View style={s.suggestionsWrap}>
            <Text style={s.suggestionsHint}>Sugestões rápidas:</Text>
            <View style={s.suggestionsGrid}>
              {SUGGESTIONS.map(sg => (
                <TouchableOpacity key={sg} style={s.suggestionChip} onPress={() => send(sg.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u, ''))}>
                  <Text style={[s.suggestionTxt, { color: colors.text }]}>{sg}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {scannedDocs.length > 0 && (
          <View style={s.historyWrap}>
            <Text style={s.historyTitle}>Documentos escaneados</Text>
            {scannedDocs.slice(0, 20).map(doc => (
              <View key={doc.id} style={[s.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.historyMerchant, { color: colors.text }]} numberOfLines={1}>{doc.establishment}</Text>
                  <Text style={[s.historyMeta, { color: colors.textSecondary }]}>
                    {formatScanDate(doc.transaction_date || doc.created_at)} • {doc.category}
                  </Text>
                </View>
                <Text style={[s.historyAmount, { color: colors.primary }]}>{fmtBRL(doc.amount)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom + 90, 100) }]}>
        <View style={s.inputWrap}>
          <TouchableOpacity testID="scan-input-btn" style={s.cameraBtn} onPress={openScanOptions} disabled={scanning}>
            {scanning ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Ionicons name="camera-outline" size={22} color={colors.primary} />
            )}
          </TouchableOpacity>
          <TextInput
            testID="chat-input"
            value={text} onChangeText={setText}
            placeholder="Pergunte algo financeiro..."
            placeholderTextColor={colors.textTertiary}
            style={s.input}
            multiline
            onSubmitEditing={() => send()}
          />
          <TouchableOpacity testID="chat-send" style={[s.sendBtn, !text.trim() && { opacity: 0.5 }]} onPress={() => send()} disabled={!text.trim() || sending}>
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={scanning} transparent animationType="fade">
        <View style={s.scanOverlay}>
          <View style={[s.scanCard, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[s.scanTitle, { color: colors.text }]}>Analisando nota fiscal</Text>
            <Text style={[s.scanHint, { color: colors.textSecondary }]}>
              Lendo estabelecimento, valor e data da nota. Na primeira vez pode levar até 1 minuto — aguarde.
            </Text>
          </View>
        </View>
      </Modal>

      <DocumentScanConfirmModal
        visible={confirmVisible}
        data={scanConfirm}
        saving={savingScan}
        onConfirm={handleConfirmScan}
        onCancel={() => { setConfirmVisible(false); setScanConfirm(null); }}
      />
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: any, themeMode: string) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border },
  aiAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.6, shadowRadius: 14 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  statusTxt: { color: colors.textSecondary, fontSize: 11 },
  scanHeaderBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: themeMode === 'dark' ? 'rgba(22,163,74,0.12)' : 'rgba(22,163,74,0.1)',
  },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 12 },
  smallAi: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18 },
  bubbleUser: { backgroundColor: colors.primary, borderTopRightRadius: 4 },
  bubbleAi: { backgroundColor: colors.surface, borderTopLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleTxt: { fontSize: 14, lineHeight: 21 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingTxt: { color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' },
  suggestionsWrap: { marginTop: 8 },
  suggestionsHint: { color: colors.textTertiary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  suggestionsGrid: { gap: 8 },
  suggestionChip: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
  suggestionTxt: { fontSize: 13 },
  historyWrap: { marginTop: 24 },
  historyTitle: { color: colors.textTertiary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  historyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8,
  },
  historyMerchant: { fontSize: 14, fontWeight: '600' },
  historyMeta: { fontSize: 12, marginTop: 2 },
  historyAmount: { fontSize: 14, fontWeight: '700' },
  inputBar: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, backgroundColor: colors.surface, borderRadius: 26,
    paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
  cameraBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  input: { flex: 1, color: colors.text, fontSize: 14, maxHeight: 100, paddingVertical: 10, paddingHorizontal: 4 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  scanOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  scanCard: {
    width: '100%', maxWidth: 320, borderRadius: 20, padding: 28, alignItems: 'center', gap: 12,
  },
  scanTitle: { fontSize: 17, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  scanHint: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
