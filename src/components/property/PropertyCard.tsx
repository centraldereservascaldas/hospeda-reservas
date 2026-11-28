import React, { useEffect, useId, useRef, useState } from 'react';
import { Building2, Check, ChevronLeft, ChevronRight, Heart, Star } from 'lucide-react';
import { Property, Currency } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import {
  getConfirmedPropertyQuote,
  getPropertyDisplayPrice,
} from '../../utils/propertyDisplayPrice';
import { getPropertyCardImageSources, CATALOG_IMAGE_SIZES } from '../../utils/propertyImageSources';
import { accommodationPagePath } from '../../utils/accommodationPageUrl';
import { loadImobSysCardImages } from '../../services/imobSysCardMedia';
import { IconButton } from '../IconButton';

interface PropertyCardProps {
  property: Property;
  currency: Currency;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
  onSelectProperty: (property: Property) => void;
  showTotalWithTaxes: boolean;
  hasSearchDates?: boolean;
  availabilityConfirmed?: boolean;
  searchGuestCount?: number;
  prioritizeImage?: boolean;
  eagerImage?: boolean;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  currency,
  isSaved,
  onToggleSave,
  onSelectProperty,
  showTotalWithTaxes,
  hasSearchDates = false,
  availabilityConfirmed = false,
  searchGuestCount = 1,
  prioritizeImage = false,
  eagerImage = prioritizeImage,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [partnerImages, setPartnerImages] = useState<string[] | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressPhotoClickUntilRef = useRef(0);
  const photoCarouselRef = useRef<HTMLDivElement>(null);
  const cardId = useId().replace(/:/g, '');
  const priceDescriptionId = `property-price-${cardId}`;
  const availabilityDescriptionId = `property-availability-${cardId}`;
  const images = (property.images.length ? property.images : (partnerImages ?? [])).filter(
    (image) => !failedImages.has(image),
  );
  const galleryKey = images.join('|');

  useEffect(() => {
    setPartnerImages(null);
    setFailedImages(new Set());
    if (property.dataSource !== 'imobsys-live' || property.images.length > 0) return;
    let cancelled = false;
    const load = () => {
      void loadImobSysCardImages(property.id)
        .then((result) => {
          if (!cancelled) setPartnerImages(result);
        })
        .catch(() => {
          if (!cancelled) setPartnerImages([]);
        });
    };
    const target = photoCarouselRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(target);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [property.id, property.dataSource, property.images.length]);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [property.id, galleryKey]);

  const imageCount = images.length;
  const displayTitle = getPublicPropertyTitle(property.title);
  const currentImage = images[currentImageIndex] || images[0] || '';
  const goToImage = (index: number) => setCurrentImageIndex(index);

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (imageCount > 1) setCurrentImageIndex((prev) => (prev + 1) % imageCount);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (imageCount > 1) setCurrentImageIndex((prev) => (prev - 1 + imageCount) % imageCount);
  };

  const handlePhotoTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    const photoBounds = photoCarouselRef.current?.getBoundingClientRect();
    const target = event.target;
    const isPhotoControl =
      target instanceof Element &&
      Boolean(target.closest('button:not([data-property-detail-trigger])'));

    touchStartRef.current =
      touch &&
      photoBounds &&
      !isPhotoControl &&
      touch.clientX >= photoBounds.left &&
      touch.clientX <= photoBounds.right &&
      touch.clientY >= photoBounds.top &&
      touch.clientY <= photoBounds.bottom
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  };

  const handlePhotoTouchEnd = (event: React.TouchEvent<HTMLButtonElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || imageCount < 2) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;

    suppressPhotoClickUntilRef.current = Date.now() + 500;
    setCurrentImageIndex((index) => (index + (deltaX < 0 ? 1 : -1) + imageCount) % imageCount);
  };

  const handlePropertyDetailClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (Date.now() < suppressPhotoClickUntilRef.current) {
      suppressPhotoClickUntilRef.current = 0;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    onSelectProperty(images.length ? { ...property, images } : property);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSave(property.id);
  };

  const displayPrice = getPropertyDisplayPrice(property, hasSearchDates, showTotalWithTaxes);
  const hasConfirmedAvailability =
    availabilityConfirmed && getConfirmedPropertyQuote(property) !== null;
  const sixInstallmentAmount =
    displayPrice.kind === 'quote' &&
    showTotalWithTaxes &&
    currency === 'BRL' &&
    property.calculatedPrice
      ? getSixInstallmentAmount(property.calculatedPrice.totalAmount)
      : null;

  return (
    <article className="group relative mx-2 flex cursor-pointer flex-col rounded-[1.35rem] border border-transparent bg-transparent p-0 transition-transform duration-200 hover:-translate-y-0.5 sm:mx-0">
      <button
        type="button"
        data-property-detail-trigger={property.id}
        onClick={handlePropertyDetailClick}
        aria-label={`Ver detalhes de ${displayTitle}`}
        aria-describedby={`${priceDescriptionId}${hasConfirmedAvailability ? ` ${availabilityDescriptionId}` : ''}`}
        className="absolute inset-0 z-0 rounded-[1.35rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600"
        style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
        onTouchStart={handlePhotoTouchStart}
        onTouchEnd={handlePhotoTouchEnd}
        onTouchCancel={() => {
          touchStartRef.current = null;
        }}
      />
      <div className="relative z-10 flex flex-col pointer-events-none">
        {/* Photo Carousel Container */}
        <div
          ref={photoCarouselRef}
          className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.35rem] bg-neutral-100 transition-colors duration-300 group-hover:bg-neutral-200"
          style={{ touchAction: 'pan-x pan-y pinch-zoom' }}
        >
          {/* Images */}
          {currentImage ? (
            <img
              {...getPropertyCardImageSources(currentImage, CATALOG_IMAGE_SIZES)}
              decoding="async"
              alt=""
              className="h-full w-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-[1.025]"
              loading={eagerImage ? 'eager' : 'lazy'}
              fetchPriority={prioritizeImage ? 'high' : 'auto'}
              onError={() => setFailedImages((previous) => new Set(previous).add(currentImage))}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-orange-50 via-white to-sky-50 text-neutral-500">
              <Building2 aria-hidden="true" className="h-8 w-8 text-orange-500" />
              <span className="text-xs font-semibold">
                {property.dataSource === 'imobsys-live' && partnerImages === null
                  ? 'Carregando fotos…'
                  : 'Fotos não disponíveis'}
              </span>
            </div>
          )}

          {/* Favorite Heart Button */}
          <IconButton
            onClick={handleFavoriteClick}
            size="comfortable"
            variant="custom"
            aria-label={
              isSaved
                ? `Remover ${displayTitle} dos favoritos`
                : `Salvar ${displayTitle} nos favoritos`
            }
            aria-pressed={isSaved}
            className="pointer-events-auto absolute right-3 top-3 z-20 rounded-full bg-white/95 text-neutral-900 shadow-sm transition-all hover:scale-105 hover:bg-white active:scale-95 focus-visible:outline-orange-600"
          >
            <Heart
              aria-hidden="true"
              className={`h-5 w-5 transition-colors duration-200 stroke-[2.2] ${
                isSaved
                  ? 'fill-orange-500 text-orange-500 stroke-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]'
                  : 'stroke-neutral-900 hover:stroke-orange-700'
              }`}
            />
          </IconButton>

          {/* Host badge */}
          <div className="absolute top-3 left-3 z-10 max-w-[calc(100%-3.75rem)] pointer-events-none">
            {property.dataSource !== 'imobsys-live' &&
            property.staysSynced &&
            property.isSuperhost ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass text-caption font-bold text-neutral-900 shadow-sm border border-white/90 truncate">
                <span className="truncate">Anfitrião destaque</span>
              </span>
            ) : null}
          </div>

          {/* Carousel Arrow Buttons */}
          {images.length > 1 && (
            <div className="opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              {currentImageIndex > 0 && (
                <IconButton
                  onClick={prevImage}
                  aria-label="Foto anterior"
                  variant="custom"
                  className="pointer-events-auto absolute left-2 top-1/2 z-10 -translate-y-1/2 liquid-glass-button border border-white/90 text-neutral-900 shadow-lg transition-all hover:scale-110 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                >
                  <ChevronLeft aria-hidden="true" className="w-4 h-4 stroke-[2.5]" />
                </IconButton>
              )}
              {currentImageIndex < imageCount - 1 && (
                <IconButton
                  onClick={nextImage}
                  aria-label="Próxima foto"
                  variant="custom"
                  className="pointer-events-auto absolute right-2 top-1/2 z-10 -translate-y-1/2 liquid-glass-button border border-white/90 text-neutral-900 shadow-lg transition-all hover:scale-110 hover:bg-white active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                >
                  <ChevronRight aria-hidden="true" className="w-4 h-4 stroke-[2.5]" />
                </IconButton>
              )}
            </div>
          )}

          {/* Carousel Dots */}
          {imageCount > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="pointer-events-auto flex h-11 w-11 min-w-11 items-center justify-center rounded-full bg-transparent transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
                  aria-label={`Mostrar foto ${idx + 1}`}
                  aria-pressed={idx === currentImageIndex}
                  onClick={(event) => {
                    event.stopPropagation();
                    goToImage(idx);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === currentImageIndex
                        ? 'w-5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]'
                        : 'w-1.5 bg-white/70'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info Content with High Legibility */}
        <div className="mt-3 flex flex-col gap-1 px-0.5 pb-1 text-sm">
          {/* Title & Rating */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-sm font-semibold leading-snug text-neutral-900 transition-colors group-hover:text-orange-700 sm:text-base">
              <a
                href={accommodationPagePath(property)}
                className="pointer-events-auto rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onSelectProperty(property);
                }}
              >
                {displayTitle}
              </a>
            </h3>
            {property.reviewsSynced && property.reviewCount > 0 && (
              <div
                className="flex shrink-0 items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-bold"
                aria-label={`Média ${property.rating.toFixed(2)} de 5 com ${property.reviewCount} ${property.reviewCount === 1 ? 'avaliação' : 'avaliações'}`}
              >
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                <span className="text-neutral-950 font-black">{property.rating.toFixed(2)}</span>
                <span className="text-neutral-500 font-normal">({property.reviewCount})</span>
              </div>
            )}
          </div>

          {/* Location & Caldas Novas • GO */}
          <p className="truncate text-sm font-medium text-neutral-500">
            {property.location.city} • {property.location.state}
          </p>

          {hasConfirmedAvailability && (
            <p
              id={availabilityDescriptionId}
              className="mt-1 inline-flex items-center gap-1 text-caption font-semibold text-emerald-800"
            >
              <Check aria-hidden="true" className="h-3 w-3 shrink-0" />
              Disponível nas datas selecionadas para {searchGuestCount}{' '}
              {searchGuestCount === 1 ? 'hóspede' : 'hóspedes'}
            </p>
          )}

          {/* Room & Guest capacity */}
          <p className="text-xs font-medium text-neutral-600">
            {property.bedrooms} {property.bedrooms === 1 ? 'quarto' : 'quartos'} •{' '}
            {property.maxGuests} hóspedes {property.beds ? `• ${property.beds} camas` : ''}
          </p>

          {/* Search total pricing */}
          <div id={priceDescriptionId} className="mt-1 flex items-baseline gap-1">
            {displayPrice.kind === 'quote' || displayPrice.kind === 'reference' ? (
              <div className="flex flex-col items-start gap-1">
                <span className="text-sm font-semibold text-neutral-900 sm:text-base">
                  {formatCurrency(displayPrice.amount, currency)}
                </span>
                <span className="text-xs font-medium text-neutral-500">{displayPrice.detail}</span>
                {sixInstallmentAmount !== null && (
                  <span className="inline-flex w-fit items-center rounded-full border border-neutral-200 bg-white/75 px-2 py-1 text-caption font-semibold text-neutral-600">
                    6x {formatCurrency(sixInstallmentAmount, 'BRL')}
                  </span>
                )}
                {displayPrice.kind === 'reference' && (
                  <span className="text-caption font-semibold text-neutral-500">
                    {displayPrice.note}
                  </span>
                )}
                {displayPrice.kind === 'quote' && displayPrice.expired && (
                  <span className="text-caption font-semibold text-amber-800">
                    Cotação expirada. Atualize para confirmar preço e disponibilidade.
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs font-semibold text-neutral-500">{displayPrice.message}</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

function getSixInstallmentAmount(total: number): number | null {
  const totalCents = Math.round(total * 100);
  if (!Number.isSafeInteger(totalCents) || totalCents < 1) return null;

  const totalWithCardRateCents = Math.ceil((totalCents * 10_000) / (10_000 - 1_800));
  if (Math.floor(totalWithCardRateCents / 6) < 500) return null;

  return Math.ceil(totalWithCardRateCents / 6) / 100;
}
