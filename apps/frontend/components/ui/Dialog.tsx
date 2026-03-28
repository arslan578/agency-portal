import React from 'react';
import { X } from 'lucide-react';

interface DialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
    // Simple implementation relying on children to handle state if controlled, 
    // or just rendering children if uncontrolled (though this basic version expects controlled usage for 'open')
    // For a real implementation, we'd use Radix UI or similar.
    // Here we just pass context or props down if needed, but for simplicity we'll assume children handle layout.

    // Actually, to make it work with the existing usage pattern:
    // <Dialog open={open} onOpenChange={setOpen}> ... </Dialog>

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            {/* We need to pass onOpenChange to children if they need to close it, 
           but in the usage pattern, DialogContent usually contains the close button or overlay click.
           For this mock, we'll just render children. 
           The usage in DriftAlert.tsx uses DialogContent, DialogHeader etc.
       */}
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    // @ts-ignore
                    return React.cloneElement(child, { onOpenChange });
                }
                return child;
            })}
        </div>
    );
}

export function DialogTrigger({ children, asChild, ...props }: any) {
    // In a real implementation this would toggle state. 
    // Since we are mocking and the usage in DriftAlert controls state externally via open/onOpenChange on Dialog,
    // this trigger might be redundant or handled by the parent.
    // However, DriftAlert uses: <Button onClick={() => setOpen(true)}>...
    // It actually DOES NOT use DialogTrigger in the main flow, it uses a separate button.
    // Wait, DriftAlert.tsx imports DialogTrigger but doesn't seem to use it in the main flow?
    // Ah, line 13: DialogTrigger is imported.
    // Line 69: <Button ... onClick={() => setOpen(true)} ...>
    // So DialogTrigger is unused in DriftAlert.tsx?
    // Let's check line 13 again. Yes.
    // But we should export it to avoid import errors.
    return <>{children}</>;
}

export function DialogContent({ children, className = '', onOpenChange }: any) {
    return (
        <div className={`bg-background w-full max-w-lg rounded-xl shadow-lg border p-6 animate-in fade-in zoom-in duration-200 relative ${className}`}>
            {/* Close button */}
            {onOpenChange && (
                <button
                    onClick={() => onOpenChange(false)}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>
            )}
            {children}
        </div>
    );
}

export function DialogHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`flex flex-col space-y-1.5 text-center sm:text-left ${className}`}>{children}</div>;
}

export function DialogFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className}`}>{children}</div>;
}

export function DialogTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <h2 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>{children}</h2>;
}

export function DialogDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <p className={`text-sm text-muted-foreground ${className}`}>{children}</p>;
}
