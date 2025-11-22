import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { robustGetItem, robustSetItem, robustRemoveItem, robustGetAllKeys } from '../utils/robustStorage';

let db: SQLite.SQLiteDatabase | null = null;

// Cache em memória para web (quando IndexedDB não está disponível)
const webMemoryCache: {
  [table: string]: any[];
} = {};

// Polyfill robusto para web usando IndexedDB com fallback para localStorage
const getWebDatabase = async (): Promise<any> => {
  if (Platform.OS !== 'web') {
    throw new Error('getWebDatabase só deve ser usado no web');
  }

  // Verificar se IndexedDB está disponível
  const hasIndexedDB = typeof window !== 'undefined' && 'indexedDB' in window;
  
  if (hasIndexedDB) {
    // Implementação com IndexedDB (mais robusta)
    return createIndexedDBDatabase();
  } else {
    // Fallback para localStorage (menos robusto mas funciona)
    console.warn('⚠️ IndexedDB não disponível, usando localStorage como fallback');
    return createLocalStorageDatabase();
  }
};

// Implementação usando IndexedDB
const createIndexedDBDatabase = (): any => {
  const DB_NAME = 'sac_db';
  const DB_VERSION = 1;
  let dbInstance: IDBDatabase | null = null;

  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Criar object stores para cada tabela
        if (!db.objectStoreNames.contains('comuns')) {
          db.createObjectStore('comuns', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cargos')) {
          db.createObjectStore('cargos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('instrumentos')) {
          db.createObjectStore('instrumentos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pessoas')) {
          db.createObjectStore('pessoas', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('registros_presenca')) {
          db.createObjectStore('registros_presenca', { keyPath: 'id' });
        }
      };
    });
  };

  const getStore = async (tableName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> => {
    if (!dbInstance) {
      await openDB();
    }
    if (!dbInstance) {
      throw new Error('Database not initialized');
    }
    const transaction = dbInstance.transaction([tableName], mode);
    return transaction.objectStore(tableName);
  };

  const dbMethods = {
    execAsync: async (sql: string) => {
      // Para CREATE TABLE, apenas garantir que o DB está aberto
      await openDB();
    },
    runAsync: async (sql: string, params: any[]) => {
      await openDB();
      // Implementação básica - INSERT/UPDATE/DELETE
      // Por enquanto, usar getAllAsync e manipular manualmente
    },
    getAllAsync: async (sql: string, params?: any[]): Promise<any[]> => {
      try {
        await openDB();
        
        // Parse básico de SELECT
        const match = sql.match(/FROM\s+(\w+)/i);
        if (!match) return [];
        
        const tableName = match[1];
        const store = await getStore(tableName, 'readonly');
        
        return new Promise((resolve, reject) => {
          const request = store.getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            let results = request.result || [];
            
            // Aplicar WHERE básico se houver params
            if (params && params.length > 0) {
              // Implementação básica de filtro
              // Por enquanto, retornar tudo
            }
            
            resolve(results);
          };
        });
      } catch (error) {
        console.warn('⚠️ Erro ao ler do IndexedDB, usando cache em memória:', error);
        return webMemoryCache[sql] || [];
      }
    },
    getFirstAsync: async (sql: string, params?: any[]): Promise<any | null> => {
      const allResults = await dbMethods.getAllAsync(sql, params);
      return allResults.length > 0 ? allResults[0] : null;
    },
    withTransactionAsync: async (callback: () => Promise<void>) => {
      await callback();
    },
  };

  return dbMethods;
};

// Implementação usando localStorage (fallback)
const createLocalStorageDatabase = (): any => {
  const getTableData = (tableName: string): any[] => {
    try {
      const data = localStorage.getItem(`db_${tableName}`);
      return data ? JSON.parse(data) : [];
    } catch {
      return webMemoryCache[tableName] || [];
    }
  };

  const saveTableData = (tableName: string, data: any[]): void => {
    try {
      localStorage.setItem(`db_${tableName}`, JSON.stringify(data));
      webMemoryCache[tableName] = data;
    } catch (error) {
      console.warn(`⚠️ Erro ao salvar tabela ${tableName}:`, error);
      webMemoryCache[tableName] = data;
    }
  };

  const dbMethods = {
    execAsync: async (sql: string) => {
      // CREATE TABLE - apenas inicializar estrutura
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
      if (match) {
        const tableName = match[1];
        if (!getTableData(tableName)) {
          saveTableData(tableName, []);
        }
      }
    },
    runAsync: async (sql: string, params: any[]) => {
      // INSERT/UPDATE/DELETE básico
      const insertMatch = sql.match(/INSERT OR REPLACE INTO (\w+)/i);
      const updateMatch = sql.match(/UPDATE (\w+) SET/i);
      const deleteMatch = sql.match(/DELETE FROM (\w+)/i);
      
      if (insertMatch) {
        const tableName = insertMatch[1];
        const data = getTableData(tableName);
        // Implementação básica - adicionar registro
        // Por enquanto, apenas logar
        console.log(`INSERT em ${tableName}`, params);
      } else if (updateMatch) {
        const tableName = updateMatch[1];
        console.log(`UPDATE em ${tableName}`, params);
      } else if (deleteMatch) {
        const tableName = deleteMatch[1];
        console.log(`DELETE de ${tableName}`, params);
      }
    },
    getAllAsync: async (sql: string, params?: any[]): Promise<any[]> => {
      const match = sql.match(/FROM\s+(\w+)/i);
      if (!match) return [];
      
      const tableName = match[1];
      return getTableData(tableName);
    },
    getFirstAsync: async (sql: string, params?: any[]): Promise<any | null> => {
      const allResults = await dbMethods.getAllAsync(sql, params);
      return allResults.length > 0 ? allResults[0] : null;
    },
    withTransactionAsync: async (callback: () => Promise<void>) => {
      await callback();
    },
  };

  return dbMethods;
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
