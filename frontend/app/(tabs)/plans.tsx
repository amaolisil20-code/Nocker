import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/ThemeContext';

const PLANS = [
  {
    id: 'free',
    name: 'Gratuito',
    price: 'R$ 0',
    period: '/mês',
    badge: null,
    desc: 'Para começar a organizar sua vida financeira.',
    color: '#6B7280',
    gradient: ['#374151', '#1F2937'] as [string, string],
    icon: '🎯',
    btnLabel: 'Plano atual',
    btnDisabled: true,
    features: [
      'Controle de receitas e despesas',
      'Categorias financeiras',
      'Metas financeiras básicas',
      'Dashboard financeiro básico',
      'Backup em nuvem',
      'Relatórios simples',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 'R$ 14,90',
    period: '/mês',
    badge: null,
    desc: 'Ideal para quem deseja mais controle financeiro.',
    color: '#3B82F6',
    gradient: ['#1D4ED8', '#1E40AF'] as [string, string],
    icon: '⭐',
    btnLabel: 'Assinar Pro',
    btnDisabled: false,
    features: [
      'Tudo do Gratuito',
      'Metas ilimitadas',
      'Relatórios avançados',
      'Planejamento de compras',
      'Alertas personalizados',
      'Exportação PDF e Excel',
      'Sincronização entre dispositivos',
      'Sem anúncios',
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'R$ 59,90',
    period: '/mês',
    badge: null,
    desc: 'O máximo em controle e inteligência financeira.',
    color: '#F59E0B',
    gradient: ['#D97706', '#B45309'] as [string, string],
    icon: '🤖',
    btnLabel: 'Assinar Premium',
    btnDisabled: false,
    features: [
      'Tudo do Pro',
      'IA financeira ilimitada',
      'Análise inteligente dos gastos',
      'Sugestões automáticas de economia',
      'Planejamento financeiro personalizado',
      'Previsão de fluxo de caixa',
      'Simulações de objetivos financeiros',
      'Assistente financeiro 24h',
      'Recursos antecipados',
      'Suporte prioritário',
    ],
  },
];

export default function Plans() {
  const insets = useSafeAreaInsets();
  const { colors, themeMode } = useTheme();
  const router = useRouter();
  const s = makeStyles(colors);
  const [selected, setSelected] = useState('free');

  const handleSubscribe = (plan: typeof PLANS[0]) => {
    if (plan.btnDisabled) return;
    Alert.alert(
      'Pagamentos ainda não disponíveis',
      `O plano ${plan.name} ainda não pode ser assinado — o Nocker ainda não tem um meio de pagamento integrado. Continue usando o plano gratuito por enquanto; você será avisado assim que os planos pagos estiverem disponíveis.`,
    );
  };

  return (
    <View style={[s.c, { paddingTop: insets.top + 12 }]}>
      {/* Header */}
      <View style={s.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={s.title}>Planos</Text>
          <Text style={s.subtitle}>Escolha o melhor para você</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 100, paddingTop: 8 }}>

        {/* Banner topo */}
        <LinearGradient colors={['#16A34A22', '#16A34A05']}
          style={s.banner}>
          <Text style={s.bannerEmoji}>💚</Text>
          <View style={{ flex: 1 }}>
            <Text style={[s.bannerTitle, { color: colors.text }]}>Invista no seu futuro</Text>
            <Text style={[s.bannerSub, { color: colors.textSecondary }]}>Planos que crescem com você</Text>
          </View>
        </LinearGradient>

        {PLANS.map((plan) => {
          const isSelected = selected === plan.id;
          return (
            <TouchableOpacity
              key={plan.id}
              activeOpacity={0.92}
              onPress={() => setSelected(plan.id)}
              style={[s.card, isSelected && { borderColor: plan.color, borderWidth: 2 }]}>

              {/* Badge destaque */}
              {plan.badge && (
                <View style={[s.badge, { backgroundColor: plan.color }]}>
                  <Text style={s.badgeTxt}>{plan.badge}</Text>
                </View>
              )}

              {/* Cabeçalho do card */}
              <LinearGradient colors={plan.gradient} style={s.cardHeader}>
                <View style={s.cardHeaderRow}>
                  <Text style={s.planIcon}>{plan.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.planName}>{plan.name}</Text>
                    <Text style={s.planDesc}>{plan.desc}</Text>
                  </View>
                  <View style={s.priceBox}>
                    <Text style={s.price}>{plan.price}</Text>
                    <Text style={s.period}>{plan.period}</Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Features */}
              <View style={s.featuresBox}>
                {plan.features.map((f, i) => (
                  <View key={i} style={s.featureRow}>
                    <View style={[s.featureDot, { backgroundColor: plan.color }]}>
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    </View>
                    <Text style={[s.featureTxt, { color: colors.text }]}>{f}</Text>
                  </View>
                ))}
              </View>

              {/* Botão */}
              <TouchableOpacity
                style={[s.btn, plan.btnDisabled
                  ? { backgroundColor: colors.surfaceElevated }
                  : { backgroundColor: plan.color }]}
                onPress={() => handleSubscribe(plan)}
                disabled={plan.btnDisabled}
                activeOpacity={0.85}>
                <Text style={[s.btnTxt, plan.btnDisabled && { color: colors.textSecondary }]}>
                  {plan.btnLabel}
                </Text>
                {!plan.btnDisabled && <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 6 }} />}
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}

        <Text style={[s.footerTxt, { color: colors.textTertiary }]}>
          Cancele quando quiser. Sem taxas ocultas.
        </Text>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  c: { flex: 1, backgroundColor: colors.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16,
    padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#16A34A33' },
  bannerEmoji: { fontSize: 28 },
  bannerTitle: { fontSize: 15, fontWeight: '700' },
  bannerSub: { fontSize: 12, marginTop: 2 },

  card: { backgroundColor: colors.surface, borderRadius: 22, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  badge: { position: 'absolute', top: 52, right: 12, zIndex: 10,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },

  cardHeader: { padding: 18 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  planIcon: { fontSize: 32, marginTop: 2 },
  planName: { color: '#fff', fontSize: 20, fontWeight: '800' },
  planDesc: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2, lineHeight: 16 },
  priceBox: { alignItems: 'flex-end' },
  price: { color: '#fff', fontSize: 22, fontWeight: '900' },
  period: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },

  featuresBox: { padding: 16, gap: 10 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  featureTxt: { fontSize: 13, flex: 1 },

  btn: { margin: 16, marginTop: 4, borderRadius: 14, height: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },

  footerTxt: { fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 8 },
});