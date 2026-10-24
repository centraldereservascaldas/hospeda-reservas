export interface PropertyAmenitySummary {
  visibleAmenities: string[];
  remainingCount: number;
}

export function getCatalogAmenities(
  amenities: string[],
  listingAmenities: string[] = [],
  propertyAmenities: string[] = [],
): string[] {
  const uniqueAmenities = new Map<string, string>();
  [...listingAmenities, ...amenities, ...propertyAmenities].forEach((amenity) => {
    const label = amenity.trim();
    const identity = getAmenityIdentity(label);
    if (identity && !uniqueAmenities.has(identity)) uniqueAmenities.set(identity, label);
  });

  return [...uniqueAmenities.values()];
}

const HYDROMASSAGE_TERMS = ['jacuzzi', 'hidromassagem', 'hidro', 'ofuro'];
const BATHTUB_TERMS = ['banheira'];
const KITCHEN_TERMS = ['cozinha', 'copa'];
const PARKING_TERMS = ['estacionamento', 'garagem', 'vaga'];
const WATER_PARK_TERMS = ['parque aquatico', 'acqua park'];
const BALCONY_TERMS = ['varanda', 'sacada'];
const GYM_TERMS = ['academia', 'fitness'];
const AIR_CONDITIONING_TERMS = ['ar condicionado', 'ar split', 'climatizado'];
const INTERNET_TERMS = ['wi fi', 'wifi', 'internet'];

const AMENITY_SEARCH_TERMS: Record<string, string[]> = {
  jacuzzi: HYDROMASSAGE_TERMS,
  hidromassagem: HYDROMASSAGE_TERMS,
  hidro: HYDROMASSAGE_TERMS,
  ofuro: HYDROMASSAGE_TERMS,
  banheira: BATHTUB_TERMS,
  'cozinha ou copa': KITCHEN_TERMS,
  cozinha: KITCHEN_TERMS,
  copa: KITCHEN_TERMS,
  estacionamento: PARKING_TERMS,
  garagem: PARKING_TERMS,
  vaga: PARKING_TERMS,
  'parque aquatico': WATER_PARK_TERMS,
  'acqua park': WATER_PARK_TERMS,
  varanda: BALCONY_TERMS,
  sacada: BALCONY_TERMS,
  academia: GYM_TERMS,
  fitness: GYM_TERMS,
  'ar condicionado': AIR_CONDITIONING_TERMS,
  'ar split': AIR_CONDITIONING_TERMS,
  climatizado: AIR_CONDITIONING_TERMS,
  'wi fi': INTERNET_TERMS,
  wifi: INTERNET_TERMS,
  internet: INTERNET_TERMS,
};

function getAmenityIdentity(amenity: string): string {
  return amenity
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeAmenityText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function getAmenityFilterIdentity(amenity: string): string {
  const normalizedAmenity = normalizeAmenityText(amenity);
  const canonicalTerm = AMENITY_SEARCH_TERMS[normalizedAmenity]?.[0] || normalizedAmenity;
  return getAmenityIdentity(canonicalTerm);
}

function includesAmenityTerm(propertyAmenity: string, term: string): boolean {
  const normalizedTerm = normalizeAmenityText(term);
  const paddedAmenity = ` ${propertyAmenity} `;
  return [normalizedTerm, `${normalizedTerm}s`, `${normalizedTerm}es`].some((variant) =>
    paddedAmenity.includes(` ${variant} `),
  );
}

export function matchesPropertyAmenity(
  propertyAmenities: string[],
  selectedAmenity: string,
): boolean {
  const normalizedSelection = normalizeAmenityText(selectedAmenity);
  if (!normalizedSelection) return false;

  const searchTerms = AMENITY_SEARCH_TERMS[normalizedSelection] || [normalizedSelection];
  return propertyAmenities.some((propertyAmenity) => {
    const normalizedPropertyAmenity = normalizeAmenityText(propertyAmenity);
    return searchTerms.some((term) => includesAmenityTerm(normalizedPropertyAmenity, term));
  });
}

export function getPropertyAmenitySummary(amenities: string[], limit = 3): PropertyAmenitySummary {
  const uniqueAmenities = new Map<string, string>();
  amenities.forEach((amenity) => {
    const label = amenity.trim();
    const identity = getAmenityIdentity(label);
    if (identity && !uniqueAmenities.has(identity)) uniqueAmenities.set(identity, label);
  });
  const recordedAmenities = [...uniqueAmenities.values()];
  const visibleAmenities = recordedAmenities.slice(0, Math.max(0, limit));

  return {
    visibleAmenities,
    remainingCount: recordedAmenities.length - visibleAmenities.length,
  };
}
