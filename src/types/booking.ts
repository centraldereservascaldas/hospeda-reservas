import type { Property } from './index';
import type { CalculatedPriceResponse } from '../services/crcnBackendApi';

export interface AppOverlayBookingPayload {
  property: Property;
  checkIn: string;
  checkOut: string;
  guests: { adults: number; children: number; infants: number; pets: number };
  nights: number;
  totalAmount: number;
  cleaningFee: number;
  serviceFee: number;
  discount: number;
  quote: CalculatedPriceResponse;
}
