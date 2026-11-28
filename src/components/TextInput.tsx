import { forwardRef, type InputHTMLAttributes } from 'react';

export type TextInputSize = 'comfortable' | 'large';
export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  controlSize?: TextInputSize;
};

const baseClasses =
  'rounded-control border border-control-border bg-control-surface px-3 font-medium text-control-foreground outline-none transition-colors placeholder:font-normal placeholder:text-neutral-500 hover:border-control-border-hover focus-visible:border-focus-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:bg-state-disabled-surface disabled:text-state-disabled-foreground';

const sizeClasses: Record<TextInputSize, string> = {
  comfortable: 'min-h-control-comfortable text-sm',
  large: 'min-h-12 text-base',
};

/** Native text/date input with shared comfortable and large touch sizes. */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className = '', controlSize = 'comfortable', ...props },
  ref,
) {
  return (
    <input
      {...props}
      ref={ref}
      className={`${baseClasses} ${sizeClasses[controlSize]} ${className}`}
    />
  );
});
