import type { OrderLineItem } from '../types/order';

export function blockedRestockTitles(lines: OrderLineItem[]) {
  return lines.filter(line => !line.variant?.inventoryItem?.tracked || !line.variant.inventoryItem.id).map(line => line.title);
}
