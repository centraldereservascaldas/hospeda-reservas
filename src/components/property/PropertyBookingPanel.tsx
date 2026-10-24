import type { RefObject } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Star,
} from 'lucide-react';
import type { Currency, Property } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import type { CalculatedPriceResponse } from '../../services/crcnBackendApi';
import { calculatePropertyPricing, isConfirmedPropertyQuote } from '../../utils/propertyPricing';
import { PropertyPriceBreakdown } from './PropertyPriceBreakdown';

interface PropertyBookingPanelProps {
  property: Property;
  currency: Currency;
  hasReviews: boolean;
  checkIn: string;
  checkOut: string;
  hasExplicitDateSelection: boolean;
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
  calendarAvailable: boolean;
  calendarCoverageEnd: string;
  isLoadingCalendar: boolean;
  isCalculatingPrice: boolean;
  priceRequestFailed: boolean;
  onRetryCalendar: () => void;
  onRetryPrice: () => void;
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
  hasExplicitDateSelection,
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
  calendarAvailable,
  calendarCoverageEnd,
  isLoadingCalendar,
  isCalculatingPrice,
  priceRequestFailed,
  onRetryCalendar,
  onRetryPrice,
  selectedRangeAvailable,
  pricing,
  onProceedBooking,
}: PropertyBookingPanelProps) {
  const hasConfirmedLivePrice = isConfirmedPropertyQuote(staysPrice);
  const canProceedWithBooking = Boolean(
    hasExplicitDateSelection &&
    selectedRangeAvailable &&
    !isCalculatingPrice &&
    hasConfirmedLivePrice &&
    !property.simulatedData,
  );
  const hasCalendarCoverage = Boolean(calendarCoverageEnd && checkOut <= calendarCoverageEnd);
  const bookingButtonLabel =
    property.simulatedData && hasConfirmedLivePrice
      ? 'Simulação: reserva desativada'
      : isLoadingCalendar
        ? 'Consultando disponibilidade...'
        : !calendarAvailable
          ? 'Disponibilidade não confirmada'
          : !hasExplicitDateSelection
            ? 'Confirme as datas'
            : !hasCalendarCoverage
              ? 'Disponibilidade não confirmada'
              : isCalculatingPrice
                ? 'Atualizando cotação...'
                : canProceedWithBooking
                  ? 'Continuar para reserva'
                  : selectedRangeAvailable
                    ? 'Cotação indisponível'
                    : 'Escolha datas disponíveis';
  const bookingStatusMessage =
    property.simulatedData && hasConfirmedLivePrice
      ? 'Valores e disponibilidade simulados; não é possível reservar neste ambiente.'
      : isLoadingCalendar
        ? 'Consultando disponibilidade...'
        : !calendarAvailable
          ? 'Disponibilidade não confirmada para estas datas'
          : !hasCalendarCoverage
            ? 'Ainda não consultamos todo o período. Abra o calendário para confirmar as datas.'
            : !selectedRangeAvailable && hasExplicitDateSelection
              ? 'O período selecionado não está disponível. Escolha outras datas.'
              : !hasExplicitDateSelection
                ? 'Confirme as datas para verificar disponibilidade e cotação.'
                : isCalculatingPrice
                  ? 'Disponibilidade confirmada; consultando cotação...'
                  : priceRequestFailed
                    ? 'Não foi possível consultar o preço. Tente novamente.'
                    : hasConfirmedLivePrice
                      ? 'Disponibilidade e valores atualizados'
                      : 'Disponibilidade confirmada; cotação ainda não confirmada';

  return (
    <div className="property-booking-panel bg-white/70 backdrop-blur-2xl rounded-3xl p-6 border border-white/90 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.1)] space-y-4 [@media(max-height:400px)]:p-3 [@media(max-height:400px)]:space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {hasExplicitDateSelection && hasConfirmedLivePrice ? (
            <div>
              <span className="block text-2xl font-black leading-tight text-neutral-900">
                {formatCurrency(staysPrice!.dailyRate, currency)}
              </span>
              <span className="mt-0.5 block text-xs text-neutral-500">média por noite</span>
            </div>
          ) : hasExplicitDateSelection ? (
            <span className="text-lg font-bold text-neutral-900">
              {isCalculatingPrice
                ? 'Consultando preço...'
                : priceRequestFailed
                  ? 'Falha ao consultar preço'
                  : staysPrice
                    ? 'Preço indisponível'
                    : 'Preço não confirmado'}
            </span>
          ) : property.pricePerNight > 0 ? (
            <div>
              <span className="block text-2xl font-black leading-tight text-neutral-900">
                {formatCurrency(property.pricePerNight, currency)}
              </span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                tarifa de referência / noite
              </span>
            </div>
          ) : (
            <span className="text-lg font-bold text-neutral-900">Consulte valores</span>
          )}
        </div>

        {hasReviews && (
          <div className="flex items-center gap-1 text-xs font-semibold text-neutral-800 bg-white/60 px-2 py-0.5 rounded-lg border border-white/80 shadow-2xs">
            <Star className="h-3.5 w-3.5 fill-neutral-900 text-neutral-900" />
            <span>{property.rating.toFixed(2)}</span>
            <span className="text-neutral-600">({property.reviewCount})</span>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-300/80 bg-white/50 backdrop-blur-md divide-y divide-neutral-200/80 shadow-2xs">
        <div className="property-booking-dates grid grid-cols-2">
          <button
            type="button"
            onClick={() => onOpenDatePicker('checkIn')}
            aria-haspopup="dialog"
            aria-controls="stay-dates-dialog"
            aria-expanded={isDatePickerOpen && activeDateField === 'checkIn'}
            className="flex min-h-16 w-full items-center justify-between gap-2 p-2.5 text-left transition-colors hover:bg-orange-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 max-[360px]:gap-0 max-[360px]:p-1"
          >
            <span>
              <span className="block break-words text-caption font-bold uppercase text-neutral-500">
                Check-in
              </span>
              <span className="mt-0.5 block break-words text-xs font-semibold text-neutral-900">
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
            className="flex min-h-16 w-full items-center justify-between gap-2 p-2.5 text-left transition-colors hover:bg-orange-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 max-[360px]:gap-0 max-[360px]:p-1"
          >
            <span>
              <span className="block break-words text-caption font-bold uppercase text-neutral-500">
                Check-out
              </span>
              <span className="mt-0.5 block break-words text-xs font-semibold text-neutral-900">
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
            aria-controls="property-guest-selector-dialog"
            aria-expanded={isGuestSelectorOpen}
            className="min-h-11 w-full flex items-center justify-between rounded-lg text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            <div>
              <span className="text-caption uppercase font-bold text-neutral-500 block">
                Hóspedes
              </span>
              <span className="text-xs font-semibold text-neutral-900">
                {totalGuests} pessoa{totalGuests > 1 ? 's' : ''}
                {infants > 0 ? ` (${infants} bebê${infants > 1 ? 's' : ''})` : ''}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-neutral-500" />
          </button>
        </div>
      </div>

      <div
        className="flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-full bg-orange-50 text-orange-800 text-caption font-bold border border-orange-200/80"
        role="status"
        aria-live="polite"
      >
        <Sparkles className="w-3 h-3 text-orange-500" />
        <span>{bookingStatusMessage}</span>
      </div>

      {!calendarAvailable && !isLoadingCalendar && (
        <button
          type="button"
          onClick={onRetryCalendar}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-bold text-neutral-800 transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Verificar disponibilidade novamente
        </button>
      )}

      {selectedRangeAvailable && !isCalculatingPrice && !hasConfirmedLivePrice && (
        <button
          type="button"
          onClick={onRetryPrice}
          className="min-h-11 w-full rounded-xl border border-orange-300 bg-white px-4 py-2.5 text-sm font-bold text-orange-800 transition hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          Tentar cotação novamente
        </button>
      )}

      {hasExplicitDateSelection && hasConfirmedLivePrice && (
        <PropertyPriceBreakdown
          property={property}
          currency={currency}
          nights={nights}
          staysPrice={staysPrice}
          pricing={pricing}
        />
      )}

      <button
        onClick={onProceedBooking}
        disabled={!canProceedWithBooking}
        className="w-full py-4 [@media(max-height:400px)]:py-3 rounded-2xl bg-gradient-to-r from-orange-700 via-amber-700 to-orange-800 text-white font-extrabold text-sm shadow-lg shadow-orange-500/35 border border-white/30 backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:from-neutral-200 disabled:via-neutral-200 disabled:to-neutral-200 disabled:text-neutral-700 disabled:shadow-none disabled:border-neutral-300 disabled:hover:scale-100 disabled:cursor-not-allowed"
      >
        <span>{bookingButtonLabel}</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
