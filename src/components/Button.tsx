import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'small' | 'medium';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-orange-600 text-white hover:bg-orange-700 disabled:bg-orange-300',
  secondary:
    'border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100 disabled:bg-neutral-100',
  quiet:
    'border border-transparent bg-transparent text-neutral-800 hover:bg-neutral-100 disabled:bg-transparent',
  danger: 'border border-transparent bg-rose-700 text-white hover:bg-rose-800 disabled:bg-rose-300',
};

const sizeClasses: Record<ButtonSize, string> = {
  small: 'min-h-10 gap-2 rounded-full px-4 text-sm',
  medium: 'min-h-11 gap-2 rounded-full px-5 py-2.5 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'medium',
  loading = false,
  loadingLabel,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-70 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
