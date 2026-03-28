'use client';

import { useState, useEffect, useMemo } from 'react';
import { Command, Search, X } from 'lucide-react';
import { Card, CardContent } from './Card';
import { Input } from './Input';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  href?: string;
  action?: () => void;
  category?: string;
}

interface CommandPaletteProps {
  items: CommandItem[];
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ items, isOpen, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const query = search.toLowerCase();
    return items.filter(item =>
      item.label.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.category?.toLowerCase().includes(query)
    );
  }, [items, search]);

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // Toggle handled by parent
      }
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
        e.preventDefault();
        const item = filteredItems[selectedIndex];
        if (item.href) {
          router.push(item.href);
          onClose();
        } else if (item.action) {
          item.action();
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, router, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-2xl border-white/20 bg-card/95 backdrop-blur-lg shadow-2xl">
        <CardContent className="p-0">
          <div className="flex items-center border-b border-white/10 px-4">
            <Search className="h-5 w-5 text-gray-400 mr-3" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Type a command or search..."
              className="border-0 focus-visible:ring-0 bg-transparent flex-1"
              autoFocus
            />
            <button
              onClick={onClose}
              className="ml-2 p-1 rounded hover:bg-white/10 transition-colors"
              aria-label="Close command palette"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <p>No results found</p>
              </div>
            ) : (
              <div className="py-2">
                {filteredItems.map((item, index) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.href) {
                        router.push(item.href);
                        onClose();
                      } else if (item.action) {
                        item.action();
                        onClose();
                      }
                    }}
                    className={cn(
                      'w-full px-4 py-3 text-left hover:bg-white/10 transition-colors flex items-center justify-between',
                      index === selectedIndex && 'bg-white/10'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white">{item.label}</p>
                      {item.description && (
                        <p className="text-sm text-gray-400 truncate">{item.description}</p>
                      )}
                    </div>
                    {item.category && (
                      <span className="text-xs text-gray-500 ml-4">{item.category}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-white/10 px-4 py-2 text-xs text-gray-400 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">↓</kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">Enter</kbd>
                Select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-xs">Esc</kbd>
              Close
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
