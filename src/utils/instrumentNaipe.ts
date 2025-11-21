// Mapeamento de instrumentos para naipes (do backupcont/app.js)
export const INSTRUMENT_NAIPES: Record<string, string> = {
  VIOLINO: 'CORDAS',
  VIOLA: 'CORDAS',
  VIOLONCELO: 'CORDAS',
  FLAUTA: 'MADEIRAS',
  OBOÉ: 'MADEIRAS',
  "OBOÉ D'AMORE": 'MADEIRAS',
  'CORNE INGLÊS': 'MADEIRAS',
  CLARINETE: 'MADEIRAS',
  'CLARINETE ALTO': 'MADEIRAS',
  'CLARINETE BAIXO (CLARONE)': 'MADEIRAS',
  'CLARINETE CONTRA BAIXO': 'MADEIRAS',
  FAGOTE: 'MADEIRAS',
  'SAXOFONE SOPRANO (RETO)': 'MADEIRAS',
  'SAXOFONE SOPRANINO': 'MADEIRAS',
  'SAXOFONE ALTO': 'MADEIRAS',
  'SAXOFONE TENOR': 'MADEIRAS',
  'SAXOFONE BARÍTONO': 'MADEIRAS',
  'SAXOFONE BAIXO': 'MADEIRAS',
  'SAXOFONE OCTA CONTRABAIXO': 'MADEIRAS',
  'SAX HORN': 'METAIS',
  TROMPA: 'METAIS',
  TROMPETE: 'METAIS',
  CORNET: 'METAIS',
  FLUGELHORN: 'METAIS',
  TROMBONE: 'METAIS',
  TROMBONITO: 'METAIS',
  EUFÔNIO: 'METAIS',
  'BARÍTONO (PISTO)': 'METAIS',
  TUBA: 'METAIS',
  ACORDEON: 'TECLADO',
  ÓRGÃO: 'TECLADO',
};

/**
 * Obtém o naipe do instrumento (seguindo lógica do app.js)
 * @param instrumento Nome do instrumento
 * @returns Naipe do instrumento (CORDAS, MADEIRAS, METAIS, TECLADO) ou null
 */
export function getNaipeByInstrumento(instrumento: string | null | undefined): string {
  if (!instrumento) return '';

  const instrumentoUpper = instrumento.toUpperCase().trim();

  // Busca exata primeiro
  if (INSTRUMENT_NAIPES[instrumentoUpper]) {
    return INSTRUMENT_NAIPES[instrumentoUpper];
  }

  // Busca parcial para instrumentos com variações
  for (const [instrumentoKey, naipe] of Object.entries(INSTRUMENT_NAIPES)) {
    if (instrumentoUpper.includes(instrumentoKey) || instrumentoKey.includes(instrumentoUpper)) {
      return naipe;
    }
  }

  // Se não encontrou, retornar vazio
  return '';
}
