'use client';

import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-[14px] shadow-xl border border-border w-full max-w-[400px] mx-4 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-2">
          <h3 className="text-[15px] font-bold text-text-primary">{title}</h3>
          <p className="text-[13px] text-text-secondary mt-2 leading-relaxed">
            {message}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-4">
          <button
            type="button"
            className="px-4 py-2 rounded-[8px] border border-border text-[13px] font-semibold text-text-secondary hover:bg-surface-secondary transition-colors"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`px-4 py-2 rounded-[8px] text-[13px] font-semibold text-white transition-colors ${
              danger
                ? 'bg-red hover:bg-red/90'
                : 'bg-teal-deep hover:bg-teal-deep/90'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
