'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Users2, ChevronDown, Check, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useClients } from '@/hooks/useAgencyApi';
import type { Client } from '@/lib/api/contracts';
import Link from 'next/link';

export function ClientSwitcher() {
  const { data: session } = useSession();
  const { clients, error, isLoading, refresh } = useClients();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (clients.length > 0 && !selected) setSelected(clients[0]);
  }, [clients, selected]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!session?.user?.agencyId) return null;

  const handleSwitch = (client: Client) => {
    setSelected(client);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-secondary border border-border",
          "hover:bg-surface-secondary transition-colors text-sm",
          "focus:outline-none focus:ring-2 focus:ring-teal-deep/20",
        )}
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-teal-deep/30 to-teal-deep/10 flex items-center justify-center shrink-0">
          {isLoading ? (
            <Loader2 className="h-3 w-3 text-teal-deep animate-spin" />
          ) : selected ? (
            <span className="text-[10px] font-semibold text-teal-deep">{selected.name.charAt(0).toUpperCase()}</span>
          ) : (
            <Users2 className="h-3 w-3 text-text-muted" />
          )}
        </div>
        <span className="font-medium text-text-primary truncate max-w-[120px]">
          {selected?.name || 'Select client'}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-text-muted/50 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 w-64 rounded-xl border border-border bg-white shadow-2xl z-50 overflow-hidden">
          <div className="p-2 border-b border-border">
            <p className="px-2 text-[10px] font-semibold text-text-muted/50 uppercase tracking-widest">Switch Client</p>
          </div>

          {error ? (
            <div className="px-4 py-6 text-center">
              <AlertCircle className="h-5 w-5 text-red-400 mx-auto mb-2" />
              <p className="text-xs text-red-400 mb-2">Failed to load clients</p>
              <button onClick={() => refresh()} className="text-xs text-teal-deep hover:underline">Retry</button>
            </div>
          ) : clients.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Users2 className="h-5 w-5 text-text-muted/40 mx-auto mb-2" />
              <p className="text-xs text-text-muted mb-2">No clients yet</p>
              <Link href="/clients" className="text-xs text-teal-deep hover:underline">Add your first client</Link>
            </div>
          ) : (
            <div className="max-h-[280px] overflow-y-auto p-1">
              {clients.map(client => {
                const isActive = selected?.id === client.id;
                return (
                  <button
                    key={client.id}
                    onClick={() => handleSwitch(client)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                      isActive ? "bg-teal-deep/10" : "hover:bg-white/5"
                    )}
                  >
                    <div className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                      isActive ? "bg-teal-deep/20 text-teal-deep" : "bg-white/5 text-text-muted"
                    )}>
                      {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm truncate", isActive ? "font-medium text-text-primary" : "text-text-primary/80")}>
                        {client.name}
                      </p>
                      {!client.is_active && <span className="text-[10px] text-amber-400">Inactive</span>}
                    </div>
                    {isActive && <Check className="h-4 w-4 text-teal-deep shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="p-2 border-t border-border">
            <Link
              href="/clients"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
            >
              Manage clients
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
