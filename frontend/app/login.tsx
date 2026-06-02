import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../src/AuthContext';
import { useTheme } from '../src/ThemeContext';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { createClient } from '@supabase/supabase-js';

WebBrowser.maybeCompleteAuthSession();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://cipotkmwbjwzrioswice.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function Login() {
  const router = useRouter();
  const { login, loginWithGoogle } = useAuth();
  const { colors, t, themeMode } = useTheme();
  const s = makeStyles(colors, themeMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Escuta o deep link de callback do OAuth
  useEffect(() => {
    const handleUrl = async (url: string) => {
      if (!url) return;
      try {
        // Trata tanto fragment (#) quanto query string (?)
        const fragment = url.split('#')[1] || '';
        const query = url.split('?')[1]?.split('#')[0] || '';
        const params = new URLSearchParams(fragment || query);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken) {
          setGoogleBusy(true);
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          if (sessionError) throw sessionError;

          const googleUser = sessionData?.user;
          if (googleUser?.email) {
            await loginWithGoogle(
              googleUser.id,
              googleUser.email,
              googleUser.user_metadata?.full_name || googleUser.email.split('@')[0],
              googleUser.user_metadata?.avatar_url,
            );
            router.replace('/(tabs)/dashboard');
          }
        }
      } catch (e: any) {
        Alert.alert('Erro', e.message || 'Não foi possível entrar com Google');
      } finally {
        setGoogleBusy(false);
      }
    };

    // Verifica URL inicial (app aberto pelo deep link)
    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); });

    // Escuta mudanças de URL enquanto o app está aberto
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

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

  const handleGoogleLogin = async () => {
    setGoogleBusy(true);
    try {
      const redirectUrl = Linking.createURL('/');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('URL de autenticação não gerada');

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

      if (result.type === 'success' && result.url) {
        // O useEffect acima irá capturar a URL e processar o token
        // Mas caso o openAuthSessionAsync retorne antes do listener, processamos aqui também
        const url = result.url;
        const fragment = url.split('#')[1] || '';
        const query = url.split('?')[1]?.split('#')[0] || '';
        const params = new URLSearchParams(fragment || query);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken) {
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          if (sessionError) throw sessionError;

          const googleUser = sessionData?.user;
          if (googleUser?.email) {
            await loginWithGoogle(
              googleUser.id,
              googleUser.email,
              googleUser.user_metadata?.full_name || googleUser.email.split('@')[0],
              googleUser.user_metadata?.avatar_url,
            );
            router.replace('/(tabs)/dashboard');
          }
        } else {
          Alert.alert('Erro', 'Não foi possível obter o token de acesso');
        }
      }
    } catch (e: any) {
      if ((e as any)?.message !== 'cancelled') {
        Alert.alert('Erro', e.message || 'Não foi possível entrar com Google');
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.c}>
      <LinearGradient colors={themeMode === 'dark' ? ['#0A0A0A', '#0A0A0A', '#0F1F14'] : ['#F5F5F5', '#F5F5F5', '#E8F5E9']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.headerWrap}>
          <Image
            source={require('../assets/images/icon.png')}
            style={s.logoImg}
            resizeMode="contain"
          />
          <Text style={s.brand}>Nocker</Text>
          <Text style={s.tag}>{t.slogan}</Text>
        </View>

        <View style={s.card}>
          <Text style={s.h}>Entrar</Text>
          <Text style={s.sub}>Bem-vindo de volta 👋</Text>

          <View style={s.fieldWrap}>
            <Ionicons name="mail-outline" size={18} color={colors.textTertiary} />
            <TextInput
              testID="login-email"
              placeholder="E-mail"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email} onChangeText={setEmail}
              style={s.input}
            />
          </View>
          <View style={s.fieldWrap}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.textTertiary} />
            <TextInput
              testID="login-password"
              placeholder="Senha"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry={!show}
              value={password} onChangeText={setPassword}
              style={s.input}
            />
            <TouchableOpacity onPress={() => setShow(!show)}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity testID="login-submit" style={s.btn} onPress={submit} disabled={busy} activeOpacity={0.9}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Entrar</Text>}
          </TouchableOpacity>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerTxt}>ou</Text>
            <View style={s.dividerLine} />
          </View>

          <TouchableOpacity style={s.googleBtn} onPress={handleGoogleLogin} disabled={googleBusy} activeOpacity={0.85}>
            {googleBusy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <View style={s.googleIconCircle}>
                  <Text style={s.googleLetter}>G</Text>
                </View>
                <Text style={[s.googleTxt, { color: colors.text }]}>Continuar com Google</Text>
              </>
            )}
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

const makeStyles = (colors: any, themeMode: string) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  headerWrap: { alignItems: 'center', marginBottom: 32 },
  logoImg: {
    width: 90,
    height: 90,
    borderRadius: 20,
  },
  brand: { color: colors.text, fontSize: 32, fontWeight: '800', letterSpacing: -1, marginTop: 14 },
  tag: { color: colors.textSecondary, fontSize: 13, marginTop: 6 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1, borderColor: colors.border,
  },
  h: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  sub: { color: colors.textSecondary, fontSize: 14, marginTop: 4, marginBottom: 20 },
  fieldWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 16, paddingHorizontal: 14, height: 54,
    borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  },
  input: { flex: 1, color: colors.text, fontSize: 15 },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 999, height: 54,
    alignItems: 'center', justifyContent: 'center', marginTop: 12,
    shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
  },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerTxt: { color: colors.textTertiary, fontSize: 12, fontWeight: '500' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 54, borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1, borderColor: colors.borderStrong,
    gap: 12, marginBottom: 4,
  },
  googleIconCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: themeMode === 'dark' ? '#fff' : '#4285F4',
    alignItems: 'center', justifyContent: 'center',
  },
  googleLetter: { fontSize: 15, fontWeight: '800', color: themeMode === 'dark' ? '#4285F4' : '#fff', letterSpacing: -0.5 },
  googleTxt: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  muted: { color: colors.textSecondary, fontSize: 13 },
  linkTxt: { color: colors.primary, fontSize: 13, fontWeight: '700' },
});
