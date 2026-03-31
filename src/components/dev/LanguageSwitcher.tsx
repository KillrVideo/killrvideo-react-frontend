import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LanguageExample, LanguageName } from '@/types/devPanel';
import { useDevPanel } from '@/hooks/useDevPanel';

const LANGUAGE_LABELS: Record<LanguageName, string> = {
  python: 'Python',
  java: 'Java',
  nodejs: 'Node.js',
  csharp: 'C#',
  go: 'Go',
};

export const LanguageSwitcher = ({ examples }: { examples: LanguageExample[] }) => {
  const { activeLanguage, setActiveLanguage } = useDevPanel();

  return (
    <Tabs
      value={activeLanguage}
      onValueChange={(v) => setActiveLanguage(v as LanguageName)}
    >
      <TabsList className="bg-kv-surface border-0 h-8">
        {examples.map((ex) => (
          <TabsTrigger
            key={ex.language}
            value={ex.language}
            className="text-xs data-[state=active]:bg-kv-teal data-[state=active]:text-kv-navy text-kv-text-muted"
          >
            {LANGUAGE_LABELS[ex.language]}
          </TabsTrigger>
        ))}
      </TabsList>
      {examples.map((ex) => (
        <TabsContent key={ex.language} value={ex.language} className="mt-2">
          <pre className="bg-[#0D0D1F] rounded-lg p-4 overflow-x-auto text-sm font-mono leading-relaxed">
            <code className="text-kv-text-light">{ex.code}</code>
          </pre>
        </TabsContent>
      ))}
    </Tabs>
  );
};
