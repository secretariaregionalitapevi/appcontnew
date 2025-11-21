// Utilitário de logging para debug
export const logger = {
  log: (...args: any[]) => {
    if (__DEV__) {
      console.log('[SAC]', ...args);
    }
  },
  error: (...args: any[]) => {
    console.error('[SAC ERROR]', ...args);
  },
  warn: (...args: any[]) => {
    if (__DEV__) {
      console.warn('[SAC WARN]', ...args);
    }
  },
};
