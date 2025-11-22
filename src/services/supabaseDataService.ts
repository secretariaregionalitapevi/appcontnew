import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Comum, Cargo, Instrumento, Pessoa, RegistroPresenca } from '../types/models';
import { getDatabase } from '../database/database';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { uuidv4 } from '../utils/uuid';
import { getNaipeByInstrumento } from '../utils/instrumentNaipe';
import { normalizarRegistroCargoFeminino } from '../utils/normalizeCargoFeminino';
import { extractFirstAndLastName } from '../utils/userNameUtils';
import { robustGetItem, robustSetItem, robustRemoveItem, initializeStorage } from '../utils/robustStorage';
import { normalizeForSearch, normalizeString, sanitizeString, isValidString } from '../utils/stringNormalization';
import { getDeviceInfo, logDeviceInfo, isXiaomiDevice } from '../utils/deviceDetection';

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
  'FAGOTE',
  'SAXOFONE SOPRANO (RETO)',
  'SAXOFONE ALTO',
  'SAXOFONE TENOR',
  'SAXOFONE BARÍTONO',
  'SAX OCTA CONTRABAIXO',
  'TROMPA',
  'TROMPETE',
  'CORNET',
  'FLUGELHORN',
  'TROMBONE',
  'TROMBONITO',
  'EUFÔNIO',
  'BARÍTONO (PISTO)',
  'TUBA',
  'ÓRGÃO',
];

// Lista fixa de cargos do backup.js (ordem exata do CARGOS_FIXED)
const CARGOS_FIXED = [
  'Músico',
  'Organista',
  'Candidato(a)',
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
      // Determinar se é cargo musical baseado no nome (apenas Músico e Organista requerem instrumento obrigatório)
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
      // Apenas Músico e Organista requerem instrumento obrigatório
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
      console.log('📚 Buscando pessoas da tabela cadastro:', {
        comumNome,
        cargoNome,
        instrumentoNome,
      });

      // Normalizar valores para busca
      const comumBusca = comumNome.trim();
      const cargoBusca = cargoNome.trim().toUpperCase();
      const instrumentoBusca = instrumentoNome?.trim().toUpperCase();

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

        // Construir query base com filtro de comum (incluindo cidade e nivel - que é a classe da organista)
        let query = supabase
          .from(table)
          .select('nome, comum, cargo, instrumento, cidade, nivel')
          .ilike('comum', `%${comumBusca}%`)
          .order('nome', { ascending: true });

        // Aplicar filtros de cargo e instrumento diretamente na query (seguindo lógica do app.js)
        if (cargoBusca === 'ORGANISTA') {
          // Para organista, busca por instrumento ÓRGÃO para retornar todas as organistas
          // (incluindo instrutoras, examinadoras, secretárias da música)
          // Isso permite que ao selecionar um nome, o cargo real seja capturado do banco
          query = query.ilike('instrumento', '%ÓRGÃO%');
        } else if (cargoBusca === 'MÚSICO' || cargoBusca.includes('MÚSICO')) {
          // Para músico, busca por instrumento específico para retornar todos que tocam aquele instrumento
          // (incluindo instrutores, secretários da música, encarregados)
          // Isso permite que ao selecionar um nome, o cargo real seja capturado do banco
          if (instrumentoBusca) {
            query = query.ilike('instrumento', `%${instrumentoBusca}%`);
          } else {
            // Se não tem instrumento, buscar apenas por cargo MÚSICO (sem instrutores/secretários)
            query = query.ilike('cargo', '%MÚSICO%').not('cargo', 'ilike', '%SECRETÁRIO%');
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

  // Buscar candidatos da tabela candidatos (seguindo lógica similar ao cadastro)
  async fetchCandidatosFromSupabase(
    comumNome?: string,
    nomeBusca?: string
  ): Promise<any[]> {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase não está configurado');
    }

    try {
      console.log('📚 Buscando candidatos da tabela candidatos:', {
        comumNome,
        nomeBusca,
      });

      // Preparar valores para busca
      // NÃO normalizar o comum - manter formato original para melhor matching
      // O formato na tabela é "BR-22-1739 - JARDIM MIRANDA" (com hífen e espaço)
      const comumBusca = comumNome ? comumNome.trim().toUpperCase() : '';
      const nomeBuscaNormalizado = nomeBusca ? normalizeForSearch(nomeBusca.trim()) : '';

      console.log('🔍 Parâmetros de busca:', {
        comumNomeOriginal: comumNome,
        comumBusca,
        nomeBusca,
      });

      // Usar tabela candidatos
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

        // Construir query base
        let query = supabase
          .from(table)
          .select('nome, comum, cidade, instrumento')
          .order('nome', { ascending: true });

        // Aplicar filtros de busca
        if (comumBusca) {
          // Buscar por comum - usar ilike para busca flexível (case-insensitive)
          // Buscar tanto o código completo quanto apenas a parte do nome
          // Exemplo: "BR-22-1739 - JARDIM MIRANDA" ou apenas "JARDIM MIRANDA"
          const partesComum = comumBusca.split(/\s+-\s+/); // Separar código e nome
          const codigoComum = partesComum[0]?.trim(); // Ex: "BR-22-1739"
          const nomeComum = partesComum[1]?.trim() || partesComum[0]?.trim(); // Ex: "JARDIM MIRANDA" ou o próprio código se não tiver hífen
          
          // Buscar por código OU nome (mais flexível)
          if (codigoComum && codigoComum !== nomeComum) {
            // Se tem código separado, buscar por ambos
            query = query.or(`comum.ilike.%${codigoComum}%,comum.ilike.%${nomeComum}%`);
          } else {
            // Se não tem código separado, buscar pelo texto completo
            query = query.ilike('comum', `%${comumBusca}%`);
          }
        }

        if (nomeBuscaNormalizado) {
          // Buscar por nome também
          query = query.ilike('nome', `%${nomeBuscaNormalizado}%`);
        }

        // Aplicar range para paginação
        const result = await query.range(from, to);

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
        console.log('⚠️ Nenhum candidato encontrado');
        return [];
      }

      console.log(`✅ Total de ${allData.length} registros encontrados na tabela ${tableName}`);

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

    // Buscar nomes dos IDs
    if (comumId) {
      const comuns = await this.getComunsFromLocal();
      const comum = comuns.find(c => c.id === comumId);
      comumNome = comum?.nome;
    }

    if (cargoId) {
      const cargos = await this.getCargosFromLocal();
      const cargo = cargos.find(c => c.id === cargoId);
      cargoNome = cargo?.nome;
    }

    if (instrumentoId) {
      const instrumentos = await this.getInstrumentosFromLocal();
      const instrumento = instrumentos.find(i => i.id === instrumentoId);
      instrumentoNome = instrumento?.nome;
    }

    // Se não encontrou os nomes, retornar vazio
    if (!comumNome || !cargoNome) {
      return [];
    }

    // Verificar se é cargo Candidato(a) - buscar da tabela candidatos
    if (cargoNome.toUpperCase() === 'CANDIDATO(A)' || cargoNome.toUpperCase() === 'CANDIDATO') {
      try {
        const candidatosData = await this.fetchCandidatosFromSupabase(comumNome);

        // Buscar instrumentos uma vez para mapear nomes para IDs
        const instrumentos = await this.getInstrumentosFromLocal();

        // Converter para formato Pessoa[]
        const pessoas: Pessoa[] = await Promise.all(
          candidatosData.map(async (p, index) => {
            const nomeCompleto = (p.nome || '').trim();
            const partesNome = nomeCompleto.split(' ').filter(p => p.trim());
            const primeiroNome = partesNome[0] || '';
            const ultimoNome = partesNome.length > 1 ? partesNome[partesNome.length - 1] : '';

            // Tentar encontrar o ID do instrumento pelo nome (se existir)
            let instrumentoId: string | null = null;
            if (p.instrumento) {
              const instrumentoEncontrado = instrumentos.find(
                i => i.nome.toUpperCase() === (p.instrumento || '').toUpperCase().trim()
              );
              if (instrumentoEncontrado) {
                instrumentoId = instrumentoEncontrado.id;
              }
            }

            const pessoa: Pessoa = {
              id: `candidato_${index}_${nomeCompleto.toLowerCase().replace(/\s+/g, '_')}`,
              nome: primeiroNome,
              sobrenome: ultimoNome,
              nome_completo: nomeCompleto,
              comum_id: comumId || '',
              cargo_id: cargoId || '',
              cargo_real: 'Candidato(a)', // Cargo fixo para candidatos
              instrumento_id: instrumentoId, // Incluir instrumento se existir
              cidade: (p.cidade || '').toUpperCase().trim(),
              ativo: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            return pessoa;
          })
        );

        return pessoas;
      } catch (error) {
        console.error('❌ Erro ao buscar candidatos:', error);
        return [];
      }
    }

    // Buscar pessoas da tabela cadastro (para outros cargos)
    try {
      const pessoasData = await this.fetchPessoasFromCadastro(
        comumNome,
        cargoNome,
        instrumentoNome
      );

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
          ativo: true, // Campo obrigatório do tipo, mas não usado como filtro na busca
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Incluir classe_organista se existir (para Organistas) - usar campo 'nivel' da tabela
        if (p.nivel) {
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
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Supabase não está configurado');
    }

    // Buscar nomes a partir dos IDs
    const [comuns, cargos, instrumentos] = await Promise.all([
      this.getComunsFromLocal(),
      this.getCargosFromLocal(),
      this.getInstrumentosFromLocal(),
    ]);

    const comum = comuns.find(c => c.id === registro.comum_id);
    const cargoSelecionado = cargos.find(c => c.id === registro.cargo_id);
    const instrumento = registro.instrumento_id
      ? instrumentos.find(i => i.id === registro.instrumento_id)
      : null;

    if (!comum || !cargoSelecionado) {
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

    // Normalizar para cargos femininos que tocam órgão (usar cargo real da pessoa)
    const normalizacao = normalizarRegistroCargoFeminino(
      cargoReal, // Usar cargo real da pessoa
      instrumento?.nome,
      registro.classe_organista
    );

    // Usar valores normalizados se for cargo feminino
    const instrumentoFinal = normalizacao.isNormalizado
      ? normalizacao.instrumentoNome || 'ÓRGÃO'
      : instrumento?.nome || null;

    const naipeInstrumento = normalizacao.isNormalizado
      ? normalizacao.naipeInstrumento || 'TECLADO'
      : instrumento?.nome
        ? getNaipeByInstrumento(instrumento.nome)
        : null;

    const classeOrganistaFinal = normalizacao.isNormalizado
      ? normalizacao.classeOrganista || 'OFICIALIZADA'
      : registro.classe_organista || null;

    // Converter para formato da tabela presencas (nomes em maiúscula)
    const row = {
      uuid: uuid,
      nome_completo: nomeCompleto.trim().toUpperCase(),
      comum: comum.nome.toUpperCase(),
      cargo: cargo.nome.toUpperCase(),
      instrumento: instrumentoFinal ? instrumentoFinal.toUpperCase() : null,
      naipe_instrumento: naipeInstrumento ? naipeInstrumento.toUpperCase() : null,
      classe_organista: classeOrganistaFinal ? classeOrganistaFinal.toUpperCase() : null, // Classe normalizada
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

    console.log('📤 Enviando para Supabase (tabela presencas):', row);

    const { data, error } = await supabase.from('presencas').insert(row).select().single();

    if (error) {
      console.error('❌ Erro ao inserir no Supabase:', error);
      throw error;
    }

    console.log('✅ Registro salvo no Supabase com sucesso:', data);

    // Retornar registro atualizado com o ID do Supabase
    return {
      ...registro,
      id: data.uuid || uuid,
      status_sincronizacao: 'synced',
    };
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
    // Sempre usar UUID v4 válido
    const id = registro.id && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registro.id)
      ? registro.id
      : uuidv4();
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
        console.warn('⚠️ Erro ao salvar registro no cache:', error);
      }
      return;
    }

    // Para mobile, usar SQLite
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
    const db = await getDatabase();
    const result = (await db.getFirstAsync(
      "SELECT COUNT(*) as count FROM registros_presenca WHERE status_sincronizacao = 'pending'"
    )) as { count: number } | null;
    return result?.count || 0;
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
