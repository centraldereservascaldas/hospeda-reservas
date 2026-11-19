import { CATEGORIES } from '../data/mockProperties';
import type { SearchFilters } from '../types';
import { getAmenityFilterIdentity } from './propertyAmenities';

const DEFAULTS: SearchFilters = {
  destination: '',
  destinationPropertyId: '',
  checkIn: '',
  checkOut: '',
  dateFlexibility: 0,
  guests: { adults: 1, children: 0, infants: 0, pets: 0 },
  category: 'all',
  minPrice: 0,
  maxPrice: 5000,
  propertyTypes: [],
  amenities: [],
  minBedrooms: 0,
  minBeds: 0,
  minBaths: 0,
  superhostOnly: false,
  instantBookOnly: false,
};

const CATEGORY_IDS = new Set(CATEGORIES.map(({ id }) => id));
const PROPERTY_TYPE_IDS = new Set(['entire_place', 'private_room', 'cabin', 'villa']);
const SEARCH_PARAMETER_KEYS = [
  'from',
  'to',
  'checkIn',
  'checkOut',
  'checkin',
  'checkout',
  'date_picker_type',
  'flexDays',
  'guests',
  'persons',
  'adults',
  'children',
  'infants',
  'pets',
  'query',
  'destination',
  'propertyId',
  'category',
  'minPrice',
  'maxPrice',
  'price_min',
  'price_max',
  'amenity',
  'amenities[]',
  'minBedrooms',
  'minBeds',
  'minBaths',
  'min_bedrooms',
  'min_beds',
  'min_bathrooms',
  'type',
  'property_type',
  'superhost',
  'superhostOnly',
  'instantBook',
  'instant_book',
  'instantBookOnly',
];

export function buildCondominiumDirectoryUrl(search: string): string {
  const params = new URLSearchParams();
  new URLSearchParams(search).forEach((value, key) => {
    if (key.toLowerCase().startsWith('utm_')) params.append(key, value);
  });
  const query = params.toString();

  return query ? `/condominios?${query}` : '/condominios';
}

export function buildHomeUrl(search: string): string {
  const params = new URLSearchParams();
  new URLSearchParams(search).forEach((value, key) => {
    if (key.toLowerCase().startsWith('utm_')) params.append(key, value);
  });
  const query = params.toString();

  return query ? `/?${query}` : '/';
}

function firstValue(params: URLSearchParams, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key);
    if (value !== null) return value;
  }
  return null;
}

function parseInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function parsePrice(value: string | null, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(5000, Math.max(0, parsed)) : fallback;
}

function isValidDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseList(
  params: URLSearchParams,
  key: string,
  allowed?: Set<string>,
  getIdentity: (value: string) => string = (value) => value,
): string[] {
  const values: string[] = [];
  const identities = new Set<string>();

  for (const rawValue of params.getAll(key)) {
    const value = rawValue.trim();
    if (value.length === 0 || value.length > 80 || (allowed && !allowed.has(value))) continue;

    const identity = getIdentity(value);
    if (!identity || identities.has(identity)) continue;

    identities.add(identity);
    values.push(value);
    if (values.length === 20) break;
  }

  return values;
}

export function createDefaultSearchFilters(): SearchFilters {
  return {
    ...DEFAULTS,
    guests: { ...DEFAULTS.guests },
    propertyTypes: [],
    amenities: [],
  };
}

export function parseSearchFilters(search: string): SearchFilters {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const filters = createDefaultSearchFilters();

  const checkIn = firstValue(params, 'checkin', 'from', 'checkIn');
  const checkOut = firstValue(params, 'checkout', 'to', 'checkOut');
  if (isValidDate(checkIn) && isValidDate(checkOut) && checkOut > checkIn) {
    filters.checkIn = checkIn;
    filters.checkOut = checkOut;
  }

  const flexDays = params.get('flexDays');
  filters.dateFlexibility = flexDays === '1' ? 1 : flexDays === '2' ? 2 : 0;

  const guestsParam = firstValue(params, 'persons', 'guests');
  const totalGuests = guestsParam === null ? null : parseInteger(guestsParam, -1, 1, 17);
  const adultsParam = params.get('adults');
  const childrenParam = params.get('children');
  const infants = parseInteger(params.get('infants'), 0, 0, 17);
  const children = parseInteger(childrenParam, 0, 0, 17);
  const adults =
    adultsParam === null
      ? totalGuests !== null && totalGuests > 0
        ? Math.max(1, totalGuests - children)
        : 1
      : parseInteger(adultsParam, 1, 1, 17);
  filters.guests.adults = adults;
  filters.guests.children = Math.min(children, 17 - adults);
  filters.guests.infants = Math.min(infants, 17 - adults - filters.guests.children);
  filters.guests.pets = parseInteger(params.get('pets'), 0, 0, 17);

  const destination = firstValue(params, 'query', 'destination')?.trim() ?? '';
  filters.destination = destination.slice(0, 160);
  filters.destinationPropertyId = (params.get('propertyId')?.trim() ?? '').slice(0, 100);

  const category = params.get('category');
  if (category && CATEGORY_IDS.has(category)) filters.category = category;

  const minPrice = parsePrice(firstValue(params, 'price_min', 'minPrice'), 0);
  const maxPrice = parsePrice(firstValue(params, 'price_max', 'maxPrice'), 5000);
  if (minPrice <= maxPrice) {
    filters.minPrice = minPrice;
    filters.maxPrice = maxPrice;
  }

  filters.propertyTypes = [
    ...new Set([
      ...parseList(params, 'property_type', PROPERTY_TYPE_IDS),
      ...parseList(params, 'type', PROPERTY_TYPE_IDS),
    ]),
  ].slice(0, 20);
  filters.amenities = [
    ...new Map(
      [...parseList(params, 'amenities[]'), ...parseList(params, 'amenity')].map((amenity) => [
        getAmenityFilterIdentity(amenity),
        amenity,
      ]),
    ).values(),
  ].slice(0, 20);
  filters.minBedrooms = parseInteger(firstValue(params, 'min_bedrooms', 'minBedrooms'), 0, 0, 30);
  filters.minBeds = parseInteger(firstValue(params, 'min_beds', 'minBeds'), 0, 0, 30);
  filters.minBaths = parseInteger(firstValue(params, 'min_bathrooms', 'minBaths'), 0, 0, 30);
  filters.superhostOnly = ['true', '1'].includes(firstValue(params, 'superhost', 'superhostOnly') ?? '');
  filters.instantBookOnly = ['true', '1'].includes(
    firstValue(params, 'instant_book', 'instantBook', 'instantBookOnly') ?? '',
  );

  return filters;
}

export function getAccommodationIdFromPath(pathname: string): string | null {
  const reservationId = pathname.match(/^\/reservar\/([a-zA-Z0-9_-]+)(?:\/|$)/)?.[1];
  if (reservationId) return reservationId;

  return pathname.match(/\/(?:apartamento|apartment)\/([a-zA-Z0-9_-]+)(?:\/|$)/)?.[1] ?? null;
}

export function serializeSearchFilters(filters: SearchFilters): string {
  const params = new URLSearchParams();
  params.set('date_picker_type', 'calendar');
  if (
    isValidDate(filters.checkIn) &&
    isValidDate(filters.checkOut) &&
    filters.checkOut > filters.checkIn
  ) {
    params.set('checkin', filters.checkIn);
    params.set('checkout', filters.checkOut);
  }

  if (filters.checkIn && filters.checkOut && filters.dateFlexibility) params.set('flexDays', String(filters.dateFlexibility));

  params.set('adults', String(filters.guests.adults));
  params.set('children', String(filters.guests.children));
  params.set('infants', String(filters.guests.infants));
  params.set('pets', String(filters.guests.pets));

  if (filters.destination) params.set('query', filters.destination);
  if (filters.destinationPropertyId) params.set('propertyId', filters.destinationPropertyId);
  if (filters.category !== 'all' && CATEGORY_IDS.has(filters.category))
    params.set('category', filters.category);
  if (filters.minPrice > 0) params.set('price_min', String(filters.minPrice));
  if (filters.maxPrice < 5000) params.set('price_max', String(filters.maxPrice));
  for (const propertyType of filters.propertyTypes) {
    if (propertyType.trim() && propertyType.length <= 80) params.append('property_type', propertyType);
  }
  for (const amenity of filters.amenities) {
    if (amenity.trim() && amenity.length <= 80) params.append('amenities[]', amenity);
  }
  if (filters.minBedrooms > 0) params.set('min_bedrooms', String(filters.minBedrooms));
  const minBeds = filters.minBeds ?? 0;
  if (minBeds > 0) params.set('min_beds', String(minBeds));
  if (filters.minBaths > 0) params.set('min_bathrooms', String(filters.minBaths));
  if (filters.superhostOnly) params.set('superhost', 'true');
  if (filters.instantBookOnly) params.set('instant_book', 'true');

  const hasDefaultGuests = filters.guests.adults === 1 && filters.guests.children === 0 &&
    filters.guests.infants === 0 && filters.guests.pets === 0;
  if (params.size === 5 && hasDefaultGuests) return '';

  return params.toString();
}

export function mergeSearchFiltersIntoUrl(search: string, filters: SearchFilters): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const key of SEARCH_PARAMETER_KEYS) params.delete(key);
  const searchState = new URLSearchParams(serializeSearchFilters(filters));
  searchState.forEach((value, key) => params.append(key, value));
  return params.toString();
}
