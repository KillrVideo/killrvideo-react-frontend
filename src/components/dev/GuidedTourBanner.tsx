import { useState } from 'react';
import { Sparkles, Copy, Check } from 'lucide-react';

export const GuidedTourBanner = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const res = await fetch('/developer-context.md');
    const text = await res.text();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <button
        onClick={handleCopy}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-kv-surface/50 border border-kv-surface hover:border-kv-teal/30 transition-colors cursor-pointer"
      >
        <Sparkles className="h-4 w-4 text-kv-gold shrink-0" />
        <span className="text-xs font-medium text-kv-text-light flex-1 text-left">
          Copy Prompt to Build a Feature
        </span>
        {copied ? (
          <Check className="h-4 w-4 text-green-400 shrink-0" />
        ) : (
          <Copy className="h-4 w-4 text-kv-text-muted shrink-0" />
        )}
      </button>
      <p className="text-[10px] leading-snug text-kv-text-muted px-1">
        Use this with an AI coding assistant to understand the files, API calls, and Cassandra queries behind this feature and contribute changes safely.
      </p>
    </div>
  );
};
