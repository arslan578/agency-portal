import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    helperText?: string;
}

export function Textarea({ label, error, helperText, className = '', ...props }: TextareaProps) {
    return (
        <div className="w-full">
            {label && (
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                    {label}
                </label>
            )}
            <textarea
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring transition-colors
                    ${error ? 'border-kaivo-coral focus:ring-kaivo-coral' : 'border-input'}
                    ${className}
                `}
                {...props}
            />
            {error && <p className="mt-1 text-sm text-kaivo-coral">{error}</p>}
            {helperText && !error && <p className="mt-1 text-sm text-muted-foreground">{helperText}</p>}
        </div>
    );
}
