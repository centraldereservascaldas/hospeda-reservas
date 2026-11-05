import { BedDouble, Sparkles } from 'lucide-react';
import type { Property } from '../../types';
import { HostAvatar } from './HostAvatar';

interface PropertyOverviewSectionProps {
  property: Property;
}

const descriptionSectionLabels = [
  'Itens não Inclusos',
  'Aluguel de roupa de cama e banho',
  'Documentação',
  'Manutenção do apartamento',
  'Regimento interno',
  'Localização',
  'Multa de Limpeza',
  'Multa de CHECKOUT',
  'Solicite antecipadamente',
  'Estacionamento',
  'Restrições',
  'Chaves da casa',
];

export function formatPropertyDescription(description: string): string {
  return description
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/(Quarto|Sala|Cozinha)\s*:-/g, '\n\n$1:\n• ')
    .replace(
      /(Suíte \d+ com|Quarto \d+ com|Sala com|Cozinha com|Estacionamento|Restrições|Chaves da casa)\s*:/g,
      '\n\n$1:\n',
    )
    .replace(/↓\s*/g, '\n\n')
    .replace(new RegExp(`(${descriptionSectionLabels.join('|')})\\s*:?`, 'g'), '\n\n$1\n')
    .replace(/\s*•\s*/g, '\n• ')
    .replace(/-\s*(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/g, '\n• ')
    .replace(/([✗✓])\s*/g, '\n• $1 ')
    .replace(
      /([a-záéíóúâêôãõç])(?=(?:Este condomínio|Este é um|Solicite antecipadamente|Os valores são))/g,
      '$1\n\n',
    )
    .replace(/([.!?])[ \t]*(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g, '$1\n\n')
    .replace(/•[ \t]+/g, '• ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function PropertyOverviewSection({ property }: PropertyOverviewSectionProps) {
  const descriptionBlocks = formatPropertyDescription(property.description)
    .split(/\n\n+/)
    .filter(Boolean);
  const complexDescriptionBlocks = property.complexDescription
    ? formatPropertyDescription(property.complexDescription)
        .split(/\n\n+/)
        .filter(Boolean)
    : [];
  const propertyDetails = [
    property.bedrooms > 0
      ? `${property.bedrooms} ${property.bedrooms === 1 ? 'quarto' : 'quartos'}`
      : '',
    property.beds > 0 ? `${property.beds} ${property.beds === 1 ? 'cama' : 'camas'}` : '',
    property.bathrooms > 0
      ? `${property.bathrooms} ${property.bathrooms === 1 ? 'banheiro' : 'banheiros'}`
      : '',
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <>
      {/* Space Summary */}
      <div className="pb-6">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-bold text-neutral-900 sm:text-xl">
              {property.subtitle}
            </h2>
            <p className="text-xs sm:text-sm text-neutral-500 mt-1">
              Até {property.maxGuests} {property.maxGuests === 1 ? 'hóspede' : 'hóspedes'}
              {propertyDetails ? ` • ${propertyDetails}` : ''}
            </p>
          </div>

          {property.host.name.trim() && (
            <HostAvatar
              src={property.host.avatar}
              alt={property.host.name}
              className="ring-2 ring-orange-500/20 shadow-md"
            />
          )}
        </div>

        {property.staysSynced && property.isGuestFavorite && (
          <div className="mt-6 p-4 rounded-2xl border border-neutral-200 bg-neutral-50/70 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-orange-500 flex-shrink-0" />
              <div>
                <p className="font-bold text-sm text-neutral-900">Preferido dos hóspedes</p>
                <p className="text-xs text-neutral-500">Bem avaliada por quem já se hospedou.</p>
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
      {property.highlights.length > 0 && (
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
      )}

      {/* Descriptions */}
      {property.description.trim() && (
        <div className="pt-6">
          <h3 className="text-lg font-bold text-neutral-900 mb-3">Sobre este espaço</h3>
          <div className="space-y-3 text-sm text-neutral-700 leading-relaxed">
            {descriptionBlocks.map((block, index) => {
              const isSectionHeading =
                /^(?:Quarto|Sala|Cozinha|Suíte \d+ com|Quarto \d+ com|Sala com|Cozinha com|Itens não Inclusos|Aluguel de roupa de cama e banho|Documentação|Manutenção do apartamento|Regimento interno|Localização|Multa de Limpeza|Multa de CHECKOUT|Solicite antecipadamente|Estacionamento|Restrições|Chaves da casa):?$/.test(
                  block,
                );

              return isSectionHeading ? (
                <h4 key={`${block}-${index}`} className="font-semibold text-neutral-900">
                  {block.replace(/:$/, '')}
                </h4>
              ) : (
                <p key={`${block}-${index}`} className="whitespace-pre-line">
                  {block}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {complexDescriptionBlocks.length > 0 && (
        <div className="pt-6">
          <h3 className="text-lg font-bold text-neutral-900 mb-3">
            Sobre o condomínio{property.complexName ? ` ${property.complexName}` : ''}
          </h3>
          <div className="space-y-3 text-sm text-neutral-700 leading-relaxed">
            {complexDescriptionBlocks.map((block, index) => (
              <p key={`${block}-${index}`} className="whitespace-pre-line">
                {block}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Sleeping arrangements */}
      {property.sleepingArrangements.length > 0 && (
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
                <p className="text-caption text-neutral-600 font-medium mt-1">{room.bedType}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
