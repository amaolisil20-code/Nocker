import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/ThemeContext';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: '1. Sobre o Nocker',
    body: 'O Nocker é um aplicativo de gestão financeira pessoal. Ele ajuda você a registrar receitas e despesas, organizar categorias, acompanhar metas, cartões, assinaturas e parcelamentos, e oferece recursos opcionais como leitura de notas fiscais (OCR), conexão com contas bancárias via Open Finance e um assistente financeiro com inteligência artificial.',
  },
  {
    title: '2. Cadastro e conta',
    body: 'Para usar o Nocker você cria uma conta com nome, e-mail e senha (ou entra com sua conta Google). Você é responsável por manter sua senha em sigilo e por tudo que acontecer na sua conta. Avise-nos imediatamente se suspeitar de uso não autorizado.',
  },
  {
    title: '3. Uso do serviço',
    body: 'O Nocker deve ser usado apenas para fins pessoais e lícitos de organização financeira. Não é permitido usar o app para atividades ilegais, tentar acessar dados de outros usuários, ou interferir no funcionamento do serviço.',
  },
  {
    title: '4. Recursos opcionais e integrações',
    body: 'Alguns recursos dependem de serviços de terceiros: a leitura automática de notas fiscais usa reconhecimento de imagem (OCR); o assistente financeiro usa inteligência artificial para responder perguntas sobre seus dados; e a sincronização bancária automática, quando ativada, usa a Pluggy como provedora de Open Finance. Esses recursos podem ficar indisponíveis temporariamente e dependem da sua autorização explícita para serem ativados.',
  },
  {
    title: '5. Planos e cobrança',
    body: 'Atualmente o Nocker está disponível no plano gratuito. Caso planos pagos sejam lançados no futuro, os valores, formas de pagamento e condições de cancelamento serão informados claramente antes de qualquer cobrança — nenhuma cobrança é feita sem sua confirmação explícita.',
  },
  {
    title: '6. Isenção de responsabilidade',
    body: 'O Nocker é uma ferramenta de organização financeira pessoal e não constitui aconselhamento financeiro, contábil, tributário ou de investimentos profissional. As categorizações automáticas, previsões e sugestões da IA são estimativas e podem conter erros — decisões financeiras importantes devem ser validadas por você.',
  },
  {
    title: '7. Cancelamento e exclusão de conta',
    body: 'Você pode excluir sua conta a qualquer momento em Configurações. A exclusão remove permanentemente seus dados financeiros, cartões, metas e histórico associados à conta, e não pode ser desfeita.',
  },
  {
    title: '8. Alterações nestes termos',
    body: 'Podemos atualizar estes termos para refletir mudanças no app ou na legislação. Mudanças relevantes serão comunicadas dentro do próprio aplicativo.',
  },
  {
    title: '9. Contato',
    body: 'Dúvidas sobre estes termos podem ser enviadas pela seção Ajuda & Suporte, dentro de Configurações.',
  },
];

export default function Terms() {
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
        <Text style={s.title}>Termos de uso</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={s.noticeBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={s.noticeTxt}>
            Este é um rascunho inicial dos termos de uso do Nocker, escrito para refletir o que o app faz hoje.
            Ele ainda não passou por revisão jurídica formal.
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
