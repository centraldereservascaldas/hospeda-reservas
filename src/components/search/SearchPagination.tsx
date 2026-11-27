import { useEffect, useRef } from 'react';
import type { SearchPaginationState } from '../../hooks/useAccommodationSearch';
import { Button } from '../Button';

interface SearchPaginationProps {
  state: SearchPaginationState;
  onLoadMore: () => void;
}

export function SearchPagination({ state, onLoadMore }: SearchPaginationProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const requested = useRef(false);

  useEffect(() => {
    requested.current = false;
  }, [state.loadedCount, state.isLoading]);

  useEffect(() => {
    const element = sentinel.current;
    if (
      !element ||
      !state.hasMore ||
      state.isLoading ||
      state.error ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !requested.current) {
          requested.current = true;
          onLoadMore();
        }
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [state.hasMore, state.isLoading, state.error, state.loadedCount, onLoadMore]);

  return (
    <section
      aria-label="Paginação das acomodações"
      aria-busy={state.isLoading}
      className="mt-8 space-y-3 text-center"
    >
      <div ref={sentinel} aria-hidden="true" />
      <p role="status" aria-live="polite" className="text-sm text-neutral-600">
        {state.loadedCount}{' '}
        {state.loadedCount === 1 ? 'acomodação carregada' : 'acomodações carregadas'}.
        {state.hasMore &&
          ' Há mais resultados. Os filtros se aplicam às acomodações já carregadas.'}
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-amber-900">
          Não foi possível carregar a próxima página. Seus resultados foram mantidos. Tente
          novamente.
        </p>
      )}
      <Button
        variant="secondary"
        disabled={!state.hasMore}
        loading={state.isLoading}
        loadingLabel="Carregando mais…"
        onClick={() => {
          if (!state.isLoading && state.hasMore) onLoadMore();
        }}
      >
        {state.error
          ? 'Tentar carregar mais'
          : state.hasMore
            ? 'Carregar mais'
            : 'Fim dos resultados'}
      </Button>
    </section>
  );
}
