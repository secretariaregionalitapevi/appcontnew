import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Usuario } from '../types/models';

export interface UserProfile {
  id: string;
  email: string;
  name?: string; // Campo principal na tabela profiles
  first_name?: string; // Primeiro nome
  last_name?: string; // Último nome
  role?: string;
  created_at?: string;
  updated_at?: string;
  // Campos legados (para compatibilidade)
  nome?: string;
}

export const userProfileService = {
  /**
   * Criar ou atualizar perfil do usuário na tabela profiles
   */
  async createOrUpdateProfile(
    userId: string,
    email: string,
    nome?: string,
    role?: string
  ): Promise<{ profile: UserProfile | null; error: Error | null }> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        profile: null,
        error: new Error(
          'Supabase não está configurado. Configure as variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY.'
        ),
      };
    }

    try {
      // Usar 'name' como campo principal na tabela profiles
      const result = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            email,
            name: nome || null,
            role: role || 'user',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .select()
        .single();

      if (result.error) {
        console.error('Erro ao criar/atualizar perfil:', result.error);
        return { profile: null, error: result.error };
      }

      return { profile: result.data, error: null };
    } catch (error) {
      console.error('Erro ao criar/atualizar perfil:', error);
      return { profile: null, error: error as Error };
    }
  },

  /**
   * Buscar perfil do usuário por ID
   */
  async getProfile(userId: string): Promise<{ profile: UserProfile | null; error: Error | null }> {
    if (!isSupabaseConfigured() || !supabase) {
      return {
        profile: null,
        error: new Error(
          'Supabase não está configurado. Configure as variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY.'
        ),
      };
    }

    try {
      // 🚨 CORREÇÃO: Buscar campos corretos da tabela profiles (name, first_name, last_name, role)
      const result = await supabase
        .from('profiles')
        .select('id, email, name, first_name, last_name, role, created_at, updated_at')
        .eq('id', userId)
        .single();

      if (result.error) {
        // Se o perfil não existe, não é um erro crítico
        if (result.error.code === 'PGRST116') {
          console.warn('⚠️ Perfil não encontrado para usuário:', userId);
          return { profile: null, error: null };
        }
        console.error('❌ Erro ao buscar perfil:', result.error);
        return { profile: null, error: result.error };
      }

      if (result.data) {
        // Combinar first_name e last_name se disponíveis
        let fullName = result.data.name;
        if (!fullName && result.data.first_name) {
          fullName = result.data.last_name 
            ? `${result.data.first_name} ${result.data.last_name}`.trim()
            : result.data.first_name;
        }

        console.log('✅ Perfil encontrado:', {
          id: result.data.id,
          email: result.data.email,
          name: fullName || 'não definido',
          first_name: result.data.first_name,
          last_name: result.data.last_name,
          role: result.data.role || 'não definido',
        });
      }

      return { profile: result.data, error: null };
    } catch (error) {
      console.error('❌ Erro ao buscar perfil:', error);
      return { profile: null, error: error as Error };
    }
  },

  /**
   * Converter UserProfile para Usuario
   * Combina first_name e last_name se disponíveis, senão usa name
   */
  profileToUsuario(profile: UserProfile | null): Usuario | null {
    if (!profile) return null;

    // 🚨 CORREÇÃO: Combinar first_name e last_name se disponíveis
    let nome: string | undefined;
    
    if (profile.first_name) {
      // Se tem first_name, combinar com last_name se disponível
      nome = profile.last_name 
        ? `${profile.first_name} ${profile.last_name}`.trim()
        : profile.first_name;
    } else if (profile.name) {
      // Se não tem first_name, usar name
      nome = profile.name;
    } else if (profile.nome) {
      // Fallback para campo legado
      nome = profile.nome;
    }

    // Normalizar role: converter para lowercase e garantir que seja string
    let role = profile.role;
    if (role) {
      role = String(role).toLowerCase().trim();
    } else {
      role = 'user';
    }

    console.log('🔄 Convertendo perfil para Usuario:', {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      first_name: profile.first_name,
      last_name: profile.last_name,
      nome: nome,
      roleOriginal: profile.role,
      roleNormalizado: role,
      isMaster: role === 'master' || role === 'admin',
    });

    return {
      id: profile.id,
      email: profile.email,
      nome: nome, // Pode ser undefined se não houver nome
      role: role, // Role normalizado
    };
  },
};
