/**
 * Sistema robusto de storage com fallbacks para todas as plataformas
 * Especialmente otimizado para Xiaomi/MIUI e outras plataformas problemáticas
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { isXiaomiDevice, getDeviceInfo } from './deviceDetection';

// Cache em memória como último recurso
const memoryStorage: { [key: string]: string } = {};
let useMemoryStorage = false;

/**
 * Testa se localStorage/AsyncStorage está funcionando corretamente
 */
const testStorage = async (): Promise<boolean> => {
  if (Platform.OS === 'web') {
    // Teste para web (localStorage)
    try {
      const testKey = `__storage_test_${Date.now()}`;
      const testValue = `test_${Math.random()}`;
      
      localStorage.setItem(testKey, testValue);
      const retrieved = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      
      if (retrieved !== testValue) {
        console.warn('⚠️ localStorage falhou no teste de escrita/leitura');
        return false;
      }
      
      // Teste de quota (algumas versões MIUI têm problemas)
      try {
        const largeValue = 'x'.repeat(1024 * 1024); // 1MB
        localStorage.setItem('__quota_test', largeValue);
        localStorage.removeItem('__quota_test');
      } catch (quotaError: any) {
        if (quotaError.name === 'QuotaExceededError' || quotaError.code === 22) {
          // Quota OK, apenas pequena
          console.log('ℹ️ localStorage tem quota limitada, mas funciona');
        } else {
          console.warn('⚠️ localStorage falhou no teste de quota:', quotaError);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.warn('⚠️ localStorage não está disponível:', error);
      return false;
    }
  } else {
    // Teste para mobile (AsyncStorage)
    try {
      const testKey = `__storage_test_${Date.now()}`;
      const testValue = `test_${Math.random()}`;
      
      await AsyncStorage.setItem(testKey, testValue);
      const retrieved = await AsyncStorage.getItem(testKey);
      await AsyncStorage.removeItem(testKey);
      
      if (retrieved !== testValue) {
        console.warn('⚠️ AsyncStorage falhou no teste de escrita/leitura');
        return false;
      }
      
      return true;
    } catch (error) {
      console.warn('⚠️ AsyncStorage não está disponível:', error);
      return false;
    }
  }
};

/**
 * Inicializa o sistema de storage e testa disponibilidade
 */
export const initializeStorage = async (): Promise<void> => {
  const deviceInfo = getDeviceInfo();
  
  // Para Xiaomi/MIUI, fazer teste mais rigoroso
  if (isXiaomiDevice()) {
    console.log('📱 Dispositivo Xiaomi/Redmi detectado, testando storage...');
    const storageWorks = await testStorage();
    
    if (!storageWorks) {
      console.warn('⚠️ Storage não funciona corretamente, usando cache em memória');
      useMemoryStorage = true;
    } else {
      console.log('✅ Storage funciona corretamente no dispositivo Xiaomi');
    }
  } else {
    // Para outras plataformas, teste básico
    const storageWorks = await testStorage();
    if (!storageWorks) {
      console.warn('⚠️ Storage não funciona, usando cache em memória');
      useMemoryStorage = true;
    }
  }
};

/**
 * Obtém um item do storage com fallback robusto
 */
export const robustGetItem = async (key: string): Promise<string | null> => {
  if (useMemoryStorage) {
    return memoryStorage[key] || null;
  }

  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  } catch (error) {
    console.warn(`⚠️ Erro ao ler ${key} do storage, tentando cache em memória:`, error);
    
    // Fallback para memória
    const memoryValue = memoryStorage[key];
    if (memoryValue) {
      return memoryValue;
    }
    
    // Se é Xiaomi e falhou, ativar modo memória
    if (isXiaomiDevice()) {
      useMemoryStorage = true;
      console.warn('⚠️ Ativando modo memória devido a falha no storage (Xiaomi)');
    }
    
    return null;
  }
};

/**
 * Salva um item no storage com fallback robusto
 */
export const robustSetItem = async (key: string, value: string): Promise<void> => {
  if (useMemoryStorage) {
    memoryStorage[key] = value;
    return;
  }

  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
    
    // Também salvar em memória como backup
    memoryStorage[key] = value;
  } catch (error: any) {
    console.warn(`⚠️ Erro ao salvar ${key} no storage:`, error);
    
    // Se erro de quota, tentar limpar cache antigo
    if (error.name === 'QuotaExceededError' || error.code === 22) {
      console.warn('⚠️ Quota excedida, limpando cache antigo...');
      try {
        await clearOldCache();
        // Tentar novamente
        if (Platform.OS === 'web') {
          localStorage.setItem(key, value);
        } else {
          await AsyncStorage.setItem(key, value);
        }
        memoryStorage[key] = value;
        return;
      } catch (retryError) {
        console.warn('⚠️ Falha ao limpar cache, usando memória');
      }
    }
    
    // Fallback para memória
    memoryStorage[key] = value;
    
    // Se é Xiaomi e falhou múltiplas vezes, ativar modo memória
    if (isXiaomiDevice()) {
      useMemoryStorage = true;
      console.warn('⚠️ Ativando modo memória devido a falhas no storage (Xiaomi)');
    }
  }
};

/**
 * Remove um item do storage
 */
export const robustRemoveItem = async (key: string): Promise<void> => {
  // Remover de ambos (storage e memória)
  delete memoryStorage[key];
  
  if (!useMemoryStorage) {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(key);
      } else {
        await AsyncStorage.removeItem(key);
      }
    } catch (error) {
      console.warn(`⚠️ Erro ao remover ${key} do storage:`, error);
    }
  }
};

/**
 * Limpa cache antigo (itens com mais de 7 dias)
 */
const clearOldCache = async (): Promise<void> => {
  try {
    const keys = Platform.OS === 'web' 
      ? Object.keys(localStorage)
      : await AsyncStorage.getAllKeys();
    
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 dias
    
    for (const key of keys) {
      if (key.startsWith('cache_') || key.startsWith('cached_')) {
        try {
          const value = Platform.OS === 'web'
            ? localStorage.getItem(key)
            : await AsyncStorage.getItem(key);
          
          if (value) {
            try {
              const parsed = JSON.parse(value);
              if (parsed.timestamp && (now - parsed.timestamp > maxAge)) {
                await robustRemoveItem(key);
              }
            } catch {
              // Se não tem timestamp, manter
            }
          }
        } catch (error) {
          // Ignorar erros individuais
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ Erro ao limpar cache antigo:', error);
  }
};

/**
 * Obtém todos as chaves do storage
 */
export const robustGetAllKeys = async (): Promise<string[]> => {
  if (useMemoryStorage) {
    return Object.keys(memoryStorage);
  }

  try {
    if (Platform.OS === 'web') {
      return Object.keys(localStorage);
    } else {
      return await AsyncStorage.getAllKeys();
    }
  } catch (error) {
    console.warn('⚠️ Erro ao obter chaves do storage:', error);
    return Object.keys(memoryStorage);
  }
};

/**
 * Limpa todo o storage (cuidado!)
 */
export const robustClear = async (): Promise<void> => {
  memoryStorage = {};
  
  if (!useMemoryStorage) {
    try {
      if (Platform.OS === 'web') {
        localStorage.clear();
      } else {
        await AsyncStorage.clear();
      }
    } catch (error) {
      console.warn('⚠️ Erro ao limpar storage:', error);
    }
  }
};


