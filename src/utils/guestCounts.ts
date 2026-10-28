export interface OccupancyGuestCounts {
  adults: number;
  children: number;
  infants: number;
}

export function countOccupancyGuests(guests: OccupancyGuestCounts): number {
  return guests.adults + guests.children + guests.infants;
}
