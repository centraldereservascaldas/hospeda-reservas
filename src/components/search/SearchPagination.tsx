import type { SearchPaginationState } from '../../hooks/useAccommodationSearch';

interface SearchPaginationProps {
  state: SearchPaginationState;
  onLoadMore: () => void;
}

export function SearchPagination({ state, onLoadMore }: SearchPaginationProps) {
  return (
    <section
      aria-label="Paginação das acomodações"
      aria-busy={state.isLoading}
      className="mt-8 space-y-3 text-center"
    >
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
      <button
        type="button"
        disabled={!state.hasMore}
        aria-disabled={state.isLoading || !state.hasMore}
        onClick={() => {
          if (!state.isLoading && state.hasMore) onLoadMore();
        }}
        className="min-h-11 rounded-full border border-neutral-300 bg-white px-6 py-3 text-sm font-bold text-neutral-900 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-default disabled:text-neutral-500"
      >
        {state.isLoading
          ? 'Carregando mais…'
          : state.error
            ? 'Tentar carregar mais'
            : state.hasMore
              ? 'Carregar mais'
              : 'Fim dos resultados'}
      </button>
    </section>
  );
}
