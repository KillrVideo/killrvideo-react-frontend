import { useDevPanel } from '@/hooks/useDevPanel';
import type { QueryMode } from '@/types/devPanel';

const MODES: { value: QueryMode; label: string }[] = [
  { value: 'cql', label: 'CQL' },
  { value: 'dataapi', label: 'Data API' },
  { value: 'tableapi', label: 'Table API' },
];

export const QueryModeToggle = () => {
  const { queryMode, setQueryMode } = useDevPanel();

  return (
    <div className="inline-flex rounded-lg bg-kv-surface p-0.5">
      {MODES.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setQueryMode(value)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            queryMode === value
              ? 'bg-kv-teal text-kv-navy'
              : 'text-kv-text-muted hover:text-kv-text-light'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
