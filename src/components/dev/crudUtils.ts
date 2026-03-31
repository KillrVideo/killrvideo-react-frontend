import type { DevPanelEntry } from '@/types/devPanel';

export type CrudLetter = 'C' | 'R' | 'U' | 'D';

export function getCrudLetter(entry: DevPanelEntry): CrudLetter {
  const { type, endpoint } = entry.query;
  if (type === 'READ') return 'R';
  if (type === 'DELETE') return 'D';
  if (endpoint.startsWith('PUT')) return 'U';
  return 'C';
}

export const crudColors: Record<CrudLetter, string> = {
  C: 'text-kv-orange',
  R: 'text-kv-teal',
  U: 'text-yellow-400',
  D: 'text-red-400',
};
