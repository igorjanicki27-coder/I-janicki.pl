import React, { forwardRef } from 'react';
import { cn } from '../../lib/utils';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, children, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{label}</label>}
        <select
          ref={ref}
          className={cn(
            "flex w-full appearance-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white transition-colors focus-visible:outline-none focus:border-emerald-500/50 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-red-500 focus:border-red-500",
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }
);
Select.displayName = "Select";
