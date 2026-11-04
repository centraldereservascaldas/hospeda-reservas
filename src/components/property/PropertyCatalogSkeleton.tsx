interface PropertyCatalogSkeletonProps {
  message?: string;
  description?: string;
}

export function PropertyCatalogSkeleton({
  message = 'Carregando acomodações…',
  description,
}: PropertyCatalogSkeletonProps) {
  return (
    <div aria-busy="true">
      <div role="status" aria-live="polite" className="mb-6 text-sm text-neutral-700">
        <h2 className="font-semibold">{message}</h2>
        {description && <p className="mt-1 text-neutral-600">{description}</p>}
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      >
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="rounded-3xl border border-white/80 p-2 sm:p-2.5">
            <div className="aspect-[4/3] w-full rounded-2xl bg-neutral-200" />
            <div className="flex flex-col gap-3 px-1 pb-2 pt-4">
              <div className="h-5 w-3/4 rounded bg-neutral-200" />
              <div className="h-4 w-1/2 rounded bg-neutral-100" />
              <div className="h-4 w-2/3 rounded bg-neutral-100" />
              <div className="h-6 w-1/2 rounded bg-neutral-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
