import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api';
import { theme } from '../../src/theme';

type Msg = { role: 'user' | 'assistant'; content: string; pending?: boolean };

const SUGGESTIONS = [
  '💡 Como economizar este mês?',
  '📊 Analise meus gastos',
  '🎯 Crie um plano de poupança',
  '💰 Onde estou gastando mais?',
];

export default function Chat() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: 'Olá! Eu sou a Nocker IA 🤖✨\n\nEstou aqui para te ajudar a entender seus gastos, criar planos, economizar e atingir suas metas. Como posso ajudar hoje?',
    }]);
  }, []);

  const send = async (msg?: string) => {
    const content = (msg ?? text).trim();
    if (!content || sending) return;
    setText('');
    setMessages(m => [...m, { role: 'user', content }, { role: 'assistant', content: '', pending: true }]);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const r = await api.chat(content, sessionId);
      setSessionId(r.session_id);
      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', content: r.reply };
        return copy;
      });
    } catch (e: any) {
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      style={s.c}
    >
      <LinearGradient colors={['#0F1F14', '#0A0A0A']} style={[StyleSheet.absoluteFill, { height: 200 }]} />
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.aiAvatar}>
          <Ionicons name="sparkles" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Nocker IA</Text>
          <View style={s.statusRow}>
            <View style={s.statusDot} />
            <Text style={s.statusTxt}>Online • Claude Sonnet 4.5</Text>
          </View>
        </View>
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
                  <ActivityIndicator color={theme.colors.primary} size="small" />
                  <Text style={s.typingTxt}>Nocker está pensando...</Text>
                </View>
              ) : (
                <Text style={[s.bubbleTxt, m.role === 'user' && { color: '#fff' }]}>{m.content}</Text>
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
                  <Text style={s.suggestionTxt}>{sg}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom + 90, 100) }]}>
        <View style={s.inputWrap}>
          <TextInput
            testID="chat-input"
            value={text} onChangeText={setText}
            placeholder="Pergunte algo financeiro..."
            placeholderTextColor={theme.colors.textTertiary}
            style={s.input}
            multiline
            onSubmitEditing={() => send()}
          />
          <TouchableOpacity testID="chat-send" style={[s.sendBtn, !text.trim() && { opacity: 0.5 }]} onPress={() => send()} disabled={!text.trim() || sending}>
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  aiAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.primary, shadowOpacity: 0.6, shadowRadius: 14 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.primary },
  statusTxt: { color: theme.colors.textSecondary, fontSize: 11 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 12 },
  smallAi: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18 },
  bubbleUser: { backgroundColor: theme.colors.primary, borderTopRightRadius: 4 },
  bubbleAi: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
  bubbleTxt: { color: '#fff', fontSize: 14, lineHeight: 21 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingTxt: { color: theme.colors.textSecondary, fontSize: 13, fontStyle: 'italic' },
  suggestionsWrap: { marginTop: 8 },
  suggestionsHint: { color: theme.colors.textTertiary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 },
  suggestionsGrid: { gap: 8 },
  suggestionChip: { backgroundColor: theme.colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.colors.border },
  suggestionTxt: { color: '#fff', fontSize: 13 },
  inputBar: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: theme.colors.bg, borderTopWidth: 1, borderTopColor: theme.colors.border },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, backgroundColor: theme.colors.surface, borderRadius: 26,
    paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: theme.colors.border },
  input: { flex: 1, color: '#fff', fontSize: 14, maxHeight: 100, paddingVertical: 10 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
