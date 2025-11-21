import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Usuario } from '../types/models';

export interface UserProfile {
  id: string;
  email: string;
  nome?: string;
  name?: string; // Campo alternativo (alguns schemas usam 'name' em vez de 'nome')
  role?: string;
  created_at?: string;
  updated_at?: string;
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
      // Tentar atualizar com 'nome' primeiro, se falhar tenta com 'name'
      let data, error;

      try {
        const result = await supabase
          .from('profiles')
          .upsert(
            {
              id: userId,
              email,
              nome: nome || null,
              role: role || 'user',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          )
          .select()
          .single();
        data = result.data;
        error = result.error;
      } catch (e) {
        // Se falhar, tentar com 'name' (campo alternativo)
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
        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('Erro ao criar/atualizar perfil:', error);
        return { profile: null, error };
      }

      return { profile: data, error: null };
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
      // Buscar apenas campos que existem (nome, não name)
      // Tentar primeiro com 'nome', se falhar tenta sem especificar campos
      let data, error;

      try {
        // Primeira tentativa: buscar com 'nome' (campo correto)
        const result = await supabase
          .from('profiles')
          .select('id, email, nome, role, created_at, updated_at')
          .eq('id', userId)
          .single();
        data = result.data;
        error = result.error;
      } catch (e) {
        // Se falhar, tentar buscar todos os campos disponíveis
        const result = await supabase.from('profiles').select('*').eq('id', userId).single();
        data = result.data;
        error = result.error;
      }

      if (error) {
        // Se o perfil não existe, não é um erro crítico
        if (error.code === 'PGRST116') {
          console.warn('⚠️ Perfil não encontrado para usuário:', userId);
          return { profile: null, error: null };
        }
        console.error('❌ Erro ao buscar perfil:', error);
        return { profile: null, error };
      }

      if (data) {
        console.log('✅ Perfil encontrado:', {
          id: data.id,
          email: data.email,
          nome: data.nome || data.name || 'não definido',
          role: data.role || 'não definido',
          roleType: typeof data.role,
        });
      }

      return { profile: data, error: null };
    } catch (error) {
      console.error('❌ Erro ao buscar perfil:', error);
      return { profile: null, error: error as Error };
    }
  },

  /**
   * Converter UserProfile para Usuario
   */
  profileToUsuario(profile: UserProfile | null): Usuario | null {
    if (!profile) return null;

    // Priorizar 'nome', depois 'name', depois undefined
    const nome = profile.nome || profile.name || undefined;

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
