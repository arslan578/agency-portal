import React from 'react';
import { Input } from './Input';
import { Label } from './Label';
import { Textarea } from './Textarea';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'textarea';
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  success?: boolean;
  required?: boolean;
  placeholder?: string;
  helperText?: string;
  className?: string;
  [key: string]: any;
}

export function FormField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  onBlur,
  error,
  success,
  required,
  placeholder,
  helperText,
  className,
  ...props
}: FormFieldProps) {
  const hasError = !!error;
  const showSuccess = success && !hasError && value;

  const inputProps = {
    id: name,
    name,
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onBlur,
    placeholder,
    required,
    className: cn(className),
    ...props
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </Label>
      <div className="relative">
        {type === 'textarea' ? (
          <Textarea {...inputProps} />
        ) : (
          <Input type={type} {...inputProps} />
        )}
        {showSuccess && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <CheckCircle className="h-5 w-5 text-green-400" />
          </div>
        )}
        {hasError && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <XCircle className="h-5 w-5 text-red-400" />
          </div>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-400 flex items-center gap-1">
          <XCircle className="h-4 w-4" />
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="text-xs text-gray-400">{helperText}</p>
      )}
    </div>
  );
}
