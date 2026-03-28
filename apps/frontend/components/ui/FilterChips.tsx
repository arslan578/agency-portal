import { X } from 'lucide-react';
import { Badge } from './Badge';
import { Button } from './Button';
import { FilterValue } from './AdvancedFilter';

interface FilterChipsProps {
  filters: FilterValue;
  filterLabels: Record<string, string>;
  onRemove: (key: string) => void;
  onClearAll: () => void;
  className?: string;
}

export function FilterChips({
  filters,
  filterLabels,
  onRemove,
  onClearAll,
  className
}: FilterChipsProps) {
  const activeFilters = Object.entries(filters).filter(([_, value]) => {
    return Array.isArray(value) ? value.length > 0 : value && value.toString().trim() !== '';
  });

  if (activeFilters.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {activeFilters.map(([key, value]) => (
        <Badge key={key} variant="default" className="gap-2">
          <span>
            {filterLabels[key] || key}: {Array.isArray(value) ? value.join(', ') : value}
          </span>
          <button
            onClick={() => onRemove(key)}
            className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
            aria-label={`Remove ${filterLabels[key] || key} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {activeFilters.length > 1 && (
        <Button variant="ghost" size="sm" onClick={onClearAll} className="h-6 text-xs">
          Clear all
        </Button>
      )}
    </div>
  );
}
