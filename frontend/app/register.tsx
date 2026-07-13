import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../src/AuthContext';
import { useTheme } from '../src/ThemeContext';

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name || !email || !password) return Alert.alert('Atenção', 'Preencha todos os campos');
    if (password.length < 6) return Alert.alert('Atenção', 'A senha deve ter ao menos 6 caracteres');
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      router.replace('/(tabs)/dashboard');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível cadastrar');
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.c}>
      <LinearGradient colors={['#0A0A0A', '#0A0A0A', '#0F1F14']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.headerWrap}>
          <View style={s.logoBox}><Text style={s.logoTxt}>N</Text></View>
          <Text style={s.brand}>Nocker</Text>
        </View>
        <View style={s.card}>
          <Text style={s.h}>Criar conta</Text>
          <Text style={s.sub}>Comece a controlar suas finanças hoje</Text>

          <View style={s.fieldWrap}>
            <Ionicons name="person-outline" size={18} color={colors.textTertiary} />
            <TextInput testID="reg-name" placeholder="Seu nome" placeholderTextColor={colors.textTertiary}
              value={name} onChangeText={setName} style={s.input} />
          </View>
          <View style={s.fieldWrap}>
            <Ionicons name="mail-outline" size={18} color={colors.textTertiary} />
            <TextInput testID="reg-email" placeholder="E-mail" placeholderTextColor={colors.textTertiary}
              autoCapitalize="none" keyboardType="email-address"
              value={email} onChangeText={setEmail} style={s.input} />
          </View>
          <View style={s.fieldWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} />
            <TextInput testID="reg-password" placeholder="Senha (mín. 6)" placeholderTextColor={colors.textTertiary}
              secureTextEntry value={password} onChangeText={setPassword} style={s.input} />
          </View>

          <TouchableOpacity testID="reg-submit" style={s.btn} onPress={submit} disabled={busy} activeOpacity={0.9}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Criar minha conta</Text>}
          </TouchableOpacity>

          <View style={s.row}>
            <Text style={s.muted}>Já tem conta?</Text>
            <Link href="/login" asChild>
              <TouchableOpacity testID="go-login"><Text style={s.linkTxt}> Entrar</Text></TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  headerWrap: { alignItems: 'center', marginBottom: 24 },
  logoBox: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } },
  logoTxt: { color: '#fff', fontSize: 32, fontWeight: '800' },
  brand: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 12, letterSpacing: -1 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: colors.border },
  h: { color: '#fff', fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  sub: { color: colors.textSecondary, fontSize: 14, marginTop: 4, marginBottom: 20 },
  fieldWrap: { flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surfaceElevated, borderRadius: 16,
    paddingHorizontal: 14, height: 54, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  input: { flex: 1, color: '#fff', fontSize: 15 },
  btn: { backgroundColor: colors.primary, borderRadius: 999, height: 54,
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
    shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  muted: { color: colors.textSecondary, fontSize: 13 },
  linkTxt: { color: colors.primary, fontSize: 13, fontWeight: '700' },
});
