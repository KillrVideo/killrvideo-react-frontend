import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const TooltipMarkdownContent = lazy(() => import('./TooltipMarkdownContent'));

interface LazyMarkdownRendererProps {
  content: string;
  title?: string;
  className?: string;
}

export const LazyMarkdownRenderer = ({
  content,
  title,
  className,
}: LazyMarkdownRendererProps) => (
  <Suspense
    fallback={
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    }
  >
    <TooltipMarkdownContent content={content} title={title} className={className} />
  </Suspense>
);
