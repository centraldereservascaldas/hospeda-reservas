import type { InputHTMLAttributes } from 'react';

export interface CheckboxInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'size' | 'type'
> {
  size?: 'regular' | 'large';
}

/** Native checkbox with shared action color and a visible keyboard focus indicator. */
export function CheckboxInput({ size = 'regular', className = '', ...props }: CheckboxInputProps) {
  const sizeClasses = size === 'large' ? 'h-5 w-5' : 'h-4 w-4';

  return (
    <input
      {...props}
      type="checkbox"
      className={`${sizeClasses} shrink-0 accent-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed ${className}`}
    />
  );
}
