import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, LoaderCircle, Sparkles } from 'lucide-react';
import type { Currency, Property } from '../../types';
import type { AccommodationWidgetSearchParams } from '../../hooks/useAccommodationSearch';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { useDiscoveryVisibility } from './useDiscoveryVisibility';
import { formatCurrency } from '../../utils/formatters';
import {
  getHomeDiscoveryCollections,
  type HomeDateSuggestion,
} from '../../utils/homeDateSuggestions';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import { getConfirmedPropertyQuote } from '../../utils/propertyDisplayPrice';
import { isRecord } from '../../utils/apiValidation';
import {
  getPropertyCardImageSources,
  COLLECTION_IMAGE_SIZES,
} from '../../utils/propertyImageSources';
import { isSafeMediaUrl } from '../../utils/propertyMedia';
import { matchesPropertyCategory } from '../../utils/propertyCategories';

interface SeasonalDateSuggestionsProps {
  currency: Currency;
  guests: AccommodationWidgetSearchParams['guests'];
  guestCount: number;
  fallbackProperties?: Property[];
  onSelect: (params: AccommodationWidgetSearchParams) => void | Promise<void>;
}

interface SuggestionQuote {
  status: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  total?: number;
  expiresAt?: number;
  guests?: number;
  nightly?: number;
  properties?: number;
  propertyTitle?: string;
  propertyImage?: string;
  propertyLocation?: string;
}

const EMPTY_PROPERTIES: Property[] = [];

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

const cacheKey = (suggestionId: string, suggestion: HomeDateSuggestion, guestCount: number) =>
  `crcn.home-date-quote.v6.${suggestionId}.${suggestion.checkIn}.${suggestion.checkOut}.${guestCount}`;

function readCachedQuote(
  suggestionId: string,
  suggestion: HomeDateSuggestion,
  guestCount: number,
): SuggestionQuote | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey(suggestionId, suggestion, guestCount));
    if (!raw) return null;
    const cached: unknown = JSON.parse(raw);
    if (
      !isRecord(cached) ||
      cached.guests !== guestCount ||
      typeof cached.expiresAt !== 'number' ||
      !Number.isFinite(cached.expiresAt) ||
      cached.expiresAt <= Date.now()
    )
      return null;
    if (cached.status !== 'ready' && cached.status !== 'unavailable') return null;
    if (
      cached.status === 'ready' &&
      (typeof cached.total !== 'number' ||
        !Number.isFinite(cached.total) ||
        cached.total <= 0 ||
        typeof cached.nightly !== 'number' ||
        !Number.isFinite(cached.nightly) ||
        cached.nightly <= 0 ||
        typeof cached.propertyTitle !== 'string')
    )
      return null;
    return {
      status: cached.status,
      expiresAt: cached.expiresAt,
      guests: guestCount,
      total: typeof cached.total === 'number' ? cached.total : undefined,
      nightly: typeof cached.nightly === 'number' ? cached.nightly : undefined,
      propertyTitle: typeof cached.propertyTitle === 'string' ? cached.propertyTitle : undefined,
      propertyLocation:
        typeof cached.propertyLocation === 'string' ? cached.propertyLocation : undefined,
      propertyImage:
        typeof cached.propertyImage === 'string' && isSafeMediaUrl(cached.propertyImage)
          ? cached.propertyImage
          : undefined,
    };
  } catch {
    return null;
  }
}

function writeCachedQuote(
  suggestionId: string,
  suggestion: HomeDateSuggestion,
  guestCount: number,
  quote: SuggestionQuote,
) {
  if (quote.status === 'error') return;
  try {
    window.sessionStorage.setItem(
      cacheKey(suggestionId, suggestion, guestCount),
      JSON.stringify({ ...quote, cachedAt: Date.now() }),
    );
  } catch {
    // The suggestions still work when storage is unavailable.
  }
}

const confirmedQuote = (property: Property, nights?: number) => {
  const quote = getConfirmedPropertyQuote(property);
  return quote && (nights === undefined || quote.nights === nights) ? quote : null;
};

export function SeasonalDateSuggestions({
  currency,
  guests,
  guestCount,
  fallbackProperties = EMPTY_PROPERTIES,
  onSelect,
}: SeasonalDateSuggestionsProps) {
  const [collections] = useState(() => getHomeDiscoveryCollections());
  const suggestions = useMemo(
    () => collections.flatMap((collection) => collection.suggestions),
    [collections],
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const visibilityKeys = useMemo(
    () => [...suggestions.map((suggestion) => suggestion.id), 'catalog'],
    [suggestions],
  );
  const visibleKeys = useDiscoveryVisibility(rootRef, visibilityKeys);
  const catalogVisible = visibleKeys.has('catalog');
  const periodGroups = useMemo(() => {
    const groups = new Map<string, typeof suggestions>();
    for (const suggestion of suggestions) {
      const key = `${suggestion.checkIn}|${suggestion.checkOut}`;
      groups.set(key, [...(groups.get(key) ?? []), suggestion]);
    }
    return [...groups.entries()];
  }, [suggestions]);
  const requestsRef = useRef(
    new Map<string, { controller: AbortController; ids: string[]; guests: number }>(),
  );
  const catalogCacheRef = useRef({ guests: 0, expiresAt: 0 });
  const metadataLoadedRef = useRef(false);
  const catalogPeriod = collections[0]?.suggestions[0];
  const [quotes, setQuotes] = useState<Record<string, SuggestionQuote>>(() =>
    Object.fromEntries(
      suggestions.map((suggestion) => [
        suggestion.id,
        readCachedQuote(suggestion.id, suggestion, guestCount) ?? { status: 'idle' },
      ]),
    ),
  );
  const [catalogQuotes, setCatalogQuotes] = useState<
    Record<string, NonNullable<ReturnType<typeof confirmedQuote>>>
  >({});
  const [catalogExpiresAt, setCatalogExpiresAt] = useState<number | null>(null);
  const [catalogQuoteGuests, setCatalogQuoteGuests] = useState<number | null>(null);
  const [catalogSearchProperties, setCatalogSearchProperties] = useState<Property[]>([]);
  const [categoryMetadataProperties, setCategoryMetadataProperties] = useState<Property[]>([]);

  useEffect(() => {
    setQuotes(
      Object.fromEntries(
        suggestions.map((suggestion) => [
          suggestion.id,
          readCachedQuote(suggestion.id, suggestion, guestCount) ?? { status: 'idle' },
        ]),
      ),
    );
  }, [guestCount, suggestions]);

  useEffect(() => {
    const activeGroups = periodGroups.filter(([, group]) =>
      group.some((suggestion) => visibleKeys.has(suggestion.id)),
    );
    const activeKeys = new Set(activeGroups.map(([period]) => `${period}|${guestCount}`));
    for (const [key, entry] of requestsRef.current) {
      if (!activeKeys.has(key)) {
        entry.controller.abort();
        requestsRef.current.delete(key);
        setQuotes((current) =>
          Object.fromEntries(
            Object.entries(current).map(([id, quote]) => [
              id,
              entry.ids.includes(id) && quote.guests === entry.guests && quote.status === 'loading'
                ? { status: 'idle', guests: entry.guests }
                : quote,
            ]),
          ),
        );
      }
    }
    for (const [period, group] of activeGroups) {
      const key = `${period}|${guestCount}`;
      if (
        requestsRef.current.has(key) ||
        group.every((suggestion) => readCachedQuote(suggestion.id, suggestion, guestCount))
      )
        continue;
      const controller = new AbortController();
      requestsRef.current.set(key, {
        controller,
        ids: group.map((item) => item.id),
        guests: guestCount,
      });
      setQuotes((current) => ({
        ...current,
        ...Object.fromEntries(
          group.map((suggestion) => [
            suggestion.id,
            { status: 'loading', guests: guestCount } satisfies SuggestionQuote,
          ]),
        ),
      }));
      const suggestion = group[0]!;
      void crcnBackendApi
        .searchAccommodationsPage(
          {
            purpose: 'discovery',
            from: suggestion.checkIn,
            to: suggestion.checkOut,
            guests: guestCount,
            limit: 8,
          },
          { signal: controller.signal, priority: 'visible' },
        )
        .then((result) => {
          if (controller.signal.aborted) return;
          const confirmed = result.data
            .map((property) => ({
              property,
              price: confirmedQuote(property, getNights(suggestion)),
            }))
            .filter(
              (
                item,
              ): item is {
                property: Property;
                price: NonNullable<ReturnType<typeof confirmedQuote>>;
              } => Boolean(item.price),
            )
            .sort((first, second) => first.price.totalAmount - second.price.totalAmount);
          const next: Record<string, SuggestionQuote> = {};
          for (const item of group) {
            const featured = confirmed[(item.propertyIndex ?? 0) % Math.max(confirmed.length, 1)];
            const quote: SuggestionQuote = featured
              ? {
                  status: 'ready',
                  total: featured.price.totalAmount,
                  nightly: featured.price.dailyRate,
                  properties: confirmed.length,
                  propertyTitle: getPublicPropertyTitle(featured.property.title),
                  propertyImage: featured.property.images[0],
                  propertyLocation:
                    featured.property.complexName || featured.property.location.city,
                }
              : {
                  status:
                    result.unquotedCount > 0 || result.pagination.hasMore ? 'error' : 'unavailable',
                };
            quote.expiresAt = Math.min(result.expiresAt ?? Infinity, Date.now() + 45_000);
            quote.guests = guestCount;
            writeCachedQuote(item.id, item, guestCount, quote);
            next[item.id] = quote;
          }
          setQuotes((current) => ({ ...current, ...next }));
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setQuotes((current) => ({
            ...current,
            ...Object.fromEntries(
              group.map((item) => [
                item.id,
                { status: 'error', guests: guestCount } satisfies SuggestionQuote,
              ]),
            ),
          }));
        });
    }
  }, [guestCount, periodGroups, visibleKeys]);

  useEffect(() => {
    const requests = requestsRef.current;
    return () => {
      requests.forEach((entry) => entry.controller.abort());
      requests.clear();
    };
  }, []);

  useEffect(() => {
    const expirations = Object.values(quotes).flatMap((quote) =>
      quote.status === 'ready' && quote.expiresAt ? [quote.expiresAt] : [],
    );
    if (expirations.length === 0) return;
    const timer = window.setTimeout(
      () => {
        setQuotes((current) =>
          Object.fromEntries(
            Object.entries(current).map(([id, quote]) => [
              id,
              quote.expiresAt && quote.expiresAt <= Date.now()
                ? { status: 'error', guests: quote.guests }
                : quote,
            ]),
          ),
        );
      },
      Math.max(0, Math.min(...expirations) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [quotes]);

  useEffect(() => {
    if (!catalogPeriod || !catalogVisible) return;
    if (
      catalogCacheRef.current.guests === guestCount &&
      catalogCacheRef.current.expiresAt > Date.now()
    )
      return;
    setCatalogQuotes({});
    setCatalogQuoteGuests(null);
    let cancelled = false;
    const controller = new AbortController();

    void crcnBackendApi
      .searchAccommodationsPage(
        {
          purpose: 'discovery',
          from: catalogPeriod.checkIn,
          to: catalogPeriod.checkOut,
          guests: guestCount,
          limit: 20,
        },
        { signal: controller.signal, priority: 'visible' },
      )
      .then((result) => {
        if (cancelled) return;
        setCatalogSearchProperties(result.data);
        const next: Record<string, NonNullable<ReturnType<typeof confirmedQuote>>> = {};
        result.data.forEach((property) => {
          const quote = confirmedQuote(property, getNights(catalogPeriod));
          if (!quote) return;
          [property.id, property.staysListingId]
            .filter((key): key is string => Boolean(key))
            .forEach((key) => {
              next[key] = quote;
            });
        });
        setCatalogQuotes(next);
        catalogCacheRef.current = {
          guests: guestCount,
          expiresAt: Math.min(result.expiresAt ?? Infinity, Date.now() + 45_000),
        };
        setCatalogExpiresAt(catalogCacheRef.current.expiresAt);
        setCatalogQuoteGuests(guestCount);
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogQuotes({});
          setCatalogSearchProperties([]);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [catalogPeriod, catalogVisible, guestCount]);

  useEffect(() => {
    if (!catalogVisible || metadataLoadedRef.current) return;
    let cancelled = false;
    const controller = new AbortController();
    void crcnBackendApi
      .searchAccommodationsPage({ limit: 20 }, { signal: controller.signal, priority: 'visible' })
      .then((result) => {
        if (!cancelled) {
          metadataLoadedRef.current = true;
          setCategoryMetadataProperties(result.data);
        }
      })
      .catch(() => {
        if (!cancelled) setCategoryMetadataProperties([]);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [catalogVisible]);

  useEffect(() => {
    if (catalogExpiresAt === null) return;
    const timer = window.setTimeout(
      () => setCatalogQuotes({}),
      Math.max(0, catalogExpiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [catalogExpiresAt]);

  const petFriendlyProperties = fallbackProperties.filter((property) =>
    matchesPropertyCategory(property, 'pet_friendly'),
  );
  const catalogSourceProperties = [
    ...categoryMetadataProperties,
    ...catalogSearchProperties,
    ...fallbackProperties,
  ].filter(
    (property, index, all) =>
      all.findIndex(
        (candidate) =>
          candidate.id === property.id ||
          (candidate.staysPropertyId && candidate.staysPropertyId === property.staysPropertyId),
      ) === index,
  );
  const catalogCollections = [
    {
      id: 'pools-24h',
      categoryId: 'pools_24h',
      eyebrow: 'DIVERSÃO A QUALQUER HORA',
      title: 'Piscinas 24 horas',
      description: 'Condomínios com estrutura aquática disponível dia e noite.',
      badge: 'PISCINAS 24H',
    },
    {
      id: 'near-center',
      categoryId: 'near_center',
      eyebrow: 'LOCALIZAÇÃO PRÁTICA',
      title: 'Pertinho do centro',
      description: 'Opções a até 3 km do centro para facilitar seus passeios e refeições.',
      badge: 'ATÉ 3 KM',
    },
    {
      id: 'family',
      categoryId: 'family_friendly',
      eyebrow: 'ESPAÇO PARA TODO MUNDO',
      title: 'Ideais para famílias',
      description: 'Apartamentos com capacidade para quatro ou mais hóspedes.',
      badge: 'PARA FAMÍLIAS',
    },
    {
      id: 'waterpark',
      categoryId: 'waterpark_included',
      eyebrow: 'LAZER NA HOSPEDAGEM',
      title: 'Com parque aquático incluso',
      description: 'Imóveis cujo anúncio informa acesso ou entrada para parque aquático.',
      badge: 'PARQUE INCLUSO',
    },
    {
      id: 'hot-tub',
      categoryId: 'hot_tub',
      eyebrow: 'RELAXE DE VERDADE',
      title: 'Com hidromassagem',
      description: 'Hospedagens com hidromassagem, ofurô ou jacuzzi informados no anúncio.',
      badge: 'HIDROMASSAGEM',
    },
    {
      id: 'beverages',
      categoryId: 'beverages_allowed',
      eyebrow: 'MAIS LIBERDADE NO LAZER',
      title: 'Pode levar bebidas',
      description: 'Anúncios que informam permissão para levar bebidas ou cooler.',
      badge: 'BEBIDAS PERMITIDAS',
    },
  ]
    .map((collection) => ({
      ...collection,
      properties: catalogSourceProperties
        .filter((property) => matchesPropertyCategory(property, collection.categoryId))
        .slice(0, 5),
    }))
    .filter((collection) => collection.properties.length > 0);

  return (
    <div
      ref={rootRef}
      aria-label="Coleções de hospedagens"
      className="mb-8 space-y-8 sm:mb-11 sm:space-y-10"
    >
      {collections.map((collection, collectionIndex) => (
        <section key={collection.id} aria-labelledby={`${collection.id}-title`}>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-orange-700 sm:text-xs">
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                {collection.eyebrow}
              </p>
              <h2
                id={`${collection.id}-title`}
                className="text-xl font-extrabold tracking-tight text-neutral-950 sm:text-2xl"
              >
                {collection.title}
              </h2>
              <p className="mt-1 text-xs leading-5 text-neutral-600 sm:text-sm">
                {collection.description}
              </p>
            </div>
          </div>

          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-5">
            {collection.suggestions.map((suggestion, suggestionIndex) => {
              const quote =
                quotes[suggestion.id]?.guests === guestCount
                  ? quotes[suggestion.id]!
                  : { status: 'idle' as const };
              const nights = getNights(suggestion);
              const selectedGuests = collection.includePet
                ? {
                    adults: guests?.adults ?? guestCount,
                    children: guests?.children ?? 0,
                    infants: guests?.infants ?? 0,
                    pets: Math.max(1, guests?.pets ?? 0),
                  }
                : guests;
              const petStatus = collection.includePet
                ? petFriendlyProperties.some(
                    (property) => getPublicPropertyTitle(property.title) === quote.propertyTitle,
                  )
                  ? 'Aceita pet'
                  : 'Consulte pet'
                : suggestion.eyebrow;
              return (
                <button
                  key={suggestion.id}
                  data-discovery-query={suggestion.id}
                  type="button"
                  onClick={() =>
                    void onSelect({
                      checkIn: suggestion.checkIn,
                      checkOut: suggestion.checkOut,
                      persons: guestCount,
                      guests: selectedGuests,
                    })
                  }
                  aria-label={`${suggestion.label}, ${formatPeriod(suggestion)}${quote.status === 'ready' && quote.total ? `, a partir de ${formatCurrency(quote.total, currency)}` : ', consultar disponibilidade'}`}
                  className="group w-[72vw] max-w-[17rem] shrink-0 snap-start rounded-2xl text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700 sm:w-auto sm:max-w-none"
                >
                  <span className="relative block aspect-[4/3] overflow-hidden rounded-2xl border border-white/90 bg-neutral-100 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.7)]">
                    {quote.propertyImage ? (
                      <img
                        {...getPropertyCardImageSources(
                          quote.propertyImage,
                          COLLECTION_IMAGE_SIZES,
                        )}
                        decoding="async"
                        alt={quote.status === 'ready' ? quote.propertyTitle : suggestion.label}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading={collectionIndex === 0 && suggestionIndex === 0 ? 'eager' : 'lazy'}
                        fetchPriority={
                          collectionIndex === 0 && suggestionIndex === 0 ? 'high' : 'auto'
                        }
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-50 via-white to-sky-100 text-neutral-500">
                        {quote.status === 'loading' ? (
                          <LoaderCircle aria-hidden="true" className="h-6 w-6 animate-spin" />
                        ) : (
                          <CalendarDays aria-hidden="true" className="h-7 w-7" />
                        )}
                      </span>
                    )}
                    <span className="absolute left-3 top-3 rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-orange-700 shadow-sm backdrop-blur-md">
                      {petStatus}
                    </span>
                    <span className="absolute bottom-3 left-3 rounded-full border border-white/80 bg-neutral-950/72 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
                      {formatPeriod(suggestion)}
                    </span>
                  </span>

                  <span className="mt-3 flex items-start justify-between gap-2 px-0.5">
                    <span className="min-w-0">
                      <span className="line-clamp-1 block text-sm font-extrabold text-neutral-950">
                        {quote.status === 'ready' ? quote.propertyTitle : suggestion.label}
                      </span>
                      <span className="mt-0.5 line-clamp-1 block text-xs font-medium text-neutral-600">
                        {quote.status === 'ready' ? quote.propertyLocation : 'Sugestão de viagem'} ·{' '}
                        {nights} {nights === 1 ? 'noite' : 'noites'} · {guestCount}{' '}
                        {guestCount === 1 ? 'hóspede' : 'hóspedes'}
                      </span>
                      {quote.status === 'loading' ? (
                        <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                          <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                          Consultando preço…
                        </span>
                      ) : quote.status === 'ready' && quote.total ? (
                        <span className="mt-1.5 block text-xs text-neutral-700">
                          <strong className="text-sm text-neutral-950">
                            {formatCurrency(quote.total, currency)}
                          </strong>{' '}
                          total
                        </span>
                      ) : (
                        <span className="mt-1.5 block text-xs font-bold text-neutral-700">
                          {quote.status === 'error'
                            ? 'Consulta indisponível. Tente buscar.'
                            : 'Explore opções para estas datas'}
                        </span>
                      )}
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <div data-discovery-query="catalog" className="min-h-px space-y-8 sm:space-y-10">
        {catalogPeriod &&
          catalogCollections.map((collection) => (
            <section key={collection.id} aria-labelledby={`${collection.id}-title`}>
              <div className="mb-4">
                <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-orange-700 sm:text-xs">
                  <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                  {collection.eyebrow}
                </p>
                <h2
                  id={`${collection.id}-title`}
                  className="text-xl font-extrabold tracking-tight text-neutral-950 sm:text-2xl"
                >
                  {collection.title}
                </h2>
                <p className="mt-1 text-xs leading-5 text-neutral-600 sm:text-sm">
                  {collection.description}
                </p>
              </div>

              <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-5">
                {collection.properties.map((property) => {
                  const propertyQuote =
                    catalogQuoteGuests === guestCount
                      ? catalogQuotes[property.id] ||
                        (property.staysListingId
                          ? catalogQuotes[property.staysListingId]
                          : undefined)
                      : undefined;
                  const priceLabel = propertyQuote
                    ? `${formatCurrency(propertyQuote.totalAmount, currency)} no total`
                    : 'explorar opções, preço ainda não confirmado';
                  return (
                    <button
                      key={`${collection.id}-${property.id}`}
                      type="button"
                      onClick={() =>
                        void onSelect({
                          checkIn: catalogPeriod.checkIn,
                          checkOut: catalogPeriod.checkOut,
                          persons: guestCount,
                          guests,
                          propertyId:
                            property.staysPropertyId || property.staysListingId || property.id,
                        })
                      }
                      aria-label={`${getPublicPropertyTitle(property.title)}, ${collection.title}, ${propertyQuote ? formatPeriod(catalogPeriod) : 'sugestão de hospedagem'}, ${priceLabel}`}
                      className="group w-[72vw] max-w-[17rem] shrink-0 snap-start rounded-2xl text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700 sm:w-auto sm:max-w-none"
                    >
                      <span className="relative block aspect-[4/3] overflow-hidden rounded-2xl border border-white/90 bg-neutral-100 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.7)]">
                        <img
                          {...getPropertyCardImageSources(
                            property.images[0] || '',
                            COLLECTION_IMAGE_SIZES,
                          )}
                          decoding="async"
                          alt={getPublicPropertyTitle(property.title)}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <span className="absolute left-3 top-3 rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-orange-700 shadow-sm backdrop-blur-md">
                          {collection.badge}
                        </span>
                        <span className="absolute bottom-3 left-3 rounded-full border border-white/80 bg-neutral-950/72 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
                          {propertyQuote ? formatPeriod(catalogPeriod) : 'Explore acomodações'}
                        </span>
                      </span>

                      <span className="mt-3 flex items-start justify-between gap-2 px-0.5">
                        <span className="min-w-0">
                          <span className="line-clamp-1 block text-sm font-extrabold text-neutral-950">
                            {getPublicPropertyTitle(property.title)}
                          </span>
                          <span className="mt-0.5 line-clamp-1 block text-xs font-medium text-neutral-600">
                            {property.complexName || property.location.city} · até{' '}
                            {property.maxGuests} hóspedes
                          </span>
                          {propertyQuote ? (
                            <span className="mt-1.5 block text-xs text-neutral-700">
                              <strong className="text-sm text-neutral-950">
                                {formatCurrency(propertyQuote.totalAmount, currency)}
                              </strong>{' '}
                              total · {propertyQuote.nights} noites · {guestCount}{' '}
                              {guestCount === 1 ? 'hóspede' : 'hóspedes'}
                            </span>
                          ) : (
                            <span className="mt-1.5 block text-xs font-bold text-neutral-700">
                              Sugestão de hospedagem · consulte as datas
                            </span>
                          )}
                        </span>
                        <ArrowRight
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-orange-700 transition-transform group-hover:translate-x-0.5"
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}
