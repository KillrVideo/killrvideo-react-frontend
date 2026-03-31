import { ExternalLink } from 'lucide-react';

const GITHUB_BASE = 'https://github.com/KillrVideo/killrvideo-react-frontend/blob/main/';

export const SourceFileLink = ({ sourceFile }: { sourceFile: string }) => {
  const [file, line] = sourceFile.split(':');
  const href = `${GITHUB_BASE}${file}${line ? `#L${line}` : ''}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-mono text-kv-text-muted hover:text-kv-teal transition-colors"
    >
      {sourceFile}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
};
