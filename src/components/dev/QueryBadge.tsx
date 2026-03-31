import { Badge } from '@/components/ui/badge';
import type { QueryType } from '@/types/devPanel';

const typeStyles: Record<QueryType, string> = {
  READ: 'bg-kv-teal/20 text-kv-teal border-kv-teal/40',
  WRITE: 'bg-kv-orange/20 text-kv-orange border-kv-orange/40',
  DELETE: 'bg-red-500/20 text-red-400 border-red-400/40',
};

export const QueryBadge = ({ type }: { type: QueryType }) => (
  <Badge variant="outline" className={`font-mono text-xs ${typeStyles[type]}`}>
    {type}
  </Badge>
);
