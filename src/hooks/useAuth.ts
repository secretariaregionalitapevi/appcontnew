import { useState, useEffect } from 'react';
import { authService } from '../services/authService';
import { Usuario } from '../types/models';
import { useInactivityTimeout } from './useInactivityTimeout';

export const useAuth = () => {
  const [user, setUser] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  // Timeout de inatividade: 1 hora (3600000 ms)
  const handleInactivityTimeout = async () => {
    console.log('⏰ Timeout de inatividade - fazendo logout');
    await signOut();
  };

  useInactivityTimeout({
    timeout: 3600000, // 1 hora
    onTimeout: handleInactivityTimeout,
    enabled: !!user, // Só ativar se houver usuário logado
  });

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);

      // Se não houver usuário autenticado, garantir que está null
      if (!currentUser) {
        setUser(null);
      }
    } catch (error) {
      console.error('Erro ao verificar usuário:', error);
      setUser(null);
    } finally {
      // Sempre definir loading como false, mesmo se houver erro
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { user: signedUser, error } = await authService.signIn(email, password);
    if (signedUser) {
      setUser(signedUser);
    }
    return { user: signedUser, error };
  };

  const signUp = async (email: string, password: string, nome?: string) => {
    const { user: signedUser, error } = await authService.signUp(email, password, nome);
    if (signedUser) {
      setUser(signedUser);
    }
    return { user: signedUser, error };
  };

  const signOut = async () => {
    try {
      await authService.signOut();
      setUser(null);
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
      // Mesmo com erro, limpar o estado do usuário
      setUser(null);
    }
  };

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    isAuthenticated: !!user,
  };
};
