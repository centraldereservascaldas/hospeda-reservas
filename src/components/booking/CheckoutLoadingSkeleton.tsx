import { LogoCRCN } from '../LogoCRCN';

function SkeletonBar({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-full bg-neutral-200 motion-reduce:animate-none ${className}`}
    />
  );
}

function CheckoutSkeletonCards() {
  return (
    <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1.5fr)_minmax(260px,0.85fr)]">
      <section
        aria-hidden="true"
        className="checkout-purchase-form liquid-glass-card min-w-0 space-y-6 rounded-3xl p-5 sm:p-7"
      >
        <div className="flex items-center gap-3">
          <SkeletonBar className="h-10 w-10 rounded-xl" />
          <SkeletonBar className="h-6 w-36" />
        </div>
        <div className="grid gap-3 rounded-2xl border border-neutral-200 bg-white/65 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <SkeletonBar className="h-4 w-16" />
            <SkeletonBar className="h-4 w-32" />
          </div>
          <div className="space-y-2">
            <SkeletonBar className="h-4 w-20" />
            <SkeletonBar className="h-4 w-24" />
          </div>
        </div>
        <SkeletonBar className="aspect-video w-full rounded-2xl" />
        <div className="space-y-4">
          <SkeletonBar className="h-5 w-48" />
          <SkeletonBar className="h-12 w-full rounded-xl" />
          <SkeletonBar className="h-12 w-full rounded-xl" />
        </div>
        <SkeletonBar className="h-14 w-full rounded-2xl" />
      </section>
      <aside
        aria-hidden="true"
        className="checkout-summary-card liquid-glass-card space-y-5 rounded-3xl p-5 sm:p-6"
      >
        <SkeletonBar className="aspect-video w-full rounded-2xl" />
        <SkeletonBar className="h-4 w-28" />
        <SkeletonBar className="h-6 w-3/4" />
        <div className="space-y-3 border-t border-neutral-200 pt-5">
          <SkeletonBar className="h-4 w-full" />
          <SkeletonBar className="h-4 w-4/5" />
          <SkeletonBar className="h-4 w-2/3" />
        </div>
        <SkeletonBar className="h-12 w-full rounded-xl" />
      </aside>
    </div>
  );
}

export function CheckoutLoadingSkeleton({
  fullPage = false,
  label = 'Carregando checkout',
  variant = 'reservation',
}: {
  fullPage?: boolean;
  label?: string;
  variant?: 'reservation' | 'resume';
}) {
  if (!fullPage) {
    return (
      <div role="status" aria-label={label} aria-busy="true">
        <span className="sr-only">{label}</span>
        {variant === 'resume' ? <ResumeSkeletonCard /> : <CheckoutSkeletonCards />}
      </div>
    );
  }

  return (
    <main
      className="checkout-purchase flex min-h-screen flex-col"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <header className="checkout-purchase-header border-b border-neutral-200/80 bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <LogoCRCN size="md" variant="glass" responsiveText />
          <span className="text-sm font-semibold text-neutral-500">Pagamento seguro</span>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-7 sm:px-8 sm:py-10">
        <span className="sr-only">{label}</span>
        <div aria-hidden="true" className="mb-6 space-y-3">
          <SkeletonBar className="h-4 w-40" />
          <SkeletonBar className="h-9 w-64 max-w-full" />
          <SkeletonBar className="h-4 w-80 max-w-full" />
        </div>
        {variant === 'resume' ? <ResumeSkeletonCard /> : <CheckoutSkeletonCards />}
      </div>
    </main>
  );
}

function ResumeSkeletonCard() {
  return (
    <section
      aria-hidden="true"
      className="checkout-summary-card liquid-glass-card max-w-xl space-y-4 rounded-3xl p-5 sm:p-7"
    >
      <SkeletonBar className="h-5 w-40" />
      <SkeletonBar className="h-4 w-full" />
      <SkeletonBar className="h-4 w-4/5" />
      <div className="space-y-3 border-t border-neutral-200 pt-5">
        <SkeletonBar className="h-4 w-2/3" />
        <SkeletonBar className="h-12 w-full rounded-xl" />
      </div>
    </section>
  );
}
