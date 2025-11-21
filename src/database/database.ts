import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

let db: SQLite.SQLiteDatabase | null = null;

// Polyfill para web usando IndexedDB (simplificado)
const getWebDatabase = async (): Promise<any> => {
  if (Platform.OS !== 'web') {
    throw new Error('getWebDatabase só deve ser usado no web');
  }

  // Para web, vamos usar uma implementação simplificada com localStorage
  // Em produção, considere usar uma biblioteca como Dexie.js para IndexedDB
  return {
    execAsync: async (sql: string) => {
      console.warn('SQLite não suportado no web. Use modo online ou implemente IndexedDB.');
    },
    runAsync: async (sql: string, params: any[]) => {
      console.warn('SQLite não suportado no web. Use modo online ou implemente IndexedDB.');
    },
    getAllAsync: async (sql: string, params?: any[]) => {
      console.warn('SQLite não suportado no web. Use modo online ou implemente IndexedDB.');
      return [];
    },
    getFirstAsync: async (sql: string, params?: any[]) => {
      console.warn('SQLite não suportado no web. Use modo online ou implemente IndexedDB.');
      return null;
    },
    withTransactionAsync: async (callback: () => Promise<void>) => {
      await callback();
    },
  };
};

let isInitializing = false;

export const getDatabase = async (): Promise<SQLite.SQLiteDatabase | any> => {
  if (Platform.OS === 'web') {
    return getWebDatabase();
  }

  if (!db && !isInitializing) {
    isInitializing = true;
    try {
      db = await SQLite.openDatabaseAsync('sac.db');
      await initializeDatabase(db);
    } catch (error) {
      console.error('Erro ao inicializar banco de dados:', error);
      isInitializing = false;
      throw error;
    }
    isInitializing = false;
  }

  if (!db) {
    throw new Error('Banco de dados não inicializado');
  }

  return db;
};

const initializeDatabase = async (database: SQLite.SQLiteDatabase): Promise<void> => {
  try {
    // Tabela de comuns
    await database.execAsync(`
    CREATE TABLE IF NOT EXISTS comuns (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );
  `);

    // Tabela de cargos
    await database.execAsync(`
    CREATE TABLE IF NOT EXISTS cargos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      is_musical INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
  `);

    // Tabela de instrumentos
    await database.execAsync(`
    CREATE TABLE IF NOT EXISTS instrumentos (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );
  `);

    // Tabela de pessoas
    await database.execAsync(`
    CREATE TABLE IF NOT EXISTS pessoas (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      sobrenome TEXT NOT NULL,
      comum_id TEXT NOT NULL,
      cargo_id TEXT NOT NULL,
      instrumento_id TEXT,
      ativo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (comum_id) REFERENCES comuns(id),
      FOREIGN KEY (cargo_id) REFERENCES cargos(id),
      FOREIGN KEY (instrumento_id) REFERENCES instrumentos(id)
    );
  `);

    // Tabela de registros de presença
    await database.execAsync(`
    CREATE TABLE IF NOT EXISTS registros_presenca (
      id TEXT PRIMARY KEY,
      pessoa_id TEXT NOT NULL,
      comum_id TEXT NOT NULL,
      cargo_id TEXT NOT NULL,
      instrumento_id TEXT,
      local_ensaio TEXT NOT NULL,
      data_hora_registro TEXT NOT NULL,
      usuario_responsavel TEXT NOT NULL,
      status_sincronizacao TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (pessoa_id) REFERENCES pessoas(id),
      FOREIGN KEY (comum_id) REFERENCES comuns(id),
      FOREIGN KEY (cargo_id) REFERENCES cargos(id)
    );
  `);

    // Índices para melhor performance
    await database.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_pessoas_comum_cargo ON pessoas(comum_id, cargo_id);
      CREATE INDEX IF NOT EXISTS idx_pessoas_comum_cargo_instrumento ON pessoas(comum_id, cargo_id, instrumento_id);
      CREATE INDEX IF NOT EXISTS idx_registros_status ON registros_presenca(status_sincronizacao);
    `);
  } catch (error) {
    console.error('Erro ao criar tabelas do banco de dados:', error);
    throw error;
  }
};
