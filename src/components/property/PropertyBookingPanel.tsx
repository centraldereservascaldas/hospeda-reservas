import type { RefObject } from 'react';
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, Sparkles, Star } from 'lucide-react';
import type { Currency, Property } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import type { CalculatedPriceResponse } from '../../services/crcnBackendApi';
import { calculatePropertyPricing } from '../../utils/propertyPricing';
import { PropertyPriceBreakdown } from './PropertyPriceBreakdown';

interface PropertyBookingPanelProps {
  property: Property;
  currency: Currency;
  hasReviews: boolean;
  checkIn: string;
  checkOut: string;
  isDatePickerOpen: boolean;
  activeDateField: 'checkIn' | 'checkOut';
  onOpenDatePicker: (field: 'checkIn' | 'checkOut') => void;
  guestSelectorTriggerRef: RefObject<HTMLButtonElement | null>;
  isGuestSelectorOpen: boolean;
  onToggleGuestSelector: () => void;
  totalGuests: number;
  infants: number;
  nights: number;
  staysPrice: CalculatedPriceResponse | null;
  isCalculatingPrice: boolean;
  selectedRangeAvailable: boolean;
  pricing: ReturnType<typeof calculatePropertyPricing>;
  onProceedBooking: () => void;
}

function formatDateLabel(value: string): string {
  return value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : 'Selecionar';
}

export function PropertyBookingPanel({
  property,
  currency,
  hasReviews,
  checkIn,
  checkOut,
  isDatePickerOpen,
  activeDateField,
  onOpenDatePicker,
  guestSelectorTriggerRef,
  isGuestSelectorOpen,
  onToggleGuestSelector,
  totalGuests,
  infants,
  nights,
  staysPrice,
  isCalculatingPrice,
  selectedRangeAvailable,
  pricing,
  onProceedBooking,
}: PropertyBookingPanelProps) {
  return (
    <div className="sticky top-24 bg-white/70 backdrop-blur-2xl rounded-3xl p-6 border border-white/90 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.1)] space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          {staysPrice || property.pricePerNight > 0 ? (
            <>
              <span className="text-2xl font-black text-neutral-900">
                {formatCurrency(staysPrice?.dailyRate ?? property.pricePerNight, currency)}
              </span>
              <span className="ml-1 text-xs text-neutral-500">/ noite</span>
            </>
          ) : (
            <span className="text-lg font-bold text-neutral-900">Consulte valores</span>
          )}
        </div>

        {hasReviews && (
          <div className="flex items-center gap-1 text-xs font-semibold text-neutral-800 bg-white/60 px-2 py-0.5 rounded-lg border border-white/80 shadow-2xs">
            <Star className="h-3.5 w-3.5 fill-neutral-900 text-neutral-900" />
            <span>{property.rating.toFixed(2)}</span>
            <span className="text-neutral-400">({property.reviewCount})</span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-300/80 bg-white/50 backdrop-blur-md divide-y divide-neutral-200/80 shadow-2xs">
        <div className="grid grid-cols-2 divide-x divide-neutral-200/80">
          <button
            type="button"
            onClick={() => onOpenDatePicker('checkIn')}
            aria-haspopup="dialog"
            aria-controls="stay-dates-dialog"
            aria-expanded={isDatePickerOpen && activeDateField === 'checkIn'}
            className="flex min-h-16 w-full items-center justify-between gap-2 p-2.5 text-left transition-colors hover:bg-orange-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500"
          >
            <span>
              <span className="block text-[10px] font-bold uppercase text-neutral-500">
                Check-in
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-neutral-900">
                {formatDateLabel(checkIn)}
              </span>
            </span>
            <CalendarIcon className="h-4 w-4 shrink-0 text-orange-600" />
          </button>
          <button
            type="button"
            onClick={() => onOpenDatePicker('checkOut')}
            aria-haspopup="dialog"
            aria-controls="stay-dates-dialog"
            aria-expanded={isDatePickerOpen && activeDateField === 'checkOut'}
            className="flex min-h-16 w-full items-center justify-between gap-2 p-2.5 text-left transition-colors hover:bg-orange-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500"
          >
            <span>
              <span className="block text-[10px] font-bold uppercase text-neutral-500">
                Check-out
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-neutral-900">
                {formatDateLabel(checkOut)}
              </span>
            </span>
            <CalendarIcon className="h-4 w-4 shrink-0 text-orange-600" />
          </button>
        </div>

        <div className="relative z-30 p-2.5">
          <button
            ref={guestSelectorTriggerRef}
            type="button"
            onClick={onToggleGuestSelector}
            aria-haspopup="dialog"
            aria-expanded={isGuestSelectorOpen}
            className="w-full flex items-center justify-between text-left cursor-pointer"
          >
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-500 block">
                Hóspedes
              </span>
              <span className="text-xs font-semibold text-neutral-900">
                {totalGuests} hóspede{totalGuests > 1 ? 's' : ''}
                {infants > 0 ? `, ${infants} bebê${infants > 1 ? 's' : ''}` : ''}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-neutral-500" />
          </button>
        </div>
      </div>

      <button
        onClick={onProceedBooking}
        disabled={
          !staysPrice ||
          staysPrice.source !== 'stays-live' ||
          isCalculatingPrice ||
          !selectedRangeAvailable
        }
        className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white font-extrabold text-sm shadow-lg shadow-orange-500/35 border border-white/30 backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:from-neutral-200 disabled:via-neutral-200 disabled:to-neutral-200 disabled:text-neutral-700 disabled:shadow-none disabled:border-neutral-300 disabled:hover:scale-100 disabled:cursor-not-allowed"
      >
        <span>
          {isCalculatingPrice
            ? 'Atualizando cotação...'
            : selectedRangeAvailable && staysPrice?.source === 'stays-live'
              ? 'Continuar para reserva'
              : 'Disponibilidade indisponível'}
        </span>
        <ChevronRight className="h-4 w-4" />
      </button>

      <div className="flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-full bg-orange-50 text-orange-800 text-[10px] font-bold border border-orange-200/80">
        <Sparkles className="w-3 h-3 text-orange-500" />
        <span>
          {isCalculatingPrice
            ? 'Atualizando valores...'
            : staysPrice?.source === 'stays-live'
              ? 'Valores atualizados'
              : 'Valores indisponíveis'}
        </span>
      </div>

      <PropertyPriceBreakdown
        property={property}
        currency={currency}
        nights={nights}
        staysPrice={staysPrice}
        pricing={pricing}
      />
    </div>
  );
}
