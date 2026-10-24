import { LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';

type CatalogLoadStatus = 'loading' | 'error' | 'stale' | 'ready';

interface CatalogLoadNoticeProps {
  status: CatalogLoadStatus;
  isRefreshing: boolean;
  onRetry: () => void;
}

export function CatalogLoadNotice({ status, isRefreshing, onRetry }: CatalogLoadNoticeProps) {
  if (status === 'ready') return null;

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center gap-3 py-16 text-sm font-semibold text-neutral-700"
      >
        <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-orange-700" />
        Carregando acomodações…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-xl flex-col items-center gap-1 sm:gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-6 py-4 sm:py-12 text-center"
      >
        <TriangleAlert aria-hidden="true" className="h-8 w-8 text-amber-700" />
        <div className="space-y-1">
          <h2 className="text-base font-bold text-amber-950">
            Não foi possível carregar as acomodações
          </h2>
          <p className="text-sm text-amber-900">
            Tente novamente para atualizar a lista de hospedagens.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div
      role={isRefreshing ? 'status' : 'alert'}
      aria-live={isRefreshing ? 'polite' : undefined}
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950"
    >
      <div className="flex min-w-0 items-start gap-3">
        {isRefreshing ? (
          <LoaderCircle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-amber-700"
          />
        ) : (
          <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        )}
        <p>
          {isRefreshing
            ? 'Atualizando acomodações salvas…'
            : 'Não foi possível atualizar as acomodações. Exibindo informações salvas; confirme a disponibilidade e o preço antes de reservar.'}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRefreshing}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-amber-300 bg-white px-4 py-2 text-xs font-bold text-amber-950 transition hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-70"
      >
        {!isRefreshing && <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
        {isRefreshing ? 'Atualizando…' : 'Tentar atualizar'}
      </button>
    </div>
  );
}
