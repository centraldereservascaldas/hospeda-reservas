import { useId, type ReactNode } from 'react';

export type EmptyStateHeadingLevel = 'h2' | 'h3' | 'h4';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  headingLevel?: EmptyStateHeadingLevel;
  density?: 'comfortable' | 'compact';
  className?: string;
}

const headingElements = {
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
} as const;

export function EmptyState({
  title,
  description,
  icon,
  action,
  headingLevel = 'h2',
  density = 'comfortable',
  className = '',
}: EmptyStateProps) {
  const headingId = useId();
  const Heading = headingElements[headingLevel];
  const densityClasses =
    density === 'compact'
      ? 'gap-2 rounded-2xl border border-dashed border-neutral-200 bg-white/50 p-5'
      : 'gap-4 px-5 py-16';

  return (
    <section
      aria-labelledby={headingId}
      className={`mx-auto flex max-w-xl flex-col items-center text-center ${densityClasses} ${className}`}
    >
      {icon && (
        <span
          aria-hidden="true"
          className={`grid shrink-0 place-items-center rounded-full border border-orange-200/70 bg-orange-50 text-orange-700 ${density === 'compact' ? 'h-11 w-11' : 'h-16 w-16'}`}
        >
          {icon}
        </span>
      )}
      <div className="space-y-1.5">
        <Heading id={headingId} className="text-lg font-bold text-neutral-900">
          {title}
        </Heading>
        <p className="text-sm leading-6 text-neutral-600">{description}</p>
      </div>
      {action && <div className="flex w-full flex-wrap justify-center gap-2">{action}</div>}
    </section>
  );
}
