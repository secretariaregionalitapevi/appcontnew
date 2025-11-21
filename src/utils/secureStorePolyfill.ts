// Polyfill para expo-secure-store no web
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// No web, usar localStorage como fallback
const webSecureStore = {
  async getItemAsync(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },

  async setItemAsync(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.warn('Erro ao salvar no localStorage:', error);
      }
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },

  async deleteItemAsync(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn('Erro ao remover do localStorage:', error);
      }
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

export default webSecureStore;
