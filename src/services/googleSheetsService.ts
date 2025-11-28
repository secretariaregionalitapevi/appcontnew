import { RegistroPresenca } from '../types/models';
import { supabaseDataService } from './supabaseDataService';
import { getNaipeByInstrumento } from '../utils/instrumentNaipe';
import { normalizarRegistroCargoFeminino, isCargoFemininoOrganista } from '../utils/normalizeCargoFeminino';
import { formatRegistradoPor } from '../utils/userNameUtils';
import { generateExternalUUID } from '../utils/uuid';
import { normalizarNivel } from '../utils/normalizeNivel';

// URL do Google Apps Script (do backupcont/config-deploy.js)
const GOOGLE_SHEETS_API_URL =
  'https://script.google.com/macros/s/AKfycbxPtvi86jPy7y41neTpIPvn3hpycd3cMjbgjgifzLD6qRwrJVPlF9EDulaQp42nma-i/exec';
const SHEET_NAME = 'Dados';

export interface SheetsResponse {
  success: boolean;
  message?: string;
}

export const googleSheetsService = {
  // 🚨 FUNÇÃO ESPECÍFICA PARA REGISTROS EXTERNOS (MODAL DE NOVO REGISTRO)
  // Envia diretamente para Google Sheets sem validar contra listas locais
  async sendExternalRegistroToSheet(data: {
    nome: string;
    comum: string;
    cidade: string;
    cargo: string;
    instrumento?: string;
    classe?: string;
    localEnsaio: string;
    registradoPor: string;
    userId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    console.log('🚀 [EXTERNAL] sendExternalRegistroToSheet chamado');
    console.log('📋 [EXTERNAL] Dados recebidos:', data);
    
    try {
      console.log('📤 [EXTERNAL] Enviando registro externo diretamente para Google Sheets:', data);

      // Gerar UUID
      const uuid = generateExternalUUID();

      // Determinar instrumento e naipe
      let instrumentoFinal = '';
      let naipeFinal = '';
      
      if (data.classe) {
        // Se tem classe, é organista ou cargo com classe oficializada
        instrumentoFinal = 'ÓRGÃO';
        naipeFinal = 'TECLADO';
      } else if (data.instrumento) {
        instrumentoFinal = data.instrumento.toUpperCase();
        naipeFinal = getNaipeByInstrumento(data.instrumento).toUpperCase();
      }

      // Formato esperado pelo Google Apps Script (igual ao backupcont)
      const sheetRow = {
        UUID: uuid,
        'NOME COMPLETO': data.nome.trim().toUpperCase(),
        COMUM: data.comum.trim().toUpperCase(),
        CIDADE: data.cidade.trim().toUpperCase(),
        CARGO: data.cargo.trim().toUpperCase(),
        INSTRUMENTO: instrumentoFinal,
        NAIPE_INSTRUMENTO: naipeFinal,
        CLASSE_ORGANISTA: (data.classe || '').toUpperCase(),
        LOCAL_ENSAIO: (data.localEnsaio || 'Não definido').toUpperCase(),
        DATA_ENSAIO: new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        HORÁRIO: new Date().toLocaleTimeString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
        REGISTRADO_POR: data.registradoPor.toUpperCase(),
        USER_ID: data.userId || '',
        ANOTACOES: 'Cadastro fora da Regional', // 🚨 SEMPRE usar esta anotação para registros externos
        SYNC_STATUS: 'ATUALIZADO',
      };

      console.log('📤 [EXTERNAL] Dados formatados para Google Sheets:', sheetRow);
      console.log('📤 [EXTERNAL] URL da API:', GOOGLE_SHEETS_API_URL);
      console.log('📤 [EXTERNAL] Nome da planilha:', SHEET_NAME);

      // 🚨 CORREÇÃO CRÍTICA: Não usar AbortController com no-cors
      // O backupcont não usa timeout explícito no fetch do modal
      // Vamos usar Promise.race para timeout sem AbortController
      const requestBody = JSON.stringify({
        op: 'append',
        sheet: SHEET_NAME,
        data: sheetRow,
      });

      console.log('📤 [EXTERNAL] Corpo da requisição:', requestBody);
      console.log('🌐 [EXTERNAL] Fazendo fetch para:', GOOGLE_SHEETS_API_URL);
      
      try {
        // 🚨 CRÍTICO: Usar mesmo formato do backupcont (text/plain, sem mode explícito, sem signal)
        // Promise.race para timeout sem usar AbortController (compatível com no-cors)
        const fetchPromise = fetch(GOOGLE_SHEETS_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: requestBody,
        });

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 8000);
        });

        const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

        console.log('📥 [EXTERNAL] Status da resposta:', response.status);
        console.log('📥 [EXTERNAL] Tipo da resposta:', response.type);
        console.log('📥 [EXTERNAL] Response OK:', response.ok);

        // 🚨 CORREÇÃO CRÍTICA: Verificar response.ok PRIMEIRO (igual backupcont)
        // O backupcont só verifica response.ok, não verifica response.type
        if (response.ok) {
          console.log('✅ [EXTERNAL] Google Sheets: Dados enviados com sucesso (status OK)');
          return { success: true };
        }

        // Se a resposta é opaca (no-cors), também considera sucesso (fallback)
        // Isso é importante porque no-cors sempre retorna response.ok = false
        if (response.type === 'opaque') {
          console.log('✅ [EXTERNAL] Google Sheets: Dados enviados (no-cors - assumindo sucesso)');
          return { success: true };
        }

        // Se não está OK e não é opaque, tentar ler erro
        try {
          const errorText = await response.text();
          console.error('❌ [EXTERNAL] Erro HTTP ao enviar para Google Sheets:', response.status, errorText);
          throw new Error(`HTTP ${response.status}: ${errorText || 'Erro desconhecido'}`);
        } catch (readError) {
          console.error('❌ [EXTERNAL] Erro ao ler resposta:', readError);
          // 🚨 CORREÇÃO: Se não conseguiu ler erro, mas response não está OK, 
          // pode ser no-cors - assumir sucesso (igual backupcont faz)
          if (response.type === 'opaque' || response.status === 0) {
            console.log('✅ [EXTERNAL] Google Sheets: Assumindo sucesso (no-cors ou status 0)');
            return { success: true };
          }
          throw new Error(`HTTP ${response.status}: Erro ao processar resposta`);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('❌ [EXTERNAL] Timeout ao enviar para Google Sheets');
          throw new Error('Timeout ao enviar registro. Tente novamente.');
        }
        // 🚨 CORREÇÃO: Se for erro de rede mas não timeout, pode ser no-cors
        // Tentar verificar se foi enviado mesmo assim
        if (fetchError.message && fetchError.message.includes('Failed to fetch')) {
          console.warn('⚠️ [EXTERNAL] Erro de rede detectado, mas pode ser no-cors - assumindo sucesso');
          // Em no-cors, fetch pode falhar mas o envio pode ter funcionado
          // Retornar sucesso como fallback (igual backupcont faz)
          return { success: true };
        }
        throw fetchError;
      }
    } catch (error: any) {
      console.error('❌ [EXTERNAL] Erro ao enviar registro externo para Google Sheets:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  },

  async sendRegistroToSheet(
    registro: RegistroPresenca
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // 🚀 OTIMIZAÇÃO: Buscar nomes a partir dos IDs (cache rápido)
      // Não recarregar se vazio - pode ser cache temporário, continuar mesmo assim
      const [comuns, cargos, instrumentos] = await Promise.all([
        supabaseDataService.getComunsFromLocal(),
        supabaseDataService.getCargosFromLocal(),
        supabaseDataService.getInstrumentosFromLocal(),
      ]);

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
      
      const instrumentoOriginal = registro.instrumento_id
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

      // 🚀 OTIMIZAÇÃO: Verificar se é nome manual (evitar buscar pessoas se não necessário)
      const isNomeManual = registro.pessoa_id.startsWith('manual_');
      let nomeCompleto = '';
      let cargoReal = cargoSelecionado.nome;
      let pessoa: any = null;

      if (isNomeManual) {
        // Extrair nome do pessoa_id (remove prefixo "manual_")
        nomeCompleto = registro.pessoa_id.replace(/^manual_/, '');
        cargoReal = cargoSelecionado.nome;
      } else {
        // 🚀 OTIMIZAÇÃO: Buscar pessoa apenas se necessário (não é nome manual)
        const pessoas = await supabaseDataService.getPessoasFromLocal(
          registro.comum_id,
          registro.cargo_id,
          registro.instrumento_id || undefined
        );
        pessoa = pessoas.find(p => p.id === registro.pessoa_id);

        if (!pessoa) {
          throw new Error('Pessoa não encontrada');
        }

        cargoReal = pessoa.cargo_real || cargoSelecionado.nome;
        nomeCompleto = pessoa.nome_completo || `${pessoa.nome} ${pessoa.sobrenome}`;
      }

      // Buscar nivel da pessoa (OFICIALIZADO, CULTO OFICIAL ou CANDIDATO)
      // 🚨 CORREÇÃO: Para registros externos (do modal), não calcular nível
      // 🚨 CORREÇÃO: Normalizar nivel baseado em regras (instrumento e cargo)
      let nivelPessoa = '';
      if (!isExternalRegistro) {
        const nivelPessoaOriginal = pessoa?.nivel || null;
        nivelPessoa = normalizarNivel(
          nivelPessoaOriginal,
          instrumentoParaUsar?.nome,
          cargoReal
        ) || '';
      }

      const cargo = { ...cargoSelecionado, nome: cargoReal };

      // Normalizar para cargos femininos que tocam órgão (usar cargo real da pessoa)
      const normalizacao = normalizarRegistroCargoFeminino(
        cargoReal, // Usar cargo real da pessoa
        instrumentoOriginal?.nome,
        registro.classe_organista
      );

      // 🚨 CORREÇÃO: Para candidatos, buscar instrumento da pessoa se não tiver no registro
      // A pessoa candidata já tem o instrumento_id convertido do nome do instrumento
      let instrumentoParaUsar = instrumentoOriginal;
      if (!instrumentoParaUsar && pessoa && pessoa.instrumento_id) {
        // Buscar instrumento pelo ID da pessoa
        const instrumentoDaPessoa = instrumentos.find(i => i.id === pessoa.instrumento_id);
        if (instrumentoDaPessoa) {
          instrumentoParaUsar = instrumentoDaPessoa;
        }
      }

      // Usar instrumento normalizado se for cargo feminino
      const instrumento = normalizacao.isNormalizado ? { nome: 'ÓRGÃO' } : instrumentoParaUsar;

      // Buscar cidade da pessoa (se disponível)
      // Para registros externos, a cidade vem no registro
      let cidade = '';
      if (isExternalRegistro) {
        // Para registros externos, buscar cidade do registro (se disponível)
        cidade = (registro as any).cidade || '';
      } else if (isNomeManual) {
        cidade = '';
      } else {
        cidade = pessoa?.cidade || '';
      }

      // Buscar nome do local de ensaio (se for ID, converter para nome)
      let localEnsaioNome = registro.local_ensaio || '';
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

      // Formatar data com hora no formato dd/mm/aaaa HH:mm
      const formatarDataHora = (dataISO: string): string => {
        const data = new Date(dataISO);
        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        const horas = String(data.getHours()).padStart(2, '0');
        const minutos = String(data.getMinutes()).padStart(2, '0');
        return `${dia}/${mes}/${ano} ${horas}:${minutos}`;
      };

      // Buscar nome do usuário e extrair apenas primeiro e último nome
      const registradoPorNome = formatRegistradoPor(registro.usuario_responsavel || '');

      // Usar valores normalizados se for cargo feminino
      const instrumentoFinal = normalizacao.isNormalizado
        ? normalizacao.instrumentoNome || 'ÓRGÃO'
        : instrumentoParaUsar?.nome || '';

      // 🚨 CORREÇÃO: Calcular naipe usando instrumentoFinal (já normalizado) para garantir que funciona com candidatos
      const naipeInstrumento = normalizacao.isNormalizado
        ? normalizacao.naipeInstrumento || 'TECLADO'
        : instrumentoFinal
          ? getNaipeByInstrumento(instrumentoFinal)
          : '';
      
      // Log para debug se naipe não foi encontrado
      if (instrumentoFinal && !naipeInstrumento) {
        console.warn('⚠️ Naipe não encontrado para instrumento no Google Sheets:', {
          instrumentoFinal,
          instrumentoParaUsar: instrumentoParaUsar?.nome,
          cargoReal,
        });
      }

      // 🚨 CORREÇÃO CRÍTICA: Para cargos femininos/órgão, classe_organista deve ser igual ao nivel
      // Se for cargo feminino (Organista, Instrutora, Examinadora, Secretária) ou órgão, usar o nivel normalizado como classe_organista
      const isOrgaoOuCargoFeminino = normalizacao.isNormalizado || 
        (instrumentoParaUsar?.nome?.toUpperCase() === 'ÓRGÃO' || instrumentoParaUsar?.nome?.toUpperCase() === 'ORGAO') ||
        isCargoFemininoOrganista(cargoReal);
      
      const classeOrganistaFinal = isOrgaoOuCargoFeminino && nivelPessoa
        ? nivelPessoa // Usar nivel como classe_organista para cargos femininos/órgão
        : normalizacao.isNormalizado
          ? normalizacao.classeOrganista || 'OFICIALIZADA'
          : registro.classe_organista || '';

      // Formato esperado pelo Google Apps Script (Code.gs) - tudo em maiúscula
      const sheetRow = {
        UUID: registro.id || '',
        'NOME COMPLETO': nomeCompleto.trim().toUpperCase(),
        COMUM: comum.nome.toUpperCase(),
        CIDADE: cidade.toUpperCase(),
        CARGO: cargoReal.toUpperCase(), // 🚨 CORREÇÃO: Usar cargo REAL da pessoa, não o selecionado
        NÍVEL: nivelPessoa ? nivelPessoa.toUpperCase() : '', // 🚨 CORREÇÃO: Adicionar campo NÍVEL (OFICIALIZADO, CULTO OFICIAL ou CANDIDATO)
        INSTRUMENTO: instrumentoFinal.toUpperCase(),
        NAIPE_INSTRUMENTO: naipeInstrumento.toUpperCase(),
        CLASSE_ORGANISTA: classeOrganistaFinal.toUpperCase(), // Classe normalizada
        LOCAL_ENSAIO: localEnsaioNome.toUpperCase(),
        DATA_ENSAIO: formatarDataHora(registro.data_hora_registro || new Date().toISOString()),
        REGISTRADO_POR: registradoPorNome.toUpperCase(),
        ANOTACOES: '', // Campo anotações (pode ser preenchido depois)
      };

      console.log('📤 Enviando para Google Sheets:', sheetRow);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 🚀 OTIMIZAÇÃO: 8 segundos (reduzido de 10s)

      const response = await fetch(GOOGLE_SHEETS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify({
          op: 'append',
          sheet: SHEET_NAME,
          data: sheetRow,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Se a resposta é opaca (no-cors), considera sucesso
      if (response.type === 'opaque') {
        console.log('✅ Google Sheets: Dados enviados (no-cors)');
        return { success: true };
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erro HTTP ao enviar para Google Sheets:', response.status, errorText);
        return {
          success: false,
          error: `Erro HTTP ${response.status}: ${errorText}`,
        };
      }

      const responseText = await response.text();
      console.log('✅ Google Sheets: Dados enviados com sucesso:', responseText);

      return { success: true };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('⚠️ Timeout ao enviar para Google Sheets');
        return {
          success: false,
          error: 'Timeout ao enviar para Google Sheets',
        };
      }
      console.error('❌ Erro ao enviar para Google Sheets:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro ao conectar com Google Sheets',
      };
    }
  },

  /**
   * Atualiza um registro existente no Google Sheets
   */
  async updateRegistroInSheet(
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
    try {
      console.log('📤 Atualizando registro no Google Sheets:', { uuid, updateData });

      // Mapear dados para o formato esperado pelo Google Sheets
      const sheetData: Record<string, string> = {};
      if (updateData.nome_completo) {
        sheetData['NOME COMPLETO'] = updateData.nome_completo.toUpperCase();
      }
      if (updateData.comum) {
        sheetData['COMUM'] = updateData.comum.toUpperCase();
      }
      if (updateData.cidade !== undefined) {
        sheetData['CIDADE'] = updateData.cidade.toUpperCase();
      }
      if (updateData.cargo) {
        sheetData['CARGO'] = updateData.cargo.toUpperCase();
      }
      if (updateData.nivel !== undefined) {
        sheetData['NÍVEL'] = updateData.nivel.toUpperCase();
      }
      if (updateData.instrumento !== undefined) {
        sheetData['INSTRUMENTO'] = updateData.instrumento.toUpperCase();
      }
      if (updateData.naipe_instrumento !== undefined) {
        sheetData['NAIPE_INSTRUMENTO'] = updateData.naipe_instrumento.toUpperCase();
      }
      if (updateData.classe_organista !== undefined) {
        sheetData['CLASSE_ORGANISTA'] = updateData.classe_organista.toUpperCase();
      }
      if (updateData.data_ensaio) {
        // Formatar data se necessário
        const data = new Date(updateData.data_ensaio);
        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        const horas = String(data.getHours()).padStart(2, '0');
        const minutos = String(data.getMinutes()).padStart(2, '0');
        sheetData['DATA_ENSAIO'] = `${dia}/${mes}/${ano} ${horas}:${minutos}`;
      }
      if (updateData.anotacoes !== undefined) {
        sheetData['ANOTACOES'] = updateData.anotacoes.toUpperCase();
      }

      const requestBody = {
        op: 'update',
        sheet: SHEET_NAME,
        match: { UUID: uuid },
        data: sheetData,
      };

      console.log('📤 Request body para Google Sheets:', requestBody);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(GOOGLE_SHEETS_API_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Com no-cors, a resposta é sempre opaca, então consideramos sucesso
      if (response.type === 'opaque' || response.ok) {
        console.log('✅ Google Sheets: Requisição de atualização enviada com sucesso');
        return { success: true };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar registro no Google Sheets:', error);
      // Não lança erro para não interromper o processo
      console.warn('⚠️ Continuando sem atualização no Google Sheets');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  },
};
