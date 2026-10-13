import type { Property, SearchFilters } from '../types';
import { matchesPropertyCategory } from './propertyCategories';

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

    if (filters.destination.trim()) {
      const destination = filters.destination.toLowerCase();
      const matchesDestination = [
        property.location.city,
        property.location.state,
        property.title,
        property.location.neighborhood,
        property.complexName || '',
      ].some((value) => value.toLowerCase().includes(destination));
      if (!matchesDestination) return false;
    }

    const requestedGuests = filters.guests.adults + filters.guests.children;
    if (requestedGuests > property.maxGuests) return false;
    if (property.pricePerNight < filters.minPrice || property.pricePerNight > filters.maxPrice) {
      return false;
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
        property.amenities.some((propertyAmenity) =>
          propertyAmenity.toLowerCase().includes(amenity.toLowerCase()),
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
  if (filters.propertyTypes.length > 0) count += 1;
  count += filters.amenities.length;
  if (filters.minBedrooms > 0) count += 1;
  if (filters.minBaths > 0) count += 1;
  if (filters.superhostOnly) count += 1;
  if (filters.instantBookOnly) count += 1;
  return count;
}
