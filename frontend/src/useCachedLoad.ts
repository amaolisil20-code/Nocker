import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { staleWhileRevalidate } from './cache';

/**
 * Hook que substitui o padrão:
 *   useFocusEffect(useCallback(() => { load(); }, []));
 *
 * Por:
 *   useCachedLoad('chave', fetcher, setter);
 *
 * Comportamento:
 * - Na primeira abertura: mostra cache instantaneamente + atualiza em background
 * - Nas aberturas seguintes (voltar para a tela): sempre busca dados frescos
 */
export function useCachedLoad<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  onData: (data: T) => void,
) {
  const isFirstLoad = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        // Primeira abertura: mostra cache e atualiza em background
        staleWhileRevalidate(cacheKey, fetcher, onData).catch(() => {
          // Se cache vazio e API falhou, tenta de novo silenciosamente
          fetcher().then(onData).catch(() => {});
        });
      } else {
        // Voltou para a tela: atualiza dados frescos
        fetcher().then(onData).catch(() => {});
      }
    }, [])
  );
}
