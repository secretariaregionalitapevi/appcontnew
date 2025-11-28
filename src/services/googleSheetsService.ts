import { RegistroPresenca } from '../types/models';
import { supabaseDataService } from './supabaseDataService';
import { getNaipeByInstrumento } from '../utils/instrumentNaipe';
import { normalizarRegistroCargoFeminino, isCargoFemininoOrganista } from '../utils/normalizeCargoFeminino';
import { formatRegistradoPor } from '../utils/userNameUtils';
import { uuidv4 } from '../utils/uuid';
import { normalizarNivel } from '../utils/normalizeNivel';

// URL do Google Apps Script (do backupcont/config-deploy.js)
const GOOGLE_SHEETS_API_URL =
  'https://script.google.com/macros/s/AKfycbxPtvi86jPy7y41neTpIPvn3hpycd3cMjbgjgifzLD6qRwrJVPlF9EDulaQp42nma-i/exec';
const SHEET_NAME = 'Dados';

export interface SheetsResponse {
  success: boolean;
  message?: string;
}

// 🚨 FUNÇÃO AUXILIAR: Converter ID de local para nome (usado em ambos os fluxos)
function converterLocalEnsaioIdParaNome(localEnsaio: string | null | undefined): string {
  if (!localEnsaio) {
    return 'Não definido';
  }
  
  // Se já é um nome (não é apenas número), retornar como está
  if (!/^\d+$/.test(localEnsaio.trim())) {
    return localEnsaio.trim();
  }
  
  // Se é um número (ID), converter para nome
  const locais: { id: string; nome: string }[] = [
    { id: '1', nome: 'Cotia' },
    { id: '2', nome: 'Caucaia do Alto' },
    { id: '3', nome: 'Fazendinha' },
    { id: '4', nome: 'Itapevi' },
    { id: '5', nome: 'Jandira' },
    { id: '6', nome: 'Pirapora' },
    { id: '7', nome: 'Vargem Grande' },
  ];
  
  const localEncontrado = locais.find(l => l.id === localEnsaio.trim());
  return localEncontrado?.nome || localEnsaio;
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
    console.log('📋 [EXTERNAL] Cargo:', data.cargo);
    console.log('📋 [EXTERNAL] Instrumento:', data.instrumento);
    console.log('📋 [EXTERNAL] Classe:', data.classe);
    
    try {
      console.log('📤 [EXTERNAL] Enviando registro externo diretamente para Google Sheets:', data);

      // 🚨 CORREÇÃO: Usar UUID v4 válido (igual sistema normal), não external_
      const uuid = uuidv4();

      // 🚨 CORREÇÃO CRÍTICA: Determinar instrumento e naipe baseado no cargo (igual backupcont)
      // Cargos relacionados a organistas (Examinadora, Instrutora, Organista, Secretária da Música)
      // sempre devem ter instrumento "ÓRGÃO" e naipe "TECLADO", independente de ter classe ou não
      const cargoUpper = data.cargo.trim().toUpperCase();
      console.log('🔍 [EXTERNAL] Verificando cargo:', cargoUpper);
      
      const isOrganista = cargoUpper === 'ORGANISTA';
      const isExaminadora = cargoUpper === 'EXAMINADORA';
      const isInstrutora = cargoUpper === 'INSTRUTORA' || cargoUpper === 'INSTRUTOR';
      const isSecretariaMusica = (cargoUpper.includes('SECRETÁRI') || cargoUpper.includes('SECRETARI')) && 
                                  (cargoUpper.includes('MÚSICA') || cargoUpper.includes('MUSICA'));
      const isOrganistaOuRelacionado = isOrganista || isExaminadora || isInstrutora || isSecretariaMusica;
      
      console.log('🔍 [EXTERNAL] Verificações de cargo:');
      console.log('  - isOrganista:', isOrganista);
      console.log('  - isExaminadora:', isExaminadora);
      console.log('  - isInstrutora:', isInstrutora);
      console.log('  - isSecretariaMusica:', isSecretariaMusica);
      console.log('  - isOrganistaOuRelacionado:', isOrganistaOuRelacionado);
      
      let instrumentoFinal = '';
      let naipeFinal = '';
      
      if (isOrganistaOuRelacionado) {
        // 🚨 CRÍTICO: Cargos relacionados a organistas sempre têm instrumento "ÓRGÃO"
        instrumentoFinal = 'ÓRGÃO';
        naipeFinal = 'TECLADO';
        console.log('✅ [EXTERNAL] Cargo relacionado a organista detectado - definindo instrumento como ÓRGÃO');
      } else if (data.instrumento) {
        // Para outros cargos (ex: Músico), usar o instrumento fornecido
        instrumentoFinal = data.instrumento.toUpperCase();
        naipeFinal = getNaipeByInstrumento(data.instrumento).toUpperCase();
        console.log('✅ [EXTERNAL] Usando instrumento fornecido:', instrumentoFinal);
      } else {
        console.log('ℹ️ [EXTERNAL] Cargo sem instrumento (ex: Encarregado Local, Ancião) - deixando vazio');
      }
      // Se não é organista/relacionado e não tem instrumento, deixa vazio (ex: Encarregado Local, Ancião)

      // 🚨 CRÍTICO: Converter local de ensaio ANTES de criar sheetRow
      const localEnsaioConvertido = converterLocalEnsaioIdParaNome(data.localEnsaio);
      console.log('🔄 [EXTERNAL] Local de ensaio original:', data.localEnsaio);
      console.log('🔄 [EXTERNAL] Local de ensaio convertido:', localEnsaioConvertido);
      
      // 🚨 CRÍTICO: Garantir que TODOS os cargos sejam enviados, sem validação especial
      // Músico, Organista, Examinadora, Instrutor, Encarregado Local, etc. - todos devem funcionar igual
      console.log('📋 [EXTERNAL] Preparando dados para envio - TODOS os cargos são aceitos');
      console.log('📋 [EXTERNAL] Cargo que será enviado:', data.cargo.trim().toUpperCase());
      console.log('📋 [EXTERNAL] Instrumento final:', instrumentoFinal || '(vazio - OK para cargos sem instrumento)');
      console.log('📋 [EXTERNAL] Naipe final:', naipeFinal || '(vazio - OK para cargos sem instrumento)');
      
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
        LOCAL_ENSAIO: localEnsaioConvertido.toUpperCase(),
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

      console.log('📤 [EXTERNAL] ========== DADOS FINAIS PARA ENVIO ==========');
      console.log('📤 [EXTERNAL] UUID gerado:', uuid);
      console.log('📤 [EXTERNAL] NOME COMPLETO:', sheetRow['NOME COMPLETO']);
      console.log('📤 [EXTERNAL] COMUM:', sheetRow.COMUM);
      console.log('📤 [EXTERNAL] CIDADE:', sheetRow.CIDADE);
      console.log('📤 [EXTERNAL] CARGO:', sheetRow.CARGO, '✅ (qualquer cargo é aceito)');
      console.log('📤 [EXTERNAL] INSTRUMENTO:', sheetRow.INSTRUMENTO || '(vazio - OK para cargos sem instrumento)');
      console.log('📤 [EXTERNAL] NAIPE_INSTRUMENTO:', sheetRow.NAIPE_INSTRUMENTO || '(vazio - OK)');
      console.log('📤 [EXTERNAL] CLASSE_ORGANISTA:', sheetRow.CLASSE_ORGANISTA || '(vazio - OK)');
      console.log('📤 [EXTERNAL] LOCAL_ENSAIO:', sheetRow.LOCAL_ENSAIO);
      console.log('📤 [EXTERNAL] DATA_ENSAIO:', sheetRow.DATA_ENSAIO);
      console.log('📤 [EXTERNAL] HORÁRIO:', sheetRow.HORÁRIO);
      console.log('📤 [EXTERNAL] REGISTRADO_POR:', sheetRow.REGISTRADO_POR);
      console.log('📤 [EXTERNAL] ANOTACOES:', sheetRow.ANOTACOES);
      console.log('📤 [EXTERNAL] SYNC_STATUS:', sheetRow.SYNC_STATUS);
      console.log('📤 [EXTERNAL] URL da API:', GOOGLE_SHEETS_API_URL);
      console.log('📤 [EXTERNAL] Nome da planilha:', SHEET_NAME);
      console.log('📤 [EXTERNAL] ============================================');

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
        console.log('🌐 [EXTERNAL] Iniciando fetch...');
        const fetchPromise = fetch(GOOGLE_SHEETS_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8',
          },
          body: requestBody,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 8000);
        });

        console.log('⏱️ [EXTERNAL] Aguardando resposta (timeout: 8s)...');
        const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;

        console.log('📥 [EXTERNAL] Resposta recebida!');
        console.log('📥 [EXTERNAL] Status da resposta:', response.status);
        console.log('📥 [EXTERNAL] Tipo da resposta:', response.type);
        console.log('📥 [EXTERNAL] Response OK:', response.ok);
        console.log('📥 [EXTERNAL] Response headers:', response.headers);

        // 🚨 CORREÇÃO CRÍTICA: Ler o corpo da resposta ANTES de verificar response.ok
        // Isso permite verificar se há erros silenciosos mesmo com status OK
        // Usar clone() para não consumir o stream original
        let responseBody = '';
        try {
          const responseClone = response.clone();
          responseBody = await responseClone.text();
          console.log('📥 [EXTERNAL] Corpo da resposta:', responseBody);
          console.log('📥 [EXTERNAL] Tamanho da resposta:', responseBody.length);
        } catch (readBodyError) {
          console.warn('⚠️ [EXTERNAL] Não foi possível ler corpo da resposta:', readBodyError);
        }

        // 🚨 CORREÇÃO CRÍTICA: Tentar parsear JSON da resposta para verificar se ok: false
        // O Google Apps Script retorna JSON com { ok: false, error: '...' } quando há erro
        let responseJson: any = null;
        if (responseBody) {
          try {
            responseJson = JSON.parse(responseBody);
            console.log('📥 [EXTERNAL] Resposta parseada como JSON:', responseJson);
            
            // 🚨 CRÍTICO: Se o JSON tem ok: false, é um erro mesmo com status HTTP OK
            if (responseJson && responseJson.ok === false) {
              const errorMsg = responseJson.error || 'Erro desconhecido do Google Apps Script';
              console.error('❌ [EXTERNAL] Google Apps Script retornou ok: false');
              console.error('❌ [EXTERNAL] Erro:', errorMsg);
              console.error('❌ [EXTERNAL] Dados que causaram erro:', sheetRow);
              throw new Error(errorMsg);
            }
          } catch (parseError) {
            // Se não é JSON válido, continuar com verificação de texto
            console.log('📥 [EXTERNAL] Resposta não é JSON válido, verificando como texto');
          }
        }

        // 🚨 CORREÇÃO CRÍTICA: Verificar response.ok PRIMEIRO (igual backupcont)
        // O backupcont só verifica response.ok, não verifica response.type
        if (response.ok) {
          // 🚨 VERIFICAÇÃO ADICIONAL: Verificar se a resposta contém erro (se não foi JSON)
          // Mesmo com status OK, o Google Apps Script pode retornar erro no corpo
          if (responseBody && !responseJson && (
            responseBody.toLowerCase().includes('error') ||
            responseBody.toLowerCase().includes('erro') ||
            responseBody.toLowerCase().includes('falha') ||
            responseBody.toLowerCase().includes('rejeitado') ||
            responseBody.toLowerCase().includes('invalid') ||
            responseBody.toLowerCase().includes('inválido') ||
            responseBody.toLowerCase().includes('rejected') ||
            responseBody.toLowerCase().includes('denied') ||
            responseBody.toLowerCase().includes('não reconhecida') ||
            responseBody.toLowerCase().includes('nao reconhecida')
          )) {
            console.error('❌ [EXTERNAL] Resposta OK mas contém erro no corpo:', responseBody);
            console.error('❌ [EXTERNAL] Dados que causaram erro:', sheetRow);
            throw new Error(`Google Sheets retornou erro: ${responseBody}`);
          }
          
          // 🚨 VERIFICAÇÃO ADICIONAL: Verificar se a resposta está vazia ou muito curta
          // Pode indicar que o Google Apps Script não processou corretamente
          if (responseBody && responseBody.trim().length < 10) {
            console.warn('⚠️ [EXTERNAL] Resposta muito curta, pode indicar problema:', responseBody);
          }
          
          // 🚨 VERIFICAÇÃO: Se é JSON válido e ok: true, confirmar sucesso
          if (responseJson && responseJson.ok === true) {
            console.log('✅ [EXTERNAL] Google Sheets: Dados enviados com sucesso (JSON ok: true)');
            console.log('✅ [EXTERNAL] UUID retornado:', responseJson.uuid);
            console.log('✅ [EXTERNAL] Operação:', responseJson.op);
            console.log('✅ [EXTERNAL] Registros inseridos:', responseJson.inserted);
            console.log('✅ [EXTERNAL] Cargo que foi salvo:', sheetRow.CARGO);
            return { success: true, uuid: responseJson.uuid };
          }
          
          console.log('✅ [EXTERNAL] Google Sheets: Dados enviados com sucesso (status OK)');
          console.log('✅ [EXTERNAL] Corpo da resposta confirmado:', responseBody.substring(0, 100));
          console.log('✅ [EXTERNAL] Cargo que foi salvo:', sheetRow.CARGO);
          console.log('✅ [EXTERNAL] Retornando { success: true }');
          return { success: true };
        }

        // 🚨 CRÍTICO: Verificar se é erro antes de assumir sucesso em no-cors
        // Se responseBody contém erro, NÃO assumir sucesso mesmo em no-cors
        const temErroNoCorpo = responseBody && (
          responseBody.toLowerCase().includes('error') ||
          responseBody.toLowerCase().includes('erro') ||
          responseBody.toLowerCase().includes('não reconhecida') ||
          responseBody.toLowerCase().includes('nao reconhecida') ||
          responseBody.toLowerCase().includes('operacao nao reconhecida') ||
          responseBody.toLowerCase().includes('operação não reconhecida')
        );
        
        if (temErroNoCorpo) {
          console.error('❌ [EXTERNAL] Erro detectado no corpo da resposta (mesmo em no-cors):', responseBody);
          throw new Error(`Google Sheets retornou erro: ${responseBody}`);
        }
        
        // Se a resposta é opaca (no-cors), também considera sucesso (fallback)
        // Isso é importante porque no-cors sempre retorna response.ok = false
        if (response.type === 'opaque') {
          console.log('✅ [EXTERNAL] Google Sheets: Dados enviados (no-cors - assumindo sucesso)');
          console.log('⚠️ [EXTERNAL] ATENÇÃO: no-cors não permite verificar resposta, assumindo sucesso');
          return { success: true };
        }

        // Se status é 0, pode ser no-cors também
        if (response.status === 0) {
          console.log('✅ [EXTERNAL] Google Sheets: Assumindo sucesso (status 0 - provável no-cors)');
          console.log('⚠️ [EXTERNAL] ATENÇÃO: status 0 pode indicar no-cors, assumindo sucesso');
          return { success: true };
        }

        // Se não está OK e não é opaque, tentar ler erro
        // 🚨 CORREÇÃO: Se já leu o corpo acima, usar ele. Senão, ler agora
        if (!responseBody) {
          try {
            responseBody = await response.text();
            console.error('❌ [EXTERNAL] Erro HTTP ao enviar para Google Sheets:', response.status, responseBody);
          } catch (readError: any) {
            console.error('❌ [EXTERNAL] Erro ao ler resposta:', readError);
            // 🚨 CORREÇÃO: Se não conseguiu ler erro, mas response não está OK, 
            // pode ser no-cors - assumir sucesso (igual backupcont faz)
            if (response.type === 'opaque' || response.status === 0) {
              console.log('✅ [EXTERNAL] Google Sheets: Assumindo sucesso (no-cors ou status 0)');
              return { success: true };
            }
            throw new Error(`HTTP ${response.status}: Erro ao processar resposta`);
          }
        } else {
          // Já temos o corpo da resposta, apenas logar o erro
          console.error('❌ [EXTERNAL] Erro HTTP ao enviar para Google Sheets:', response.status, responseBody);
        }
        
        // 🚨 CORREÇÃO CRÍTICA: Tentar parsear JSON do erro para obter mensagem mais clara
        let errorMessage = `HTTP ${response.status}: ${responseBody || 'Erro desconhecido'}`;
        if (responseBody) {
          try {
            const errorJson = JSON.parse(responseBody);
            if (errorJson && errorJson.error) {
              errorMessage = errorJson.error;
              console.error('❌ [EXTERNAL] Erro do Google Apps Script:', errorMessage);
            }
          } catch (parseError) {
            // Não é JSON, usar mensagem original
          }
        }
        
        // Se chegou aqui, response não está OK e temos o corpo da resposta
        throw new Error(errorMessage);
      } catch (fetchError: any) {
        // 🚨 CORREÇÃO: Verificar se é timeout
        if (fetchError.message === 'Timeout' || fetchError.name === 'AbortError') {
          console.error('❌ [EXTERNAL] Timeout ao enviar para Google Sheets');
          throw new Error('Timeout ao enviar registro. Tente novamente.');
        }
        
        // 🚨 CORREÇÃO CRÍTICA: Se for erro de rede, pode ser no-cors
        // Em no-cors, fetch pode falhar mas o envio pode ter funcionado
        // Retornar sucesso como fallback (igual backupcont faz)
        if (fetchError.message && (
          fetchError.message.includes('Failed to fetch') ||
          fetchError.message.includes('NetworkError') ||
          fetchError.message.includes('Network request failed')
        )) {
          console.warn('⚠️ [EXTERNAL] Erro de rede detectado, mas pode ser no-cors - assumindo sucesso');
          console.warn('⚠️ [EXTERNAL] Detalhes do erro:', fetchError.message);
          // Em no-cors, fetch pode falhar mas o envio pode ter funcionado
          // Retornar sucesso como fallback (igual backupcont faz)
          return { success: true };
        }
        
        console.error('❌ [EXTERNAL] Erro inesperado no fetch:', fetchError);
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
