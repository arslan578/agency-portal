import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="glass-card rounded-2xl border p-16 flex flex-col items-center justify-center text-center">
      {Icon && (
        <div className="h-14 w-14 bg-teal-deep/10 rounded-2xl border border-teal-deep/20 flex items-center justify-center mb-5">
          <Icon className="h-7 w-7 text-teal-deep/60" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
      <p className="text-sm text-text-muted max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}
