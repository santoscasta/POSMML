export type SortDirection = 'asc' | 'desc';

export interface SortConfig<Key extends string> {
  key: Key;
  direction: SortDirection;
}

export function nextSort<Key extends string>(
  current: SortConfig<Key>, key: Key, initial: SortDirection = 'asc',
): SortConfig<Key> {
  return { key, direction: current.key === key ? (current.direction === 'asc' ? 'desc' : 'asc') : initial };
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export function compareSortValues(
  left: string | number | null, right: string | number | null, direction: SortDirection,
): number {
  // Empty values stay at the end in either direction.
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  const result = typeof left === 'number' && typeof right === 'number'
    ? left - right : collator.compare(String(left), String(right));
  return direction === 'asc' ? result : -result;
}
