import { Badge } from '@/components/ui/badge';
import type { TableSchema, SchemaColumn } from '@/types/devPanel';

const KeyBadge = ({ column }: { column: SchemaColumn }) => {
  if (column.keyType === 'partition') {
    return (
      <Badge variant="outline" className="text-[10px] bg-kv-orange/20 text-kv-orange border-kv-orange/40">
        PK
      </Badge>
    );
  }
  if (column.keyType === 'clustering') {
    const arrow = column.sortDirection === 'desc' ? '↓' : '↑';
    return (
      <Badge variant="outline" className="text-[10px] bg-kv-teal/20 text-kv-teal border-kv-teal/40">
        CK {arrow}
      </Badge>
    );
  }
  return null;
};

export const SchemaBlock = ({ schema }: { schema: TableSchema }) => (
  <div>
    <h4 className="text-xs font-semibold text-kv-text-muted uppercase tracking-wider mb-2">
      Schema: <span className="text-kv-teal font-mono normal-case">{schema.tableName}</span>
    </h4>
    <div className="bg-[#0D0D1F] rounded-lg overflow-hidden">
      {schema.columns.map((col, i) => (
        <div
          key={col.name}
          className={`flex items-center gap-3 px-4 py-1.5 text-xs font-mono ${
            i % 2 === 0 ? 'bg-[#0D0D1F]' : 'bg-kv-surface/50'
          }`}
        >
          <span className="text-kv-text-light w-40 shrink-0">{col.name}</span>
          <span className="text-kv-text-muted w-28 shrink-0">{col.type}</span>
          <KeyBadge column={col} />
        </div>
      ))}
    </div>
    <p className="text-xs text-kv-text-muted mt-2 italic leading-relaxed">
      {schema.description}
    </p>
  </div>
);
