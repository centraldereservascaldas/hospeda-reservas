import type { HTMLAttributes, ReactNode } from 'react';

export type InlineNoticeVariant = 'info' | 'success' | 'warning' | 'error' | 'loading';

interface InlineNoticeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: InlineNoticeVariant;
  icon?: ReactNode;
  role?: 'status' | 'alert' | 'group';
  children: ReactNode;
}

const variantClasses: Record<InlineNoticeVariant, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-950',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-950',
  error: 'border-rose-200 bg-rose-50 text-rose-950',
  loading: 'border-neutral-200 bg-neutral-50 text-neutral-800',
};

export function InlineNotice({
  variant = 'info',
  icon,
  role,
  className = '',
  children,
  ...props
}: InlineNoticeProps) {
  const noticeRole = role ?? (variant === 'error' ? 'alert' : 'status');

  return (
    <div
      {...props}
      role={noticeRole}
      aria-live={noticeRole === 'alert' ? undefined : 'polite'}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-sm ${variantClasses[variant]} ${className}`}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
