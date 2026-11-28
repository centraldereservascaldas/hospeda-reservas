import type { ReactNode, SelectHTMLAttributes } from 'react';

type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

const baseClasses =
  'min-h-control-comfortable rounded-control border border-control-border bg-control-surface px-3 text-sm font-medium text-control-foreground outline-none transition-colors focus-visible:border-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:bg-state-disabled-surface disabled:text-state-disabled-foreground';

export function NativeSelect({ className = '', children, ...props }: NativeSelectProps) {
  return (
    <select {...props} className={`${baseClasses} ${className}`}>
      {children}
    </select>
  );
}
