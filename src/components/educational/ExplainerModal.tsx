import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { X, ExternalLink } from 'lucide-react';
import { LazyMarkdownRenderer } from './LazyMarkdownRenderer';

interface ExplainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  explainerPath: string | null;
  title: string;
}

export const ExplainerModal = ({
  isOpen,
  onClose,
  explainerPath,
  title,
}: ExplainerModalProps) => {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!isOpen || !explainerPath) {
      return;
    }

    const abortController = new AbortController();

    setIsLoading(true);
    setError(null);

    // Load the full explainer markdown
    fetch(`/${explainerPath}`, { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load explainer: ${response.statusText}`);
        }
        return response.text();
      })
      .then((markdown) => {
        setContent(markdown);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name === 'AbortError') {
          return; // Ignore aborted requests
        }
        console.error('Error loading explainer:', err);
        setError(err);
        setIsLoading(false);
      });

    return () => {
      abortController.abort();
    };
  }, [isOpen, explainerPath]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              <span className="ml-3 text-muted-foreground">
                Loading documentation...
              </span>
            </div>
          )}

          {error && (
            <div className="text-center py-12">
              <p className="text-red-600 mb-4">Failed to load documentation</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          )}

          {!isLoading && !error && content && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <LazyMarkdownRenderer content={content} />
            </div>
          )}
        </ScrollArea>

        <div className="px-6 py-4 border-t bg-muted/50">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              💡 This documentation is maintained in the repository
            </span>
            {explainerPath && (
              <Button variant="link" size="sm" className="gap-2" asChild>
                <a
                  href={`https://github.com/datastax/killrvideo/${explainerPath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on GitHub
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
