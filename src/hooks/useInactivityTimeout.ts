import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

interface UseInactivityTimeoutOptions {
  timeout: number; // em milissegundos (1 hora = 3600000)
  onTimeout: () => void;
  enabled?: boolean;
}

/**
 * Hook para detectar inatividade e executar callback após timeout
 * Reseta o timer quando há interação do usuário ou quando o app volta ao foreground
 */
export const useInactivityTimeout = ({
  timeout,
  onTimeout,
  enabled = true,
}: UseInactivityTimeoutOptions) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const resetTimeout = useCallback(() => {
    // Limpar timeout anterior
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Criar novo timeout se estiver habilitado
    if (enabled) {
      timeoutRef.current = setTimeout(() => {
        console.log('⏰ Timeout de inatividade atingido');
        onTimeout();
      }, timeout);
    }
  }, [timeout, onTimeout, enabled]);

  useEffect(() => {
    if (!enabled) {
      // Limpar timeout se desabilitado
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Iniciar timeout ao montar
    resetTimeout();

    // Listener para mudanças de estado do app
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App voltou ao foreground - resetar timeout
        console.log('📱 App voltou ao foreground - resetando timeout');
        resetTimeout();
      }
      appStateRef.current = nextAppState;
    });

    // Listener para eventos de interação (apenas web)
    let cleanupWeb: (() => void) | undefined;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

      const handleActivity = () => {
        resetTimeout();
      };

      events.forEach(event => {
        window.addEventListener(event, handleActivity, true);
      });

      cleanupWeb = () => {
        events.forEach(event => {
          window.removeEventListener(event, handleActivity, true);
        });
      };
    }

    return () => {
      subscription.remove();
      if (cleanupWeb) {
        cleanupWeb();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, resetTimeout]);

  return {
    resetTimeout,
  };
};
