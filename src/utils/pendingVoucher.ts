import type { IssueVoucherInput } from '../types/voucher';
export const PENDING_VOUCHER_KEY = 'pos.pending-voucher.v1';
export interface PendingVoucher { operationId: string; input: IssueVoucherInput }
export function readPendingVoucher(): PendingVoucher | null {
  const value = localStorage.getItem(PENDING_VOUCHER_KEY);
  if (!value) return null;
  try { return JSON.parse(value) as PendingVoucher; }
  catch { throw new Error('No se pudo leer el vale pendiente. Recupéralo desde Operaciones pendientes.'); }
}
