import { supabase, isSupabaseConfigured, ensureSessionRestored } from './supabaseClient';
import { Comum, Cargo, Instrumento, Pessoa, RegistroPresenca } from '../types/models';
import { getDatabase } from '../database/database';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuidv4 } from '../utils/uuid';
import { getNaipeByInstrumento } from '../utils/instrumentNaipe';
import { normalizarRegistroCargoFeminino, isCargoFemininoOrganista } from '../utils/normalizeCargoFeminino';
import { extractFirstAndLastName } from '../utils/userNameUtils';
import { normalizarNivel } from '../utils/normalizeNivel';
import { robustGetItem, robustSetItem, robustRemoveItem, initializeStorage } from '../utils/robustStorage';
import { normalizeForSearch, normalizeString, sanitizeString, isValidString } from '../utils/stringNormalization';
import { normalizeInstrumentoForSearch, expandInstrumentoSearch } from '../utils/normalizeInstrumento';
import { getDeviceInfo, logDeviceInfo, isXiaomiDevice } from '../utils/deviceDetection';

// 🚨 FUNÇÃO AUXILIAR: Verificar se é Secretário da Música (excluir) vs Secretário do GEM (incluir como instrutor)
const isSecretarioDaMusica = (cargo: string): boolean => {
  if (!cargo) return false;
  const cargoUpper = cargo.toUpperCase();
  // Secretário do GEM deve ser tratado como Instrutor, não como Secretário da Música
  return (
    cargoUpper.includes('SECRETÁRIO') && 
    cargoUpper.includes('MÚSICA') &&
    !cargoUpper.includes('GEM')
  );
};

// Cache em memória para web (quando SQLite não está disponível)
const memoryCache: {
  comuns: Comum[];
  cargos: Cargo[];
  instrumentos: Instrumento[];
  pessoas: Pessoa[];
  registros: RegistroPresenca[];
} = {
  comuns: [],
  cargos: [],
  instrumentos: [],
  pessoas: [],
  registros: [],
};

// Flag global para evitar salvamentos simultâneos
let savingLock = false;
let lastSaveTimestamp = 0;
let lastSaveKey = '';

// Lista fixa de instrumentos do backup.js
const INSTRUMENTS_FIXED = [
  'ACORDEON',
  'VIOLINO',
  'VIOLA',
  'VIOLONCELO',
  'FLAUTA',
  'OBOÉ',
  "OBOÉ D'AMORE",
  'CORNE INGLÊS',
  'CLARINETE',
  'CLARINETE ALTO',
  'CLARINETE BAIXO (CLARONE)',
  'CLARINETE CONTRA BAIXO',
  'FAGOTE',
  'SAXOFONE SOPRANO (RETO)',
  'SAXOFONE SOPRANINO',
  'SAXOFONE ALTO',
  'SAXOFONE TENOR',
  'SAXOFONE BARÍTONO',
  'SAXOFONE BAIXO',
  'SAX OCTA CONTRABAIXO',
  'SAX HORN',
  'TROMPA',
  'TROMPETE',
  'CORNET',
  'FLUGELHORN',
  'TROMBONE',
  'TROMBONITO',
  'EUFÔNIO',
  'BARÍTONO (PISTO)',
  'TUBA',
];

// Lista fixa de cargos do backup.js (ordem exata do CARGOS_FIXED)
const CARGOS_FIXED = [
  'Músico',
  'Organista',
  'Candidato (a)',
  'Irmandade',
  'Ancião',
  'Diácono',
  'Cooperador do Ofício',
  'Cooperador de Jovens',
  'Porteiro (a)',
  'Bombeiro (a)',
  'Médico (a)',
  'Enfermeiro (a)',
];

export const supabaseDataService = {
  // Comuns - Buscar da tabela cadastro (seguindo lógica do app.js)
  async fetchComuns(): Promise<Comum[]> {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase não está configurado');
    }

    try {
      console.log('📚 Buscando comuns da tabela cadastro (seguindo lógica do app.js)...');

      // Tentar primeiro com 'cadastro', depois 'musicos_unificado' (fallback)
      let tableName = 'cadastro';
      let allData: any[] = [];
      let hasMore = true;
      let currentPage = 0;
      const pageSize = 1000; // Supabase permite até 1000 por página
      let finalError: any = null;

      // Função para buscar uma página
      const fetchPage = async (
        table: string,
        page: number
      ): Promise<{ data: any[]; error: any; hasMore: boolean }> => {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        try {
          // Buscar apenas comum (sem filtro de ativo)
          let result = await supabase
            .from(table)
            .select('comum')
            .not('comum', 'is', null)
            .neq('comum', '')
            .order('comum', { ascending: true })
            .range(from, to);

          // Se der erro 400, tentar query simplificada
          if (result.error && (result.error.code === '400' || result.error.code === 'PGRST116')) {
            console.log(
              `⚠️ Erro ${result.error.code} na query completa, tentando query simplificada...`
            );
            result = await supabase
              .from(table)
              .select('comum')
              .order('comum', { ascending: true })
              .range(from, to);

            if (!result.error && result.data) {
              // Filtrar nulls e vazios no cliente
              const filtered = result.data.filter(
                (r: any) => r.comum && typeof r.comum === 'string' && r.comum.trim() !== ''
              );
              return {
                data: filtered,
                error: null,
                hasMore: filtered.length === pageSize,
              };
            }
          }

          if (result.error) {
            return {
              data: [],
              error: result.error,
              hasMore: false,
            };
          }

          return {
            data: result.data || [],
            error: null,
            hasMore: (result.data?.length || 0) === pageSize,
          };
        } catch (error) {
          return {
            data: [],
            error: error as any,
            hasMore: false,
          };
        }
      };

      // Tentar primeiro com 'cadastro'
      while (hasMore) {
        try {
          const pageResult = await fetchPage(tableName, currentPage);

          if (pageResult.error) {
            // Se for primeira página e der erro, tentar fallback
            if (currentPage === 0 && tableName === 'cadastro') {
              console.log('⚠️ Erro ao buscar da tabela cadastro, tentando musicos_unificado...');
              tableName = 'musicos_unificado';
              currentPage = 0;
              allData = [];
              continue;
            }
            finalError = pageResult.error;
            break;
          }

          if (pageResult.data && pageResult.data.length > 0) {
            allData = allData.concat(pageResult.data);
            console.log(
              `📄 Página ${currentPage + 1}: ${pageResult.data.length} registros (total: ${allData.length})`
            );
          }

          hasMore = pageResult.hasMore;
          currentPage++;
        } catch (error) {
          console.error(`❌ Erro ao buscar página ${currentPage + 1}:`, error);
          // Se for primeira página, tentar fallback
          if (currentPage === 0 && tableName === 'cadastro') {
            console.log('⚠️ Erro na primeira página, tentando musicos_unificado...');
            tableName = 'musicos_unificado';
            currentPage = 0;
            allData = [];
            continue;
          }
          finalError = error;
          break;
        }
      }

      // Se ainda não encontrou dados e estava tentando 'cadastro', tentar 'musicos_unificado'
      if (allData.length === 0 && tableName === 'cadastro' && !finalError) {
        console.log('⚠️ Nenhum dado encontrado na tabela cadastro, tentando musicos_unificado...');
        tableName = 'musicos_unificado';
        currentPage = 0;
        hasMore = true;
        allData = [];

        while (hasMore) {
          try {
            const pageResult = await fetchPage(tableName, currentPage);

            if (pageResult.error) {
              finalError = pageResult.error;
              break;
            }

            if (pageResult.data && pageResult.data.length > 0) {
              allData = allData.concat(pageResult.data);
              console.log(
                `📄 Página ${currentPage + 1}: ${pageResult.data.length} registros (total: ${allData.length})`
              );
            }

            hasMore = pageResult.hasMore;
            currentPage++;
          } catch (error) {
            console.error(`❌ Erro ao buscar página ${currentPage + 1}:`, error);
            finalError = error;
            break;
          }
        }
      }

      if (finalError) {
        console.error('❌ Erro ao buscar comuns:', finalError);
        throw finalError;
      }

      if (allData.length === 0) {
        console.warn('⚠️ Nenhuma comum encontrada na tabela', tableName);
        return [];
      }

      console.log(`✅ Total de ${allData.length} registros encontrados na tabela ${tableName}`);

      // Extrair valores únicos de 'comum' e normalizar (seguindo lógica do app.js)
      const comunsSet = new Set<string>();

      allData.forEach((record: any) => {
        const comum = record.comum;
        if (comum && typeof comum === 'string') {
          const comumTrimmed = comum.trim();
          if (comumTrimmed) {
            // Normalizar: todas as letras maiúsculas
            const comumNormalizado = comumTrimmed.toUpperCase();
            comunsSet.add(comumNormalizado);
          }
        }
      });

      // Converter Set para array e ordenar
      const comunsArray = Array.from(comunsSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));

      console.log(`✅ ${comunsArray.length} comuns únicas encontradas`);

      // Função para extrair apenas o nome da comum (remover código de localização)
      // Exemplo: "BR-22-1739 - JARDIM MIRANDA" -> "JARDIM MIRANDA"
      const extrairNomeComum = (comumCompleto: string): string => {
        // Se contém " - ", pegar a parte depois do " - "
        if (comumCompleto.includes(' - ')) {
          const partes = comumCompleto.split(' - ');
          return partes.slice(1).join(' - ').trim();
        }
        // Se contém apenas " -" (sem espaço antes), também tentar separar
        if (comumCompleto.includes(' -')) {
          const partes = comumCompleto.split(' -');
          return partes.slice(1).join(' -').trim();
        }
        // Se não tem separador, retornar como está
        return comumCompleto.trim();
      };

      // Converter para formato Comum[]
      // Armazenar nome completo no id/nome original, mas criar campo displayName para exibição
      const comuns: Comum[] = comunsArray.map((nomeCompleto, index) => {
        const nomeExibicao = extrairNomeComum(nomeCompleto);
        return {
          id: `comum_${index + 1}_${nomeCompleto.toLowerCase().replace(/\s+/g, '_')}`,
          nome: nomeCompleto, // Nome completo com código (para registro)
          displayName: nomeExibicao, // Nome sem código (para exibição)
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as any;
      });

      console.log(`✅ Retornando ${comuns.length} comuns processadas da tabela ${tableName}`);
      console.log(
        `📋 Primeiras 5 comuns:`,
        comuns.slice(0, 5).map(c => c.nome)
      );

      return comuns;
    } catch (error) {
      console.error('❌ Erro ao buscar comuns:', error);
      throw error;
    }
  },

  async syncComunsToLocal(): Promise<void> {
    try {
      console.log('🔄 Sincronizando comuns do Supabase para banco local...');
      const comuns = await this.fetchComuns();

      if (comuns.length === 0) {
        console.warn('⚠️ Nenhuma comum retornada do Supabase');
        return;
      }

      console.log(`✅ ${comuns.length} comuns recebidas do Supabase`);

      // Salvar no cache em memória (para web)
      memoryCache.comuns = comuns;

      // Salvar usando robustStorage (com fallbacks)
      try {
        await robustSetItem('cache_comuns', JSON.stringify(comuns));
        console.log('✅ Comuns salvas no cache');
      } catch (error) {
        console.warn('⚠️ Erro ao salvar comuns no cache:', error);
      }

      // Tentar salvar no SQLite (para mobile)
      if (Platform.OS !== 'web') {
        try {
          const db = await getDatabase();
          await db.withTransactionAsync(async () => {
            for (const comum of comuns) {
              await db.runAsync(
                `INSERT OR REPLACE INTO comuns (id, nome, created_at, updated_at) VALUES (?, ?, ?, ?)`,
                [comum.id, comum.nome, comum.created_at || null, comum.updated_at || null]
              );
            }
          });
          console.log(`✅ ${comuns.length} comuns sincronizadas para banco local (mobile)`);
        } catch (error) {
          console.warn('⚠️ Erro ao salvar no SQLite (mobile):', error);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao sincronizar comuns:', error);
      throw error;
    }
  },

  async getComunsFromLocal(): Promise<Comum[]> {
    // Para web, usar cache em memória ou AsyncStorage
    if (Platform.OS === 'web') {
      // Primeiro tentar cache em memória
      if (memoryCache.comuns.length > 0) {
        console.log(`✅ Retornando ${memoryCache.comuns.length} comuns do cache em memória`);
        return memoryCache.comuns;
      }

      // Tentar robustStorage
      try {
        const cached = await robustGetItem('cache_comuns');
        if (cached) {
          const comuns = JSON.parse(cached);
          // Validar e sanitizar dados
          const validComuns = comuns.filter((c: any) => 
            isValidString(c.id) && isValidString(c.nome)
          ).map((c: any) => ({
            ...c,
            nome: sanitizeString(c.nome),
          }));
          
          memoryCache.comuns = validComuns;
          console.log(`✅ Retornando ${validComuns.length} comuns do cache robusto`);
          return validComuns;
        }
      } catch (error) {
        console.warn('⚠️ Erro ao ler do cache robusto:', error);
      }

      console.warn('⚠️ Nenhuma comum encontrada no cache (web)');
      return [];
    }

    // Para mobile, usar SQLite
    try {
      const db = await getDatabase();
      const result = (await db.getAllAsync('SELECT * FROM comuns ORDER BY nome')) as Comum[];
      return result;
    } catch (error) {
      console.warn('⚠️ Erro ao ler do SQLite:', error);
      return [];
    }
  },

  // Cargos - Usar lista fixa do backup.js
  async fetchCargos(): Promise<Cargo[]> {
    console.log('📚 Usando lista fixa de cargos do backup.js...');

    // Sempre usar lista fixa de cargos (seguindo lógica do backup.js)
    const cargos: Cargo[] = CARGOS_FIXED.map((nome, index) => {
      // Determinar se é cargo musical baseado no nome (apenas Músico e Organista)
      // Candidatos têm instrumento na tabela, mas não mostramos campo na UI
      const isMusical = nome === 'Músico' || nome === 'Organista';

      return {
        id: `cargo_${index + 1}_${nome.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '')}`,
        nome: nome,
        is_musical: isMusical,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    console.log(`✅ ${cargos.length} cargos da lista fixa`);

    // Salvar no cache em memória
    memoryCache.cargos = cargos;
    // Salvar usando robustStorage (com fallbacks)
    try {
      await robustSetItem('cached_cargos', JSON.stringify(cargos));
    } catch (error) {
      console.warn('⚠️ Erro ao salvar cargos no cache:', error);
    }

    return cargos;
  },

  async syncCargosToLocal(): Promise<void> {
    try {
      console.log('🔄 Sincronizando cargos (lista fixa)...');

      // Sempre usar lista fixa de cargos
      const cargos = await this.fetchCargos();

      if (cargos.length === 0) {
        console.warn('⚠️ Nenhum cargo retornado');
        return;
      }

      console.log(`✅ ${cargos.length} cargos da lista fixa`);

      // Salvar no cache em memória (para web)
      memoryCache.cargos = cargos;

      // Salvar usando robustStorage (com fallbacks)
      try {
        await robustSetItem('cached_cargos', JSON.stringify(cargos));
        console.log('✅ Cargos salvos no cache');
      } catch (error) {
        console.warn('⚠️ Erro ao salvar cargos no cache:', error);
      }

      // Tentar salvar no SQLite (para mobile)
      if (Platform.OS !== 'web') {
        try {
          const db = await getDatabase();
          await db.withTransactionAsync(async () => {
            for (const cargo of cargos) {
              await db.runAsync(
                `INSERT OR REPLACE INTO cargos (id, nome, is_musical, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
                [
                  cargo.id,
                  cargo.nome,
                  cargo.is_musical ? 1 : 0,
                  cargo.created_at || null,
                  cargo.updated_at || null,
                ]
              );
            }
          });
          console.log(`✅ ${cargos.length} cargos sincronizados para banco local (mobile)`);
        } catch (error) {
          console.warn('⚠️ Erro ao salvar no SQLite (mobile):', error);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao sincronizar cargos:', error);
      throw error;
    }
  },

  async getCargosFromLocal(): Promise<Cargo[]> {
    // Sempre retornar na ordem exata da lista fixa CARGOS_FIXED
    const cargosNaOrdem: Cargo[] = CARGOS_FIXED.map((nome, index) => {
      // Apenas Músico e Organista podem ter instrumento
      const isMusical = nome === 'Músico' || nome === 'Organista';
      return {
        id: `cargo_${index + 1}_${nome.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '')}`,
        nome: nome,
        is_musical: isMusical,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    // Para web, usar cache em memória ou AsyncStorage
    if (Platform.OS === 'web') {
      // Primeiro tentar cache em memória
      if (memoryCache.cargos.length > 0) {
        // Reordenar conforme lista fixa (manter ordem exata)
        const cargosOrdenados = CARGOS_FIXED.map(nome => {
          const cargo = memoryCache.cargos.find(c => c.nome === nome);
          return cargo || cargosNaOrdem.find(c => c.nome === nome)!;
        });
        console.log(`✅ Retornando ${cargosOrdenados.length} cargos do cache (ordem fixa)`);
        return cargosOrdenados;
      }
      
      // Tentar robustStorage
      try {
        const cached = await robustGetItem('cached_cargos');
        if (cached) {
          const cargos = JSON.parse(cached);
          // Validar e sanitizar dados
          const validCargos = cargos.filter((c: any) => 
            isValidString(c.id) && isValidString(c.nome)
          ).map((c: any) => ({
            ...c,
            nome: sanitizeString(c.nome),
          }));
          // Reordenar conforme lista fixa
          const cargosOrdenados = CARGOS_FIXED.map(nome => {
            const cargo = validCargos.find((c: any) => c.nome === nome);
            return cargo || cargosNaOrdem.find(c => c.nome === nome)!;
          });
          memoryCache.cargos = cargosOrdenados;
          console.log(`✅ Retornando ${cargosOrdenados.length} cargos do cache robusto`);
          return cargosOrdenados;
        }
      } catch (error) {
        console.warn('⚠️ Erro ao ler do cache robusto:', error);
      }

      console.log(`✅ Retornando ${cargosNaOrdem.length} cargos da lista fixa (ordem exata)`);
      return cargosNaOrdem;
    }

    // Para mobile, usar SQLite
    try {
      const db = await getDatabase();
      const result = (await db.getAllAsync('SELECT * FROM cargos')) as Cargo[];

      // Reordenar conforme lista fixa (manter ordem exata)
      const cargosOrdenados = CARGOS_FIXED.map(nome => {
        const cargo = result.find(c => c.nome === nome);
        return cargo || cargosNaOrdem.find(c => c.nome === nome)!;
      });

      return cargosOrdenados.map(c => ({ ...c, is_musical: (c as any).is_musical === 1 }));
    } catch (error) {
      console.warn('⚠️ Erro ao ler do SQLite, usando lista fixa:', error);
      return cargosNaOrdem;
    }
  },

  // Instrumentos
  async fetchInstrumentos(): Promise<Instrumento[]> {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase não está configurado');
    }

    try {
      // Tentar buscar da tabela 'instrumentos'
      let result = await supabase.from('instrumentos').select('*').order('nome');

      if (result.error) {
        console.warn('⚠️ Erro ao buscar instrumentos da tabela instrumentos:', result.error);

        // Se a tabela não existir, tentar buscar da tabela cadastro/musicos_unificado
        console.log('🔄 Tentando buscar instrumentos da tabela cadastro...');

        // Tentar 'cadastro' primeiro
        let tableName = 'cadastro';
        let instrumentosData = await supabase
          .from(tableName)
          .select('instrumento')
          .not('instrumento', 'is', null)
          .neq('instrumento', '');

        if (
          instrumentosData.error ||
          !instrumentosData.data ||
          instrumentosData.data.length === 0
        ) {
          console.log('⚠️ Tabela cadastro não encontrada, tentando musicos_unificado...');
          tableName = 'musicos_unificado';
          instrumentosData = await supabase
            .from(tableName)
            .select('instrumento')
            .not('instrumento', 'is', null)
            .neq('instrumento', '');
        }

        if (instrumentosData.error) {
          console.error('❌ Erro ao buscar instrumentos:', instrumentosData.error);
          // Retornar lista padrão de instrumentos como fallback
          return this.getDefaultInstrumentos();
        }

        if (!instrumentosData.data || instrumentosData.data.length === 0) {
          console.warn('⚠️ Nenhum instrumento encontrado, usando lista padrão');
          return this.getDefaultInstrumentos();
        }

        // Extrair valores únicos e normalizar
        const instrumentosSet = new Set<string>();
        instrumentosData.data.forEach((record: any) => {
          const instrumento = record.instrumento;
          if (instrumento && typeof instrumento === 'string') {
            const instrumentoTrimmed = instrumento.trim();
            if (instrumentoTrimmed) {
              const instrumentoNormalizado = instrumentoTrimmed
                .toLowerCase()
                .replace(/(^.|[\s\-'.][a-z])/g, (m: string) => m.toUpperCase());
              instrumentosSet.add(instrumentoNormalizado);
            }
          }
        });

        const instrumentosArray = Array.from(instrumentosSet).sort((a, b) =>
          a.localeCompare(b, 'pt-BR')
        );

        console.log(
          `✅ ${instrumentosArray.length} instrumentos únicos encontrados na tabela ${tableName}`
        );

        // Converter para formato Instrumento[]
        const instrumentos: Instrumento[] = instrumentosArray.map((nome, index) => ({
          id: `instrumento_${index + 1}_${nome.toLowerCase().replace(/\s+/g, '_')}`,
          nome: nome,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        return instrumentos;
      }

      return result.data || [];
    } catch (error) {
      console.error('❌ Erro ao buscar instrumentos:', error);
      // Retornar lista padrão em caso de erro
      return this.getDefaultInstrumentos();
    }
  },

  // Lista padrão de instrumentos do backup.js
  getDefaultInstrumentos(): Instrumento[] {
    return INSTRUMENTS_FIXED.map((nome, index) => ({
      id: `instrumento_${index + 1}_${nome.toLowerCase().replace(/\s+/g, '_')}`,
      nome: nome,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  },

  async syncInstrumentosToLocal(): Promise<void> {
    try {
      console.log('🔄 Sincronizando instrumentos...');

      // Sempre usar lista fixa de instrumentos do backup.js
      const instrumentos = this.getDefaultInstrumentos();

      console.log(`✅ ${instrumentos.length} instrumentos da lista fixa`);

      // Salvar no cache em memória (para web)
      memoryCache.instrumentos = instrumentos;

      // Salvar usando robustStorage (com fallbacks)
      try {
        await robustSetItem('cache_instrumentos', JSON.stringify(instrumentos));
        console.log('✅ Instrumentos salvos no cache');
      } catch (error) {
        console.warn('⚠️ Erro ao salvar instrumentos no cache:', error);
      }

      // Tentar salvar no SQLite (para mobile)
      if (Platform.OS !== 'web') {
        try {
          const db = await getDatabase();
          await db.withTransactionAsync(async () => {
            for (const instrumento of instrumentos) {
              await db.runAsync(
                `INSERT OR REPLACE INTO instrumentos (id, nome, created_at, updated_at) VALUES (?, ?, ?, ?)`,
                [
                  instrumento.id,
                  instrumento.nome,
                  instrumento.created_at || null,
                  instrumento.updated_at || null,
                ]
              );
            }
          });
          console.log(
            `✅ ${instrumentos.length} instrumentos sincronizados para banco local (mobile)`
          );
        } catch (error) {
          console.warn('⚠️ Erro ao salvar no SQLite (mobile):', error);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao sincronizar instrumentos:', error);
      // Usar lista padrão mesmo em caso de erro
      const defaultInstrumentos = this.getDefaultInstrumentos();
      memoryCache.instrumentos = defaultInstrumentos;
    }
  },

  async getInstrumentosFromLocal(): Promise<Instrumento[]> {
    // Para web, usar cache em memória ou AsyncStorage
    if (Platform.OS === 'web') {
      // Primeiro tentar cache em memória
      if (memoryCache.instrumentos.length > 0) {
        console.log(
          `✅ Retornando ${memoryCache.instrumentos.length} instrumentos do cache em memória`
        );
        return memoryCache.instrumentos;
      }

      // Tentar robustStorage
      try {
        const cached = await robustGetItem('cache_instrumentos');
        if (cached) {
          const instrumentos = JSON.parse(cached);
          // Validar e sanitizar dados
          const validInstrumentos = instrumentos.filter((i: any) => 
            isValidString(i.id) && isValidString(i.nome)
          ).map((i: any) => ({
            ...i,
            nome: sanitizeString(i.nome),
          }));
          memoryCache.instrumentos = validInstrumentos;
          console.log(`✅ Retornando ${validInstrumentos.length} instrumentos do cache robusto`);
          return validInstrumentos;
        }
      } catch (error) {
        console.warn('⚠️ Erro ao ler do cache robusto:', error);
      }

      // Se não encontrou, usar lista padrão
      console.log('🔄 Usando lista padrão de instrumentos');
      const defaultInstrumentos = this.getDefaultInstrumentos();
      memoryCache.instrumentos = defaultInstrumentos;
      return defaultInstrumentos;
    }

    // Para mobile, usar SQLite
    try {
      const db = await getDatabase();
      const result = (await db.getAllAsync(
        'SELECT * FROM instrumentos ORDER BY nome'
      )) as Instrumento[];
      return result.length > 0 ? result : this.getDefaultInstrumentos();
    } catch (error) {
      console.warn('⚠️ Erro ao ler do SQLite, usando lista padrão:', error);
      // Retornar lista padrão em caso de erro
      return this.getDefaultInstrumentos();
    }
  },

  // Pessoas
  // REMOVIDO: fetchPessoas() - não existe tabela 'pessoas', usar fetchPessoasFromCadastro() ao invés

  async syncPessoasToLocal(): Promise<void> {
    // Não sincronizar pessoas - buscamos diretamente da tabela cadastro quando necessário
    console.log('ℹ️ Pessoas são buscadas diretamente da tabela cadastro quando necessário');
    return;
  },

  // Buscar pessoas da tabela cadastro (seguindo lógica do backupcont)
  async fetchPessoasFromCadastro(
    comumNome?: string,
    cargoNome?: string,
    instrumentoNome?: string
  ): Promise<any[]> {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase não está configurado');
    }

    if (!comumNome || !cargoNome) {
      return [];
    }

    try {
      // 🚨 CORREÇÃO CRÍTICA: Garantir que sessão está restaurada antes de buscar (RLS requer autenticação)
      const sessionRestored = await ensureSessionRestored();
      console.log('🔐 [fetchPessoasFromCadastro] Sessão restaurada:', sessionRestored);
      
      // Verificar autenticação
      if (isSupabaseConfigured() && supabase) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        console.log('🔐 [fetchPessoasFromCadastro] Verificação de autenticação:', {
          temUser: !!user,
          userId: user?.id,
          authError: authError?.message,
        });
      }

      // 🚨 CORREÇÃO: Extrair apenas o nome da comum (sem código) e normalizar
      // O nome da comum pode vir como "BR-22-1804 - JARDIM LAVAPES DAS GRACAS" ou "BR-22-1804 JARDIM LAVAPES DAS GRACAS"
      // mas no banco pode estar apenas como "JARDIM LAVAPES DAS GRACAS" ou com acentos
      let comumBusca = comumNome.trim();
      
      // Extrair apenas o nome sem o código (usando a função extrairNomeComum)
      // Tentar múltiplos formatos: "BR-XX-XXXX - NOME", "BR-XX-XXXX NOME", etc.
      if (comumBusca.includes(' - ') || comumBusca.includes(' -')) {
        const partes = comumBusca.split(/ - ?/);
        if (partes.length > 1) {
          comumBusca = partes.slice(1).join(' - ').trim();
        }
      } else if (/^BR-\d+-\d+\s/.test(comumBusca)) {
        // Formato: "BR-22-1804 JARDIM LAVAPES DAS GRACAS" (sem " - ")
        comumBusca = comumBusca.replace(/^BR-\d+-\d+\s+/, '').trim();
      }
      
      // Normalizar o nome da comum (remover acentos, normalizar espaços)
      // 🚨 CORREÇÃO: Normalizar espaços ANTES de converter para maiúscula para evitar problemas
      comumBusca = comumBusca.replace(/\s+/g, ' ').trim(); // Normalizar espaços primeiro
      comumBusca = normalizeString(comumBusca.toUpperCase()).replace(/\s+/g, ' ').trim(); // Garantir que não há espaços extras
      
      const cargoBusca = cargoNome.trim().toUpperCase();
      // 🚨 CORREÇÃO: Normalizar instrumento expandindo abreviações (ex: "RET" → "RETO")
      const instrumentoBusca = instrumentoNome 
        ? normalizeInstrumentoForSearch(instrumentoNome.trim())
        : undefined;

      // Determinar se precisa de instrumento obrigatório (APENAS Músico)
      // Organista NÃO precisa de instrumento (sempre toca órgão)
      const precisaInstrumento = cargoBusca === 'MÚSICO';

      // Se precisa de instrumento mas não foi fornecido, retornar vazio
      if (precisaInstrumento && !instrumentoBusca) {
        console.log('⚠️ Cargo Músico requer instrumento');
        return [];
      }

      // Usar APENAS tabela cadastro (sem fallback para musicos_unificado)
      const tableName = 'cadastro';
      let allData: any[] = [];
      let hasMore = true;
      let currentPage = 0;
      const pageSize = 1000;
      let finalError: any = null;

      const fetchPage = async (
        table: string,
        page: number
      ): Promise<{ data: any[]; error: any; hasMore: boolean }> => {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        // 🚨 CORREÇÃO CRÍTICA: Para SAXOFONE SOPRANO, fazer múltiplas queries e combinar resultados
        // (como o backupcont faz para garantir robustez)
        if (instrumentoBusca && instrumentoBusca.includes('SAXOFONE') && instrumentoBusca.includes('SOPRANO')) {
          console.log('🔍 Buscando SAXOFONE SOPRANO com múltiplas variações...');
          
          // Criar queries separadas para cada variação (mais confiável que OR)
          const queries = [
            supabase
              .from(table)
              .select('nome, comum, cargo, instrumento, cidade, nivel')
              .ilike('comum', `%${comumBusca}%`)
              .ilike('instrumento', '%SAXOFONE SOPRANO RET%')
              .order('nome', { ascending: true })
              .range(from, to),
            supabase
              .from(table)
              .select('nome, comum, cargo, instrumento, cidade, nivel')
              .ilike('comum', `%${comumBusca}%`)
              .ilike('instrumento', '%SAXOFONE SOPRANO RETO%')
              .order('nome', { ascending: true })
              .range(from, to),
            supabase
              .from(table)
              .select('nome, comum, cargo, instrumento, cidade, nivel')
              .ilike('comum', `%${comumBusca}%`)
              .ilike('instrumento', '%SAXOFONE SOPRANO (RETO)%')
              .order('nome', { ascending: true })
              .range(from, to),
          ];

          // Executar todas as queries em paralelo
          const results = await Promise.all(queries);
          
          // Combinar resultados removendo duplicatas
          const combinedData: any[] = [];
          const seenNames = new Set<string>();
          
          results.forEach((result, idx) => {
            if (result.data && !result.error) {
              result.data.forEach((item: any) => {
                const key = `${item.nome}_${item.comum}`.toUpperCase();
                if (!seenNames.has(key)) {
                  seenNames.add(key);
                  combinedData.push(item);
                }
              });
            } else if (result.error) {
              console.warn(`⚠️ Erro na query ${idx + 1} para SAXOFONE SOPRANO:`, result.error);
            }
          });

          return {
            data: combinedData,
            error: null,
            hasMore: combinedData.length === pageSize,
          };
        }

        // Construir query base com filtro de comum (incluindo cidade e nivel - que é a classe da organista)
        // 🚨 CORREÇÃO CRÍTICA: Fazer múltiplas buscas para garantir que encontre mesmo com acentos diferentes
        // O Supabase ilike não normaliza acentos automaticamente, então precisamos buscar:
        // 1. Nome normalizado (sem acentos): "JARDIM LAVAPES DAS GRACAS"
        // 2. Nome original (com acentos): "JARDIM LAVAPÉS DAS GRAÇAS"  
        // 3. Nome completo (com código): "BR-22-1804 - JARDIM LAVAPÉS DAS GRAÇAS"
        console.log('🔍 [fetchPessoasFromCadastro] Construindo query com:', {
          comumBuscaNormalizado: comumBusca,
          comumNomeOriginal: comumNome,
          tableName: table,
        });
        
        // Extrair nome sem código do nome original também (caso tenha acentos)
        let comumNomeSemCodigo = comumNome.trim();
        if (comumNomeSemCodigo.includes(' - ') || comumNomeSemCodigo.includes(' -')) {
          const partes = comumNomeSemCodigo.split(/ - ?/);
          if (partes.length > 1) {
            comumNomeSemCodigo = partes.slice(1).join(' - ').trim();
          }
        } else if (/^BR-\d+-\d+\s/.test(comumNomeSemCodigo)) {
          // Formato: "BR-22-1804 JARDIM LAVAPES DAS GRACAS" (sem " - ")
          comumNomeSemCodigo = comumNomeSemCodigo.replace(/^BR-\d+-\d+\s+/, '').trim();
        }
        
        // 🚀 OTIMIZAÇÃO: Tentar apenas 1 query primeiro (mais rápida)
        // Se não encontrar, tentar as outras variações
        let combinedDataComum: any[] = [];
        const seenNames = new Set<string>();
        
        // Query 1: Nome normalizado (sem acentos) - mais comum
        const query1 = supabase
          .from(table)
          .select('nome, comum, cargo, instrumento, cidade, nivel')
          .ilike('comum', `%${comumBusca}%`)
          .order('nome', { ascending: true })
          .range(from, to);
        
        const result1 = await query1;
        
        if (result1.data && !result1.error && result1.data.length > 0) {
          // Se encontrou resultados na primeira query, usar apenas ela (mais rápido)
          result1.data.forEach((item: any) => {
            const key = `${item.nome}_${item.comum}`.toUpperCase();
            if (!seenNames.has(key)) {
              seenNames.add(key);
              combinedDataComum.push(item);
            }
          });
        } else {
          // Se não encontrou, tentar outras variações em paralelo
          const queriesComum = [
            supabase
              .from(table)
              .select('nome, comum, cargo, instrumento, cidade, nivel')
              .ilike('comum', `%${comumNomeSemCodigo.toUpperCase()}%`) // Nome original (com acentos)
              .order('nome', { ascending: true })
              .range(from, to),
            supabase
              .from(table)
              .select('nome, comum, cargo, instrumento, cidade, nivel')
              .ilike('comum', `%${comumNome.trim()}%`) // Nome completo (com código)
              .order('nome', { ascending: true })
              .range(from, to),
          ];
          
          const resultsComum = await Promise.all(queriesComum);
          
          resultsComum.forEach((result) => {
            if (result.data && !result.error) {
              result.data.forEach((item: any) => {
                const key = `${item.nome}_${item.comum}`.toUpperCase();
                if (!seenNames.has(key)) {
                  seenNames.add(key);
                  combinedDataComum.push(item);
                }
              });
            }
          });
        }
        
        // Se encontrou resultados, aplicar filtros de cargo e instrumento
        if (combinedDataComum.length > 0) {
          let filteredData = combinedDataComum;
          
          // 🚨 CORREÇÃO: Verificar se está buscando especificamente por "Secretário da Música"
          const isBuscandoSecretarioDaMusica = isSecretarioDaMusica(cargoNome);
          
          // Aplicar filtros de cargo e instrumento
          if (cargoBusca === 'ORGANISTA') {
            filteredData = filteredData.filter(item => 
              (item.instrumento || '').toUpperCase().includes('ÓRGÃO')
            );
          } else if (cargoBusca === 'MÚSICO' || cargoBusca.includes('MÚSICO')) {
            if (instrumentoBusca) {
              const variacoesBusca = expandInstrumentoSearch(instrumentoNome || '');
              
              // 🚨 CORREÇÃO CRÍTICA: Quando busca por instrumento (ex: Músico + Violino), 
              // retornar TODOS que tocam aquele instrumento, independente do cargo.
              // Isso inclui: Músicos, Instrutores, Encarregados, Secretário do GEM, Secretário da Música, etc.
              // O cargo real será capturado do banco de dados quando o registro for salvo.
              filteredData = filteredData.filter(item => {
                const itemInstrumento = (item.instrumento || '').toUpperCase();
                // 🚨 CORREÇÃO: Normalizar acentos antes de comparar para encontrar instrumentos mesmo com variações de acentuação
                const itemInstrumentoNormalizado = normalizeString(itemInstrumento);
                const matchesInstrumento = variacoesBusca.some(v => {
                  const variacaoNormalizada = normalizeString(v);
                  return itemInstrumentoNormalizado.includes(variacaoNormalizada) || 
                         itemInstrumento.includes(v) || // Fallback: comparação direta também
                         variacaoNormalizada.includes(itemInstrumentoNormalizado);
                });
                // Não filtrar por cargo aqui - incluir TODOS que tocam o instrumento
                return matchesInstrumento;
              });
            } else {
              filteredData = filteredData.filter(item => {
                const itemCargo = (item.cargo || '').toUpperCase();
                // 🚨 CORREÇÃO: Se está buscando Secretário da Música, incluir todos (incluindo Secretário da Música)
                if (isBuscandoSecretarioDaMusica) {
                  return isSecretarioDaMusica(item.cargo || '');
                }
                // Caso contrário, excluir apenas Secretário da Música, mas incluir Secretário do GEM (tratado como Instrutor)
                return itemCargo.includes('MÚSICO') && !isSecretarioDaMusica(item.cargo || '');
              });
            }
          } else {
            filteredData = filteredData.filter(item => 
              (item.cargo || '').toUpperCase().includes(cargoBusca)
            );
          }
          
          // Log apenas se não encontrou resultados (para debug)
          if (filteredData.length === 0 && combinedDataComum.length > 0) {
            console.warn('⚠️ [fetchPessoasFromCadastro] Nenhum resultado após aplicar filtros');
          }
          
          return {
            data: filteredData,
            error: null,
            hasMore: combinedDataComum.length === pageSize,
          };
        }
        
        // 🚨 DEBUG: Fazer uma busca mais ampla apenas se realmente não encontrou nada
        // 🚀 OTIMIZAÇÃO: Só fazer busca de teste se realmente necessário (evita query extra)
        try {
          // Busca rápida com parte do nome (mais eficiente que buscar tudo)
          const testQuery = supabase
            .from(table)
            .select('comum')
            .ilike('comum', `%${comumBusca.slice(0, 10)}%`) // Primeiros 10 caracteres
            .limit(5); // Apenas 5 resultados para verificar
          
          const testResult = await testQuery;
          const amostraComuns = testResult.data?.map((item: any) => item.comum) || [];
          
          // 🚨 CORREÇÃO: Se encontrou resultados, usar o nome EXATO do banco para buscar
          if (testResult.data && testResult.data.length > 0) {
            // Encontrar a comum que corresponde (pode ter código ou não, com ou sem acentos)
            // Normalizar ambos os lados para comparação robusta
            const comumBuscaNormalizado = normalizeString(comumBusca.toUpperCase());
            const comumNomeNormalizado = normalizeString(comumNome.toUpperCase());
            
            const comumEncontrada = amostraComuns.find((c: string) => {
              if (!c) return false;
              
              const cUpper = c.toUpperCase().trim();
              const cNormalizado = normalizeString(cUpper);
              
              // Extrair apenas o nome da comum (sem código) para comparação
              let cNomeSemCodigo = cUpper;
              if (cNomeSemCodigo.includes(' - ')) {
                const partes = cNomeSemCodigo.split(' - ');
                if (partes.length > 1) {
                  cNomeSemCodigo = partes.slice(1).join(' - ').trim();
                }
              } else if (/^BR-\d+-\d+\s/.test(cNomeSemCodigo)) {
                cNomeSemCodigo = cNomeSemCodigo.replace(/^BR-\d+-\d+\s+/, '').trim();
              }
              const cNomeSemCodigoNormalizado = normalizeString(cNomeSemCodigo);
              
              // Comparar de múltiplas formas:
              // 1. Nome normalizado sem código
              if (cNomeSemCodigoNormalizado === comumBuscaNormalizado) return true;
              if (cNomeSemCodigoNormalizado.includes(comumBuscaNormalizado)) return true;
              if (comumBuscaNormalizado.includes(cNomeSemCodigoNormalizado)) return true;
              
              // 2. Nome completo normalizado
              if (cNormalizado.includes(comumNomeNormalizado)) return true;
              if (comumNomeNormalizado.includes(cNormalizado)) return true;
              
              // 3. Comparação direta (case-insensitive)
              if (cUpper.includes(comumBusca.toUpperCase())) return true;
              if (cUpper.includes(comumNome.toUpperCase())) return true;
              
              return false;
            });
            
            if (comumEncontrada) {
              
              // Fazer busca com o nome EXATO do banco (sem normalizar)
              const queryExata = supabase
                .from(table)
                .select('nome, comum, cargo, instrumento, cidade, nivel')
                .ilike('comum', `%${comumEncontrada}%`)
                .order('nome', { ascending: true })
                .range(from, to);
              
              // 🚨 CORREÇÃO: Verificar se está buscando especificamente por "Secretário da Música"
              const isBuscandoSecretarioDaMusica = isSecretarioDaMusica(cargoNome);
              
              // Aplicar filtros de cargo e instrumento
              let queryFinal = queryExata;
              if (cargoBusca === 'ORGANISTA') {
                queryFinal = queryFinal.ilike('instrumento', '%ÓRGÃO%');
              } else if (cargoBusca === 'MÚSICO' || cargoBusca.includes('MÚSICO')) {
                if (instrumentoBusca) {
                  // 🚨 CORREÇÃO CRÍTICA: Quando busca por instrumento (ex: Músico + Violino),
                  // buscar APENAS por instrumento, SEM filtrar por cargo.
                  // Isso garante que TODOS que tocam aquele instrumento apareçam, incluindo:
                  // Músicos, Instrutores, Encarregados, Secretário do GEM, Secretário da Música, etc.
                  // O cargo real será capturado do banco de dados quando o registro for salvo.
                  const variacoesBusca = expandInstrumentoSearch(instrumentoNome || '');
                  if (variacoesBusca.length > 1) {
                    const conditions = variacoesBusca.map(v => `instrumento.ilike.%${v}%`).join(',');
                    queryFinal = queryFinal.or(conditions);
                  } else {
                    queryFinal = queryFinal.ilike('instrumento', `%${instrumentoBusca}%`);
                  }
                  // NÃO aplicar filtro de cargo aqui - buscar apenas por instrumento
                } else {
                  // 🚨 CORREÇÃO: Se está buscando Secretário da Música, buscar diretamente por esse cargo
                  if (isBuscandoSecretarioDaMusica) {
                    queryFinal = queryFinal.ilike('cargo', '%SECRETÁRIO DA MÚSICA%')
                      .or('cargo.ilike.%SECRETÁRIA DA MÚSICA%');
                  } else {
                    // Caso contrário, excluir apenas Secretário da Música, mas incluir Secretário do GEM (tratado como Instrutor)
                    queryFinal = queryFinal.ilike('cargo', '%MÚSICO%')
                      .not('cargo', 'ilike', '%SECRETÁRIO DA MÚSICA%')
                      .not('cargo', 'ilike', '%SECRETÁRIA DA MÚSICA%');
                  }
                }
              } else {
                queryFinal = queryFinal.ilike('cargo', `%${cargoBusca}%`);
              }
              
              const resultExato = await queryFinal;
              
              if (resultExato.data && resultExato.data.length > 0) {
                return {
                  data: resultExato.data || [],
                  error: resultExato.error,
                  hasMore: (resultExato.data?.length || 0) === pageSize,
                };
              }
            }
          }
        } catch (testError) {
          // Ignorar erro na busca de teste (não crítico)
        }
        
        // Se não encontrou com múltiplas queries, tentar query única como fallback
        let query = supabase
          .from(table)
          .select('nome, comum, cargo, instrumento, cidade, nivel')
          .ilike('comum', `%${comumBusca}%`)
          .order('nome', { ascending: true });

        // 🚨 CORREÇÃO: Verificar se está buscando especificamente por "Secretário da Música"
        const isBuscandoSecretarioDaMusica = isSecretarioDaMusica(cargoNome);
        
        // Aplicar filtros de cargo e instrumento diretamente na query (seguindo lógica do app.js)
        if (cargoBusca === 'ORGANISTA') {
          // Para organista, busca por instrumento ÓRGÃO para retornar todas as organistas
          // (incluindo instrutoras, examinadoras, secretárias da música)
          // Isso permite que ao selecionar um nome, o cargo real seja capturado do banco
          query = query.ilike('instrumento', '%ÓRGÃO%');
        } else if (cargoBusca === 'MÚSICO' || cargoBusca.includes('MÚSICO')) {
          // 🚨 CORREÇÃO CRÍTICA: Quando busca por instrumento (ex: Músico + Violino),
          // buscar APENAS por instrumento, SEM filtrar por cargo.
          // Isso garante que TODOS que tocam aquele instrumento apareçam, incluindo:
          // Músicos, Instrutores, Encarregados, Secretário do GEM, Secretário da Música, etc.
          // O cargo real será capturado do banco de dados quando o registro for salvo.
          if (instrumentoBusca) {
            // Para outros instrumentos, criar variações de busca
            const variacoesBusca = expandInstrumentoSearch(instrumentoNome || '');
            
            if (variacoesBusca.length > 1) {
              // Criar condições OR para todas as variações
              const conditions = variacoesBusca.map(v => `instrumento.ilike.%${v}%`).join(',');
              query = query.or(conditions);
            } else {
              query = query.ilike('instrumento', `%${instrumentoBusca}%`);
            }
            // NÃO aplicar filtro de cargo aqui - buscar apenas por instrumento
          } else {
            // Se não tem instrumento, buscar apenas por cargo MÚSICO
            // 🚨 CORREÇÃO: Se está buscando Secretário da Música, buscar diretamente por esse cargo
            if (isBuscandoSecretarioDaMusica) {
              query = query.ilike('cargo', '%SECRETÁRIO DA MÚSICA%')
                .or('cargo.ilike.%SECRETÁRIA DA MÚSICA%');
            } else {
              // Caso contrário, excluir apenas Secretário da Música, mas incluir Secretário do GEM (tratado como Instrutor)
              query = query.ilike('cargo', '%MÚSICO%')
                .not('cargo', 'ilike', '%SECRETÁRIO DA MÚSICA%')
                .not('cargo', 'ilike', '%SECRETÁRIA DA MÚSICA%');
            }
          }
        } else {
          // Para outros cargos, filtrar apenas por cargo
          query = query.ilike('cargo', `%${cargoBusca}%`);
        }

        // Aplicar range para paginação
        const result = await query.range(from, to);

        return {
          data: result.data || [],
          error: result.error,
          hasMore: (result.data?.length || 0) === pageSize,
        };
      };

      // Buscar todas as páginas da tabela cadastro
      while (hasMore) {
        try {
          const pageResult = await fetchPage(tableName, currentPage);

          if (pageResult.error) {
            finalError = pageResult.error;
            console.error('❌ Erro ao buscar da tabela cadastro:', pageResult.error);
            break;
          }

          if (pageResult.data && pageResult.data.length > 0) {
            allData = allData.concat(pageResult.data);
            console.log(
              `📄 Página ${currentPage + 1}: ${pageResult.data.length} registros (total: ${allData.length})`
            );
          }

          hasMore = pageResult.hasMore;
          currentPage++;
        } catch (error) {
          finalError = error;
          console.error('❌ Erro ao buscar página:', error);
          break;
        }
      }

      if (allData.length === 0) {
        console.log('⚠️ Nenhuma pessoa encontrada');
        return [];
      }

      console.log(`✅ Total de ${allData.length} registros encontrados na tabela ${tableName}`);

      // Os dados já vêm filtrados da query do Supabase, então apenas remover duplicatas
      // Remover duplicatas baseado em nome + comum
      const uniqueMap = new Map<string, any>();
      allData.forEach(r => {
        const nomeCompleto = (r.nome || '').trim();
        const comum = (r.comum || '').trim();
        const key = `${nomeCompleto}_${comum}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, r);
        }
      });

      const uniqueData = Array.from(uniqueMap.values());
      console.log(`✅ ${uniqueData.length} pessoas únicas após remover duplicatas`);

      return uniqueData;
    } catch (error) {
      console.error('❌ Erro ao buscar pessoas da tabela cadastro:', error);
      throw error;
    }
  },

  // Buscar candidatos da tabela candidatos (CÓPIA EXATA de fetchPessoasFromCadastro, só muda a tabela)
  async fetchCandidatosFromSupabase(
    comumNome?: string
  ): Promise<any[]> {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase não está configurado');
    }

    if (!comumNome) {
      return [];
    }

    try {
      // 🚨 CORREÇÃO CRÍTICA: Garantir que sessão está restaurada antes de buscar (RLS requer autenticação)
      const sessionRestaurada = await ensureSessionRestored();
      
      // Verificar autenticação após restaurar
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('🔐 Verificação de autenticação:', {
        user: user ? { id: user.id, email: user.email } : null,
        authError: authError?.message,
        hasUser: !!user,
        sessionRestaurada,
      });

      // Se ainda não há usuário autenticado, logar aviso mas continuar (RLS pode permitir)
      if (!user) {
        console.warn('⚠️ Nenhum usuário autenticado encontrado. Verifique se RLS permite acesso sem autenticação.');
      }

      console.log('📚 Buscando candidatos da tabela candidatos:', {
        comumNome,
        comumNomeLength: comumNome?.length,
        comumNomeTrimmed: comumNome?.trim(),
      });

      // Normalizar valores para busca (EXATAMENTE como fetchPessoasFromCadastro)
      const comumBusca = comumNome.trim();
      console.log('🔍 comumBusca normalizado:', comumBusca);

      // ÚNICA DIFERENÇA: usar tabela candidatos ao invés de cadastro
      const tableName = 'candidatos';
      let allData: any[] = [];
      let hasMore = true;
      let currentPage = 0;
      const pageSize = 1000;
      let finalError: any = null;

      const fetchPage = async (
        table: string,
        page: number
      ): Promise<{ data: any[]; error: any; hasMore: boolean }> => {
        const from = page * pageSize;
        const to = from + pageSize - 1;

        // Construir query base com filtro de comum
        // Tentar busca flexível: com e sem hífen (formato pode variar)
        const comumBuscaSemHifen = comumBusca.replace(/\s*-\s*/g, ' ').trim();
        const comumBuscaComHifen = comumBusca.includes(' - ') 
          ? comumBusca 
          : comumBusca.replace(/\s+/, ' - ');
        
        console.log(`🔍 Query página ${page + 1}:`, {
          comumBuscaOriginal: comumBusca,
          comumBuscaSemHifen,
          comumBuscaComHifen,
        });
        
        // Tentar busca com formato flexível (com OU sem hífen)
        // A tabela candidatos tem apenas 'instrumento' (texto), não 'instrumento_id'
        // 🚨 CORREÇÃO: Buscar também o campo 'cargo' e 'nivel' para usar os valores reais do banco
        let query = supabase
          .from(table)
          .select('nome, comum, cidade, instrumento, cargo, nivel')
          .or(`comum.ilike.%${comumBusca}%,comum.ilike.%${comumBuscaSemHifen}%,comum.ilike.%${comumBuscaComHifen}%`)
          .order('nome', { ascending: true });

        // Aplicar range para paginação
        const result = await query.range(from, to);
        
        console.log(`📊 Resultado query página ${page + 1}:`, {
          dataLength: result.data?.length || 0,
          error: result.error,
          sampleData: result.data?.slice(0, 3).map((c: any) => ({
            nome: c.nome,
            comum: c.comum,
          })),
        });

        return {
          data: result.data || [],
          error: result.error,
          hasMore: (result.data?.length || 0) === pageSize,
        };
      };

      // Buscar todas as páginas da tabela candidatos
      while (hasMore) {
        try {
          const pageResult = await fetchPage(tableName, currentPage);

          if (pageResult.error) {
            finalError = pageResult.error;
            console.error('❌ Erro ao buscar da tabela candidatos:', pageResult.error);
            break;
          }

          if (pageResult.data && pageResult.data.length > 0) {
            allData = allData.concat(pageResult.data);
            console.log(
              `📄 Página ${currentPage + 1}: ${pageResult.data.length} registros (total: ${allData.length})`
            );
          }

          hasMore = pageResult.hasMore;
          currentPage++;
        } catch (error) {
          finalError = error;
          console.error('❌ Erro ao buscar página:', error);
          break;
        }
      }

      if (allData.length === 0) {
        console.log('⚠️ Nenhum candidato encontrado com filtro de comum');
        // Testar buscar TODOS os candidatos para verificar se a tabela tem dados
        try {
          console.log('🔍 Teste 1: buscando TODOS os candidatos (sem filtro, sem RLS):');
          const testResult1 = await supabase
            .from(tableName)
            .select('nome, comum, cidade, instrumento, cargo, nivel')
            .limit(5)
            .order('nome', { ascending: true });
          console.log('📊 Resultado teste 1:', {
            dataLength: testResult1.data?.length || 0,
            error: testResult1.error,
            errorCode: testResult1.error?.code,
            errorMessage: testResult1.error?.message,
            sampleData: testResult1.data?.slice(0, 3).map((c: any) => ({
              nome: c.nome,
              comum: c.comum,
            })),
          });
          
          // Teste 2: buscar apenas pelo código BR-22-1739
          console.log('🔍 Teste 2: buscando pelo código BR-22-1739:');
          const testResult2 = await supabase
            .from(tableName)
            .select('nome, comum, cidade, instrumento, cargo, nivel')
            .ilike('comum', '%BR-22-1739%')
            .limit(5)
            .order('nome', { ascending: true });
          console.log('📊 Resultado teste 2:', {
            dataLength: testResult2.data?.length || 0,
            error: testResult2.error,
            sampleData: testResult2.data?.slice(0, 3).map((c: any) => ({
              nome: c.nome,
              comum: c.comum,
            })),
          });
          
          // Teste 3: buscar apenas pelo nome JARDIM MIRANDA
          console.log('🔍 Teste 3: buscando pelo nome JARDIM MIRANDA:');
          const testResult3 = await supabase
            .from(tableName)
            .select('nome, comum, cidade, instrumento, cargo, nivel')
            .ilike('comum', '%JARDIM MIRANDA%')
            .limit(5)
            .order('nome', { ascending: true });
          console.log('📊 Resultado teste 3:', {
            dataLength: testResult3.data?.length || 0,
            error: testResult3.error,
            sampleData: testResult3.data?.slice(0, 3).map((c: any) => ({
              nome: c.nome,
              comum: c.comum,
            })),
          });
        } catch (testError) {
          console.error('❌ Erro no teste:', testError);
        }
        return [];
      }

      console.log(`✅ Total de ${allData.length} registros encontrados na tabela ${tableName}`);

      // Remover duplicatas baseado em nome + comum (EXATAMENTE como fetchPessoasFromCadastro)
      const uniqueMap = new Map<string, any>();
      allData.forEach(r => {
        const nomeCompleto = (r.nome || '').trim();
        const comum = (r.comum || '').trim();
        const key = `${nomeCompleto}_${comum}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, r);
        }
      });

      const uniqueData = Array.from(uniqueMap.values());
      console.log(`✅ ${uniqueData.length} candidatos únicos após remover duplicatas`);

      return uniqueData;
    } catch (error) {
      console.error('❌ Erro ao buscar candidatos da tabela candidatos:', error);
      throw error;
    }
  },

  async getPessoasFromLocal(
    comumId?: string,
    cargoId?: string,
    instrumentoId?: string
  ): Promise<Pessoa[]> {
    // Se temos IDs, precisamos buscar os nomes primeiro
    let comumNome: string | undefined;
    let cargoNome: string | undefined;
    let instrumentoNome: string | undefined;

    // 🚀 OTIMIZAÇÃO: Buscar nomes dos IDs em paralelo
    const [comuns, cargos, instrumentos] = await Promise.all([
      comumId ? this.getComunsFromLocal() : Promise.resolve([]),
      cargoId ? this.getCargosFromLocal() : Promise.resolve([]),
      instrumentoId ? this.getInstrumentosFromLocal() : Promise.resolve([]),
    ]);

    if (comumId) {
      const comum = comuns.find(c => c.id === comumId);
      comumNome = comum?.nome;
    }

    if (cargoId) {
      const cargo = cargos.find(c => c.id === cargoId);
      cargoNome = cargo?.nome;
    }

    if (instrumentoId) {
      const instrumento = instrumentos.find(i => i.id === instrumentoId);
      instrumentoNome = instrumento?.nome;
    }

    // Se não encontrou os nomes, retornar vazio
    if (!comumNome || !cargoNome) {
      return [];
    }

    // Verificar se é cargo Candidato(a) - buscar da tabela candidatos
    // Normalizar para comparar (remover espaços e parênteses)
    const cargoNomeNormalizado = cargoNome.toUpperCase().replace(/\s+/g, '').replace(/[()]/g, '');
    if (cargoNomeNormalizado === 'CANDIDATOA' || cargoNomeNormalizado === 'CANDIDATO') {
      try {
        console.log('🔍 Buscando candidatos com:', {
          comumId,
          comumNome,
          cargoId,
          cargoNome,
        });
        const candidatosData = await this.fetchCandidatosFromSupabase(comumNome);
        console.log(`✅ ${candidatosData.length} candidatos retornados da busca`);

        // Buscar lista de instrumentos para converter nome (texto) para instrumento_id
        const instrumentos = await this.getInstrumentosFromLocal();

        // Converter para formato Pessoa[]
        const pessoas: Pessoa[] = candidatosData.map((p, index) => {
          const nomeCompleto = (p.nome || '').trim();
          const partesNome = nomeCompleto.split(' ').filter(p => p.trim());
          const primeiroNome = partesNome[0] || '';
          const ultimoNome = partesNome.length > 1 ? partesNome[partesNome.length - 1] : '';

          // Converter nome do instrumento (texto) para instrumento_id
          // A tabela candidatos tem apenas 'instrumento' (texto), não 'instrumento_id'
          let instrumentoId: string | null = null;
          if (p.instrumento) {
            const instrumentoNomeOriginal = (p.instrumento || '').trim();
            
            // 🚨 CORREÇÃO: Normalizar instrumento expandindo abreviações (ex: "RET" → "RETO")
            const instrumentoNomeNormalizado = normalizeInstrumentoForSearch(instrumentoNomeOriginal);
            
            // 🚨 CORREÇÃO: Criar variações de busca para encontrar mesmo com abreviações
            const variacoesBusca = expandInstrumentoSearch(instrumentoNomeOriginal);
            
            // 🚨 OTIMIZAÇÃO: Buscar instrumento pelo nome (case-insensitive e com variações)
            // Primeiro tentar busca exata com nome normalizado (mais rápida)
            let instrumentoEncontrado = instrumentos.find(inst => {
              const instNomeUpper = inst.nome.toUpperCase();
              return instNomeUpper === instrumentoNomeNormalizado || variacoesBusca.includes(instNomeUpper);
            });
            
            // Se não encontrou, tentar busca normalizada (sem acentos)
            if (!instrumentoEncontrado) {
              const instrumentoNomeSemAcentos = normalizeString(instrumentoNomeNormalizado);
              instrumentoEncontrado = instrumentos.find(inst => {
                const instNomeNormalizado = normalizeString(inst.nome.toUpperCase());
                return instNomeNormalizado === instrumentoNomeSemAcentos;
              });
            }
            
            instrumentoId = instrumentoEncontrado?.id || null;
            
            // 🚨 OTIMIZAÇÃO: Log apenas se não encontrou (evitar logs desnecessários)
            if (!instrumentoId && instrumentoNomeOriginal) {
              console.warn('⚠️ Instrumento não encontrado para candidato:', {
                instrumentoOriginal: instrumentoNomeOriginal,
                instrumentoNormalizado: instrumentoNomeNormalizado,
                variacoesBusca,
                totalInstrumentos: instrumentos.length,
              });
            }
          }

          const pessoa: Pessoa = {
            id: `candidato_${index}_${nomeCompleto.toLowerCase().replace(/\s+/g, '_')}`,
            nome: primeiroNome,
            sobrenome: ultimoNome,
            nome_completo: nomeCompleto,
            comum_id: comumId || '',
            cargo_id: cargoId || '',
            // 🚨 CORREÇÃO: Usar o cargo REAL da tabela candidatos (ex: "MÚSICO") ao invés de "Candidato(a)"
            cargo_real: (p.cargo || '').trim().toUpperCase() || 'MÚSICO', // Usar cargo do banco de dados
            instrumento_id: instrumentoId, // Converter nome do instrumento para ID
            cidade: (p.cidade || '').toUpperCase().trim(),
            // 🚨 CORREÇÃO: Mapear campo nivel da tabela candidatos (ex: "CANDIDATO", "OFICIALIZADO", "CULTO OFICIAL")
            nivel: (p.nivel || '').trim().toUpperCase() || 'CANDIDATO', // Usar nivel do banco de dados
            ativo: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          return pessoa;
        });

        return pessoas;
      } catch (error) {
        console.error('❌ Erro ao buscar candidatos:', error);
        return [];
      }
    }

    // Buscar pessoas da tabela cadastro (para outros cargos)
    try {
      console.log('🔍 [getPessoasFromLocal] Chamando fetchPessoasFromCadastro com:', {
        comumId,
        comumNome,
        cargoId,
        cargoNome,
        instrumentoId,
        instrumentoNome,
      });
      
      if (!comumNome) {
        console.error('❌ [getPessoasFromLocal] comumNome está vazio!');
        return [];
      }
      
      if (!cargoNome) {
        console.error('❌ [getPessoasFromLocal] cargoNome está vazio!');
        return [];
      }
      
      const pessoasData = await this.fetchPessoasFromCadastro(
        comumNome,
        cargoNome,
        instrumentoNome
      );

      console.log(`✅ [getPessoasFromLocal] ${pessoasData.length} pessoas retornadas de fetchPessoasFromCadastro`);
      
      if (pessoasData.length === 0) {
        console.warn('⚠️ [getPessoasFromLocal] Nenhuma pessoa encontrada - verificar logs de fetchPessoasFromCadastro');
      }

      // Converter para formato Pessoa[]
      const pessoas: Pessoa[] = pessoasData.map((p, index) => {
        const nomeCompleto = (p.nome || '').trim();
        const partesNome = nomeCompleto.split(' ').filter(p => p.trim());
        const primeiroNome = partesNome[0] || '';
        const ultimoNome = partesNome.length > 1 ? partesNome[partesNome.length - 1] : '';

        const pessoa: Pessoa = {
          id: `pessoa_${index}_${nomeCompleto.toLowerCase().replace(/\s+/g, '_')}`,
          nome: primeiroNome,
          sobrenome: ultimoNome, // Último nome para registro (será usado apenas primeiro + último no registro)
          nome_completo: nomeCompleto, // Nome completo para exibição na lista
          comum_id: comumId || '',
          cargo_id: cargoId || '',
          cargo_real: (p.cargo || '').toUpperCase().trim(), // Cargo real da pessoa no banco de dados
          instrumento_id: instrumentoId || null,
          cidade: (p.cidade || '').toUpperCase().trim(), // Incluir cidade da pessoa
          // 🚨 CORREÇÃO: Mapear campo nivel da tabela cadastro (ex: "CANDIDATO", "OFICIALIZADO", "CULTO OFICIAL")
          nivel: (p.nivel || '').trim().toUpperCase() || null, // Nível da pessoa no banco de dados
          ativo: true, // Campo obrigatório do tipo, mas não usado como filtro na busca
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Incluir classe_organista se existir (para Organistas) - usar campo 'nivel' da tabela apenas se for classe
        // Nota: nivel agora é um campo separado, classe_organista é apenas para organistas
        if (p.nivel && (p.nivel.toUpperCase().includes('OFICIALIZADA') || p.nivel.toUpperCase().includes('CLASSE'))) {
          pessoa.classe_organista = p.nivel.toUpperCase().trim();
        }

        return pessoa;
      });

      return pessoas;
    } catch (error) {
      console.error('❌ Erro ao buscar pessoas:', error);
      // Fallback: tentar buscar do banco local se houver
      try {
        const db = await getDatabase();
        let query = 'SELECT * FROM pessoas';
        const params: any[] = [];

        if (comumId) {
          query += ' AND comum_id = ?';
          params.push(comumId);
        }
        if (cargoId) {
          query += ' AND cargo_id = ?';
          params.push(cargoId);
        }
        if (instrumentoId) {
          query += ' AND instrumento_id = ?';
          params.push(instrumentoId);
        }

        query += ' ORDER BY nome, sobrenome';
        const result = (await db.getAllAsync(query, params)) as Pessoa[];
        return result.map(p => ({ ...p, ativo: (p as any).ativo === 1 }));
      } catch (fallbackError) {
        console.error('❌ Erro no fallback:', fallbackError);
        return [];
      }
    }
  },

  // Registros de Presença
  async createRegistroPresenca(
    registro: RegistroPresenca,
    skipDuplicateCheck = false
  ): Promise<RegistroPresenca> {
    // 🚨 OTIMIZAÇÃO: Medir tempo de processamento
    const inicioTempo = performance.now();
    
    if (!isSupabaseConfigured() || !supabase) {
      console.error('❌ Supabase não está configurado');
      throw new Error('Supabase não está configurado');
    }

    // 🚨 CORREÇÃO CRÍTICA: Garantir que sessão está restaurada antes de inserir
    // Mas não bloquear se não conseguir restaurar (RLS pode permitir algumas operações)
    try {
      const sessionRestored = await ensureSessionRestored();
      
      if (sessionRestored) {
        // Verificar autenticação apenas se conseguiu restaurar
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          console.warn('⚠️ Erro ao verificar autenticação:', authError.message);
        } else if (user) {
          console.log('🔐 Sessão restaurada com sucesso:', { userId: user.id });
        }
      } else {
        console.warn('⚠️ Não foi possível restaurar sessão. Tentando inserir mesmo assim (RLS pode permitir).');
      }
    } catch (sessionError) {
      console.warn('⚠️ Erro ao restaurar sessão (continuando...):', sessionError);
      // Continuar mesmo com erro - pode funcionar sem autenticação dependendo das políticas RLS
    }

    // Buscar nomes a partir dos IDs
    let [comuns, cargos, instrumentos] = await Promise.all([
      this.getComunsFromLocal(),
      this.getCargosFromLocal(),
      this.getInstrumentosFromLocal(),
    ]);

    // Se as listas estiverem vazias, tentar recarregar
    if (comuns.length === 0 || cargos.length === 0) {
      console.warn('⚠️ Listas vazias detectadas, recarregando dados...');
      await this.syncData();
      [comuns, cargos, instrumentos] = await Promise.all([
        this.getComunsFromLocal(),
        this.getCargosFromLocal(),
        this.getInstrumentosFromLocal(),
      ]);
    }

    // Verificar se é registro externo (do modal de novo registro)
    const isExternalRegistro = registro.comum_id.startsWith('external_');
    
    let comum: any = null;
    // 🚨 CRÍTICO: Tentar buscar cargo por ID primeiro, depois por nome (fallback)
    let cargoSelecionado = cargos.find(c => c.id === registro.cargo_id);
    if (!cargoSelecionado) {
      // Se não encontrou por ID, pode ser que cargo_id seja o nome (caso antigo)
      // Tentar buscar por nome como fallback
      cargoSelecionado = cargos.find(c => c.nome === registro.cargo_id);
      if (cargoSelecionado) {
        console.warn('⚠️ Cargo encontrado por nome, mas deveria ser por ID:', registro.cargo_id);
      }
    }
    
    if (isExternalRegistro) {
      // Para registros externos, extrair nome da comum do ID
      const comumNome = registro.comum_id.replace(/^external_/, '').replace(/_\d+$/, '');
      comum = { id: registro.comum_id, nome: comumNome };
    } else {
      comum = comuns.find(c => c.id === registro.comum_id);
    }
    
    const instrumento = registro.instrumento_id
      ? instrumentos.find(i => i.id === registro.instrumento_id)
      : null;

    if (!comum || !cargoSelecionado) {
      console.error('❌ Erro ao encontrar comum ou cargo:', {
        comum_id: registro.comum_id,
        cargo_id: registro.cargo_id,
        isExternal: isExternalRegistro,
        comuns_count: comuns.length,
        cargos_count: cargos.length,
        comuns_ids: comuns.map(c => c.id).slice(0, 5),
        cargos_ids: cargos.map(c => c.id).slice(0, 5),
        cargos_nomes: cargos.map(c => c.nome).slice(0, 5),
      });
      throw new Error('Dados incompletos: comum ou cargo não encontrados');
    }

    // Verificar se é nome manual (pessoa_id começa com "manual_")
    const isNomeManual = registro.pessoa_id.startsWith('manual_');
    let nomeCompleto = '';
    let cargoReal = cargoSelecionado.nome;
    let pessoa: Pessoa | null = null;

    if (isNomeManual) {
      // Extrair nome do pessoa_id (remove prefixo "manual_")
      nomeCompleto = registro.pessoa_id.replace(/^manual_/, '');
      // Para nomes manuais, usar cargo selecionado diretamente
      cargoReal = cargoSelecionado.nome;
    } else {
      // Buscar pessoa pelo ID (precisamos buscar da lista de pessoas carregadas)
      const pessoas = await this.getPessoasFromLocal(
        registro.comum_id,
        registro.cargo_id,
        registro.instrumento_id || undefined
      );
      pessoa = pessoas.find(p => p.id === registro.pessoa_id) || null;

      if (!pessoa) {
        throw new Error('Pessoa não encontrada');
      }

      // Usar cargo real da pessoa se disponível, senão usar o cargo selecionado
      cargoReal = pessoa.cargo_real || cargoSelecionado.nome;
      nomeCompleto = pessoa.nome_completo || `${pessoa.nome} ${pessoa.sobrenome}`;
    }

    const cargo = { ...cargoSelecionado, nome: cargoReal };

    // 🚨 CORREÇÃO: Sempre usar UUID v4 válido (formato: 75aef8f7-86fc-49fe-8a0c-973c9658d6e8)
    // Validar se UUID é válido, senão gerar novo UUID v4
    let uuid = registro.id || '';
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid || !uuidRegex.test(uuid)) {
      // Gerar UUID v4 válido
      uuid = uuidv4();
      console.log('🔄 UUID inválido detectado, gerando UUID v4 válido:', uuid);
    }

    // Buscar cidade da pessoa (se disponível)
    const cidade = isNomeManual ? '' : (pessoa as any)?.cidade || '';

    // Buscar nome do local de ensaio (se for ID, converter para nome)
    let localEnsaioNome = registro.local_ensaio || null;
    if (localEnsaioNome && /^\d+$/.test(localEnsaioNome)) {
      // Se for um número (ID), buscar o nome correspondente
      const locais: { id: string; nome: string }[] = [
        { id: '1', nome: 'Cotia' },
        { id: '2', nome: 'Caucaia do Alto' },
        { id: '3', nome: 'Fazendinha' },
        { id: '4', nome: 'Itapevi' },
        { id: '5', nome: 'Jandira' },
        { id: '6', nome: 'Pirapora' },
        { id: '7', nome: 'Vargem Grande' },
      ];
      const localEncontrado = locais.find(l => l.id === localEnsaioNome);
      localEnsaioNome = localEncontrado?.nome || localEnsaioNome;
    }

    // 🚨 CORREÇÃO: Para candidatos, buscar instrumento da pessoa se não tiver no registro
    // A pessoa candidata já tem o instrumento_id convertido do nome do instrumento
    let instrumentoParaSalvar = instrumento;
    if (!instrumentoParaSalvar && pessoa && pessoa.instrumento_id) {
      // Buscar instrumento pelo ID da pessoa
      const instrumentoDaPessoa = instrumentos.find(i => i.id === pessoa.instrumento_id);
      if (instrumentoDaPessoa) {
        instrumentoParaSalvar = instrumentoDaPessoa;
      }
    }

    // Buscar nivel da pessoa (OFICIALIZADO, CULTO OFICIAL ou CANDIDATO)
    // 🚨 CORREÇÃO: Normalizar nivel baseado em regras (instrumento e cargo)
    // IMPORTANTE: Calcular nivel DEPOIS de definir instrumentoParaSalvar
    let nivelPessoaOriginal = pessoa?.nivel || null;
    
    // 🚨 CORREÇÃO: Se for nome manual ou não houver pessoa, usar valor padrão baseado no cargo
    if (!nivelPessoaOriginal && isNomeManual) {
      // Para nomes manuais, tentar inferir nivel baseado no cargo
      if (cargoReal.toUpperCase().includes('CANDIDATO')) {
        nivelPessoaOriginal = 'CANDIDATO';
      } else {
        // Para outros cargos, deixar null (será normalizado depois)
        nivelPessoaOriginal = null;
      }
    }
    
    const nivelPessoa = normalizarNivel(
      nivelPessoaOriginal,
      instrumentoParaSalvar?.nome,
      cargoReal
    );
    
    // 🚨 OTIMIZAÇÃO: Log apenas se nivel não foi encontrado (evitar logs desnecessários)
    if (!nivelPessoa) {
      console.warn('⚠️ Nivel não encontrado:', {
        nivelPessoaOriginal,
        instrumentoParaSalvar: instrumentoParaSalvar?.nome,
        cargoReal,
        pessoaId: pessoa?.id,
        isNomeManual,
        pessoaNivel: pessoa?.nivel,
      });
    }

    // Normalizar para cargos femininos que tocam órgão (usar cargo real da pessoa)
    const normalizacao = normalizarRegistroCargoFeminino(
      cargoReal, // Usar cargo real da pessoa
      instrumentoParaSalvar?.nome,
      registro.classe_organista
    );

    // Usar valores normalizados se for cargo feminino
    const instrumentoFinal = normalizacao.isNormalizado
      ? normalizacao.instrumentoNome || 'ÓRGÃO'
      : instrumentoParaSalvar?.nome || null;

    // 🚨 CORREÇÃO: Calcular naipe sempre que houver instrumento (incluindo candidatos)
    const naipeInstrumento = normalizacao.isNormalizado
      ? normalizacao.naipeInstrumento || 'TECLADO'
      : instrumentoFinal // Usar instrumentoFinal ao invés de instrumentoParaSalvar para garantir que está normalizado
        ? getNaipeByInstrumento(instrumentoFinal)
        : null;
    
    // Log para debug se naipe não foi encontrado
    if (instrumentoFinal && !naipeInstrumento) {
      console.warn('⚠️ Naipe não encontrado para instrumento:', {
        instrumentoFinal,
        instrumentoParaSalvar: instrumentoParaSalvar?.nome,
        cargoReal,
      });
    }

    // 🚨 CORREÇÃO CRÍTICA: Para cargos femininos/órgão, classe_organista deve ser igual ao nivel
    // Se for cargo feminino (Organista, Instrutora, Examinadora, Secretária) ou órgão, usar o nivel normalizado como classe_organista
    const isOrgaoOuCargoFeminino = normalizacao.isNormalizado || 
      (instrumentoParaSalvar?.nome?.toUpperCase() === 'ÓRGÃO' || instrumentoParaSalvar?.nome?.toUpperCase() === 'ORGAO') ||
      isCargoFemininoOrganista(cargoReal);
    
    const classeOrganistaFinal = isOrgaoOuCargoFeminino && nivelPessoa
      ? nivelPessoa // Usar nivel como classe_organista para cargos femininos/órgão
      : normalizacao.isNormalizado
        ? normalizacao.classeOrganista || 'OFICIALIZADA'
        : registro.classe_organista || null;

    // Converter para formato da tabela presencas (nomes em maiúscula)
    const row = {
      uuid: uuid,
      nome_completo: nomeCompleto.trim().toUpperCase(),
      comum: comum.nome.toUpperCase(),
      cargo: cargoReal.toUpperCase(), // 🚨 CORREÇÃO: Usar cargo REAL da pessoa, não o selecionado
      instrumento: instrumentoFinal ? instrumentoFinal.toUpperCase() : null,
      naipe_instrumento: naipeInstrumento ? naipeInstrumento.toUpperCase() : null,
      classe_organista: classeOrganistaFinal ? classeOrganistaFinal.toUpperCase() : null, // Classe normalizada
      nivel: nivelPessoa && nivelPessoa.trim() ? nivelPessoa.toUpperCase() : null, // 🚨 CORREÇÃO: Campo nivel adicionado - coluna existe na tabela presencas do Supabase
      cidade: cidade.toUpperCase(),
      local_ensaio: localEnsaioNome?.toUpperCase() || null,
      data_ensaio: registro.data_hora_registro || new Date().toISOString(), // Usar ISO string ao invés de formato brasileiro
      registrado_por: (() => {
        // Extrair apenas primeiro e último nome do usuário
        const nomeUsuario = registro.usuario_responsavel || '';
        if (!nomeUsuario) return null;
        const nomeFormatado = extractFirstAndLastName(nomeUsuario);
        return nomeFormatado || null;
      })(),
      created_at: registro.created_at || new Date().toISOString(),
    };

    // 🛡️ VERIFICAÇÃO DE DUPLICADOS: Verificar se já existe registro no mesmo dia
    // IMPORTANTE: Verificar por nome + comum + cargo REAL (não importa o instrumento ou local de ensaio)
    // Baseado na lógica do backupcont/app.js
    // Pular verificação se skipDuplicateCheck = true (usuário confirmou duplicata)
    if (!skipDuplicateCheck) {
    try {
      const nomeBusca = row.nome_completo.trim().toUpperCase();
      const comumBusca = row.comum.trim().toUpperCase();
      const cargoBusca = row.cargo.trim().toUpperCase(); // Cargo REAL já está em row.cargo

      // Extrair apenas a data (sem hora) para comparação
      const dataRegistro = new Date(row.data_ensaio);
      const dataInicio = new Date(
        dataRegistro.getFullYear(),
        dataRegistro.getMonth(),
        dataRegistro.getDate()
      );
      const dataFim = new Date(dataInicio);
      dataFim.setDate(dataFim.getDate() + 1);

      console.log('🔍 Verificando duplicados:', {
        nome: nomeBusca,
        comum: comumBusca,
        cargo: cargoBusca,
        dataInicio: dataInicio.toISOString(),
        dataFim: dataFim.toISOString(),
      });

      const { data: duplicatas, error: duplicataError } = await supabase
        .from('presencas')
        .select('uuid, nome_completo, comum, cargo, data_ensaio, created_at')
        .ilike('nome_completo', nomeBusca)
        .ilike('comum', comumBusca)
        .ilike('cargo', cargoBusca)
        .gte('data_ensaio', dataInicio.toISOString())
        .lt('data_ensaio', dataFim.toISOString());

      if (duplicataError) {
        console.warn('⚠️ Erro ao verificar duplicatas:', duplicataError);
        // Continuar mesmo com erro na verificação
      } else if (duplicatas && duplicatas.length > 0) {
        const duplicata = duplicatas[0];
        console.error('🚨🚨🚨 DUPLICATA DETECTADA - BLOQUEANDO INSERÇÃO 🚨🚨🚨', {
          nome: nomeBusca,
          comum: comumBusca,
          cargo: cargoBusca,
          uuidExistente: duplicata.uuid,
          dataExistente: duplicata.data_ensaio,
          created_at: duplicata.created_at,
        });

        // Formatar data e horário do registro existente
        const dataExistente = new Date(duplicata.data_ensaio || duplicata.created_at);
        const dataFormatada = dataExistente.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const horarioFormatado = dataExistente.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        // Lançar erro para bloquear inserção com informações formatadas
        throw new Error(
          `DUPLICATA_BLOQUEADA:DUPLICATA:${nomeBusca}|${comumBusca}|${dataFormatada}|${horarioFormatado}`
        );
      }
    } catch (error) {
      // Se o erro for de duplicata bloqueada, propagar o erro
      if (error instanceof Error && error.message.includes('DUPLICATA_BLOQUEADA')) {
        console.error('🚨🚨🚨 BLOQUEIO DEFINITIVO DE DUPLICATA 🚨🚨🚨');
        throw error;
      }
      // Outros erros na verificação não devem bloquear
      console.warn('⚠️ Erro ao verificar duplicatas (continuando...):', error);
      }
    }

    // 🚨 OTIMIZAÇÃO: Log apenas se nivel estiver null (evitar logs desnecessários)
    if (!row.nivel) {
      console.warn('⚠️ Nivel será NULL no Supabase:', {
        nivelPessoa,
        nivelPessoaOriginal,
        pessoaNivel: pessoa?.nivel,
        isNomeManual,
        cargoReal,
      });
    }
    
    // 🚨 OTIMIZAÇÃO: Log resumido ao invés de JSON completo (mais rápido)
    console.log('📤 Enviando para Supabase (tabela presencas):', {
      uuid: row.uuid,
      nome: row.nome_completo,
      comum: row.comum,
      cargo: row.cargo,
      instrumento: row.instrumento,
      nivel: row.nivel,
    });

    // 🚨 CORREÇÃO CRÍTICA: Tentar inserir com retry e logs detalhados
    let tentativas = 0;
    const maxTentativas = 3;
    let ultimoErro: any = null;

    while (tentativas < maxTentativas) {
      tentativas++;
      console.log(`📤 Tentativa ${tentativas}/${maxTentativas} de inserir no Supabase...`);

      try {
        const { data, error } = await supabase.from('presencas').insert(row).select().single();

        if (error) {
          ultimoErro = error;
          console.error(`❌ Erro ao inserir no Supabase (tentativa ${tentativas}):`, {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
            row: JSON.stringify(row, null, 2),
          });

          // Se for erro de autenticação ou sessão, tentar restaurar sessão e tentar novamente
          if (
            (error.code === 'PGRST301' || error.message?.includes('JWT') || error.message?.includes('session') || error.message?.includes('permission')) &&
            tentativas < maxTentativas
          ) {
            console.log('🔄 Tentando restaurar sessão e tentar novamente...');
            await ensureSessionRestored();
            await new Promise(resolve => setTimeout(resolve, 500)); // Aguardar 500ms
            continue; // Tentar novamente
          }

          // Se não for erro de sessão ou já tentou todas as vezes, lançar erro
          if (tentativas >= maxTentativas) {
            console.error('❌❌❌ FALHA DEFINITIVA AO INSERIR NO SUPABASE ❌❌❌', error);
            throw error;
          }
        } else {
          const tempoTotal = performance.now() - inicioTempo;
          console.log(`✅✅✅ Registro salvo no Supabase com sucesso ✅✅✅ (${tempoTotal.toFixed(2)}ms):`, data);
          // Retornar registro atualizado
          return {
            ...registro,
            id: data.uuid || uuid,
            status_sincronizacao: 'synced',
          };
        }
      } catch (error) {
        ultimoErro = error;
        console.error(`❌ Exceção ao inserir no Supabase (tentativa ${tentativas}):`, error);
        
        if (tentativas >= maxTentativas) {
          console.error('❌❌❌ FALHA DEFINITIVA APÓS TODAS AS TENTATIVAS ❌❌❌', error);
          throw error;
        }
        
        // Aguardar antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 1000 * tentativas));
      }
    }

    // Se chegou aqui, todas as tentativas falharam
    console.error('❌❌❌ TODAS AS TENTATIVAS FALHARAM ❌❌❌', ultimoErro);
    throw ultimoErro || new Error('Falha ao inserir no Supabase após múltiplas tentativas');
  },

  async getRegistrosPendentesFromLocal(): Promise<RegistroPresenca[]> {
    if (Platform.OS === 'web') {
      // Para web, usar cache em memória ou AsyncStorage
      if (memoryCache.registros.length > 0) {
        return memoryCache.registros.filter(r => r.status_sincronizacao === 'pending');
      }
      try {
        const cached = await robustGetItem('cached_registros');
        if (cached) {
          const registros = JSON.parse(cached);
          // Validar e sanitizar dados
          const validRegistros = registros.filter((r: any) => 
            isValidString(r.id) && r.status_sincronizacao
          );
          memoryCache.registros = validRegistros;
          return validRegistros.filter((r: RegistroPresenca) => r.status_sincronizacao === 'pending');
        }
      } catch (error) {
        console.warn('⚠️ Erro ao ler registros do cache robusto:', error);
      }
      return [];
    }

    // Para mobile, usar SQLite
    const db = await getDatabase();
    const result = (await db.getAllAsync(
      "SELECT * FROM registros_presenca WHERE status_sincronizacao = 'pending' ORDER BY created_at"
    )) as RegistroPresenca[];
    return result.map(r => ({
      ...r,
      status_sincronizacao: r.status_sincronizacao as 'pending' | 'synced',
    }));
  },

  async getAllRegistrosFromLocal(): Promise<RegistroPresenca[]> {
    if (Platform.OS === 'web') {
      // Para web, usar cache em memória ou AsyncStorage
      if (memoryCache.registros.length > 0) {
        return memoryCache.registros;
      }
      try {
        const cached = await robustGetItem('cached_registros');
        if (cached) {
          const registros = JSON.parse(cached);
          // Validar e sanitizar dados
          const validRegistros = registros.filter((r: any) => 
            isValidString(r.id) && r.status_sincronizacao
          );
          memoryCache.registros = validRegistros;
          return validRegistros;
        }
      } catch (error) {
        console.warn('⚠️ Erro ao ler registros do cache robusto:', error);
      }
      return [];
    }

    // Para mobile, usar SQLite
    const db = await getDatabase();
    const result = (await db.getAllAsync(
      'SELECT * FROM registros_presenca ORDER BY created_at'
    )) as RegistroPresenca[];
    return result.map(r => ({
      ...r,
      status_sincronizacao: r.status_sincronizacao as 'pending' | 'synced',
    }));
  },

  async deleteRegistroFromLocal(id: string): Promise<void> {
    if (Platform.OS === 'web') {
      // Para web, remover do cache em memória e AsyncStorage
      memoryCache.registros = memoryCache.registros.filter(r => r.id !== id);
      try {
        await robustSetItem('cached_registros', JSON.stringify(memoryCache.registros));
      } catch (error) {
        console.warn('⚠️ Erro ao remover registro do cache:', error);
      }
      return;
    }

    // Para mobile, usar SQLite
    const db = await getDatabase();
    await db.runAsync('DELETE FROM registros_presenca WHERE id = ?', [id]);
  },

  async saveRegistroToLocal(registro: RegistroPresenca): Promise<void> {
    // 🚨 BLOQUEIO CRÍTICO: Prevenir salvamentos simultâneos do mesmo registro
    const saveKey = `${registro.pessoa_id}_${registro.comum_id}_${registro.cargo_id}_${registro.data_hora_registro}`;
    const now = Date.now();
    
    // Se está salvando o mesmo registro em menos de 3 segundos, bloquear
    if (savingLock && 
        lastSaveKey === saveKey && 
        (now - lastSaveTimestamp) < 3000) {
      console.warn('🚨 [BLOQUEIO] Salvamento duplicado bloqueado');
      return;
    }
    
    // Ativar lock
    savingLock = true;
    lastSaveTimestamp = now;
    lastSaveKey = saveKey;
    
    try {
      // 🛡️ VERIFICAÇÃO RÁPIDA DE DUPLICATA (mais eficiente - verifica primeiro)
      const registrosPendentes = await this.getRegistrosPendentesFromLocal();
      const dataRegistro = new Date(registro.data_hora_registro);
      const dataRegistroStr = dataRegistro.toISOString().split('T')[0];
      
      // Verificação rápida: mesmo pessoa_id, comum_id, cargo_id e data
      const isDuplicataRapida = registrosPendentes.some(r => {
        const rData = new Date(r.data_hora_registro);
        const rDataStr = rData.toISOString().split('T')[0];
        return (
          r.pessoa_id === registro.pessoa_id &&
          r.comum_id === registro.comum_id &&
          r.cargo_id === registro.cargo_id &&
          rDataStr === dataRegistroStr &&
          r.status_sincronizacao === 'pending'
        );
      });
      
      if (isDuplicataRapida) {
        console.warn('🚨 [BLOQUEIO] Duplicata detectada - NÃO será salvo');
        return;
      }
      
      // 🛡️ VERIFICAÇÃO DETALHADA DE DUPLICATA (apenas se passou na rápida)
      try {
        // Buscar dados para comparação (com tratamento de erro)
        let comuns: Comum[] = [];
        let cargos: Cargo[] = [];
        let pessoas: Pessoa[] = [];
        
        try {
          [comuns, cargos] = await Promise.all([
            this.getComunsFromLocal(),
            this.getCargosFromLocal(),
          ]);
        } catch (error) {
          console.warn('⚠️ Erro ao buscar comuns/cargos para validação de duplicata:', error);
        }

        // Verificar se é registro manual (pessoa_id começa com "manual_")
        const isManualRegistro = registro.pessoa_id.startsWith('manual_');
        
        if (!isManualRegistro) {
          try {
            pessoas = await this.getPessoasFromLocal(
              registro.comum_id,
              registro.cargo_id,
              registro.instrumento_id || undefined
            );
          } catch (error) {
            console.warn('⚠️ Erro ao buscar pessoas para validação de duplicata:', error);
          }
        }

        const comum = comuns.find(c => c.id === registro.comum_id);
        const cargo = cargos.find(c => c.id === registro.cargo_id);
        const pessoa = isManualRegistro ? null : pessoas.find(p => p.id === registro.pessoa_id);
        
        // Preparar dados para comparação
        let nomeBusca = '';
        let comumBusca = '';
        let cargoBusca = '';
        
        if (isManualRegistro) {
          // Para registros manuais, usar o nome do pessoa_id
          nomeBusca = registro.pessoa_id.replace(/^manual_/, '').trim().toUpperCase();
          comumBusca = comum?.nome.toUpperCase() || '';
          cargoBusca = cargo?.nome.toUpperCase() || '';
        } else if (comum && cargo && pessoa) {
          nomeBusca = (pessoa.nome_completo || `${pessoa.nome} ${pessoa.sobrenome}`).trim().toUpperCase();
          comumBusca = comum.nome.toUpperCase();
          cargoBusca = (pessoa.cargo_real || cargo.nome).toUpperCase();
        } else {
          // Se não conseguiu buscar dados, usar verificação simplificada
          const dataRegistro = new Date(registro.data_hora_registro);
          const dataRegistroStr = dataRegistro.toISOString().split('T')[0];
          
          // Verificação simplificada: mesmo pessoa_id, comum_id, cargo_id e data
          const isDuplicata = registrosPendentes.some(r => {
            const rData = new Date(r.data_hora_registro);
            const rDataStr = rData.toISOString().split('T')[0];
            return (
              r.pessoa_id === registro.pessoa_id &&
              r.comum_id === registro.comum_id &&
              r.cargo_id === registro.cargo_id &&
              rDataStr === dataRegistroStr &&
              r.status_sincronizacao === 'pending'
            );
          });
          
          if (isDuplicata) {
            console.warn('🚨 [BLOQUEIO] Duplicata detectada (verificação simplificada)');
            return;
          }
        }

        if (nomeBusca && comumBusca && cargoBusca) {
          const dataRegistro = new Date(registro.data_hora_registro);
          const dataRegistroStr = dataRegistro.toISOString().split('T')[0]; // YYYY-MM-DD

          // Verificar se já existe registro duplicado na fila
          for (const r of registrosPendentes) {
            try {
              const rIsManual = r.pessoa_id.startsWith('manual_');
              const rComum = comuns.find(c => c.id === r.comum_id);
              const rCargo = cargos.find(c => c.id === r.cargo_id);
              
              let rNome = '';
              let rComumBusca = '';
              let rCargoBusca = '';
              
              if (rIsManual) {
                rNome = r.pessoa_id.replace(/^manual_/, '').trim().toUpperCase();
                rComumBusca = rComum?.nome.toUpperCase() || '';
                rCargoBusca = rCargo?.nome.toUpperCase() || '';
              } else {
                const rPessoas = await this.getPessoasFromLocal(
                  r.comum_id,
                  r.cargo_id,
                  r.instrumento_id || undefined
                );
                const rPessoa = rPessoas.find(p => p.id === r.pessoa_id);
                
                if (rComum && rCargo && rPessoa) {
                  rNome = (rPessoa.nome_completo || `${rPessoa.nome} ${rPessoa.sobrenome}`).trim().toUpperCase();
                  rComumBusca = rComum.nome.toUpperCase();
                  rCargoBusca = (rPessoa.cargo_real || rCargo.nome).toUpperCase();
                }
              }

              if (rNome && rComumBusca && rCargoBusca) {
                const rData = new Date(r.data_hora_registro);
                const rDataStr = rData.toISOString().split('T')[0];

                // 🚨 CRÍTICO: Se for duplicata (mesmo nome, comum, cargo e data), BLOQUEAR salvamento
                if (
                  rNome === nomeBusca &&
                  rComumBusca === comumBusca &&
                  rCargoBusca === cargoBusca &&
                  rDataStr === dataRegistroStr &&
                  r.id !== registro.id // Não é o mesmo registro
                ) {
                  console.warn('🚨 [DUPLICATA BLOQUEADA] Registro duplicado detectado na fila - NÃO será salvo:', {
                    nome: nomeBusca,
                    comum: comumBusca,
                    cargo: cargoBusca,
                    data: dataRegistroStr,
                    registroExistente: r.id,
                  });
                  // BLOQUEAR salvamento - retornar imediatamente
                  return;
                }
              }
            } catch (error) {
              // Se houver erro ao verificar um registro, continuar com os outros
              console.warn('⚠️ Erro ao verificar duplicata para registro:', r.id, error);
            }
          }
        }
      } catch (error) {
        // Se houver erro na validação de duplicata, logar mas continuar com o salvamento
        console.warn('⚠️ Erro na validação de duplicata, continuando com salvamento:', error);
      }

      // Sempre usar UUID v4 válido
      const id = registro.id && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registro.id)
        ? registro.id
        : uuidv4();
      
      // 🚨 VERIFICAÇÃO CRÍTICA: Verificar se UUID já existe na fila (reutilizar variável já declarada)
      const existeComMesmoId = registrosPendentes.find(r => r.id === id);
      if (existeComMesmoId) {
        console.warn('🚨 [BLOQUEIO] Registro com mesmo UUID já existe na fila');
        return;
      }
      const now = new Date().toISOString();
      const registroCompleto: RegistroPresenca = {
        ...registro,
        id,
        created_at: registro.created_at || now,
        updated_at: registro.updated_at || now,
      };

      if (Platform.OS === 'web') {
        // Para web, usar cache em memória e AsyncStorage
        const existingIndex = memoryCache.registros.findIndex(r => r.id === id);
        if (existingIndex >= 0) {
          memoryCache.registros[existingIndex] = registroCompleto;
        } else {
          memoryCache.registros.push(registroCompleto);
        }

        try {
          await robustSetItem('cached_registros', JSON.stringify(memoryCache.registros));
        } catch (error) {
          console.error('❌ Erro ao salvar no cache web:', error);
          // Tentar salvar novamente
          try {
            const registrosExistentes = await robustGetItem('cached_registros');
            const registros = registrosExistentes ? JSON.parse(registrosExistentes) : [];
            registros.push(registroCompleto);
            await robustSetItem('cached_registros', JSON.stringify(registros));
          } catch (retryError) {
            console.error('❌ Erro crítico ao salvar:', retryError);
            throw retryError;
          }
        }
        return;
      }

      // Para mobile, usar SQLite
      try {
        const db = await getDatabase();
        await db.runAsync(
          `INSERT OR REPLACE INTO registros_presenca 
           (id, pessoa_id, comum_id, cargo_id, instrumento_id, local_ensaio, data_hora_registro, usuario_responsavel, status_sincronizacao, created_at, updated_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            registro.pessoa_id,
            registro.comum_id,
            registro.cargo_id,
            registro.instrumento_id || null,
            registro.local_ensaio,
            registro.data_hora_registro,
            registro.usuario_responsavel,
            registro.status_sincronizacao,
            registro.created_at || now,
            registro.updated_at || now,
          ]
        );
      } catch (error) {
        console.error('❌ Erro ao salvar no SQLite:', error);
        // Tentar novamente
        try {
          const db = await getDatabase();
          await db.runAsync(
            `INSERT OR REPLACE INTO registros_presenca 
             (id, pessoa_id, comum_id, cargo_id, instrumento_id, local_ensaio, data_hora_registro, usuario_responsavel, status_sincronizacao, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id,
              registro.pessoa_id,
              registro.comum_id,
              registro.cargo_id,
              registro.instrumento_id || null,
              registro.local_ensaio,
              registro.data_hora_registro,
              registro.usuario_responsavel,
              registro.status_sincronizacao,
              registro.created_at || now,
              registro.updated_at || now,
            ]
          );
        } catch (retryError) {
          console.error('❌ Erro crítico ao salvar:', retryError);
          throw retryError;
        }
      }
    } catch (error) {
      console.error('❌ ERRO CRÍTICO em saveRegistroToLocal:', error);
      throw error; // Re-lançar erro para ser tratado no nível superior
    } finally {
      // Liberar lock após 1 segundo (tempo suficiente para evitar duplicatas)
      setTimeout(() => {
        savingLock = false;
      }, 1000);
    }
  },

  async updateRegistroStatus(id: string, status: 'pending' | 'synced'): Promise<void> {
    if (Platform.OS === 'web') {
      // Para web, atualizar cache em memória e AsyncStorage
      const registro = memoryCache.registros.find(r => r.id === id);
      if (registro) {
        registro.status_sincronizacao = status;
        registro.updated_at = new Date().toISOString();
        try {
          await robustSetItem('cached_registros', JSON.stringify(memoryCache.registros));
        } catch (error) {
          console.warn('⚠️ Erro ao atualizar registro no cache:', error);
        }
      }
      return;
    }

    // Para mobile, usar SQLite
    const db = await getDatabase();
    await db.runAsync(
      `UPDATE registros_presenca SET status_sincronizacao = ?, updated_at = ? WHERE id = ?`,
      [status, new Date().toISOString(), id]
    );
  },

  async countRegistrosPendentes(): Promise<number> {
    if (Platform.OS === 'web') {
      // Para web, usar cache em memória ou AsyncStorage
      if (memoryCache.registros.length > 0) {
        return memoryCache.registros.filter(r => r.status_sincronizacao === 'pending').length;
      }
      try {
        const cached = await robustGetItem('cached_registros');
        if (cached) {
          const registros = JSON.parse(cached);
          // Validar e sanitizar dados
          const validRegistros = registros.filter((r: any) => 
            isValidString(r.id) && r.status_sincronizacao
          );
          memoryCache.registros = validRegistros;
          return validRegistros.filter((r: RegistroPresenca) => r.status_sincronizacao === 'pending').length;
        }
      } catch (error) {
        console.warn('⚠️ Erro ao contar registros do cache robusto:', error);
      }
      return 0;
    }

    // Para mobile, usar SQLite
    try {
      const db = await getDatabase();
      const result = (await db.getFirstAsync(
        "SELECT COUNT(*) as count FROM registros_presenca WHERE status_sincronizacao = 'pending'"
      )) as { count: number } | null;
      return result?.count || 0;
    } catch (error) {
      console.error('❌ Erro ao contar registros pendentes:', error);
      return 0;
    }
  },

  /**
   * Extrai o nome da comum removendo o código de localização
   * Exemplo: "BR-22-1739 - JARDIM MIRANDA" -> "JARDIM MIRANDA"
   */
  extrairNomeComum(comumCompleto: string): string {
    if (!comumCompleto) return '';
    // Se contém " - ", pegar a parte depois do " - "
    if (comumCompleto.includes(' - ')) {
      const partes = comumCompleto.split(' - ');
      return partes.slice(1).join(' - ').trim();
    }
    // Se contém apenas " -" (sem espaço antes), também tentar separar
    if (comumCompleto.includes(' -')) {
      const partes = comumCompleto.split(' -');
      return partes.slice(1).join(' -').trim();
    }
    // Se não tem separador, retornar como está
    return comumCompleto.trim();
  },

  /**
   * Busca registros da tabela presencas do Supabase filtrados por local_ensaio
   * Permite busca por nome, cargo ou comum
   */
  async fetchRegistrosFromSupabase(
    localEnsaio: string,
    searchTerm?: string
  ): Promise<any[]> {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase não está configurado');
    }

    try {
      console.log('🔍 Buscando registros do Supabase para local:', localEnsaio);
      console.log('🔍 Termo de busca:', searchTerm || 'nenhum');

      const localTrimmed = localEnsaio.trim();

      // Se não há termo de busca, buscar todos os registros do local
      if (!searchTerm || !searchTerm.trim()) {
        const { data, error } = await supabase
          .from('presencas')
          .select('*')
          .ilike('local_ensaio', `%${localTrimmed}%`)
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) {
          console.error('❌ Erro ao buscar registros:', error);
          throw error;
        }

        console.log(`✅ Encontrados ${data?.length || 0} registros do local ${localTrimmed}`);
        return data || [];
      }

      // Se há termo de busca, fazer 3 queries separadas e combinar
      const searchTermTrimmed = searchTerm.trim();

      const promises = [
        supabase
          .from('presencas')
          .select('*')
          .ilike('local_ensaio', `%${localTrimmed}%`)
          .ilike('nome_completo', `%${searchTermTrimmed}%`)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('presencas')
          .select('*')
          .ilike('local_ensaio', `%${localTrimmed}%`)
          .ilike('cargo', `%${searchTermTrimmed}%`)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('presencas')
          .select('*')
          .ilike('local_ensaio', `%${localTrimmed}%`)
          .ilike('comum', `%${searchTermTrimmed}%`)
          .order('created_at', { ascending: false })
          .limit(500),
      ];

      const results = await Promise.all(promises);
      const allData: any[] = [];
      const seenUUIDs = new Set<string>();

      // Combinar resultados removendo duplicatas
      results.forEach((result, idx) => {
        if (result && result.data && Array.isArray(result.data)) {
          console.log(`🔍 Resultado da query ${idx + 1}:`, result.data.length, 'registros');
          result.data.forEach(item => {
            const uuid = item.uuid || item.UUID || `${item.nome_completo || ''}_${item.comum || ''}`;
            if (!seenUUIDs.has(uuid)) {
              seenUUIDs.add(uuid);
              allData.push(item);
            }
          });
        } else if (result && result.error) {
          console.error(`❌ Erro na query ${idx + 1}:`, result.error);
        }
      });

      // Ordenar por data de criação (mais recente primeiro)
      allData.sort((a, b) => {
        const dateA = new Date(a.created_at || a.CREATED_AT || 0).getTime();
        const dateB = new Date(b.created_at || b.CREATED_AT || 0).getTime();
        return dateB - dateA;
      });

      console.log(`✅ Total de registros únicos encontrados: ${allData.length}`);
      return allData.slice(0, 500); // Limitar a 500 registros
    } catch (error) {
      console.error('❌ Erro ao buscar registros do Supabase:', error);
      throw error;
    }
  },

  /**
   * Atualiza um registro na tabela presencas do Supabase
   */
  async updateRegistroInSupabase(
    uuid: string,
    updateData: {
      nome_completo?: string;
      comum?: string;
      cidade?: string;
      cargo?: string;
      nivel?: string; // 🚨 CORREÇÃO: Adicionar campo nivel
      instrumento?: string;
      naipe_instrumento?: string;
      classe_organista?: string;
      data_ensaio?: string;
      anotacoes?: string;
    }
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured() || !supabase) {
      return { success: false, error: 'Supabase não está configurado' };
    }

    try {
      console.log('💾 Atualizando registro no Supabase:', uuid, updateData);

      // Remover campos que não existem na tabela presencas
      const { anotacoes, ...supabaseUpdateData } = updateData;

      const { data, error } = await supabase
        .from('presencas')
        .update({
          ...supabaseUpdateData,
          updated_at: new Date().toISOString(),
        })
        .eq('uuid', uuid)
        .select();

      if (error) {
        console.error('❌ Erro ao atualizar registro no Supabase:', error);
        return { success: false, error: error.message };
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ Nenhum registro foi atualizado (pode ser problema de permissões RLS)');
        return { success: false, error: 'Nenhum registro foi atualizado' };
      }

      console.log('✅ Registro atualizado com sucesso no Supabase');
      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao atualizar registro no Supabase:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  },
};
