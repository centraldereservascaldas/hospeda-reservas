import React from 'react';
import { MapPin } from 'lucide-react';
import type { Property } from '../types';
import { getPropertyMapLinks } from '../utils/propertyLocation';

interface PropertyLocationSectionProps {
  title: string;
  location: Pick<Property['location'], 'neighborhood' | 'lat' | 'lng'>;
}

export const PropertyLocationSection: React.FC<PropertyLocationSectionProps> = ({
  title,
  location,
}) => {
  const mapLinks = getPropertyMapLinks(location.lat, location.lng);

  return (
    <section aria-labelledby="property-location-title" className="pt-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 id="property-location-title" className="text-lg font-bold text-neutral-900">
            Onde você estará
          </h3>
          <p className="text-xs text-neutral-600 mt-0.5">
            {location.neighborhood
              ? `${location.neighborhood}, Caldas Novas - GO`
              : 'Caldas Novas - GO'}
          </p>
        </div>
        <span className="text-xs font-bold text-orange-600 flex items-center gap-1 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
          <MapPin className="w-3.5 h-3.5 text-orange-500" />
          Região das Águas Termais
        </span>
      </div>

      <div className="relative h-72 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 shadow-xs sm:h-80">
        {mapLinks ? (
          <iframe
            title={`Mapa da localização de ${title}`}
            src={mapLinks.embedUrl}
            className="h-full w-full border-0"
            style={{ filter: 'saturate(0.78) sepia(0.12) hue-rotate(-8deg)' }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-600">
            Não há coordenadas disponíveis para mostrar o mapa desta acomodação.
          </div>
        )}
        {mapLinks && (
          <a
            href={mapLinks.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white/95 px-3 py-1.5 text-xs font-bold text-neutral-900 shadow-md transition-colors hover:bg-white"
          >
            <span>Abrir no Google Maps</span>
            <MapPin className="h-3.5 w-3.5 text-orange-600" />
          </a>
        )}
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        A localização exibida pode ser aproximada para proteger a privacidade do anfitrião.
      </p>
    </section>
  );
};
