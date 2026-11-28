import type { ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

export interface LoadingStatusProps {
  children: ReactNode;
  className?: string;
  iconClassName?: string;
}

/** Accessible progress announcement; the consuming region owns its busy and layout state. */
export function LoadingStatus({
  children,
  className = '',
  iconClassName = '',
}: LoadingStatusProps) {
  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`flex items-center gap-2 text-sm text-neutral-600 ${className}`}
    >
      <LoaderCircle
        aria-hidden="true"
        className={`h-4 w-4 shrink-0 text-orange-600 motion-safe:animate-spin ${iconClassName}`}
      />
      {children}
    </p>
  );
}
