import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorDisplay({ title = 'Something went wrong', message, onRetry }: ErrorDisplayProps) {
  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
          <AlertCircle className="h-5 w-5 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-red-400 mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground mb-3">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 bg-white/5 text-foreground hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
