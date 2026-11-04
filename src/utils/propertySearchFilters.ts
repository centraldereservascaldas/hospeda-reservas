import type { Property, SearchFilters } from '../types';
import { matchesPropertyCategory } from './propertyCategories';
import { countOccupancyGuests } from './guestCounts';
import { getStoredPropertyQuote } from './propertyDisplayPrice';
import { getCatalogAmenities, matchesPropertyAmenity } from './propertyAmenities';

export function matchesPropertyDestination(property: Property, destination: string): boolean {
  const normalizedDestination = destination.trim().toLowerCase();
  if (!normalizedDestination) return true;

  return [
    property.location.city,
    property.location.state,
    property.title,
    property.location.neighborhood,
    property.complexName || '',
  ].some((value) => value.toLowerCase().includes(normalizedDestination));
}

export function filterPropertiesBySearchFilters(
  properties: Property[],
  filters: SearchFilters,
): Property[] {
  return properties.filter((property) => {
    if (!matchesPropertyCategory(property, filters.category)) return false;

    if (
      filters.destinationPropertyId &&
      property.staysPropertyId !== filters.destinationPropertyId
    ) {
      return false;
    }

    if (!matchesPropertyDestination(property, filters.destination)) return false;

    const requestedGuests = countOccupancyGuests(filters.guests);
    if (requestedGuests > property.maxGuests) return false;
    const hasPriceFilter = filters.minPrice > 0 || filters.maxPrice < 5000;
    if (hasPriceFilter) {
      const hasSearchDates = Boolean(filters.checkIn && filters.checkOut);
      const confirmedNightlyPrice = hasSearchDates
        ? (getStoredPropertyQuote(property)?.dailyRate ?? null)
        : property.pricePerNight;
      if (
        confirmedNightlyPrice === null ||
        confirmedNightlyPrice < filters.minPrice ||
        confirmedNightlyPrice > filters.maxPrice
      ) {
        return false;
      }
    }
    if (
      filters.propertyTypes.length > 0 &&
      !filters.propertyTypes.includes(property.propertyType)
    ) {
      return false;
    }
    if (filters.minBedrooms > 0 && property.bedrooms < filters.minBedrooms) return false;
    if (filters.minBaths > 0 && property.bathrooms < filters.minBaths) return false;
    if (filters.superhostOnly && !property.isSuperhost) return false;
    if (filters.instantBookOnly && !property.instantBook) return false;

    if (
      filters.amenities.length > 0 &&
      !filters.amenities.every((amenity) =>
        matchesPropertyAmenity(
          getCatalogAmenities(
            property.amenities,
            property.listingAmenities,
            property.propertyAmenities,
          ),
          amenity,
        ),
      )
    ) {
      return false;
    }

    return true;
  });
}

export function countActivePropertyFilters(filters: SearchFilters): number {
  let count = 0;
  if (filters.minPrice > 0 || filters.maxPrice < 5000) count += 1;
  count += filters.propertyTypes.length;
  count += filters.amenities.length;
  if (filters.minBedrooms > 0) count += 1;
  if (filters.minBaths > 0) count += 1;
  if (filters.superhostOnly) count += 1;
  if (filters.instantBookOnly) count += 1;
  return count;
}
