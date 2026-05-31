import AsyncStorage from '@react-native-async-storage/async-storage';

export type AiTone = 'motivador' | 'rigido' | 'engracado';
export type AiVoice = 'feminina' | 'masculina' | 'neutra';

export type AiSettings = {
  personality: string;
  tone: AiTone;
  voiceEnabled: boolean;
  voice: AiVoice;
  financialChatEnabled: boolean;
};

const KEY = 'nocker_ai_settings';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  personality: '',
  tone: 'motivador',
  voiceEnabled: false,
  voice: 'feminina',
  financialChatEnabled: true,
};

export async function getAiSettings(): Promise<AiSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export async function saveAiSettings(partial: Partial<AiSettings>): Promise<AiSettings> {
  const current = await getAiSettings();
  const next = { ...current, ...partial };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export const AI_TONE_OPTIONS: { key: AiTone; label: string; hint: string }[] = [
  { key: 'motivador', label: 'Motivador', hint: 'Encoraja e celebra suas conquistas financeiras' },
  { key: 'rigido', label: 'Rígido', hint: 'Direto ao ponto, foco em disciplina e metas' },
  { key: 'engracado', label: 'Engraçado', hint: 'Leve, descontraído e ainda muito útil' },
];

export const AI_VOICE_OPTIONS: { key: AiVoice; label: string }[] = [
  { key: 'feminina', label: 'Feminina' },
  { key: 'masculina', label: 'Masculina' },
  { key: 'neutra', label: 'Neutra' },
];
