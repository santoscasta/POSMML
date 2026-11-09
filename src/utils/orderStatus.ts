import type { Order } from '../types/order';
import { es } from '../i18n/es';

export function orderStatusLabel(order: Pick<Order, 'cancelledAt' | 'closed'>): string {
  if (order.cancelledAt) return es.orders.cancelled;
  if (order.closed === true) return es.orders.archived;
  if (order.closed === false) return es.orders.open;
  return '—';
}
