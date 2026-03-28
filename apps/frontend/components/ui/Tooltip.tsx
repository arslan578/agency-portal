import React, { useState } from 'react';

export function TooltipProvider({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}

export function Tooltip({ children }: { children: React.ReactNode }) {
    const [visible, setVisible] = useState(false);

    // Simple mock: clone children to pass visibility state
    return (
        <div className="relative inline-block" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    // @ts-ignore
                    return React.cloneElement(child, { visible });
                }
                return child;
            })}
        </div>
    );
}

export function TooltipTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
    return <>{children}</>;
}

export function TooltipContent({ children, visible, className = '' }: { children: React.ReactNode; visible?: boolean; className?: string }) {
    if (!visible) return null;
    return (
        <div className={`absolute z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 top-full mt-2 ${className}`}>
            {children}
        </div>
    );
}
