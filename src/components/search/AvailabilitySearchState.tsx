import { CalendarDays, LoaderCircle, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import type { AvailabilitySearchState as AvailabilitySearchStateValue } from '../../hooks/useAccommodationSearch';

interface AvailabilitySearchStateProps {
  state: AvailabilitySearchStateValue;
  checkIn: string;
  checkOut: string;
  guests?: number;
  resultCount?: number;
  hasResults: boolean;
  hasMoreResults?: boolean;
  hasAvailableResults: boolean;
  showEmptyResults?: boolean;
  showIdleNotice?: boolean;
  onRetry: () => void;
  onClearFilters?: () => void;
  onOpenSearch?: () => void;
}

function formatDateRange(checkIn: string, checkOut: string): string {
  if (!checkIn || !checkOut) return '';
  const format = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  return `${format(checkIn)} a ${format(checkOut)}`;
}

export function AvailabilitySearchState({
  state,
  checkIn,
  checkOut,
  guests = 1,
  resultCount,
  hasResults,
  hasMoreResults = false,
  hasAvailableResults,
  showEmptyResults = false,
  showIdleNotice = true,
  onRetry,
  onClearFilters,
  onOpenSearch,
}: AvailabilitySearchStateProps) {
  const dateRange = formatDateRange(checkIn, checkOut);
  const guestLabel = `${guests} ${guests === 1 ? 'hóspede' : 'hóspedes'}`;
  const searchContext = dateRange ? `${dateRange} · ${guestLabel}` : guestLabel;

  if (state === 'expired' || state === 'refreshing') {
    const refreshing = state === 'refreshing';
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        <p>
          {refreshing
            ? 'Atualizando preços e disponibilidade…'
            : 'A consulta anterior perdeu a validade. Atualize para confirmar preços e disponibilidade.'}
        </p>
        {!refreshing && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-11 rounded-lg px-3 font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Atualizar disponibilidade
          </button>
        )}
      </div>
    );
  }

  if (state === 'error' && hasResults) {
    return (
      <div
        role="alert"
        className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        <p>
          Não foi possível atualizar a consulta. Tente novamente para confirmar preços e
          disponibilidade.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 min-h-11 rounded-lg px-3 font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          Tentar atualizar novamente
        </button>
      </div>
    );
  }

  if (state === 'partial') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
      >
        <p>
          Algumas opções não puderam ter o preço confirmado. Mostramos apenas as opções verificadas.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 min-h-11 rounded-lg px-3 font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          Tentar consultar novamente
        </button>
      </div>
    );
  }

  if (hasMoreResults && !hasResults && (state === 'success' || state === 'idle')) {
    return (
      <p
        role="status"
        className="mb-6 rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-700"
      >
        Nenhuma opção entre os resultados carregados corresponde aos filtros. Ainda há acomodações a
        verificar. Carregue mais resultados ou ajuste os filtros.
      </p>
    );
  }

  if (state === 'success' && hasResults) {
    const count = resultCount ?? 1;
    const accommodationLabel = count === 1 ? 'acomodação' : 'acomodações';

    return (
      <p className="sr-only" role="status" aria-live="polite">
        {dateRange
          ? `Encontramos ${count} ${accommodationLabel} com disponibilidade confirmada para ${searchContext}.`
          : `Encontramos ${count} ${accommodationLabel} para você explorar. A disponibilidade depende das datas escolhidas.`}
      </p>
    );
  }

  if (state === 'idle') {
    if (!hasResults) {
      if (!hasAvailableResults && !showEmptyResults) return null;
    } else {
      if (!showIdleNotice) return null;

      return (
        <div
          role="note"
          className="mb-6 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-950"
        >
          <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
          <p>Escolha as datas e pesquise para conferir a disponibilidade e o preço da estadia.</p>
        </div>
      );
    }
  }

  if (state === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-auto flex max-w-xl flex-col items-center gap-3 px-5 py-16 text-center"
      >
        <LoaderCircle aria-hidden="true" className="h-8 w-8 animate-spin text-orange-700" />
        <div className="space-y-1">
          <h2 className="text-base font-bold text-neutral-900">
            {dateRange ? 'Verificando disponibilidade…' : 'Buscando acomodações…'}
          </h2>
          <p className="text-sm text-neutral-600">
            {dateRange
              ? `Estamos verificando opções para ${searchContext}.`
              : 'Estamos atualizando a lista. Disponibilidade e preço dependem do período escolhido.'}
          </p>
        </div>
      </div>
    );
  }

  if (state === 'error' || state === 'invalid-dates') {
    const invalidDates = state === 'invalid-dates';
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-6 py-12 text-center"
      >
        <TriangleAlert aria-hidden="true" className="h-8 w-8 text-amber-700" />
        <div className="space-y-1">
          <h2 className="text-base font-bold text-amber-950">
            {invalidDates
              ? 'Confira as datas da estadia'
              : dateRange
                ? 'Não foi possível confirmar a disponibilidade'
                : 'Não foi possível concluir a busca'}
          </h2>
          <p className="text-sm text-amber-900">
            {invalidDates
              ? 'Escolha uma entrada a partir de hoje e uma saída posterior à entrada para pesquisar novamente.'
              : dateRange
                ? `Não conseguimos verificar a disponibilidade para ${searchContext}. Tente novamente.`
                : 'Não conseguimos concluir a busca. Tente novamente.'}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap justify-center gap-3">
          {!invalidDates && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Tentar novamente
            </button>
          )}
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-sm font-bold text-neutral-800 transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              {invalidDates || dateRange ? 'Alterar datas e hóspedes' : 'Alterar busca'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex max-w-xl flex-col items-center gap-3 px-5 py-16 text-center max-[400px]:py-0 [@media(max-height:400px)]:gap-2 [@media(max-height:400px)]:py-0 [@media(max-width:639px)_and_(max-height:400px)]:-mt-5 [@media(max-width:639px)_and_(max-height:400px)]:gap-0"
    >
      {dateRange ? (
        <CalendarDays
          aria-hidden="true"
          className="h-8 w-8 text-neutral-400 [@media(max-height:400px)]:h-5 [@media(max-height:400px)]:w-5 [@media(max-width:639px)_and_(max-height:400px)]:hidden"
        />
      ) : (
        <Search
          aria-hidden="true"
          className="h-8 w-8 text-neutral-400 [@media(max-height:400px)]:h-5 [@media(max-height:400px)]:w-5 [@media(max-width:639px)_and_(max-height:400px)]:hidden"
        />
      )}
      <div className="space-y-1 [@media(max-width:639px)_and_(max-height:400px)]:space-y-0">
        <h2 className="text-base font-bold text-neutral-900 [@media(max-width:639px)_and_(max-height:400px)]:text-sm [@media(max-width:639px)_and_(max-height:400px)]:leading-4">
          {hasAvailableResults
            ? 'Nenhum imóvel corresponde a esses filtros'
            : dateRange
              ? 'Nenhuma acomodação disponível para esse período'
              : 'Não encontramos acomodações para esta busca'}
        </h2>
        <p className="text-sm text-neutral-600 [@media(max-height:400px)]:max-w-sm [@media(max-width:639px)_and_(max-height:400px)]:sr-only">
          {hasAvailableResults ? (
            dateRange ? (
              `A disponibilidade foi confirmada para ${searchContext}, mas nenhum resultado corresponde aos filtros selecionados. Remova alguns filtros e tente novamente.`
            ) : (
              <>
                <span className="[@media(max-height:400px)]:sr-only">
                  Nenhuma acomodação corresponde aos filtros selecionados. Limpe os filtros para ver
                  mais opções.
                </span>
                <span aria-hidden="true" className="hidden [@media(max-height:400px)]:inline">
                  Nenhuma acomodação corresponde aos filtros.
                </span>
              </>
            )
          ) : dateRange ? (
            `Não encontramos disponibilidade confirmada para ${searchContext}. Experimente outras datas ou ajuste os filtros.`
          ) : (
            'Experimente outras datas ou ajuste os filtros para ver mais opções.'
          )}
        </p>
      </div>
      {hasAvailableResults && onClearFilters ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-1 inline-flex min-h-11 items-center justify-center rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 [@media(max-height:400px)]:mt-0 [@media(max-height:400px)]:min-h-10 [@media(max-height:400px)]:py-2"
        >
          Limpar filtros
        </button>
      ) : !hasAvailableResults && onOpenSearch ? (
        <button
          type="button"
          onClick={onOpenSearch}
          className="mt-1 inline-flex min-h-11 items-center justify-center rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          {dateRange ? 'Alterar datas e hóspedes' : 'Alterar busca'}
        </button>
      ) : null}
    </div>
  );
}
