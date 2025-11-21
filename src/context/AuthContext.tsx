import React, { createContext, useContext, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Usuario } from '../types/models';

interface AuthContextType {
  user: Usuario | null;
  loading: boolean;
  signIn: (
    email: string,
    password: string
  ) => Promise<{ user: Usuario | null; error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    nome?: string
  ) => Promise<{ user: Usuario | null; error: Error | null }>;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const auth = useAuth();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext deve ser usado dentro de AuthProvider');
  }
  return context;
};
