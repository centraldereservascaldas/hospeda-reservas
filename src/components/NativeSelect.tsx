import type { ReactNode, SelectHTMLAttributes } from 'react';

type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  children: ReactNode;
};

const baseClasses =
  'min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-800 outline-none transition-colors focus-visible:border-orange-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500';

export function NativeSelect({ className = '', children, ...props }: NativeSelectProps) {
  return (
    <select {...props} className={`${baseClasses} ${className}`}>
      {children}
    </select>
  );
}
