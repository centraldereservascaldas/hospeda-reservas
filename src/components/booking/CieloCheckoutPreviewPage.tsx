import { STAYS_NET_APARTMENTS } from '../../data/staysApartments';
import { SinglePageCheckout } from './SinglePageCheckout';

const previewProperty = STAYS_NET_APARTMENTS[0]!;

const previewBooking = {
  property: previewProperty,
  checkIn: '2026-11-20',
  checkOut: '2026-11-23',
  guests: { adults: 2, children: 0, infants: 0, pets: 0 },
  nights: 3,
  totalAmount: 900,
  cleaningFee: 0,
  serviceFee: 0,
  discount: 0,
  quote: {
    success: true as const,
    listingId: previewProperty.staysListingId || previewProperty.id,
    nights: 3,
    dailyRate: 300,
    baseTotal: 900,
    total: 900,
    cleaningFee: 0,
    serviceFee: 0,
    discount: 0,
    currency: 'BRL' as const,
    feesIncluded: true,
    fees: [],
    source: 'stays-live' as const,
    breakdown: {
      dailyRateText: '3 noites',
      cleaningFeeText: '',
      serviceFeeText: '',
      totalText: 'R$ 900,00',
    },
  },
};

export function CieloCheckoutPreviewPage() {
  return (
    <SinglePageCheckout
      bookingData={previewBooking}
      guestPrefill={{ fullName: '', email: '', phone: '' }}
      onClose={() => {
        window.location.href = '/';
      }}
      previewOnly
    />
  );
}
