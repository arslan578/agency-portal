import React, { useState, createContext, useContext, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface SelectContextType {
    value: string;
    onChange: (value: string) => void;
    open: boolean;
    setOpen: (open: boolean) => void;
    triggerElement: HTMLElement | null;
    setTriggerElement: (element: HTMLElement | null) => void;
}

const SelectContext = createContext<SelectContextType | undefined>(undefined);

export function Select({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [triggerElement, setTriggerElement] = useState<HTMLElement | null>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        if (!open) return;
        
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const content = document.querySelector('[data-select-content]');
            
            if (triggerElement && content) {
                if (!triggerElement.contains(target) && !content.contains(target)) {
                    setOpen(false);
                }
            } else if (containerRef.current && !containerRef.current.contains(target)) {
                setOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        // Use timeout to avoid immediate closure
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 0);

        document.addEventListener('keydown', handleEscape);
        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [open, triggerElement]);

    return (
        <SelectContext.Provider value={{ value, onChange: onValueChange, open, setOpen, triggerElement, setTriggerElement }}>
            <div ref={containerRef} className="relative" data-select-container>{children}</div>
        </SelectContext.Provider>
    );
}

export function SelectTrigger({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    const context = useContext(SelectContext);
    const buttonRef = useRef<HTMLButtonElement>(null);
    
    if (!context) throw new Error("SelectTrigger must be used within Select");

    useEffect(() => {
        if (buttonRef.current) {
            context.setTriggerElement(buttonRef.current);
        }
        return () => {
            context.setTriggerElement(null);
        };
    }, [context]);

    return (
        <button
            ref={buttonRef}
            data-select-trigger
            className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
            onClick={() => context.setOpen(!context.open)}
        >
            {children}
            <ChevronDown className={`h-4 w-4 opacity-50 transition-transform duration-200 ${context.open ? 'rotate-180' : ''}`} />
        </button>
    );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
    const context = useContext(SelectContext);
    if (!context) throw new Error("SelectValue must be used within Select");

    return <span>{context.value || placeholder}</span>;
}

export function SelectContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    const context = useContext(SelectContext);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
    const [mounted, setMounted] = useState(false);

    if (!context) throw new Error("SelectContent must be used within Select");

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (context.open && mounted && context.triggerElement) {
            const updatePosition = () => {
                const trigger = context.triggerElement;
                if (trigger) {
                    const rect = trigger.getBoundingClientRect();
                    setPosition({
                        top: rect.bottom + window.scrollY + 4,
                        left: rect.left + window.scrollX,
                        width: rect.width
                    });
                }
            };

            updatePosition();
            const scrollHandler = () => updatePosition();
            const resizeHandler = () => updatePosition();

            window.addEventListener('scroll', scrollHandler, true);
            window.addEventListener('resize', resizeHandler);

            return () => {
                window.removeEventListener('scroll', scrollHandler, true);
                window.removeEventListener('resize', resizeHandler);
            };
        }
    }, [context.open, mounted, context.triggerElement]);

    if (!context.open || !mounted) return null;

    const content = (
        <div 
            data-select-content
            className={`fixed z-[99999] min-w-[8rem] max-h-[300px] overflow-y-auto rounded-lg border border-border bg-card backdrop-blur-md text-foreground shadow-2xl shadow-black/50 ${className}`}
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
                width: `${Math.max(position.width, 200)}px`,
            }}
        >
            <div className="p-1">{children}</div>
        </div>
    );

    if (typeof window !== 'undefined' && document.body) {
        return createPortal(content, document.body);
    }

    return null;
}

export function SelectItem({ value, children, className = '' }: { value: string; children: React.ReactNode; className?: string }) {
    const context = useContext(SelectContext);
    if (!context) throw new Error("SelectItem must be used within Select");

    const isSelected = context.value === value;

    return (
        <div
            className={`relative flex w-full cursor-pointer select-none items-center rounded-md py-2.5 px-3 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50 hover:bg-muted/80 focus:bg-muted/80 ${
                isSelected ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
            } ${className}`}
            onClick={() => {
                context.onChange(value);
                context.setOpen(false);
            }}
        >
            {children}
        </div>
    );
}
