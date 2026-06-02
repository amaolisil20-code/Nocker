import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const SECURITY_PREFS_KEY = '@security_prefs';
const LOCK_TIMEOUT_MS = 30 * 1000; // 30 segundos em background

export function useAppLock(isLoggedIn: boolean) {
  const [locked, setLocked] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  const backgroundTime = useRef<number | null>(null);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  const getSecurityPrefs = async () => {
    try {
      const raw = await AsyncStorage.getItem(SECURITY_PREFS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const isBiometricEnabled = async () => {
    const prefs = await getSecurityPrefs();
    return prefs.biometricsEnabled === true || prefs.faceIdEnabled === true;
  };

  const authenticate = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        // Dispositivo não tem biometria configurada — desbloqueia automaticamente
        setLocked(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Entre no Nocker',
        fallbackLabel: 'Usar PIN',
        disableDeviceFallback: false,
        cancelLabel: 'Cancelar',
      });

      if (result.success) {
        setLocked(false);
        setAuthFailed(false);
      } else {
        setAuthFailed(true);
      }
    } catch {
      setLocked(false); // Em caso de erro, não trava o app
    }
  };

  // Verifica ao fazer login
  useEffect(() => {
    if (!isLoggedIn) {
      setLocked(false);
      return;
    }

    (async () => {
      const enabled = await isBiometricEnabled();
      if (enabled) {
        setLocked(true);
        await authenticate();
      }
    })();
  }, [isLoggedIn]);

  // Verifica quando o app volta do background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (appState.current === 'active' && nextState === 'background') {
        backgroundTime.current = Date.now();
      }

      if (
        appState.current !== 'active' &&
        nextState === 'active' &&
        isLoggedIn
      ) {
        const elapsed = backgroundTime.current
          ? Date.now() - backgroundTime.current
          : LOCK_TIMEOUT_MS + 1;

        if (elapsed >= LOCK_TIMEOUT_MS) {
          const enabled = await isBiometricEnabled();
          if (enabled) {
            setLocked(true);
            await authenticate();
          }
        }
      }

      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [isLoggedIn]);

  return { locked, authFailed, authenticate };
}
