'use client';

import { Card, CardContent } from './Card';
import { cn } from '@/lib/utils';

interface MobileTableProps<T> {
  data: T[];
  columns: {
    key: string;
    label: string;
    render?: (item: T) => React.ReactNode;
  }[];
  className?: string;
}

export function MobileTable<T extends Record<string, any>>({ 
  data, 
  columns, 
  className 
}: MobileTableProps<T>) {
  return (
    <div className={cn('space-y-4', className)}>
      {data.map((item, index) => (
        <Card key={index} className="border-white/10">
          <CardContent className="p-4 space-y-3">
            {columns.map((column) => (
              <div key={column.key} className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-400">{column.label}:</span>
                <div className="text-sm text-white text-right flex-1 ml-4">
                  {column.render ? column.render(item) : item[column.key]}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
