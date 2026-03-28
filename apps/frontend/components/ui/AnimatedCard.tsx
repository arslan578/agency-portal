import { Card } from './Card';
import { cn } from '@/lib/utils';
import { transitions } from '@/lib/animations/transitions';
import { ComponentPropsWithoutRef } from 'react';

interface AnimatedCardProps extends ComponentPropsWithoutRef<'div'> {
  hover?: boolean;
  animation?: 'fadeIn' | 'slideIn' | 'scaleIn';
  variant?: 'default' | 'elevated' | 'outlined' | 'subtle';
}

export function AnimatedCard({ 
  children, 
  className, 
  hover = true,
  animation,
  variant,
  ...props 
}: AnimatedCardProps) {
  return (
    <Card
      variant={variant}
      className={cn(
        hover && transitions.hover,
        animation && `animate-in ${animation === 'fadeIn' ? 'fade-in' : animation === 'slideIn' ? 'slide-in-from-bottom-4' : 'zoom-in-95'} duration-300`,
        className
      )}
      {...props}
    >
      {children}
    </Card>
  );
}
