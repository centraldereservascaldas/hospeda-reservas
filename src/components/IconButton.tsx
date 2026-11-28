import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

export type IconButtonSize = 'compact' | 'comfortable' | 'large';
export type IconButtonVariant = 'quiet' | 'outlined' | 'outlined-neutral' | 'surface' | 'custom';
export type IconButtonShape = 'circle' | 'rounded';

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-label' | 'children'
> {
  ref?: Ref<HTMLButtonElement>;
  'aria-label': string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  shape?: IconButtonShape;
  children: ReactNode;
}

const sizeClasses: Record<IconButtonSize, string> = {
  compact: 'size-10',
  comfortable: 'size-11',
  large: 'size-12',
};

const variantClasses: Record<IconButtonVariant, string> = {
  quiet:
    'border border-transparent bg-transparent text-neutral-700 transition-colors hover:bg-neutral-100',
  outlined:
    'border border-neutral-200 bg-white text-neutral-700 transition-colors hover:border-orange-200 hover:bg-orange-50',
  'outlined-neutral':
    'border border-neutral-200 bg-white text-neutral-800 transition-colors hover:bg-neutral-100',
  surface:
    'border border-transparent bg-neutral-100 text-neutral-800 transition-colors hover:bg-neutral-200',
  custom: 'appearance-none p-0',
};

const shapeClasses: Record<IconButtonShape, string> = {
  circle: 'rounded-full',
  rounded: 'rounded-xl',
};

/** Icon-only action with a required accessible name and a named target size. */
export function IconButton({
  ref,
  size = 'comfortable',
  variant = 'quiet',
  shape = 'circle',
  type = 'button',
  className = '',
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={`inline-flex shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed disabled:opacity-50 ${sizeClasses[size]} ${variantClasses[variant]} ${shapeClasses[shape]} ${className}`}
    >
      {children}
    </button>
  );
}
