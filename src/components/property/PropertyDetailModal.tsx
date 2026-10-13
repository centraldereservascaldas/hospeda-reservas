import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Property, Currency } from '../../types';
import { calculateNights } from '../../utils/formatters';
import type { CalculatedPriceResponse } from '../../services/crcnBackendApi';
import { isCalendarRangeAvailable } from '../../utils/staysAvailability';
import type { StaysCalendarDay } from '../../utils/staysAvailability';
import { calculatePropertyPricing } from '../../utils/propertyPricing';
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
import { selectAvailabilityDay } from '../../utils/propertyDateSelection';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';

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
}) => {
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const detailDialogRef = useDialogFocus(property !== null, onClose, {
    initialFocusRef: detailCloseRef,
    returnFocusRef,
  });
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const propertyId = property?.id;
  const defaultCheckIn = initialCheckIn || todayIso;
  const defaultCheckOut =
    initialCheckOut ||
    new Date(new Date(`${defaultCheckIn}T12:00:00`).getTime() + 2 * 86400000)
      .toISOString()
      .slice(0, 10);
  // Booking state
  const [checkIn, setCheckIn] = useState<string>(defaultCheckIn);
  const [checkOut, setCheckOut] = useState<string>(defaultCheckOut);
  const [adults, setAdults] = useState<number>(initialGuests.adults || 2);
  const [children, setChildren] = useState<number>(initialGuests.children);
  const [infants, setInfants] = useState<number>(initialGuests.infants);
  const [pets, setPets] = useState<number>(initialGuests.pets);
  const [isGuestSelectorOpen, setIsGuestSelectorOpen] = useState(false);
  const guestSelectorTriggerRef = useRef<HTMLButtonElement>(null);
  const [guestPopoverPosition, setGuestPopoverPosition] = useState({ top: 0, left: 0, width: 280 });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [activeDateField, setActiveDateField] = useState<'checkIn' | 'checkOut'>('checkIn');
  const [displayedMonth, setDisplayedMonth] = useState(() => {
    const date = new Date(`${defaultCheckIn}T12:00:00`);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [calendarInteractionMessage, setCalendarInteractionMessage] = useState('');
  const {
    staysPrice,
    calendarDays,
    calendarAvailable,
    calendarMessage: availabilityMessage,
    isLoadingCalendar,
    isCalculatingPrice,
  } = usePropertyAvailability({
    property,
    checkIn,
    checkOut,
    guests: adults + children,
    todayIso,
  });

  useEffect(() => {
    if (!propertyId) return;
    const nextCheckIn = initialCheckIn || todayIso;
    const requestedCheckOut = initialCheckOut;
    const nextCheckOut =
      requestedCheckOut > nextCheckIn
        ? requestedCheckOut
        : new Date(new Date(`${nextCheckIn}T12:00:00`).getTime() + 2 * 86400000)
            .toISOString()
            .slice(0, 10);
    setCheckIn(nextCheckIn);
    setCheckOut(nextCheckOut);
    setAdults(initialGuests.adults || 2);
    setChildren(initialGuests.children);
    setInfants(initialGuests.infants);
    setPets(initialGuests.pets);
    setDisplayedMonth(new Date(`${nextCheckIn}T12:00:00`));
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

  const openPhotoGallery = (index = 0) => {
    setActivePhotoIndex(index);
    setShowAllPhotos(true);
  };

  const openDatePicker = (field: 'checkIn' | 'checkOut') => {
    setActiveDateField(field);
    const selectedDate = field === 'checkIn' ? checkIn : checkOut || checkIn;
    const date = new Date(`${selectedDate}T12:00:00`);
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
      const popoverHeight = 300;
      const popoverWidth = Math.min(320, Math.max(280, bounds.width), window.innerWidth - 24);
      const top =
        window.innerHeight - bounds.bottom >= popoverHeight + 16
          ? bounds.bottom + 8
          : bounds.top >= popoverHeight + 16
            ? bounds.top - popoverHeight - 8
            : Math.max(12, (window.innerHeight - popoverHeight) / 2);
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
  const totalGuests = adults + children;
  const guestLimit = Math.max(1, Number(property.maxGuests) || 1);
  const selectedRangeAvailable =
    calendarAvailable && isCalendarRangeAvailable(calendarDays, checkIn, checkOut);
  const chooseDate = (date: Date) => {
    const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (activeDateField === 'checkIn') {
      setCheckIn(dateValue);
      if (checkOut && dateValue >= checkOut) setCheckOut('');
      setCalendarInteractionMessage('');
      setActiveDateField('checkOut');
      return;
    }
    if (dateValue <= checkIn) {
      setCheckIn(dateValue);
      setCheckOut('');
      setCalendarInteractionMessage('');
      setActiveDateField('checkOut');
      return;
    }
    setCheckOut(dateValue);
    setIsDatePickerOpen(false);
  };

  const selectCalendarDay = (day: StaysCalendarDay) => {
    const selection = selectAvailabilityDay(calendarDays, checkIn, checkOut, day);
    setCheckIn(selection.checkIn);
    setCheckOut(selection.checkOut);
    setCalendarInteractionMessage(selection.message);
  };
  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleProceedBooking = () => {
    if (
      !staysPrice ||
      staysPrice.source !== 'stays-live' ||
      isCalculatingPrice ||
      !selectedRangeAvailable
    )
      return;
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
      ref={detailDialogRef}
      data-dialog-focus-root
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-detail-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-white/25 backdrop-blur-xl animate-in fade-in duration-200"
    >
      <div className="min-h-screen py-6 sm:py-10 px-2 sm:px-6 flex justify-center items-start">
        <div className="relative w-full max-w-5xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-neutral-200/90 animate-in zoom-in-95 duration-200">
          {/* Top Bar Navigation Crisp Glass */}
          <div className="sticky top-0 z-30 px-6 py-4 bg-white/95 backdrop-blur-xl border-b border-neutral-200 flex items-center justify-between">
            <button
              ref={detailCloseRef}
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhes da acomodação"
              className="h-9 w-9 shrink-0 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 backdrop-blur-md flex items-center justify-center text-neutral-700 hover:text-neutral-950 shadow-2xs transition-all cursor-pointer hover:scale-105"
            >
              <X className="w-5 h-5" />
            </button>

            <PropertyDetailActions
              isSaved={isSaved}
              copiedLink={copiedLink}
              onShare={handleShare}
              onToggleSave={() => onToggleSave(property.id)}
            />
          </div>

          <div className="p-6 sm:p-10 space-y-8">
            <PropertyDetailHeader
              property={property}
              hasReviews={hasReviews}
              onShowReviews={scrollToReviews}
            />

            <PropertyPhotoGrid
              propertyTitle={displayTitle}
              images={property.images}
              onOpenGallery={openPhotoGallery}
            />

            {/* Main content grid: 2 cols on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* Left Column: Details, Host, Amenities, Sleeping */}
              <div className="lg:col-span-2 space-y-8 divide-y divide-neutral-100">
                <PropertyOverviewSection property={property} />

                <PropertyAmenitiesSection
                  listingAmenities={property.listingAmenities}
                  propertyAmenities={property.propertyAmenities}
                  staysSynced={property.staysSynced}
                />

                <PropertyAvailabilityStrip
                  calendarDays={calendarDays}
                  calendarAvailable={calendarAvailable}
                  isLoading={isLoadingCalendar}
                  calendarMessage={calendarInteractionMessage || availabilityMessage}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  baseNightlyRate={property.pricePerNight}
                  onSelectDay={selectCalendarDay}
                />

                <PropertyLocationSection title={displayTitle} location={property.location} />
                <PropertyHostSection host={property.host} />
              </div>

              {/* Right Column: Booking */}
              <div className="lg:col-span-1">
                <PropertyBookingPanel
                  property={property}
                  currency={currency}
                  hasReviews={hasReviews}
                  checkIn={checkIn}
                  checkOut={checkOut}
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
                  isCalculatingPrice={isCalculatingPrice}
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
                />
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
        onAdultsChange={setAdults}
        onChildrenChange={setChildren}
        onInfantsChange={setInfants}
        onClose={() => setIsGuestSelectorOpen(false)}
      />

      <PropertyDatePickerDialog
        isOpen={isDatePickerOpen}
        activeDateField={activeDateField}
        checkIn={checkIn}
        checkOut={checkOut}
        displayedMonth={displayedMonth}
        today={today}
        todayIso={todayIso}
        onActiveDateFieldChange={setActiveDateField}
        onDisplayedMonthChange={setDisplayedMonth}
        onChooseDate={chooseDate}
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
