import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Star, Sparkles } from 'lucide-react';
import { Property, Currency } from '../types';
import { formatCurrency } from '../utils/formatters';

interface PropertyCardProps {
  property: Property;
  currency: Currency;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
  onSelectProperty: (property: Property) => void;
  showTotalWithTaxes: boolean;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({
  property,
  currency,
  isSaved,
  onToggleSave,
  onSelectProperty,
  showTotalWithTaxes,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const galleryKey = property.images.join('|');

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [property.id, galleryKey]);

  const imageCount = property.images.length;
  const currentImage = property.images[currentImageIndex] || property.images[0] || '';
  const goToImage = (index: number) => setCurrentImageIndex(index);

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (imageCount > 1) setCurrentImageIndex((prev) => (prev + 1) % imageCount);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (imageCount > 1) setCurrentImageIndex((prev) => (prev - 1 + imageCount) % imageCount);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSave(property.id);
  };

  // Price calculations
  const defaultNights = 3;
  const totalPrice = (property.pricePerNight * defaultNights) + property.cleaningFee + (property.pricePerNight * defaultNights * property.serviceFeeRate);
  const calculatedPrice = (property as any).calculatedPrice;
  const hasValidCalculatedPrice =
    Number.isFinite(Number(calculatedPrice?.totalAmount)) && Number(calculatedPrice?.totalAmount) > 0 &&
    Number.isFinite(Number(calculatedPrice?.dailyRate)) && Number(calculatedPrice?.dailyRate) > 0;

  return (
    <div
      onClick={() => onSelectProperty(property)}
      className="group flex flex-col cursor-pointer transition-transform duration-200 p-2 sm:p-2.5 rounded-3xl liquid-glass border border-white/80 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-xl hover:-translate-y-1 transition-all"
    >
      {/* Photo Carousel Container */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-neutral-100/60 border border-white/80 shadow-2xs group-hover:shadow-md transition-all duration-300">
        
        {/* Images */}
        <img
          src={currentImage}
          alt={property.title}
          className="h-full w-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ease-out"
          loading="lazy"
        />

        {/* Favorite Heart Button */}
        <button
          onClick={handleFavoriteClick}
          aria-label="Salvar favorito"
          className="absolute top-3 right-3 z-20 p-2 sm:p-2.5 rounded-full liquid-glass-button bg-black/25 hover:bg-black/45 text-white hover:scale-115 active:scale-95 transition-all cursor-pointer shadow-sm border border-white/40 flex-shrink-0"
        >
          <Heart
            className={`w-4 h-4 transition-colors duration-200 stroke-[2.2] ${
              isSaved
                ? 'fill-orange-500 text-orange-500 stroke-orange-500 drop-shadow-[0_0_8px_rgba(249,115,22,0.8)]'
                : 'stroke-white hover:stroke-orange-300'
            }`}
          />
        </button>

        {/* Badge: highlight preferred listings or certified host */}
        <div className="absolute top-3 left-3 z-10 max-w-[calc(100%-3.75rem)] pointer-events-none">
          {property.isGuestFavorite ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full liquid-glass text-[11px] font-black text-neutral-900 shadow-sm border border-white/90 truncate">
              <Sparkles className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
              <span className="truncate">Preferido das Famílias</span>
            </span>
          ) : property.isSuperhost ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full liquid-glass text-[11px] font-bold text-neutral-900 shadow-sm border border-white/90 truncate">
              <span className="truncate">Central Certificada</span>
            </span>
          ) : null}
        </div>

        {/* Carousel Arrow Buttons */}
        {property.images.length > 1 && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {currentImageIndex > 0 && (
              <button
                onClick={prevImage}
                aria-label="Foto anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full liquid-glass-button hover:bg-white text-neutral-900 flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all cursor-pointer border border-white/90"
              >
                <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
            {currentImageIndex < imageCount - 1 && (
              <button
                onClick={nextImage}
                aria-label="Próxima foto"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full liquid-glass-button hover:bg-white text-neutral-900 flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all cursor-pointer border border-white/90"
              >
                <ChevronRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        )}

        {/* Carousel Dots */}
        {imageCount > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
            {property.images.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Mostrar foto ${idx + 1}`}
                onClick={(event) => { event.stopPropagation(); goToImage(idx); }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === currentImageIndex
                    ? 'w-5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]'
                    : 'w-1.5 bg-white/70'
                }`}
              />
            ))}
          </div>
        )}

      </div>

      {/* Info Content with High Legibility */}
      <div className="mt-3 px-1 flex flex-col gap-0.5 text-xs">
        {/* Title & Rating */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-extrabold text-neutral-950 text-sm sm:text-base leading-snug line-clamp-1 group-hover:text-orange-600 transition-colors">
            {property.title}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0 font-bold text-xs liquid-glass px-2 py-0.5 rounded-lg border border-white/80 shadow-2xs">
            <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
            <span className="text-neutral-950 font-black">{property.rating.toFixed(2)}</span>
            <span className="text-neutral-500 font-normal">({property.reviewCount})</span>
          </div>
        </div>

        {/* Location & Caldas Novas • GO */}
        <p className="text-neutral-500 font-medium text-[11px] truncate mt-0.5">
          {property.location.city} • {property.location.state}
        </p>

        {/* Room & Guest capacity */}
        <p className="text-neutral-700 font-semibold text-[11px] mt-0.5">
          {property.bedrooms} {property.bedrooms === 1 ? 'quarto' : 'quartos'} • {property.maxGuests} hóspedes {property.beds ? `• ${property.beds} camas` : ''}
        </p>

        {/* Highlighted Amenities List (Airbnb style card specification) */}
        <div className="my-1.5 py-1 px-2 rounded-xl bg-orange-50/60 border border-orange-100/80 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-orange-950">
          <span className="flex items-center gap-1">
            <span className="text-amber-500">★</span> Piscinas
          </span>
          <span className="flex items-center gap-1">
            <span className="text-amber-500">★</span> Parque aquático
          </span>
          <span className="flex items-center gap-1">
            <span className="text-amber-500">★</span> Estacionamento
          </span>
        </div>

        {/* Search total pricing */}
        <div className="mt-1 flex items-baseline gap-1">
          {hasValidCalculatedPrice ? (
            <div className="flex flex-col">
              <span className="font-black text-base sm:text-lg text-neutral-950">
                {formatCurrency(showTotalWithTaxes ? calculatedPrice.totalAmount : calculatedPrice.dailyRate, currency)}
              </span>
              <span className="text-[11px] font-semibold text-neutral-600">
                {showTotalWithTaxes
                  ? `total com taxas • ${calculatedPrice.nights} ${calculatedPrice.nights === 1 ? 'diária' : 'diárias'}`
                  : '/ noite' }
              </span>
            </div>
          ) : calculatedPrice ? (
            <span className="text-xs font-semibold text-neutral-500">Preço indisponível para estas datas</span>
          ) : showTotalWithTaxes ? (
            <div className="flex flex-col">
              <span className="font-black text-sm sm:text-base text-neutral-950">
                {formatCurrency(totalPrice, currency)}
              </span>
              <span className="text-[11px] font-semibold text-neutral-600">
                total • {defaultNights} diárias
              </span>
            </div>
          ) : property.pricePerNight > 0 ? (
            <div className="flex items-baseline gap-1">
              <span className="font-black text-base sm:text-lg text-neutral-950">
                {formatCurrency(property.pricePerNight, currency)}
              </span>
              <span className="text-neutral-600 font-semibold text-xs">/ noite</span>
            </div>
          ) : (
            <span className="text-xs font-semibold text-neutral-500">Consulte as datas para ver o preço</span>
          )}
        </div>

      </div>
    </div>
  );
};
