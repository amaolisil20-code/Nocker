import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, ScrollView,
  StyleSheet, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { SCAN_CATEGORIES } from '../ocr/categories';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../ThemeContext';
import { fmtBRL } from '../theme';

export type DocumentParseResult = {
  establishment: string;
  amount: number | null;
  category: string;
  transaction_date: string | null;
  ocr_text: string;
  warnings: string[];
  errors: string[];
  ok: boolean;
};

type Props = {
  visible: boolean;
  data: DocumentParseResult | null;
  saving: boolean;
  onConfirm: (payload: {
    establishment: string;
    amount: number;
    category: string;
    transaction_date: string;
    ocr_text: string;
  }) => void;
  onCancel: () => void;
};

function parseDate(iso?: string | null): Date {
  if (!iso) return new Date();
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatDateBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toLocalDateIso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T12:00:00.000Z`;
}

export default function DocumentScanConfirmModal({ visible, data, saving, onConfirm, onCancel }: Props) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [establishment, setEstablishment] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState('Compras');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showOcr, setShowOcr] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEstablishment(data.establishment || '');
    setAmountStr(data.amount != null ? String(data.amount).replace('.', ',') : '');
    setCategory(data.category || 'Compras');
    setDate(parseDate(data.transaction_date));
    const missingCore = !data.establishment?.trim() || data.amount == null || (data.amount != null && data.amount <= 0);
    setEditing(missingCore);
    setShowOcr(missingCore && Boolean(data.ocr_text?.trim()));
  }, [data, visible]);

  if (!data) return null;

  const s = makeStyles(colors);
  const hasCoreData = Boolean(data.establishment?.trim()) && data.amount != null && data.amount > 0;
  const alerts = [...(data.errors || []), ...(data.warnings || [])].filter(msg => {
    if (!hasCoreData) return true;
    const low = msg.toLowerCase();
    return !low.includes('manualmente') && !low.includes('indisponível') && !low.includes('pouco texto');
  });

  const handleConfirm = () => {
    const normalized = amountStr.replace(/\./g, '').replace(',', '.');
    const amount = parseFloat(normalized);
    if (!establishment.trim()) {
      Alert.alert('Campo obrigatório', 'Informe o estabelecimento.');
      return;
    }
    if (!amount || amount <= 0) {
      Alert.alert('Campo obrigatório', 'Informe um valor válido.');
      return;
    }
    onConfirm({
      establishment: establishment.trim(),
      amount,
      category,
      transaction_date: toLocalDateIso(date),
      ocr_text: data.ocr_text,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: colors.surface }]}>
          <View style={s.header}>
            <Ionicons name="document-text" size={22} color={colors.primary} />
            <Text style={[s.title, { color: colors.text }]}>Confirmar documento</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            {alerts.map((msg, i) => (
              <View key={i} style={[s.alert, msg.includes('ilegível') || data.errors?.includes(msg) ? s.alertErr : s.alertWarn]}>
                <Text style={s.alertTxt}>{msg}</Text>
              </View>
            ))}

            <Field label="Estabelecimento" colors={colors}>
              {editing ? (
                <TextInput
                  value={establishment}
                  onChangeText={setEstablishment}
                  style={[s.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder="Nome do estabelecimento"
                  placeholderTextColor={colors.textTertiary}
                />
              ) : (
                <Text style={[s.value, { color: colors.text }]}>{establishment || '—'}</Text>
              )}
            </Field>

            <Field label="Valor" colors={colors}>
              {editing ? (
                <TextInput
                  value={amountStr}
                  onChangeText={setAmountStr}
                  keyboardType="decimal-pad"
                  style={[s.input, { color: colors.text, borderColor: colors.border }]}
                  placeholder="0,00"
                  placeholderTextColor={colors.textTertiary}
                />
              ) : (
                <Text style={[s.value, { color: colors.primary }]}>
                  {(() => {
                    const n = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
                    return n > 0 ? fmtBRL(n) : 'Informe o valor';
                  })()}
                </Text>
              )}
            </Field>

            <Field label="Categoria" colors={colors}>
              {editing ? (
                <View style={s.catRow}>
                  {SCAN_CATEGORIES.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCategory(c)}
                      style={[s.catChip, category === c && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    >
                      <Text style={[s.catChipTxt, { color: category === c ? '#fff' : colors.text }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={[s.value, { color: colors.text }]}>{category}</Text>
              )}
            </Field>

            <Field label="Data" colors={colors}>
              {editing ? (
                <>
                  <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[s.input, s.dateBtn, { borderColor: colors.border }]}>
                    <Text style={{ color: colors.text }}>{formatDateBR(date)}</Text>
                    <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={date}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(_, picked) => {
                        setShowDatePicker(Platform.OS === 'ios');
                        if (picked) setDate(picked);
                      }}
                    />
                  )}
                </>
              ) : (
                <Text style={[s.value, { color: colors.text }]}>{formatDateBR(date)}</Text>
              )}
            </Field>

            <TouchableOpacity onPress={() => setShowOcr(v => !v)} style={s.ocrToggle}>
              <Text style={[s.ocrToggleTxt, { color: colors.textSecondary }]}>
                Texto OCR completo {showOcr ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
            {showOcr && (
              <Text style={[s.ocrText, { color: colors.textTertiary, backgroundColor: colors.bg }]}>
                {data.ocr_text || '(vazio)'}
              </Text>
            )}
          </ScrollView>

          <View style={s.actions}>
            <TouchableOpacity style={[s.btn, s.btnGhost, { borderColor: colors.border }]} onPress={onCancel} disabled={saving}>
              <Text style={[s.btnGhostTxt, { color: colors.textSecondary }]}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnGhost, { borderColor: colors.border }]}
              onPress={() => setEditing(e => !e)}
              disabled={saving}
            >
              <Text style={[s.btnGhostTxt, { color: colors.text }]}>{editing ? 'Pré-visualizar' : 'Editar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, s.btnPrimary, { backgroundColor: colors.primary }]} onPress={handleConfirm} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryTxt}>Confirmar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, children, colors }: { label: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: colors.textTertiary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  title: { flex: 1, fontSize: 17, fontWeight: '700' },
  alert: { borderRadius: 10, padding: 10, marginBottom: 8 },
  alertWarn: { backgroundColor: 'rgba(245,158,11,0.15)' },
  alertErr: { backgroundColor: 'rgba(239,68,68,0.15)' },
  alertTxt: { fontSize: 12, color: colors.text, lineHeight: 18 },
  input: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  dateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  value: { fontSize: 15, fontWeight: '600' },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  catChipTxt: { fontSize: 12, fontWeight: '600' },
  ocrToggle: { marginTop: 4, marginBottom: 8 },
  ocrToggleTxt: { fontSize: 12 },
  ocrText: { fontSize: 11, lineHeight: 16, padding: 10, borderRadius: 10, maxHeight: 160 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1 },
  btnGhostTxt: { fontSize: 13, fontWeight: '600' },
  btnPrimary: {},
  btnPrimaryTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
