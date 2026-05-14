import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/AuthContext';
import { theme } from '../../src/theme';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();

  const doLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar' },
      { text: 'Sair', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const Item = ({ icon, label, hint, onPress, color = theme.colors.text, testID }: any) => (
    <TouchableOpacity testID={testID} style={s.item} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.itemIcon, { backgroundColor: `${theme.colors.primary}22` }]}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.itemLabel, { color }]}>{label}</Text>
        {hint && <Text style={s.itemHint}>{hint}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </TouchableOpacity>
  );

  return (
    <ScrollView style={[s.c]} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 120, paddingHorizontal: 20 }}>
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.title}>Configurações</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.profileCard}>
        <View style={s.profileAvatar}>
          <Text style={s.profileInitial}>{user?.name?.[0]?.toUpperCase() || 'N'}</Text>
        </View>
        <Text style={s.profileName}>{user?.name}</Text>
        <Text style={s.profileEmail}>{user?.email}</Text>
      </View>

      <Text style={s.section}>Conta</Text>
      <View style={s.group}>
        <Item icon="person-outline" label="Perfil" hint="Edite seus dados" onPress={() => Alert.alert('Em breve', 'Editar perfil estará disponível em breve.')} />
        <Item icon="shield-checkmark-outline" label="Segurança" hint="Senha, biometria" onPress={() => Alert.alert('Em breve', 'Configurações de segurança em desenvolvimento.')} />
        <Item icon="notifications-outline" label="Notificações" hint="Alertas e lembretes" onPress={() => Alert.alert('Em breve', 'Notificações personalizadas em breve.')} />
      </View>

      <Text style={s.section}>Preferências</Text>
      <View style={s.group}>
        <Item icon="moon-outline" label="Aparência" hint="Tema escuro ativo" onPress={() => Alert.alert('Aparência', 'O tema escuro premium está habilitado por padrão.')} />
        <Item icon="language-outline" label="Idioma" hint="Português (BR)" onPress={() => Alert.alert('Idioma', 'Português configurado.')} />
      </View>

      <Text style={s.section}>Mais</Text>
      <View style={s.group}>
        <Item icon="cloud-upload-outline" label="Exportar relatório" hint="Em breve" onPress={() => Alert.alert('Em breve', 'Exportação CSV/PDF chegando em breve.')} />
        <Item icon="link-outline" label="Integração bancária" hint="Em breve" onPress={() => Alert.alert('Em breve', 'Conexão com bancos via Open Finance será disponibilizada em breve.')} />
        <Item icon="help-circle-outline" label="Ajuda & Suporte" hint="Fale conosco" onPress={() => Alert.alert('Ajuda', 'Em breve, central de ajuda integrada.')} />
      </View>

      <TouchableOpacity testID="logout-btn" style={s.logout} onPress={doLogout}>
        <Ionicons name="log-out-outline" size={18} color={theme.colors.expense} />
        <Text style={s.logoutTxt}>Sair da conta</Text>
      </TouchableOpacity>

      <Text style={s.foot}>Nocker • Versão 1.0</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.border },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  profileCard: { alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: 24, padding: 24,
    borderWidth: 1, borderColor: theme.colors.border, marginBottom: 18 },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.colors.primary, shadowOpacity: 0.5, shadowRadius: 18 },
  profileInitial: { color: '#fff', fontSize: 36, fontWeight: '800' },
  profileName: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 14 },
  profileEmail: { color: theme.colors.textSecondary, fontSize: 13, marginTop: 4 },
  section: { color: theme.colors.textTertiary, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  group: { backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  itemIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  itemHint: { color: theme.colors.textTertiary, fontSize: 11, marginTop: 2 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  logoutTxt: { color: theme.colors.expense, fontWeight: '700', fontSize: 14 },
  foot: { color: theme.colors.textTertiary, fontSize: 11, textAlign: 'center', marginTop: 24 },
});
