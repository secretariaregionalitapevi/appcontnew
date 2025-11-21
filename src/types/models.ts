export interface Comum {
  id: string;
  nome: string;
  created_at?: string;
  updated_at?: string;
}

export interface Cargo {
  id: string;
  nome: string;
  is_musical: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Instrumento {
  id: string;
  nome: string;
  created_at?: string;
  updated_at?: string;
}

export interface Pessoa {
  id: string;
  nome: string;
  sobrenome: string;
  nome_completo?: string; // Nome completo para exibição na lista
  comum_id: string;
  cargo_id: string;
  cargo_real?: string; // Cargo real da pessoa no banco de dados (ex: "Instrutora", "Examinadora")
  instrumento_id?: string | null;
  cidade?: string; // Cidade da pessoa
  classe_organista?: string; // Classe da organista (do banco de dados)
  ativo: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RegistroPresenca {
  id?: string;
  pessoa_id: string;
  comum_id: string;
  cargo_id: string;
  instrumento_id?: string | null;
  classe_organista?: string; // Classe da organista (ex: 1ª, 2ª, 3ª)
  local_ensaio: string;
  data_hora_registro: string;
  usuario_responsavel: string;
  status_sincronizacao: 'pending' | 'synced';
  created_at?: string;
  updated_at?: string;
}

export interface Usuario {
  id: string;
  email: string;
  nome?: string;
  role?: string; // 'user' | 'master' | 'admin'
}

export interface LocalEnsaio {
  id: string;
  nome: string;
}
