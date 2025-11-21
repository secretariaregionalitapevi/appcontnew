import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Usuario } from '../types/models';
import { userProfileService } from './userProfileService';

// Polyfill para web
const getSecureStore = () => {
  if (Platform.OS === 'web') {
    return {
      getItemAsync: async (key: string) => {
        try {
          return localStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItemAsync: async (key: string, value: string) => {
        try {
          localStorage.setItem(key, value);
        } catch (error) {
          console.warn('Erro ao salvar no localStorage:', error);
        }
      },
      deleteItemAsync: async (key: string) => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn('Erro ao remover do localStorage:', error);
        }
      },
    };
  }
  return SecureStore;
};

const SESSION_KEY = 'supabase_session';
const USER_KEY = 'supabase_user';

const secureStore = getSecureStore();

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
}

export const authService = {
  async signUp(
    email: string,
    password: string,
    nome?: string
  ): Promise<{ user: Usuario | null; error: Error | null }> {
    if (!isSupabaseConfigured() || !supabase) {
      console.error('❌ Supabase não configurado no signUp');
      return {
        user: null,
        error: new Error(
          'Supabase não está configurado. Configure as variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY.'
        ),
      };
    }

    try {
      console.log('🔐 Chamando supabase.auth.signUp...');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nome: nome || '',
            full_name: nome || '',
          },
        },
      });

      console.log('📡 Resposta do Supabase:', {
        hasUser: !!data.user,
        hasSession: !!data.session,
        error: error?.message,
      });

      if (error) {
        console.error('❌ Erro do Supabase:', error);
        return { user: null, error };
      }

      // Se não há erro mas também não há user, pode ser que o email precise ser confirmado
      if (!data.user) {
        console.warn('⚠️ Usuário criado mas precisa confirmar email');
        return {
          user: null,
          error: new Error('Um email de confirmação foi enviado. Verifique sua caixa de entrada.'),
        };
      }

      if (data.user) {
        console.log('✅ Usuário criado com sucesso:', data.user.id);
        console.log('📝 Nome recebido no signUp:', nome);
        console.log('📋 Metadados do usuário:', data.user.user_metadata);

        // Priorizar o nome passado como parâmetro, depois metadados, depois email
        const nomeFinal =
          nome ||
          data.user.user_metadata?.nome ||
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          undefined;

        console.log('✅ Nome final a ser salvo:', nomeFinal);

        // Aguardar um pouco para garantir que o trigger do Supabase criou o perfil
        await new Promise(resolve => setTimeout(resolve, 500));

        // Criar ou atualizar perfil na tabela profiles
        const { profile, error: profileError } = await userProfileService.createOrUpdateProfile(
          data.user.id,
          data.user.email || '',
          nomeFinal,
          data.user.user_metadata?.role || 'user'
        );

        if (profileError) {
          console.warn('⚠️ Erro ao criar perfil, mas usuário foi criado:', profileError);
        } else if (profile) {
          console.log('✅ Perfil criado/atualizado com sucesso:', {
            id: profile.id,
            email: profile.email,
            nome: profile.nome || profile.name,
            role: profile.role,
          });
        }

        // Usar dados do perfil se disponível, senão usar dados do auth
        let user: Usuario;

        if (profile) {
          user = userProfileService.profileToUsuario(profile)!;
          console.log('✅ Usuário criado a partir do perfil:', {
            id: user.id,
            email: user.email,
            nome: user.nome,
            role: user.role,
          });
        } else {
          user = {
            id: data.user.id,
            email: data.user.email || '',
            nome: nomeFinal || undefined,
            role: data.user.user_metadata?.role || 'user',
          };
          console.log('⚠️ Usuário criado sem perfil (usando metadados):', {
            id: user.id,
            email: user.email,
            nome: user.nome,
            role: user.role,
          });
        }

        if (data.session) {
          await this.saveSession(data.session);
          await secureStore.setItemAsync(USER_KEY, JSON.stringify(user));
        }

        return { user, error: null };
      }

      return { user: null, error: new Error('Erro ao criar conta') };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  },

  async signIn(
    email: string,
    password: string
  ): Promise<{ user: Usuario | null; error: Error | null }> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        user: null,
        error: new Error(
          'Supabase não está configurado. Configure as variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY.'
        ),
      };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { user: null, error };
      }

      if (data.user && data.session) {
        // Buscar perfil do usuário na tabela profiles
        const { profile, error: profileError } = await userProfileService.getProfile(data.user.id);

        if (profileError) {
          console.warn('Erro ao buscar perfil, usando dados do auth:', profileError);
        }

        // Usar dados do perfil se disponível, senão usar dados do auth
        let user: Usuario;

        if (profile) {
          user = userProfileService.profileToUsuario(profile)!;
          console.log('✅ Usuário carregado do perfil:', {
            id: user.id,
            email: user.email,
            nome: user.nome,
            role: user.role,
            isMaster: user.role === 'master' || user.role === 'admin',
          });
        } else {
          // Fallback: usar dados do auth ou metadados
          const nomeFromMetadata =
            data.user.user_metadata?.nome ||
            data.user.user_metadata?.full_name ||
            data.user.user_metadata?.name;

          // Normalizar role do metadata também
          let roleFromMetadata = data.user.user_metadata?.role || 'user';
          if (roleFromMetadata) {
            roleFromMetadata = String(roleFromMetadata).toLowerCase().trim();
          }

          user = {
            id: data.user.id,
            email: data.user.email || '',
            nome: nomeFromMetadata || undefined,
            role: roleFromMetadata,
          };

          console.log('⚠️ Usuário carregado do auth (sem perfil):', {
            id: user.id,
            email: user.email,
            nome: user.nome,
            role: user.role,
            roleFromMetadata: data.user.user_metadata?.role,
            isMaster: user.role === 'master' || user.role === 'admin',
          });

          // Se não há perfil mas temos sessão, tentar criar/atualizar o perfil
          // Isso garante que o role seja salvo corretamente
          if (data.session) {
            try {
              const { profile: newProfile } = await userProfileService.createOrUpdateProfile(
                data.user.id,
                data.user.email || '',
                nomeFromMetadata,
                roleFromMetadata
              );
              if (newProfile) {
                const updatedUser = userProfileService.profileToUsuario(newProfile);
                if (updatedUser) {
                  user = updatedUser;
                  console.log('✅ Perfil criado/atualizado após login:', {
                    id: user.id,
                    role: user.role,
                    isMaster: user.role === 'master' || user.role === 'admin',
                  });
                }
              }
            } catch (error) {
              console.warn('⚠️ Não foi possível criar/atualizar perfil após login:', error);
            }
          }
        }

        await this.saveSession(data.session);
        await secureStore.setItemAsync(USER_KEY, JSON.stringify(user));

        return { user, error: null };
      }

      return { user: null, error: new Error('Erro ao fazer login') };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  },

  async signOut(): Promise<void> {
    if (isSupabaseConfigured() && supabase) {
      await supabase.auth.signOut();
    }
    await secureStore.deleteItemAsync(SESSION_KEY);
    await secureStore.deleteItemAsync(USER_KEY);
  },

  async getCurrentUser(): Promise<Usuario | null> {
    try {
      // Primeiro tentar buscar do secure store
      const userStr = await secureStore.getItemAsync(USER_KEY);
      if (userStr) {
        try {
          const cachedUser = JSON.parse(userStr);

          // Se temos sessão válida, buscar perfil atualizado do Supabase
          const session = await this.getSession();
          if (session && isSupabaseConfigured() && supabase) {
            try {
              const {
                data: { user: authUser },
              } = await supabase.auth.getUser();
              if (authUser) {
                const { profile, error: profileError } = await userProfileService.getProfile(
                  authUser.id
                );

                if (profileError) {
                  console.warn('Erro ao buscar perfil atualizado:', profileError);
                }

                if (profile) {
                  const updatedUser = userProfileService.profileToUsuario(profile);
                  if (updatedUser) {
                    console.log('✅ Perfil atualizado carregado:', {
                      id: updatedUser.id,
                      email: updatedUser.email,
                      nome: updatedUser.nome,
                      role: updatedUser.role,
                    });
                    await secureStore.setItemAsync(USER_KEY, JSON.stringify(updatedUser));
                    return updatedUser;
                  }
                } else {
                  console.warn('⚠️ Perfil não encontrado, usando cache');
                }
              }
            } catch (error) {
              console.warn('Erro ao buscar perfil atualizado, usando cache:', error);
            }
          }

          console.log('📦 Usando usuário do cache:', {
            id: cachedUser.id,
            email: cachedUser.email,
            nome: cachedUser.nome,
            role: cachedUser.role,
          });

          return cachedUser;
        } catch (parseError) {
          console.warn('Erro ao fazer parse do usuário:', parseError);
          // Limpar dados corrompidos
          await secureStore.deleteItemAsync(USER_KEY);
          return null;
        }
      }
      return null;
    } catch (error) {
      console.warn('Erro ao obter usuário atual:', error);
      return null;
    }
  },

  async getSession(): Promise<AuthSession | null> {
    try {
      const sessionStr = await secureStore.getItemAsync(SESSION_KEY);
      if (sessionStr) {
        try {
          return JSON.parse(sessionStr);
        } catch (parseError) {
          console.warn('Erro ao fazer parse da sessão:', parseError);
          // Limpar dados corrompidos
          await secureStore.deleteItemAsync(SESSION_KEY);
          return null;
        }
      }
      return null;
    } catch (error) {
      console.warn('Erro ao obter sessão:', error);
      return null;
    }
  },

  async saveSession(session: any): Promise<void> {
    const authSession: AuthSession = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
    };
    await secureStore.setItemAsync(SESSION_KEY, JSON.stringify(authSession));

    // Configurar o token no cliente Supabase se estiver configurado
    if (isSupabaseConfigured() && supabase) {
      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    }
  },

  async refreshSession(): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) {
      return false;
    }

    try {
      const session = await this.getSession();
      if (!session) {
        return false;
      }

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: session.refresh_token,
      });

      if (error || !data.session) {
        return false;
      }

      await this.saveSession(data.session);
      return true;
    } catch {
      return false;
    }
  },

  async isSessionValid(): Promise<boolean> {
    const session = await this.getSession();
    if (!session) {
      return false;
    }

    if (session.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      if (now >= session.expires_at) {
        // Tentar renovar
        return await this.refreshSession();
      }
    }

    return true;
  },
};
