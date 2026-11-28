import { Skeleton } from '../Skeleton';

function TripCardSkeleton() {
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/70 shadow-sm sm:flex-row">
      <Skeleton
        className="aspect-[4/3] w-full shrink-0 sm:aspect-auto sm:h-48 sm:w-48"
        radius="none"
      />
      <div className="flex flex-1 flex-col justify-between gap-6 p-5">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Skeleton className="h-6 w-28" radius="full" tone="muted" />
            <Skeleton className="h-6 w-32" radius="full" tone="muted" />
          </div>
          <Skeleton className="mt-5 h-5 w-3/4" radius="lg" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <div className="mt-5 flex flex-wrap gap-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-32" radius="full" />
          <Skeleton className="h-11 w-28" radius="full" tone="muted" />
        </div>
      </div>
    </article>
  );
}

/** Reservation-shaped loading state; the caller provides the live status message. */
export function TripsLoadingSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-6 md:grid-cols-2">
      <TripCardSkeleton />
      <TripCardSkeleton />
    </div>
  );
}
