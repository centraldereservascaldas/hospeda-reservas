import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, LoaderCircle, Sparkles } from 'lucide-react';
import type { Currency, Property } from '../../types';
import type { AccommodationWidgetSearchParams } from '../../hooks/useAccommodationSearch';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { formatCurrency } from '../../utils/formatters';
import {
  getHomeDiscoveryCollections,
  type HomeDateSuggestion,
} from '../../utils/homeDateSuggestions';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import { matchesPropertyCategory } from '../../utils/propertyCategories';

interface SeasonalDateSuggestionsProps {
  currency: Currency;
  guests: AccommodationWidgetSearchParams['guests'];
  guestCount: number;
  fallbackProperties?: Property[];
  onSelect: (params: AccommodationWidgetSearchParams) => void | Promise<void>;
}

interface SuggestionQuote {
  status: 'loading' | 'ready' | 'unavailable';
  total?: number;
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
  `crcn.home-date-quote.v5.${suggestionId}.${suggestion.checkIn}.${suggestion.checkOut}.${guestCount}`;

function readCachedQuote(
  suggestionId: string,
  suggestion: HomeDateSuggestion,
  guestCount: number,
): SuggestionQuote | null {
  try {
    const raw = window.sessionStorage.getItem(cacheKey(suggestionId, suggestion, guestCount));
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
  suggestionId: string,
  suggestion: HomeDateSuggestion,
  guestCount: number,
  quote: SuggestionQuote,
) {
  try {
    window.sessionStorage.setItem(
      cacheKey(suggestionId, suggestion, guestCount),
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
  fallbackProperties = EMPTY_PROPERTIES,
  onSelect,
}: SeasonalDateSuggestionsProps) {
  const [collections] = useState(() => getHomeDiscoveryCollections());
  const suggestions = useMemo(
    () => collections.flatMap((collection) => collection.suggestions),
    [collections],
  );
  const catalogPeriod = collections[0]?.suggestions[0];
  const [quotes, setQuotes] = useState<Record<string, SuggestionQuote>>(() =>
    Object.fromEntries(
      suggestions.map((suggestion) => [
        suggestion.id,
        readCachedQuote(suggestion.id, suggestion, guestCount) ?? { status: 'loading' },
      ]),
    ),
  );
  const [catalogQuotes, setCatalogQuotes] = useState<
    Record<string, NonNullable<ReturnType<typeof confirmedQuote>>>
  >({});
  const [catalogSearchProperties, setCatalogSearchProperties] = useState<Property[]>([]);
  const [categoryMetadataProperties, setCategoryMetadataProperties] = useState<Property[]>([]);

  useEffect(() => {
    let cancelled = false;
    const loadQuotes = async () => {
      const searches = new Map<string, ReturnType<typeof crcnBackendApi.searchAccommodations>>();
      await Promise.all(
        suggestions.map(async (suggestion, index) => {
          if (readCachedQuote(suggestion.id, suggestion, guestCount)) return;
          let quote: SuggestionQuote = { status: 'unavailable' };
          try {
            const searchKey = `${suggestion.checkIn}|${suggestion.checkOut}|${guestCount}`;
            let search = searches.get(searchKey);
            if (!search) {
              search = crcnBackendApi.searchAccommodations({
                from: suggestion.checkIn,
                to: suggestion.checkOut,
                guests: guestCount,
                limit: 8,
              });
              searches.set(searchKey, search);
            }
            const result = await search;
            const confirmed = result.data
              .map((property) => ({ property, price: confirmedQuote(property) }))
              .filter(
                (
                  item,
                ): item is {
                  property: Property;
                  price: NonNullable<ReturnType<typeof confirmedQuote>>;
                } => Boolean(item.price),
              )
              .sort((first, second) => first.price.totalAmount - second.price.totalAmount);
            const propertyIndex = suggestion.propertyIndex ?? 0;
            const featuredConfirmed = confirmed[propertyIndex % Math.max(confirmed.length, 1)];
            if (featuredConfirmed) {
              const featured = featuredConfirmed;
              quote = {
                status: 'ready',
                total: featured.price.totalAmount,
                nightly: featured.price.dailyRate,
                properties: confirmed.length,
                propertyTitle: getPublicPropertyTitle(featured.property.title),
                propertyImage: featured.property.images[0],
                propertyLocation: featured.property.complexName || featured.property.location.city,
              };
            } else {
              const featured =
                result.data[propertyIndex % Math.max(result.data.length, 1)] ||
                (fallbackProperties.length
                  ? fallbackProperties[index % fallbackProperties.length]
                  : undefined);
              if (featured) {
                quote = {
                  status: 'unavailable',
                  nightly: featured.pricePerNight,
                  propertyTitle: getPublicPropertyTitle(featured.title),
                  propertyImage: featured.images[0],
                  propertyLocation: featured.complexName || featured.location.city,
                };
              }
            }
          } catch {
            quote = { status: 'unavailable' };
          }
          writeCachedQuote(suggestion.id, suggestion, guestCount, quote);
          if (!cancelled) {
            setQuotes((current) => ({ ...current, [suggestion.id]: quote }));
          }
        }),
      );
    };
    void loadQuotes();
    return () => {
      cancelled = true;
    };
  }, [collections, fallbackProperties, guestCount, suggestions]);

  useEffect(() => {
    if (!catalogPeriod) return;
    let cancelled = false;
    void crcnBackendApi
      .searchAccommodations({
        from: catalogPeriod.checkIn,
        to: catalogPeriod.checkOut,
        guests: guestCount,
        limit: 100,
      })
      .then((result) => {
        if (cancelled) return;
        setCatalogSearchProperties(result.data);
        const next: Record<string, NonNullable<ReturnType<typeof confirmedQuote>>> = {};
        result.data.forEach((property) => {
          const quote = confirmedQuote(property);
          if (!quote) return;
          [property.id, property.staysPropertyId, property.staysListingId]
            .filter((key): key is string => Boolean(key))
            .forEach((key) => {
              next[key] = quote;
            });
        });
        setCatalogQuotes(next);
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogQuotes({});
          setCatalogSearchProperties([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [catalogPeriod, guestCount]);

  useEffect(() => {
    let cancelled = false;
    void crcnBackendApi
      .searchAccommodations({ limit: 100 })
      .then((result) => {
        if (!cancelled) setCategoryMetadataProperties(result.data);
      })
      .catch(() => {
        if (!cancelled) setCategoryMetadataProperties([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div aria-label="Coleções de hospedagens" className="mb-8 space-y-8 sm:mb-11 sm:space-y-10">
      {collections.map((collection) => (
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
            {collection.suggestions.map((suggestion) => {
              const quote = quotes[suggestion.id] ?? { status: 'loading' as const };
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
                        src={quote.propertyImage}
                        alt={quote.propertyTitle || suggestion.label}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading="lazy"
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
                        {quote.propertyTitle || suggestion.label}
                      </span>
                      <span className="mt-0.5 line-clamp-1 block text-xs font-medium text-neutral-600">
                        {quote.propertyLocation || suggestion.label} · {nights}{' '}
                        {nights === 1 ? 'noite' : 'noites'}
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
                      ) : quote.nightly ? (
                        <span className="mt-1.5 block text-xs text-neutral-700">
                          <strong className="text-sm text-neutral-950">
                            {formatCurrency(quote.nightly, currency)}
                          </strong>{' '}
                          / noite · consulte o período
                        </span>
                      ) : (
                        <span className="mt-1.5 block text-xs font-bold text-neutral-700">
                          Ver disponibilidade
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
                  catalogQuotes[property.id] ||
                  (property.staysPropertyId
                    ? catalogQuotes[property.staysPropertyId]
                    : undefined) ||
                  (property.staysListingId ? catalogQuotes[property.staysListingId] : undefined);
                const referenceNightly = property.pricePerNight > 0 ? property.pricePerNight : null;
                const priceLabel = propertyQuote
                  ? `${formatCurrency(propertyQuote.totalAmount, currency)} no total`
                  : referenceNightly
                    ? `${formatCurrency(referenceNightly, currency)} por noite`
                    : 'consultar valor';
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
                    aria-label={`${getPublicPropertyTitle(property.title)}, ${collection.title}, ${formatPeriod(catalogPeriod)}, ${priceLabel}`}
                    className="group w-[72vw] max-w-[17rem] shrink-0 snap-start rounded-2xl text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700 sm:w-auto sm:max-w-none"
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden rounded-2xl border border-white/90 bg-neutral-100 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.7)]">
                      <img
                        src={property.images[0]}
                        alt={getPublicPropertyTitle(property.title)}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                      <span className="absolute left-3 top-3 rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-orange-700 shadow-sm backdrop-blur-md">
                        {collection.badge}
                      </span>
                      <span className="absolute bottom-3 left-3 rounded-full border border-white/80 bg-neutral-950/72 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
                        {formatPeriod(catalogPeriod)}
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
                            total · {propertyQuote.nights} noites
                          </span>
                        ) : referenceNightly ? (
                          <span className="mt-1.5 block text-xs text-neutral-700">
                            <strong className="text-sm text-neutral-950">
                              {formatCurrency(referenceNightly, currency)}
                            </strong>{' '}
                            / noite · consulte o período
                          </span>
                        ) : (
                          <span className="mt-1.5 block text-xs font-bold text-neutral-700">
                            Consultar valor para as datas
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
  );
}
