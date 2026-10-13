import { CATEGORIES } from '../data/mockProperties';
import type { SearchFilters } from '../types';

const DEFAULTS: SearchFilters = {
  destination: '',
  destinationPropertyId: '',
  checkIn: '',
  checkOut: '',
  guests: { adults: 1, children: 0, infants: 0, pets: 0 },
  category: 'all',
  minPrice: 0,
  maxPrice: 5000,
  propertyTypes: [],
  amenities: [],
  minBedrooms: 0,
  minBaths: 0,
  superhostOnly: false,
  instantBookOnly: false,
};

const CATEGORY_IDS = new Set(CATEGORIES.map(({ id }) => id));
const PROPERTY_TYPE_IDS = new Set(['entire_place', 'cabin', 'villa']);
const SEARCH_PARAMETER_KEYS = [
  'from',
  'to',
  'checkIn',
  'checkOut',
  'checkin',
  'checkout',
  'guests',
  'adults',
  'children',
  'infants',
  'pets',
  'destination',
  'propertyId',
  'category',
  'minPrice',
  'maxPrice',
  'type',
  'amenity',
  'minBedrooms',
  'minBaths',
  'superhost',
  'instantBook',
];

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

function parseBoolean(value: string | null): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function parseList(params: URLSearchParams, key: string, allowed?: Set<string>): string[] {
  return [
    ...new Set(
      params
        .getAll(key)
        .map((value) => value.trim())
        .filter(
          (value) => value.length > 0 && value.length <= 80 && (!allowed || allowed.has(value)),
        ),
    ),
  ].slice(0, 20);
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

  const checkIn = firstValue(params, 'from', 'checkIn', 'checkin');
  const checkOut = firstValue(params, 'to', 'checkOut', 'checkout');
  if (isValidDate(checkIn) && isValidDate(checkOut) && checkOut > checkIn) {
    filters.checkIn = checkIn;
    filters.checkOut = checkOut;
  }

  const guestsParam = params.get('guests');
  const totalGuests = guestsParam === null ? null : parseInteger(guestsParam, -1, 1, 17);
  const adultsParam = params.get('adults');
  const childrenParam = params.get('children');
  const children = parseInteger(childrenParam, 0, 0, 17);
  const adults =
    adultsParam === null
      ? totalGuests !== null && totalGuests > 0
        ? Math.max(1, totalGuests - children)
        : 1
      : parseInteger(adultsParam, 1, 1, 17);
  filters.guests.adults = adults;
  filters.guests.children = Math.min(children, 17 - adults);
  filters.guests.infants = parseInteger(params.get('infants'), 0, 0, 17);
  filters.guests.pets = parseInteger(params.get('pets'), 0, 0, 17);

  const destination = params.get('destination')?.trim() ?? '';
  filters.destination = destination.slice(0, 160);
  filters.destinationPropertyId = (params.get('propertyId')?.trim() ?? '').slice(0, 100);

  const category = params.get('category');
  if (category && CATEGORY_IDS.has(category)) filters.category = category;

  const minPrice = parsePrice(params.get('minPrice'), 0);
  const maxPrice = parsePrice(params.get('maxPrice'), 5000);
  if (minPrice <= maxPrice) {
    filters.minPrice = minPrice;
    filters.maxPrice = maxPrice;
  }

  filters.propertyTypes = parseList(params, 'type', PROPERTY_TYPE_IDS);
  filters.amenities = parseList(params, 'amenity');
  filters.minBedrooms = parseInteger(params.get('minBedrooms'), 0, 0, 30);
  filters.minBaths = parseInteger(params.get('minBaths'), 0, 0, 30);
  filters.superhostOnly = parseBoolean(params.get('superhost'));
  filters.instantBookOnly = parseBoolean(params.get('instantBook'));

  return filters;
}

export function serializeSearchFilters(filters: SearchFilters): string {
  const params = new URLSearchParams();
  if (
    isValidDate(filters.checkIn) &&
    isValidDate(filters.checkOut) &&
    filters.checkOut > filters.checkIn
  ) {
    params.set('from', filters.checkIn);
    params.set('to', filters.checkOut);
  }

  const totalGuests = filters.guests.adults + filters.guests.children;
  if (totalGuests !== 1) params.set('guests', String(totalGuests));
  if (filters.guests.adults !== 1) params.set('adults', String(filters.guests.adults));
  if (filters.guests.children > 0) params.set('children', String(filters.guests.children));
  if (filters.guests.infants > 0) params.set('infants', String(filters.guests.infants));
  if (filters.guests.pets > 0) params.set('pets', String(filters.guests.pets));

  if (filters.destination) params.set('destination', filters.destination);
  if (filters.destinationPropertyId) params.set('propertyId', filters.destinationPropertyId);
  if (filters.category !== 'all' && CATEGORY_IDS.has(filters.category))
    params.set('category', filters.category);
  if (filters.minPrice > 0) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice < 5000) params.set('maxPrice', String(filters.maxPrice));
  for (const propertyType of filters.propertyTypes) {
    if (PROPERTY_TYPE_IDS.has(propertyType)) params.append('type', propertyType);
  }
  for (const amenity of filters.amenities) {
    if (amenity.trim() && amenity.length <= 80) params.append('amenity', amenity);
  }
  if (filters.minBedrooms > 0) params.set('minBedrooms', String(filters.minBedrooms));
  if (filters.minBaths > 0) params.set('minBaths', String(filters.minBaths));
  if (filters.superhostOnly) params.set('superhost', 'true');
  if (filters.instantBookOnly) params.set('instantBook', 'true');

  return params.toString();
}

export function mergeSearchFiltersIntoUrl(search: string, filters: SearchFilters): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const key of SEARCH_PARAMETER_KEYS) params.delete(key);
  const searchState = new URLSearchParams(serializeSearchFilters(filters));
  searchState.forEach((value, key) => params.append(key, value));
  return params.toString();
}
