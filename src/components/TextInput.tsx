import { forwardRef, type InputHTMLAttributes } from 'react';

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

const baseClasses =
  'min-h-11 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-800 outline-none transition-colors placeholder:font-normal placeholder:text-neutral-500 hover:border-neutral-400 focus-visible:border-focus-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500';

/** Native text/date input with the shared control size and visible focus treatment. */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className = '', ...props },
  ref,
) {
  return <input {...props} ref={ref} className={`${baseClasses} ${className}`} />;
});
