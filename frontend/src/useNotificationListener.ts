import { useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter, Platform, Alert } from 'react-native';
import { api } from './api';

const { NockerNotifications } = NativeModules;

export type DetectedTransaction = {
  amount: number;
  type: 'income' | 'expense';
  description: string;
  bank: string;
  raw: string;
};

export async function checkNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NockerNotifications) return false;
  return NockerNotifications.hasPermission();
}

export async function requestNotificationPermission() {
  if (Platform.OS !== 'android' || !NockerNotifications) return;
  NockerNotifications.requestPermission();
}

// Categorias automáticas por palavras-chave
function guessCategory(text: string, type: string): string {
  const lower = text.toLowerCase();
  if (type === 'income') {
    if (lower.includes('salário') || lower.includes('salario')) return 'Salário';
    if (lower.includes('freelance') || lower.includes('freela')) return 'Freelance';
    return 'Receita';
  }
  if (lower.includes('mercado') || lower.includes('supermercado') || lower.includes('ifood')) return 'Alimentação';
  if (lower.includes('uber') || lower.includes('99') || lower.includes('combustível') || lower.includes('gasolina')) return 'Transporte';
  if (lower.includes('farmácia') || lower.includes('hospital') || lower.includes('médico')) return 'Saúde';
  if (lower.includes('netflix') || lower.includes('spotify') || lower.includes('amazon')) return 'Assinaturas';
  if (lower.includes('aluguel') || lower.includes('energia') || lower.includes('água') || lower.includes('internet')) return 'Moradia';
  return 'Outros';
}

export function useNotificationListener(onDetected?: (tx: DetectedTransaction) => void) {
  const listenerRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'android' || !NockerNotifications) return;

    const emitter = new NativeEventEmitter(NockerNotifications);

    listenerRef.current = emitter.addListener('NockerTransaction', async (data: DetectedTransaction) => {
      const category = guessCategory(data.description + ' ' + data.raw, data.type);
      const today = new Date().toISOString().split('T')[0];

      try {
        // Cria a transação automaticamente
        await api.createTransaction({
          type: data.type,
          amount: data.amount,
          description: data.description,
          category,
          date: today,
          source: 'notification',
        });

        // Notifica o app para atualizar a tela
        onDetected?.({ ...data });

        // Mostra alerta para o usuário confirmar
        Alert.alert(
          data.type === 'income' ? '💚 Entrada detectada!' : '🔴 Saída detectada!',
          `${data.bank}: R$ ${data.amount.toFixed(2).replace('.', ',')}\n"${data.description}"`,
          [{ text: 'Ok' }]
        );
      } catch (e) {
        // Silencia — não incomoda o usuário com erro
      }
    });

    return () => {
      listenerRef.current?.remove();
    };
  }, []);
}
