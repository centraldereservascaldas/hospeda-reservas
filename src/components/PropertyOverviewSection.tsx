import { BedDouble, Sparkles } from 'lucide-react';
import type { Property } from '../types';
import { HostAvatar } from './HostAvatar';

interface PropertyOverviewSectionProps {
  property: Property;
}

export function PropertyOverviewSection({ property }: PropertyOverviewSectionProps) {
  return (
    <>
      {/* Space Summary */}
      <div className="pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-neutral-900">{property.subtitle}</h2>
            <p className="text-xs sm:text-sm text-neutral-500 mt-1">
              Até {property.maxGuests} hóspedes • {property.bedrooms} quartos • {property.beds}{' '}
              camas • {property.bathrooms} banheiros
            </p>
          </div>

          <HostAvatar
            src={property.host.avatar}
            alt={property.host.name}
            className="ring-2 ring-orange-500/20 shadow-md"
          />
        </div>

        {property.isGuestFavorite && (
          <div className="mt-6 p-4 rounded-2xl border border-neutral-200 bg-neutral-50/70 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-orange-500 flex-shrink-0" />
              <div>
                <p className="font-bold text-sm text-neutral-900">Preferido dos hóspedes</p>
                <p className="text-xs text-neutral-500">
                  Uma das acomodações mais bem avaliadas no Hospeda pelos hóspedes.
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-lg font-black text-neutral-900">
                {property.rating.toFixed(2)}
              </span>
              <div className="flex text-amber-500 text-xs">★★★★★</div>
            </div>
          </div>
        )}
      </div>

      {/* Highlights */}
      <div className="pt-6 pb-2 space-y-4">
        {property.highlights.map((highlight, index) => (
          <div key={index} className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-900">{highlight.title}</p>
              <p className="text-xs text-neutral-500">{highlight.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Descriptions */}
      <div className="pt-6">
        <h3 className="text-lg font-bold text-neutral-900 mb-3">Sobre este espaço</h3>
        <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
          {property.description}
        </p>
      </div>

      {property.complexDescription?.trim() && (
        <div className="pt-6">
          <h3 className="text-lg font-bold text-neutral-900 mb-3">
            Sobre o condomínio{property.complexName ? ` ${property.complexName}` : ''}
          </h3>
          <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
            {property.complexDescription}
          </p>
        </div>
      )}

      {/* Sleeping arrangements */}
      <div className="pt-6">
        <h3 className="text-lg font-bold text-neutral-900 mb-4">Onde você vai dormir</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {property.sleepingArrangements.map((room, index) => (
            <div
              key={index}
              className="p-4 rounded-2xl border border-neutral-200/90 bg-white/80 shadow-2xs"
            >
              <BedDouble className="w-6 h-6 text-orange-600 mb-3" />
              <p className="font-extrabold text-xs text-neutral-900">{room.roomName}</p>
              <p className="text-[11px] text-neutral-600 font-medium mt-1">{room.bedType}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
