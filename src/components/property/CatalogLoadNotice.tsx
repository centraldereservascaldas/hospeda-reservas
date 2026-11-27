import { LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '../Button';
import { InlineNotice } from '../InlineNotice';

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
      <InlineNotice
        variant="loading"
        icon={<LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-orange-700" />}
        className="items-center justify-center border-transparent bg-transparent py-16 text-sm font-semibold"
      >
        Carregando acomodações…
      </InlineNotice>
    );
  }

  if (status === 'error') {
    return (
      <InlineNotice
        variant="warning"
        role="alert"
        icon={<TriangleAlert aria-hidden="true" className="h-8 w-8 text-amber-700" />}
        className="mx-auto max-w-xl flex-col items-center gap-1 rounded-3xl px-6 py-4 text-center sm:gap-3 sm:py-12"
      >
        <div className="space-y-1">
          <h2 className="text-base font-bold text-amber-950">
            Não foi possível carregar as acomodações
          </h2>
          <p className="text-sm text-amber-900">
            Tente novamente para atualizar a lista de hospedagens.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={onRetry}
          className="mt-1 bg-neutral-950 hover:bg-neutral-800"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Tentar novamente
        </Button>
      </InlineNotice>
    );
  }

  return (
    <InlineNotice
      variant="warning"
      role={isRefreshing ? 'status' : 'alert'}
      className="mb-6 flex-wrap items-center justify-between gap-3 px-5 py-4"
      icon={
        isRefreshing ? (
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-amber-700" />
        ) : (
          <TriangleAlert aria-hidden="true" className="h-4 w-4 text-amber-700" />
        )
      }
    >
      <p className="min-w-0 flex-1">
        {isRefreshing
          ? 'Atualizando acomodações salvas…'
          : 'Não foi possível atualizar as acomodações. Exibindo informações salvas; confirme a disponibilidade e o preço antes de reservar.'}
      </p>
      <Button
        variant="secondary"
        size="small"
        onClick={onRetry}
        disabled={isRefreshing}
        className="shrink-0 border-amber-300 text-xs text-amber-950 hover:bg-amber-100 disabled:cursor-wait"
      >
        {!isRefreshing && <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
        {isRefreshing ? 'Atualizando…' : 'Tentar atualizar'}
      </Button>
    </InlineNotice>
  );
}
