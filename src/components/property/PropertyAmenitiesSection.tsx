import React from 'react';
import { Check, Home, Waves } from 'lucide-react';

interface PropertyAmenitiesSectionProps {
  listingAmenities?: string[];
  propertyAmenities?: string[];
  amenities?: string[];
}

function getAmenityIdentity(amenity: string): string {
  return amenity
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]/g, '');
}

export const PropertyAmenitiesSection: React.FC<PropertyAmenitiesSectionProps> = ({
  listingAmenities,
  propertyAmenities,
  amenities = [],
}) => {
  const apartmentAmenities = listingAmenities ?? [];
  const condoAmenities = propertyAmenities ?? [];
  const classifiedAmenityIdentities = new Set(
    [...apartmentAmenities, ...condoAmenities].map(getAmenityIdentity),
  );
  const unclassifiedAmenities = amenities.filter((amenity, index, allAmenities) => {
    const identity = getAmenityIdentity(amenity);
    return (
      identity &&
      !classifiedAmenityIdentities.has(identity) &&
      allAmenities.findIndex((candidate) => getAmenityIdentity(candidate) === identity) === index
    );
  });
  if (
    apartmentAmenities.length === 0 &&
    condoAmenities.length === 0 &&
    unclassifiedAmenities.length === 0
  ) {
    return null;
  }

  return (
    <section aria-labelledby="property-amenities-title" className="pt-6 space-y-6">
      <h3 id="property-amenities-title" className="text-lg font-bold text-neutral-900">
        O que esse lugar oferece
      </h3>

      {apartmentAmenities.length > 0 && (
        <div className="p-5 rounded-2xl bg-orange-50/40 border border-orange-100 space-y-3">
          <div className="flex items-center gap-2 text-xs font-black text-orange-950 uppercase tracking-wider">
            <Home className="w-4 h-4 text-orange-600" />
            <span>No apartamento</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {apartmentAmenities.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-2.5 text-sm font-semibold text-neutral-800"
              >
                <Check className="w-4 h-4 text-orange-600 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {condoAmenities.length > 0 && (
        <div className="p-5 rounded-2xl bg-sky-50/40 border border-sky-100 space-y-3">
          <div className="flex items-center gap-2 text-xs font-black text-sky-950 uppercase tracking-wider">
            <Waves className="w-4 h-4 text-sky-600" />
            <span>No condomínio e no complexo termal</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {condoAmenities.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-2.5 text-sm font-semibold text-neutral-800"
              >
                <Check className="w-4 h-4 text-sky-600 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {unclassifiedAmenities.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
          <h4 className="mb-3 text-xs font-black uppercase tracking-wider text-neutral-800">
            Outras comodidades registradas
          </h4>
          <ul className="grid grid-cols-1 gap-2.5 text-sm font-semibold text-neutral-700 sm:grid-cols-2">
            {unclassifiedAmenities.map((item) => (
              <li key={getAmenityIdentity(item)} className="flex items-center gap-2.5">
                <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-neutral-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
