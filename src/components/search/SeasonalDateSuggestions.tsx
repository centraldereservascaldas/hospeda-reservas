import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Sparkles } from 'lucide-react';
import type { Property } from '../../types';
import type { AccommodationWidgetSearchParams } from '../../hooks/useAccommodationSearch';
import {
  getHomeDiscoveryCollections,
  type HomeDateSuggestion,
} from '../../utils/homeDateSuggestions';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import {
  getPropertyCardImageSources,
  COLLECTION_IMAGE_SIZES,
} from '../../utils/propertyImageSources';
import { isSafeMediaUrl } from '../../utils/propertyMedia';
import { matchesPropertyCategory } from '../../utils/propertyCategories';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { getConfirmedPropertyQuote } from '../../utils/propertyDisplayPrice';
import { formatCurrency } from '../../utils/formatters';

interface SeasonalDateSuggestionsProps {
  guests: AccommodationWidgetSearchParams['guests'];
  guestCount: number;
  fallbackProperties?: Property[];
  onOpenProperty: (property: Property, params: AccommodationWidgetSearchParams) => void;
}

const EMPTY_PROPERTIES: Property[] = [];

function SuggestedPrice({
  property,
  suggestion,
  guests,
}: {
  property: Property;
  suggestion: HomeDateSuggestion;
  guests: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [price, setPrice] = useState<{
    total: number;
    expiresAt: number;
    requestKey: string;
  } | null>(null);
  const requestKey = `${property.id}|${suggestion.checkIn}|${suggestion.checkOut}|${guests}`;

  useEffect(() => {
    setPrice(null);
    if (!ref.current || typeof IntersectionObserver === 'undefined') return;
    const controller = new AbortController();
    let timer: number | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void crcnBackendApi
        .searchAccommodationsPage(
          {
            purpose: 'discovery',
            from: suggestion.checkIn,
            to: suggestion.checkOut,
            guests,
            limit: 20,
          },
          { signal: controller.signal, priority: 'visible' },
        )
        .then((result) => {
          const match = result.data.find(
            (item) =>
              item.id === property.id ||
              (item.staysListingId && item.staysListingId === property.staysListingId),
          );
          const quote = match && getConfirmedPropertyQuote(match);
          const expiresAt = Math.min(result.expiresAt ?? 0, quote?.expiresAt ?? 0);
          if (
            !quote ||
            quote.nights !==
              Math.round(
                (Date.parse(suggestion.checkOut) - Date.parse(suggestion.checkIn)) / 86_400_000,
              ) ||
            expiresAt <= Date.now() ||
            controller.signal.aborted
          )
            return;
          setPrice({ total: quote.totalAmount, expiresAt, requestKey });
          timer = window.setTimeout(() => setPrice(null), Math.max(0, expiresAt - Date.now()));
        })
        .catch(() => {});
    });
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    property.id,
    property.staysListingId,
    suggestion.checkIn,
    suggestion.checkOut,
    guests,
    requestKey,
  ]);

  return (
    <span ref={ref} className="mt-1.5 block text-xs font-semibold text-neutral-700">
      {price && price.requestKey === requestKey && price.expiresAt > Date.now()
        ? `${formatCurrency(price.total)} na hospedagem${suggestion.petFriendlyOnly ? ' · consulte taxa para pet' : ''}`
        : 'Ver disponibilidade e preço final'}
    </span>
  );
}

export const formatPeriod = (suggestion: Pick<HomeDateSuggestion, 'checkIn' | 'checkOut'>) => {
  const checkIn = new Date(`${suggestion.checkIn}T12:00:00`);
  const checkOut = new Date(`${suggestion.checkOut}T12:00:00`);
  const format = (date: Date) =>
    date
      .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
      .replace('.', '');
  return `${format(checkIn)} – ${format(checkOut)}`;
};

const getNights = (suggestion: HomeDateSuggestion) =>
  Math.round(
    (Date.parse(`${suggestion.checkOut}T00:00:00Z`) -
      Date.parse(`${suggestion.checkIn}T00:00:00Z`)) /
      86_400_000,
  );

const stablePropertyOrder = (first: Property, second: Property) =>
  (first.staysListingId || first.id).localeCompare(second.staysListingId || second.id);

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
    id: 'beverages',
    categoryId: 'beverages_allowed',
    eyebrow: 'MAIS LIBERDADE NO LAZER',
    title: 'Pode levar bebidas',
    description: 'Anúncios que informam permissão para levar bebidas ou cooler.',
    badge: 'BEBIDAS PERMITIDAS',
  },
];

export function SeasonalDateSuggestions({
  guests,
  guestCount,
  fallbackProperties = EMPTY_PROPERTIES,
  onOpenProperty,
}: SeasonalDateSuggestionsProps) {
  const [collections, setCollections] = useState(() => getHomeDiscoveryCollections());
  useEffect(() => {
    let day = new Date().toDateString();
    let timer = 0;
    const refreshDates = () => {
      const nextDay = new Date().toDateString();
      if (nextDay !== day) {
        day = nextDay;
        setCollections(getHomeDiscoveryCollections());
      }
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 1, 0);
      timer = window.setTimeout(refreshDates, Math.max(1_000, nextMidnight.getTime() - Date.now()));
    };
    const refreshOnReturn = () => {
      if (document.visibilityState === 'hidden') return;
      window.clearTimeout(timer);
      refreshDates();
    };
    refreshDates();
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, []);
  const suggestions = useMemo(
    () => collections.flatMap((collection) => collection.suggestions),
    [collections],
  );
  const tracksRef = useRef<Record<string, HTMLDivElement | null>>({});
  const properties = useMemo(
    () =>
      [...fallbackProperties]
        .filter((property) => !property.simulatedData && property.images?.some(isSafeMediaUrl))
        .sort(stablePropertyOrder),
    [fallbackProperties],
  );
  const petProperties = useMemo(
    () => properties.filter((property) => matchesPropertyCategory(property, 'pet_friendly')),
    [properties],
  );
  const categoryCollections = catalogCollections
    .map((collection) => ({
      ...collection,
      properties: properties
        .filter((property) => matchesPropertyCategory(property, collection.categoryId))
        .slice(0, 8),
    }))
    .filter((collection) => collection.properties.length > 0);

  const scrollTrack = (id: string, direction: -1 | 1) => {
    tracksRef.current[id]?.scrollBy({ left: direction * 340, behavior: 'smooth' });
  };

  const carouselControls = (id: string) => (
    <div className="hidden shrink-0 gap-2 sm:flex" aria-label="Controles do carrossel">
      <button
        type="button"
        onClick={() => scrollTrack(id, -1)}
        aria-label="Ver opções anteriores"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-800 shadow-sm transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-800"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => scrollTrack(id, 1)}
        aria-label="Ver mais opções"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-800 shadow-sm transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-800"
      >
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );

  const carouselHeading = (id: string, eyebrow: string, title: string, description: string) => (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700 sm:text-xs">
          <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
          {eyebrow}
        </p>
        <h2
          id={`${id}-title`}
          className="text-xl font-semibold tracking-tight text-neutral-950 sm:text-2xl"
        >
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-600 sm:text-sm">
          {description}
        </p>
      </div>
      {carouselControls(id)}
    </div>
  );

  return (
    <div aria-label="Coleções de hospedagens" className="mb-9 space-y-9 sm:mb-12 sm:space-y-12">
      {collections.map((collection) => {
        const collectionProperties = collection.includePet ? petProperties : properties;
        const datedSuggestions = collection.suggestions
          .map((suggestion) => ({
            suggestion,
            property:
              collectionProperties.length > 0
                ? collectionProperties[
                    (suggestion.propertyIndex ?? 0) % collectionProperties.length
                  ]
                : undefined,
          }))
          .filter((entry) => Boolean(entry.property));

        if (datedSuggestions.length === 0) return null;

        return (
          <section
            key={collection.id}
            aria-labelledby={`${collection.id}-title`}
            className="space-y-1"
          >
            {carouselHeading(
              collection.id,
              collection.eyebrow,
              collection.title,
              collection.description,
            )}
            <div
              ref={(element) => {
                tracksRef.current[collection.id] = element;
              }}
              className="mx-auto flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {datedSuggestions.map(({ suggestion, property }, suggestionIndex) => {
                if (!property) return null;
                const image = property.images.find(isSafeMediaUrl);
                const petGuests = collection.includePet
                  ? {
                      adults: guests?.adults ?? guestCount,
                      children: guests?.children ?? 0,
                      infants: guests?.infants ?? 0,
                      pets: Math.max(1, guests?.pets ?? 0),
                    }
                  : guests;
                const title = getPublicPropertyTitle(property.title);
                const nights = getNights(suggestion);
                return (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() =>
                      onOpenProperty(property, {
                        checkIn: suggestion.checkIn,
                        checkOut: suggestion.checkOut,
                        persons: guestCount,
                        guests: petGuests,
                      })
                    }
                    aria-label={`${title}, ${suggestion.label}, ${formatPeriod(suggestion)}. Ver disponibilidade e preço final`}
                    className="group w-[76vw] max-w-[21rem] shrink-0 snap-center rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-800 sm:w-[19rem] lg:w-[21rem]"
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden rounded-[1.25rem] bg-neutral-100">
                      {image ? (
                        <img
                          {...getPropertyCardImageSources(image, COLLECTION_IMAGE_SIZES)}
                          decoding="async"
                          alt={title}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
                          loading={suggestionIndex === 0 ? 'eager' : 'lazy'}
                          fetchPriority={suggestionIndex === 0 ? 'high' : 'auto'}
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-neutral-100 to-sky-100 text-neutral-500">
                          <CalendarDays aria-hidden="true" className="h-7 w-7" />
                        </span>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-neutral-800 shadow-sm">
                        {collection.includePet ? 'ACEITA PET' : suggestion.eyebrow}
                      </span>
                      <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold text-neutral-900 shadow-sm">
                        {formatPeriod(suggestion)}
                      </span>
                    </span>
                    <span className="mt-3 flex items-start justify-between gap-2 px-0.5">
                      <span className="min-w-0">
                        <span className="line-clamp-1 block text-sm font-semibold text-neutral-950">
                          {title}
                        </span>
                        <span className="mt-0.5 line-clamp-1 block text-xs font-medium text-neutral-600">
                          {property.complexName || property.location.city} · {nights}{' '}
                          {nights === 1 ? 'noite' : 'noites'} · até {property.maxGuests} hóspedes
                        </span>
                        <SuggestedPrice
                          property={property}
                          suggestion={suggestion}
                          guests={guestCount}
                        />
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0 text-neutral-700 transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {categoryCollections.map((collection) => {
        const period = suggestions[0];
        if (!period) return null;
        return (
          <section key={collection.id} aria-labelledby={`${collection.id}-title`}>
            {carouselHeading(
              collection.id,
              collection.eyebrow,
              collection.title,
              collection.description,
            )}
            <div
              ref={(element) => {
                tracksRef.current[collection.id] = element;
              }}
              className="mx-auto flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {collection.properties.map((property) => {
                return (
                  <button
                    key={`${collection.id}-${property.id}`}
                    type="button"
                    onClick={() =>
                      onOpenProperty(property, {
                        checkIn: period.checkIn,
                        checkOut: period.checkOut,
                        persons: guestCount,
                        guests,
                      })
                    }
                    aria-label={`${getPublicPropertyTitle(property.title)}, ${collection.title}, consultar disponibilidade para ${formatPeriod(period)}`}
                    className="group w-[72vw] max-w-[17rem] shrink-0 snap-center rounded-2xl text-left transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-800 sm:w-[17rem]"
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden rounded-2xl border border-white/90 bg-neutral-100 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.7)]">
                      <img
                        {...getPropertyCardImageSources(
                          property.images.find(isSafeMediaUrl) || '',
                          COLLECTION_IMAGE_SIZES,
                        )}
                        decoding="async"
                        alt={getPublicPropertyTitle(property.title)}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                      <span className="absolute left-3 top-3 rounded-full border border-white/80 bg-white/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-neutral-800 shadow-sm backdrop-blur-md">
                        {collection.badge}
                      </span>
                      <span className="absolute bottom-3 left-3 rounded-full border border-white/80 bg-neutral-950/72 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
                        {formatPeriod(period)}
                      </span>
                    </span>
                    <span className="mt-3 flex items-start justify-between gap-2 px-0.5">
                      <span className="min-w-0">
                        <span className="line-clamp-1 block text-sm font-semibold text-neutral-950">
                          {getPublicPropertyTitle(property.title)}
                        </span>
                        <span className="mt-0.5 line-clamp-1 block text-xs font-medium text-neutral-600">
                          {property.complexName || property.location.city} · até{' '}
                          {property.maxGuests} hóspedes
                        </span>
                        <span className="mt-1.5 block text-xs font-semibold text-neutral-700">
                          Consultar preço final e disponibilidade
                        </span>
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0 text-neutral-700 transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
