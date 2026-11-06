const labels: Record<string, string> = {
  ACTIVE: 'Activo', EXHAUSTED: 'Agotado', CANCELLED: 'Cancelado',
  PAID: 'Pagado', PENDING: 'Pendiente', REFUNDED: 'Reembolsado',
  PARTIALLY_REFUNDED: 'Parcialmente reembolsado', PARTIALLY_PAID: 'Parcialmente pagado',
  FULFILLED: 'Completado', UNFULFILLED: 'Sin completar',
  CREDIT: 'Abono', DEBIT: 'Cargo', DRAFT: 'Borrador', ARCHIVED: 'Archivado',
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/(\d),(?=\d)/g, '$1.').replace(/\s+/g, ' ').trim();
}

function searchValues(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(searchValues);
  if (typeof value === 'object') return Object.values(value).flatMap(searchValues);
  const text = String(value);
  const values = [text];
  if (/^-?\d+(?:\.\d+)?$/.test(text) && Number.isFinite(Number(text))) {
    values.push(Number(text).toFixed(2));
  }
  if (labels[text]) values.push(labels[text]);
  if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      values.push(date.toLocaleDateString('es-ES'), date.toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      }), date.toLocaleDateString('es-ES', {
        day: '2-digit', month: 'short', year: 'numeric',
      }));
    }
  }
  return values;
}

// Match values (including nested notes and items), never object property names.
// Each word can occur in a different field, e.g. a customer's name and a note.
export function matchesSearch(value: unknown, query: string): boolean {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const text = normalize(searchValues(value).join(' '));
  return terms.every(term => text.includes(term));
}
