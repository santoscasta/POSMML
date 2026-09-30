import { PosError } from './operationStore.js';
import { allGiftCards } from './voucherIssue.js';

export function voucherSuffix(value) {
  const code = String(value || '').replace(/\s/g, '').slice(-4).toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) throw new PosError('Introduce el código del vale o sus últimos cuatro caracteres');
  return code;
}

export async function lookupVoucher(gql, value, fields) {
  const code = voucherSuffix(value);
  const cards = await allGiftCards(gql, fields, 100, code);
  const matches = cards.filter(card => card.lastCharacters?.toLowerCase() === code);
  if (!matches.length) throw new PosError('Vale no encontrado', 404);
  if (matches.length !== 1) throw new PosError('Hay varios vales con esos últimos caracteres. Revisa el vale antes de cobrar.', 409);
  return matches[0];
}
