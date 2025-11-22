import { RegistroPresenca } from '../types/models';
import { supabaseDataService } from './supabaseDataService';
import { getNaipeByInstrumento } from '../utils/instrumentNaipe';
import { normalizarRegistroCargoFeminino } from '../utils/normalizeCargoFeminino';
import { formatRegistradoPor } from '../utils/userNameUtils';
import { generateExternalUUID } from '../utils/uuid';

// URL do Google Apps Script (do backupcont/config-deploy.js)
const GOOGLE_SHEETS_API_URL =
  'https://script.google.com/macros/s/AKfycbxPtvi86jPy7y41neTpIPvn3hpycd3cMjbgjgifzLD6qRwrJVPlF9EDulaQp42nma-i/exec';
const SHEET_NAME = 'Dados';

export interface SheetsResponse {
  success: boolean;
  message?: string;
}

export const googleSheetsService = {
  async sendRegistroToSheet(
    registro: RegistroPresenca
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Buscar nomes a partir dos IDs
      const [comuns, cargos, instrumentos] = await Promise.all([
        supabaseDataService.getComunsFromLocal(),
        supabaseDataService.getCargosFromLocal(),
        supabaseDataService.getInstrumentosFromLocal(),
      ]);

      const comum = comuns.find(c => c.id === registro.comum_id);
      const cargoSelecionado = cargos.find(c => c.id === registro.cargo_id);
      const instrumentoOriginal = registro.instrumento_id
        ? instrumentos.find(i => i.id === registro.instrumento_id)
        : null;

      if (!comum || !cargoSelecionado) {
        throw new Error('Dados incompletos: comum ou cargo não encontrados');
      }

      // Verificar se é nome manual (pessoa_id começa com "manual_")
      const isNomeManual = registro.pessoa_id.startsWith('manual_');
      let nomeCompleto = '';
      let cargoReal = cargoSelecionado.nome;
      let pessoa: any = null;

      if (isNomeManual) {
        // Extrair nome do pessoa_id (remove prefixo "manual_")
        nomeCompleto = registro.pessoa_id.replace(/^manual_/, '');
        // Para nomes manuais, usar cargo selecionado diretamente
        cargoReal = cargoSelecionado.nome;
      } else {
        // Buscar pessoa para obter cargo real
        const pessoas = await supabaseDataService.getPessoasFromLocal(
          registro.comum_id,
          registro.cargo_id,
          registro.instrumento_id || undefined
        );
        pessoa = pessoas.find(p => p.id === registro.pessoa_id);

        if (!pessoa) {
          throw new Error('Pessoa não encontrada');
        }

        // Usar cargo real da pessoa se disponível, senão usar o cargo selecionado
        cargoReal = pessoa.cargo_real || cargoSelecionado.nome;
        nomeCompleto = pessoa.nome_completo || `${pessoa.nome} ${pessoa.sobrenome}`;
      }

      const cargo = { ...cargoSelecionado, nome: cargoReal };

      // Normalizar para cargos femininos que tocam órgão (usar cargo real da pessoa)
      const normalizacao = normalizarRegistroCargoFeminino(
        cargoReal, // Usar cargo real da pessoa
        instrumentoOriginal?.nome,
        registro.classe_organista
      );

      // Usar instrumento normalizado se for cargo feminino
      const instrumento = normalizacao.isNormalizado ? { nome: 'ÓRGÃO' } : instrumentoOriginal;

      // Buscar cidade da pessoa (se disponível) - só se não for nome manual
      const cidade = isNomeManual ? '' : pessoa?.cidade || '';

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

      // Usar naipe normalizado se for cargo feminino, senão calcular normalmente
      const naipeInstrumento = normalizacao.isNormalizado
        ? normalizacao.naipeInstrumento || 'TECLADO'
        : instrumento?.nome
          ? getNaipeByInstrumento(instrumento.nome)
          : '';

      // Usar valores normalizados se for cargo feminino
      const instrumentoFinal = normalizacao.isNormalizado
        ? normalizacao.instrumentoNome || 'ÓRGÃO'
        : instrumento?.nome || '';

      const classeOrganistaFinal = normalizacao.isNormalizado
        ? normalizacao.classeOrganista || 'OFICIALIZADA'
        : registro.classe_organista || '';

      // Formato esperado pelo Google Apps Script (Code.gs) - tudo em maiúscula
      const sheetRow = {
        UUID: registro.id || '',
        'NOME COMPLETO': nomeCompleto.trim().toUpperCase(),
        COMUM: comum.nome.toUpperCase(),
        CIDADE: cidade.toUpperCase(),
        CARGO: cargo.nome.toUpperCase(),
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
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 segundos timeout

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
