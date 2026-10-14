export interface Review {
  id: string;
  authorName: string;
  authorAvatar?: string;
  rating: number;
  date: string;
  comment: string;
  source?: 'airbnb' | 'bookingcom' | 'expedia' | 'internal';
  publicationStatus?: 'published' | 'not-published';
  categories: Partial<{
    cleanliness: number;
    accuracy: number;
    communication: number;
    location: number;
    checkIn: number;
    value: number;
  }>;
}

export interface Property {
  id: string;
  staysPropertyId?: string;
  complexName?: string;
  complexDescription?: string;
  complexImages?: string[];
  title: string;
  subtitle: string;
  description: string;
  category: string;
  propertyType: 'entire_place' | 'private_room' | 'cabin' | 'villa';
  location: {
    city: string;
    state: string;
    country: string;
    neighborhood: string;
    address: string;
    lat: number;
    lng: number;
  };
  pricePerNight: number;
  cleaningFee: number;
  serviceFeeRate: number; // e.g. 0.12 (12%)
  rating: number;
  reviewCount: number;
  isSuperhost: boolean;
  isGuestFavorite: boolean;
  instantBook: boolean;
  images: string[];
  bedrooms: number;
  beds: number;
  bathrooms: number;
  maxGuests: number;
  amenities: string[];
  listingAmenities?: string[];
  propertyAmenities?: string[];
  highlights: {
    icon: string;
    title: string;
    description: string;
  }[];
  sleepingArrangements: {
    roomName: string;
    bedType: string;
    icon: string;
  }[];
  calendar?: {
    date: string;
    avail: number;
    price?: number;
    minStay?: number;
    closedToArrival?: boolean;
    closedToDeparture?: boolean;
  }[];
  rules: string[];
  host: {
    name: string;
    avatar: string;
    joinedYear: number;
    isSuperhost: boolean;
    responseTime: string;
    responseRate: string;
    bio: string;
  };
  reviews: Review[];
  staysListingId?: string;
  staysListingObjectId?: string;
  staysSynced?: boolean;
  reviewsSynced?: boolean;
  calculatedPrice?: {
    nights: number;
    dailyRate: number;
    basePrice: number;
    cleaningFee: number;
    serviceFee: number;
    totalAmount: number;
    currency: string;
    fees?: unknown[];
  };
}

export interface Reservation {
  id: string;
  code: string;
  propertyId: string;
  propertyTitle: string;
  propertyLocation: string;
  propertyImage: string;
  checkIn: string;
  checkOut: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  nights: number;
  guests: {
    adults: number;
    children: number;
    infants: number;
    pets: number;
  };
  pricePerNight: number;
  cleaningFee: number;
  serviceFee: number;
  discount: number;
  totalAmount: number;
  paymentMethod: 'pix' | 'credit_card' | 'apple_pay' | '';
  status: 'confirmed' | 'cancelled' | 'completed' | 'pending';
  cancellationRequested?: boolean;
  createdAt: string;
  hostName: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  installments?: number;
  staysReservationId?: string;
  staysLocator?: string;
  directBookingReference?: string;
  staysSyncStatus?: 'synced' | 'pending' | 'offline';
}

export type ReservationCancellationResult = 'cancelled' | 'requested';

export interface StaysConfig {
  accountDomain: string; // e.g. centraldereservascn.stays.net or play.stays.net
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  autoSyncListings: boolean;
  autoSyncReservations: boolean;
  webhookUrl: string;
  isConnected: boolean;
  lastSyncTimestamp: string | null;
}

export interface StaysApiLog {
  id: string;
  timestamp: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  status: number;
  durationMs: number;
  requestBody?: unknown;
  responseBody?: unknown;
  success: boolean;
}

export interface StaysPriceCalculationRequest {
  listingId: string;
  checkInDate: string;
  checkOutDate: string;
  guests: {
    adults: number;
    children: number;
    infants?: number;
  };
}

export interface StaysPriceCalculationResponse {
  available: boolean;
  currency: string;
  nights: number;
  dailyPriceAverage: number;
  subtotal: number;
  fees: Array<{
    type: string;
    amount: number;
    name: string;
  }>;
  discount: number;
  total: number;
}

export interface SearchFilters {
  destination: string;
  destinationPropertyId?: string;
  checkIn: string;
  checkOut: string;
  guests: {
    adults: number;
    children: number;
    infants: number;
    pets: number;
  };
  category: string;
  minPrice: number;
  maxPrice: number;
  propertyTypes: string[];
  amenities: string[];
  minBedrooms: number;
  minBaths: number;
  superhostOnly: boolean;
  instantBookOnly: boolean;
}

export type Currency = 'BRL' | 'USD' | 'EUR';
