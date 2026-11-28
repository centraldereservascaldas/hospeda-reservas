import type { HTMLAttributes, ReactNode } from 'react';

export type StatusBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusBadgeTone;
  children: ReactNode;
}

const toneClasses: Record<StatusBadgeTone, string> = {
  neutral: 'bg-status-neutral-badge-surface text-status-neutral-badge-foreground',
  info: 'bg-status-info-badge-surface text-status-info-badge-foreground',
  success: 'bg-status-success-badge-surface text-status-success-badge-foreground',
  warning: 'bg-status-warning-badge-surface text-status-warning-badge-foreground',
  danger: 'bg-status-danger-badge-surface text-status-danger-badge-foreground',
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
