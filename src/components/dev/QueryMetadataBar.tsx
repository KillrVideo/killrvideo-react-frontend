import type { DevPanelEntry } from '@/types/devPanel';
import { CrudBadge } from './CrudBadge';
import { EndpointBadge } from './EndpointBadge';
import { SourceFileLink } from './SourceFileLink';

interface QueryMetadataBarProps {
  entry: DevPanelEntry;
  currentEntryKeys: string[];
}

export const QueryMetadataBar = ({ entry, currentEntryKeys }: QueryMetadataBarProps) => (
  <div className="flex flex-wrap items-center gap-3 py-2">
    <CrudBadge entry={entry} currentEntryKeys={currentEntryKeys} />
    <EndpointBadge endpoint={entry.query.endpoint} />
    <SourceFileLink sourceFile={entry.query.sourceFile} />
  </div>
);
