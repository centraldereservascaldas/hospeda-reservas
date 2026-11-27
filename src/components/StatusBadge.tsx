import type { HTMLAttributes, ReactNode } from 'react';

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusBadgeTone;
  children: ReactNode;
}

const toneClasses: Record<StatusBadgeTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700',
  info: 'bg-sky-100 text-sky-900',
  success: 'bg-emerald-100 text-emerald-900',
  warning: 'bg-amber-100 text-amber-950',
  danger: 'bg-rose-100 text-rose-900',
};

export function StatusBadge({
  tone = 'neutral',
  className = '',
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
