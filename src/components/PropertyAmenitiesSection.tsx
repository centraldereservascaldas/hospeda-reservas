import React from 'react';
import { Check, Home, Waves } from 'lucide-react';

interface PropertyAmenitiesSectionProps {
  listingAmenities?: string[];
  propertyAmenities?: string[];
}

const defaultListingAmenities = [
  'Ar-condicionado split silencioso',
  'Copa completa com micro-ondas e frigobar',
  'Wi-Fi fibra óptica de alta velocidade',
  'Smart TV no quarto e sala',
  'Roupa de cama e banho higienizada',
  'Banheiro privativo com ducha termal',
];

const defaultPropertyAmenities = [
  'Acesso livre ao Parque Aquático Termal',
  'Piscinas termais naturais quentes 24 horas',
  'Toboáguas para adultos e crianças',
  'Sauna a vapor e ofurôs relaxantes',
  'Recepção e portaria 24 horas com suporte ao hóspede',
  'Estacionamento privativo numerado e monitorado',
  'Restaurante, pizzaria e lanchonetes no complexo',
  'Quadra poliesportiva e salão de jogos',
];

export const PropertyAmenitiesSection: React.FC<PropertyAmenitiesSectionProps> = ({
  listingAmenities,
  propertyAmenities,
}) => {
  const apartmentAmenities = listingAmenities?.length ? listingAmenities : defaultListingAmenities;
  const condoAmenities = propertyAmenities?.length ? propertyAmenities : defaultPropertyAmenities;

  return (
    <section aria-labelledby="property-amenities-title" className="pt-6 space-y-6">
      <h3 id="property-amenities-title" className="text-lg font-bold text-neutral-900">
        O que esse lugar oferece
      </h3>

      <div className="p-5 rounded-2xl bg-orange-50/40 border border-orange-100 space-y-3">
        <div className="flex items-center gap-2 text-xs font-black text-orange-950 uppercase tracking-wider">
          <Home className="w-4 h-4 text-orange-600" />
          <span>No Apartamento</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {apartmentAmenities.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-2.5 text-xs font-semibold text-neutral-800"
            >
              <Check className="w-4 h-4 text-orange-600 flex-shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-sky-50/40 border border-sky-100 space-y-3">
        <div className="flex items-center gap-2 text-xs font-black text-sky-950 uppercase tracking-wider">
          <Waves className="w-4 h-4 text-sky-600" />
          <span>No Condomínio &amp; Complexo Termal</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {condoAmenities.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-2.5 text-xs font-semibold text-neutral-800"
            >
              <Check className="w-4 h-4 text-sky-600 flex-shrink-0" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
