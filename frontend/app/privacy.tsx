import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/ThemeContext';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Quais dados coletamos',
    body: 'Dados de cadastro (nome, e-mail, senha ou login Google); dados financeiros que você registra (transações, categorias, metas, cartões, assinaturas, parcelamentos); imagens de notas fiscais, quando você usa a leitura automática (OCR); e, se você conectar um banco, os dados de saldo e transações trazidos via Open Finance (Pluggy). No Android, se você autorizar, o app também lê notificações de bancos para sugerir o lançamento automático de transações — essa leitura só acontece com sua permissão explícita e pode ser desativada a qualquer momento.',
  },
  {
    title: '2. Como usamos seus dados',
    body: 'Usamos seus dados para: manter sua conta e autenticação; exibir seu histórico e dashboards financeiros; categorizar automaticamente transações; gerar respostas do assistente de IA sobre suas finanças; e sincronizar dados bancários quando você conecta uma conta. Não vendemos seus dados a terceiros.',
  },
  {
    title: '3. Compartilhamento com terceiros',
    body: 'Seus dados são armazenados no Supabase (banco de dados e autenticação). Perguntas ao assistente de IA e a leitura de notas fiscais podem ser processadas por modelos de linguagem da Anthropic. Quando você conecta um banco, a sincronização é feita pela Pluggy, provedora de Open Finance regulada pelo Banco Central. Cada uma dessas empresas processa apenas os dados estritamente necessários para prestar o respectivo serviço.',
  },
  {
    title: '4. Segurança',
    body: 'Senhas são armazenadas com hash (bcrypt), nunca em texto puro. Tokens de acesso bancário são criptografados antes de serem salvos. O acesso à API exige autenticação por token (JWT) e o login com Google é validado diretamente no servidor de autenticação — nenhuma identidade é aceita apenas porque o app "disse" que é sua.',
  },
  {
    title: '5. Seus direitos (LGPD)',
    body: 'Você pode acessar, corrigir ou excluir seus dados a qualquer momento. A exclusão de conta, disponível em Configurações, remove permanentemente seus dados financeiros e de cadastro. Para outras solicitações relacionadas aos seus dados, use a seção Ajuda & Suporte.',
  },
  {
    title: '6. Retenção de dados',
    body: 'Mantemos seus dados enquanto sua conta estiver ativa. Ao excluir a conta, os dados financeiros associados são removidos permanentemente dos nossos sistemas.',
  },
  {
    title: '7. Contato',
    body: 'Dúvidas sobre esta política ou sobre o tratamento dos seus dados podem ser enviadas pela seção Ajuda & Suporte, dentro de Configurações.',
  },
];

export default function Privacy() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, themeMode } = useTheme();
  const s = makeStyles(colors);

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      <LinearGradient colors={themeMode === 'dark' ? ['#0A0A0A', '#0A0A0A', '#0F1F14'] : ['#F5F5F5', '#F5F5F5', '#E8F5E9']} style={StyleSheet.absoluteFill} />

      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Política de privacidade</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.noticeBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={s.noticeTxt}>
            Este é um rascunho inicial da política de privacidade do Nocker, escrito para refletir o que o app
            realmente coleta e faz com seus dados hoje. Ele ainda não passou por revisão jurídica formal.
          </Text>
        </View>

        {SECTIONS.map((sec) => (
          <View key={sec.title} style={s.section}>
            <Text style={s.sectionTitle}>{sec.title}</Text>
            <Text style={s.sectionBody}>{sec.body}</Text>
          </View>
        ))}

        <Text style={s.updated}>Última atualização: julho de 2026</Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },

  noticeBox: {
    flexDirection: 'row', gap: 10, backgroundColor: colors.surface,
    borderRadius: 14, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  noticeTxt: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },

  section: { marginBottom: 18 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  sectionBody: { color: colors.textSecondary, fontSize: 13.5, lineHeight: 20 },

  updated: { color: colors.textTertiary, fontSize: 11, textAlign: 'center', marginTop: 8, marginBottom: 8 },
});
