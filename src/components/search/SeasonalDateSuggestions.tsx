import { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, LoaderCircle, Sparkles } from 'lucide-react';
import type { Currency, Property } from '../../types';
import type { AccommodationWidgetSearchParams } from '../../hooks/useAccommodationSearch';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { formatCurrency } from '../../utils/formatters';
import { getHomeDateSuggestions, type HomeDateSuggestion } from '../../utils/homeDateSuggestions';

interface SeasonalDateSuggestionsProps {
  currency: Currency;
  guests: AccommodationWidgetSearchParams['guests'];
  guestCount: number;
  onSelect: (params: AccommodationWidgetSearchParams) => void | Promise<void>;
}

interface SuggestionQuote {
  status: 'loading' | 'ready' | 'unavailable';
  total?: number;
  nightly?: number;
  properties?: number;
}

const formatPeriod = (suggestion: HomeDateSuggestion) => {
  const checkIn = new Date(`${suggestion.checkIn}T12:00:00`);
  const checkOut = new Date(`${suggestion.checkOut}T12:00:00`);
  const format = (date: Date) =>
    date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
  return `${format(checkIn)} – ${format(checkOut)}`;
};

const getNights = (suggestion: HomeDateSuggestion) =>
  Math.round(
    (Date.parse(`${suggestion.checkOut}T00:00:00Z`) -
      Date.parse(`${suggestion.checkIn}T00:00:00Z`)) /
      86_400_000,
  );

const cacheKey = (suggestion: HomeDateSuggestion, guestCount: number) =>
  `crcn.home-date-quote.v1.${suggestion.checkIn}.${suggestion.checkOut}.${guestCount}`;

function readCachedQuote(
  suggestion: HomeDateSuggestion,
  guestCount: number,
): SuggestionQuote | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey(suggestion, guestCount));
    if (!raw) return null;
    const cached = JSON.parse(raw) as SuggestionQuote & { cachedAt?: number };
    if (!cached.cachedAt || Date.now() - cached.cachedAt > 15 * 60_000) return null;
    if (cached.status !== 'ready' && cached.status !== 'unavailable') return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCachedQuote(
  suggestion: HomeDateSuggestion,
  guestCount: number,
  quote: SuggestionQuote,
) {
  try {
    window.sessionStorage.setItem(
      cacheKey(suggestion, guestCount),
      JSON.stringify({ ...quote, cachedAt: Date.now() }),
    );
  } catch {
    // The suggestions still work when storage is unavailable.
  }
}

const confirmedQuote = (property: Property) => {
  const quote = property.calculatedPrice;
  return quote &&
    quote.currency.toUpperCase() === 'BRL' &&
    Number.isFinite(quote.totalAmount) &&
    quote.totalAmount > 0 &&
    Number.isFinite(quote.dailyRate) &&
    quote.dailyRate > 0
    ? quote
    : null;
};

export function SeasonalDateSuggestions({
  currency,
  guests,
  guestCount,
  onSelect,
}: SeasonalDateSuggestionsProps) {
  const [suggestions] = useState(() => getHomeDateSuggestions());
  const [quotes, setQuotes] = useState<Record<string, SuggestionQuote>>(() =>
    Object.fromEntries(
      suggestions.map((suggestion) => [
        suggestion.checkIn,
        readCachedQuote(suggestion, guestCount) ?? { status: 'loading' },
      ]),
    ),
  );

  useEffect(() => {
    let cancelled = false;
    const loadQuotes = async () => {
      await Promise.all(
        suggestions.map(async (suggestion) => {
          if (readCachedQuote(suggestion, guestCount)) return;
          let quote: SuggestionQuote = { status: 'unavailable' };
          try {
            const result = await crcnBackendApi.searchAccommodations({
              from: suggestion.checkIn,
              to: suggestion.checkOut,
              guests: guestCount,
              limit: 8,
            });
            const confirmed = result.data
              .map(confirmedQuote)
              .filter((item): item is NonNullable<ReturnType<typeof confirmedQuote>> =>
                Boolean(item),
              )
              .sort((first, second) => first.totalAmount - second.totalAmount);
            if (confirmed[0]) {
              quote = {
                status: 'ready',
                total: confirmed[0].totalAmount,
                nightly: confirmed[0].dailyRate,
                properties: confirmed.length,
              };
            }
          } catch {
            quote = { status: 'unavailable' };
          }
          writeCachedQuote(suggestion, guestCount, quote);
          if (!cancelled) {
            setQuotes((current) => ({ ...current, [suggestion.checkIn]: quote }));
          }
        }),
      );
    };
    void loadQuotes();
    return () => {
      cancelled = true;
    };
  }, [guestCount, suggestions]);

  return (
    <section aria-labelledby="seasonal-dates-title" className="mb-7 sm:mb-9">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-orange-700 sm:text-xs">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            Ideias para viajar
          </p>
          <h2
            id="seasonal-dates-title"
            className="text-xl font-extrabold tracking-tight text-neutral-950 sm:text-2xl"
          >
            Escolha uma data e veja os preços
          </h2>
          <p className="mt-1 text-xs leading-5 text-neutral-600 sm:text-sm">
            Fins de semana e datas especiais com valores consultados na disponibilidade real.
          </p>
        </div>
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {suggestions.map((suggestion) => {
          const quote = quotes[suggestion.checkIn] ?? { status: 'loading' as const };
          const nights = getNights(suggestion);
          return (
            <button
              key={`${suggestion.checkIn}-${suggestion.checkOut}`}
              type="button"
              onClick={() =>
                void onSelect({
                  checkIn: suggestion.checkIn,
                  checkOut: suggestion.checkOut,
                  persons: guestCount,
                  guests,
                })
              }
              aria-label={`${suggestion.label}, ${formatPeriod(suggestion)}${quote.status === 'ready' && quote.total ? `, a partir de ${formatCurrency(quote.total, currency)}` : ', consultar disponibilidade'}`}
              className="group min-h-40 w-[72vw] max-w-[17rem] shrink-0 snap-start rounded-2xl border border-neutral-300/80 bg-white/78 p-4 text-left shadow-[0_10px_30px_-24px_rgba(15,23,42,0.65),inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-orange-300 hover:bg-white hover:shadow-[0_16px_35px_-22px_rgba(194,65,12,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 sm:w-auto sm:max-w-none"
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-[9px] font-black uppercase tracking-[0.15em] text-orange-700">
                    {suggestion.eyebrow}
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-sm font-extrabold leading-5 text-neutral-950">
                    {suggestion.label}
                  </span>
                </span>
                <CalendarDays aria-hidden="true" className="h-5 w-5 shrink-0 text-orange-700" />
              </span>
              <span className="mt-3 block text-xs font-semibold text-neutral-600">
                {formatPeriod(suggestion)} · {nights} {nights === 1 ? 'noite' : 'noites'}
              </span>
              <span className="mt-4 flex min-h-9 items-end justify-between gap-2 border-t border-neutral-200/90 pt-3">
                {quote.status === 'loading' ? (
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-500">
                    <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                    Consultando…
                  </span>
                ) : quote.status === 'ready' && quote.total ? (
                  <span>
                    <span className="block text-[10px] font-semibold text-neutral-500">
                      A partir de
                    </span>
                    <strong className="text-sm text-neutral-950">
                      {formatCurrency(quote.total, currency)}
                    </strong>
                    <span className="ml-1 text-[10px] text-neutral-500">total</span>
                  </span>
                ) : (
                  <span className="text-xs font-bold text-neutral-700">Ver disponibilidade</span>
                )}
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-orange-700 transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
