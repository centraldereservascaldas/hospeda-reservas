import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'small' | 'medium';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border border-transparent bg-action-primary text-action-primary-foreground hover:bg-action-primary-hover disabled:bg-action-primary-disabled',
  secondary:
    'border border-action-secondary-border bg-action-secondary text-action-secondary-foreground hover:bg-action-secondary-hover disabled:bg-action-secondary-disabled',
  quiet:
    'border border-transparent bg-transparent text-action-quiet-foreground hover:bg-action-quiet-hover disabled:bg-transparent',
  danger:
    'border border-transparent bg-action-danger text-action-danger-foreground hover:bg-action-danger-hover disabled:bg-action-danger-disabled',
};

const sizeClasses: Record<ButtonSize, string> = {
  small: 'min-h-10 gap-2 rounded-full px-4 text-sm',
  medium: 'min-h-11 gap-2 rounded-full px-5 py-2.5 text-sm',
};

export function Button({
  ref,
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
      ref={ref}
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
