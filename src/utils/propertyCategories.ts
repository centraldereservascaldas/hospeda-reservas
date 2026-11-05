import type { Property } from '../types';

const normalize = (value: unknown): string => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR');

export function matchesPropertyCategory(property: Property, categoryId: string): boolean {
  if (categoryId === 'all') return true;
  const categoryMatches = normalize(property.category) === normalize(categoryId);
  if (categoryMatches && categoryId !== 'pet_friendly') return true;

  const text = normalize([
    property.title,
    property.complexName,
    property.complexDescription,
    property.subtitle,
    property.description,
    property.location?.neighborhood,
    property.location?.address,
    ...(property.amenities || []),
    ...(property.listingAmenities || []),
    ...(property.propertyAmenities || []),
    ...(property.highlights || []).flatMap((highlight) => [highlight.title, highlight.description]),
  ].filter(Boolean).join(' '));
  const location = normalize([
    property.location?.neighborhood,
    property.location?.address,
  ].filter(Boolean).join(' '));
  const rulesAndDescription = normalize([
    property.subtitle,
    property.description,
    property.complexDescription,
    ...(property.rules || []),
    ...(property.amenities || []),
    ...(property.listingAmenities || []),
    ...(property.propertyAmenities || []),
    ...(property.highlights || []).flatMap((highlight) => [highlight.title, highlight.description]),
  ].filter(Boolean).join(' '));

  switch (categoryId) {
    case 'condominiums':
      return Boolean(property.complexName?.trim());
    case 'pools_24h':
      return /piscinas?.{0,45}(?:24\s*h(?:oras?)?|funcionamento 24)|(?:24\s*h(?:oras?)?).{0,45}piscinas?/.test(text);
    case 'pool_access':
      return /piscinas?/.test(text);
    case 'beverages_allowed': {
      const explicitlyAllowed = /(?:permitid[oa]|pode)\s+(?:descer|levar|entrar)(?:\s+com)?\s+(?:(?:seu|sua)\s+)?(?:cooler|bebidas?|latas?)(?:\s|,|\.|$)/.test(rulesAndDescription);
      const explicitlyForbidden = /(?:nao\s+(?:e\s+)?(?:permitid[oa]|permite)|nao\s+pode|proibid[oa])\s+(?:descer|levar|entrar)(?:\s+com)?\s+(?:(?:seu|sua)\s+)?(?:cooler|bebidas?|latas?)/.test(rulesAndDescription)
        || /(?:bebidas?|cooler|latas?).{0,20}(?:nao\s+permitid[oa]|proibid[oa])/.test(rulesAndDescription);
      return explicitlyAllowed && !explicitlyForbidden;
    }
    case 'near_center':
      return /\bcentro\b|setor central|regiao central/.test(location)
        || /(?:ate|a|aproximadamente)?\s*[0-3](?:[.,]\d+)?\s*km\s+(?:do|de|ate o)\s+centro/.test(normalize(property.description));
    case 'waterpark_included':
      return /(?:ingressos?|entrada|acesso).{0,50}(?:inclus[oa]s?|gratuit[oa]s?|cortesia).{0,45}(?:parque|acqua|hot park)|(?:parque aquatico|hot park).{0,55}(?:inclus[oa]s?|gratuit[oa]s?|cortesia)/.test(text);
    case 'family_friendly':
      return Number(property.maxGuests) >= 4;
    case 'pet_friendly':
      {
        const explicitlyForbidden =
          /(?:nao\s+(?:aceita(?:m|mos)?|permite(?:m|mos)?)|nao\s+(?:e|sao)\s+permitid[oa]s?|proibid[oa]s?\s+(?:a\s+)?entrad[ao]).{0,40}(?:animais?|pets?)|(?:animais?|pets?).{0,40}(?:nao\s+(?:(?:sao\s+)?permitid[oa]s?|aceit[oa]s?|permit[oa]s?)|proibid[oa]s?)/.test(
            rulesAndDescription,
          );
        const explicitlyAllowed =
          /aceita(?:m|mos)?\s+(?:animais?|pets?)|permite(?:m|mos)?\s+(?:animais?|pets?)|pet friendly/.test(
            rulesAndDescription,
          );

        return !explicitlyForbidden && (explicitlyAllowed || categoryMatches);
      }
    case 'hot_tub':
      return /hidromassagem|ofuro|jacuzzi/.test(text);
    default:
      return false;
  }
}
