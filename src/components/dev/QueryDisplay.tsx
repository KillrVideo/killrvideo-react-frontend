import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { DevPanelQuery } from '@/types/devPanel';
import { useDevPanel } from '@/hooks/useDevPanel';
import { QueryModeToggle } from './QueryModeToggle';

function highlightCql(cql: string): string {
  const keywords = /\b(SELECT|FROM|WHERE|ORDER BY|DESC|ASC|LIMIT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|AND|IN|IF|NOT|EXISTS|CREATE|TABLE|PRIMARY KEY|COUNTER)\b/gi;
  return cql
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(keywords, '<span class="text-kv-orange">$&</span>')
    .replace(/\?/g, '<span class="text-kv-teal">?</span>')
    .replace(/'[^']*'/g, '<span class="text-green-400">$&</span>');
}

export const QueryDisplay = ({ query }: { query: DevPanelQuery }) => {
  const { queryMode } = useDevPanel();
  const [copied, setCopied] = useState(false);

  const displayText =
    queryMode === 'cql'
      ? query.cql
      : queryMode === 'dataapi'
        ? JSON.stringify(query.dataApiBody, null, 2)
        : JSON.stringify(query.tableApiBody, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <QueryModeToggle />
        <button
          onClick={handleCopy}
          className="p-1.5 rounded text-kv-text-muted hover:text-kv-text-light hover:bg-kv-surface transition-colors"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <pre className="bg-[#0D0D1F] rounded-lg p-4 overflow-x-auto text-sm font-mono leading-relaxed">
        {queryMode === 'cql' ? (
          <code
            className="text-kv-text-light"
            dangerouslySetInnerHTML={{ __html: highlightCql(query.cql) }}
          />
        ) : (
          <code className="text-kv-text-light">{displayText}</code>
        )}
      </pre>
    </div>
  );
};
