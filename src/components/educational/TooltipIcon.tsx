import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TooltipIconProps {
  className?: string;
  animate?: boolean;
}

export const TooltipIcon = ({ className, animate = false }: TooltipIconProps) => {
  return (
    <Info
      className={cn(
        'w-4 h-4 text-blue-500 cursor-help transition-all',
        animate && 'animate-pulse',
        className
      )}
    />
  );
};
