import { useState, useCallback, useEffect } from 'react';
import { FilterValue } from '@/components/ui/AdvancedFilter';

export interface FilterPreset {
  name: string;
  values: FilterValue;
}

export function useFilters(initialFilters: FilterValue = {}) {
  const [filters, setFilters] = useState<FilterValue>(initialFilters);
  const [presets, setPresets] = useState<FilterPreset[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kaivo_filter_presets');
      if (saved) {
        try {
          setPresets(JSON.parse(saved));
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, []);

  const updateFilter = useCallback((key: string, value: string | string[]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const removeFilter = useCallback((key: string) => {
    setFilters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setFilters({});
  }, []);

  const savePreset = useCallback((name: string) => {
    const preset: FilterPreset = { name, values: filters };
    const newPresets = [...presets, preset];
    setPresets(newPresets);
    if (typeof window !== 'undefined') {
      localStorage.setItem('kaivo_filter_presets', JSON.stringify(newPresets));
    }
  }, [filters, presets]);

  const applyPreset = useCallback((preset: FilterPreset) => {
    setFilters(preset.values);
  }, []);

  return {
    filters,
    presets,
    updateFilter,
    removeFilter,
    clearAll,
    savePreset,
    applyPreset,
    setFilters,
  };
}
