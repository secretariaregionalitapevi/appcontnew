/**
 * Sistema Contagem Ensaios Regionais - CCB Regional Itapevi
 * Versão 1.0
 */

const DEFAULT_SHEET_ID = '1LGoW7lbYS4crpEdTfGR2evuH9kArZgqrvVbmi6buBoQ';
const SHEET_NAME = 'Dados';

// ID da planilha de Cotia (planilha externa)
const COTIA_SHEET_ID = '14gHBhE4rf8O5H8aQrqcuCnnO72j4bJzR7kWh-d2Y9o8';

// ID da planilha de Itapevi (planilha externa)
const ITAPEVI_SHEET_ID = '1iawqpjLV_LMPkj-Eq2tpE2dmq92-avyhXC4xphkvdKY';

// ID da planilha de Caucaia (planilha externa)
const CAUCAIA_SHEET_ID = '1maunnaSjcZ8o6OVpyHzTrljd6ykGMmCds4nEPJpXLaA';

// ID da planilha de Jandira (planilha externa)
const JANDIRA_SHEET_ID = '1w-AH31prNxc38KHlS5TdaR982qsgs5cT0U2xQbAIZ4I';

// ID da planilha de Fazendinha (planilha externa)
const FAZENDINHA_SHEET_ID = '1RHDamwT53PaD3QhAcEQuM0ZEtPIff_lLHH3TKURMOW8';

// ID da planilha de Pirapora (planilha externa)
const PIRAPORA_SHEET_ID = '1OHdjW0oUBIFJjubWg4DmxPJnegQzQNk7qb1v7M6Ymk0';

// ID da planilha de VargemGrande (planilha externa)
const VARGEMGRANDE_SHEET_ID = '1BtCETMduDOV-FV6lzvEwgs5gimhYtwZbjy7tlzR8nYI';

const REQUIRED_HEADERS = [
  'UUID','NOME COMPLETO','COMUM','CIDADE','CARGO','INSTRUMENTO',
  'NAIPE_INSTRUMENTO','CLASSE_ORGANISTA','LOCAL_ENSAIO','DATA_ENSAIO',
  'HORÁRIO','REGISTRADO_POR','ANOTACOES','SYNC_STATUS','USER_ID'
];

// Cache para otimização
let SHEETS_CACHE = {};
let SHEET_CACHE = null;
let HEADERS_CACHE = null;
let LAST_HEADER_CHECK = 0;

// Variáveis globais para progresso da exportação
let EXPORT_PROGRESS = {
  percent: 0,
  status: 'Iniciando...',
  timeInfo: 'Calculando...',
  logEntries: []
};

// Mapeamento de cargos
const aliasCargo = {
  'ancião': 'Ancião',
  'diácono': 'Diácono',
  'cooperador do ofício': 'Cooperador do Ofício',
  'cooperador do oficio': 'Cooperador do Ofício',
  'cooperador do ofício ministerial': 'Cooperador do Ofício',
  'cooperador do oficio ministerial': 'Cooperador do Ofício',
  'cooperador de jovens': 'Cooperador de Jovens',
  'cooperador de jovens e menores': 'Cooperador de Jovens',
  'encarregado regional': 'Encarregado Regional',
  'encarregado local': 'Encarregado Local',
  'examinadora': 'Examinadora',
  'secretária da música': 'Secretária da Música',
  'secretaria da musica': 'Secretária da Música',
  'secretário da música': 'Secretário da Música',
  'secretario da musica': 'Secretário da Música',
  'instrutor': 'Instrutor',
  'instrutora': 'Instrutora',
  'instrutores': 'Instrutor',
  'instrutoras': 'Instrutora',
  'porteiro (a)': 'Porteiro (a)',
  'porteiro': 'Porteiro (a)',
  'porteira': 'Porteiro (a)',
  'bombeiro (a)': 'Bombeiro (a)',
  'bombeiro': 'Bombeiro (a)',
  'bombeira': 'Bombeiro (a)',
  'médico (a)': 'Médico (a)',
  'medico': 'Médico (a)',
  'medica': 'Médico (a)',
  'enfermeiro (a)': 'Enfermeiro (a)',
  'enfermeiro': 'Enfermeiro (a)',
  'enfermeira': 'Enfermeiro (a)',
  'irmandade': 'Irmandade',
  'irma': 'Irmandade',
  'irmao': 'Irmandade',
  'irmão': 'Irmandade',
  'irmã': 'Irmandade',
  'irmãos': 'Irmandade',
  'irmãs': 'Irmandade'
};

// Funções utilitárias
function norm(s) { return s ? String(s).trim() : ''; }
function key(s) { return norm(s).toLowerCase(); }
function cap(s) { return norm(s).replace(/\b\w/g, l => l.toUpperCase()); }
function isYes(s) { return /^(sim|s|yes|y|1|true)$/i.test(norm(s)); }

// Função para determinar se é encarregado local
function ehEncarregadoLocal(cargo) {
  if (!cargo) return false;
  const cargoLower = cargo.toLowerCase();
  return cargoLower.includes('encarregado local') || cargoLower.includes('encarregado de local');
}

// Função para determinar se é encarregado regional
function ehEncarregadoRegional(cargo) {
  if (!cargo) return false;
  const cargoLower = cargo.toLowerCase();
  return cargoLower.includes('encarregado regional');
}

// Função para determinar se é examinador/examinadora
function ehExaminador(cargo) {
  if (!cargo) return false;
  const cargoLower = cargo.toLowerCase();
  return cargoLower.includes('examinadora') || cargoLower.includes('examinador');
}

// Função para resposta JSON
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

// Função para abrir ou criar sheet
function openOrCreateSheet(name) {
  if (SHEETS_CACHE[name]) return SHEETS_CACHE[name];
  
  const ss = SpreadsheetApp.openById(DEFAULT_SHEET_ID);
  let sheet = ss.getSheetByName(name);
  
  if (!sheet) {
    sheet = ss.insertSheet(name);
    console.log(`✅ Nova aba criada: ${name}`);
  }
  
  SHEETS_CACHE[name] = sheet;
  return sheet;
}

// Função para acessar planilha externa de Cotia (funciona mesmo com planilha fechada)
function openCotiaSheet() {
  try {
    console.log('🏛️ Acessando planilha externa de Cotia...');
    // Usa openById que funciona mesmo com planilha fechada
    const ss = SpreadsheetApp.openById(COTIA_SHEET_ID);
    // Força o carregamento da planilha
    ss.getSheets();
    console.log('✅ Planilha de Cotia acessada com sucesso (mesmo fechada)');
    return ss;
  } catch (error) {
    console.error('❌ Erro ao acessar planilha de Cotia:', error);
    throw new Error(`Não foi possível acessar a planilha de Cotia: ${error.message}`);
  }
}

// Função para abrir a planilha externa de Itapevi (funciona mesmo com planilha fechada)
function openItapeviSheet() {
  try {
    console.log('🏛️ Acessando planilha externa de Itapevi...');
    const ss = SpreadsheetApp.openById(ITAPEVI_SHEET_ID);
    ss.getSheets(); // Força o carregamento
    console.log('✅ Planilha de Itapevi acessada com sucesso (mesmo fechada)');
    return ss;
  } catch (error) {
    console.error('❌ Erro ao acessar planilha de Itapevi:', error);
    throw new Error(`Não foi possível acessar a planilha de Itapevi: ${error.message}`);
  }
}

function openCaucaiaSheet() {
  try {
    console.log('🏛️ Acessando planilha externa de Caucaia...');
    const ss = SpreadsheetApp.openById(CAUCAIA_SHEET_ID);
    ss.getSheets(); // Força o carregamento
    console.log('✅ Planilha de Caucaia acessada com sucesso (mesmo fechada)');
    return ss;
  } catch (error) {
    console.error('❌ Erro ao acessar planilha de Caucaia:', error);
    throw new Error(`Não foi possível acessar a planilha de Caucaia: ${error.message}`);
  }
}

function openJandiraSheet() {
  try {
    console.log('🏛️ Acessando planilha externa de Jandira...');
    const ss = SpreadsheetApp.openById(JANDIRA_SHEET_ID);
    ss.getSheets(); // Força o carregamento
    console.log('✅ Planilha de Jandira acessada com sucesso (mesmo fechada)');
    return ss;
  } catch (error) {
    console.error('❌ Erro ao acessar planilha de Jandira:', error);
    throw new Error(`Não foi possível acessar a planilha de Jandira: ${error.message}`);
  }
}

function openFazendinhaSheet() {
  try {
    console.log('🏛️ Acessando planilha externa de Fazendinha...');
    const ss = SpreadsheetApp.openById(FAZENDINHA_SHEET_ID);
    ss.getSheets(); // Força o carregamento
    console.log('✅ Planilha de Fazendinha acessada com sucesso (mesmo fechada)');
    return ss;
  } catch (error) {
    console.error('❌ Erro ao acessar planilha de Fazendinha:', error);
    throw new Error(`Não foi possível acessar a planilha de Fazendinha: ${error.message}`);
  }
}

function openPiraporaSheet() {
  try {
    console.log('🏛️ Acessando planilha externa de Pirapora...');
    const ss = SpreadsheetApp.openById(PIRAPORA_SHEET_ID);
    ss.getSheets(); // Força o carregamento
    console.log('✅ Planilha de Pirapora acessada com sucesso (mesmo fechada)');
    return ss;
  } catch (error) {
    console.error('❌ Erro ao acessar planilha de Pirapora:', error);
    throw new Error(`Não foi possível acessar a planilha de Pirapora: ${error.message}`);
  }
}

function openVargemGrandeSheet() {
  try {
    console.log('🏛️ Acessando planilha externa de VargemGrande...');
    const ss = SpreadsheetApp.openById(VARGEMGRANDE_SHEET_ID);
    ss.getSheets(); // Força o carregamento
    console.log('✅ Planilha de VargemGrande acessada com sucesso (mesmo fechada)');
    return ss;
  } catch (error) {
    console.error('❌ Erro ao acessar planilha de VargemGrande:', error);
    throw new Error(`Não foi possível acessar a planilha de VargemGrande: ${error.message}`);
  }
}

// Função para limpar cache
function clearCache() {
  SHEETS_CACHE = {};
  SHEET_CACHE = null;
  HEADERS_CACHE = null;
  LAST_HEADER_CHECK = 0;
}

// 🚨 CRÍTICO: Função para garantir que os headers existem na planilha
// Esta função estava faltando e é necessária para a operação 'append'
function ensureHeaders(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol === 0) {
    // Sheet vazia - adiciona todos os headers de uma vez
    sh.getRange(1, 1, 1, REQUIRED_HEADERS.length).setValues([REQUIRED_HEADERS]);
    sh.getRange(1, 1, 1, REQUIRED_HEADERS.length).setFontWeight('bold');
    return;
  }

  // Lê apenas a primeira linha
  const current = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => (h || '').toString().trim());
  
  // Verifica se todos os headers necessários existem
  const missing = REQUIRED_HEADERS.filter(h => !current.includes(h));
  if (missing.length) {
    // Adiciona apenas os headers faltantes
    const start = current.filter(Boolean).length + 1;
    sh.getRange(1, start, 1, missing.length).setValues([missing]);
    sh.getRange(1, start, 1, missing.length).setFontWeight('bold');
  }
}

// Função para determinar se a pessoa é músico
function ehMusico(x) {
  return x.cargo !== 'Organista' && (!!x.instrumento || isYes(x.vai_tocar));
}

// Função para determinar se a pessoa esteve presente
function estevePresente(x) {
  const vaiSim = isYes(x.vai_tocar);
  const temInstrumento = !!x.instrumento;
  const temCargoMusical = x.cargo && (
    x.cargo.toLowerCase().includes('organista') ||
    x.cargo.toLowerCase().includes('músico') ||
    x.cargo.toLowerCase().includes('musico')
  );
  const temCargoMinisterial = x.cargo && (
    x.cargo.toLowerCase().includes('ancião') ||
    x.cargo.toLowerCase().includes('diácono') ||
    x.cargo.toLowerCase().includes('cooperador do ofício') ||
    x.cargo.toLowerCase().includes('cooperador do ofício ministerial') ||
    x.cargo.toLowerCase().includes('cooperador de jovens') ||
    x.cargo.toLowerCase().includes('cooperador de jovens e menores') ||
    x.cargo.toLowerCase().includes('encarregado') ||
    x.cargo.toLowerCase().includes('examinadora') ||
    x.cargo.toLowerCase().includes('secretária') ||
    x.cargo.toLowerCase().includes('secretario') ||
    x.cargo.toLowerCase().includes('secret') ||
    x.cargo.toLowerCase().includes('instrutor')
  );
  const temCargoApoio = x.cargo && (
    x.cargo.toLowerCase().includes('porteiro') ||
    x.cargo.toLowerCase().includes('bombeiro') ||
    x.cargo.toLowerCase().includes('médico') ||
    x.cargo.toLowerCase().includes('enfermeiro') ||
    x.cargo.toLowerCase().includes('irmandade')
  );

  return vaiSim || temInstrumento || temCargoMusical || temCargoMinisterial || temCargoApoio;
}

// Função para classificar o tipo de cargo
function classificarCargo(cargo) {
  if (!cargo) return 'outros';
  
  const cargoLower = cargo.toLowerCase();
  
  // 🚨 CORREÇÃO: Incluir Secretária da Música (feminino) como organista
  // Mas NÃO incluir Secretário da Música (masculino)
  const isSecretariaMusica = (cargoLower.includes('secretária') || cargoLower.includes('secretaria')) &&
                             (cargoLower.includes('música') || cargoLower.includes('musica')) &&
                             !cargoLower.includes('secretário') && !cargoLower.includes('secretario');
  
  if (cargoLower.includes('organista') || cargoLower.includes('examinadora') || 
      cargoLower.includes('instrutora') || isSecretariaMusica) {
    return 'organista';
  }
  
  if (cargoLower.includes('ancião') || cargoLower.includes('diácono') || 
      cargoLower.includes('cooperador do ofício') || cargoLower.includes('cooperador do ofício ministerial') ||
      cargoLower.includes('cooperador de jovens') || cargoLower.includes('cooperador de jovens e menores') ||
      cargoLower.includes('encarregado') || cargoLower.includes('secretária') || 
      cargoLower.includes('secretário')) {
    return 'ministerio';
  }
  
  if (cargoLower.includes('porteiro') || cargoLower.includes('bombeiro') ||
      cargoLower.includes('médico') || cargoLower.includes('enfermeiro') ||
      cargoLower.includes('irmandade')) {
    return 'apoio';
  }
  
  if (cargoLower.includes('músico') || cargoLower.includes('musico')) {
    return 'musico';
  }
  
  return 'outros';
}

// Função para formatar texto corretamente
function formatarTexto(texto) {
  if (!texto) return '';
  const textoMinusculo = texto.toLowerCase();
  return textoMinusculo.replace(/\b\w/g, l => l.toUpperCase());
}

// Função para comparar locais de ensaio de forma flexível
function compararLocaisEnsaio(local1, local2) {
  if (!local1 || !local2) return false;
  
  const l1 = local1.toLowerCase().trim();
  const l2 = local2.toLowerCase().trim();
  
  // Comparação exata
  if (l1 === l2) return true;
  
  // Mapeamento de variações
  const mapeamento = {
    'caucaia': ['caucaia do alto', 'caucaia'],
    'vargemgrande': ['vargem grande', 'vargemgrande', 'vargem grande'],
    'cotia': ['cotia'],
    'itapevi': ['itapevi'],
    'jandira': ['jandira'],
    'fazendinha': ['fazendinha'],
    'pirapora': ['pirapora']
  };
  
  // Verifica se algum dos locais está no mapeamento
  for (const [canonico, variacoes] of Object.entries(mapeamento)) {
    if ((l1 === canonico || variacoes.includes(l1)) && 
        (l2 === canonico || variacoes.includes(l2))) {
      return true;
    }
  }
  
  // Verifica se um contém o outro
  if (l1.includes(l2) || l2.includes(l1)) return true;
  
  return false;
}

// Função principal para processar contagem detalhada por localidade
function processarPresentesPorLocalidade() {
  try {
    console.log('🔄 Iniciando processamento de contagem por localidade...');
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    console.log(`📊 Dados encontrados: ${lastRow} linhas, ${lastCol} colunas`);
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Normaliza e processa os dados
    const linhas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaio = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhas.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaio, _ord: i
      });
    }

    // Agrupa por local e comum
    const localMap = {};
    const comumMap = {};
    const locais = [];
    const comuns = [];
    const totalGeral = { total: 0, presentes: 0, ausentes: 0 };

    linhas.forEach(x => {
      const local = x.local_ensaio;
      const comum = x.comum;
      
      // Inicializa o local se não existir
      if (!localMap[local]) {
        localMap[local] = {};
        locais.push(local);
      }
      
      // Inicializa a comum no local se não existir
      if (!localMap[local][comum]) {
        localMap[local][comum] = {
          cidade: x.cidade,
          musicos: 0,
          organistas: 0,
          ministerio: 0,
          apoio: 0,
          outros: 0,
          total: 0,
          encarregadoLocal: false,
          encarregadoNome: '',
          encarregadoLocalEnsaio: '',
          detalhes: []
        };
      }
      
      // Inicializa a comum global se não existir
      if (!comumMap[comum]) {
        comumMap[comum] = {
          cidade: x.cidade,
          locais: [],
          musicos: 0,
          organistas: 0,
          ministerio: 0,
          apoio: 0,
          outros: 0,
          total: 0,
          encarregadoLocal: false,
          encarregadoNome: '',
          encarregadoLocalEnsaio: ''
        };
      }
      
      // Classifica por tipo de cargo
      const tipoCargo = classificarCargo(x.cargo);
      
      if (tipoCargo === 'organista') {
        localMap[local][comum].organistas++;
        comumMap[comum].organistas++;
      } else if (tipoCargo === 'musico' || ehMusico(x)) {
        localMap[local][comum].musicos++;
        comumMap[comum].musicos++;
      } else if (tipoCargo === 'ministerio') {
        localMap[local][comum].ministerio++;
        comumMap[comum].ministerio++;
      } else if (tipoCargo === 'apoio') {
        localMap[local][comum].apoio++;
        comumMap[comum].apoio++;
      } else {
        localMap[local][comum].outros++;
        comumMap[comum].outros++;
      }
      
      // Conta total
      localMap[local][comum].total++;
      comumMap[comum].total++;
      totalGeral.total++;
      
      // Verifica se é encarregado local
      if (ehEncarregadoLocal(x.cargo)) {
        localMap[local][comum].encarregadoLocal = true;
        localMap[local][comum].encarregadoNome = x.nome;
        localMap[local][comum].encarregadoLocalEnsaio = x.local_ensaio;
        
        comumMap[comum].encarregadoLocal = true;
        comumMap[comum].encarregadoNome = x.nome;
        comumMap[comum].encarregadoLocalEnsaio = x.local_ensaio;
      }
      
      // Adiciona aos detalhes se presente
      if (estevePresente(x)) {
        localMap[local][comum].detalhes.push(x);
        totalGeral.presentes++;
      } else {
        totalGeral.ausentes++;
      }
      
      // Adiciona local à lista de locais da comum
      if (!comumMap[comum].locais.includes(local)) {
        comumMap[comum].locais.push(local);
      }
    });

    // Cria a aba de resumo
    const shResumo = openOrCreateSheet('Resumo');
    shResumo.clearContents();
    
    let row = 1;
    
    // Cabeçalho principal
    shResumo.getRange(row,1,1,1).setValue('RESUMO GERAL').setFontWeight('bold').setFontSize(14);
    shResumo.getRange(row,1,1,1).setBackground('#4285f4').setFontColor('white');
    row += 2;

    // Cabeçalho da tabela
    shResumo.getRange(row,1,1,8).setValues([['Local', 'Comum', 'Total', 'Músicos', 'Organistas', 'Ministério', 'Apoio', 'Outros']]).setFontWeight('bold');
    shResumo.getRange(row,1,1,8).setBackground('#e8f0fe');
    row++;

    // Ordena locais por nome
    const locaisOrdenados = locais.sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // Processa cada local
    locaisOrdenados.forEach(local => {
      const localDados = localMap[local];
      const comunsDoLocal = Object.keys(localDados).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      
      comunsDoLocal.forEach(comum => {
        const dados = localDados[comum];
        shResumo.getRange(row,1,1,8).setValues([[
          local, 
          comum, 
          dados.total, 
          dados.musicos, 
          dados.organistas, 
          dados.ministerio, 
          dados.apoio, 
          dados.outros
        ]]);
          row++;
      });
    });

    // Linha de total
    shResumo.getRange(row,1,1,8).setValues([[
      'TOTAL GERAL', 
      '', 
      totalGeral.total, 
      Object.values(comumMap).reduce((sum, c) => sum + c.musicos, 0),
      Object.values(comumMap).reduce((sum, c) => sum + c.organistas, 0),
      Object.values(comumMap).reduce((sum, c) => sum + c.ministerio, 0),
      Object.values(comumMap).reduce((sum, c) => sum + c.apoio, 0),
      Object.values(comumMap).reduce((sum, c) => sum + c.outros, 0)
    ]]).setFontWeight('bold');
    shResumo.getRange(row,1,1,8).setBackground('#f0f0f0');
    row += 2;

    // Seção de detalhes por local
    shResumo.getRange(row,1,1,1).setValue('DETALHES POR LOCAL').setFontWeight('bold').setFontSize(12);
    shResumo.getRange(row,1,1,1).setBackground('#e8f0fe');
    row += 2;

    locaisOrdenados.forEach(local => {
      const localDados = localMap[local];
      const comunsDoLocal = Object.keys(localDados).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      
      shResumo.getRange(row,1,1,1).setValue(`${local} (${comunsDoLocal.length} comuns)`).setFontWeight('bold');
      shResumo.getRange(row,1,1,1).setBackground('#f0f0f0');
        row++;

      comunsDoLocal.forEach(comum => {
        const dados = localDados[comum];
        if (dados.detalhes.length > 0) {
          shResumo.getRange(row,1,1,1).setValue(`  ${comum} (${dados.detalhes.length} presentes)`).setFontWeight('bold');
          shResumo.getRange(row,1,1,1).setBackground('#f8f8f8');
      row++;
      
          dados.detalhes.forEach(membro => {
            const cargoInfo = membro.cargo ? ` - ${membro.cargo}` : '';
            const instrumentoInfo = membro.instrumento ? ` (${membro.instrumento})` : '';
            shResumo.getRange(row,1,1,1).setValue(`    • ${membro.nome}${cargoInfo}${instrumentoInfo}`);
      row++;
          });
        row++;
      }
      });
      row++;
    });

    // Formatação
    shResumo.autoResizeColumns(1, 8);
    shResumo.getRange(1, 1, row-1, 8).setBorder(true, true, true, true, true, true);
    try { shResumo.getDataRange().setFontFamily('Arial').setFontSize(11); } catch(e){}
    try { shResumo.setFrozenRows(1); } catch(e){}

    console.log('✅ Resumo processado com sucesso!');
    console.log(`📈 Resultado: ${locais.length} locais, ${comuns.length} comuns, ${totalGeral.total} presentes`);
    
    return {
      ok: true,
      locais: locais.length,
      comuns: comuns.length,
      totalPresentes: totalGeral.total,
      detalhes: totalGeral
    };

  } catch (error) {
    console.error('❌ Erro ao processar resumo:', error);
    throw error;
  }
}

// Webhook principal
function doPost(e) {
  try {
    const raw = e?.postData?.contents || '{}';
    const body = JSON.parse(raw);

    const op = String(body?.op || '').toLowerCase();
    if (op === 'ping') return jsonResponse({ ok: true, pong: true });
    
    if (op === 'atualizar_resumo') {
      const resultado = processarPresentesPorLocalidade();
      return jsonResponse({ 
        ok: true, 
        op: 'atualizar_resumo', 
        resultado: resultado 
      });
    }
    
    if (op === 'atualizar_sistema_completo') {
      const resultado = atualizarSistemaCompleto();
      return jsonResponse({ 
        ok: resultado.ok, 
        op: 'atualizar_sistema_completo', 
        resultado: resultado 
      });
    }
    
    if (op === 'listar_locais_ensaio') {
      const resultado = listarLocaisEnsaio();
      return jsonResponse({ 
        ok: resultado.ok, 
        op: 'listar_locais_ensaio', 
        resultado: resultado 
      });
    }
    
    if (op === 'exportar_completo_cotia') {
      const localEnsaio = body?.local_ensaio;
      if (!localEnsaio) {
        return jsonResponse({ ok: false, error: 'local_ensaio é obrigatório' });
      }
      
      const resultadoEnsaio = exportarParaPlanilhaCotiaCompleta(localEnsaio);
      const resultadoOrganistas = alimentarAbaOrganistasCotia(localEnsaio);
      
      return jsonResponse({ 
        ok: true, 
        op: 'exportar_completo_cotia', 
        resultado: {
          ensaio: resultadoEnsaio,
          organistas: resultadoOrganistas
        }
      });
    }

    if (op === 'exportar_completo_itapevi') {
      const localEnsaio = body?.local_ensaio;
      if (!localEnsaio) {
        return jsonResponse({ ok: false, error: 'local_ensaio é obrigatório' });
      }
      
      const resultadoEnsaio = exportarParaPlanilhaItapeviCompleta(localEnsaio);
      const resultadoOrganistas = alimentarAbaOrganistasItapevi(localEnsaio);
      
      return jsonResponse({ 
        ok: true, 
        op: 'exportar_completo_itapevi', 
        resultado: {
          ensaio: resultadoEnsaio,
          organistas: resultadoOrganistas
        }
      });
    }

    if (op === 'exportar_completo_caucaia') {
      const localEnsaio = body?.local_ensaio;
      if (!localEnsaio) {
        return jsonResponse({ ok: false, error: 'local_ensaio é obrigatório' });
      }
      
      const resultadoEnsaio = exportarParaPlanilhaCaucaiaCompleta(localEnsaio);
      const resultadoOrganistas = alimentarAbaOrganistasCaucaia(localEnsaio);
      
      return jsonResponse({ 
        ok: true, 
        op: 'exportar_completo_caucaia', 
        resultado: {
          ensaio: resultadoEnsaio,
          organistas: resultadoOrganistas
        }
      });
    }

    if (op === 'exportar_completo_jandira') {
      const localEnsaio = body?.local_ensaio;
      if (!localEnsaio) {
        return jsonResponse({ ok: false, error: 'local_ensaio é obrigatório' });
      }
      
      const resultadoEnsaio = exportarParaPlanilhaJandiraCompleta(localEnsaio);
      const resultadoOrganistas = alimentarAbaOrganistasJandira(localEnsaio);
      
      return jsonResponse({ 
        ok: true, 
        op: 'exportar_completo_jandira', 
        resultado: {
          ensaio: resultadoEnsaio,
          organistas: resultadoOrganistas
        }
      });
    }

    if (op === 'exportar_completo_fazendinha') {
      const localEnsaio = body?.local_ensaio;
      if (!localEnsaio) {
        return jsonResponse({ ok: false, error: 'local_ensaio é obrigatório' });
      }
      
      const resultadoEnsaio = exportarParaPlanilhaFazendinhaCompleta(localEnsaio);
      const resultadoOrganistas = alimentarAbaOrganistasFazendinha(localEnsaio);
      
      return jsonResponse({ 
        ok: true, 
        op: 'exportar_completo_fazendinha', 
        resultado: {
          ensaio: resultadoEnsaio,
          organistas: resultadoOrganistas
        }
      });
    }

    if (op === 'exportar_completo_pirapora') {
      const localEnsaio = body?.local_ensaio;
      if (!localEnsaio) {
        return jsonResponse({ ok: false, error: 'local_ensaio é obrigatório' });
      }
      
      const resultadoEnsaio = exportarParaPlanilhaPiraporaCompleta(localEnsaio);
      const resultadoOrganistas = alimentarAbaOrganistasPirapora(localEnsaio);
      
      return jsonResponse({ 
        ok: true, 
        op: 'exportar_completo_pirapora', 
        resultado: {
          ensaio: resultadoEnsaio,
          organistas: resultadoOrganistas
        }
      });
    }

    if (op === 'exportar_completo_vargemgrande') {
      const localEnsaio = body?.local_ensaio;
      if (!localEnsaio) {
        return jsonResponse({ ok: false, error: 'local_ensaio é obrigatório' });
      }
      
      const resultadoEnsaio = exportarParaPlanilhaVargemGrandeCompleta(localEnsaio);
      const resultadoOrganistas = alimentarAbaOrganistasVargemGrande(localEnsaio);
      
      return jsonResponse({ 
        ok: true, 
        op: 'exportar_completo_vargemgrande', 
        resultado: {
          ensaio: resultadoEnsaio,
          organistas: resultadoOrganistas
        }
      });
    }

    if (op === 'exportar_todas_planilhas') {
      const localEnsaio = body?.local_ensaio;
      if (!localEnsaio) {
        return jsonResponse({ ok: false, error: 'local_ensaio é obrigatório' });
      }
      
      // Executa a exportação para todas as planilhas
      executarExportarTodasPlanilhas();
      
      return jsonResponse({ 
        ok: true, 
        op: 'exportar_todas_planilhas', 
        mensagem: 'Exportação para todas as planilhas iniciada'
      });
    }

    // 🚨 CRÍTICO: Operação 'append' para receber dados do modal de novo registro
    // Esta operação estava faltando e por isso os cargos não eram salvos
    if (op === 'append') {
      const sheetName = body?.sheet || SHEET_NAME;
      const data = body?.data || {};
      
      // Abrir ou criar a sheet
      const sh = openOrCreateSheet(sheetName);
      
      // Garantir que os headers existem
      ensureHeaders(sh);
      
      // Obter headers atuais
      const lastCol = sh.getLastColumn();
      const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => (h || '').toString().trim());
      
      // Garantir UUID se não existir
      if (!data['UUID']) {
        data['UUID'] = Utilities.getUuid();
      }
      
      // Garantir SYNC_STATUS se não existir
      if (!data['SYNC_STATUS']) {
        data['SYNC_STATUS'] = 'ATUALIZADO';
      }
      
      // Criar linha na ordem dos headers
      const row = headers.map(h => {
        if (data[h] != null) {
          return data[h];
        }
        return '';
      });
      
      // Adicionar linha à planilha
      sh.appendRow(row);
      
      console.log('✅ Registro adicionado com sucesso:', {
        uuid: data['UUID'],
        cargo: data['CARGO'],
        nome: data['NOME COMPLETO']
      });
      
      return jsonResponse({ 
        ok: true, 
        op: 'append', 
        inserted: 1, 
        uuid: data['UUID'] 
      });
    }

    return jsonResponse({ ok: false, error: 'Operação não reconhecida' });

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return jsonResponse({ ok: false, error: error.message });
  }
}

// Função para atualizar sistema completo
function atualizarSistemaCompleto() {
  try {
    console.log('🚀 Iniciando atualização completa do sistema...');
    
    const resultado = processarPresentesPorLocalidade();
    
    console.log('✅ Sistema atualizado com sucesso!');
    return {
      ok: true,
      timestamp: new Date().toISOString(),
      resultado: resultado
    };

  } catch (error) {
    console.error('❌ Erro na atualização completa:', error);
    return {
      ok: false,
      error: error.message
    };
  }
}



// Função para criar menu personalizado
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔄 Atualizar Dados')
    .addItem('🚀 Atualização Completa do Sistema', 'atualizarSistemaCompleto')
    .addSeparator()
    .addItem('📤 Exportar para Cotia', 'executarExportarCotia')
    .addItem('📤 Exportar para Itapevi', 'executarExportarItapevi')
    .addItem('📤 Exportar para Caucaia', 'executarExportarCaucaia')
    .addItem('📤 Exportar para Jandira', 'executarExportarJandira')
    .addItem('📤 Exportar para Fazendinha', 'executarExportarFazendinha')
    .addItem('📤 Exportar para Pirapora', 'executarExportarPirapora')
    .addItem('📤 Exportar para VargemGrande', 'executarExportarVargemGrande')
    .addSeparator()        
    .addItem('🚀 Exportação de Alta Performance', 'executarExportacaoAltaPerformance')
    .addSeparator()
    .addItem('📊 Resumo por Ensaio', 'criarResumoPorEnsaio')
    .addItem('👥 Encarregados', 'criarResumoEncarregados')
    .addItem('📈 Relatório Detalhado', 'menuRelatorioDetalhado')
    .addSeparator()
    .addItem('📋 Registros SAM Desatualizado', 'menuListaSamDesatualizado')
    .addToUi();
}

// Função para diagnosticar problemas com irmandade
function diagnosticarIrmandade() {
  try {
    console.log('🔍 Diagnosticando problemas com irmandade...');
    
    const ui = SpreadsheetApp.getUi();
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      ui.alert('❌ Erro', 'Não há dados abaixo do cabeçalho em "Dados".', ui.ButtonSet.OK);
      return;
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxComum = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('comum'));
    const idxLocalEnsaio = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('local_ensaio'));

    if (idxNome < 0 || idxCargo < 0) {
      ui.alert('❌ Erro', 'Colunas necessárias não encontradas', ui.ButtonSet.OK);
      return;
    }

    // Busca por possíveis irmandade
    const possiveisIrmandade = [];
    const todosCargos = new Set();
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const comum = norm(row[idxComum] || '') || '(Sem comum)';
      const localEnsaio = norm(row[idxLocalEnsaio] || '') || '(Sem local definido)';
      
      if (!cargo) continue;
      
      const cargoLower = cargo.toLowerCase();
      todosCargos.add(cargoLower);
      
      // Verifica se pode ser irmandade
      if (cargoLower.includes('irm') || cargoLower.includes('irmandade')) {
        possiveisIrmandade.push({
          nome: nome,
          cargo: cargo,
          cargoLower: cargoLower,
          comum: comum,
          localEnsaio: localEnsaio,
          linha: i + 2
        });
      }
    }

    // Prepara mensagem
    let mensagem = `🔍 Diagnóstico de Irmandade\n\n`;
    mensagem += `📊 Total de possíveis irmandade encontrados: ${possiveisIrmandade.length}\n\n`;
    
    if (possiveisIrmandade.length === 0) {
      mensagem += `❌ Nenhuma irmandade foi encontrada!\n\n`;
      mensagem += `💡 Cargos únicos encontrados na planilha:\n\n`;
      
      const cargosOrdenados = Array.from(todosCargos).sort();
      cargosOrdenados.forEach(cargo => {
        mensagem += `• "${cargo}"\n`;
      });
      
      mensagem += `\n💡 Verifique se há dados com cargos como "irmão", "irmã", "irmãos", "irmãs" ou "irmandade" na planilha.`;
    } else {
      mensagem += `📋 Possíveis irmandade encontrados:\n\n`;
      
      possiveisIrmandade.forEach(irmao => {
        mensagem += `👤 **${irmao.nome}**\n`;
        mensagem += `   • Cargo original: "${irmao.cargo}"\n`;
        mensagem += `   • Cargo lowercase: "${irmao.cargoLower}"\n`;
        mensagem += `   • Comum: ${irmao.comum}\n`;
        mensagem += `   • Local: ${irmao.localEnsaio}\n`;
        mensagem += `   • Linha: ${irmao.linha}\n\n`;
      });
      
      mensagem += `💡 Se estes dados não estão aparecendo na coluna Irmandade, verifique:\n`;
      mensagem += `• Se a função classificarCargo() está mapeando corretamente\n`;
      mensagem += `• Se a lógica de identificação está funcionando\n`;
      mensagem += `• Se os dados estão sendo filtrados corretamente`;
    }

    ui.alert('🔍 Diagnóstico de Irmandade', mensagem, ui.ButtonSet.OK);
    
    console.log('🔍 Diagnóstico de irmandade concluído');
    
  } catch (error) {
    console.error('❌ Erro no diagnóstico de irmandade:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro no Diagnóstico', `Erro: ${error.message}`, ui.ButtonSet.OK);
  }
}

// Função para criar resumo por ensaio
function criarResumoPorEnsaio() {
  try {
    console.log('📊 Iniciando criação de resumo por ensaio...');
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    console.log(`📊 Dados encontrados: ${lastRow} linhas, ${lastCol} colunas`);
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Normaliza e processa os dados
    const linhas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaio = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhas.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaio, _ord: i
      });
    }

    // Agrupa por local de ensaio
    const ensaioMap = {};
    const encarregadosMap = {};
    
    linhas.forEach(x => {
      if (!estevePresente(x)) return; // Só conta os presentes
      
      const local = x.local_ensaio;
      
      // Inicializa o ensaio se não existir
      if (!ensaioMap[local]) {
        ensaioMap[local] = {
          musicos: 0,
          organistas: 0,
          irmaos: 0,
          ministerio: 0,
          apoio: 0,
          total: 0,
          comuns: new Set(),
          comumData: {}, // Estrutura para dados por comum
          encarregados: []
        };
      }
      
      // Adiciona a comum ao conjunto
      ensaioMap[local].comuns.add(x.comum);
      
      // Inicializa dados da comum se não existir
      if (!ensaioMap[local].comumData[x.comum]) {
        ensaioMap[local].comumData[x.comum] = {
          total: 0,
          musicos: 0,
          organistas: 0,
          irmaos: 0,
          ministerio: 0,
          apoio: 0
        };
      }
      
      // Classifica por tipo de cargo
      const cargoLower = x.cargo.toLowerCase();
      
      // PRIMEIRO: Verifica irmandade (antes de classificarCargo)
      if (cargoLower.includes('irmão') || cargoLower.includes('irmã') || 
          cargoLower.includes('irmãos') || cargoLower.includes('irmãs') ||
          cargoLower === 'irmandade') {
        ensaioMap[local].irmaos++; // Irmandade tem sua própria categoria
        ensaioMap[local].comumData[x.comum].irmaos++;
      } else {
        // Só classifica se não for irmandade
        const tipoCargo = classificarCargo(x.cargo);
        
        if (tipoCargo === 'organista') {
          ensaioMap[local].organistas++;
          ensaioMap[local].comumData[x.comum].organistas++;
        } else if (tipoCargo === 'musico' || ehMusico(x)) {
          ensaioMap[local].musicos++;
          ensaioMap[local].comumData[x.comum].musicos++;
        } else if (tipoCargo === 'ministerio') {
          ensaioMap[local].ministerio++;
          ensaioMap[local].comumData[x.comum].ministerio++;
        } else if (tipoCargo === 'apoio') {
          ensaioMap[local].apoio++;
          ensaioMap[local].comumData[x.comum].apoio++;
        }
        // Removido: outros (não faz parte da lógica)
      }
      
      ensaioMap[local].total++;
      ensaioMap[local].comumData[x.comum].total++;
      
      // Verifica se é encarregado local, regional ou examinador
      if (ehEncarregadoLocal(x.cargo) || ehEncarregadoRegional(x.cargo) || ehExaminador(x.cargo)) {
        let tipo;
        if (ehEncarregadoLocal(x.cargo)) {
          tipo = 'local';
        } else if (ehEncarregadoRegional(x.cargo)) {
          tipo = 'regional';
        } else if (ehExaminador(x.cargo)) {
          tipo = 'examinador';
        }
        
        // Debug log
        console.log(`🔍 Encarregado/Examinador encontrado: ${x.nome} (${x.comum}) - ${x.cargo} - Tipo: ${tipo}`);
        
        ensaioMap[local].encarregados.push({
          nome: x.nome,
          comum: x.comum,
          cargo: x.cargo,
          localEnsaio: x.local_ensaio,
          tipo: tipo
        });
        
        // Mapeia encarregados por local
        if (!encarregadosMap[local]) {
          encarregadosMap[local] = [];
        }
        encarregadosMap[local].push({
          nome: x.nome,
          comum: x.comum,
          cargo: x.cargo,
          tipo: tipo
        });
      }
    });

    // Cria a aba de resumo por ensaio
    const shResumoEnsaio = openOrCreateSheet('Resumo por Ensaio');
    shResumoEnsaio.clearContents();
    
    let row = 1;
    
    // Cabeçalho principal
    shResumoEnsaio.getRange(row,1,1,1).setValue('RESUMO POR ENSAIO').setFontWeight('bold').setFontSize(14);
    shResumoEnsaio.getRange(row,1,1,1).setBackground('#4285f4').setFontColor('white');
    row += 2;

    // Ordena ensaios por nome - TODOS os ensaios
    const ensaiosOrdenados = Object.keys(ensaioMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // Processa cada ensaio separadamente (como na aba Comum)
    ensaiosOrdenados.forEach(local => {
      const dados = ensaioMap[local];
      const comunsList = Array.from(dados.comuns).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      
      // Título do ensaio
      shResumoEnsaio.getRange(row,1,1,1).setValue(`📍 ${local}`).setFontWeight('bold').setFontSize(12);
      shResumoEnsaio.getRange(row,1,1,1).setBackground('#e8f0fe');
      row += 2;
      
      // Cabeçalho da tabela para este ensaio
      shResumoEnsaio.getRange(row,1,1,8).setValues([['Comum','Cidade','Músicos','Organistas','Irmandade','Ministério','Apoio','Total']]).setFontWeight('bold');
      shResumoEnsaio.getRange(row,1,1,8).setBackground('#f0f8ff');
      row++;
      
      // Dados por comum neste ensaio
      comunsList.forEach(comum => {
        // Busca dados específicos desta comum neste ensaio
        const comumDados = linhas.filter(x => 
          estevePresente(x) && 
          x.local_ensaio === local && 
          x.comum === comum
        );
        
        // Conta por categoria
        let musicos = 0, organistas = 0, irmaos = 0, ministerio = 0, apoio = 0;
        
        comumDados.forEach(x => {
          const cargoLower = x.cargo.toLowerCase();
          
          // PRIMEIRO: Verifica irmandade (antes de classificarCargo)
          if (cargoLower.includes('irmão') || cargoLower.includes('irmã') || 
              cargoLower.includes('irmãos') || cargoLower.includes('irmãs') ||
              cargoLower === 'irmandade') {
            irmaos++;
            console.log(`🔍 Irmandade identificada: ${x.nome} - ${x.cargo} - ${x.comum}`);
          } else {
            // Só classifica se não for irmandade
            const tipoCargo = classificarCargo(x.cargo);
            
            if (tipoCargo === 'organista') {
              organistas++;
            } else if (tipoCargo === 'musico' || ehMusico(x)) {
              musicos++;
            } else if (tipoCargo === 'ministerio') {
              ministerio++;
            } else if (tipoCargo === 'apoio') {
              apoio++;
            }
            // Removido: outros (não faz parte da lógica)
          }
        });
        
        const total = musicos + organistas + irmaos + ministerio + apoio;
        
        // Busca cidade da primeira pessoa desta comum
        const cidade = comumDados.length > 0 ? comumDados[0].cidade : '(Sem cidade)';
        
        shResumoEnsaio.getRange(row,1,1,8).setValues([[
          comum,
          cidade,
          musicos,
          organistas,
          irmaos,
          ministerio,
          apoio,
          total
        ]]);
        
        // Destaca se tem muitos participantes
        if (total > 10) {
          shResumoEnsaio.getRange(row,1,1,8).setBackground('#e8f5e8');
        } else if (total < 3) {
          shResumoEnsaio.getRange(row,1,1,8).setBackground('#fff3cd');
        }
        
        row++;
      });
      
      // Linha de total para este ensaio
      shResumoEnsaio.getRange(row,1,1,8).setValues([[
        `TOTAL ${local}`,
        '',
        dados.musicos,
        dados.organistas,
        dados.irmaos,
        dados.ministerio,
        dados.apoio,
        dados.total
      ]]).setFontWeight('bold');
      shResumoEnsaio.getRange(row,1,1,8).setBackground('#f0f0f0');
      row += 2;
    });

    // Linha de total geral
    const totalMusicos = ensaiosOrdenados.reduce((sum, local) => sum + ensaioMap[local].musicos, 0);
    const totalOrganistas = ensaiosOrdenados.reduce((sum, local) => sum + ensaioMap[local].organistas, 0);
    const totalIrmandade = ensaiosOrdenados.reduce((sum, local) => sum + ensaioMap[local].irmaos, 0);
    const totalMinisterio = ensaiosOrdenados.reduce((sum, local) => sum + ensaioMap[local].ministerio, 0);
    const totalApoio = ensaiosOrdenados.reduce((sum, local) => sum + ensaioMap[local].apoio, 0);
    const totalGeral = ensaiosOrdenados.reduce((sum, local) => sum + ensaioMap[local].total, 0);
    
    shResumoEnsaio.getRange(row,1,1,8).setValues([[
      'TOTAL GERAL',
      '',
      totalMusicos,
      totalOrganistas,
      totalIrmandade,
      totalMinisterio,
      totalApoio,
      totalGeral
    ]]).setFontWeight('bold');
    shResumoEnsaio.getRange(row,1,1,8).setBackground('#4285f4').setFontColor('white');
    row += 3;

    // Seção de encarregados
    shResumoEnsaio.getRange(row,1,1,1).setValue('ENCARREGADOS POR ENSAIO').setFontWeight('bold').setFontSize(12);
    shResumoEnsaio.getRange(row,1,1,1).setBackground('#e8f0fe');
    row += 2;

    // Cabeçalho da tabela de resumo por comum
    shResumoEnsaio.getRange(row,1,1,7).setValues([['Local do Ensaio', 'Comum', 'Músicos', 'Organistas', 'Encarregado Local', 'Encarregado Regional', 'Examinadora de Organistas']]).setFontWeight('bold');
    shResumoEnsaio.getRange(row,1,1,7).setBackground('#f0f8ff');
    row++;

    // Dados do resumo por comum dentro de cada ensaio - VERSÃO SIMPLIFICADA
    ensaiosOrdenados.forEach(local => {
      const dados = ensaioMap[local];
      const comunsList = Array.from(dados.comuns).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      
      // Para cada comum neste ensaio
      comunsList.forEach(comum => {
        const comumData = dados.comumData[comum];
        
        // Busca encarregados desta comum de forma mais simples
        const encarregadosLocal = [];
        const encarregadosRegional = [];
        const examinadores = [];
        
        // Verifica todos os encarregados do ensaio
        const todosEncarregados = ensaioMap[local].encarregados || [];
        console.log(`🔍 Processando ${local} - ${comum}: ${todosEncarregados.length} encarregados encontrados`);
        
        todosEncarregados.forEach(enc => {
          console.log(`  - ${enc.nome} (${enc.comum}) - Tipo: ${enc.tipo}`);
          if (enc.comum === comum) {
            if (enc.tipo === 'local') {
              encarregadosLocal.push(enc.nome);
            } else if (enc.tipo === 'regional') {
              encarregadosRegional.push(enc.nome);
            } else if (enc.tipo === 'examinador') {
              examinadores.push(enc.nome);
            }
          }
        });
        
        console.log(`  Resultado: Local=${encarregadosLocal.length}, Regional=${encarregadosRegional.length}, Examinador=${examinadores.length}`);
        
        // Conta músicos e organistas desta comum
        const musicos = comumData.musicos || 0;
        const organistas = comumData.organistas || 0;
        
        // Exibe os dados
        shResumoEnsaio.getRange(row,1,1,7).setValues([[
          local,
          comum,
          musicos,
          organistas,
          encarregadosLocal.length > 0 ? encarregadosLocal.join(', ') : '-',
          encarregadosRegional.length > 0 ? encarregadosRegional.join(', ') : '-',
          examinadores.length > 0 ? examinadores.join(', ') : '-'
        ]]);
        
        // Cores diferentes para linhas com/sem encarregados
        if (encarregadosLocal.length > 0 || encarregadosRegional.length > 0 || examinadores.length > 0) {
          shResumoEnsaio.getRange(row,1,1,7).setBackground('#e8f5e8');
        } else {
          shResumoEnsaio.getRange(row,1,1,7).setBackground('#fff3e0');
        }
        
        row++;
      });
      
      // Linha separadora entre ensaios
      if (comunsList.length > 0) {
        shResumoEnsaio.getRange(row,1,1,7).setValues([['', '', '', '', '', '', '']]);
        shResumoEnsaio.getRange(row,1,1,7).setBackground('#f5f5f5');
        row++;
      }
    });

    // Formatação
    shResumoEnsaio.getRange(1, 1, row-1, 7).setBorder(true, true, true, true, true, true);
    try { shResumoEnsaio.getDataRange().setFontFamily('Arial').setFontSize(11); } catch(e){}
    try { shResumoEnsaio.setFrozenRows(1); } catch(e){}
    
    // Define larguras fixas para as colunas
    shResumoEnsaio.setColumnWidth(1, 200); // A - Local do Ensaio
    shResumoEnsaio.setColumnWidth(2, 200); // B - Comum
    shResumoEnsaio.setColumnWidth(3, 80);  // C - Músicos
    shResumoEnsaio.setColumnWidth(4, 80);  // D - Organistas
    shResumoEnsaio.setColumnWidth(5, 200); // E - Encarregado Local
    shResumoEnsaio.setColumnWidth(6, 200); // F - Encarregado Regional
    shResumoEnsaio.setColumnWidth(7, 250); // G - Examinadora de Organistas

    console.log('✅ Resumo por ensaio criado com sucesso!');
    console.log(`📈 Resultado: ${ensaiosOrdenados.length} ensaios, ${totalGeral} participantes`);
    
    return {
      ok: true,
      ensaios: ensaiosOrdenados.length,
      totalParticipantes: totalGeral,
      detalhes: ensaioMap
    };

  } catch (error) {
    console.error('❌ Erro ao criar resumo por ensaio:', error);
    throw error;
  }
}

// Função para criar resumo apenas dos encarregados
function criarResumoEncarregados() {
  try {
    console.log('👥 Iniciando criação de resumo de encarregados...');
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    console.log(`📊 Dados encontrados: ${lastRow} linhas, ${lastCol} colunas`);
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Normaliza e processa os dados
    const linhas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaio = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhas.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaio, _ord: i
      });
    }

    // Filtra apenas encarregados
    const encarregados = [];
    const encarregadosPorLocal = {};
    
    linhas.forEach(x => {
      if (!estevePresente(x)) return; // Só conta os presentes
      
      // Verifica se é encarregado local
      if (ehEncarregadoLocal(x.cargo)) {
        encarregados.push({
          nome: x.nome,
          comum: x.comum,
          cidade: x.cidade,
          cargo: x.cargo,
          localEnsaio: x.local_ensaio,
          instrumento: x.instrumento
        });
        
        // Agrupa por local
        if (!encarregadosPorLocal[x.local_ensaio]) {
          encarregadosPorLocal[x.local_ensaio] = [];
        }
        encarregadosPorLocal[x.local_ensaio].push({
          nome: x.nome,
          comum: x.comum,
          cidade: x.cidade,
          cargo: x.cargo,
          instrumento: x.instrumento
        });
      }
    });

    // Cria a aba de resumo de encarregados
    const shEncarregados = openOrCreateSheet('Encarregados');
    shEncarregados.clearContents();
    
    let row = 1;
    
    // Cabeçalho principal
    shEncarregados.getRange(row,1,1,1).setValue('RESUMO DE ENCARREGADOS').setFontWeight('bold').setFontSize(14);
    shEncarregados.getRange(row,1,1,1).setBackground('#4285f4').setFontColor('white');
    row += 2;

    // Pula direto para os dados dos encarregados

    // Dados dos encarregados organizados em blocos por local de ensaio
    if (encarregados.length === 0) {
      shEncarregados.getRange(row,1,1,6).setValues([['Nenhum encarregado encontrado', '', '', '', '', '']]);
      shEncarregados.getRange(row,1,1,6).setBackground('#ffebee');
      row++;
    } else {
      // Agrupa encarregados por local de ensaio
      const encarregadosPorEnsaio = {};
      encarregados.forEach(encarregado => {
        const local = encarregado.localEnsaio;
        if (!encarregadosPorEnsaio[local]) {
          encarregadosPorEnsaio[local] = [];
        }
        encarregadosPorEnsaio[local].push(encarregado);
      });
      
      // Ordena os locais de ensaio
      const locaisOrdenados = Object.keys(encarregadosPorEnsaio).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      
      // Para cada local de ensaio, cria um bloco separado
      locaisOrdenados.forEach((local, index) => {
        const encarregadosLocal = encarregadosPorEnsaio[local].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        
        // Título do bloco (exceto no primeiro)
        if (index > 0) {
          row++; // Linha em branco antes do novo bloco
        }
        
        // Título do local de ensaio
        shEncarregados.getRange(row,1,1,1).setValue(`📍 ${local} (${encarregadosLocal.length} encarregado${encarregadosLocal.length > 1 ? 's' : ''})`).setFontWeight('bold').setFontSize(12);
        shEncarregados.getRange(row,1,1,1).setBackground('#e8f0fe');
        row += 2;
        
        // Cabeçalho da tabela para este bloco
        shEncarregados.getRange(row,1,1,6).setValues([['Nome', 'Cargo', 'Comum', 'Cidade', 'Local do Ensaio', 'Instrumento']]).setFontWeight('bold');
        shEncarregados.getRange(row,1,1,6).setBackground('#f0f8ff');
        row++;
        
        // Dados dos encarregados deste local
        encarregadosLocal.forEach(encarregado => {
          shEncarregados.getRange(row,1,1,6).setValues([[
            encarregado.nome,
            encarregado.cargo,
            encarregado.comum,
            encarregado.cidade,
            encarregado.localEnsaio,
            encarregado.instrumento || '-'
          ]]);
          
          // Destaca encarregados regionais
          if (encarregado.cargo.toLowerCase().includes('regional')) {
            shEncarregados.getRange(row,1,1,6).setBackground('#fff3cd');
          } else {
            shEncarregados.getRange(row,1,1,6).setBackground('#e8f5e8');
          }
          
          row++;
        });
        
        // Linha separadora após cada bloco
        shEncarregados.getRange(row,1,1,6).setValues([['', '', '', '', '', '']]);
        shEncarregados.getRange(row,1,1,6).setBorder(true, true, true, true, true, true, '#cccccc', SpreadsheetApp.BorderStyle.SOLID);
        row++;
      });
    }

    row += 2;

    // Seção por local
    shEncarregados.getRange(row,1,1,1).setValue('ENCARREGADOS POR LOCAL DE ENSAIO').setFontWeight('bold').setFontSize(12);
    shEncarregados.getRange(row,1,1,1).setBackground('#e8f0fe');
    row += 2;

    // Cabeçalho da tabela por local
    shEncarregados.getRange(row,1,1,5).setValues([['Local do Ensaio', 'Nome do Encarregado', 'Comum', 'Cargo', 'Instrumento']]).setFontWeight('bold');
    shEncarregados.getRange(row,1,1,5).setBackground('#f0f8ff');
    row++;

    // Dados por local
    const locaisOrdenados = Object.keys(encarregadosPorLocal).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    
    locaisOrdenados.forEach(local => {
      const encarregadosLocal = encarregadosPorLocal[local];
      
      encarregadosLocal.forEach(encarregado => {
        shEncarregados.getRange(row,1,1,5).setValues([[
          local,
          encarregado.nome,
          encarregado.comum,
          encarregado.cargo,
          encarregado.instrumento || '-'
        ]]);
        
        // Destaca encarregados regionais
        if (encarregado.cargo.toLowerCase().includes('regional')) {
          shEncarregados.getRange(row,1,1,5).setBackground('#fff3cd');
        } else {
          shEncarregados.getRange(row,1,1,5).setBackground('#e8f5e8');
        }
        
        row++;
      });
    });

    // Formatação
    shEncarregados.getRange(1, 1, row-1, 6).setBorder(true, true, true, true, true, true);
    try { shEncarregados.getDataRange().setFontFamily('Arial').setFontSize(11); } catch(e){}
    try { shEncarregados.setFrozenRows(1); } catch(e){}
    
    // Define larguras fixas para as colunas
    shEncarregados.setColumnWidth(1, 350); // A - Nome
    shEncarregados.setColumnWidth(2, 250); // B - Cargo
    shEncarregados.setColumnWidth(3, 340); // C - Comum
    shEncarregados.setColumnWidth(4, 180); // D - Cidade
    shEncarregados.setColumnWidth(5, 180); // E - Local do Ensaio
    shEncarregados.setColumnWidth(6, 225); // F - Instrumento

    // Calcula estatísticas para o retorno
    const totalEncarregados = encarregados.length;
    const locaisComEncarregados = Object.keys(encarregadosPorLocal).length;
    const locaisSemEncarregados = Object.keys(encarregadosPorLocal).length === 0 ? 0 : 
      new Set(linhas.filter(x => estevePresente(x)).map(x => x.local_ensaio)).size - locaisComEncarregados;

    console.log('✅ Resumo de encarregados criado com sucesso!');
    console.log(`📈 Resultado: ${totalEncarregados} encarregados em ${locaisComEncarregados} locais`);
    
    return {
      ok: true,
      totalEncarregados: totalEncarregados,
      locaisComEncarregados: locaisComEncarregados,
      locaisSemEncarregados: locaisSemEncarregados,
      detalhes: encarregadosPorLocal
    };

  } catch (error) {
    console.error('❌ Erro ao criar resumo de encarregados:', error);
    throw error;
  }
}

// Função para diagnosticar secretários da música
function diagnosticarSecretarioMusica() {
  try {
    console.log('🔍 Diagnosticando secretários da música...');
    
    const ui = SpreadsheetApp.getUi();
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      ui.alert('❌ Erro', 'Não há dados abaixo do cabeçalho em "Dados".', ui.ButtonSet.OK);
      return;
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxInstrumento = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('instrumento'));
    const idxLocalEnsaio = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('local_ensaio'));

    if (idxNome < 0 || idxCargo < 0) {
      ui.alert('❌ Erro', 'Colunas necessárias não encontradas', ui.ButtonSet.OK);
      return;
    }

    // Busca por secretários da música
    const secretariosMusica = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const instrumento = norm(row[idxInstrumento] || '');
      const localEnsaio = norm(row[idxLocalEnsaio] || '') || '(Sem local definido)';
      
      if (!cargo) continue;
      
      const cargoLower = cargo.toLowerCase();
      
      // Verifica se é secretário da música
      if (cargoLower.includes('secretário da música') || cargoLower.includes('secretaria da musica') || 
          cargoLower.includes('secretarios da musica') || cargoLower.includes('secretarias da musica')) {
        
        secretariosMusica.push({
          nome: nome,
          cargo: cargo,
          instrumento: instrumento,
          localEnsaio: localEnsaio,
          linha: i + 2,
          cargoLower: cargoLower
        });
      }
    }

    // Prepara mensagem
    let mensagem = `🔍 Diagnóstico de Secretários da Música\n\n`;
    mensagem += `📊 Total de secretários da música encontrados: ${secretariosMusica.length}\n\n`;
    
    if (secretariosMusica.length === 0) {
      mensagem += `❌ Nenhum secretário da música foi encontrado na planilha!\n\n`;
      mensagem += `💡 Verifique se há dados com cargos como "secretário da música" na planilha.`;
    } else {
      mensagem += `📋 Secretários da música encontrados:\n\n`;
      
      secretariosMusica.forEach(sec => {
        mensagem += `👤 **${sec.nome}**\n`;
        mensagem += `   • Cargo: "${sec.cargo}"\n`;
        mensagem += `   • Instrumento: "${sec.instrumento || '(Sem instrumento)'}"\n`;
        mensagem += `   • Local: ${sec.localEnsaio}\n`;
        mensagem += `   • Linha: ${sec.linha}\n`;
        
        // Testa a lógica de exclusão
        const cargoLower = sec.cargoLower;
        const temInstrumento = sec.instrumento && sec.instrumento.trim() !== '';
        const deveSerExcluido = cargoLower.includes('secretário da música') || 
                               cargoLower.includes('secretaria da musica') || 
                               cargoLower.includes('secretarios da musica') || 
                               cargoLower.includes('secretarias da musica');
        
        mensagem += `   • Tem instrumento: ${temInstrumento ? '✅ SIM' : '❌ NÃO'}\n`;
        mensagem += `   • Deve ser excluído: ${deveSerExcluido ? '✅ SIM' : '❌ NÃO'}\n`;
        
        if (temInstrumento && deveSerExcluido) {
          mensagem += `   • Status: ✅ CORRETO (não será contado como instrumento)\n`;
        } else if (temInstrumento && !deveSerExcluido) {
          mensagem += `   • Status: ❌ PROBLEMA (será contado como instrumento)\n`;
        } else {
          mensagem += `   • Status: ℹ️ SEM INSTRUMENTO\n`;
        }
        
        mensagem += `\n`;
      });
      
      mensagem += `💡 Se algum secretário da música está sendo contado como instrumento, verifique:\n`;
      mensagem += `• Se o cargo está escrito exatamente como esperado\n`;
      mensagem += `• Se a lógica de exclusão está funcionando corretamente\n`;
      mensagem += `• Se há variações no cargo que não estão sendo capturadas`;
    }

    ui.alert('🔍 Diagnóstico de Secretários da Música', mensagem, ui.ButtonSet.OK);
    
    console.log('🔍 Diagnóstico de secretários da música concluído');
    
  } catch (error) {
    console.error('❌ Erro no diagnóstico de secretários da música:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro no Diagnóstico', `Erro: ${error.message}`, ui.ButtonSet.OK);
  }
}

// Função para listar locais de ensaio
function listarLocaisEnsaio() {
  try {
    console.log('🏛️ Listando locais de ensaio disponíveis...');
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      return {
        ok: true,
        locais: [],
        total: 0
      };
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Coleta todos os locais únicos
    const locaisSet = new Set();
    const locaisComContagem = {};

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaio = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      const linha = {
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaio, _ord: i
      };

      if (estevePresente(linha)) {
        locaisSet.add(localEnsaio);
        if (!locaisComContagem[localEnsaio]) {
          locaisComContagem[localEnsaio] = 0;
        }
        locaisComContagem[localEnsaio]++;
      }
    }

    const locais = Array.from(locaisSet).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    
    console.log(`📊 Encontrados ${locais.length} locais de ensaio:`, locais);
    
    return {
      ok: true,
      locais: locais,
      contagem: locaisComContagem,
      total: locais.length
    };

  } catch (error) {
    console.error('❌ Erro ao listar locais de ensaio:', error);
    throw error;
  }
}

// Função para obter atualizações de progresso (chamada pelo HTML)
function getProgressUpdate() {
  const result = {
    percent: EXPORT_PROGRESS.percent,
    status: EXPORT_PROGRESS.status,
    timeInfo: EXPORT_PROGRESS.timeInfo,
    logEntries: EXPORT_PROGRESS.logEntries
  };
  
  // Limpa os logs após retornar para evitar duplicação
  EXPORT_PROGRESS.logEntries = [];
  
  return result;
}

// Função para atualizar progresso
function updateExportProgress(percent, status, timeInfo, logEntry = null, logType = 'info') {
  EXPORT_PROGRESS.percent = percent;
  EXPORT_PROGRESS.status = status;
  EXPORT_PROGRESS.timeInfo = timeInfo;
  
  if (logEntry) {
    EXPORT_PROGRESS.logEntries.push({
      message: logEntry,
      type: logType,
      timestamp: new Date().toLocaleTimeString()
    });
    
    // Mantém apenas os últimos 20 logs
    if (EXPORT_PROGRESS.logEntries.length > 20) {
      EXPORT_PROGRESS.logEntries.shift();
    }
  }
  
  return EXPORT_PROGRESS;
}

// Função para exportação de alta performance (otimizada para grandes volumes)
function executarExportacaoAltaPerformance() {
  try {
    console.log('🚀 Iniciando exportação de alta performance...');
    
    const ui = SpreadsheetApp.getUi();
    const startTime = new Date();
    
    // Mostra progresso inicial
    ui.alert('🚀 Exportação de Alta Performance', 'Iniciando exportação otimizada para todas as 7 planilhas...\n\nEsta versão foi otimizada para processar grandes volumes rapidamente.\n\nPor favor, aguarde...', ui.ButtonSet.OK);
    
    const resultadoLocais = listarLocaisEnsaio();
    if (!resultadoLocais || !resultadoLocais.ok || !resultadoLocais.locais || resultadoLocais.locais.length === 0) {
      ui.alert('❌ Nenhum local de ensaio encontrado nos dados.');
      return;
    }
    
    const locais = resultadoLocais.locais;
    console.log(`📋 Locais encontrados: ${locais.join(', ')}`);
    
    // Mapeamento inteligente de locais
    const mapeamentoLocais = {
      'Cotia': ['Cotia', 'COTIA'],
      'Itapevi': ['Itapevi', 'ITAPEVI'],
      'Caucaia': ['Caucaia', 'CAUCAIA', 'Caucaia do Alto', 'CAUCAIA DO ALTO'],
      'Jandira': ['Jandira', 'JANDIRA'],
      'Fazendinha': ['Fazendinha', 'FAZENDINHA'],
      'Pirapora': ['Pirapora', 'PIRAPORA'],
      'VargemGrande': ['VargemGrande', 'VARGEMGRANDE', 'Vargem Grande', 'VARGEM GRANDE']
    };
    
    const planilhas = [
      { nome: 'Cotia', id: COTIA_SHEET_ID },
      { nome: 'Itapevi', id: ITAPEVI_SHEET_ID },
      { nome: 'Caucaia', id: CAUCAIA_SHEET_ID },
      { nome: 'Jandira', id: JANDIRA_SHEET_ID },
      { nome: 'Fazendinha', id: FAZENDINHA_SHEET_ID },
      { nome: 'Pirapora', id: PIRAPORA_SHEET_ID },
      { nome: 'VargemGrande', id: VARGEMGRANDE_SHEET_ID }
    ];
    
    const resultados = [];
    
    // Processa todas as planilhas em paralelo (otimização)
    for (let i = 0; i < planilhas.length; i++) {
      const planilha = planilhas[i];
      const progress = Math.round(((i + 1) / planilhas.length) * 100);
      
      console.log(`📤 [${progress}%] Processando ${planilha.nome}... (${i + 1}/${planilhas.length})`);
      
      // Encontra o local correspondente na planilha
      let localEnsaio = null;
      const possiveisLocais = mapeamentoLocais[planilha.nome] || [planilha.nome];
      
      for (const possivelLocal of possiveisLocais) {
        const localEncontrado = locais.find(local => 
          local.toLowerCase() === possivelLocal.toLowerCase()
        );
        if (localEncontrado) {
          localEnsaio = localEncontrado;
          break;
        }
      }
      
      if (!localEnsaio) {
        console.log(`⚠️ Local não encontrado para ${planilha.nome}, tentando com nome da planilha`);
        localEnsaio = planilha.nome;
      }
      
      try {
        // Usa a versão otimizada de exportação para Resumo
        const resultadoResumo = exportarParaPlanilhaOtimizada(planilha.id, planilha.nome, localEnsaio);
        
        // Também atualiza a aba Organistas
        let resultadoOrganistas = null;
        try {
          switch (planilha.nome) {
            case 'Cotia':
              resultadoOrganistas = alimentarAbaOrganistasCotia(localEnsaio);
              break;
            case 'Itapevi':
              resultadoOrganistas = alimentarAbaOrganistasItapevi(localEnsaio);
              break;
            case 'Caucaia':
              resultadoOrganistas = alimentarAbaOrganistasCaucaia(localEnsaio);
              break;
            case 'Jandira':
              resultadoOrganistas = alimentarAbaOrganistasJandira(localEnsaio);
              break;
            case 'Fazendinha':
              resultadoOrganistas = alimentarAbaOrganistasFazendinha(localEnsaio);
              break;
            case 'Pirapora':
              resultadoOrganistas = alimentarAbaOrganistasPirapora(localEnsaio);
              break;
            case 'VargemGrande':
              resultadoOrganistas = alimentarAbaOrganistasVargemGrande(localEnsaio);
              break;
          }
        } catch (orgError) {
          console.error(`⚠️ Erro ao atualizar organistas para ${planilha.nome}:`, orgError);
        }
        
        resultados.push({
          planilha: planilha.nome,
          local: localEnsaio,
          sucesso: true,
          resultado: resultadoResumo,
          organistas: resultadoOrganistas
        });
        
        console.log(`✅ [${progress}%] ${planilha.nome} exportada com sucesso - ${resultadoResumo.totalMembros} membros`);
        
      } catch (error) {
        console.error(`❌ [${progress}%] Erro ao exportar para ${planilha.nome}:`, error);
        resultados.push({
          planilha: planilha.nome,
          local: localEnsaio,
          sucesso: false,
          erro: error.message
        });
      }
    }
    
    // Mostra o resultado final
    const sucessos = resultados.filter(r => r.sucesso).length;
    const falhas = resultados.filter(r => !r.sucesso).length;
    const totalTime = Math.round((new Date() - startTime) / 1000);
    
    let mensagem = `🚀 Exportação de Alta Performance Concluída!\n\n` +
      `⏱️ Tempo total: ${totalTime} segundos (${Math.round(totalTime / 60)} minutos)\n` +
      `✅ Sucessos: ${sucessos}/7\n` +
      `❌ Falhas: ${falhas}/7\n\n`;
    
    if (sucessos > 0) {
      mensagem += `✅ Planilhas Atualizadas:\n`;
      resultados.filter(r => r.sucesso).forEach(r => {
        mensagem += `• ${r.planilha} (${r.local}): ${r.resultado.totalMembros} membros\n`;
      });
      mensagem += `\n`;
    }
    
    if (falhas > 0) {
      mensagem += `❌ Planilhas com Erro:\n`;
      resultados.filter(r => !r.sucesso).forEach(r => {
        mensagem += `• ${r.planilha} (${r.local}): ${r.erro}\n`;
      });
    }
    
    // Avalia performance
    if (totalTime < 300) { // Menos de 5 minutos
      mensagem += `\n🎉 EXCELENTE! Exportação concluída em menos de 5 minutos!\n`;
      mensagem += `⚡ Performance otimizada para grandes volumes.`;
    } else {
      mensagem += `\n⚠️ Exportação demorou mais que o esperado.\n`;
      mensagem += `💡 Considere executar em horários de menor uso.`;
    }
    
    ui.alert('🚀 Exportação de Alta Performance Concluída', mensagem, ui.ButtonSet.OK);
    
    console.log('🚀 Exportação de alta performance concluída');
    
  } catch (error) {
    console.error('❌ Erro na exportação de alta performance:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro na Exportação', `Erro: ${error.message}`, ui.ButtonSet.OK);
  }
}

// Função otimizada para exportar para uma planilha específica
function exportarParaPlanilhaOtimizada(sheetId, planilhaNome, localEnsaio) {
  try {
    console.log(`🚀 Exportação otimizada para ${planilhaNome} com dados de: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const data = shDados.getDataRange().getValues();
    
    if (data.length < 2) {
      throw new Error('Nenhum dado encontrado na planilha principal');
    }
    
    const headers = data[0];
    const headerMap = {};
    headers.forEach((header, index) => {
      headerMap[header] = index;
    });
    
    // Filtra dados do local especificado (otimizado)
    const linhasLocal = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;
      
      const localEnsaioRow = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      // Só processa se for do local especificado (comparação flexível)
      if (!compararLocaisEnsaio(localEnsaioRow, localEnsaio)) continue;
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');
      
      linhasLocal.push({
        nome, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaioRow, _ord: i
      });
    }
    
    console.log(`📊 Encontrados ${linhasLocal.length} membros para o local: ${localEnsaio}`);
    
    // Conta instrumentos e cargos (otimizado)
    const contadores = {
      instrumentos: {},
      musicos: {},
      cargosMinisteriais: {},
      cargosApoio: {},
      organistas: 0
    };
    
    // Processa todos os dados de uma vez (otimização)
    linhasLocal.forEach(x => {
      if (estevePresente(x)) {
        // Conta instrumentos (excluindo secretários da música)
        const cargoLower = x.cargo ? x.cargo.toLowerCase() : '';
        if (x.instrumento && !cargoLower.includes('secretário da música') && !cargoLower.includes('secretaria da musica') && !cargoLower.includes('secretarios da musica') && !cargoLower.includes('secretarias da musica')) {
          const instrumentoMapeado = mapearInstrumento(x.instrumento);
          contadores.instrumentos[instrumentoMapeado] = (contadores.instrumentos[instrumentoMapeado] || 0) + 1;
          contadores.musicos[instrumentoMapeado] = (contadores.musicos[instrumentoMapeado] || 0) + 1;
        }
        
        // Conta cargos ministeriais e de apoio
        if (x.cargo) {
          const cargoOriginal = x.cargo;
          const cargoFormatado = formatarTexto(cargoOriginal);
          
          const mapeamentoCargos = {
            'ancião': 'Ancião',
            'diácono': 'Diácono',
            'cooperador do ofício': 'Cooperador do Ofício',
            'cooperador do oficio': 'Cooperador do Ofício',
            'cooperador do ofício ministerial': 'Cooperador do Ofício',
            'cooperador do oficio ministerial': 'Cooperador do Ofício',
            'cooperador de jovens': 'Cooperador de Jovens',
            'cooperador de jovens e menores': 'Cooperador de Jovens',
            'encarregado regional': 'Encarregado Regional',
            'encarregado local': 'Encarregado Local',
            'examinadora': 'Examinadora',
            'examinadoras': 'Examinadora',
            'examinador': 'Examinadora',
            'examinadores': 'Examinadora',
            'examinadora de organistas': 'Examinadora',
            'examinadoras de organistas': 'Examinadora',
            'examinador de organistas': 'Examinadora',
            'examinadores de organistas': 'Examinadora',
            'secretária da música': 'Secretária da Música',
            'secretarias da música': 'Secretária da Música',
            'secretaria da musica': 'Secretária da Música',
            'secretarias da musica': 'Secretária da Música',
            'secretário da música': 'Secretário da Música',
            'secretarios da música': 'Secretário da Música',
            'secretario da musica': 'Secretário da Música',
            'secretarios da musica': 'Secretário da Música',
            'instrutor': 'Instrutor',
            'instrutora': 'Instrutora',
            'instrutores': 'Instrutor',
            'instrutoras': 'Instrutora',
            'porteiro (a)': 'Porteiro (a)',
            'porteiro': 'Porteiro (a)',
            'porteira': 'Porteiro (a)',
            'bombeiro (a)': 'Bombeiro (a)',
            'bombeiro': 'Bombeiro (a)',
            'bombeira': 'Bombeiro (a)',
            'médico (a)': 'Médico (a)',
            'medico': 'Médico (a)',
            'medica': 'Médico (a)',
            'enfermeiro (a)': 'Enfermeiro (a)',
            'enfermeiro': 'Enfermeiro (a)',
            'enfermeira': 'Enfermeiro (a)',
            'irmandade': 'Irmandade',
            'irma': 'Irmandade',
            'irmao': 'Irmandade',
            'irmão': 'Irmandade',
            'irmã': 'Irmandade',
            'irmãos': 'Irmandade',
            'irmãs': 'Irmandade'
          };
          
          const cargoMapeado = mapeamentoCargos[cargoFormatado.toLowerCase()];
          if (cargoMapeado) {
            // Lista de cargos ministeriais
            const listaCompletaCargosMinisteriais = [
              'Ancião', 'Diácono', 'Cooperador do Ofício', 'Cooperador de Jovens',
              'Encarregado Regional', 'Encarregado Local', 'Examinadora',
              'Secretária da Música', 'Secretário da Música', 'Instrutor', 'Instrutora'
            ];
            
            // Lista de cargos de apoio
            const listaCompletaCargosApoio = [
              'Porteiro (a)', 'Bombeiro (a)', 'Médico (a)', 'Enfermeiro (a)', 'Irmandade'
            ];
            
            if (listaCompletaCargosMinisteriais.includes(cargoMapeado)) {
              contadores.cargosMinisteriais[cargoMapeado] = (contadores.cargosMinisteriais[cargoMapeado] || 0) + 1;
              console.log(`👔 Cargo ministerial contado: ${cargoOriginal} -> ${cargoMapeado} - ${x.nome}`);
            } else if (listaCompletaCargosApoio.includes(cargoMapeado)) {
              contadores.cargosApoio[cargoMapeado] = (contadores.cargosApoio[cargoMapeado] || 0) + 1;
              console.log(`🤝 Cargo de apoio contado: ${cargoOriginal} -> ${cargoMapeado} - ${x.nome}`);
            }
          }
        }
        
        // Conta organistas
        // 🚨 CORREÇÃO: Incluir Secretária da Música (feminino) como organista
        // Mas NÃO incluir Secretário da Música (masculino)
        if (x.cargo) {
          const cargoLower = x.cargo.toLowerCase();
          const isSecretariaMusica = (cargoLower.includes('secretária') || cargoLower.includes('secretaria')) &&
                                     (cargoLower.includes('música') || cargoLower.includes('musica')) &&
                                     !cargoLower.includes('secretário') && !cargoLower.includes('secretario');
          
          if (cargoLower.includes('organista') || 
              cargoLower.includes('examinadora') ||
              cargoLower.includes('instrutora') ||
              isSecretariaMusica) {
            contadores.organistas++;
          }
        }
      }
    });
    
    // Abre planilha externa
    const ssExterna = SpreadsheetApp.openById(sheetId);
    const shResumo = ssExterna.getSheetByName('Resumo');
    
    if (!shResumo) {
      throw new Error(`Aba 'Resumo' não encontrada na planilha ${planilhaNome}`);
    }
    
    // LIMPA todos os contadores antes de atualizar (correção do problema)
    limparContadoresResumo(shResumo, [28, 41, 48, 50]);
    
    // Atualiza dados em lotes (otimização)
    const atualizacoes = [];
    
    // Instrumentos
    Object.entries(contadores.instrumentos).forEach(([instrumento, quantidade]) => {
      atualizacoes.push({ rotulo: instrumento, valor: quantidade });
    });
    
    // Cargos ministeriais
    Object.entries(contadores.cargosMinisteriais).forEach(([cargo, quantidade]) => {
      atualizacoes.push({ rotulo: cargo, valor: quantidade });
    });
    
    // Cargos de apoio
    Object.entries(contadores.cargosApoio).forEach(([cargo, quantidade]) => {
      atualizacoes.push({ rotulo: cargo, valor: quantidade });
    });
    
    // Organistas
    if (contadores.organistas > 0) {
      atualizacoes.push({ rotulo: 'Organista', valor: contadores.organistas });
    }
    
    // Executa todas as atualizações de uma vez (otimização)
    atualizacoes.forEach(atualizacao => {
      try {
        atualizarColunaBPreservandoFormulas(shResumo, atualizacao.rotulo, atualizacao.valor, [28, 41, 48, 50]);
      } catch (e) {
        console.log(`⚠️ Não foi possível atualizar ${atualizacao.rotulo}: ${e.message}`);
      }
    });
    
    return {
      totalMembros: linhasLocal.length,
      instrumentos: Object.keys(contadores.instrumentos).length,
      cargosMinisteriais: Object.keys(contadores.cargosMinisteriais).length,
      organistas: contadores.organistas
    };
    
  } catch (error) {
    console.error(`❌ Erro na exportação otimizada para ${planilhaNome}:`, error);
    throw error;
  }
}

// Função para alimentar aba Organistas na planilha externa de Itapevi
function alimentarAbaOrganistasItapevi(localEnsaio = 'Itapevi') {
  try {
    console.log(`🏛️ Iniciando alimentação da aba Organistas na planilha externa de Itapevi para: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxNivel = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nivel') || h.toString().toLowerCase().includes('classe'));
    const idxComum = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('comum'));
    const idxCidade = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('cidade') || 
      h.toString().toLowerCase().includes('municipio') || 
      h.toString().toLowerCase().includes('município') ||
      h.toString().toLowerCase().includes('localidade')
    ));
    const idxLocalEnsaio = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('local_ensaio'));
    const idxVaiTocar = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('vai_tocar'));

    if (idxNome < 0 || idxCargo < 0) {
      throw new Error('Colunas "nome" ou "cargo" não encontradas');
    }

    // Filtra dados para organistas, examinadoras, instrutoras e secretárias da música do local especificado
    const organistas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const nivel = norm(row[idxNivel] || '');
      const comum = norm(row[idxComum] || '') || '(Sem comum)';
      const cidade = norm(row[idxCidade] || '') || localEnsaio;
      const localEnsaioRow = norm(row[idxLocalEnsaio] || '') || '(Sem local definido)';
      
      const cargoLower = cargo.toLowerCase();
      const isOrganista = cargoLower.includes('organista') || 
                         cargoLower.includes('examinadora') || 
                         cargoLower.includes('instrutora');
      
      const isLocalCorreto = compararLocaisEnsaio(localEnsaioRow, localEnsaio);
      
      // LÓGICA SIMPLES: Se está registrado na planilha principal com o local correto, esteve presente
      if (isOrganista && isLocalCorreto) {
        organistas.push({
          nome,
          cargo,
          nivel,
          comum,
          cidade,
          localEnsaio: localEnsaioRow,
          _ord: i
        });
        console.log(`🎹 Organista encontrada: ${nome} (${cargo}) - ${localEnsaioRow}`);
      }
    }

    console.log(`📊 Encontradas ${organistas.length} organistas para o local: ${localEnsaio}`);

    // Acessa a planilha externa de Itapevi
    const ssItapevi = openItapeviSheet();
    
    // Cria ou limpa a aba Organistas
    let shOrganistas = ssItapevi.getSheetByName('Organistas');
    if (!shOrganistas) {
      shOrganistas = ssItapevi.insertSheet('Organistas');
      console.log(`✅ Nova aba Organistas criada na planilha externa de Itapevi`);
    } else {
      // Só limpa se não há organistas para inserir (otimização)
      if (organistas.length === 0) {
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (nenhum organista encontrado para ${localEnsaio})`);
        }
      } else {
        // Se há organistas, limpa apenas o necessário para evitar conflitos
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (preparando para inserir ${organistas.length} organistas)`);
        }
      }
    }

    // Verifica se existe cabeçalho na linha 4
    const headerExists = shOrganistas.getRange(4, 1, 1, 7).getValues()[0].some(cell => cell && cell.toString().trim());
    
    if (!headerExists) {
      shOrganistas.getRange(4, 1, 1, 7).setValues([[
        'ID', 'Nome', 'Cargo', 'Nível', 'Comum', 'Cidade', 'Tocou no último ensaio?'
      ]]);
      shOrganistas.getRange(4, 1, 1, 7).setFontWeight('bold');
      shOrganistas.getRange(4, 1, 1, 7).setBackground('#e8f0fe');
      console.log(`✅ Cabeçalho criado na linha 4 com 7 colunas (incluindo ID)`);
    } else {
      console.log(`✅ Cabeçalho já existe na linha 4, preservando`);
    }

    // Popula dados a partir da linha 5
    if (organistas.length > 0) {
      const dadosParaInserir = organistas.map((org, index) => [
        index + 1, // ID sequencial
        org.nome,
        org.cargo,
        org.nivel,
        org.comum,
        org.cidade,
        '' // Tocou no último ensaio? (vazio)
      ]);

      shOrganistas.getRange(5, 1, dadosParaInserir.length, 7).setValues(dadosParaInserir);
      console.log(`✅ ${organistas.length} organistas inseridas a partir da linha 5 com IDs sequenciais`);
    }

    // Formatação
    shOrganistas.getRange(4, 1, 1, 7).setBorder(true, true, true, true, true, true);
    
    // Autoajusta as colunas APÓS inserir os dados
    shOrganistas.autoResizeColumns(1, 7);
    
     // Define larguras específicas para colunas C, D, E e G
     shOrganistas.setColumnWidth(3, 217); // Coluna C (Cargo)
     shOrganistas.setColumnWidth(4, 134); // Coluna D (Nível da organista)
     shOrganistas.setColumnWidth(5, 120); // Coluna E (Comum) - mantém 120
     shOrganistas.setColumnWidth(6, 120); // Coluna F (Cidade) - mantém 120
     shOrganistas.setColumnWidth(7, 180); // Coluna G (Tocou no último ensaio?)
    
    console.log(`✅ Aba Organistas da planilha externa de Itapevi alimentada com sucesso para: ${localEnsaio}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Organistas',
      planilhaId: ITAPEVI_SHEET_ID,
      totalOrganistas: organistas.length,
      organistas: organistas.map(org => org.nome)
    };

  } catch (error) {
    console.error(`❌ Erro ao alimentar aba Organistas da planilha externa de Itapevi para ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para alimentar aba Organistas da planilha de VargemGrande
function alimentarAbaOrganistasVargemGrande(localEnsaio = 'VargemGrande') {
  try {
    console.log(`🏛️ Iniciando alimentação da aba Organistas na planilha externa de VargemGrande para: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxNivel = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nivel') || h.toString().toLowerCase().includes('classe'));
    const idxComum = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('comum'));
    const idxCidade = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('cidade') || 
      h.toString().toLowerCase().includes('municipio') || 
      h.toString().toLowerCase().includes('município') ||
      h.toString().toLowerCase().includes('localidade')
    ));
    const idxLocalEnsaio = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('local_ensaio'));
    const idxVaiTocar = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('vai_tocar'));

    if (idxNome < 0 || idxCargo < 0) {
      throw new Error('Colunas "nome" ou "cargo" não encontradas');
    }

    // Filtra dados para organistas, examinadoras, instrutoras e secretárias da música do local especificado
    const organistas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const nivel = norm(row[idxNivel] || '');
      const comum = norm(row[idxComum] || '') || '(Sem comum)';
      const cidade = norm(row[idxCidade] || '') || localEnsaio;
      const localEnsaioRow = norm(row[idxLocalEnsaio] || '') || '(Sem local definido)';
      
      const cargoLower = cargo.toLowerCase();
      const isOrganista = cargoLower.includes('organista') || 
                         cargoLower.includes('examinadora') || 
                         cargoLower.includes('instrutora');
      
      const isLocalCorreto = compararLocaisEnsaio(localEnsaioRow, localEnsaio);
      
      // LÓGICA SIMPLES: Se está registrado na planilha principal com o local correto, esteve presente
      if (isOrganista && isLocalCorreto) {
        organistas.push({
          nome,
          cargo,
          nivel,
          comum,
          cidade,
          localEnsaio: localEnsaioRow,
          _ord: i
        });
        console.log(`🎹 Organista encontrada: ${nome} (${cargo}) - ${localEnsaioRow}`);
      }
    }

    console.log(`📊 Encontradas ${organistas.length} organistas para o local: ${localEnsaio}`);

    // Acessa a planilha externa de VargemGrande
    const ssVargemGrande = openVargemGrandeSheet();
    
    // Cria ou limpa a aba Organistas
    let shOrganistas = ssVargemGrande.getSheetByName('Organistas');
    if (!shOrganistas) {
      shOrganistas = ssVargemGrande.insertSheet('Organistas');
      console.log(`✅ Nova aba Organistas criada na planilha externa de VargemGrande`);
    } else {
      // Só limpa se não há organistas para inserir (otimização)
      if (organistas.length === 0) {
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (nenhum organista encontrado para ${localEnsaio})`);
        }
      } else {
        // Se há organistas, limpa apenas o necessário para evitar conflitos
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (preparando para inserir ${organistas.length} organistas)`);
        }
      }
    }

    // Verifica se existe cabeçalho na linha 4
    const headerExists = shOrganistas.getRange(4, 1, 1, 7).getValues()[0].some(cell => cell && cell.toString().trim());
    
    if (!headerExists) {
      shOrganistas.getRange(4, 1, 1, 7).setValues([[
        'ID', 'Nome', 'Cargo', 'Nível', 'Comum', 'Cidade', 'Tocou no último ensaio?'
      ]]);
      shOrganistas.getRange(4, 1, 1, 7).setFontWeight('bold');
      shOrganistas.getRange(4, 1, 1, 7).setBackground('#e8f0fe');
      console.log(`✅ Cabeçalho criado na linha 4 com 7 colunas (incluindo ID)`);
    } else {
      console.log(`✅ Cabeçalho já existe na linha 4, preservando`);
    }

    // Popula dados a partir da linha 5
    if (organistas.length > 0) {
      const dadosParaInserir = organistas.map((org, index) => [
        index + 1, // ID sequencial
        org.nome,
        org.cargo,
        org.nivel,
        org.comum,
        org.cidade,
        '' // Tocou no último ensaio? (vazio)
      ]);

      shOrganistas.getRange(5, 1, dadosParaInserir.length, 7).setValues(dadosParaInserir);
      console.log(`✅ ${organistas.length} organistas inseridas a partir da linha 5 com IDs sequenciais`);
    }

    // Formatação
    shOrganistas.getRange(4, 1, 1, 7).setBorder(true, true, true, true, true, true);
    
    // Autoajusta as colunas APÓS inserir os dados
    shOrganistas.autoResizeColumns(1, 7);
    
     // Define larguras específicas para colunas C, D, E e G
     shOrganistas.setColumnWidth(3, 217); // Coluna C (Cargo)
     shOrganistas.setColumnWidth(4, 134); // Coluna D (Nível da organista)
     shOrganistas.setColumnWidth(5, 120); // Coluna E (Comum) - mantém 120
     shOrganistas.setColumnWidth(6, 120); // Coluna F (Cidade) - mantém 120
     shOrganistas.setColumnWidth(7, 180); // Coluna G (Tocou no último ensaio?)
    
    console.log(`✅ Aba Organistas da planilha externa de VargemGrande alimentada com sucesso para: ${localEnsaio}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Organistas',
      planilhaId: VARGEMGRANDE_SHEET_ID,
      totalOrganistas: organistas.length,
      organistas: organistas.map(org => org.nome)
    };

  } catch (error) {
    console.error(`❌ Erro ao alimentar aba Organistas da planilha externa de VargemGrande para ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para alimentar aba Organistas da planilha de Pirapora
function alimentarAbaOrganistasPirapora(localEnsaio = 'Pirapora') {
  try {
    console.log(`🏛️ Iniciando alimentação da aba Organistas na planilha externa de Pirapora para: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxNivel = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nivel') || h.toString().toLowerCase().includes('classe'));
    const idxComum = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('comum'));
    const idxCidade = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('cidade') || 
      h.toString().toLowerCase().includes('municipio') || 
      h.toString().toLowerCase().includes('município') ||
      h.toString().toLowerCase().includes('localidade')
    ));
    const idxLocalEnsaio = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('local_ensaio'));
    const idxVaiTocar = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('vai_tocar'));

    if (idxNome < 0 || idxCargo < 0) {
      throw new Error('Colunas "nome" ou "cargo" não encontradas');
    }

    // Filtra dados para organistas, examinadoras, instrutoras e secretárias da música do local especificado
    const organistas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const nivel = norm(row[idxNivel] || '');
      const comum = norm(row[idxComum] || '') || '(Sem comum)';
      const cidade = norm(row[idxCidade] || '') || localEnsaio;
      const localEnsaioRow = norm(row[idxLocalEnsaio] || '') || '(Sem local definido)';
      
      const cargoLower = cargo.toLowerCase();
      const isOrganista = cargoLower.includes('organista') || 
                         cargoLower.includes('examinadora') || 
                         cargoLower.includes('instrutora');
      
      const isLocalCorreto = compararLocaisEnsaio(localEnsaioRow, localEnsaio);
      
      // LÓGICA SIMPLES: Se está registrado na planilha principal com o local correto, esteve presente
      if (isOrganista && isLocalCorreto) {
        organistas.push({
          nome,
          cargo,
          nivel,
          comum,
          cidade,
          localEnsaio: localEnsaioRow,
          _ord: i
        });
        console.log(`🎹 Organista encontrada: ${nome} (${cargo}) - ${localEnsaioRow}`);
      }
    }

    console.log(`📊 Encontradas ${organistas.length} organistas para o local: ${localEnsaio}`);

    // Acessa a planilha externa de Pirapora
    const ssPirapora = openPiraporaSheet();
    
    // Cria ou limpa a aba Organistas
    let shOrganistas = ssPirapora.getSheetByName('Organistas');
    if (!shOrganistas) {
      shOrganistas = ssPirapora.insertSheet('Organistas');
      console.log(`✅ Nova aba Organistas criada na planilha externa de Pirapora`);
    } else {
      // Só limpa se não há organistas para inserir (otimização)
      if (organistas.length === 0) {
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (nenhum organista encontrado para ${localEnsaio})`);
        }
      } else {
        // Se há organistas, limpa apenas o necessário para evitar conflitos
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (preparando para inserir ${organistas.length} organistas)`);
        }
      }
    }

    // Verifica se existe cabeçalho na linha 4
    const headerExists = shOrganistas.getRange(4, 1, 1, 7).getValues()[0].some(cell => cell && cell.toString().trim());
    
    if (!headerExists) {
      shOrganistas.getRange(4, 1, 1, 7).setValues([[
        'ID', 'Nome', 'Cargo', 'Nível', 'Comum', 'Cidade', 'Tocou no último ensaio?'
      ]]);
      shOrganistas.getRange(4, 1, 1, 7).setFontWeight('bold');
      shOrganistas.getRange(4, 1, 1, 7).setBackground('#e8f0fe');
      console.log(`✅ Cabeçalho criado na linha 4 com 7 colunas (incluindo ID)`);
    } else {
      console.log(`✅ Cabeçalho já existe na linha 4, preservando`);
    }

    // Popula dados a partir da linha 5
    if (organistas.length > 0) {
      const dadosParaInserir = organistas.map((org, index) => [
        index + 1, // ID sequencial
        org.nome,
        org.cargo,
        org.nivel,
        org.comum,
        org.cidade,
        '' // Tocou no último ensaio? (vazio)
      ]);

      shOrganistas.getRange(5, 1, dadosParaInserir.length, 7).setValues(dadosParaInserir);
      console.log(`✅ ${organistas.length} organistas inseridas a partir da linha 5 com IDs sequenciais`);
    }

    // Formatação
    shOrganistas.getRange(4, 1, 1, 7).setBorder(true, true, true, true, true, true);
    
    // Autoajusta as colunas APÓS inserir os dados
    shOrganistas.autoResizeColumns(1, 7);
    
     // Define larguras específicas para colunas C, D, E e G
     shOrganistas.setColumnWidth(3, 217); // Coluna C (Cargo)
     shOrganistas.setColumnWidth(4, 134); // Coluna D (Nível da organista)
     shOrganistas.setColumnWidth(5, 120); // Coluna E (Comum) - mantém 120
     shOrganistas.setColumnWidth(6, 120); // Coluna F (Cidade) - mantém 120
     shOrganistas.setColumnWidth(7, 180); // Coluna G (Tocou no último ensaio?)
    
    console.log(`✅ Aba Organistas da planilha externa de Pirapora alimentada com sucesso para: ${localEnsaio}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Organistas',
      planilhaId: PIRAPORA_SHEET_ID,
      totalOrganistas: organistas.length,
      organistas: organistas.map(org => org.nome)
    };

  } catch (error) {
    console.error(`❌ Erro ao alimentar aba Organistas da planilha externa de Pirapora para ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para alimentar aba Organistas da planilha de Fazendinha
function alimentarAbaOrganistasFazendinha(localEnsaio = 'Fazendinha') {
  try {
    console.log(`🏛️ Iniciando alimentação da aba Organistas na planilha externa de Fazendinha para: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxNivel = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nivel') || h.toString().toLowerCase().includes('classe'));
    const idxComum = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('comum'));
    const idxCidade = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('cidade') || 
      h.toString().toLowerCase().includes('municipio') || 
      h.toString().toLowerCase().includes('município') ||
      h.toString().toLowerCase().includes('localidade')
    ));
    const idxLocalEnsaio = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('local_ensaio'));
    const idxVaiTocar = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('vai_tocar'));

    if (idxNome < 0 || idxCargo < 0) {
      throw new Error('Colunas "nome" ou "cargo" não encontradas');
    }

    // Filtra dados para organistas, examinadoras, instrutoras e secretárias da música do local especificado
    const organistas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const nivel = norm(row[idxNivel] || '');
      const comum = norm(row[idxComum] || '') || '(Sem comum)';
      const cidade = norm(row[idxCidade] || '') || localEnsaio;
      const localEnsaioRow = norm(row[idxLocalEnsaio] || '') || '(Sem local definido)';
      
      const cargoLower = cargo.toLowerCase();
      const isOrganista = cargoLower.includes('organista') || 
                         cargoLower.includes('examinadora') || 
                         cargoLower.includes('instrutora');
      
      const isLocalCorreto = compararLocaisEnsaio(localEnsaioRow, localEnsaio);
      
      // LÓGICA SIMPLES: Se está registrado na planilha principal com o local correto, esteve presente
      if (isOrganista && isLocalCorreto) {
        organistas.push({
          nome,
          cargo,
          nivel,
          comum,
          cidade,
          localEnsaio: localEnsaioRow,
          _ord: i
        });
        console.log(`🎹 Organista encontrada: ${nome} (${cargo}) - ${localEnsaioRow}`);
      }
    }

    console.log(`📊 Encontradas ${organistas.length} organistas para o local: ${localEnsaio}`);

    // Acessa a planilha externa de Fazendinha
    const ssFazendinha = openFazendinhaSheet();
    
    // Cria ou limpa a aba Organistas
    let shOrganistas = ssFazendinha.getSheetByName('Organistas');
    if (!shOrganistas) {
      shOrganistas = ssFazendinha.insertSheet('Organistas');
      console.log(`✅ Nova aba Organistas criada na planilha externa de Fazendinha`);
    } else {
      // Só limpa se não há organistas para inserir (otimização)
      if (organistas.length === 0) {
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (nenhum organista encontrado para ${localEnsaio})`);
        }
      } else {
        // Se há organistas, limpa apenas o necessário para evitar conflitos
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (preparando para inserir ${organistas.length} organistas)`);
        }
      }
    }

    // Verifica se existe cabeçalho na linha 4
    const headerExists = shOrganistas.getRange(4, 1, 1, 7).getValues()[0].some(cell => cell && cell.toString().trim());
    
    if (!headerExists) {
      shOrganistas.getRange(4, 1, 1, 7).setValues([[
        'ID', 'Nome', 'Cargo', 'Nível', 'Comum', 'Cidade', 'Tocou no último ensaio?'
      ]]);
      shOrganistas.getRange(4, 1, 1, 7).setFontWeight('bold');
      shOrganistas.getRange(4, 1, 1, 7).setBackground('#e8f0fe');
      console.log(`✅ Cabeçalho criado na linha 4 com 7 colunas (incluindo ID)`);
    } else {
      console.log(`✅ Cabeçalho já existe na linha 4, preservando`);
    }

    // Popula dados a partir da linha 5
    if (organistas.length > 0) {
      const dadosParaInserir = organistas.map((org, index) => [
        index + 1, // ID sequencial
        org.nome,
        org.cargo,
        org.nivel,
        org.comum,
        org.cidade,
        '' // Tocou no último ensaio? (vazio)
      ]);

      shOrganistas.getRange(5, 1, dadosParaInserir.length, 7).setValues(dadosParaInserir);
      console.log(`✅ ${organistas.length} organistas inseridas a partir da linha 5 com IDs sequenciais`);
    }

    // Formatação
    shOrganistas.getRange(4, 1, 1, 7).setBorder(true, true, true, true, true, true);
    
    // Autoajusta as colunas APÓS inserir os dados
    shOrganistas.autoResizeColumns(1, 7);
    
     // Define larguras específicas para colunas C, D, E e G
     shOrganistas.setColumnWidth(3, 217); // Coluna C (Cargo)
     shOrganistas.setColumnWidth(4, 134); // Coluna D (Nível da organista)
     shOrganistas.setColumnWidth(5, 120); // Coluna E (Comum) - mantém 120
     shOrganistas.setColumnWidth(6, 120); // Coluna F (Cidade) - mantém 120
     shOrganistas.setColumnWidth(7, 180); // Coluna G (Tocou no último ensaio?)
    
    console.log(`✅ Aba Organistas da planilha externa de Fazendinha alimentada com sucesso para: ${localEnsaio}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Organistas',
      planilhaId: FAZENDINHA_SHEET_ID,
      totalOrganistas: organistas.length,
      organistas: organistas.map(org => org.nome)
    };

  } catch (error) {
    console.error(`❌ Erro ao alimentar aba Organistas da planilha externa de Fazendinha para ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para alimentar aba Organistas da planilha de Jandira
function alimentarAbaOrganistasJandira(localEnsaio = 'Jandira') {
  try {
    console.log(`🏛️ Iniciando alimentação da aba Organistas na planilha externa de Jandira para: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxNivel = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nivel') || h.toString().toLowerCase().includes('classe'));
    const idxComum = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('comum'));
    const idxCidade = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('cidade') || 
      h.toString().toLowerCase().includes('municipio') || 
      h.toString().toLowerCase().includes('município') ||
      h.toString().toLowerCase().includes('localidade')
    ));
    const idxLocalEnsaio = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('local_ensaio'));
    const idxVaiTocar = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('vai_tocar'));

    if (idxNome < 0 || idxCargo < 0) {
      throw new Error('Colunas "nome" ou "cargo" não encontradas');
    }

    // Filtra dados para organistas, examinadoras, instrutoras e secretárias da música do local especificado
    const organistas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const nivel = norm(row[idxNivel] || '');
      const comum = norm(row[idxComum] || '') || '(Sem comum)';
      const cidade = norm(row[idxCidade] || '') || localEnsaio;
      const localEnsaioRow = norm(row[idxLocalEnsaio] || '') || '(Sem local definido)';
      
      const cargoLower = cargo.toLowerCase();
      const isOrganista = cargoLower.includes('organista') || 
                         cargoLower.includes('examinadora') || 
                         cargoLower.includes('instrutora');
      
      const isLocalCorreto = compararLocaisEnsaio(localEnsaioRow, localEnsaio);
      
      // LÓGICA SIMPLES: Se está registrado na planilha principal com o local correto, esteve presente
      if (isOrganista && isLocalCorreto) {
        organistas.push({
          nome,
          cargo,
          nivel,
          comum,
          cidade,
          localEnsaio: localEnsaioRow,
          _ord: i
        });
        console.log(`🎹 Organista encontrada: ${nome} (${cargo}) - ${localEnsaioRow}`);
      }
    }

    console.log(`📊 Encontradas ${organistas.length} organistas para o local: ${localEnsaio}`);

    // Acessa a planilha externa de Jandira
    const ssJandira = openJandiraSheet();
    
    // Cria ou limpa a aba Organistas
    let shOrganistas = ssJandira.getSheetByName('Organistas');
    if (!shOrganistas) {
      shOrganistas = ssJandira.insertSheet('Organistas');
      console.log(`✅ Nova aba Organistas criada na planilha externa de Jandira`);
    } else {
      // Só limpa se não há organistas para inserir (otimização)
      if (organistas.length === 0) {
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (nenhum organista encontrado para ${localEnsaio})`);
        }
      } else {
        // Se há organistas, limpa apenas o necessário para evitar conflitos
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (preparando para inserir ${organistas.length} organistas)`);
        }
      }
    }

    // Verifica se existe cabeçalho na linha 4
    const headerExists = shOrganistas.getRange(4, 1, 1, 7).getValues()[0].some(cell => cell && cell.toString().trim());
    
    if (!headerExists) {
      shOrganistas.getRange(4, 1, 1, 7).setValues([[
        'ID', 'Nome', 'Cargo', 'Nível', 'Comum', 'Cidade', 'Tocou no último ensaio?'
      ]]);
      shOrganistas.getRange(4, 1, 1, 7).setFontWeight('bold');
      shOrganistas.getRange(4, 1, 1, 7).setBackground('#e8f0fe');
      console.log(`✅ Cabeçalho criado na linha 4 com 7 colunas (incluindo ID)`);
    } else {
      console.log(`✅ Cabeçalho já existe na linha 4, preservando`);
    }

    // Popula dados a partir da linha 5
    if (organistas.length > 0) {
      const dadosParaInserir = organistas.map((org, index) => [
        index + 1, // ID sequencial
        org.nome,
        org.cargo,
        org.nivel,
        org.comum,
        org.cidade,
        '' // Tocou no último ensaio? (vazio)
      ]);

      shOrganistas.getRange(5, 1, dadosParaInserir.length, 7).setValues(dadosParaInserir);
      console.log(`✅ ${organistas.length} organistas inseridas a partir da linha 5 com IDs sequenciais`);
    }

    // Formatação
    shOrganistas.getRange(4, 1, 1, 7).setBorder(true, true, true, true, true, true);
    
    // Autoajusta as colunas APÓS inserir os dados
    shOrganistas.autoResizeColumns(1, 7);
    
     // Define larguras específicas para colunas C, D, E e G
     shOrganistas.setColumnWidth(3, 217); // Coluna C (Cargo)
     shOrganistas.setColumnWidth(4, 134); // Coluna D (Nível da organista)
     shOrganistas.setColumnWidth(5, 120); // Coluna E (Comum) - mantém 120
     shOrganistas.setColumnWidth(6, 120); // Coluna F (Cidade) - mantém 120
     shOrganistas.setColumnWidth(7, 180); // Coluna G (Tocou no último ensaio?)
    
    console.log(`✅ Aba Organistas da planilha externa de Jandira alimentada com sucesso para: ${localEnsaio}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Organistas',
      planilhaId: JANDIRA_SHEET_ID,
      totalOrganistas: organistas.length,
      organistas: organistas.map(org => org.nome)
    };

  } catch (error) {
    console.error(`❌ Erro ao alimentar aba Organistas da planilha externa de Jandira para ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para alimentar aba Organistas da planilha de Caucaia
function alimentarAbaOrganistasCaucaia(localEnsaio = 'Caucaia') {
  try {
    console.log(`🏛️ Iniciando alimentação da aba Organistas na planilha externa de Caucaia para: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxNivel = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nivel') || h.toString().toLowerCase().includes('classe'));
    const idxComum = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('comum'));
    const idxCidade = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('cidade') || 
      h.toString().toLowerCase().includes('municipio') || 
      h.toString().toLowerCase().includes('município') ||
      h.toString().toLowerCase().includes('localidade')
    ));
    const idxLocalEnsaio = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('local_ensaio'));
    const idxVaiTocar = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('vai_tocar'));

    if (idxNome < 0 || idxCargo < 0) {
      throw new Error('Colunas "nome" ou "cargo" não encontradas');
    }

    // Filtra dados para organistas, examinadoras, instrutoras e secretárias da música do local especificado
    const organistas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const nivel = norm(row[idxNivel] || '');
      const comum = norm(row[idxComum] || '') || '(Sem comum)';
      const cidade = norm(row[idxCidade] || '') || localEnsaio;
      const localEnsaioRow = norm(row[idxLocalEnsaio] || '') || '(Sem local definido)';
      
      const cargoLower = cargo.toLowerCase();
      const isOrganista = cargoLower.includes('organista') || 
                         cargoLower.includes('examinadora') || 
                         cargoLower.includes('instrutora');
      
      const isLocalCorreto = compararLocaisEnsaio(localEnsaioRow, localEnsaio);
      
      // LÓGICA SIMPLES: Se está registrado na planilha principal com o local correto, esteve presente
      if (isOrganista && isLocalCorreto) {
        organistas.push({
          nome,
          cargo,
          nivel,
          comum,
          cidade,
          localEnsaio: localEnsaioRow,
          _ord: i
        });
        console.log(`🎹 Organista encontrada: ${nome} (${cargo}) - ${localEnsaioRow}`);
      }
    }

    console.log(`📊 Encontradas ${organistas.length} organistas para o local: ${localEnsaio}`);

    // Acessa a planilha externa de Caucaia
    const ssCaucaia = openCaucaiaSheet();
    
    // Cria ou limpa a aba Organistas
    let shOrganistas = ssCaucaia.getSheetByName('Organistas');
    if (!shOrganistas) {
      shOrganistas = ssCaucaia.insertSheet('Organistas');
      console.log(`✅ Nova aba Organistas criada na planilha externa de Caucaia`);
    } else {
      // Só limpa se não há organistas para inserir (otimização)
      if (organistas.length === 0) {
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (nenhum organista encontrado para ${localEnsaio})`);
        }
      } else {
        // Se há organistas, limpa apenas o necessário para evitar conflitos
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (preparando para inserir ${organistas.length} organistas)`);
        }
      }
    }

    // Verifica se existe cabeçalho na linha 4
    const headerExists = shOrganistas.getRange(4, 1, 1, 7).getValues()[0].some(cell => cell && cell.toString().trim());
    
    if (!headerExists) {
      shOrganistas.getRange(4, 1, 1, 7).setValues([[
        'ID', 'Nome', 'Cargo', 'Nível', 'Comum', 'Cidade', 'Tocou no último ensaio?'
      ]]);
      shOrganistas.getRange(4, 1, 1, 7).setFontWeight('bold');
      shOrganistas.getRange(4, 1, 1, 7).setBackground('#e8f0fe');
      console.log(`✅ Cabeçalho criado na linha 4 com 7 colunas (incluindo ID)`);
    } else {
      console.log(`✅ Cabeçalho já existe na linha 4, preservando`);
    }

    // Popula dados a partir da linha 5
    if (organistas.length > 0) {
      const dadosParaInserir = organistas.map((org, index) => [
        index + 1, // ID sequencial
        org.nome,
        org.cargo,
        org.nivel,
        org.comum,
        org.cidade,
        '' // Tocou no último ensaio? (vazio)
      ]);

      shOrganistas.getRange(5, 1, dadosParaInserir.length, 7).setValues(dadosParaInserir);
      console.log(`✅ ${organistas.length} organistas inseridas a partir da linha 5 com IDs sequenciais`);
    }

    // Formatação
    shOrganistas.getRange(4, 1, 1, 7).setBorder(true, true, true, true, true, true);
    
    // Autoajusta as colunas APÓS inserir os dados
    shOrganistas.autoResizeColumns(1, 7);
    
     // Define larguras específicas para colunas C, D, E e G
     shOrganistas.setColumnWidth(3, 217); // Coluna C (Cargo)
     shOrganistas.setColumnWidth(4, 134); // Coluna D (Nível da organista)
     shOrganistas.setColumnWidth(5, 120); // Coluna E (Comum) - mantém 120
     shOrganistas.setColumnWidth(6, 120); // Coluna F (Cidade) - mantém 120
     shOrganistas.setColumnWidth(7, 180); // Coluna G (Tocou no último ensaio?)
    
    console.log(`✅ Aba Organistas da planilha externa de Caucaia alimentada com sucesso para: ${localEnsaio}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Organistas',
      planilhaId: CAUCAIA_SHEET_ID,
      totalOrganistas: organistas.length,
      organistas: organistas.map(org => org.nome)
    };

  } catch (error) {
    console.error(`❌ Erro ao alimentar aba Organistas da planilha externa de Caucaia para ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para alimentar aba Organistas da planilha de Cotia
function alimentarAbaOrganistasCotia(localEnsaio = 'Cotia') {
  try {
    console.log('🎹 Iniciando alimentação da aba Organistas da planilha de Cotia...');
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxNivel = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nivel') || h.toString().toLowerCase().includes('classe'));
    const idxComum = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('comum'));
    const idxCidade = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('cidade') || 
      h.toString().toLowerCase().includes('municipio') || 
      h.toString().toLowerCase().includes('município') ||
      h.toString().toLowerCase().includes('localidade')
    ));
    const idxLocalEnsaio = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('local_ensaio'));
    const idxVaiTocar = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('vai_tocar'));

    if (idxNome < 0 || idxCargo < 0) {
      throw new Error('Colunas "nome" ou "cargo" não encontradas');
    }

    // Filtra dados para organistas, examinadoras, instrutoras e secretárias da música do local especificado
    const organistas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const nivel = norm(row[idxNivel] || '');
      const comum = norm(row[idxComum] || '') || '(Sem comum)';
      const cidade = norm(row[idxCidade] || '') || localEnsaio;
      const localEnsaioRow = norm(row[idxLocalEnsaio] || '') || '(Sem local definido)';
      
      const cargoLower = cargo.toLowerCase();
      const isOrganista = cargoLower.includes('organista') || 
                         cargoLower.includes('examinadora') || 
                         cargoLower.includes('instrutora');
      
      const isLocalCorreto = compararLocaisEnsaio(localEnsaioRow, localEnsaio);
      
      // LÓGICA SIMPLES: Se está registrado na planilha principal com o local correto, esteve presente
      if (isOrganista && isLocalCorreto) {
        organistas.push({
          nome,
          cargo,
          nivel,
          comum,
          cidade,
          localEnsaio: localEnsaioRow,
          _ord: i
        });
        console.log(`🎹 Organista encontrada: ${nome} (${cargo}) - ${localEnsaioRow}`);
      }
    }

    console.log(`📊 Encontradas ${organistas.length} organistas para o local: ${localEnsaio}`);

    // Acessa a planilha externa de Cotia
    const ssCotia = openCotiaSheet();
    
    // Cria ou limpa a aba Organistas
    let shOrganistas = ssCotia.getSheetByName('Organistas');
    if (!shOrganistas) {
      shOrganistas = ssCotia.insertSheet('Organistas');
      console.log(`✅ Nova aba Organistas criada na planilha externa de Cotia`);
    } else {
      // Só limpa se não há organistas para inserir (otimização)
      if (organistas.length === 0) {
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (nenhum organista encontrado para ${localEnsaio})`);
        }
      } else {
        // Se há organistas, limpa apenas o necessário para evitar conflitos
        const ultimaLinha = shOrganistas.getLastRow();
        if (ultimaLinha > 4) {
          shOrganistas.getRange(5, 1, ultimaLinha - 4, shOrganistas.getLastColumn()).clearContent();
          console.log(`✅ Dados limpos na aba Organistas (preparando para inserir ${organistas.length} organistas)`);
        }
      }
    }

    // Verifica se existe cabeçalho na linha 4
    const headerExists = shOrganistas.getRange(4, 1, 1, 7).getValues()[0].some(cell => cell && cell.toString().trim());
    
    if (!headerExists) {
      shOrganistas.getRange(4, 1, 1, 7).setValues([[
        'ID', 'Nome', 'Cargo', 'Nível', 'Comum', 'Cidade', 'Tocou no último ensaio?'
      ]]);
      shOrganistas.getRange(4, 1, 1, 7).setFontWeight('bold');
      shOrganistas.getRange(4, 1, 1, 7).setBackground('#e8f0fe');
      console.log(`✅ Cabeçalho criado na linha 4 com 7 colunas (incluindo ID)`);
    } else {
      console.log(`✅ Cabeçalho já existe na linha 4, preservando`);
    }

    // Popula dados a partir da linha 5
    if (organistas.length > 0) {
      const dadosParaInserir = organistas.map((org, index) => [
        index + 1, // ID sequencial
        org.nome,
        org.cargo,
        org.nivel,
        org.comum,
        org.cidade,
        '' // Tocou no último ensaio? (vazio)
      ]);

      shOrganistas.getRange(5, 1, dadosParaInserir.length, 7).setValues(dadosParaInserir);
      console.log(`✅ ${organistas.length} organistas inseridas a partir da linha 5 com IDs sequenciais`);
    }

    // Formatação
    shOrganistas.getRange(4, 1, 1, 7).setBorder(true, true, true, true, true, true);
    
    // Autoajusta as colunas APÓS inserir os dados
    shOrganistas.autoResizeColumns(1, 7);
    
     // Define larguras específicas para colunas C, D, E e G
     shOrganistas.setColumnWidth(3, 217); // Coluna C (Cargo)
     shOrganistas.setColumnWidth(4, 134); // Coluna D (Nível da organista)
     shOrganistas.setColumnWidth(5, 120); // Coluna E (Comum) - mantém 120
     shOrganistas.setColumnWidth(6, 120); // Coluna F (Cidade) - mantém 120
     shOrganistas.setColumnWidth(7, 180); // Coluna G (Tocou no último ensaio?)
    
    console.log(`✅ Aba Organistas da planilha externa de Cotia alimentada com sucesso para: ${localEnsaio}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Organistas',
      planilhaId: COTIA_SHEET_ID,
      totalOrganistas: organistas.length,
      organistas: organistas.map(org => org.nome)
    };
    
  } catch (error) {
    console.error(`❌ Erro ao alimentar aba Organistas da planilha externa de Cotia para ${localEnsaio}:`, error);
    throw error;
  }
}

// Função principal para executar exportação para Itapevi
function executarExportarItapevi() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // Lista os locais disponíveis
    const resultadoLocais = listarLocaisEnsaio();
    if (!resultadoLocais || !resultadoLocais.ok || !resultadoLocais.locais || resultadoLocais.locais.length === 0) {
      ui.alert('❌ Nenhum local de ensaio encontrado nos dados.');
      return;
    }

    const locais = resultadoLocais.locais;

    // Cria opções para o prompt
    const opcoes = locais.map((local, index) => `${index + 1}. ${local}`).join('\n');
    const prompt = `Escolha o local de ensaio para exportar para a planilha de Itapevi:\n\n${opcoes}\n\nDigite o número da opção:`;
    
    const resposta = ui.prompt('📤 Exportar para Planilha de Itapevi', prompt, ui.ButtonSet.OK_CANCEL);
    
    if (resposta.getSelectedButton() !== ui.Button.OK) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }

    const escolha = parseInt(resposta.getResponseText().trim());
    if (isNaN(escolha) || escolha < 1 || escolha > locais.length) {
      ui.alert('❌ Opção inválida. Por favor, digite um número válido.');
      return;
    }

    const localEscolhido = locais[escolha - 1];
    
    // Confirma a operação
    const confirmacao = ui.alert(
      '📤 Confirmar Exportação para Itapevi',
      `Deseja exportar os dados do ensaio "${localEscolhido}" para a planilha externa de Itapevi?\n\nIsso irá:\n• Atualizar a aba "Resumo" com contadores de instrumentos e cargos\n• Atualizar a aba "Organistas" com lista de organistas\n\nConfirma a operação?`,
      ui.ButtonSet.YES_NO
    );

    if (confirmacao !== ui.Button.YES) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }

    ui.alert('⏳ Iniciando exportação para Itapevi...\n\nPor favor, aguarde enquanto os dados são processados.');

    // Executa a exportação completa
    const resultadoResumo = exportarParaPlanilhaItapeviCompleta(localEscolhido);
    const resultadoOrganistas = alimentarAbaOrganistasItapevi(localEscolhido);

    // Mostra resultado
    const mensagem = `✅ Exportação para Itapevi concluída com sucesso!\n\n` +
      `📊 Aba Resumo atualizada:\n` +
      `• Total de membros: ${resultadoResumo.totalMembros}\n` +
      `• Instrumentos contados: ${Object.keys(resultadoResumo.instrumentos).filter(k => resultadoResumo.instrumentos[k] > 0).length}\n` +
      `• Cargos ministeriais: ${Object.keys(resultadoResumo.cargosMinisteriais).filter(k => resultadoResumo.cargosMinisteriais[k] > 0).length}\n` +
      `• Cargos de apoio: ${Object.keys(resultadoResumo.cargosApoio).filter(k => resultadoResumo.cargosApoio[k] > 0).length}\n\n` +
      `🎹 Aba Organistas atualizada:\n` +
      `• Total de organistas: ${resultadoOrganistas.totalOrganistas}\n\n` +
      `📋 Planilha ID: ${resultadoResumo.planilhaId}`;

    ui.alert('🎉 Exportação Concluída!', mensagem, ui.ButtonSet.OK);

  } catch (error) {
    console.error('❌ Erro na exportação para Itapevi:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro na Exportação', `Erro ao exportar para planilha de Itapevi: ${error.message}`, ui.ButtonSet.OK);
  }
}

function executarExportarVargemGrande() {
  try {
    const ui = SpreadsheetApp.getUi();
    const resultadoLocais = listarLocaisEnsaio();
    if (!resultadoLocais || !resultadoLocais.ok || !resultadoLocais.locais || resultadoLocais.locais.length === 0) {
      ui.alert('❌ Nenhum local de ensaio encontrado nos dados.');
      return;
    }
    const locais = resultadoLocais.locais;
    const opcoes = locais.map((local, index) => `${index + 1}. ${local}`).join('\n');
    const prompt = `Escolha o local de ensaio para exportar para a planilha de VargemGrande:\n\n${opcoes}\n\nDigite o número da opção:`;
    const resposta = ui.prompt('📤 Exportar para Planilha de VargemGrande', prompt, ui.ButtonSet.OK_CANCEL);
    if (resposta.getSelectedButton() !== ui.Button.OK) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }
    const escolha = parseInt(resposta.getResponseText().trim());
    if (isNaN(escolha) || escolha < 1 || escolha > locais.length) {
      ui.alert('❌ Opção inválida. Por favor, digite um número válido.');
      return;
    }
    const localEscolhido = locais[escolha - 1];
    const confirmacao = ui.alert(
      '📤 Confirmar Exportação para VargemGrande',
      `Deseja exportar os dados do ensaio "${localEscolhido}" para a planilha externa de VargemGrande?\n\nIsso irá:\n• Atualizar a aba "Resumo" com contadores de instrumentos e cargos\n• Atualizar a aba "Organistas" com lista de organistas\n\nConfirma a operação?`,
      ui.ButtonSet.YES_NO
    );
    if (confirmacao !== ui.Button.YES) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }
    ui.alert('⏳ Iniciando exportação para VargemGrande...\n\nPor favor, aguarde enquanto os dados são processados.');
    const resultadoResumo = exportarParaPlanilhaVargemGrandeCompleta(localEscolhido);
    const resultadoOrganistas = alimentarAbaOrganistasVargemGrande(localEscolhido);
    const mensagem = `✅ Exportação para VargemGrande concluída com sucesso!\n\n` +
      `📊 Aba Resumo atualizada:\n` +
      `• Total de membros: ${resultadoResumo.totalMembros}\n` +
      `• Instrumentos contados: ${Object.keys(resultadoResumo.instrumentos).filter(k => resultadoResumo.instrumentos[k] > 0).length}\n` +
      `• Cargos ministeriais: ${Object.keys(resultadoResumo.cargosMinisteriais).filter(k => resultadoResumo.cargosMinisteriais[k] > 0).length}\n` +
      `• Cargos de apoio: ${Object.keys(resultadoResumo.cargosApoio).filter(k => resultadoResumo.cargosApoio[k] > 0).length}\n\n` +
      `🎹 Aba Organistas atualizada:\n` +
      `• Total de organistas: ${resultadoOrganistas.totalOrganistas}\n\n` +
      `📋 Planilha ID: ${resultadoResumo.planilhaId}`;
    ui.alert('🎉 Exportação Concluída!', mensagem, ui.ButtonSet.OK);
  } catch (error) {
    console.error('❌ Erro na exportação para VargemGrande:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro na Exportação', `Erro ao exportar para planilha de VargemGrande: ${error.message}`, ui.ButtonSet.OK);
  }
}

function executarExportarPirapora() {
  try {
    const ui = SpreadsheetApp.getUi();
    const resultadoLocais = listarLocaisEnsaio();
    if (!resultadoLocais || !resultadoLocais.ok || !resultadoLocais.locais || resultadoLocais.locais.length === 0) {
      ui.alert('❌ Nenhum local de ensaio encontrado nos dados.');
      return;
    }
    const locais = resultadoLocais.locais;
    const opcoes = locais.map((local, index) => `${index + 1}. ${local}`).join('\n');
    const prompt = `Escolha o local de ensaio para exportar para a planilha de Pirapora:\n\n${opcoes}\n\nDigite o número da opção:`;
    const resposta = ui.prompt('📤 Exportar para Planilha de Pirapora', prompt, ui.ButtonSet.OK_CANCEL);
    if (resposta.getSelectedButton() !== ui.Button.OK) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }
    const escolha = parseInt(resposta.getResponseText().trim());
    if (isNaN(escolha) || escolha < 1 || escolha > locais.length) {
      ui.alert('❌ Opção inválida. Por favor, digite um número válido.');
      return;
    }
    const localEscolhido = locais[escolha - 1];
    const confirmacao = ui.alert(
      '📤 Confirmar Exportação para Pirapora',
      `Deseja exportar os dados do ensaio "${localEscolhido}" para a planilha externa de Pirapora?\n\nIsso irá:\n• Atualizar a aba "Resumo" com contadores de instrumentos e cargos\n• Atualizar a aba "Organistas" com lista de organistas\n\nConfirma a operação?`,
      ui.ButtonSet.YES_NO
    );
    if (confirmacao !== ui.Button.YES) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }
    ui.alert('⏳ Iniciando exportação para Pirapora...\n\nPor favor, aguarde enquanto os dados são processados.');
    const resultadoResumo = exportarParaPlanilhaPiraporaCompleta(localEscolhido);
    const resultadoOrganistas = alimentarAbaOrganistasPirapora(localEscolhido);
    const mensagem = `✅ Exportação para Pirapora concluída com sucesso!\n\n` +
      `📊 Aba Resumo atualizada:\n` +
      `• Total de membros: ${resultadoResumo.totalMembros}\n` +
      `• Instrumentos contados: ${Object.keys(resultadoResumo.instrumentos).filter(k => resultadoResumo.instrumentos[k] > 0).length}\n` +
      `• Cargos ministeriais: ${Object.keys(resultadoResumo.cargosMinisteriais).filter(k => resultadoResumo.cargosMinisteriais[k] > 0).length}\n` +
      `• Cargos de apoio: ${Object.keys(resultadoResumo.cargosApoio).filter(k => resultadoResumo.cargosApoio[k] > 0).length}\n\n` +
      `🎹 Aba Organistas atualizada:\n` +
      `• Total de organistas: ${resultadoOrganistas.totalOrganistas}\n\n` +
      `📋 Planilha ID: ${resultadoResumo.planilhaId}`;
    ui.alert('🎉 Exportação Concluída!', mensagem, ui.ButtonSet.OK);
  } catch (error) {
    console.error('❌ Erro na exportação para Pirapora:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro na Exportação', `Erro ao exportar para planilha de Pirapora: ${error.message}`, ui.ButtonSet.OK);
  }
}

function executarExportarFazendinha() {
  try {
    const ui = SpreadsheetApp.getUi();
    const resultadoLocais = listarLocaisEnsaio();
    if (!resultadoLocais || !resultadoLocais.ok || !resultadoLocais.locais || resultadoLocais.locais.length === 0) {
      ui.alert('❌ Nenhum local de ensaio encontrado nos dados.');
      return;
    }
    const locais = resultadoLocais.locais;
    const opcoes = locais.map((local, index) => `${index + 1}. ${local}`).join('\n');
    const prompt = `Escolha o local de ensaio para exportar para a planilha de Fazendinha:\n\n${opcoes}\n\nDigite o número da opção:`;
    const resposta = ui.prompt('📤 Exportar para Planilha de Fazendinha', prompt, ui.ButtonSet.OK_CANCEL);
    if (resposta.getSelectedButton() !== ui.Button.OK) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }
    const escolha = parseInt(resposta.getResponseText().trim());
    if (isNaN(escolha) || escolha < 1 || escolha > locais.length) {
      ui.alert('❌ Opção inválida. Por favor, digite um número válido.');
      return;
    }
    const localEscolhido = locais[escolha - 1];
    const confirmacao = ui.alert(
      '📤 Confirmar Exportação para Fazendinha',
      `Deseja exportar os dados do ensaio "${localEscolhido}" para a planilha externa de Fazendinha?\n\nIsso irá:\n• Atualizar a aba "Resumo" com contadores de instrumentos e cargos\n• Atualizar a aba "Organistas" com lista de organistas\n\nConfirma a operação?`,
      ui.ButtonSet.YES_NO
    );
    if (confirmacao !== ui.Button.YES) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }
    ui.alert('⏳ Iniciando exportação para Fazendinha...\n\nPor favor, aguarde enquanto os dados são processados.');
    const resultadoResumo = exportarParaPlanilhaFazendinhaCompleta(localEscolhido);
    const resultadoOrganistas = alimentarAbaOrganistasFazendinha(localEscolhido);
    const mensagem = `✅ Exportação para Fazendinha concluída com sucesso!\n\n` +
      `📊 Aba Resumo atualizada:\n` +
      `• Total de membros: ${resultadoResumo.totalMembros}\n` +
      `• Instrumentos contados: ${Object.keys(resultadoResumo.instrumentos).filter(k => resultadoResumo.instrumentos[k] > 0).length}\n` +
      `• Cargos ministeriais: ${Object.keys(resultadoResumo.cargosMinisteriais).filter(k => resultadoResumo.cargosMinisteriais[k] > 0).length}\n` +
      `• Cargos de apoio: ${Object.keys(resultadoResumo.cargosApoio).filter(k => resultadoResumo.cargosApoio[k] > 0).length}\n\n` +
      `🎹 Aba Organistas atualizada:\n` +
      `• Total de organistas: ${resultadoOrganistas.totalOrganistas}\n\n` +
      `📋 Planilha ID: ${resultadoResumo.planilhaId}`;
    ui.alert('🎉 Exportação Concluída!', mensagem, ui.ButtonSet.OK);
  } catch (error) {
    console.error('❌ Erro na exportação para Fazendinha:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro na Exportação', `Erro ao exportar para planilha de Fazendinha: ${error.message}`, ui.ButtonSet.OK);
  }
}

function executarExportarJandira() {
  try {
    const ui = SpreadsheetApp.getUi();
    const resultadoLocais = listarLocaisEnsaio();
    if (!resultadoLocais || !resultadoLocais.ok || !resultadoLocais.locais || resultadoLocais.locais.length === 0) {
      ui.alert('❌ Nenhum local de ensaio encontrado nos dados.');
      return;
    }
    const locais = resultadoLocais.locais;
    const opcoes = locais.map((local, index) => `${index + 1}. ${local}`).join('\n');
    const prompt = `Escolha o local de ensaio para exportar para a planilha de Jandira:\n\n${opcoes}\n\nDigite o número da opção:`;
    const resposta = ui.prompt('📤 Exportar para Planilha de Jandira', prompt, ui.ButtonSet.OK_CANCEL);
    if (resposta.getSelectedButton() !== ui.Button.OK) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }
    const escolha = parseInt(resposta.getResponseText().trim());
    if (isNaN(escolha) || escolha < 1 || escolha > locais.length) {
      ui.alert('❌ Opção inválida. Por favor, digite um número válido.');
      return;
    }
    const localEscolhido = locais[escolha - 1];
    const confirmacao = ui.alert(
      '📤 Confirmar Exportação para Jandira',
      `Deseja exportar os dados do ensaio "${localEscolhido}" para a planilha externa de Jandira?\n\nIsso irá:\n• Atualizar a aba "Resumo" com contadores de instrumentos e cargos\n• Atualizar a aba "Organistas" com lista de organistas\n\nConfirma a operação?`,
      ui.ButtonSet.YES_NO
    );
    if (confirmacao !== ui.Button.YES) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }
    ui.alert('⏳ Iniciando exportação para Jandira...\n\nPor favor, aguarde enquanto os dados são processados.');
    const resultadoResumo = exportarParaPlanilhaJandiraCompleta(localEscolhido);
    const resultadoOrganistas = alimentarAbaOrganistasJandira(localEscolhido);
    const mensagem = `✅ Exportação para Jandira concluída com sucesso!\n\n` +
      `📊 Aba Resumo atualizada:\n` +
      `• Total de membros: ${resultadoResumo.totalMembros}\n` +
      `• Instrumentos contados: ${Object.keys(resultadoResumo.instrumentos).filter(k => resultadoResumo.instrumentos[k] > 0).length}\n` +
      `• Cargos ministeriais: ${Object.keys(resultadoResumo.cargosMinisteriais).filter(k => resultadoResumo.cargosMinisteriais[k] > 0).length}\n` +
      `• Cargos de apoio: ${Object.keys(resultadoResumo.cargosApoio).filter(k => resultadoResumo.cargosApoio[k] > 0).length}\n\n` +
      `🎹 Aba Organistas atualizada:\n` +
      `• Total de organistas: ${resultadoOrganistas.totalOrganistas}\n\n` +
      `📋 Planilha ID: ${resultadoResumo.planilhaId}`;
    ui.alert('🎉 Exportação Concluída!', mensagem, ui.ButtonSet.OK);
  } catch (error) {
    console.error('❌ Erro na exportação para Jandira:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro na Exportação', `Erro ao exportar para planilha de Jandira: ${error.message}`, ui.ButtonSet.OK);
  }
}

function executarExportarCaucaia() {
  try {
  const ui = SpreadsheetApp.getUi();
    const resultadoLocais = listarLocaisEnsaio();
    if (!resultadoLocais || !resultadoLocais.ok || !resultadoLocais.locais || resultadoLocais.locais.length === 0) {
      ui.alert('❌ Nenhum local de ensaio encontrado nos dados.');
      return;
    }
    const locais = resultadoLocais.locais;
    const opcoes = locais.map((local, index) => `${index + 1}. ${local}`).join('\n');
    const prompt = `Escolha o local de ensaio para exportar para a planilha de Caucaia:\n\n${opcoes}\n\nDigite o número da opção:`;
    const resposta = ui.prompt('📤 Exportar para Planilha de Caucaia', prompt, ui.ButtonSet.OK_CANCEL);
    if (resposta.getSelectedButton() !== ui.Button.OK) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }
    const escolha = parseInt(resposta.getResponseText().trim());
    if (isNaN(escolha) || escolha < 1 || escolha > locais.length) {
      ui.alert('❌ Opção inválida. Por favor, digite um número válido.');
      return;
    }
    const localEscolhido = locais[escolha - 1];
    const confirmacao = ui.alert(
      '📤 Confirmar Exportação para Caucaia',
      `Deseja exportar os dados do ensaio "${localEscolhido}" para a planilha externa de Caucaia?\n\nIsso irá:\n• Atualizar a aba "Resumo" com contadores de instrumentos e cargos\n• Atualizar a aba "Organistas" com lista de organistas\n\nConfirma a operação?`,
      ui.ButtonSet.YES_NO
    );
    if (confirmacao !== ui.Button.YES) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }
    ui.alert('⏳ Iniciando exportação para Caucaia...\n\nPor favor, aguarde enquanto os dados são processados.');
    const resultadoResumo = exportarParaPlanilhaCaucaiaCompleta(localEscolhido);
    const resultadoOrganistas = alimentarAbaOrganistasCaucaia(localEscolhido);
    const mensagem = `✅ Exportação para Caucaia concluída com sucesso!\n\n` +
      `📊 Aba Resumo atualizada:\n` +
      `• Total de membros: ${resultadoResumo.totalMembros}\n` +
      `• Instrumentos contados: ${Object.keys(resultadoResumo.instrumentos).filter(k => resultadoResumo.instrumentos[k] > 0).length}\n` +
      `• Cargos ministeriais: ${Object.keys(resultadoResumo.cargosMinisteriais).filter(k => resultadoResumo.cargosMinisteriais[k] > 0).length}\n` +
      `• Cargos de apoio: ${Object.keys(resultadoResumo.cargosApoio).filter(k => resultadoResumo.cargosApoio[k] > 0).length}\n\n` +
      `🎹 Aba Organistas atualizada:\n` +
      `• Total de organistas: ${resultadoOrganistas.totalOrganistas}\n\n` +
      `📋 Planilha ID: ${resultadoResumo.planilhaId}`;
    ui.alert('🎉 Exportação Concluída!', mensagem, ui.ButtonSet.OK);
  } catch (error) {
    console.error('❌ Erro na exportação para Caucaia:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro na Exportação', `Erro ao exportar para planilha de Caucaia: ${error.message}`, ui.ButtonSet.OK);
  }
}

function executarExportarCotia() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // Primeiro lista os locais disponíveis
    const resultadoLocais = listarLocaisEnsaio();
    
    if (!resultadoLocais || !resultadoLocais.ok || !resultadoLocais.locais || resultadoLocais.total === 0) {
      ui.alert('Aviso', 'Nenhum local de ensaio encontrado nos dados.', ui.ButtonSet.OK);
      return;
    }
    
    const locais = resultadoLocais;
    
    // Cria uma lista de opções para o usuário escolher
    const opcoes = locais.locais.map((local, index) => `${index + 1}. ${local} (${locais.contagem[local]} membros)`).join('\n');
    const prompt = `Escolha o local de ensaio para exportação completa para a planilha de Cotia:\n\n${opcoes}\n\nDigite o número da opção:`;
    
    const resposta = ui.prompt('Selecionar Local de Ensaio', prompt, ui.ButtonSet.OK_CANCEL);
    
    if (resposta.getSelectedButton() === ui.Button.OK) {
      const escolha = parseInt(resposta.getResponseText().trim());
      
      if (isNaN(escolha) || escolha < 1 || escolha > locais.locais.length) {
        ui.alert('Erro', 'Opção inválida. Por favor, digite um número válido.', ui.ButtonSet.OK);
        return;
      }
      
      const localEscolhido = locais.locais[escolha - 1];
      
      // Confirma a operação
      const confirmacao = ui.alert(
        'Confirmar Exportação',
        `Deseja exportar os dados do ensaio "${localEscolhido}" para a planilha externa de Cotia?\n\nIsso irá:\n• Atualizar a aba "Resumo" com contadores de instrumentos e cargos\n• Atualizar a aba "Organistas" com lista de organistas\n\nConfirma a operação?`,
        ui.ButtonSet.YES_NO
      );

      if (confirmacao === ui.Button.YES) {
        ui.alert('Iniciando exportação...\n\nPor favor, aguarde enquanto os dados são processados.');

        // Executa a exportação completa
        const resultadoResumo = exportarParaPlanilhaCotiaCompleta(localEscolhido);
        const resultadoOrganistas = alimentarAbaOrganistasCotia(localEscolhido);

        // Mostra resultado
        const mensagem = `Exportação para Cotia concluída com sucesso!\n\n` +
          `Aba Resumo atualizada:\n` +
          `• Total de membros: ${resultadoResumo.totalMembros}\n` +
          `• Instrumentos contados: ${Object.keys(resultadoResumo.instrumentos).filter(k => resultadoResumo.instrumentos[k] > 0).length}\n` +
          `• Cargos ministeriais: ${Object.keys(resultadoResumo.cargosMinisteriais).filter(k => resultadoResumo.cargosMinisteriais[k] > 0).length}\n` +
          `• Cargos de apoio: ${Object.keys(resultadoResumo.cargosApoio).filter(k => resultadoResumo.cargosApoio[k] > 0).length}\n\n` +
          `Aba Organistas atualizada:\n` +
          `• Total de organistas: ${resultadoOrganistas.totalOrganistas}\n\n` +
          `Planilha ID: ${resultadoResumo.planilhaId}`;

        ui.alert('Exportação Concluída!', mensagem, ui.ButtonSet.OK);
      } else {
        ui.alert('Operação cancelada pelo usuário.');
      }
    } else {
      ui.alert('Operação cancelada pelo usuário.');
    }

  } catch (error) {
    console.error('❌ Erro na exportação para Cotia:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro na Exportação', `Erro ao exportar para planilha de Cotia: ${error.message}`, ui.ButtonSet.OK);
  }
}

// Função para exportar dados completos para planilha externa de Itapevi (com instrumentos e cargos)
function exportarParaPlanilhaItapeviCompleta(localEnsaio) {
  try {
    console.log(`🏛️ Iniciando exportação completa para planilha externa de Itapevi: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Filtra dados apenas do local especificado
    const linhasLocal = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaioRow = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      // Só processa se for do local especificado (comparação flexível)
      if (!compararLocaisEnsaio(localEnsaioRow, localEnsaio)) continue;
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhasLocal.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaioRow, _ord: i
      });
    }

    console.log(`📊 Encontrados ${linhasLocal.length} membros para o local: ${localEnsaio}`);

    // Lista completa de instrumentos
    const listaCompletaInstrumentos = [
      'Organista', 'Acordeon', 'Violino', 'Viola', 'Violoncelo', 'Flauta transversal',
      'Oboé', "Oboé d'amore", 'Corne inglês', 'Clarinete', 'Clarinete alto', 
      'Clarinete baixo (clarone)', 'Fagote', 'Saxofone soprano (reto)', 'Saxofone alto',
      'Saxofone tenor', 'Saxofone barítono', 'Trompete', 'Cornet', 'Flugelhorn', 'Trompa',
      'Trombone', 'Trombonito', 'Barítono (pisto)', 'Eufônio', 'Tuba'
    ];

    // Lista completa de cargos ministeriais e de apoio
    const listaCompletaCargosMinisteriais = [
      'Ancião', 'Diácono', 'Cooperador do Ofício', 'Cooperador de Jovens',
      'Encarregado Regional', 'Encarregado Local', 'Examinadora',
      'Secretária da Música', 'Secretário da Música', 'Instrutor', 'Instrutora'
    ];

    const listaCompletaCargosApoio = [
      'Porteiro (a)', 'Bombeiro (a)', 'Médico (a)', 'Enfermeiro (a)', 'Irmandade'
    ];

    // Conta instrumentos e cargos
    const contadores = {
      instrumentos: {},
      musicos: {},
      cargosMinisteriais: {},
      cargosApoio: {},
      total: 0
    };

    // Inicializa todos os instrumentos com 0
    listaCompletaInstrumentos.forEach(inst => {
      contadores.instrumentos[inst] = 0;
      contadores.musicos[inst] = 0;
    });

    // Inicializa todos os cargos ministeriais com 0
    listaCompletaCargosMinisteriais.forEach(cargo => {
      contadores.cargosMinisteriais[cargo] = 0;
    });

    // Inicializa todos os cargos de apoio com 0
    listaCompletaCargosApoio.forEach(cargo => {
      contadores.cargosApoio[cargo] = 0;
    });

    // Processa cada linha do local
    linhasLocal.forEach(x => {
      if (!estevePresente(x)) return;
      
      contadores.total++;
      
      // LÓGICA CORRETA: Organistas são contados por CARGO
      const cargoLower = x.cargo ? x.cargo.toLowerCase() : '';
      if (cargoLower.includes('organista') || cargoLower.includes('examinadora') || 
          cargoLower.includes('instrutora') || cargoLower.includes('instrutoras')) {
        contadores.instrumentos['Organista']++;
        contadores.musicos['Organista']++;
        console.log(`🎹 Organista contado por cargo: ${x.nome} (cargo: ${x.cargo})`);
      } else if (x.instrumento && !cargoLower.includes('secretário da música') && !cargoLower.includes('secretaria da musica') && !cargoLower.includes('secretarios da musica') && !cargoLower.includes('secretarias da musica')) {
        // Mapeia o instrumento para a lista padrão (excluindo secretários da música)
        const instrumentoMapeado = mapearInstrumento(x.instrumento);
        
        if (instrumentoMapeado && contadores.instrumentos.hasOwnProperty(instrumentoMapeado) && instrumentoMapeado !== 'Organista') {
          contadores.instrumentos[instrumentoMapeado]++;
          contadores.musicos[instrumentoMapeado]++;
          console.log(`🎵 Instrumento contado: ${x.instrumento} -> ${instrumentoMapeado} - ${x.nome}`);
        } else if (instrumentoMapeado) {
          console.log(`⚠️ Instrumento não mapeado: ${x.instrumento} (mapeado: ${instrumentoMapeado})`);
        }
      }
      
      // Conta cargos ministeriais específicos
      if (x.cargo) {
        const cargoOriginal = x.cargo;
        const cargoFormatado = formatarTexto(cargoOriginal);
        
        const mapeamentoCargos = {
          'ancião': 'Ancião',
          'diácono': 'Diácono',
          'cooperador do ofício': 'Cooperador do Ofício',
          'cooperador do oficio': 'Cooperador do Ofício',
          'cooperador de jovens': 'Cooperador de Jovens',
          'encarregado regional': 'Encarregado Regional',
          'encarregado local': 'Encarregado Local',
          'examinadora': 'Examinadora',
          'examinadoras': 'Examinadora',
          'examinador': 'Examinadora',
          'examinadores': 'Examinadora',
          'examinadora de organistas': 'Examinadora',
          'examinadoras de organistas': 'Examinadora',
          'examinador de organistas': 'Examinadora',
          'examinadores de organistas': 'Examinadora',
          'secretária da música': 'Secretária da Música',
          'secretarias da música': 'Secretária da Música',
          'secretaria da musica': 'Secretária da Música',
          'secretarias da musica': 'Secretária da Música',
          'secretário da música': 'Secretário da Música',
          'secretarios da música': 'Secretário da Música',
          'secretario da musica': 'Secretário da Música',
          'secretarios da musica': 'Secretário da Música',
          'instrutor': 'Instrutor',
          'instrutora': 'Instrutora',
          'instrutores': 'Instrutor',
          'instrutoras': 'Instrutora',
          'porteiro (a)': 'Porteiro (a)',
          'porteiro': 'Porteiro (a)',
          'porteira': 'Porteiro (a)',
          'bombeiro (a)': 'Bombeiro (a)',
          'bombeiro': 'Bombeiro (a)',
          'bombeira': 'Bombeiro (a)',
          'médico (a)': 'Médico (a)',
          'medico': 'Médico (a)',
          'medica': 'Médico (a)',
          'enfermeiro (a)': 'Enfermeiro (a)',
          'enfermeiro': 'Enfermeiro (a)',
          'enfermeira': 'Enfermeiro (a)',
          'irmandade': 'Irmandade',
          'irma': 'Irmandade',
          'irmao': 'Irmandade',
          'irmão': 'Irmandade',
          'irmã': 'Irmandade',
          'irmãos': 'Irmandade',
          'irmãs': 'Irmandade'
        };
        
        const cargoMapeado = mapeamentoCargos[cargoFormatado.toLowerCase()];
        
        if (contadores.cargosMinisteriais.hasOwnProperty(cargoMapeado)) {
          contadores.cargosMinisteriais[cargoMapeado]++;
        }
        
        if (contadores.cargosApoio.hasOwnProperty(cargoMapeado)) {
          contadores.cargosApoio[cargoMapeado]++;
        }
      }
    });

    // Acessa a planilha externa de Itapevi
    const ssItapevi = openItapeviSheet();
    
    // Acessa a aba Resumo da planilha externa de Itapevi
    const shResumo = ssItapevi.getSheetByName('Resumo');
    if (!shResumo) {
      throw new Error('Aba "Resumo" não encontrada na planilha externa de Itapevi.');
    }
    
    // LIMPA todos os contadores antes de atualizar (correção do problema)
    limparContadoresResumo(shResumo, [28, 41, 48, 50]);
    
    console.log(`📊 Atualizando aba Resumo da planilha externa de Itapevi com dados do ensaio de ${localEnsaio}...`);
    
    // Atualiza apenas os valores usando a função escreveAoLado
    console.log('📊 Atualizando valores na aba Resumo...');
    
    // Sinônimos de rótulo para INSTRUMENTOS
    const INSTR_LABEL_SYNONYMS = {
      'Organista': ['Organista','Organistas']
    };

    const CARGO_MIN_ORD = [
      'Ancião','Diácono','Cooperador do Ofício','Cooperador de Jovens',
      'Encarregado Regional','Encarregado Local','Examinadora',
      'Secretária da Música','Secretário da Música',
      'Instrutor','Instrutora'
    ];

    const APOIO_LABEL_SYNONYMS = {
      'Porteiro (a)': ['Porteiros (as)', 'Porteiro (a)'],
      'Bombeiro (a)': ['Bombeiros (as)', 'Bombeiro (a)'],
      'Médico (a)': ['Médicos (as) / Ambulatório', 'Medicos (as) / Ambulatorio', 'Médico (a)', 'Medico (a)'],
      'Enfermeiro (a)': ['Enfermeiros (as)', 'Enfermeiro (a)'],
      'Irmandade': ['Irmandade']
    };
    const APOIO_IRM_ORD = Object.keys(APOIO_LABEL_SYNONYMS);

    const MIN_LABEL_SYNONYMS = {
      'Ancião': ['Ancião','Anciao'],
      'Diácono': ['Diácono','Diacono'],
      'Cooperador do Ofício': ['Cooperador do Ofício','Cooperador do Oficio','Cooperador do Ofício Ministerial'],
      'Cooperador de Jovens': ['Cooperador de Jovens','Cooperador de Jovens e Menores'],
      'Encarregado Regional': ['Encarregado Regional'],
      'Encarregado Local': ['Encarregado Local'],
      'Examinadora': ['Examinadora'],
      'Secretária da Música': ['Secretária da Música','Secretarias da Música','Secretaria da Música'],
      'Secretário da Música': ['Secretário da Música','Secretarios da Música','Secretario da Música'],
      'Instrutores': ['Instrutores','Instrutor'],
      'Instrutoras': ['Instrutoras','Instrutora']
    };

    // Atualiza instrumentos com sinônimos
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.instrumentos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza músicos por instrumento
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.musicos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos ministeriais com sinônimos
    CARGO_MIN_ORD.forEach(canonical => {
      const val = contadores.cargosMinisteriais[canonical] || 0;
      const rLabels = MIN_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos de apoio com sinônimos
    APOIO_IRM_ORD.forEach(canonical => {
      const val = contadores.cargosApoio[canonical] || 0;
      APOIO_LABEL_SYNONYMS[canonical].forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    console.log(`✅ Aba Resumo da planilha externa de Itapevi atualizada com sucesso com dados do ensaio de ${localEnsaio}`);
    console.log(`📈 Total de membros: ${contadores.total}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Resumo',
      planilhaId: ITAPEVI_SHEET_ID,
      totalMembros: contadores.total,
      instrumentos: contadores.instrumentos,
      cargosMinisteriais: contadores.cargosMinisteriais,
      cargosApoio: contadores.cargosApoio
    };

  } catch (error) {
    console.error(`❌ Erro ao atualizar aba Resumo da planilha externa de Itapevi com dados do ensaio de ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para exportar dados completos para planilha externa de Caucaia (com instrumentos e cargos)
function exportarParaPlanilhaCaucaiaCompleta(localEnsaio) {
  try {
    console.log(`🏛️ Iniciando exportação completa para planilha externa de Caucaia: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Filtra dados apenas do local especificado
    const linhasLocal = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaioRow = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      // Só processa se for do local especificado (comparação flexível)
      if (!compararLocaisEnsaio(localEnsaioRow, localEnsaio)) continue;
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhasLocal.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaioRow, _ord: i
      });
    }

    console.log(`📊 Encontrados ${linhasLocal.length} membros para o local: ${localEnsaio}`);

    // Lista completa de instrumentos
    const listaCompletaInstrumentos = [
      'Organista', 'Acordeon', 'Violino', 'Viola', 'Violoncelo', 'Flauta transversal',
      'Oboé', "Oboé d'amore", 'Corne inglês', 'Clarinete', 'Clarinete alto', 
      'Clarinete baixo (clarone)', 'Fagote', 'Saxofone soprano (reto)', 'Saxofone alto',
      'Saxofone tenor', 'Saxofone barítono', 'Trompete', 'Cornet', 'Flugelhorn', 'Trompa',
      'Trombone', 'Trombonito', 'Barítono (pisto)', 'Eufônio', 'Tuba'
    ];

    // Lista completa de cargos ministeriais e de apoio
    const listaCompletaCargosMinisteriais = [
      'Ancião', 'Diácono', 'Cooperador do Ofício', 'Cooperador de Jovens',
      'Encarregado Regional', 'Encarregado Local', 'Examinadora',
      'Secretária da Música', 'Secretário da Música', 'Instrutor', 'Instrutora'
    ];

    const listaCompletaCargosApoio = [
      'Porteiro (a)', 'Bombeiro (a)', 'Médico (a)', 'Enfermeiro (a)', 'Irmandade'
    ];

    // Conta instrumentos e cargos
    const contadores = {
      instrumentos: {},
      musicos: {},
      cargosMinisteriais: {},
      cargosApoio: {},
      total: 0
    };

    // Inicializa todos os instrumentos com 0
    listaCompletaInstrumentos.forEach(inst => {
      contadores.instrumentos[inst] = 0;
      contadores.musicos[inst] = 0;
    });

    // Inicializa todos os cargos ministeriais com 0
    listaCompletaCargosMinisteriais.forEach(cargo => {
      contadores.cargosMinisteriais[cargo] = 0;
    });

    // Inicializa todos os cargos de apoio com 0
    listaCompletaCargosApoio.forEach(cargo => {
      contadores.cargosApoio[cargo] = 0;
    });

    // Processa cada linha do local
    linhasLocal.forEach(x => {
      if (!estevePresente(x)) return;
      
      contadores.total++;
      
      // LÓGICA CORRETA: Organistas são contados por CARGO
      const cargoLower = x.cargo ? x.cargo.toLowerCase() : '';
      if (cargoLower.includes('organista') || cargoLower.includes('examinadora') || 
          cargoLower.includes('instrutora') || cargoLower.includes('instrutoras')) {
        contadores.instrumentos['Organista']++;
        contadores.musicos['Organista']++;
        console.log(`🎹 Organista contado por cargo: ${x.nome} (cargo: ${x.cargo})`);
      } else if (x.instrumento && !cargoLower.includes('secretário da música') && !cargoLower.includes('secretaria da musica') && !cargoLower.includes('secretarios da musica') && !cargoLower.includes('secretarias da musica')) {
        // Mapeia o instrumento para a lista padrão (excluindo secretários da música)
        const instrumentoMapeado = mapearInstrumento(x.instrumento);
        
        if (instrumentoMapeado && contadores.instrumentos.hasOwnProperty(instrumentoMapeado) && instrumentoMapeado !== 'Organista') {
          contadores.instrumentos[instrumentoMapeado]++;
          contadores.musicos[instrumentoMapeado]++;
          console.log(`🎵 Instrumento contado: ${x.instrumento} -> ${instrumentoMapeado} - ${x.nome}`);
        } else if (instrumentoMapeado) {
          console.log(`⚠️ Instrumento não mapeado: ${x.instrumento} (mapeado: ${instrumentoMapeado})`);
        }
      }
      
      // Conta cargos ministeriais específicos
      if (x.cargo) {
        const cargoOriginal = x.cargo;
        const cargoFormatado = formatarTexto(cargoOriginal);
        
        const mapeamentoCargos = {
          'ancião': 'Ancião',
          'diácono': 'Diácono',
          'cooperador do ofício': 'Cooperador do Ofício',
          'cooperador do oficio': 'Cooperador do Ofício',
          'cooperador de jovens': 'Cooperador de Jovens',
          'encarregado regional': 'Encarregado Regional',
          'encarregado local': 'Encarregado Local',
          'examinadora': 'Examinadora',
          'examinadoras': 'Examinadora',
          'examinador': 'Examinadora',
          'examinadores': 'Examinadora',
          'examinadora de organistas': 'Examinadora',
          'examinadoras de organistas': 'Examinadora',
          'examinador de organistas': 'Examinadora',
          'examinadores de organistas': 'Examinadora',
          'secretária da música': 'Secretária da Música',
          'secretarias da música': 'Secretária da Música',
          'secretaria da musica': 'Secretária da Música',
          'secretarias da musica': 'Secretária da Música',
          'secretário da música': 'Secretário da Música',
          'secretarios da música': 'Secretário da Música',
          'secretario da musica': 'Secretário da Música',
          'secretarios da musica': 'Secretário da Música',
          'secretário do gem': 'Secretário da Música',
          'secretarios do gem': 'Secretário da Música',
          'secretario do gem': 'Secretário da Música',
          'instrutor': 'Instrutor',
          'instrutora': 'Instrutora',
          'instrutores': 'Instrutor',
          'instrutoras': 'Instrutora',
          'porteiro (a)': 'Porteiro (a)',
          'bombeiro (a)': 'Bombeiro (a)',
          'médico (a)': 'Médico (a)',
          'medico (a)': 'Médico (a)',
          'enfermeiro (a)': 'Enfermeiro (a)',
          'irmandade': 'Irmandade'
        };
        
        const cargoMapeado = mapeamentoCargos[cargoFormatado];
        if (cargoMapeado) {
          if (listaCompletaCargosMinisteriais.includes(cargoMapeado)) {
            contadores.cargosMinisteriais[cargoMapeado]++;
            console.log(`👔 Cargo ministerial contado: ${cargoOriginal} -> ${cargoMapeado} - ${x.nome}`);
          } else if (listaCompletaCargosApoio.includes(cargoMapeado)) {
            contadores.cargosApoio[cargoMapeado]++;
            console.log(`🤝 Cargo de apoio contado: ${cargoOriginal} -> ${cargoMapeado} - ${x.nome}`);
          }
        }
      }
    });

    console.log(`📊 Contadores finais para ${localEnsaio}:`, contadores);

    // Acessa a planilha externa de Caucaia
    const ssCaucaia = openCaucaiaSheet();
    const shResumo = ssCaucaia.getSheetByName('Resumo');
    
    if (!shResumo) {
      throw new Error('Aba "Resumo" não encontrada na planilha externa de Caucaia');
    }
    
    // LIMPA todos os contadores antes de atualizar (correção do problema)
    limparContadoresResumo(shResumo, [28, 41, 48, 50]);
    
    console.log(`📊 Atualizando aba Resumo da planilha externa de Caucaia com dados do ensaio de ${localEnsaio}...`);
    
    // Atualiza apenas os valores usando a função escreveAoLado
    console.log('📊 Atualizando valores na aba Resumo...');
    
    // Sinônimos de rótulo para INSTRUMENTOS
    const INSTR_LABEL_SYNONYMS = {
      'Organista': ['Organista','Organistas']
    };

    const CARGO_MIN_ORD = [
      'Ancião','Diácono','Cooperador do Ofício','Cooperador de Jovens',
      'Encarregado Regional','Encarregado Local','Examinadora',
      'Secretária da Música','Secretário da Música',
      'Instrutor','Instrutora'
    ];

    const APOIO_LABEL_SYNONYMS = {
      'Porteiro (a)': ['Porteiros (as)', 'Porteiro (a)'],
      'Bombeiro (a)': ['Bombeiros (as)', 'Bombeiro (a)'],
      'Médico (a)': ['Médicos (as) / Ambulatório', 'Medicos (as) / Ambulatorio', 'Médico (a)', 'Medico (a)'],
      'Enfermeiro (a)': ['Enfermeiros (as)', 'Enfermeiro (a)'],
      'Irmandade': ['Irmandade']
    };
    const APOIO_IRM_ORD = Object.keys(APOIO_LABEL_SYNONYMS);

    const MIN_LABEL_SYNONYMS = {
      'Ancião': ['Ancião','Anciao'],
      'Diácono': ['Diácono','Diacono'],
      'Cooperador do Ofício': ['Cooperador do Ofício','Cooperador do Oficio','Cooperador do Ofício Ministerial'],
      'Cooperador de Jovens': ['Cooperador de Jovens','Cooperador de Jovens e Menores'],
      'Encarregado Regional': ['Encarregado Regional'],
      'Encarregado Local': ['Encarregado Local'],
      'Examinadora': ['Examinadora'],
      'Secretária da Música': ['Secretária da Música','Secretarias da Música','Secretaria da Música'],
      'Secretário da Música': ['Secretário da Música','Secretarios da Música','Secretario da Música'],
      'Instrutores': ['Instrutores','Instrutor'],
      'Instrutoras': ['Instrutoras','Instrutora']
    };

    // Atualiza instrumentos com sinônimos
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.instrumentos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza músicos por instrumento
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.musicos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos ministeriais com sinônimos
    CARGO_MIN_ORD.forEach(canonical => {
      const val = contadores.cargosMinisteriais[canonical] || 0;
      const rLabels = MIN_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos de apoio com sinônimos
    APOIO_IRM_ORD.forEach(canonical => {
      const val = contadores.cargosApoio[canonical] || 0;
      APOIO_LABEL_SYNONYMS[canonical].forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    console.log(`✅ Aba Resumo da planilha externa de Caucaia atualizada com sucesso com dados do ensaio de ${localEnsaio}`);
    console.log(`📈 Total de membros: ${contadores.total}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Resumo',
      planilhaId: CAUCAIA_SHEET_ID,
      totalMembros: contadores.total,
      instrumentos: contadores.instrumentos,
      cargosMinisteriais: contadores.cargosMinisteriais,
      cargosApoio: contadores.cargosApoio
    };

  } catch (error) {
    console.error(`❌ Erro ao atualizar aba Resumo da planilha externa de Caucaia com dados do ensaio de ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para exportar dados completos para planilha externa de VargemGrande (com instrumentos e cargos)
function exportarParaPlanilhaVargemGrandeCompleta(localEnsaio) {
  try {
    console.log(`🏛️ Iniciando exportação completa para planilha externa de VargemGrande: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Filtra dados apenas do local especificado
    const linhasLocal = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaioRow = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      // Só processa se for do local especificado (comparação flexível)
      if (!compararLocaisEnsaio(localEnsaioRow, localEnsaio)) continue;
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhasLocal.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaioRow, _ord: i
      });
    }

    console.log(`📊 Encontrados ${linhasLocal.length} membros para o local: ${localEnsaio}`);

    // Lista completa de instrumentos
    const listaCompletaInstrumentos = [
      'Organista', 'Acordeon', 'Violino', 'Viola', 'Violoncelo', 'Flauta transversal',
      'Oboé', "Oboé d'amore", 'Corne inglês', 'Clarinete', 'Clarinete alto', 
      'Clarinete baixo (clarone)', 'Fagote', 'Saxofone soprano (reto)', 'Saxofone alto',
      'Saxofone tenor', 'Saxofone barítono', 'Trompete', 'Cornet', 'Flugelhorn', 'Trompa',
      'Trombone', 'Trombonito', 'Barítono (pisto)', 'Eufônio', 'Tuba'
    ];

    // Lista completa de cargos ministeriais e de apoio
    const listaCompletaCargosMinisteriais = [
      'Ancião', 'Diácono', 'Cooperador do Ofício', 'Cooperador de Jovens',
      'Encarregado Regional', 'Encarregado Local', 'Examinadora',
      'Secretária da Música', 'Secretário da Música', 'Instrutor', 'Instrutora'
    ];

    const listaCompletaCargosApoio = [
      'Porteiro (a)', 'Bombeiro (a)', 'Médico (a)', 'Enfermeiro (a)', 'Irmandade'
    ];

    // Conta instrumentos e cargos
    const contadores = {
      instrumentos: {},
      musicos: {},
      cargosMinisteriais: {},
      cargosApoio: {},
      total: 0
    };

    // Inicializa todos os instrumentos com 0
    listaCompletaInstrumentos.forEach(inst => {
      contadores.instrumentos[inst] = 0;
      contadores.musicos[inst] = 0;
    });

    // Inicializa todos os cargos ministeriais com 0
    listaCompletaCargosMinisteriais.forEach(cargo => {
      contadores.cargosMinisteriais[cargo] = 0;
    });

    // Inicializa todos os cargos de apoio com 0
    listaCompletaCargosApoio.forEach(cargo => {
      contadores.cargosApoio[cargo] = 0;
    });

    // Processa cada linha do local
    linhasLocal.forEach(x => {
      if (!estevePresente(x)) return;
      
      contadores.total++;
      
      // LÓGICA CORRETA: Organistas são contados por CARGO
      const cargoLower = x.cargo ? x.cargo.toLowerCase() : '';
      if (cargoLower.includes('organista') || cargoLower.includes('examinadora') || 
          cargoLower.includes('instrutora') || cargoLower.includes('instrutoras')) {
        contadores.instrumentos['Organista']++;
        contadores.musicos['Organista']++;
        console.log(`🎹 Organista contado por cargo: ${x.nome} (cargo: ${x.cargo})`);
      } else if (x.instrumento && !cargoLower.includes('secretário da música') && !cargoLower.includes('secretaria da musica') && !cargoLower.includes('secretarios da musica') && !cargoLower.includes('secretarias da musica')) {
        // Mapeia o instrumento para a lista padrão (excluindo secretários da música)
        const instrumentoMapeado = mapearInstrumento(x.instrumento);
        
        if (instrumentoMapeado && contadores.instrumentos.hasOwnProperty(instrumentoMapeado) && instrumentoMapeado !== 'Organista') {
          contadores.instrumentos[instrumentoMapeado]++;
          contadores.musicos[instrumentoMapeado]++;
          console.log(`🎵 Instrumento contado: ${x.instrumento} -> ${instrumentoMapeado} - ${x.nome}`);
        } else if (instrumentoMapeado) {
          console.log(`⚠️ Instrumento não mapeado: ${x.instrumento} (mapeado: ${instrumentoMapeado})`);
        }
      }
      
      // Conta cargos ministeriais específicos
      if (x.cargo) {
        const cargoOriginal = x.cargo;
        const cargoFormatado = formatarTexto(cargoOriginal);
        
        const mapeamentoCargos = {
          'ancião': 'Ancião',
          'diácono': 'Diácono',
          'cooperador do ofício': 'Cooperador do Ofício',
          'cooperador do oficio': 'Cooperador do Ofício',
          'cooperador de jovens': 'Cooperador de Jovens',
          'encarregado regional': 'Encarregado Regional',
          'encarregado local': 'Encarregado Local',
          'examinadora': 'Examinadora',
          'examinadoras': 'Examinadora',
          'examinador': 'Examinadora',
          'examinadores': 'Examinadora',
          'examinadora de organistas': 'Examinadora',
          'examinadoras de organistas': 'Examinadora',
          'examinador de organistas': 'Examinadora',
          'examinadores de organistas': 'Examinadora',
          'secretária da música': 'Secretária da Música',
          'secretarias da música': 'Secretária da Música',
          'secretaria da musica': 'Secretária da Música',
          'secretarias da musica': 'Secretária da Música',
          'secretário da música': 'Secretário da Música',
          'secretarios da música': 'Secretário da Música',
          'secretario da musica': 'Secretário da Música',
          'secretarios da musica': 'Secretário da Música',
          'secretário do gem': 'Secretário da Música',
          'secretarios do gem': 'Secretário da Música',
          'secretario do gem': 'Secretário da Música',
          'instrutor': 'Instrutor',
          'instrutora': 'Instrutora',
          'instrutores': 'Instrutor',
          'instrutoras': 'Instrutora',
          'porteiro (a)': 'Porteiro (a)',
          'porteiro': 'Porteiro (a)',
          'porteira': 'Porteiro (a)',
          'bombeiro (a)': 'Bombeiro (a)',
          'bombeiro': 'Bombeiro (a)',
          'bombeira': 'Bombeiro (a)',
          'médico (a)': 'Médico (a)',
          'medico': 'Médico (a)',
          'medica': 'Médico (a)',
          'enfermeiro (a)': 'Enfermeiro (a)',
          'enfermeiro': 'Enfermeiro (a)',
          'enfermeira': 'Enfermeiro (a)',
          'irmandade': 'Irmandade',
          'irma': 'Irmandade',
          'irmao': 'Irmandade',
          'irmão': 'Irmandade',
          'irmã': 'Irmandade',
          'irmãos': 'Irmandade',
          'irmãs': 'Irmandade'
        };
        
        const cargoMapeado = mapeamentoCargos[cargoFormatado.toLowerCase()];
        if (cargoMapeado) {
          if (listaCompletaCargosMinisteriais.includes(cargoMapeado)) {
            contadores.cargosMinisteriais[cargoMapeado]++;
            console.log(`👔 Cargo ministerial contado: ${cargoOriginal} -> ${cargoMapeado} - ${x.nome}`);
          } else if (listaCompletaCargosApoio.includes(cargoMapeado)) {
            contadores.cargosApoio[cargoMapeado]++;
            console.log(`🤝 Cargo de apoio contado: ${cargoOriginal} -> ${cargoMapeado} - ${x.nome}`);
          }
        }
      }
    });

    console.log(`📊 Contadores finais para ${localEnsaio}:`, contadores);

    // Acessa a planilha externa de VargemGrande
    const ssVargemGrande = openVargemGrandeSheet();
    
    // Acessa a aba Resumo da planilha externa de VargemGrande
    const shResumo = ssVargemGrande.getSheetByName('Resumo');
    if (!shResumo) {
      throw new Error('Aba "Resumo" não encontrada na planilha externa de VargemGrande.');
    }
    
    // LIMPA todos os contadores antes de atualizar (correção do problema)
    limparContadoresResumo(shResumo, [28, 41, 48, 50]);
    
    console.log(`📊 Atualizando aba Resumo da planilha externa de VargemGrande com dados do ensaio de ${localEnsaio}...`);
    
    // Atualiza apenas os valores usando a função escreveAoLado
    console.log('📊 Atualizando valores na aba Resumo...');
    
    // Sinônimos de rótulo para INSTRUMENTOS
    const INSTR_LABEL_SYNONYMS = {
      'Organista': ['Organista','Organistas']
    };

    const CARGO_MIN_ORD = [
      'Ancião','Diácono','Cooperador do Ofício','Cooperador de Jovens',
      'Encarregado Regional','Encarregado Local','Examinadora',
      'Secretária da Música','Secretário da Música',
      'Instrutor','Instrutora'
    ];

    const APOIO_LABEL_SYNONYMS = {
      'Porteiro (a)': ['Porteiros (as)', 'Porteiro (a)'],
      'Bombeiro (a)': ['Bombeiros (as)', 'Bombeiro (a)'],
      'Médico (a)': ['Médicos (as) / Ambulatório', 'Medicos (as) / Ambulatorio', 'Médico (a)', 'Medico (a)'],
      'Enfermeiro (a)': ['Enfermeiros (as)', 'Enfermeiro (a)'],
      'Irmandade': ['Irmandade']
    };
    const APOIO_IRM_ORD = Object.keys(APOIO_LABEL_SYNONYMS);

    const MIN_LABEL_SYNONYMS = {
      'Ancião': ['Ancião','Anciao'],
      'Diácono': ['Diácono','Diacono'],
      'Cooperador do Ofício': ['Cooperador do Ofício','Cooperador do Oficio','Cooperador do Ofício Ministerial'],
      'Cooperador de Jovens': ['Cooperador de Jovens','Cooperador de Jovens e Menores'],
      'Encarregado Regional': ['Encarregado Regional'],
      'Encarregado Local': ['Encarregado Local'],
      'Examinadora': ['Examinadora'],
      'Secretária da Música': ['Secretária da Música','Secretarias da Música','Secretaria da Música'],
      'Secretário da Música': ['Secretário da Música','Secretarios da Música','Secretario da Música'],
      'Instrutores': ['Instrutores','Instrutor'],
      'Instrutoras': ['Instrutoras','Instrutora']
    };

    // Atualiza instrumentos com sinônimos
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.instrumentos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza músicos por instrumento
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.musicos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos ministeriais com sinônimos
    CARGO_MIN_ORD.forEach(canonical => {
      const val = contadores.cargosMinisteriais[canonical] || 0;
      const rLabels = MIN_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos de apoio com sinônimos
    APOIO_IRM_ORD.forEach(canonical => {
      const val = contadores.cargosApoio[canonical] || 0;
      APOIO_LABEL_SYNONYMS[canonical].forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    console.log(`✅ Aba Resumo da planilha externa de VargemGrande atualizada com sucesso com dados do ensaio de ${localEnsaio}`);
    console.log(`📈 Total de membros: ${contadores.total}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Resumo',
      planilhaId: VARGEMGRANDE_SHEET_ID,
      totalMembros: contadores.total,
      instrumentos: contadores.instrumentos,
      cargosMinisteriais: contadores.cargosMinisteriais,
      cargosApoio: contadores.cargosApoio
    };

  } catch (error) {
    console.error(`❌ Erro ao atualizar aba Resumo da planilha externa de VargemGrande com dados do ensaio de ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para exportar dados completos para planilha externa de Pirapora (com instrumentos e cargos)
function exportarParaPlanilhaPiraporaCompleta(localEnsaio) {
  try {
    console.log(`🏛️ Iniciando exportação completa para planilha externa de Pirapora: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Filtra dados apenas do local especificado
    const linhasLocal = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaioRow = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      // Só processa se for do local especificado (comparação flexível)
      if (!compararLocaisEnsaio(localEnsaioRow, localEnsaio)) continue;
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhasLocal.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaioRow, _ord: i
      });
    }

    console.log(`📊 Encontrados ${linhasLocal.length} membros para o local: ${localEnsaio}`);

    // Lista completa de instrumentos
    const listaCompletaInstrumentos = [
      'Organista', 'Acordeon', 'Violino', 'Viola', 'Violoncelo', 'Flauta transversal',
      'Oboé', "Oboé d'amore", 'Corne inglês', 'Clarinete', 'Clarinete alto', 
      'Clarinete baixo (clarone)', 'Fagote', 'Saxofone soprano (reto)', 'Saxofone alto',
      'Saxofone tenor', 'Saxofone barítono', 'Trompete', 'Cornet', 'Flugelhorn', 'Trompa',
      'Trombone', 'Trombonito', 'Barítono (pisto)', 'Eufônio', 'Tuba'
    ];

    // Lista completa de cargos ministeriais e de apoio
    const listaCompletaCargosMinisteriais = [
      'Ancião', 'Diácono', 'Cooperador do Ofício', 'Cooperador de Jovens',
      'Encarregado Regional', 'Encarregado Local', 'Examinadora',
      'Secretária da Música', 'Secretário da Música', 'Instrutor', 'Instrutora'
    ];

    const listaCompletaCargosApoio = [
      'Porteiro (a)', 'Bombeiro (a)', 'Médico (a)', 'Enfermeiro (a)', 'Irmandade'
    ];

    // Conta instrumentos e cargos
    const contadores = {
      instrumentos: {},
      musicos: {},
      cargosMinisteriais: {},
      cargosApoio: {},
      total: 0
    };

    // Inicializa todos os instrumentos com 0
    listaCompletaInstrumentos.forEach(inst => {
      contadores.instrumentos[inst] = 0;
      contadores.musicos[inst] = 0;
    });

    // Inicializa todos os cargos ministeriais com 0
    listaCompletaCargosMinisteriais.forEach(cargo => {
      contadores.cargosMinisteriais[cargo] = 0;
    });

    // Inicializa todos os cargos de apoio com 0
    listaCompletaCargosApoio.forEach(cargo => {
      contadores.cargosApoio[cargo] = 0;
    });

    // Processa cada linha do local
    linhasLocal.forEach(x => {
      if (!estevePresente(x)) return;
      
      contadores.total++;
      
      // LÓGICA CORRETA: Organistas são contados por CARGO
      const cargoLower = x.cargo ? x.cargo.toLowerCase() : '';
      if (cargoLower.includes('organista') || cargoLower.includes('examinadora') || 
          cargoLower.includes('instrutora') || cargoLower.includes('instrutoras')) {
        contadores.instrumentos['Organista']++;
        contadores.musicos['Organista']++;
        console.log(`🎹 Organista contado por cargo: ${x.nome} (cargo: ${x.cargo})`);
      } else if (x.instrumento && !cargoLower.includes('secretário da música') && !cargoLower.includes('secretaria da musica') && !cargoLower.includes('secretarios da musica') && !cargoLower.includes('secretarias da musica')) {
        // Mapeia o instrumento para a lista padrão (excluindo secretários da música)
        const instrumentoMapeado = mapearInstrumento(x.instrumento);
        
        if (instrumentoMapeado && contadores.instrumentos.hasOwnProperty(instrumentoMapeado) && instrumentoMapeado !== 'Organista') {
          contadores.instrumentos[instrumentoMapeado]++;
          contadores.musicos[instrumentoMapeado]++;
          console.log(`🎵 Instrumento contado: ${x.instrumento} -> ${instrumentoMapeado} - ${x.nome}`);
        } else if (instrumentoMapeado) {
          console.log(`⚠️ Instrumento não mapeado: ${x.instrumento} (mapeado: ${instrumentoMapeado})`);
        }
      }
      
      // Conta cargos ministeriais específicos
      if (x.cargo) {
        const cargoOriginal = x.cargo;
        const cargoFormatado = formatarTexto(cargoOriginal);
        
        const mapeamentoCargos = {
          'ancião': 'Ancião',
          'diácono': 'Diácono',
          'cooperador do ofício': 'Cooperador do Ofício',
          'cooperador do oficio': 'Cooperador do Ofício',
          'cooperador de jovens': 'Cooperador de Jovens',
          'encarregado regional': 'Encarregado Regional',
          'encarregado local': 'Encarregado Local',
          'examinadora': 'Examinadora',
          'examinadoras': 'Examinadora',
          'examinador': 'Examinadora',
          'examinadores': 'Examinadora',
          'examinadora de organistas': 'Examinadora',
          'examinadoras de organistas': 'Examinadora',
          'examinador de organistas': 'Examinadora',
          'examinadores de organistas': 'Examinadora',
          'secretária da música': 'Secretária da Música',
          'secretarias da música': 'Secretária da Música',
          'secretaria da musica': 'Secretária da Música',
          'secretarias da musica': 'Secretária da Música',
          'secretário da música': 'Secretário da Música',
          'secretarios da música': 'Secretário da Música',
          'secretario da musica': 'Secretário da Música',
          'secretarios da musica': 'Secretário da Música',
          'secretário do gem': 'Secretário da Música',
          'secretarios do gem': 'Secretário da Música',
          'secretario do gem': 'Secretário da Música',
          'instrutor': 'Instrutor',
          'instrutora': 'Instrutora',
          'instrutores': 'Instrutor',
          'instrutoras': 'Instrutora',
          'porteiro (a)': 'Porteiro (a)',
          'porteiro': 'Porteiro (a)',
          'porteira': 'Porteiro (a)',
          'bombeiro (a)': 'Bombeiro (a)',
          'bombeiro': 'Bombeiro (a)',
          'bombeira': 'Bombeiro (a)',
          'médico (a)': 'Médico (a)',
          'medico': 'Médico (a)',
          'medica': 'Médico (a)',
          'enfermeiro (a)': 'Enfermeiro (a)',
          'enfermeiro': 'Enfermeiro (a)',
          'enfermeira': 'Enfermeiro (a)',
          'irmandade': 'Irmandade',
          'irma': 'Irmandade',
          'irmao': 'Irmandade',
          'irmão': 'Irmandade',
          'irmã': 'Irmandade',
          'irmãos': 'Irmandade',
          'irmãs': 'Irmandade'
        };
        
        const cargoMapeado = mapeamentoCargos[cargoFormatado.toLowerCase()];
        
        if (contadores.cargosMinisteriais.hasOwnProperty(cargoMapeado)) {
          contadores.cargosMinisteriais[cargoMapeado]++;
        }
        
        if (contadores.cargosApoio.hasOwnProperty(cargoMapeado)) {
          contadores.cargosApoio[cargoMapeado]++;
        }
      }
    });

    // Acessa a planilha externa de Pirapora
    const ssPirapora = openPiraporaSheet();
    
    // Acessa a aba Resumo da planilha externa de Pirapora
    const shResumo = ssPirapora.getSheetByName('Resumo');
    if (!shResumo) {
      throw new Error('Aba "Resumo" não encontrada na planilha externa de Pirapora.');
    }
    
    // LIMPA todos os contadores antes de atualizar (correção do problema)
    limparContadoresResumo(shResumo, [28, 41, 48, 50]);
    
    console.log(`📊 Atualizando aba Resumo da planilha externa de Pirapora com dados do ensaio de ${localEnsaio}...`);
    
    // Atualiza apenas os valores usando a função escreveAoLado
    console.log('📊 Atualizando valores na aba Resumo...');
    
    // Sinônimos de rótulo para INSTRUMENTOS
    const INSTR_LABEL_SYNONYMS = {
      'Organista': ['Organista','Organistas']
    };

    const CARGO_MIN_ORD = [
      'Ancião','Diácono','Cooperador do Ofício','Cooperador de Jovens',
      'Encarregado Regional','Encarregado Local','Examinadora',
      'Secretária da Música','Secretário da Música',
      'Instrutor','Instrutora'
    ];

    const APOIO_LABEL_SYNONYMS = {
      'Porteiro (a)': ['Porteiros (as)', 'Porteiro (a)'],
      'Bombeiro (a)': ['Bombeiros (as)', 'Bombeiro (a)'],
      'Médico (a)': ['Médicos (as) / Ambulatório', 'Medicos (as) / Ambulatorio', 'Médico (a)', 'Medico (a)'],
      'Enfermeiro (a)': ['Enfermeiros (as)', 'Enfermeiro (a)'],
      'Irmandade': ['Irmandade']
    };
    const APOIO_IRM_ORD = Object.keys(APOIO_LABEL_SYNONYMS);

    const MIN_LABEL_SYNONYMS = {
      'Ancião': ['Ancião','Anciao'],
      'Diácono': ['Diácono','Diacono'],
      'Cooperador do Ofício': ['Cooperador do Ofício','Cooperador do Oficio','Cooperador do Ofício Ministerial'],
      'Cooperador de Jovens': ['Cooperador de Jovens','Cooperador de Jovens e Menores'],
      'Encarregado Regional': ['Encarregado Regional'],
      'Encarregado Local': ['Encarregado Local'],
      'Examinadora': ['Examinadora'],
      'Secretária da Música': ['Secretária da Música','Secretarias da Música','Secretaria da Música'],
      'Secretário da Música': ['Secretário da Música','Secretarios da Música','Secretario da Música'],
      'Instrutores': ['Instrutores','Instrutor'],
      'Instrutoras': ['Instrutoras','Instrutora']
    };

    // Atualiza instrumentos com sinônimos
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.instrumentos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza músicos por instrumento
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.musicos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos ministeriais com sinônimos
    CARGO_MIN_ORD.forEach(canonical => {
      const val = contadores.cargosMinisteriais[canonical] || 0;
      const rLabels = MIN_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos de apoio com sinônimos
    APOIO_IRM_ORD.forEach(canonical => {
      const val = contadores.cargosApoio[canonical] || 0;
      APOIO_LABEL_SYNONYMS[canonical].forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    console.log(`✅ Aba Resumo da planilha externa de Pirapora atualizada com sucesso com dados do ensaio de ${localEnsaio}`);
    console.log(`📈 Total de membros: ${contadores.total}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Resumo',
      planilhaId: PIRAPORA_SHEET_ID,
      totalMembros: contadores.total,
      instrumentos: contadores.instrumentos,
      cargosMinisteriais: contadores.cargosMinisteriais,
      cargosApoio: contadores.cargosApoio
    };

  } catch (error) {
    console.error(`❌ Erro ao atualizar aba Resumo da planilha externa de Pirapora com dados do ensaio de ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para exportar dados completos para planilha externa de Fazendinha (com instrumentos e cargos)
function exportarParaPlanilhaFazendinhaCompleta(localEnsaio) {
  try {
    console.log(`🏛️ Iniciando exportação completa para planilha externa de Fazendinha: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Filtra dados apenas do local especificado
    const linhasLocal = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaioRow = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      // Só processa se for do local especificado (comparação flexível)
      if (!compararLocaisEnsaio(localEnsaioRow, localEnsaio)) continue;
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhasLocal.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaioRow, _ord: i
      });
    }

    console.log(`📊 Encontrados ${linhasLocal.length} membros para o local: ${localEnsaio}`);

    // Lista completa de instrumentos
    const listaCompletaInstrumentos = [
      'Organista', 'Acordeon', 'Violino', 'Viola', 'Violoncelo', 'Flauta transversal',
      'Oboé', "Oboé d'amore", 'Corne inglês', 'Clarinete', 'Clarinete alto', 
      'Clarinete baixo (clarone)', 'Fagote', 'Saxofone soprano (reto)', 'Saxofone alto',
      'Saxofone tenor', 'Saxofone barítono', 'Trompete', 'Cornet', 'Flugelhorn', 'Trompa',
      'Trombone', 'Trombonito', 'Barítono (pisto)', 'Eufônio', 'Tuba'
    ];

    // Lista completa de cargos ministeriais e de apoio
    const listaCompletaCargosMinisteriais = [
      'Ancião', 'Diácono', 'Cooperador do Ofício', 'Cooperador de Jovens',
      'Encarregado Regional', 'Encarregado Local', 'Examinadora',
      'Secretária da Música', 'Secretário da Música', 'Instrutor', 'Instrutora'
    ];

    const listaCompletaCargosApoio = [
      'Porteiro (a)', 'Bombeiro (a)', 'Médico (a)', 'Enfermeiro (a)', 'Irmandade'
    ];

    // Conta instrumentos e cargos
    const contadores = {
      instrumentos: {},
      musicos: {},
      cargosMinisteriais: {},
      cargosApoio: {},
      total: 0
    };

    // Inicializa todos os instrumentos com 0
    listaCompletaInstrumentos.forEach(inst => {
      contadores.instrumentos[inst] = 0;
      contadores.musicos[inst] = 0;
    });

    // Inicializa todos os cargos ministeriais com 0
    listaCompletaCargosMinisteriais.forEach(cargo => {
      contadores.cargosMinisteriais[cargo] = 0;
    });

    // Inicializa todos os cargos de apoio com 0
    listaCompletaCargosApoio.forEach(cargo => {
      contadores.cargosApoio[cargo] = 0;
    });

    // Processa cada linha do local
    linhasLocal.forEach(x => {
      if (!estevePresente(x)) return;
      
      contadores.total++;
      
      // LÓGICA CORRETA: Organistas são contados por CARGO
      const cargoLower = x.cargo ? x.cargo.toLowerCase() : '';
      if (cargoLower.includes('organista') || cargoLower.includes('examinadora') || 
          cargoLower.includes('instrutora') || cargoLower.includes('instrutoras')) {
        contadores.instrumentos['Organista']++;
        contadores.musicos['Organista']++;
        console.log(`🎹 Organista contado por cargo: ${x.nome} (cargo: ${x.cargo})`);
      } else if (x.instrumento && !cargoLower.includes('secretário da música') && !cargoLower.includes('secretaria da musica') && !cargoLower.includes('secretarios da musica') && !cargoLower.includes('secretarias da musica')) {
        // Mapeia o instrumento para a lista padrão (excluindo secretários da música)
        const instrumentoMapeado = mapearInstrumento(x.instrumento);
        
        if (instrumentoMapeado && contadores.instrumentos.hasOwnProperty(instrumentoMapeado) && instrumentoMapeado !== 'Organista') {
          contadores.instrumentos[instrumentoMapeado]++;
          contadores.musicos[instrumentoMapeado]++;
          console.log(`🎵 Instrumento contado: ${x.instrumento} -> ${instrumentoMapeado} - ${x.nome}`);
        } else if (instrumentoMapeado) {
          console.log(`⚠️ Instrumento não mapeado: ${x.instrumento} (mapeado: ${instrumentoMapeado})`);
        }
      }
      
      // Conta cargos ministeriais específicos
      if (x.cargo) {
        const cargoOriginal = x.cargo;
        const cargoFormatado = formatarTexto(cargoOriginal);
        
        const mapeamentoCargos = {
          'ancião': 'Ancião',
          'diácono': 'Diácono',
          'cooperador do ofício': 'Cooperador do Ofício',
          'cooperador do oficio': 'Cooperador do Ofício',
          'cooperador de jovens': 'Cooperador de Jovens',
          'encarregado regional': 'Encarregado Regional',
          'encarregado local': 'Encarregado Local',
          'examinadora': 'Examinadora',
          'examinadoras': 'Examinadora',
          'examinador': 'Examinadora',
          'examinadores': 'Examinadora',
          'examinadora de organistas': 'Examinadora',
          'examinadoras de organistas': 'Examinadora',
          'examinador de organistas': 'Examinadora',
          'examinadores de organistas': 'Examinadora',
          'secretária da música': 'Secretária da Música',
          'secretarias da música': 'Secretária da Música',
          'secretaria da musica': 'Secretária da Música',
          'secretarias da musica': 'Secretária da Música',
          'secretário da música': 'Secretário da Música',
          'secretarios da música': 'Secretário da Música',
          'secretario da musica': 'Secretário da Música',
          'secretarios da musica': 'Secretário da Música',
          'secretário do gem': 'Secretário da Música',
          'secretarios do gem': 'Secretário da Música',
          'secretario do gem': 'Secretário da Música',
          'instrutor': 'Instrutor',
          'instrutora': 'Instrutora',
          'instrutores': 'Instrutor',
          'instrutoras': 'Instrutora',
          'porteiro (a)': 'Porteiro (a)',
          'porteiro': 'Porteiro (a)',
          'porteira': 'Porteiro (a)',
          'bombeiro (a)': 'Bombeiro (a)',
          'bombeiro': 'Bombeiro (a)',
          'bombeira': 'Bombeiro (a)',
          'médico (a)': 'Médico (a)',
          'medico': 'Médico (a)',
          'medica': 'Médico (a)',
          'enfermeiro (a)': 'Enfermeiro (a)',
          'enfermeiro': 'Enfermeiro (a)',
          'enfermeira': 'Enfermeiro (a)',
          'irmandade': 'Irmandade',
          'irma': 'Irmandade',
          'irmao': 'Irmandade',
          'irmão': 'Irmandade',
          'irmã': 'Irmandade',
          'irmãos': 'Irmandade',
          'irmãs': 'Irmandade'
        };
        
        const cargoMapeado = mapeamentoCargos[cargoFormatado.toLowerCase()];
        
        if (contadores.cargosMinisteriais.hasOwnProperty(cargoMapeado)) {
          contadores.cargosMinisteriais[cargoMapeado]++;
        }
        
        if (contadores.cargosApoio.hasOwnProperty(cargoMapeado)) {
          contadores.cargosApoio[cargoMapeado]++;
        }
      }
    });

    // Acessa a planilha externa de Fazendinha
    const ssFazendinha = openFazendinhaSheet();
    
    // Acessa a aba Resumo da planilha externa de Fazendinha
    const shResumo = ssFazendinha.getSheetByName('Resumo');
    if (!shResumo) {
      throw new Error('Aba "Resumo" não encontrada na planilha externa de Fazendinha.');
    }
    
    // LIMPA todos os contadores antes de atualizar (correção do problema)
    limparContadoresResumo(shResumo, [28, 41, 48, 50]);
    
    console.log(`📊 Atualizando aba Resumo da planilha externa de Fazendinha com dados do ensaio de ${localEnsaio}...`);
    
    // Atualiza apenas os valores usando a função escreveAoLado
    console.log('📊 Atualizando valores na aba Resumo...');
    
    // Sinônimos de rótulo para INSTRUMENTOS
    const INSTR_LABEL_SYNONYMS = {
      'Organista': ['Organista','Organistas']
    };

    const CARGO_MIN_ORD = [
      'Ancião','Diácono','Cooperador do Ofício','Cooperador de Jovens',
      'Encarregado Regional','Encarregado Local','Examinadora',
      'Secretária da Música','Secretário da Música',
      'Instrutor','Instrutora'
    ];

    const APOIO_LABEL_SYNONYMS = {
      'Porteiro (a)': ['Porteiros (as)', 'Porteiro (a)'],
      'Bombeiro (a)': ['Bombeiros (as)', 'Bombeiro (a)'],
      'Médico (a)': ['Médicos (as) / Ambulatório', 'Medicos (as) / Ambulatorio', 'Médico (a)', 'Medico (a)'],
      'Enfermeiro (a)': ['Enfermeiros (as)', 'Enfermeiro (a)'],
      'Irmandade': ['Irmandade']
    };
    const APOIO_IRM_ORD = Object.keys(APOIO_LABEL_SYNONYMS);

    const MIN_LABEL_SYNONYMS = {
      'Ancião': ['Ancião','Anciao'],
      'Diácono': ['Diácono','Diacono'],
      'Cooperador do Ofício': ['Cooperador do Ofício','Cooperador do Oficio','Cooperador do Ofício Ministerial'],
      'Cooperador de Jovens': ['Cooperador de Jovens','Cooperador de Jovens e Menores'],
      'Encarregado Regional': ['Encarregado Regional'],
      'Encarregado Local': ['Encarregado Local'],
      'Examinadora': ['Examinadora'],
      'Secretária da Música': ['Secretária da Música','Secretarias da Música','Secretaria da Música'],
      'Secretário da Música': ['Secretário da Música','Secretarios da Música','Secretario da Música'],
      'Instrutores': ['Instrutores','Instrutor'],
      'Instrutoras': ['Instrutoras','Instrutora']
    };

    // Atualiza instrumentos com sinônimos
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.instrumentos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza músicos por instrumento
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.musicos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos ministeriais com sinônimos
    CARGO_MIN_ORD.forEach(canonical => {
      const val = contadores.cargosMinisteriais[canonical] || 0;
      const rLabels = MIN_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos de apoio com sinônimos
    APOIO_IRM_ORD.forEach(canonical => {
      const val = contadores.cargosApoio[canonical] || 0;
      APOIO_LABEL_SYNONYMS[canonical].forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    console.log(`✅ Aba Resumo da planilha externa de Fazendinha atualizada com sucesso com dados do ensaio de ${localEnsaio}`);
    console.log(`📈 Total de membros: ${contadores.total}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Resumo',
      planilhaId: FAZENDINHA_SHEET_ID,
      totalMembros: contadores.total,
      instrumentos: contadores.instrumentos,
      cargosMinisteriais: contadores.cargosMinisteriais,
      cargosApoio: contadores.cargosApoio
    };

  } catch (error) {
    console.error(`❌ Erro ao atualizar aba Resumo da planilha externa de Fazendinha com dados do ensaio de ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para exportar dados completos para planilha externa de Jandira (com instrumentos e cargos)
function exportarParaPlanilhaJandiraCompleta(localEnsaio) {
  try {
    console.log(`🏛️ Iniciando exportação completa para planilha externa de Jandira: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Filtra dados apenas do local especificado
    const linhasLocal = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaioRow = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      // Só processa se for do local especificado (comparação flexível)
      if (!compararLocaisEnsaio(localEnsaioRow, localEnsaio)) continue;
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhasLocal.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaioRow, _ord: i
      });
    }

    console.log(`📊 Encontrados ${linhasLocal.length} membros para o local: ${localEnsaio}`);

    // Lista completa de instrumentos
    const listaCompletaInstrumentos = [
      'Organista', 'Acordeon', 'Violino', 'Viola', 'Violoncelo', 'Flauta transversal',
      'Oboé', "Oboé d'amore", 'Corne inglês', 'Clarinete', 'Clarinete alto', 
      'Clarinete baixo (clarone)', 'Fagote', 'Saxofone soprano (reto)', 'Saxofone alto',
      'Saxofone tenor', 'Saxofone barítono', 'Trompete', 'Cornet', 'Flugelhorn', 'Trompa',
      'Trombone', 'Trombonito', 'Barítono (pisto)', 'Eufônio', 'Tuba'
    ];

    // Lista completa de cargos ministeriais e de apoio
    const listaCompletaCargosMinisteriais = [
      'Ancião', 'Diácono', 'Cooperador do Ofício', 'Cooperador de Jovens',
      'Encarregado Regional', 'Encarregado Local', 'Examinadora',
      'Secretária da Música', 'Secretário da Música', 'Instrutor', 'Instrutora'
    ];

    const listaCompletaCargosApoio = [
      'Porteiro (a)', 'Bombeiro (a)', 'Médico (a)', 'Enfermeiro (a)', 'Irmandade'
    ];

    // Conta instrumentos e cargos
    const contadores = {
      instrumentos: {},
      musicos: {},
      cargosMinisteriais: {},
      cargosApoio: {},
      total: 0
    };

    // Inicializa todos os instrumentos com 0
    listaCompletaInstrumentos.forEach(inst => {
      contadores.instrumentos[inst] = 0;
      contadores.musicos[inst] = 0;
    });

    // Inicializa todos os cargos ministeriais com 0
    listaCompletaCargosMinisteriais.forEach(cargo => {
      contadores.cargosMinisteriais[cargo] = 0;
    });

    // Inicializa todos os cargos de apoio com 0
    listaCompletaCargosApoio.forEach(cargo => {
      contadores.cargosApoio[cargo] = 0;
    });

    // Processa cada linha do local
    linhasLocal.forEach(x => {
      if (!estevePresente(x)) return;
      
      contadores.total++;
      
      // LÓGICA CORRETA: Organistas são contados por CARGO
      const cargoLower = x.cargo ? x.cargo.toLowerCase() : '';
      if (cargoLower.includes('organista') || cargoLower.includes('examinadora') || 
          cargoLower.includes('instrutora') || cargoLower.includes('instrutoras')) {
        contadores.instrumentos['Organista']++;
        contadores.musicos['Organista']++;
        console.log(`🎹 Organista contado por cargo: ${x.nome} (cargo: ${x.cargo})`);
      } else if (x.instrumento && !cargoLower.includes('secretário da música') && !cargoLower.includes('secretaria da musica') && !cargoLower.includes('secretarios da musica') && !cargoLower.includes('secretarias da musica')) {
        // Mapeia o instrumento para a lista padrão (excluindo secretários da música)
        const instrumentoMapeado = mapearInstrumento(x.instrumento);
        
        if (instrumentoMapeado && contadores.instrumentos.hasOwnProperty(instrumentoMapeado) && instrumentoMapeado !== 'Organista') {
          contadores.instrumentos[instrumentoMapeado]++;
          contadores.musicos[instrumentoMapeado]++;
          console.log(`🎵 Instrumento contado: ${x.instrumento} -> ${instrumentoMapeado} - ${x.nome}`);
        } else if (instrumentoMapeado) {
          console.log(`⚠️ Instrumento não mapeado: ${x.instrumento} (mapeado: ${instrumentoMapeado})`);
        }
      }
      
      // Conta cargos ministeriais específicos
      if (x.cargo) {
        const cargoOriginal = x.cargo;
        const cargoFormatado = formatarTexto(cargoOriginal);
        
        const mapeamentoCargos = {
          'ancião': 'Ancião',
          'diácono': 'Diácono',
          'cooperador do ofício': 'Cooperador do Ofício',
          'cooperador do oficio': 'Cooperador do Ofício',
          'cooperador de jovens': 'Cooperador de Jovens',
          'encarregado regional': 'Encarregado Regional',
          'encarregado local': 'Encarregado Local',
          'examinadora': 'Examinadora',
          'examinadoras': 'Examinadora',
          'examinador': 'Examinadora',
          'examinadores': 'Examinadora',
          'examinadora de organistas': 'Examinadora',
          'examinadoras de organistas': 'Examinadora',
          'examinador de organistas': 'Examinadora',
          'examinadores de organistas': 'Examinadora',
          'secretária da música': 'Secretária da Música',
          'secretarias da música': 'Secretária da Música',
          'secretaria da musica': 'Secretária da Música',
          'secretarias da musica': 'Secretária da Música',
          'secretário da música': 'Secretário da Música',
          'secretarios da música': 'Secretário da Música',
          'secretario da musica': 'Secretário da Música',
          'secretarios da musica': 'Secretário da Música',
          'secretário do gem': 'Secretário da Música',
          'secretarios do gem': 'Secretário da Música',
          'secretario do gem': 'Secretário da Música',
          'instrutor': 'Instrutor',
          'instrutora': 'Instrutora',
          'instrutores': 'Instrutor',
          'instrutoras': 'Instrutora',
          'porteiro (a)': 'Porteiro (a)',
          'porteiro': 'Porteiro (a)',
          'porteira': 'Porteiro (a)',
          'bombeiro (a)': 'Bombeiro (a)',
          'bombeiro': 'Bombeiro (a)',
          'bombeira': 'Bombeiro (a)',
          'médico (a)': 'Médico (a)',
          'medico': 'Médico (a)',
          'medica': 'Médico (a)',
          'enfermeiro (a)': 'Enfermeiro (a)',
          'enfermeiro': 'Enfermeiro (a)',
          'enfermeira': 'Enfermeiro (a)',
          'irmandade': 'Irmandade',
          'irma': 'Irmandade',
          'irmao': 'Irmandade',
          'irmão': 'Irmandade',
          'irmã': 'Irmandade',
          'irmãos': 'Irmandade',
          'irmãs': 'Irmandade'
        };
        
        const cargoMapeado = mapeamentoCargos[cargoFormatado.toLowerCase()];
        
        if (contadores.cargosMinisteriais.hasOwnProperty(cargoMapeado)) {
          contadores.cargosMinisteriais[cargoMapeado]++;
        }
        
        if (contadores.cargosApoio.hasOwnProperty(cargoMapeado)) {
          contadores.cargosApoio[cargoMapeado]++;
        }
      }
    });

    // Acessa a planilha externa de Jandira
    const ssJandira = openJandiraSheet();
    
    // Acessa a aba Resumo da planilha externa de Jandira
    const shResumo = ssJandira.getSheetByName('Resumo');
    if (!shResumo) {
      throw new Error('Aba "Resumo" não encontrada na planilha externa de Jandira.');
    }
    
    // LIMPA todos os contadores antes de atualizar (correção do problema)
    limparContadoresResumo(shResumo, [28, 41, 48, 50]);
    
    console.log(`📊 Atualizando aba Resumo da planilha externa de Jandira com dados do ensaio de ${localEnsaio}...`);
    
    // Atualiza apenas os valores usando a função escreveAoLado
    console.log('📊 Atualizando valores na aba Resumo...');
    
    // Sinônimos de rótulo para INSTRUMENTOS
    const INSTR_LABEL_SYNONYMS = {
      'Organista': ['Organista','Organistas']
    };

    const CARGO_MIN_ORD = [
      'Ancião','Diácono','Cooperador do Ofício','Cooperador de Jovens',
      'Encarregado Regional','Encarregado Local','Examinadora',
      'Secretária da Música','Secretário da Música',
      'Instrutor','Instrutora'
    ];

    const APOIO_LABEL_SYNONYMS = {
      'Porteiro (a)': ['Porteiros (as)', 'Porteiro (a)'],
      'Bombeiro (a)': ['Bombeiros (as)', 'Bombeiro (a)'],
      'Médico (a)': ['Médicos (as) / Ambulatório', 'Medicos (as) / Ambulatorio', 'Médico (a)', 'Medico (a)'],
      'Enfermeiro (a)': ['Enfermeiros (as)', 'Enfermeiro (a)'],
      'Irmandade': ['Irmandade']
    };
    const APOIO_IRM_ORD = Object.keys(APOIO_LABEL_SYNONYMS);

    const MIN_LABEL_SYNONYMS = {
      'Ancião': ['Ancião','Anciao'],
      'Diácono': ['Diácono','Diacono'],
      'Cooperador do Ofício': ['Cooperador do Ofício','Cooperador do Oficio','Cooperador do Ofício Ministerial'],
      'Cooperador de Jovens': ['Cooperador de Jovens','Cooperador de Jovens e Menores'],
      'Encarregado Regional': ['Encarregado Regional'],
      'Encarregado Local': ['Encarregado Local'],
      'Examinadora': ['Examinadora'],
      'Secretária da Música': ['Secretária da Música','Secretarias da Música','Secretaria da Música'],
      'Secretário da Música': ['Secretário da Música','Secretarios da Música','Secretario da Música'],
      'Instrutores': ['Instrutores','Instrutor'],
      'Instrutoras': ['Instrutoras','Instrutora']
    };

    // Atualiza instrumentos com sinônimos
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.instrumentos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza músicos por instrumento
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.musicos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos ministeriais com sinônimos
    CARGO_MIN_ORD.forEach(canonical => {
      const val = contadores.cargosMinisteriais[canonical] || 0;
      const rLabels = MIN_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos de apoio com sinônimos
    APOIO_IRM_ORD.forEach(canonical => {
      const val = contadores.cargosApoio[canonical] || 0;
      APOIO_LABEL_SYNONYMS[canonical].forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    console.log(`✅ Aba Resumo da planilha externa de Jandira atualizada com sucesso com dados do ensaio de ${localEnsaio}`);
    console.log(`📈 Total de membros: ${contadores.total}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Resumo',
      planilhaId: JANDIRA_SHEET_ID,
      totalMembros: contadores.total,
      instrumentos: contadores.instrumentos,
      cargosMinisteriais: contadores.cargosMinisteriais,
      cargosApoio: contadores.cargosApoio
    };

  } catch (error) {
    console.error(`❌ Erro ao atualizar aba Resumo da planilha externa de Jandira com dados do ensaio de ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para exportar dados completos para planilha externa de Cotia (com instrumentos e cargos)
function exportarParaPlanilhaCotiaCompleta(localEnsaio) {
  try {
    console.log(`🏛️ Iniciando exportação completa para planilha externa de Cotia: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Filtra dados apenas do local especificado
    const linhasLocal = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaioRow = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      // Só processa se for do local especificado (comparação flexível)
      if (!compararLocaisEnsaio(localEnsaioRow, localEnsaio)) continue;
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhasLocal.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaioRow, _ord: i
      });
    }

    console.log(`📊 Encontrados ${linhasLocal.length} membros para o local: ${localEnsaio}`);

    // Lista completa de instrumentos
    const listaCompletaInstrumentos = [
      'Organista', 'Acordeon', 'Violino', 'Viola', 'Violoncelo', 'Flauta transversal',
      'Oboé', "Oboé d'amore", 'Corne inglês', 'Clarinete', 'Clarinete alto', 
      'Clarinete baixo (clarone)', 'Fagote', 'Saxofone soprano (reto)', 'Saxofone alto',
      'Saxofone tenor', 'Saxofone barítono', 'Trompete', 'Cornet', 'Flugelhorn', 'Trompa',
      'Trombone', 'Trombonito', 'Barítono (pisto)', 'Eufônio', 'Tuba'
    ];

    // Lista completa de cargos ministeriais e de apoio
    const listaCompletaCargosMinisteriais = [
      'Ancião', 'Diácono', 'Cooperador do Ofício', 'Cooperador de Jovens',
      'Encarregado Regional', 'Encarregado Local', 'Examinadora',
      'Secretária da Música', 'Secretário da Música', 'Instrutor', 'Instrutora'
    ];

    const listaCompletaCargosApoio = [
      'Porteiro (a)', 'Bombeiro (a)', 'Médico (a)', 'Enfermeiro (a)', 'Irmandade'
    ];

    // Conta instrumentos e cargos
    const contadores = {
      instrumentos: {},
      musicos: {},
      cargosMinisteriais: {},
      cargosApoio: {},
      total: 0
    };

    // Inicializa todos os instrumentos com 0
    listaCompletaInstrumentos.forEach(inst => {
      contadores.instrumentos[inst] = 0;
      contadores.musicos[inst] = 0;
    });

    // Inicializa todos os cargos ministeriais com 0
    listaCompletaCargosMinisteriais.forEach(cargo => {
      contadores.cargosMinisteriais[cargo] = 0;
    });

    // Inicializa todos os cargos de apoio com 0
    listaCompletaCargosApoio.forEach(cargo => {
      contadores.cargosApoio[cargo] = 0;
    });

    // Processa cada linha do local
    linhasLocal.forEach(x => {
      if (!estevePresente(x)) return;
      
      contadores.total++;
      
      // LÓGICA CORRETA: Organistas são contados por CARGO
      const cargoLower = x.cargo ? x.cargo.toLowerCase() : '';
      if (cargoLower.includes('organista') || cargoLower.includes('examinadora') || 
          cargoLower.includes('instrutora') || cargoLower.includes('instrutoras')) {
        contadores.instrumentos['Organista']++;
        contadores.musicos['Organista']++;
        console.log(`🎹 Organista contado por cargo: ${x.nome} (cargo: ${x.cargo})`);
      } else if (x.instrumento && !cargoLower.includes('secretário da música') && !cargoLower.includes('secretaria da musica') && !cargoLower.includes('secretarios da musica') && !cargoLower.includes('secretarias da musica')) {
        // Mapeia o instrumento para a lista padrão (excluindo secretários da música)
        const instrumentoMapeado = mapearInstrumento(x.instrumento);
        
        if (instrumentoMapeado && contadores.instrumentos.hasOwnProperty(instrumentoMapeado) && instrumentoMapeado !== 'Organista') {
          contadores.instrumentos[instrumentoMapeado]++;
          contadores.musicos[instrumentoMapeado]++;
          console.log(`🎵 Instrumento contado: ${x.instrumento} -> ${instrumentoMapeado} - ${x.nome}`);
        } else if (instrumentoMapeado) {
          console.log(`⚠️ Instrumento não mapeado: ${x.instrumento} (mapeado: ${instrumentoMapeado})`);
        }
      }
      
      // Conta cargos ministeriais específicos
      if (x.cargo) {
        const cargoOriginal = x.cargo;
        const cargoFormatado = formatarTexto(cargoOriginal);
        
        const mapeamentoCargos = {
          'ancião': 'Ancião',
          'diácono': 'Diácono',
          'cooperador do ofício': 'Cooperador do Ofício',
          'cooperador do oficio': 'Cooperador do Ofício',
          'cooperador de jovens': 'Cooperador de Jovens',
          'encarregado regional': 'Encarregado Regional',
          'encarregado local': 'Encarregado Local',
          'examinadora': 'Examinadora',
          'examinadoras': 'Examinadora',
          'examinador': 'Examinadora',
          'examinadores': 'Examinadora',
          'examinadora de organistas': 'Examinadora',
          'examinadoras de organistas': 'Examinadora',
          'examinador de organistas': 'Examinadora',
          'examinadores de organistas': 'Examinadora',
          'secretária da música': 'Secretária da Música',
          'secretarias da música': 'Secretária da Música',
          'secretaria da musica': 'Secretária da Música',
          'secretarias da musica': 'Secretária da Música',
          'secretário da música': 'Secretário da Música',
          'secretarios da música': 'Secretário da Música',
          'secretario da musica': 'Secretário da Música',
          'secretarios da musica': 'Secretário da Música',
          'secretário do gem': 'Secretário da Música',
          'secretarios do gem': 'Secretário da Música',
          'secretario do gem': 'Secretário da Música',
          'instrutor': 'Instrutor',
          'instrutora': 'Instrutora',
          'instrutores': 'Instrutor',
          'instrutoras': 'Instrutora',
          'porteiro (a)': 'Porteiro (a)',
          'porteiro': 'Porteiro (a)',
          'porteira': 'Porteiro (a)',
          'bombeiro (a)': 'Bombeiro (a)',
          'bombeiro': 'Bombeiro (a)',
          'bombeira': 'Bombeiro (a)',
          'médico (a)': 'Médico (a)',
          'medico': 'Médico (a)',
          'medica': 'Médico (a)',
          'enfermeiro (a)': 'Enfermeiro (a)',
          'enfermeiro': 'Enfermeiro (a)',
          'enfermeira': 'Enfermeiro (a)',
          'irmandade': 'Irmandade',
          'irma': 'Irmandade',
          'irmao': 'Irmandade',
          'irmão': 'Irmandade',
          'irmã': 'Irmandade',
          'irmãos': 'Irmandade',
          'irmãs': 'Irmandade'
        };
        
        const cargoMapeado = mapeamentoCargos[cargoFormatado.toLowerCase()];
        
        if (contadores.cargosMinisteriais.hasOwnProperty(cargoMapeado)) {
          contadores.cargosMinisteriais[cargoMapeado]++;
        }
        
        if (contadores.cargosApoio.hasOwnProperty(cargoMapeado)) {
          contadores.cargosApoio[cargoMapeado]++;
        }
      }
    });

    // Acessa a planilha externa de Cotia
    const ssCotia = openCotiaSheet();
    
    // Acessa a aba Resumo da planilha externa de Cotia
    const shResumo = ssCotia.getSheetByName('Resumo');
    if (!shResumo) {
      throw new Error('Aba "Resumo" não encontrada na planilha externa de Cotia.');
    }
    
    // LIMPA todos os contadores antes de atualizar (correção do problema)
    limparContadoresResumo(shResumo, [28, 41, 48, 50]);
    
    console.log(`📊 Atualizando aba Resumo da planilha externa de Cotia com dados do ensaio de ${localEnsaio}...`);
    
    // Atualiza apenas os valores usando a função escreveAoLado
    console.log('📊 Atualizando valores na aba Resumo...');
    
    // Sinônimos de rótulo para INSTRUMENTOS
    const INSTR_LABEL_SYNONYMS = {
      'Organista': ['Organista','Organistas']
    };

    const CARGO_MIN_ORD = [
      'Ancião','Diácono','Cooperador do Ofício','Cooperador de Jovens',
      'Encarregado Regional','Encarregado Local','Examinadora',
      'Secretária da Música','Secretário da Música',
      'Instrutor','Instrutora'
    ];

    const APOIO_LABEL_SYNONYMS = {
      'Porteiro (a)': ['Porteiros (as)', 'Porteiro (a)'],
      'Bombeiro (a)': ['Bombeiros (as)', 'Bombeiro (a)'],
      'Médico (a)': ['Médicos (as) / Ambulatório', 'Medicos (as) / Ambulatorio', 'Médico (a)', 'Medico (a)'],
      'Enfermeiro (a)': ['Enfermeiros (as)', 'Enfermeiro (a)'],
      'Irmandade': ['Irmandade']
    };
    const APOIO_IRM_ORD = Object.keys(APOIO_LABEL_SYNONYMS);

    const MIN_LABEL_SYNONYMS = {
      'Ancião': ['Ancião','Anciao'],
      'Diácono': ['Diácono','Diacono'],
      'Cooperador do Ofício': ['Cooperador do Ofício','Cooperador do Oficio','Cooperador do Ofício Ministerial'],
      'Cooperador de Jovens': ['Cooperador de Jovens','Cooperador de Jovens e Menores'],
      'Encarregado Regional': ['Encarregado Regional'],
      'Encarregado Local': ['Encarregado Local'],
      'Examinadora': ['Examinadora'],
      'Secretária da Música': ['Secretária da Música','Secretarias da Música','Secretaria da Música'],
      'Secretário da Música': ['Secretário da Música','Secretarios da Música','Secretario da Música'],
      'Instrutores': ['Instrutores','Instrutor'],
      'Instrutoras': ['Instrutoras','Instrutora']
    };

    // Atualiza instrumentos com sinônimos
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.instrumentos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza músicos por instrumento
    listaCompletaInstrumentos.forEach(canonical => {
      const val = contadores.musicos[canonical] || 0;
      const rLabels = INSTR_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos ministeriais com sinônimos
    CARGO_MIN_ORD.forEach(canonical => {
      const val = contadores.cargosMinisteriais[canonical] || 0;
      const rLabels = MIN_LABEL_SYNONYMS[canonical] || [canonical];
      rLabels.forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    // Atualiza cargos de apoio com sinônimos
    APOIO_IRM_ORD.forEach(canonical => {
      const val = contadores.cargosApoio[canonical] || 0;
      APOIO_LABEL_SYNONYMS[canonical].forEach(rot => atualizarColunaBPreservandoFormulas(shResumo, rot, val));
    });

    console.log(`✅ Aba Resumo da planilha externa de Cotia atualizada com sucesso com dados do ensaio de ${localEnsaio}`);
    console.log(`📈 Total de membros: ${contadores.total}`);
    
    return {
      ok: true,
      localEnsaio: localEnsaio,
      abaAtualizada: 'Resumo',
      planilhaId: COTIA_SHEET_ID,
      totalMembros: contadores.total,
      instrumentos: contadores.instrumentos,
      cargosMinisteriais: contadores.cargosMinisteriais,
      cargosApoio: contadores.cargosApoio
    };

  } catch (error) {
    console.error(`❌ Erro ao atualizar aba Resumo da planilha externa de Cotia com dados do ensaio de ${localEnsaio}:`, error);
    throw error;
  }
}

// Função para mapear instrumentos da planilha para a lista padrão
function mapearInstrumento(instrumento) {
  if (!instrumento) return null;
  
  const instrumentoNormalizado = formatarTexto(instrumento);
  
  const mapeamentoInstrumentos = {
    'Órgão': 'Organista',
    'Organista': 'Organista',
    'Violino': 'Violino',
    'Viola': 'Viola',
    'Violoncelo': 'Violoncelo',
    'Clarinete': 'Clarinete',
    'Flauta': 'Flauta transversal',
    'Flauta Transversal': 'Flauta transversal',
    'Saxofone Soprano (Reto)': 'Saxofone soprano (reto)',
    'Saxofone Soprano Reto': 'Saxofone soprano (reto)',
    'Trompete': 'Trompete',
    'Trombone': 'Trombone',
    'Tuba': 'Tuba',
    'Fagote': 'Fagote',
    'Oboé': 'Oboé',
    'Corne Inglês': 'Corne inglês',
    'Cornet': 'Cornet',
    'Flugelhorn': 'Flugelhorn',
    'Trompa': 'Trompa',
    'Acordeon': 'Acordeon',
    'Acordeão': 'Acordeon',
    'Eufônio': 'Eufônio',
    'Barítono (Pisto)': 'Barítono (pisto)',
    'Trombonito': 'Trombonito'
  };
  
  return mapeamentoInstrumentos[instrumentoNormalizado] || instrumentoNormalizado;
}

// Função para limpar todos os contadores do resumo antes de atualizar
function limparContadoresResumo(sheet, linhasComFormulas = [28, 41, 48, 50]) {
  console.log('🧹 Limpando contadores do resumo...');
  
  try {
    // Pega todo o range da planilha para limpeza completa
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow < 2) {
      console.log('📋 Planilha vazia, nada para limpar');
      return;
    }
    
    // Pega todos os dados da planilha
    const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    
    let contadoresLimpos = 0;
    
    // Percorre todas as linhas da planilha
    for (let i = 1; i < data.length; i++) { // Começa da linha 2 (índice 1)
      const row = i + 1; // Linha real na planilha
      
      // Verifica se a linha contém fórmulas que devem ser preservadas
      if (linhasComFormulas.includes(row)) {
        console.log(`📊 Preservando fórmula na linha ${row}`);
        continue; // Não limpa esta linha
      }
      
      // Verifica se a linha tem dados na coluna A (rótulo)
      const rotulo = data[i][0]; // Coluna A
      if (!rotulo || typeof rotulo !== 'string' || rotulo.trim() === '') {
        continue; // Pula linhas vazias
      }
      
      // Verifica se a coluna B tem um valor numérico (contador)
      const valorAtual = data[i][1]; // Coluna B
      if (typeof valorAtual === 'number' && valorAtual > 0) {
        // Limpa o valor na coluna B
        sheet.getRange(row, 2).setValue(0);
        contadoresLimpos++;
        console.log(`🧹 Limpo: "${rotulo}" = 0 (linha ${row}, valor anterior: ${valorAtual})`);
      }
    }
    
    console.log(`✅ Limpeza concluída: ${contadoresLimpos} contadores zerados`);
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error);
    throw error;
  }
}

// Função para atualizar apenas coluna B preservando fórmulas em linhas específicas
function atualizarColunaBPreservandoFormulas(sheet, rotulo, valor, linhasComFormulas = [28, 41, 48, 50]) {
  console.log(`🔍 Buscando rótulo: "${rotulo}" com valor: ${valor}`);
  
  const tf = sheet.createTextFinder(rotulo).matchEntireCell(true);
  const matches = tf.findAll();
  
  console.log(`📋 Encontrados ${matches.length} matches para "${rotulo}"`);
  
  if (matches.length === 0) {
    console.log(`⚠️ Nenhum match encontrado para "${rotulo}"`);
    return;
  }
  
  matches.forEach((m, index) => {
    const row = m.getRow();
    const col = m.getColumn();
    const cellValue = m.getValue();
    
    console.log(`📍 Match ${index + 1}: Linha ${row}, Coluna ${col}, Valor: "${cellValue}"`);
    
    // Verifica se a linha contém fórmulas que devem ser preservadas
    if (linhasComFormulas.includes(row)) {
      console.log(`📊 Preservando fórmula na linha ${row} para: ${rotulo}`);
      return; // Não atualiza esta linha
    }
    
    // Atualiza apenas a coluna B (offset 0, 1)
    const targetCell = m.offset(0, 1);
    const oldValue = targetCell.getValue();
    targetCell.setValue(valor);
    console.log(`📊 Atualizado: ${rotulo} = ${valor} (linha ${row}, coluna ${col + 1}, valor anterior: ${oldValue})`);
  });
}

// ===== FUNÇÕES PARA LISTA DE IGREJAS COM SAM DESATUALIZADO =====

/**
 * Função principal para gerar lista de igrejas com SAM desatualizado
 * Segue o mesmo padrão das funções de organistas
 */
function gerarListaSamDesatualizado() {
  try {
    console.log('📋 Iniciando geração da lista de igrejas com SAM desatualizado...');
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxNivel = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('nivel') || 
      h.toString().toLowerCase().includes('nível') ||
      h.toString().toLowerCase().includes('classe')
    ));
    const idxComum = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('comum'));
    const idxCidade = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('cidade') || 
      h.toString().toLowerCase().includes('municipio') || 
      h.toString().toLowerCase().includes('município') ||
      h.toString().toLowerCase().includes('localidade')
    ));
    const idxAnotacoes = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('anotacao') || 
      h.toString().toLowerCase().includes('anotacoes') ||
      h.toString().toLowerCase().includes('observacao') ||
      h.toString().toLowerCase().includes('observacoes')
    ));

    if (idxNome < 0 || idxCargo < 0) {
      throw new Error('Colunas "nome" ou "cargo" não encontradas');
    }

    // Filtra dados para registros com SAM desatualizado
    const samDesatualizado = [];
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const comum = norm(row[idxComum] || '') || '(Sem comum)';
      const cidade = norm(row[idxCidade] || '') || '(Sem cidade)';
      const anotacoes = norm(row[idxAnotacoes] || '');
      
      // Captura o nível da organista se for organista
      let nivelOrganista = '';
      if (cargo.toLowerCase().includes('organista') && idxNivel >= 0) {
        nivelOrganista = norm(row[idxNivel] || '');
      }
      
      // Verifica se tem SAM desatualizado
      const temSamDesatualizado = anotacoes && anotacoes.toLowerCase().includes('sam desatualizado');
      
      if (temSamDesatualizado) {
        // Adiciona TODOS os registros com SAM desatualizado (incluindo organistas)
        samDesatualizado.push({
          nome,
          cargo,
          nivelOrganista,
          comum,
          cidade
        });
      }
    }

    console.log(`📊 Encontrados ${samDesatualizado.length} registros com SAM desatualizado`);

    // Acessa a planilha principal
    const ssPrincipal = SpreadsheetApp.openById(DEFAULT_SHEET_ID);
    let shSam = ssPrincipal.getSheetByName('SAM');
    
    // Cria a aba se não existir
    if (!shSam) {
      shSam = ssPrincipal.insertSheet('SAM');
      
      // Configura o cabeçalho da planilha
      const cabecalho = [
        ['CONGREGAÇÃO CRISTÃ NO BRASIL', '', '', '', '', ''],
        ['LISTA DE IGREJAS COM O SAM DESATUALIZADO', '', '', '', '', ''],
        ['Relação de Músicos e Organistas', '', '', '', '', ''],
        ['ID', 'Nome', 'Cargo', 'Nível da organista', 'Comum', 'Cidade']
      ];
      
      shSam.getRange(1, 1, 4, 6).setValues(cabecalho);
      
      // Formata o cabeçalho
      const rangeCabecalho = shSam.getRange(1, 1, 4, 6);
      rangeCabecalho.setFontWeight('bold');
      rangeCabecalho.setHorizontalAlignment('center');
      
      // Formata a linha de títulos das colunas (linha 4)
      const rangeTitulos = shSam.getRange(4, 1, 1, 6);
      rangeTitulos.setBackground('#404040');
      rangeTitulos.setFontColor('white');
      rangeTitulos.setFontWeight('bold');
      
      // Ajusta largura das colunas
      shSam.setColumnWidth(1, 50);  // ID
      shSam.setColumnWidth(2, 200); // Nome
      shSam.setColumnWidth(3, 150); // Cargo
      shSam.setColumnWidth(4, 120); // Nível da organista
      shSam.setColumnWidth(5, 150); // Comum
      shSam.setColumnWidth(6, 150); // Cidade
      
      console.log('✅ Aba "SAM" criada na planilha principal');
    }

    // Limpa dados existentes a partir da linha 5
    const ultimaLinha = shSam.getLastRow();
    if (ultimaLinha > 4) {
      shSam.getRange(5, 1, ultimaLinha - 4, 6).clearContent();
      console.log(`✅ Dados limpos na aba SAM (preparando para inserir ${samDesatualizado.length} registros)`);
    }

    // Popula dados a partir da linha 5
    if (samDesatualizado.length > 0) {
      const dadosParaInserir = samDesatualizado.map((item, index) => [
        index + 1, // ID sequencial
        item.nome,
        item.cargo,
        item.nivelOrganista, // Nível da organista (preenchido se for organista)
        item.comum,
        item.cidade
      ]);

      shSam.getRange(5, 1, dadosParaInserir.length, 6).setValues(dadosParaInserir);
      console.log(`✅ ${samDesatualizado.length} registros inseridos na aba SAM`);
    }

    return {
      sucesso: true,
      totalRegistros: samDesatualizado.length,
      registros: samDesatualizado
    };

  } catch (error) {
    console.error('❌ Erro ao gerar lista de SAM desatualizado:', error);
    throw error;
  }
}

/**
 * Função de menu para acessar a geração da lista de SAM desatualizado
 */
function menuListaSamDesatualizado() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // Confirma a operação
    const confirmacao = ui.alert(
      '📋 Gerar Lista de Registros com SAM Desatualizado',
      'Deseja gerar a lista de todos os registros com SAM desatualizado?\n\nIsso irá:\n• Analisar todos os dados da planilha\n• Identificar TODOS os registros marcados como "SAM Desatualizado" (incluindo organistas)\n• Atualizar a aba "SAM" na planilha principal\n\nConfirma a operação?',
      ui.ButtonSet.YES_NO
    );

    if (confirmacao !== ui.Button.YES) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }

    ui.alert('⏳ Gerando lista de registros com SAM desatualizado...\n\nPor favor, aguarde enquanto os dados são processados.');

    // Executa a geração da lista
    const resultado = gerarListaSamDesatualizado();
    
    const mensagem = `✅ Lista de registros com SAM desatualizado gerada com sucesso!\n\n` +
                    `📊 Total de registros encontrados: ${resultado.totalRegistros}\n\n` +
                    `📋 A lista foi atualizada na aba "SAM" da planilha principal.`;

    ui.alert('✅ Sucesso!', mensagem, ui.ButtonSet.OK);
    
    console.log('✅ Lista de SAM desatualizado gerada com sucesso:', resultado);

  } catch (error) {
    console.error('❌ Erro no menu de SAM desatualizado:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro', `Erro ao gerar lista de SAM desatualizado:\n\n${error.message}`, ui.ButtonSet.OK);
  }
}

/**
 * Função para gerar lista de SAM desatualizado para um local específico
 * Útil para análises mais focadas
 */
function gerarListaSamDesatualizadoPorLocal(localEnsaio = 'Itapevi') {
  try {
    console.log(`📋 Iniciando geração da lista de SAM desatualizado para: ${localEnsaio}`);
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Busca flexível pelos headers
    const idxNome = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('nome'));
    const idxCargo = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('cargo'));
    const idxComum = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('comum'));
    const idxCidade = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('cidade') || 
      h.toString().toLowerCase().includes('municipio') || 
      h.toString().toLowerCase().includes('município') ||
      h.toString().toLowerCase().includes('localidade')
    ));
    const idxAnotacoes = headerRow.findIndex(h => h && (
      h.toString().toLowerCase().includes('anotacao') || 
      h.toString().toLowerCase().includes('anotacoes') ||
      h.toString().toLowerCase().includes('observacao') ||
      h.toString().toLowerCase().includes('observacoes')
    ));
    const idxLocalEnsaio = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('local_ensaio'));

    if (idxNome < 0 || idxCargo < 0) {
      throw new Error('Colunas "nome" ou "cargo" não encontradas');
    }

    // Filtra dados para registros com SAM desatualizado do local específico
    const samDesatualizado = [];
    const igrejasUnicas = new Set();
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[idxNome] || '');
      if (!nome) continue;

      const cargo = norm(row[idxCargo] || '');
      const comum = norm(row[idxComum] || '') || '(Sem comum)';
      const cidade = norm(row[idxCidade] || '') || '(Sem cidade)';
      const anotacoes = norm(row[idxAnotacoes] || '');
      const localEnsaioRow = norm(row[idxLocalEnsaio] || '') || '';
      
      // Verifica se tem SAM desatualizado e se é do local correto
      const temSamDesatualizado = anotacoes && anotacoes.toLowerCase().includes('sam desatualizado');
      const isLocalCorreto = !localEnsaioRow || localEnsaioRow.toLowerCase().includes(localEnsaio.toLowerCase());
      
      if (temSamDesatualizado && isLocalCorreto) {
        const chaveIgreja = `${comum}-${cidade}`;
        
        // Adiciona à lista se ainda não foi adicionada esta igreja
        if (!igrejasUnicas.has(chaveIgreja)) {
          samDesatualizado.push({
            nome,
            cargo,
            comum,
            cidade
          });
          igrejasUnicas.add(chaveIgreja);
        }
      }
    }

    console.log(`📊 Encontradas ${samDesatualizado.length} igrejas com SAM desatualizado para ${localEnsaio}`);

    return {
      sucesso: true,
      local: localEnsaio,
      totalIgrejas: samDesatualizado.length,
      igrejas: samDesatualizado
    };

  } catch (error) {
    console.error('❌ Erro ao gerar lista de SAM desatualizado por local:', error);
    throw error;
  }
}

// Função de teste para verificar se tudo está funcionando
function testeSamDesatualizado() {
  try {
    console.log('🧪 Iniciando teste da função SAM desatualizado...');
    
    // Testa se consegue acessar a planilha principal
    const shDados = openOrCreateSheet(SHEET_NAME);
    console.log('✅ Planilha principal acessada:', shDados.getName());
    
    // Testa se consegue acessar a planilha principal
    const ssPrincipal = SpreadsheetApp.openById(DEFAULT_SHEET_ID);
    console.log('✅ Planilha principal acessada:', ssPrincipal.getName());
    
    // Testa se a aba SAM existe
    const shSam = ssPrincipal.getSheetByName('SAM');
    if (shSam) {
      console.log('✅ Aba SAM encontrada:', shSam.getName());
    } else {
      console.log('ℹ️ Aba SAM não encontrada (será criada automaticamente)');
    }
    
    // Testa se há dados na planilha principal
    const lastRow = shDados.getLastRow();
    console.log('📊 Última linha com dados:', lastRow);
    
    if (lastRow > 1) {
      const headerRow = shDados.getRange(1, 1, 1, shDados.getLastColumn()).getDisplayValues()[0];
      console.log('📋 Cabeçalhos encontrados:', headerRow);
    }
    
    console.log('✅ Teste concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    throw error;
  }
}

/**
 * Função para gerar relatório detalhado dos presentes em cada ensaio
 * Gera relatório na aba "Relatório" com:
 * - Coluna A: Cidade
 * - Coluna B: Comum
 * - Coluna C: Local do ensaio onde o encarregado esteve (ou vazio se não esteve)
 * - Coluna D: Músicos
 * - Coluna E: Organistas
 * - Coluna F: Geral (total)
 * Uma linha por cidade/comum/ensaio
 */
function gerarRelatorioDetalhado() {
  try {
    console.log('🔄 Iniciando geração do relatório detalhado...');
    
    const shDados = openOrCreateSheet(SHEET_NAME);
    const lastRow = shDados.getLastRow();
    const lastCol = shDados.getLastColumn();
    
    console.log(`📊 Dados encontrados: ${lastRow} linhas, ${lastCol} colunas`);
    
    if (lastRow < 2) {
      throw new Error('Não há dados abaixo do cabeçalho em "Dados".');
    }

    const headerRow = shDados.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const data = shDados.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

    // Mapeia os índices das colunas
    const headerMap = {};
    headerRow.forEach((h, i) => { 
      if (h) headerMap[h.toString().trim()] = i; 
    });

    // Normaliza e processa os dados
    const linhas = [];
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const nome = norm(row[headerMap['NOME COMPLETO']] || '');
      if (!nome) continue;

      const comum = norm(row[headerMap['COMUM']] || '') || '(Sem comum)';
      const cidade = norm(row[headerMap['CIDADE']] || '') || '(Sem cidade)';
      const localEnsaio = norm(row[headerMap['LOCAL_ENSAIO']] || '') || '(Sem local definido)';
      
      const cargoRaw = norm(row[headerMap['CARGO']] || '');
      const cargoK = key(cargoRaw);
      const cargo = aliasCargo[cargoK] || (cargoK ? cap(cargoRaw) : '');
      
      const instrumento = norm(row[headerMap['INSTRUMENTO']] || '');
      const vaiTocar = norm(row[headerMap['VAI_TOCAR']] || '');
      const nivel = norm(row[headerMap['CLASSE_ORGANISTA']] || '');

      linhas.push({
        nome, comum, cidade, cargo, instrumento, vai_tocar: vaiTocar, nivel, local_ensaio: localEnsaio, _ord: i
      });
    }

    // Estrutura para armazenar dados por ensaio/comum
    // Formato: relatorioMap[localEnsaio][comum] = { cidade, musicos, organistas, total, encarregadoLocal }
    const relatorioMap = {};
    
    // Mapeia encarregados por comum
    const encarregadosPorComum = {};
    
    // Primeira passagem: identifica encarregados locais e onde estiveram
    linhas.forEach(x => {
      if (!estevePresente(x)) return;
      
      if (ehEncarregadoLocal(x.cargo)) {
        if (!encarregadosPorComum[x.comum]) {
          encarregadosPorComum[x.comum] = [];
        }
        encarregadosPorComum[x.comum].push({
          nome: x.nome,
          localEnsaio: x.local_ensaio,
          comum: x.comum
        });
      }
    });
    
    // Segunda passagem: agrupa dados por ensaio e comum
    linhas.forEach(x => {
      if (!estevePresente(x)) return;
      
      const local = x.local_ensaio;
      const comum = x.comum;
      
      // Inicializa estrutura se não existir
      if (!relatorioMap[local]) {
        relatorioMap[local] = {};
      }
      if (!relatorioMap[local][comum]) {
        relatorioMap[local][comum] = {
          cidade: x.cidade,
          musicos: 0,
          organistas: 0,
          total: 0,
          encarregadoLocal: '' // Local onde o encarregado esteve
        };
      }
      
      // Classifica por tipo de cargo - apenas músicos e organistas
      const cargoLower = x.cargo.toLowerCase();
      const tipoCargo = classificarCargo(x.cargo);
      
      if (tipoCargo === 'organista') {
        relatorioMap[local][comum].organistas++;
        relatorioMap[local][comum].total++;
      } else if (tipoCargo === 'musico' || ehMusico(x)) {
        relatorioMap[local][comum].musicos++;
        relatorioMap[local][comum].total++;
      }
      // Não conta outros cargos no total (apenas músicos e organistas)
    });
    
    // Terceira passagem: identifica onde o encarregado local esteve
    Object.keys(relatorioMap).forEach(local => {
      Object.keys(relatorioMap[local]).forEach(comum => {
        // Verifica se há encarregado local para esta comum
        if (encarregadosPorComum[comum] && encarregadosPorComum[comum].length > 0) {
          // Procura se algum encarregado desta comum esteve neste ensaio
          const encarregadoNesteEnsaio = encarregadosPorComum[comum].find(
            enc => enc.localEnsaio === local
          );
          
          if (encarregadoNesteEnsaio) {
            relatorioMap[local][comum].encarregadoLocal = local;
          }
        }
      });
    });
    
    // Prepara dados para a planilha
    const dadosRelatorio = [];
    
    // Ordena ensaios alfabeticamente
    const locaisOrdenados = Object.keys(relatorioMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    
    locaisOrdenados.forEach(local => {
      // Ordena comuns alfabeticamente dentro de cada ensaio
      const comunsOrdenadas = Object.keys(relatorioMap[local]).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      
      comunsOrdenadas.forEach(comum => {
        const dados = relatorioMap[local][comum];
        
        dadosRelatorio.push([
          dados.cidade,                    // Coluna A: Cidade
          comum,                           // Coluna B: Comum
          dados.encarregadoLocal || '',    // Coluna C: Local onde encarregado esteve (ou vazio)
          dados.musicos,                   // Coluna D: Músicos
          dados.organistas,                 // Coluna E: Organistas
          dados.total                      // Coluna F: Geral (total)
        ]);
      });
    });
    
    // Cria ou limpa a aba "Relatório"
    const shRelatorio = openOrCreateSheet('Relatório');
    shRelatorio.clearContents();
    
    // Cabeçalho
    const cabecalho = [['Cidade', 'Comum', 'Local Encarregado', 'Músicos', 'Organistas', 'Geral']];
    shRelatorio.getRange(1, 1, 1, 6).setValues(cabecalho);
    shRelatorio.getRange(1, 1, 1, 6).setFontWeight('bold');
    shRelatorio.getRange(1, 1, 1, 6).setBackground('#4285f4');
    shRelatorio.getRange(1, 1, 1, 6).setFontColor('white');
    
    // Dados
    if (dadosRelatorio.length > 0) {
      shRelatorio.getRange(2, 1, dadosRelatorio.length, 6).setValues(dadosRelatorio);
      
      // Formatação: alinha números à direita
      shRelatorio.getRange(2, 4, dadosRelatorio.length, 3).setHorizontalAlignment('right');
      
      // Adiciona bordas
      shRelatorio.getRange(1, 1, dadosRelatorio.length + 1, 6).setBorder(
        true, true, true, true, true, true, 
        '#cccccc', 
        SpreadsheetApp.BorderStyle.SOLID
      );
    }
    
    // Ajusta largura das colunas
    shRelatorio.setColumnWidth(1, 150); // Cidade
    shRelatorio.setColumnWidth(2, 200); // Comum
    shRelatorio.setColumnWidth(3, 180); // Local Encarregado
    shRelatorio.setColumnWidth(4, 100); // Músicos
    shRelatorio.setColumnWidth(5, 100); // Organistas
    shRelatorio.setColumnWidth(6, 100);  // Geral
    
    console.log(`✅ Relatório detalhado gerado com sucesso! ${dadosRelatorio.length} linhas criadas.`);
    
    return {
      sucesso: true,
      totalLinhas: dadosRelatorio.length,
      totalEnsaio: locaisOrdenados.length
    };
    
  } catch (error) {
    console.error('❌ Erro ao gerar relatório detalhado:', error);
    throw error;
  }
}

/**
 * Função de menu para acessar a geração do relatório detalhado
 */
function menuRelatorioDetalhado() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // Confirma a operação
    const confirmacao = ui.alert(
      '📊 Gerar Relatório Detalhado',
      'Deseja gerar o relatório detalhado dos presentes em cada ensaio?\n\nIsso irá:\n• Analisar todos os dados da planilha\n• Contar músicos e organistas por comum em cada ensaio\n• Identificar onde cada encarregado local esteve presente\n• Atualizar a aba "Relatório" na planilha principal\n\nConfirma a operação?',
      ui.ButtonSet.YES_NO
    );

    if (confirmacao !== ui.Button.YES) {
      ui.alert('❌ Operação cancelada pelo usuário.');
      return;
    }

    ui.alert('⏳ Gerando relatório detalhado...\n\nPor favor, aguarde enquanto os dados são processados.');

    // Executa a geração do relatório
    const resultado = gerarRelatorioDetalhado();
    
    const mensagem = `✅ Relatório detalhado gerado com sucesso!\n\n` +
                    `📊 Total de linhas criadas: ${resultado.totalLinhas}\n` +
                    `📍 Total de ensaios processados: ${resultado.totalEnsaio}\n\n` +
                    `📋 O relatório foi atualizado na aba "Relatório" da planilha principal.`;

    ui.alert('✅ Sucesso!', mensagem, ui.ButtonSet.OK);
    
    console.log('✅ Relatório detalhado gerado com sucesso:', resultado);

  } catch (error) {
    console.error('❌ Erro no menu de relatório detalhado:', error);
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ Erro', `Erro ao gerar relatório detalhado:\n\n${error.message}`, ui.ButtonSet.OK);
  }
}

