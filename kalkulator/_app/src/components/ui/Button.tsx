import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { motion, HTMLMotionProps } from 'motion/react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:pointer-events-none disabled:opacity-50",
          {
            'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20': variant === 'primary',
            'bg-white/5 text-white hover:bg-white/10 border border-white/10': variant === 'secondary',
            'border border-white/10 bg-transparent text-white hover:bg-white/5': variant === 'outline',
            'bg-transparent text-white/40 hover:text-white hover:bg-white/5': variant === 'ghost',
            'bg-red-500/10 text-red-500 hover:bg-red-500/20': variant === 'danger',
            'h-10 px-4': size === 'sm',
            'h-12 px-6': size === 'md',
            'h-14 px-8 text-base': size === 'lg',
            'h-12 w-12': size === 'icon',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
