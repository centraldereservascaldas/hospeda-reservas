import type { HTMLAttributes, ReactNode } from 'react';

export type InlineNoticeVariant = 'info' | 'success' | 'warning' | 'error' | 'loading';

interface InlineNoticeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: InlineNoticeVariant;
  density?: 'compact' | 'regular';
  icon?: ReactNode;
  role?: 'status' | 'alert' | 'group';
  children: ReactNode;
}

const variantClasses: Record<InlineNoticeVariant, string> = {
  info: 'border-status-info-notice-border bg-status-info-notice-surface text-status-info-notice-foreground',
  success:
    'border-status-success-notice-border bg-status-success-notice-surface text-status-success-notice-foreground',
  warning:
    'border-status-warning-notice-border bg-status-warning-notice-surface text-status-warning-notice-foreground',
  error:
    'border-status-danger-notice-border bg-status-danger-notice-surface text-status-danger-notice-foreground',
  loading:
    'border-status-neutral-notice-border bg-status-neutral-notice-surface text-status-neutral-notice-foreground',
};

export function InlineNotice({
  variant = 'info',
  density = 'regular',
  icon,
  role,
  className = '',
  children,
  ...props
}: InlineNoticeProps) {
  const noticeRole = role ?? (variant === 'error' ? 'alert' : 'status');
  const densityClasses =
    density === 'compact' ? 'gap-2 rounded-xl px-3 py-2 text-xs' : 'gap-3 rounded-2xl p-4 text-sm';

  return (
    <div
      {...props}
      role={noticeRole}
      aria-live={noticeRole === 'status' ? 'polite' : undefined}
      aria-atomic={noticeRole === 'status' || noticeRole === 'alert' ? true : undefined}
      className={`flex items-start border ${densityClasses} ${variantClasses[variant]} ${className}`}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
