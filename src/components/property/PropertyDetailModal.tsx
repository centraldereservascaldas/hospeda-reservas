import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Property, Currency } from '../../types';
import { calculateNights } from '../../utils/formatters';
import type { CalculatedPriceResponse } from '../../services/crcnBackendApi';
import { isCalendarRangeAvailable } from '../../utils/staysAvailability';
import type { StaysCalendarDay } from '../../utils/staysAvailability';
import { calculatePropertyPricing, isConfirmedPropertyQuote } from '../../utils/propertyPricing';
import { getSyncedPropertyReviews } from '../../utils/propertyReviews';
import { scrollIntoViewRespectingMotion } from '../../utils/motion';
import { PropertyReviewsSection } from './PropertyReviewsSection';
import { PropertyAmenitiesSection } from './PropertyAmenitiesSection';
import { PropertyPoliciesSection } from './PropertyPoliciesSection';
import { PropertyLocationSection } from './PropertyLocationSection';
import { PropertyHostSection } from './PropertyHostSection';
import { PropertyOverviewSection } from './PropertyOverviewSection';
import { PropertyBookingPanel } from './PropertyBookingPanel';
import { PropertyAvailabilityStrip } from './PropertyAvailabilityStrip';
import { PropertyGalleryDialog } from './PropertyGalleryDialog';
import { PropertyGuestSelectorDialog } from './PropertyGuestSelectorDialog';
import { PropertyDatePickerDialog } from './PropertyDatePickerDialog';
import { PropertyDetailHeader } from './PropertyDetailHeader';
import { PropertyPhotoGrid } from './PropertyPhotoGrid';
import { PropertyDetailActions } from './PropertyDetailActions';
import { useDialogFocus } from '../useDialogFocus';
import { usePropertyAvailability } from './usePropertyAvailability';
import { selectAvailabilityDay, selectAvailabilityRange } from '../../utils/propertyDateSelection';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import {
  getAccommodationIdFromPath,
  mergeSearchFiltersIntoUrl,
  parseSearchFilters,
} from '../../utils/searchUrlState';
import { countOccupancyGuests } from '../../utils/guestCounts';
import { checkoutApi } from '../../services/checkoutApi';

interface PropertyDetailModalProps {
  property: Property | null;
  initialCheckIn: string;
  initialCheckOut: string;
  initialGuests: { adults: number; children: number; infants: number; pets: number };
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  currency: Currency;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
  onStartBooking: (bookingData: {
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
  }) => void;
  presentation?: 'dialog' | 'page';
}

export const PropertyDetailModal: React.FC<PropertyDetailModalProps> = ({
  property,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
  onClose,
  returnFocusRef,
  currency,
  isSaved,
  onToggleSave,
  onStartBooking,
  presentation = 'dialog',
}) => {
  const isDialog = presentation === 'dialog';
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const detailTitleRef = useRef<HTMLHeadingElement>(null);
  const detailDialogRef = useDialogFocus(property !== null && isDialog, onClose, {
    initialFocusRef: detailTitleRef,
    returnFocusRef,
  });
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const propertyId = property?.id;
  const defaultCheckIn = initialCheckIn;
  const defaultCheckOut = initialCheckOut;
  // Booking state
  const [checkIn, setCheckIn] = useState<string>(defaultCheckIn);
  const [checkOut, setCheckOut] = useState<string>(defaultCheckOut);
  const [adults, setAdults] = useState<number>(Math.max(1, initialGuests.adults));
  const [children, setChildren] = useState<number>(initialGuests.children);
  const [infants, setInfants] = useState<number>(initialGuests.infants);
  const [pets, setPets] = useState<number>(initialGuests.pets);
  const [isGuestSelectorOpen, setIsGuestSelectorOpen] = useState(false);
  const guestSelectorTriggerRef = useRef<HTMLButtonElement>(null);
  const [guestPopoverPosition, setGuestPopoverPosition] = useState({ top: 0, left: 0, width: 280 });
  const [draftCheckIn, setDraftCheckIn] = useState(defaultCheckIn);
  const [draftCheckOut, setDraftCheckOut] = useState(defaultCheckOut);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [activeDateField, setActiveDateField] = useState<'checkIn' | 'checkOut'>('checkIn');
  const [displayedMonth, setDisplayedMonth] = useState(() => {
    const date = new Date(`${defaultCheckIn || todayIso}T12:00:00`);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [calendarInteractionMessage, setCalendarInteractionMessage] = useState('');
  const hasEditedBookingContextRef = useRef(false);
  const hasExplicitDateSelectionRef = useRef(Boolean(initialCheckIn && initialCheckOut));
  const latestBookingContextRef = useRef({ checkIn, checkOut, adults, children, infants, pets });
  latestBookingContextRef.current = { checkIn, checkOut, adults, children, infants, pets };
  useEffect(() => {
    if (!isDialog && propertyId) detailTitleRef.current?.focus();
  }, [isDialog, propertyId]);
  const {
    staysPrice,
    calendarDays,
    calendarCoverageEnd,
    calendarAvailable,
    calendarMessage: availabilityMessage,
    isLoadingCalendar,
    isExtendingCalendar,
    calendarExtensionMessage,
    loadCalendarThrough,
    retryCalendarExtension,
    retryCalendar,
    revalidateCalendar,
    retryPrice,
    isCalculatingPrice,
    priceRequestFailed,
  } = usePropertyAvailability({
    property,
    checkIn,
    checkOut,
    guests: countOccupancyGuests({ adults, children, infants }),
    todayIso,
  });

  useEffect(() => {
    if (!propertyId || !isConfirmedPropertyQuote(staysPrice) || !checkIn || !checkOut) return;
    void checkoutApi.getCheckoutReadiness(propertyId);
    void import('../booking/CheckoutEntry');
    void import('../booking/SinglePageCheckout');
  }, [propertyId, staysPrice, checkIn, checkOut]);

  useEffect(() => {
    if (!isDatePickerOpen || !calendarCoverageEnd) return;
    const displayedYear = displayedMonth.getFullYear();
    const displayedMonthIndex = displayedMonth.getMonth();
    if (!Number.isFinite(displayedYear) || !Number.isFinite(displayedMonthIndex)) return;
    const monthEnd = new Date(displayedYear, displayedMonthIndex + 2, 0);
    const monthEndIso = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
    if (monthEndIso > calendarCoverageEnd) void loadCalendarThrough(monthEndIso);
  }, [calendarCoverageEnd, displayedMonth, isDatePickerOpen, loadCalendarThrough]);

  useEffect(() => {
    if (!propertyId) return;
    const nextCheckIn = initialCheckIn;
    const requestedCheckOut = initialCheckOut;
    const nextCheckOut = requestedCheckOut > nextCheckIn ? requestedCheckOut : '';
    hasEditedBookingContextRef.current = false;
    hasExplicitDateSelectionRef.current = Boolean(initialCheckIn && initialCheckOut);
    setCheckIn(nextCheckIn);
    setCheckOut(nextCheckOut);
    setAdults(Math.max(1, initialGuests.adults));
    setChildren(initialGuests.children);
    setInfants(initialGuests.infants);
    setPets(initialGuests.pets);
    setDisplayedMonth(new Date(`${nextCheckIn || todayIso}T12:00:00`));
  }, [
    propertyId,
    todayIso,
    initialCheckIn,
    initialCheckOut,
    initialGuests.adults,
    initialGuests.children,
    initialGuests.infants,
    initialGuests.pets,
  ]);

  useEffect(() => {
    if (isDialog || !propertyId || !hasEditedBookingContextRef.current) return;

    const currentUrl = new URL(window.location.href);
    const currentFilters = parseSearchFilters(currentUrl.search);
    currentUrl.search = mergeSearchFiltersIntoUrl(currentUrl.search, {
      ...currentFilters,
      checkIn: hasExplicitDateSelectionRef.current ? checkIn : '',
      checkOut: hasExplicitDateSelectionRef.current ? checkOut : '',
      guests: { adults, children, infants, pets },
    });

    window.history.replaceState(
      window.history.state,
      '',
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    );
  }, [adults, children, checkIn, checkOut, infants, isDialog, pets, propertyId]);

  useEffect(() => {
    if (isDialog || !propertyId) return;

    const preserveBookingContextOnCatalogReturn = () => {
      const pathname = window.location.pathname;
      const isCatalogRoute = pathname === '/' || /^\/[a-z]{2}\/search\/?$/i.test(pathname);
      if (!isCatalogRoute || getAccommodationIdFromPath(pathname)) return;

      const url = new URL(window.location.href);
      const currentFilters = parseSearchFilters(url.search);
      const {
        checkIn: latestCheckIn,
        checkOut: latestCheckOut,
        ...guests
      } = latestBookingContextRef.current;
      const search = mergeSearchFiltersIntoUrl(url.search, {
        ...currentFilters,
        checkIn: hasExplicitDateSelectionRef.current ? latestCheckIn : '',
        checkOut: hasExplicitDateSelectionRef.current ? latestCheckOut : '',
        guests,
      });
      const nextSearch = search ? `?${search}` : '';
      if (nextSearch === url.search) return;

      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${nextSearch}${url.hash}`,
      );
    };

    window.addEventListener('popstate', preserveBookingContextOnCatalogReturn, true);
    return () => {
      window.removeEventListener('popstate', preserveBookingContextOnCatalogReturn, true);
    };
  }, [isDialog, propertyId]);

  const openPhotoGallery = (index = 0) => {
    setActivePhotoIndex(index);
    setShowAllPhotos(true);
  };

  const openDatePicker = (field: 'checkIn' | 'checkOut') => {
    revalidateCalendar();
    setDraftCheckIn(checkIn);
    setDraftCheckOut(checkOut);
    setCalendarInteractionMessage('');
    setActiveDateField(field === 'checkOut' && !checkIn ? 'checkIn' : field);
    const selectedDate = field === 'checkIn' ? checkIn : checkOut || checkIn;
    const date = new Date(`${selectedDate || todayIso}T12:00:00`);
    setDisplayedMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setIsDatePickerOpen(true);
  };

  const toggleGuestSelector = () => {
    if (isGuestSelectorOpen) {
      setIsGuestSelectorOpen(false);
      return;
    }
    const trigger = guestSelectorTriggerRef.current;
    if (trigger) {
      const bounds = trigger.getBoundingClientRect();
      const popoverHeight = Math.min(420, window.innerHeight - 16);
      const maxPopoverWidth = window.innerHeight <= 420 ? 360 : 320;
      const popoverWidth = Math.min(
        maxPopoverWidth,
        Math.max(280, bounds.width),
        window.innerWidth - 24,
      );
      const top =
        window.innerHeight - bounds.bottom >= popoverHeight + 16
          ? bounds.bottom + 8
          : bounds.top >= popoverHeight + 16
            ? bounds.top - popoverHeight - 8
            : Math.max(8, (window.innerHeight - popoverHeight) / 2);
      const left = Math.min(Math.max(12, bounds.left), window.innerWidth - popoverWidth - 12);
      setGuestPopoverPosition({ top, left, width: popoverWidth });
    }
    setIsGuestSelectorOpen(true);
  };

  if (!property) return null;

  const displayTitle = getPublicPropertyTitle(property.title);
  const staysReviews = getSyncedPropertyReviews(property);
  const hasReviews = staysReviews.length > 0;
  const scrollToReviews = () => {
    const reviewsSection = document.getElementById('property-reviews');
    if (reviewsSection) scrollIntoViewRespectingMotion(reviewsSection, { block: 'start' });
  };

  const nights = calculateNights(checkIn, checkOut);
  const { baseSubtotal, discount, cleaningFee, serviceFee, totalAmount, visibleFees } =
    calculatePropertyPricing({
      nightlyRate: property.pricePerNight,
      cleaningFee: property.cleaningFee,
      serviceFeeRate: property.serviceFeeRate,
      nights,
      quote: staysPrice,
    });
  const totalGuests = countOccupancyGuests({ adults, children, infants });
  const guestLimit = Math.max(1, Number(property.maxGuests) || 1);
  const selectedRangeAvailable =
    calendarAvailable && isCalendarRangeAvailable(calendarDays, checkIn, checkOut);
  const showMobileBookingAction = !isDatePickerOpen && !isGuestSelectorOpen && !showAllPhotos;
  const chooseDate = (date: Date) => {
    const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (activeDateField === 'checkIn') {
      const selectedDay = calendarDays.find((day) => day.date === dateValue);
      if (
        !calendarAvailable ||
        !selectedDay ||
        selectedDay.avail < 1 ||
        selectedDay.closedToArrival
      ) {
        setCalendarInteractionMessage('Esta data não está disponível para check-in.');
        return;
      }
      setDraftCheckIn(dateValue);
      if (draftCheckOut && !isCalendarRangeAvailable(calendarDays, dateValue, draftCheckOut)) {
        setDraftCheckOut('');
      }
      setCalendarInteractionMessage('');
      setActiveDateField('checkOut');
      return;
    }
    if (!isCalendarRangeAvailable(calendarDays, draftCheckIn, dateValue)) {
      setCalendarInteractionMessage(
        'Esse período inclui uma data indisponível ou não atende à estadia mínima.',
      );
      return;
    }
    setDraftCheckOut(dateValue);
    setCalendarInteractionMessage('');
  };

  const selectCalendarDay = (day: StaysCalendarDay) => {
    const selection = selectAvailabilityDay(calendarDays, checkIn, checkOut, day);
    hasEditedBookingContextRef.current = true;
    hasExplicitDateSelectionRef.current = true;
    setCheckIn(selection.checkIn);
    setCheckOut(selection.checkOut);
    setCalendarInteractionMessage(selection.message);
  };
  const chooseDateRange = (arrival: Date, departure: Date) => {
    const dateToIso = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const selection = selectAvailabilityRange(
      calendarDays,
      dateToIso(arrival),
      dateToIso(departure),
    );
    if (selection.message) {
      setCalendarInteractionMessage(selection.message);
      return;
    }

    setDraftCheckIn(selection.checkIn);
    setDraftCheckOut(selection.checkOut);
    setCalendarInteractionMessage('');
    setActiveDateField('checkOut');
  };
  const handleShare = async () => {
    const url = new URL(window.location.href);
    const currentFilters = parseSearchFilters(url.search);
    const search = mergeSearchFiltersIntoUrl(url.search, {
      ...currentFilters,
      checkIn: hasExplicitDateSelectionRef.current ? checkIn : '',
      checkOut: hasExplicitDateSelectionRef.current ? checkOut : '',
      guests: { adults, children, infants, pets },
    });
    url.search = search;

    try {
      if (!navigator.clipboard?.writeText) {
        setShareStatus('error');
        return;
      }
      await navigator.clipboard.writeText(url.toString());
      setShareStatus('copied');
      window.setTimeout(() => setShareStatus('idle'), 2500);
    } catch {
      setShareStatus('error');
    }
  };

  const handleProceedBooking = () => {
    if (
      !hasExplicitDateSelectionRef.current ||
      property.simulatedData ||
      !isConfirmedPropertyQuote(staysPrice) ||
      isCalculatingPrice ||
      !selectedRangeAvailable
    ) {
      return;
    }
    onStartBooking({
      property,
      checkIn,
      checkOut,
      guests: { adults, children, infants, pets },
      nights,
      totalAmount,
      cleaningFee,
      serviceFee,
      discount,
      quote: staysPrice!,
    });
  };

  return (
    <div
      ref={isDialog ? detailDialogRef : undefined}
      data-dialog-focus-root={isDialog ? '' : undefined}
      tabIndex={isDialog ? -1 : undefined}
      role={isDialog ? 'dialog' : 'region'}
      aria-modal={isDialog ? 'true' : undefined}
      aria-labelledby="property-detail-title"
      aria-owns={
        isDialog && showMobileBookingAction ? 'property-detail-mobile-booking-action' : undefined
      }
      className={
        isDialog
          ? 'fixed inset-0 z-50 overflow-y-auto bg-white/25 backdrop-blur-xl animate-in fade-in duration-200'
          : `mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 ${showMobileBookingAction ? 'pb-[calc(6rem_+_env(safe-area-inset-bottom,0px))] sm:pb-6' : ''}`
      }
    >
      <div
        className={
          isDialog
            ? `min-h-screen py-6 sm:py-10 px-2 sm:px-6 flex justify-center items-start ${showMobileBookingAction ? 'pb-[calc(7rem_+_env(safe-area-inset-bottom,0px))] sm:pb-10' : ''}`
            : ''
        }
      >
        <div
          className={
            isDialog
              ? 'relative w-full max-w-5xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-neutral-200/90 animate-in zoom-in-95 duration-200'
              : 'relative w-full'
          }
        >
          {/* Top Bar Navigation Crisp Glass */}
          <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-neutral-200 bg-white/95 px-3 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
            <button
              ref={detailCloseRef}
              type="button"
              onClick={onClose}
              aria-label={isDialog ? 'Fechar detalhes da acomodação' : 'Voltar para resultados'}
              className="property-detail-back-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 shadow-2xs backdrop-blur-md transition-colors hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
            >
              {isDialog ? (
                <X aria-hidden="true" className="w-5 h-5" />
              ) : (
                <span aria-hidden="true">←</span>
              )}
            </button>

            <PropertyDetailActions
              propertyTitle={displayTitle}
              isSaved={isSaved}
              shareStatus={shareStatus}
              onShare={handleShare}
              onToggleSave={() => onToggleSave(property.id)}
            />
          </div>

          <div className="p-4 sm:p-8 lg:p-10 space-y-8">
            {property.simulatedData && (
              <p
                role="status"
                className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              >
                Ambiente de simulação: preços e disponibilidade são fictícios. Reservas e pagamentos
                não são realizados.
              </p>
            )}
            <PropertyDetailHeader
              property={property}
              hasReviews={hasReviews}
              onShowReviews={scrollToReviews}
              titleRef={detailTitleRef}
            />

            <PropertyPhotoGrid
              propertyTitle={displayTitle}
              images={property.images}
              onOpenGallery={openPhotoGallery}
            />

            {/* Booking comes first on mobile and stays in the right column on desktop. */}
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
              <div className="min-w-0 lg:col-start-3 lg:col-span-1 lg:row-start-1">
                <PropertyBookingPanel
                  property={property}
                  currency={currency}
                  hasReviews={hasReviews}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  hasExplicitDateSelection={hasExplicitDateSelectionRef.current}
                  isDatePickerOpen={isDatePickerOpen}
                  activeDateField={activeDateField}
                  onOpenDatePicker={openDatePicker}
                  guestSelectorTriggerRef={guestSelectorTriggerRef}
                  isGuestSelectorOpen={isGuestSelectorOpen}
                  onToggleGuestSelector={toggleGuestSelector}
                  totalGuests={totalGuests}
                  infants={infants}
                  nights={nights}
                  staysPrice={staysPrice}
                  calendarAvailable={calendarAvailable}
                  calendarCoverageEnd={calendarCoverageEnd}
                  isLoadingCalendar={isLoadingCalendar}
                  isCalculatingPrice={isCalculatingPrice}
                  priceRequestFailed={priceRequestFailed}
                  onRetryCalendar={retryCalendar}
                  onRetryPrice={retryPrice}
                  selectedRangeAvailable={selectedRangeAvailable}
                  pricing={{
                    baseSubtotal,
                    discount,
                    cleaningFee,
                    serviceFee,
                    totalAmount,
                    visibleFees,
                  }}
                  onProceedBooking={handleProceedBooking}
                  suppressMobileBookingAction={!showMobileBookingAction}
                />
              </div>

              <div className="min-w-0 space-y-8 divide-y divide-neutral-100 lg:col-start-1 lg:col-span-2 lg:row-start-1">
                <PropertyOverviewSection property={property} />

                <PropertyAmenitiesSection
                  listingAmenities={property.listingAmenities}
                  propertyAmenities={property.propertyAmenities}
                  amenities={property.amenities}
                />

                <PropertyAvailabilityStrip
                  calendarDays={calendarDays}
                  calendarAvailable={calendarAvailable}
                  isLoading={isLoadingCalendar}
                  calendarMessage={calendarInteractionMessage || availabilityMessage}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  onRetryCalendar={retryCalendar}
                  onSelectDay={selectCalendarDay}
                />

                <PropertyLocationSection title={displayTitle} location={property.location} />
                <PropertyHostSection host={property.host} />
              </div>
            </div>

            <PropertyReviewsSection
              property={{
                rating: property.rating,
                reviewCount: property.reviewCount,
                reviewsSynced: property.reviewsSynced,
                staysSynced: property.staysSynced,
              }}
              reviews={staysReviews}
            />

            <PropertyPoliciesSection rules={property.rules} />
          </div>
        </div>
      </div>

      <PropertyGuestSelectorDialog
        isOpen={isGuestSelectorOpen}
        position={guestPopoverPosition}
        guestLimit={guestLimit}
        adults={adults}
        children={children}
        infants={infants}
        onAdultsChange={(value) => {
          hasEditedBookingContextRef.current = true;
          setAdults(value);
        }}
        onChildrenChange={(value) => {
          hasEditedBookingContextRef.current = true;
          setChildren(value);
        }}
        onInfantsChange={(value) => {
          hasEditedBookingContextRef.current = true;
          setInfants(value);
        }}
        onClose={() => setIsGuestSelectorOpen(false)}
      />

      <PropertyDatePickerDialog
        isOpen={isDatePickerOpen}
        activeDateField={activeDateField}
        checkIn={draftCheckIn}
        checkOut={draftCheckOut}
        displayedMonth={displayedMonth}
        today={today}
        todayIso={todayIso}
        calendarDays={calendarDays}
        isExtendingCalendar={isExtendingCalendar}
        calendarExtensionMessage={calendarExtensionMessage}
        calendarAvailable={calendarAvailable}
        isLoadingCalendar={isLoadingCalendar}
        availabilityMessage={availabilityMessage}
        interactionMessage={calendarInteractionMessage}
        onRetryCalendar={retryCalendar}
        onRetryCalendarExtension={retryCalendarExtension}
        onActiveDateFieldChange={setActiveDateField}
        onDisplayedMonthChange={setDisplayedMonth}
        onChooseDate={chooseDate}
        onChooseDateRange={chooseDateRange}
        onClear={() => {
          setDraftCheckIn('');
          setDraftCheckOut('');
          setActiveDateField('checkIn');
          setCalendarInteractionMessage('');
        }}
        onApply={() => {
          if (
            !calendarAvailable ||
            isLoadingCalendar ||
            !isCalendarRangeAvailable(calendarDays, draftCheckIn, draftCheckOut)
          )
            return;
          hasEditedBookingContextRef.current = true;
          hasExplicitDateSelectionRef.current = true;
          setCheckIn(draftCheckIn);
          setCheckOut(draftCheckOut);
          setIsDatePickerOpen(false);
        }}
        onClose={() => setIsDatePickerOpen(false)}
      />

      <PropertyGalleryDialog
        propertyTitle={displayTitle}
        images={property.images}
        isOpen={showAllPhotos}
        activePhotoIndex={activePhotoIndex}
        setActivePhotoIndex={setActivePhotoIndex}
        onClose={() => setShowAllPhotos(false)}
      />
    </div>
  );
};

type PropertyDetailPageProps = Omit<PropertyDetailModalProps, 'presentation'>;

export function PropertyDetailPage(props: PropertyDetailPageProps) {
  return <PropertyDetailModal {...props} presentation="page" />;
}
