import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { devPanelData } from '@/data/devPanelData';
import type { DevPanelEntry, QueryType } from '@/types/devPanel';
import { ChevronDown } from 'lucide-react';
import { getCrudLetter, crudColors } from './crudUtils';

const typeStyles: Record<QueryType, string> = {
  READ: 'bg-kv-teal/20 text-kv-teal border-kv-teal/40',
  WRITE: 'bg-kv-orange/20 text-kv-orange border-kv-orange/40',
  DELETE: 'bg-red-500/20 text-red-400 border-red-400/40',
};

interface CrudBadgeProps {
  entry: DevPanelEntry;
  currentEntryKeys: string[];
}

export const CrudBadge = ({ entry, currentEntryKeys }: CrudBadgeProps) => {
  const tableName = entry.schema.tableName;
  const relatedKeys = devPanelData.tableOperations[tableName] ?? [];
  const relatedEntries = relatedKeys
    .map((key) => devPanelData.entries[key])
    .filter(Boolean);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1 cursor-pointer focus:outline-none group">
          <Badge variant="outline" className={`font-mono text-xs ${typeStyles[entry.query.type]} group-hover:ring-1 group-hover:ring-white/20 transition-shadow`}>
            {entry.query.type}
            <ChevronDown className="ml-1 h-3 w-3 opacity-60" />
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="bg-kv-navy border-kv-surface min-w-[280px]"
      >
        <DropdownMenuLabel className="text-kv-text-muted text-xs font-normal">
          Operations on: <span className="font-mono text-kv-text-light">{tableName}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-kv-surface" />
        {relatedEntries.map((related) => {
          const crud = getCrudLetter(related);
          const isCurrent = related.key === entry.key;
          const isOnPage = currentEntryKeys.includes(related.key);

          return (
            <DropdownMenuItem
              key={related.key}
              className={`font-mono text-xs gap-2 ${
                isCurrent
                  ? 'bg-kv-surface/50 text-kv-text-light'
                  : isOnPage
                    ? 'text-kv-text-light cursor-pointer'
                    : 'text-kv-text-muted opacity-60'
              }`}
              onSelect={() => {
                if (isOnPage && !isCurrent) {
                  // Delay scroll until after dropdown fully closes and focus restores
                  setTimeout(() => {
                    document
                      .getElementById(`dev-entry-${related.key}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 300);
                }
              }}
            >
              <span className={`font-bold w-3 ${crudColors[crud]}`}>{crud}</span>
              <span className="truncate">{related.query.endpoint}</span>
              {isCurrent && (
                <span className="ml-auto text-kv-teal text-[10px]">current</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
