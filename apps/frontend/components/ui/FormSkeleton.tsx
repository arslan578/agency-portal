import { Skeleton } from './Skeleton';
import { cn } from '@/lib/utils';

interface FormSkeletonProps {
  className?: string;
  fields?: number;
  showSubmit?: boolean;
}

export function FormSkeleton({ 
  className,
  fields = 4,
  showSubmit = true
}: FormSkeletonProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      {showSubmit && (
        <div className="flex gap-3 pt-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      )}
    </div>
  );
}
