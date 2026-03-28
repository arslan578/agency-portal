'use client';

import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from './Button';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { Input } from './Input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './Select';
import { cn } from '@/lib/utils';

export interface FilterOption {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'multiselect';
  options?: { value: string; label: string }[];
}

export interface FilterValue {
  [key: string]: string | string[];
}

interface AdvancedFilterProps {
  options: FilterOption[];
  values: FilterValue;
  onChange: (values: FilterValue) => void;
  onReset: () => void;
  presets?: { name: string; values: FilterValue }[];
  onPresetSelect?: (preset: FilterValue) => void;
}

export function AdvancedFilter({
  options,
  values,
  onChange,
  onReset,
  presets,
  onPresetSelect
}: AdvancedFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = (key: string, value: string | string[]) => {
    onChange({ ...values, [key]: value });
  };

  const removeFilter = (key: string) => {
    const newValues = { ...values };
    delete newValues[key];
    onChange(newValues);
  };

  const activeFiltersCount = Object.keys(values).filter(key => {
    const value = values[key];
    return Array.isArray(value) ? value.length > 0 : value && value.toString().trim() !== '';
  }).length;

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2"
      >
        <Filter className="h-4 w-4" />
        Filter
        {activeFiltersCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-primary text-black text-xs font-semibold rounded-full">
            {activeFiltersCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <Card className="absolute right-0 mt-2 w-80 z-50 border-white/20 bg-card/95 backdrop-blur-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg">Filters</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {presets && presets.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-400">Presets</p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (onPresetSelect) {
                            onPresetSelect(preset.values);
                          }
                        }}
                      >
                        {preset.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {options.map((option) => (
                  <div key={option.key}>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                      {option.label}
                    </label>
                    {option.type === 'text' && (
                      <Input
                        value={(values[option.key] as string) || ''}
                        onChange={(e) => updateFilter(option.key, e.target.value)}
                        placeholder={`Filter by ${option.label.toLowerCase()}`}
                      />
                    )}
                    {option.type === 'select' && option.options && (
                      <Select
                        value={(values[option.key] as string) || ''}
                        onValueChange={(value) => updateFilter(option.key, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={`Select ${option.label.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {option.options.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {values[option.key] && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFilter(option.key)}
                        className="mt-1 text-xs"
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {activeFiltersCount > 0 && (
                <Button variant="outline" onClick={onReset} className="w-full">
                  Clear All Filters
                </Button>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
