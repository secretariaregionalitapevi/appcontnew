/**
 * Normalização de nomes de instrumentos
 * Expande abreviações comuns encontradas no banco de dados
 * Baseado na lógica do backupcont
 */

import { normalizeString } from './stringNormalization';

/**
 * Expande abreviações comuns de instrumentos
 * Exemplos:
 * - "RET" → "RETO"
 * - "SAXOFONE SOPRANO RET" → "SAXOFONE SOPRANO (RETO)"
 * - "SAXOFONE SOPRANO RET" → "SAXOFONE SOPRANO RETO" (sem parênteses também funciona)
 */
export function expandInstrumentoAbbreviations(instrumento: string): string {
  if (!instrumento || typeof instrumento !== 'string') {
    return '';
  }

  const instrumentoUpper = instrumento.toUpperCase().trim();

  // 🚨 CORREÇÃO: Expandir abreviações comuns
  // "RET" → "RETO" (quando aparece no contexto de saxofone soprano)
  if (instrumentoUpper.includes('SAXOFONE') && instrumentoUpper.includes('SOPRANO')) {
    // Se contém "RET" mas não "RETO", expandir
    if (instrumentoUpper.includes('RET') && !instrumentoUpper.includes('RETO')) {
      // Expandir "RET" para "RETO" (com ou sem parênteses)
      return instrumentoUpper.replace(/\bRET\b/g, 'RETO');
    }
  }

  // Se contém apenas "RET" (não "RETO"), expandir
  if (instrumentoUpper === 'RET' || instrumentoUpper.endsWith(' RET')) {
    return instrumentoUpper.replace(/\bRET\b/g, 'RETO');
  }

  return instrumentoUpper;
}

/**
 * Normaliza nome de instrumento para busca
 * Expande abreviações e normaliza formato
 */
export function normalizeInstrumentoForSearch(instrumento: string): string {
  if (!instrumento || typeof instrumento !== 'string') {
    return '';
  }

  let normalized = instrumento.trim().toUpperCase();

  // Expandir abreviações
  normalized = expandInstrumentoAbbreviations(normalized);

  // Normalizar formato: garantir que "(RETO)" esteja correto
  if (normalized.includes('SAXOFONE SOPRANO') && normalized.includes('RETO') && !normalized.includes('(RETO)')) {
    normalized = normalized.replace(/RETO/g, '(RETO)');
  }

  return normalized;
}

/**
 * Cria variações de busca para um instrumento
 * Útil para encontrar instrumentos mesmo com abreviações diferentes
 */
export function expandInstrumentoSearch(instrumento: string): string[] {
  if (!instrumento || typeof instrumento !== 'string') {
    return [];
  }

  const variations: string[] = [];
  const instrumentoUpper = instrumento.trim().toUpperCase();
  const normalized = normalizeInstrumentoForSearch(instrumento);

  // Adicionar versão original (pode ter abreviação)
  variations.push(instrumentoUpper);
  
  // Adicionar versão normalizada (com abreviações expandidas)
  variations.push(normalized);

  // 🚨 CORREÇÃO CRÍTICA: Para SAXOFONE SOPRANO, criar todas as variações possíveis
  if (instrumentoUpper.includes('SAXOFONE') && instrumentoUpper.includes('SOPRANO')) {
    // Variação 1: Com "(RETO)" completo
    variations.push('SAXOFONE SOPRANO (RETO)');
    // Variação 2: Com "RETO" sem parênteses
    variations.push('SAXOFONE SOPRANO RETO');
    // Variação 3: Com "RET" abreviado (como está no banco)
    variations.push('SAXOFONE SOPRANO RET');
    // Variação 4: Com "RET" no final (caso tenha espaço)
    variations.push('SAXOFONE SOPRANO  RET');
    // Variação 5: Sem espaço antes de RET/RETO
    variations.push('SAXOFONE SOPRANORET');
    variations.push('SAXOFONE SOPRANORETO');
  }

  // 🚨 CORREÇÃO: Para EUFÔNIO, adicionar variações com e sem acento
  if (instrumentoUpper.includes('EUFÔNIO') || instrumentoUpper.includes('EUFONIO')) {
    variations.push('EUFÔNIO');
    variations.push('EUFONIO');
  }

  // Se contém "RETO", adicionar variação com "RET" (para buscar no banco que pode ter abreviação)
  if (normalized.includes('RETO')) {
    variations.push(normalized.replace(/RETO/g, 'RET'));
    variations.push(normalized.replace(/\(RETO\)/g, 'RET'));
    variations.push(normalized.replace(/RETO/g, 'RET')); // Sem parênteses também
  }

  // Se contém "RET", adicionar variação com "RETO" (para buscar no banco que pode ter completo)
  if (normalized.includes('RET') && !normalized.includes('RETO')) {
    variations.push(normalized.replace(/\bRET\b/g, 'RETO'));
    variations.push(normalized.replace(/\bRET\b/g, '(RETO)'));
  }

  // 🚨 CORREÇÃO CRÍTICA: Adicionar versões normalizadas (sem acentos) de TODAS as variações
  // Isso garante que a busca no Supabase encontre instrumentos mesmo que estejam escritos com ou sem acentos no banco
  // Seguindo a mesma lógica usada para candidatos
  const variationsNormalized = variations.map(v => normalizeString(v));
  variations.push(...variationsNormalized);

  // Remover duplicatas e retornar
  return [...new Set(variations)];
}

