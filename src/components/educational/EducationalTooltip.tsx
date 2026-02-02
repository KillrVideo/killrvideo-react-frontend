import { useState } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipPortal } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useTooltipContent } from '@/hooks/useTooltipContent';
import { TooltipIcon } from './TooltipIcon';
import { LazyMarkdownRenderer } from './LazyMarkdownRenderer';
import { ExplainerModal } from './ExplainerModal';
import { Loader2, BookOpen } from 'lucide-react';

interface EducationalTooltipProps {
  id: string;
  children: React.ReactNode;
  showIcon?: boolean;
  iconClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

export const EducationalTooltip = ({
  id,
  children,
  showIcon = false,
  iconClassName,
  side = 'top',
  align = 'center',
}: EducationalTooltipProps) => {
  const { guidedTourEnabled } = useAuth();
  const { metadata, content, isLoading, error } = useTooltipContent(id);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // If guided tour is disabled, just render children without tooltip
  if (!guidedTourEnabled) {
    return <>{children}</>;
  }

  // If tooltip metadata not found or error, render children without tooltip
  if (!metadata || error) {
    if (error) {
      console.warn(`Educational tooltip error for "${id}":`, error.message);
    }
    return <>{children}</>;
  }

  const hasExplainer = metadata?.explainerSource?.file;

  return (
    <>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-2 cursor-help">
            {children}
            {showIcon && <TooltipIcon className={iconClassName} />}
          </span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side={side}
            align={align}
            className="max-w-2xl p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl z-[9999] relative"
            sideOffset={8}
          >
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading educational content...</span>
              </div>
            ) : (
              <>
                <LazyMarkdownRenderer
                  content={content}
                  title={metadata.title}
                />
                {hasExplainer && (
                  <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <Button
                      variant="link"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsModalOpen(true);
                      }}
                      className="gap-2 text-blue-600 hover:text-blue-700 p-0 h-auto"
                    >
                      <BookOpen className="w-4 h-4" />
                      Learn More (Full Documentation)
                    </Button>
                  </div>
                )}
              </>
            )}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>

      {hasExplainer && (
        <ExplainerModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          explainerPath={metadata.explainerSource.file}
          title={metadata.title}
        />
      )}
    </>
  );
};
