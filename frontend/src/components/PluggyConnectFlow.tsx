import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { api } from '../api';

interface PluggyConnectFlowProps {
  visible: boolean;
  userId: string;
  institutionName?: string;
  onSuccess: (itemId: string) => void;
  onClose: () => void;
  onError: (message: string) => void;
}

type WidgetMessage =
  | { type: 'success'; itemId?: string; item?: { id?: string; itemId?: string; item_id?: string } }
  | { type: 'error'; message?: string }
  | { type: 'close' };

// Enquanto o Nocker usa credenciais sandbox do Pluggy (antes da certificação
// de produção em Open Finance), esta env var precisa estar true para os
// bancos de teste do Pluggy aparecerem no widget. Ver EXPO_PUBLIC_OPEN_FINANCE_SANDBOX no .env.
const INCLUDE_SANDBOX = process.env.EXPO_PUBLIC_OPEN_FINANCE_SANDBOX === 'true';

function buildHtml(connectToken: string, institutionName?: string) {
  const title = institutionName ? `Conectando ${institutionName}` : 'Conectando conta';

  return `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background:
          radial-gradient(circle at top, rgba(59, 130, 246, 0.24), transparent 42%),
          linear-gradient(180deg, #07111f 0%, #091423 55%, #050b14 100%);
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #e5eefc;
        overflow: hidden;
      }
      .frame {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 18px;
        padding: 32px;
        box-sizing: border-box;
        text-align: center;
      }
      .title {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.03em;
        margin: 0;
      }
      .subtitle {
        font-size: 14px;
        line-height: 1.5;
        color: rgba(229, 238, 252, 0.72);
        max-width: 320px;
        margin: 0;
      }
      .spinner {
        width: 56px;
        height: 56px;
        border-radius: 999px;
        border: 4px solid rgba(255, 255, 255, 0.14);
        border-top-color: #60a5fa;
        animation: spin 0.85s linear infinite;
      }
      .badge {
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #93c5fd;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .widget-root {
        position: absolute;
        inset: 0;
      }
    </style>
    <script src="https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js"></script>
  </head>
  <body>
    <div class="frame">
      <div class="badge">Pluggy Connect</div>
      <h1 class="title">${title}</h1>
      <p class="subtitle">Finalize o login do banco. Quando o fluxo terminar, o app recebe o item automaticamente.</p>
      <div class="spinner" id="spinner"></div>
      <div id="widget" class="widget-root"></div>
    </div>
    <script>
      (function () {
        function send(payload) {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }

        function fail(message) {
          send({ type: 'error', message: message || 'Falha ao abrir o Pluggy Connect.' });
        }

        try {
          if (typeof PluggyConnect === 'undefined') {
            fail('Biblioteca PluggyConnect indisponível.');
            return;
          }

          var pluggyConnect = new PluggyConnect({
            connectToken: ${JSON.stringify(connectToken)},
            includeSandbox: ${JSON.stringify(INCLUDE_SANDBOX)},
            onOpen: function () {
              var spinner = document.getElementById('spinner');
              if (spinner) spinner.style.display = 'none';
            },
            onSuccess: function (itemData) {
              var item = itemData && itemData.item ? itemData.item : itemData;
              var itemId = item && (item.id || item.itemId || item.item_id);
              send({ type: 'success', itemId: itemId, item: item });
            },
            onError: function (error) {
              var message = (error && error.message) || 'Ocorreu um erro no Pluggy Connect.';
              send({ type: 'error', message: message });
            },
            onClose: function () {
              send({ type: 'close' });
            },
          });

          pluggyConnect.init();
        } catch (error) {
          fail((error && error.message) || 'Erro inesperado ao iniciar o widget.');
        }
      })();
    </script>
  </body>
</html>`;
}

export function PluggyConnectFlow({ visible, userId, institutionName, onSuccess, onClose, onError }: PluggyConnectFlowProps) {
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchToken() {
      if (!visible) {
        setConnectToken(null);
        setTokenError(null);
        setLoadingToken(false);
        return;
      }

      setLoadingToken(true);
      setTokenError(null);

      try {
        const data = await api.createOpenFinanceConnectToken(userId);
        if (!cancelled) {
          const token = data?.accessToken || data?.access_token || data?.token;
          if (!token) {
            throw new Error('O backend não retornou o Connect Token do Pluggy.');
          }
          setConnectToken(token);
        }
      } catch (error: any) {
        if (!cancelled) {
          const message = error?.message || 'Não foi possível gerar o Connect Token.';
          setTokenError(message);
          onError(message);
        }
      } finally {
        if (!cancelled) setLoadingToken(false);
      }
    }

    fetchToken();
    return () => {
      cancelled = true;
    };
  }, [visible, userId, onError]);

  const source = useMemo(() => {
    if (!connectToken) return undefined;
    return { html: buildHtml(connectToken, institutionName) };
  }, [connectToken, institutionName]);

  const handleMessage = (event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as WidgetMessage;
      if (payload.type === 'success') {
        const itemId = payload.itemId || payload.item?.id || payload.item?.itemId || payload.item?.item_id;
        if (!itemId) {
          onError('O Pluggy Connect não retornou o itemId.');
          return;
        }
        onSuccess(itemId);
        return;
      }
      if (payload.type === 'error') {
        onError(payload.message || 'Erro no Pluggy Connect.');
        return;
      }
      if (payload.type === 'close') {
        onClose();
      }
    } catch {
      onError('Falha ao interpretar a resposta do Pluggy Connect.');
    }
  };

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.container}>
        {loadingToken || !source ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#60A5FA" />
            <Text style={styles.title}>{tokenError ? 'Falha ao preparar a conexão' : 'Preparando conexão segura'}</Text>
            <Text style={styles.subtitle}>{tokenError || 'Gerando o Connect Token do Pluggy...'}</Text>
            {!!tokenError && (
              <TouchableOpacity style={styles.button} onPress={onClose}>
                <Text style={styles.buttonText}>Fechar</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <WebView
            source={source}
            originWhitelist={["*"]}
            onMessage={handleMessage}
            onError={() => onError('Falha ao carregar o Pluggy Connect.')}
            javaScriptEnabled
            domStorageEnabled
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loaderWrap}>
                <ActivityIndicator size="large" color="#60A5FA" />
                <Text style={styles.title}>Abrindo Pluggy Connect</Text>
                <Text style={styles.subtitle}>Aguarde só um instante.</Text>
              </View>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#06101d',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  title: {
    color: '#F8FBFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(248, 251, 255, 0.72)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  buttonText: {
    color: '#F8FBFF',
    fontWeight: '700',
  },
});
