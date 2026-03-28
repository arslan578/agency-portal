import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva(
    "relative w-full rounded-lg border p-4 shadow-sm transition-all [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
    {
        variants: {
            variant: {
                default: "bg-background text-foreground border-border",
                destructive:
                    "border-red-500/50 text-red-900 dark:text-red-200 dark:border-red-800 dark:bg-red-900/20 bg-red-50",
                success:
                    "border-green-500/50 text-green-900 dark:text-green-200 dark:border-green-800 dark:bg-green-900/20 bg-green-50",
                warning:
                    "border-yellow-500/50 text-yellow-900 dark:text-yellow-200 dark:border-yellow-800 dark:bg-yellow-900/20 bg-yellow-50",
                info:
                    "border-blue-500/50 text-blue-900 dark:text-blue-200 dark:border-blue-800 dark:bg-blue-900/20 bg-blue-50",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
);

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
    children: React.ReactNode;
}

export function Alert({ children, variant = 'default', className = '', ...props }: AlertProps) {
    return (
        <div className={cn(alertVariants({ variant }), "flex items-start gap-4", className)} role="alert" {...props}>
            {children}
        </div>
    );
}

export function AlertTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <h5 className={cn("mb-1 font-medium leading-none tracking-tight", className)}>{children}</h5>;
}

export function AlertDescription({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={cn("text-sm [&_p]:leading-relaxed", className)}>{children}</div>;
}
