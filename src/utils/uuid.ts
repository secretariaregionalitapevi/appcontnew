/**
 * Gera UUID v4 válido para uso no Supabase
 * Baseado na implementação do backupcont/app.js
 */
export function uuidv4(): string {
  try {
    // MÉTODO 1: crypto.randomUUID (mais confiável, disponível em navegadores modernos e Node.js 14.17+)
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      const uuid = crypto.randomUUID();
      if (isValidUUID(uuid)) {
        return uuid;
      }
    }

    // MÉTODO 2: crypto.getRandomValues (fallback para navegadores mais antigos)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);

      // Versão 4 UUID: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 10

      const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const uuid = [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
      ].join('-');

      if (isValidUUID(uuid)) {
        return uuid;
      }
    }

    // MÉTODO 3: Fallback usando Math.random (menos seguro, mas funciona)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  } catch (error) {
    console.error('Erro ao gerar UUID:', error);
    // Último recurso: UUID fixo válido (não deve acontecer, mas garante que sempre retorna algo válido)
    return '00000000-0000-4000-8000-000000000000';
  }
}

/**
 * Valida se uma string é um UUID v4 válido
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
