interface SkeletonProps {
  className?: string;
  animated?: boolean;
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  tone?: 'default' | 'muted';
}

const radiusClasses: Record<NonNullable<SkeletonProps['radius']>, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  full: 'rounded-full',
};

/** Decorative loading placeholder. Pair it with a separate accessible status. */
export function Skeleton({
  className = '',
  animated = true,
  radius = 'md',
  tone = 'default',
}: SkeletonProps) {
  const animationClass = animated ? 'motion-safe:animate-pulse' : '';
  const toneClass = tone === 'muted' ? 'bg-neutral-100' : 'bg-neutral-200';

  return (
    <span
      aria-hidden="true"
      className={`block ${radiusClasses[radius]} ${toneClass} ${animationClass} ${className}`}
    />
  );
}
