import { Skeleton } from '../Skeleton';

export type OwnerDashboardSkeletonSection =
  'overview' | 'properties' | 'reservations' | 'calendar' | 'accounting';

function OwnerMetricSkeleton() {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="mt-3 h-7 w-1/2" radius="lg" />
    </div>
  );
}

function OwnerSummarySkeleton() {
  return (
    <section className="rounded-2xl border border-white/80 bg-white/65 p-5 shadow-sm">
      <Skeleton className="h-5 w-2/5" radius="lg" />
      <Skeleton className="mt-2 h-3 w-3/5" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4 border-t border-neutral-100 pt-3"
          >
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        ))}
      </div>
    </section>
  );
}

function OwnerPropertiesSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <article
          key={index}
          className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm"
        >
          <Skeleton className="aspect-[16/9] w-full" radius="xl" />
          <Skeleton className="mt-4 h-5 w-3/4" radius="lg" />
          <Skeleton className="mt-2 h-4 w-1/2" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-10 w-28" radius="xl" />
            <Skeleton className="h-10 w-24" radius="xl" tone="muted" />
          </div>
        </article>
      ))}
    </div>
  );
}

function OwnerReservationsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }, (_, index) => (
        <article
          key={index}
          className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm"
        >
          <div className="flex flex-wrap justify-between gap-3">
            <Skeleton className="h-5 w-2/5" radius="lg" />
            <Skeleton className="h-6 w-24" radius="full" tone="muted" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </article>
      ))}
    </div>
  );
}

function OwnerCalendarSkeleton() {
  return (
    <section className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-40" radius="lg" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10" radius="full" />
          <Skeleton className="h-10 w-10" radius="full" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {Array.from({ length: 49 }, (_, index) => (
          <Skeleton
            key={index}
            className="min-h-10 w-full sm:min-h-16"
            radius="lg"
            tone={index % 7 === 0 ? 'muted' : 'default'}
          />
        ))}
      </div>
    </section>
  );
}

function OwnerAccountingSkeleton() {
  return (
    <section className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm sm:p-5">
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" radius="xl" />
        ))}
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[850px] space-y-3" aria-hidden="true">
          <div className="flex gap-4 border-b border-neutral-200 pb-3">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-4 flex-1" tone="muted" />
            ))}
          </div>
          {Array.from({ length: 5 }, (_, row) => (
            <div key={row} className="flex gap-4 border-b border-neutral-100 pb-3">
              {Array.from({ length: 7 }, (_, cell) => (
                <Skeleton key={cell} className="h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Decorative outline for the owner overview. The consumer announces progress. */
export function OwnerDashboardSkeleton({ section }: { section: OwnerDashboardSkeletonSection }) {
  return (
    <div aria-hidden="true" className="space-y-5">
      {section === 'overview' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <OwnerMetricSkeleton key={index} />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <OwnerSummarySkeleton />
            <OwnerSummarySkeleton />
          </div>
        </>
      )}
      {section === 'properties' && <OwnerPropertiesSkeleton />}
      {section === 'reservations' && <OwnerReservationsSkeleton />}
      {section === 'calendar' && <OwnerCalendarSkeleton />}
      {section === 'accounting' && <OwnerAccountingSkeleton />}
    </div>
  );
}

function OwnerAdminCardSkeleton({ variant }: { variant: 'access' | 'operation' }) {
  return (
    <article className="rounded-3xl border border-white/85 bg-white/70 p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200/70 pb-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {variant === 'access' && <Skeleton className="h-10 w-10 shrink-0" radius="2xl" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3 max-w-64" />
            <Skeleton className="h-3 w-1/2 max-w-48" />
            {variant === 'access' && <Skeleton className="h-3 w-1/3 max-w-36" tone="muted" />}
          </div>
        </div>
        <Skeleton className="h-6 w-24 shrink-0" radius="full" tone="muted" />
      </div>
      {variant === 'access' ? (
        <>
          <Skeleton className="mt-5 h-4 w-48" />
          <Skeleton className="mt-2 h-11 w-full" radius="xl" />
          <Skeleton className="mt-5 h-10 w-full" radius="xl" tone="muted" />
        </>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-2/3" tone="muted" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-4 h-16 w-full" radius="xl" tone="muted" />
        </>
      )}
      <div className="mt-4 flex justify-end gap-2 border-t border-neutral-100 pt-4">
        <Skeleton className="h-11 w-28" radius="xl" tone="muted" />
        <Skeleton className="h-11 w-32" radius="xl" />
      </div>
    </article>
  );
}

/** Loading placeholders for the two administrative card queues. */
export function OwnerAdminQueueSkeleton({
  variant,
  count = 2,
}: {
  variant: 'access' | 'operation';
  count?: number;
}) {
  return (
    <div aria-hidden="true" className="space-y-4">
      {Array.from({ length: count }, (_, index) => (
        <OwnerAdminCardSkeleton key={index} variant={variant} />
      ))}
    </div>
  );
}
