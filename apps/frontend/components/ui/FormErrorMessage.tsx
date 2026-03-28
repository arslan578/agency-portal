import { XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormErrorMessageProps {
  message: string;
  className?: string;
}

export function FormErrorMessage({ message, className }: FormErrorMessageProps) {
  return (
    <p className={cn('text-sm text-red-400 flex items-center gap-1', className)}>
      <XCircle className="h-4 w-4 flex-shrink-0" />
      {message}
    </p>
  );
}
