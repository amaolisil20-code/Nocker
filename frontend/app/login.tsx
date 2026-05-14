import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../src/AuthContext';
import { theme } from '../src/theme';

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) return Alert.alert('Atenção', 'Preencha todos os campos');
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível entrar');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.c}>
      <LinearGradient colors={['#0A0A0A', '#0A0A0A', '#0F1F14']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.headerWrap}>
          <View style={s.logoBox}>
            <Text style={s.logoTxt}>N</Text>
          </View>
          <Text style={s.brand}>Nocker</Text>
          <Text style={s.tag}>Sua vida financeira, inteligente.</Text>
        </View>

        <View style={s.card}>
          <Text style={s.h}>Entrar</Text>
          <Text style={s.sub}>Bem-vindo de volta 👋</Text>

          <View style={s.fieldWrap}>
            <Ionicons name="mail-outline" size={18} color={theme.colors.textTertiary} />
            <TextInput
              testID="login-email"
              placeholder="E-mail"
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email} onChangeText={setEmail}
              style={s.input}
            />
          </View>
          <View style={s.fieldWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={theme.colors.textTertiary} />
            <TextInput
              testID="login-password"
              placeholder="Senha"
              placeholderTextColor={theme.colors.textTertiary}
              secureTextEntry={!show}
              value={password} onChangeText={setPassword}
              style={s.input}
            />
            <TouchableOpacity onPress={() => setShow(!show)}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity testID="login-submit" style={s.btn} onPress={submit} disabled={busy} activeOpacity={0.9}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Entrar</Text>}
          </TouchableOpacity>

          <View style={s.row}>
            <Text style={s.muted}>Ainda não tem conta?</Text>
            <Link href="/register" asChild>
              <TouchableOpacity testID="go-register"><Text style={s.linkTxt}> Criar conta</Text></TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  headerWrap: { alignItems: 'center', marginBottom: 32 },
  logoBox: {
    width: 72, height: 72, borderRadius: 20, backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.primary, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
  },
  logoTxt: { color: '#fff', fontSize: 38, fontWeight: '800' },
  brand: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -1, marginTop: 14 },
  tag: { color: theme.colors.textSecondary, fontSize: 13, marginTop: 6 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: 24,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  h: { color: '#fff', fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  sub: { color: theme.colors.textSecondary, fontSize: 14, marginTop: 4, marginBottom: 20 },
  fieldWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.lg, paddingHorizontal: 14, height: 54,
    borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12,
  },
  input: { flex: 1, color: '#fff', fontSize: 15 },
  btn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.pill, height: 54,
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
    shadowColor: theme.colors.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  muted: { color: theme.colors.textSecondary, fontSize: 13 },
  linkTxt: { color: theme.colors.primary, fontSize: 13, fontWeight: '700' },
});
