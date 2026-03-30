'use client';

interface ApiErrorBannerProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}

export function ApiErrorBanner({ error, onRetry, title }: ApiErrorBannerProps) {
  if (!error) return null;

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message: string }).message
      : typeof error === 'string'
        ? error
        : 'Something went wrong. Please try again.';

  return (
    <div className="rounded-xl border-2 border-red/20 bg-red-light p-4 flex items-start gap-3">
      <span className="text-red text-[18px] leading-none mt-0.5" aria-hidden>⚠</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-red">{title ?? 'Error loading data'}</p>
        <p className="text-[12px] text-text-secondary mt-0.5 leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 px-3 py-1.5 rounded-lg border-2 border-red/30 bg-white text-[12px] font-semibold text-red hover:bg-red-light transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
