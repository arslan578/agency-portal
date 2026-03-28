import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
    'rounded-lg border bg-card text-card-foreground shadow-sm transition-all',
    {
        variants: {
            variant: {
                default: 'border-kaivo-aqua/40 dark:border-border',
                elevated: 'border-border shadow-md hover:shadow-lg',
                outlined: 'border-border bg-transparent',
                subtle: 'border-border/50 bg-muted/50',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

interface CardProps extends React.ComponentPropsWithoutRef<'div'>, VariantProps<typeof cardVariants> {
    className?: string;
    children?: React.ReactNode;
}

export function Card({ children, className = '', variant, ...props }: CardProps) {
    return (
        <div className={cn(cardVariants({ variant }), className)} {...props}>
            {children}
        </div>
    );
}

export function CardHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={`flex flex-col space-y-1.5 p-6 ${className}`} {...props} />;
}

export function CardTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <h3 className={`font-semibold leading-none tracking-tight ${className}`} {...props} />;
}

export function CardDescription({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
    return <p className={`text-sm text-muted-foreground ${className}`} {...props} />;
}

export function CardContent({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('p-6 pt-0', className)} {...props} />;
}

export function CardFooter({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={`flex items-center p-6 pt-0 ${className}`} {...props} />;
}

