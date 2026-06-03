import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Modal,
  KeyboardAvoidingView, Platform, Alert, Image, Animated, Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../../src/api';
import { fmtBRL } from '../../src/theme';
import { useTheme } from '../../src/ThemeContext';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_H = 220;
const COLORS = ['#16A34A', '#3B82F6', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#EF4444', '#F97316'];
const EMOJIS = ['🚗','✈️','🏠','💻','📱','🎮','👟','💎','🏋️','🌴','🎓','💍'];

function GoalCard({ g, onPress, onLongPress }: { g: any; onPress: () => void; onLongPress: () => void }) {
  const pct = Math.min(100, Math.max(0, (g.current_amount / g.target_amount) * 100));
  const done = pct >= 100;
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(fillAnim, { toValue: pct / 100, useNativeDriver: false, tension: 40, friction: 8 }).start();
  }, [pct]);

  const fillH = fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.92} style={styles.cardWrap}>
      <View style={[styles.card, { borderColor: `${g.color}55` }]}>
        {/* Imagem de fundo */}
        {g.image_url ? (
          <Image source={{ uri: g.image_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : (
          <LinearGradient colors={[`${g.color}33`, `${g.color}11`]} style={StyleSheet.absoluteFillObject} />
        )}

        {/* Overlay escuro sobre a imagem */}
        {g.image_url && <View style={styles.imgOverlay} />}

        {/* Preenchimento de água animado */}
        <Animated.View style={[styles.waterFill, { height: fillH, backgroundColor: done ? '#16A34A99' : `${g.color}55` }]} />

        {/* Conteúdo */}
        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
            <View style={[styles.emojiBox, { backgroundColor: `${g.color}44` }]}>
              <Text style={styles.emojiTxt}>{g.emoji || '🎯'}</Text>
            </View>
            {done && (
              <View style={styles.doneBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#fff" />
                <Text style={styles.doneTxt}>Conquistado!</Text>
              </View>
            )}
          </View>

          <View style={styles.cardBottom}>
            <Text style={styles.cardTitle} numberOfLines={1}>{g.title}</Text>
            <View style={styles.amountRow}>
              <Text style={[styles.currentAmt, { color: g.color }]}>{fmtBRL(g.current_amount)}</Text>
              <Text style={styles.targetAmt}> / {fmtBRL(g.target_amount)}</Text>
            </View>

            {/* Barra de progresso */}
            <View style={styles.barBg}>
              <Animated.View style={[styles.barFill, {
                width: fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                backgroundColor: done ? '#16A34A' : g.color,
              }]} />
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.pctTxt}>{pct.toFixed(0)}% concluído</Text>
              <Text style={styles.hintTxt}>Toque para adicionar • Segure para excluir</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function Goals() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ open?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('0');
  const [color, setColor] = useState(COLORS[0]);
  const [emoji, setEmoji] = useState('🎯');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);

  const uploadingGoalIds = useRef<Set<string>>(new Set());

  const load = async () => {
    try {
      const fresh = await api.listGoals();
      setItems(prev => {
        const prevMap = new Map(prev.map(p => [p.id, p]));
        return fresh.map((g: any) => {
          const existing = prevMap.get(g.id);
          // Se o servidor já tem URL válida, usa ela
          if (g.image_url && g.image_url.startsWith('http')) return g;
          // Se o servidor não tem URL mas o local tem, mantém o local
          if (existing?.image_url) return { ...g, image_url: existing.image_url };
          return g;
        });
      });
    } catch { }
  };
  useFocusEffect(useCallback(() => { load(); }, []));
  useEffect(() => { if (params.open) setModal(true); }, [params.open]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permissão negada', 'Precisamos acessar sua galeria.');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const save = async () => {
    if (!title.trim()) return Alert.alert('Atenção', 'Informe um título');
    const t = parseFloat(target.replace(',', '.'));
    const cu = parseFloat(current.replace(',', '.')) || 0;
    if (!t || t <= 0) return Alert.alert('Atenção', 'Meta inválida');
    setSaving(true);
    try {
      const goal = await api.createGoal({ title: title.trim(), target_amount: t, current_amount: cu, color, emoji });

      // Fecha o modal e mostra o card imediatamente com a imagem local (antes do upload)
      const localGoal = { ...goal, image_url: imageUri || null };
      setItems(prev => [localGoal, ...prev]);
      setModal(false);
      resetForm();

      // Faz o upload em segundo plano e atualiza quando terminar
      if (imageUri) {
        uploadingGoalIds.current.add(goal.id);
        setUploadingImg(true);
        try {
          const updated = await api.uploadGoalImage(goal.id, imageUri);
          // Substitui o item local pela versão com a URL real do servidor
          setItems(prev => prev.map(g => g.id === goal.id ? updated : g));
        } catch {
          // Se o upload falhar, mantém a imagem local enquanto o app estiver aberto
        } finally {
          uploadingGoalIds.current.delete(goal.id);
          setUploadingImg(false);
        }
      }
    } catch (e: any) { Alert.alert('Erro', e.message); }
    finally { setSaving(false); }
  };

  const resetForm = () => { setTitle(''); setTarget(''); setCurrent('0'); setColor(COLORS[0]); setEmoji('🎯'); setImageUri(null); };

  const addProgress = (g: any) => {
    Alert.prompt('Adicionar valor', `Quanto adicionar à meta "${g.title}"?`, async (v) => {
      const val = parseFloat((v || '').replace(',', '.'));
      if (!val || val <= 0) return;
      const updated = await api.updateGoal(g.id, { current_amount: g.current_amount + val });
      setItems(prev => prev.map(item => item.id === g.id ? { ...updated, image_url: item.image_url } : item));
    }, 'plain-text', '', 'decimal-pad');
  };

  const remove = (id: string) =>
    Alert.alert('Excluir', 'Excluir esta meta?', [
      { text: 'Cancelar' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        await api.deleteGoal(id);
        setItems(prev => prev.filter(g => g.id !== id));
      }},
    ]);

  return (
    <View style={[styles.c, { paddingTop: insets.top + 12, backgroundColor: colors.bg }]}>
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Metas</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Visualize seus sonhos 🎯</Text>
        </View>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={() => setModal(true)}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 14 }} showsVerticalScrollIndicator={false}>
        {items.length === 0 && (
          <View style={styles.empty}>
            <Text style={{ fontSize: 64 }}>🏆</Text>
            <Text style={[styles.emptyTxt, { color: colors.text }]}>Sem metas ainda</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>Adicione a foto do carro, viagem ou{'\n'}qualquer sonho que queira conquistar</Text>
            <TouchableOpacity style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => setModal(true)}>
              <Text style={styles.emptyBtnTxt}>Criar primeira meta</Text>
            </TouchableOpacity>
          </View>
        )}
        {items.map(g => (
          <GoalCard key={g.id} g={g} onPress={() => addProgress(g)} onLongPress={() => remove(g.id)} />
        ))}
      </ScrollView>

      {/* Modal de criação */}
      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => { setModal(false); resetForm(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => { setModal(false); resetForm(); }} />
          <ScrollView style={[styles.sheet, { backgroundColor: colors.surface }]} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Nova meta</Text>

            {/* Upload de imagem */}
            <TouchableOpacity style={styles.imgPicker} onPress={pickImage}>
              {imageUri ? (
                <>
                  <Image source={{ uri: imageUri }} style={styles.imgPreview} resizeMode="cover" />
                  <View style={styles.imgEditBadge}>
                    <Ionicons name="camera" size={16} color="#fff" />
                    <Text style={styles.imgEditTxt}>Trocar foto</Text>
                  </View>
                </>
              ) : (
                <LinearGradient colors={[colors.surfaceElevated, colors.surface]} style={styles.imgPlaceholder}>
                  <Ionicons name="image-outline" size={36} color={colors.textTertiary} />
                  <Text style={[styles.imgPlaceholderTxt, { color: colors.textSecondary }]}>Adicionar foto da meta</Text>
                  <Text style={[styles.imgPlaceholderSub, { color: colors.textTertiary }]}>Carro, viagem, setup gamer...</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>

            {/* Emoji */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Ícone</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={styles.emojiRow}>
                {EMOJIS.map(e => (
                  <TouchableOpacity key={e} onPress={() => setEmoji(e)}
                    style={[styles.emojiOpt, { backgroundColor: emoji === e ? colors.primary : colors.surfaceElevated }]}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Título</Text>
            <TextInput placeholder="Ex: Honda Civic, Viagem Europa..." placeholderTextColor={colors.textTertiary}
              value={title} onChangeText={setTitle}
              style={[styles.input, { backgroundColor: colors.surfaceElevated, color: colors.text, borderColor: colors.border }]} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Valor da meta</Text>
            <TextInput placeholder="0,00" placeholderTextColor={colors.textTertiary}
              value={target} onChangeText={setTarget} keyboardType="decimal-pad"
              style={[styles.input, { backgroundColor: colors.surfaceElevated, color: colors.text, borderColor: colors.border }]} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Já tenho guardado (opcional)</Text>
            <TextInput value={current} onChangeText={setCurrent} keyboardType="decimal-pad"
              style={[styles.input, { backgroundColor: colors.surfaceElevated, color: colors.text, borderColor: colors.border }]} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Cor</Text>
            <View style={styles.colorRow}>
              {COLORS.map(c => (
                <TouchableOpacity key={c} onPress={() => setColor(c)}
                  style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorActive]} />
              ))}
            </View>

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={save} disabled={saving}>
              {saving ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.saveTxt}>{uploadingImg ? 'Enviando imagem...' : 'Salvando...'}</Text>
                </View>
              ) : (
                <Text style={styles.saveTxt}>Criar meta</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, paddingHorizontal: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Card
  cardWrap: { marginVertical: 8 },
  card: { height: CARD_H, borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  imgOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  waterFill: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  cardContent: { flex: 1, padding: 18, justifyContent: 'space-between' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  emojiBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emojiTxt: { fontSize: 26 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#16A34Acc', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  doneTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardBottom: { gap: 8 },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline' },
  currentAmt: { fontSize: 16, fontWeight: '800' },
  targetAmt: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  barBg: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pctTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  hintTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTxt: { fontSize: 18, fontWeight: '700', marginTop: 8 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 16, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 99 },
  emptyBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Modal
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, maxHeight: '92%' },
  sheetHandle: { width: 44, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  input: { borderRadius: 14, paddingHorizontal: 14, height: 48, borderWidth: 1, fontSize: 15 },

  // Imagem
  imgPicker: { height: 160, borderRadius: 18, overflow: 'hidden', marginBottom: 4 },
  imgPreview: { width: '100%', height: '100%' },
  imgPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  imgPlaceholderTxt: { fontSize: 15, fontWeight: '600' },
  imgPlaceholderSub: { fontSize: 12 },
  imgEditBadge: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  imgEditTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Emoji
  emojiRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  emojiOpt: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  // Cor
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorActive: { borderColor: '#fff' },
  saveBtn: { borderRadius: 999, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
});