import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';
import { Card, CardContent } from './Card';
import { cn } from '@/lib/utils';

interface ErrorDisplayProps {
  error: Error | string;
  title?: string;
  onRetry?: () => void;
  showDetails?: boolean;
  className?: string;
}

export function ErrorDisplay({ 
  error, 
  title = 'Error',
  onRetry,
  showDetails = false,
  className
}: ErrorDisplayProps) {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'object' && error instanceof Error ? error.stack : undefined;

  return (
    <Card className={cn('border-red-500/20 bg-red-500/5', className)}>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-400" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-red-400 mb-2">{title}</h3>
            <p className="text-gray-300 mb-4">{errorMessage}</p>
            {showDetails && errorStack && (
              <details className="mb-4">
                <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
                  Show details
                </summary>
                <pre className="mt-2 text-xs text-gray-500 bg-black/20 p-3 rounded overflow-auto">
                  {errorStack}
                </pre>
              </details>
            )}
            {onRetry && (
              <Button onClick={onRetry} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
