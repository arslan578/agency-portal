import { Skeleton } from './Skeleton';
import { cn } from '@/lib/utils';

interface CardSkeletonProps {
  className?: string;
  showHeader?: boolean;
  showFooter?: boolean;
  lines?: number;
}

export function CardSkeleton({ 
  className,
  showHeader = true,
  showFooter = false,
  lines = 3
}: CardSkeletonProps) {
  return (
    <div className={cn('p-6 border border-white/10 rounded-lg bg-card', className)}>
      {showHeader && (
        <div className="mb-4 space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
      {showFooter && (
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      )}
    </div>
  );
}
