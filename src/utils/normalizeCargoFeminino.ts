/**
 * Normaliza dados para cargos femininos que tocam órgão
 * Baseado na lógica do backupcont/app.js e Code.gs
 */

/**
 * Verifica se o cargo é um cargo feminino que toca órgão
 */
export function isCargoFemininoOrganista(cargoNome: string): boolean {
  if (!cargoNome) return false;

  const cargoUpper = cargoNome.toUpperCase().trim();

  return (
    cargoUpper === 'ORGANISTA' ||
    cargoUpper === 'INSTRUTORA' ||
    cargoUpper === 'EXAMINADORA' ||
    cargoUpper.includes('EXAMINADORA') || // Incluir variações como "EXAMINADORA DE ORGANISTAS"
    cargoUpper.includes('SECRETÁRIA DA MÚSICA') ||
    cargoUpper.includes('SECRETARIA DA MUSICA')
  );
}

/**
 * Normaliza a classe da organista de "OFICIALIZADO(A)" para "OFICIALIZADA"
 * Também trata casos como "RJM / OFICIALIZADO(A)" → "RJM / OFICIALIZADA"
 */
export function normalizarClasseOrganista(classe: string | null | undefined): string {
  if (!classe) return '';

  let classeNormalizada = classe.trim();

  // Remover "(A)" e trocar OFICIALIZADO por OFICIALIZADA
  classeNormalizada = classeNormalizada
    .replace(/\(A\)/g, '') // Remove (A)
    .replace(/OFICIALIZADO/g, 'OFICIALIZADA') // Troca OFICIALIZADO por OFICIALIZADA
    .trim();

  return classeNormalizada;
}

/**
 * Normaliza registro para cargos femininos que tocam órgão
 * - Força instrumento como "ÓRGÃO"
 * - Força naipe como "TECLADO"
 * - Normaliza classe_organista
 */
export function normalizarRegistroCargoFeminino(
  cargoNome: string,
  instrumentoNome: string | null | undefined,
  classeOrganista: string | null | undefined
): {
  instrumentoNome: string | null;
  naipeInstrumento: string | null;
  classeOrganista: string | null;
  isNormalizado: boolean;
} {
  const isCargoFeminino = isCargoFemininoOrganista(cargoNome);

  if (isCargoFeminino) {
    return {
      instrumentoNome: 'ÓRGÃO',
      naipeInstrumento: 'TECLADO',
      classeOrganista: normalizarClasseOrganista(classeOrganista) || 'OFICIALIZADA',
      isNormalizado: true,
    };
  }

  // Para outros cargos, retornar valores originais (null se não houver)
  return {
    instrumentoNome: instrumentoNome || null,
    naipeInstrumento: null, // Será calculado depois usando getNaipeByInstrumento
    classeOrganista: classeOrganista || null,
    isNormalizado: false,
  };
}
