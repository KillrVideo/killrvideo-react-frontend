import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDevPanel } from '@/hooks/useDevPanel';
import { devPanelData } from '@/data/devPanelData';
import type { DevPanelEntry } from '@/types/devPanel';
import { getCrudLetter, crudColors, type CrudLetter } from './crudUtils';
import { QueryMetadataBar } from './QueryMetadataBar';
import { QueryDisplay } from './QueryDisplay';
import { SchemaBlock } from './SchemaBlock';
import { LanguageSwitcher } from './LanguageSwitcher';
import { GuidedTourBanner } from './GuidedTourBanner';

function matchRoute(pathname: string): string[] {
  if (devPanelData.routeMap[pathname]) {
    return devPanelData.routeMap[pathname];
  }
  for (const [pattern, keys] of Object.entries(devPanelData.routeMap)) {
    const regex = new RegExp(
      '^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$'
    );
    if (regex.test(pathname)) {
      return keys;
    }
  }
  return [];
}

const crudLabels: Record<CrudLetter, string> = {
  C: 'Create',
  R: 'Read',
  U: 'Update',
  D: 'Delete',
};

const EntrySection = ({ entry, currentEntryKeys }: { entry: DevPanelEntry; currentEntryKeys: string[] }) => (
  <div id={`dev-entry-${entry.key}`} className="space-y-5 scroll-mt-4">
    <h3 className="text-sm font-semibold text-kv-text-light">{entry.label}</h3>
    <QueryMetadataBar entry={entry} currentEntryKeys={currentEntryKeys} />
    <QueryDisplay query={entry.query} />
    <SchemaBlock schema={entry.schema} />
    <div>
      <h4 className="text-xs font-semibold text-kv-text-muted uppercase tracking-wider mb-2">
        Driver Examples
      </h4>
      <LanguageSwitcher examples={entry.languageExamples} />
    </div>
  </div>
);

const DevPanel = () => {
  const { isDevMode } = useDevPanel();
  const { pathname } = useLocation();
  const [activeFilter, setActiveFilter] = useState<CrudLetter | null>(null);

  if (!isDevMode) return null;

  const entryKeys = matchRoute(pathname);
  const entries = entryKeys
    .map((key) => devPanelData.entries[key])
    .filter(Boolean);

  // Count entries per CRUD category for this route
  const crudCounts: Record<CrudLetter, number> = { C: 0, R: 0, U: 0, D: 0 };
  for (const entry of entries) {
    crudCounts[getCrudLetter(entry)]++;
  }

  // Filter entries by active CRUD tab
  const filteredEntries = activeFilter
    ? entries.filter((e) => getCrudLetter(e) === activeFilter)
    : entries;

  return (
    <div className="h-full bg-kv-navy overflow-y-auto">
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2 border-b border-kv-surface pb-3">
          <div className="h-2 w-2 rounded-full bg-kv-teal animate-pulse" />
          <h2 className="text-sm font-semibold text-kv-text-light uppercase tracking-wider">
            Developer Panel
          </h2>
        </div>

        <GuidedTourBanner />

        {entries.length > 0 ? (
          <>
            {/* CRUD summary bar */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {(['C', 'R', 'U', 'D'] as CrudLetter[]).filter((letter) => crudCounts[letter] > 0).map((letter) => {
                  const isActive = activeFilter === letter;
                  return (
                    <button
                      key={letter}
                      onClick={() => setActiveFilter(isActive ? null : letter)}
                      className={`
                        flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer
                        ${isActive
                          ? `bg-kv-surface ${crudColors[letter]} ring-1 ring-current`
                          : `bg-kv-surface/40 ${crudColors[letter]} hover:bg-kv-surface/70`
                        }
                      `}
                    >
                      {crudLabels[letter]}
                      <span className="opacity-70">{crudCounts[letter]}</span>
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] text-kv-text-muted">{entries.length} {entries.length === 1 ? 'query' : 'queries'}</span>
            </div>

            {/* Filtered entries */}
            <div className="space-y-8">
              {filteredEntries.map((entry) => (
                <EntrySection key={entry.key} entry={entry} currentEntryKeys={entryKeys} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-kv-text-muted italic">
            Interact with the app to see database queries.
          </p>
        )}
      </div>
    </div>
  );
};

export default DevPanel;
