import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Star, 
  Heart, 
  Share2, 
  Medal, 
  Calendar as CalendarIcon, 
  Sparkles, 
  ChevronRight, 
  Maximize2,
  ChevronDown,
  ChevronLeft,
} from 'lucide-react';
import { Property, Currency } from '../types';
import { formatCurrency, calculateNights } from '../utils/formatters';
import { crcnBackendApi, CalculatedPriceResponse } from '../services/crcnBackendApi';
import { isCalendarRangeAvailable } from '../utils/staysAvailability';
import type { StaysCalendarDay } from '../utils/staysAvailability';
import { calculatePropertyPricing, getPropertyFeeAmount, getPropertyFeeLabel } from '../utils/propertyPricing';
import { getSyncedPropertyReviews } from '../utils/propertyReviews';
import { PropertyReviewsSection } from './PropertyReviewsSection';
import { PropertyAmenitiesSection } from './PropertyAmenitiesSection';
import { PropertyPoliciesSection } from './PropertyPoliciesSection';
import { PropertyLocationSection } from './PropertyLocationSection';
import { PropertyHostSection } from './PropertyHostSection';
import { PropertyOverviewSection } from './PropertyOverviewSection';
import { useDialogFocus } from './useDialogFocus';

interface PropertyDetailModalProps {
  property: Property | null;
  initialCheckIn: string;
  initialCheckOut: string;
  initialGuests: { adults: number; children: number; infants: number; pets: number };
  onClose: () => void;
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
  currency,
  isSaved,
  onToggleSave,
  onStartBooking,
}) => {
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const detailDialogRef = useDialogFocus(property !== null, onClose, { initialFocusRef: detailCloseRef });
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const propertyId = property?.id;
  const defaultCheckIn = initialCheckIn || todayIso;
  const defaultCheckOut = initialCheckOut || new Date(new Date(`${defaultCheckIn}T12:00:00`).getTime() + 2 * 86400000).toISOString().slice(0, 10);
  // Booking state
  const [checkIn, setCheckIn] = useState<string>(defaultCheckIn);
  const [checkOut, setCheckOut] = useState<string>(defaultCheckOut);
  const [adults, setAdults] = useState<number>(initialGuests.adults || 2);
  const [children, setChildren] = useState<number>(initialGuests.children);
  const [infants, setInfants] = useState<number>(initialGuests.infants);
  const [pets, setPets] = useState<number>(initialGuests.pets);
  const [isGuestSelectorOpen, setIsGuestSelectorOpen] = useState(false);
  const guestSelectorTriggerRef = useRef<HTMLButtonElement>(null);
  const guestDialogCloseRef = useRef<HTMLButtonElement>(null);
  const guestDialogRef = useDialogFocus(isGuestSelectorOpen, () => setIsGuestSelectorOpen(false), { initialFocusRef: guestDialogCloseRef });
  const [guestPopoverPosition, setGuestPopoverPosition] = useState({ top: 0, left: 0, width: 280 });
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const dateDialogCloseRef = useRef<HTMLButtonElement>(null);
  const dateDialogRef = useDialogFocus(isDatePickerOpen, () => setIsDatePickerOpen(false), { initialFocusRef: dateDialogCloseRef });
  const [activeDateField, setActiveDateField] = useState<'checkIn' | 'checkOut'>('checkIn');
  const [displayedMonth, setDisplayedMonth] = useState(() => {
    const date = new Date(`${defaultCheckIn}T12:00:00`);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const galleryCloseRef = useRef<HTMLButtonElement>(null);
  const galleryDialogRef = useDialogFocus(showAllPhotos, () => setShowAllPhotos(false), { initialFocusRef: galleryCloseRef });
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [staysPrice, setStaysPrice] = useState<CalculatedPriceResponse | null>(null);
  const [calendarDays, setCalendarDays] = useState<StaysCalendarDay[]>([]);
  const [calendarAvailable, setCalendarAvailable] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    const nextCheckIn = initialCheckIn || todayIso;
    const requestedCheckOut = initialCheckOut;
    const nextCheckOut = requestedCheckOut > nextCheckIn
      ? requestedCheckOut
      : new Date(new Date(`${nextCheckIn}T12:00:00`).getTime() + 2 * 86400000).toISOString().slice(0, 10);
    setCheckIn(nextCheckIn);
    setCheckOut(nextCheckOut);
    setAdults(initialGuests.adults || 2);
    setChildren(initialGuests.children);
    setInfants(initialGuests.infants);
    setPets(initialGuests.pets);
    setDisplayedMonth(new Date(`${nextCheckIn}T12:00:00`));
  }, [propertyId, todayIso, initialCheckIn, initialCheckOut, initialGuests.adults, initialGuests.children, initialGuests.infants, initialGuests.pets]);

  useEffect(() => {
    if (!isDatePickerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDatePickerOpen]);

  useEffect(() => {
    if (!showAllPhotos) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setActivePhotoIndex((index) => (index + 1) % Math.max(property?.images.length || 1, 1));
      if (event.key === 'ArrowLeft') setActivePhotoIndex((index) => (index - 1 + Math.max(property?.images.length || 1, 1)) % Math.max(property?.images.length || 1, 1));
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAllPhotos, property?.images.length]);

  const openPhotoGallery = (index = 0) => {
    setActivePhotoIndex(index);
    setShowAllPhotos(true);
  };

  const openDatePicker = (field: 'checkIn' | 'checkOut') => {
    setActiveDateField(field);
    const selectedDate = field === 'checkIn' ? checkIn : (checkOut || checkIn);
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
      const top = window.innerHeight - bounds.bottom >= popoverHeight + 16
        ? bounds.bottom + 8
        : bounds.top >= popoverHeight + 16
          ? bounds.top - popoverHeight - 8
          : Math.max(12, (window.innerHeight - popoverHeight) / 2);
      const left = Math.min(Math.max(12, bounds.left), window.innerWidth - popoverWidth - 12);
      setGuestPopoverPosition({ top, left, width: popoverWidth });
    }
    setIsGuestSelectorOpen(true);
  };

  // Refresh the current occupancy window independently from the selected quote.
  useEffect(() => {
    if (!property) return;
    let isMounted = true;

    // Load the current occupancy window from the server, never from local simulation.
    const calendarStart = checkIn || todayIso;
    const calendarEnd = new Date(new Date(`${calendarStart}T12:00:00`).getTime() + 90 * 86400000).toISOString().slice(0, 10);
    setCalendarAvailable(false);
    setCalendarMessage('Atualizando disponibilidade...');
    crcnBackendApi.getAccommodationCalendar(property.staysListingId || property.id, calendarStart, calendarEnd).then((days) => {
      if (isMounted) {
        setCalendarDays(days);
        setCalendarAvailable(days.length > 0);
        setCalendarMessage(days.length > 0 ? '' : 'Não foi possível confirmar a disponibilidade. Tente novamente mais tarde.');
      }
    });

    return () => { isMounted = false; };
  }, [property, checkIn, todayIso]);

  // Requote whenever guests or the selected stay changes.
  useEffect(() => {
    if (!property) return;
    let isMounted = true;
    setIsCalculatingPrice(true);
    setStaysPrice(null);
    crcnBackendApi.calculatePrice({
      listingId: property.staysListingId || property.id,
      from: checkIn,
      to: checkOut,
      guests: adults + children,
    }).then((res) => {
      if (isMounted) {
        setStaysPrice(res);
        setIsCalculatingPrice(false);
      }
    }).catch(() => {
      if (isMounted) setIsCalculatingPrice(false);
    });

    return () => {
      isMounted = false;
    };
  }, [property, checkIn, checkOut, adults, children]);

  if (!property) return null;

  const staysReviews = getSyncedPropertyReviews(property);
  const hasReviews = staysReviews.length > 0;
  const scrollToReviews = () => {
    document.getElementById('property-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const nights = calculateNights(checkIn, checkOut);
  const { baseSubtotal, discount, cleaningFee, serviceFee, totalAmount, visibleFees } = calculatePropertyPricing({
    nightlyRate: property.pricePerNight,
    cleaningFee: property.cleaningFee,
    serviceFeeRate: property.serviceFeeRate,
    nights,
    quote: staysPrice,
  });
  const totalGuests = adults + children;
  const guestLimit = Math.max(1, Number(property.maxGuests) || 1);
  const selectedRangeAvailable = calendarAvailable && isCalendarRangeAvailable(calendarDays, checkIn, checkOut);
  const calendarYear = displayedMonth.getFullYear();
  const calendarMonth = displayedMonth.getMonth();
  const calendarLeadingDays = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
  const calendarDaysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const calendarCells: Array<Date | null> = [
    ...Array.from({ length: calendarLeadingDays }, () => null),
    ...Array.from({ length: calendarDaysInMonth }, (_, index) => new Date(calendarYear, calendarMonth, index + 1)),
  ];
  const calendarMonthLabel = displayedMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const formatDateLabel = (value: string) => value
    ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Selecionar';
  const chooseDate = (date: Date) => {
    const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (activeDateField === 'checkIn') {
      setCheckIn(dateValue);
      if (checkOut && dateValue >= checkOut) setCheckOut('');
      setActiveDateField('checkOut');
      return;
    }
    if (dateValue <= checkIn) {
      setCheckIn(dateValue);
      setCheckOut('');
      setActiveDateField('checkOut');
      return;
    }
    setCheckOut(dateValue);
    setIsDatePickerOpen(false);
  };
  const guestCounter = (
    label: string,
    value: number,
    minimum: number,
    maximum: number,
    setValue: React.Dispatch<React.SetStateAction<number>>,
  ) => {
    const safeMaximum = Math.max(minimum, maximum);
    return (
      <div className="flex items-center justify-between gap-4 py-1">
        <span className="text-sm font-medium text-neutral-800">{label}</span>
        <div className="flex items-center gap-3">
          <button type="button" disabled={value <= minimum} aria-label={`Remover: ${label}`} onClick={() => setValue((count) => Math.max(minimum, count - 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 text-lg text-neutral-700 transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-35">−</button>
          <span aria-live="polite" className="w-5 text-center text-sm font-bold text-neutral-900">{value}</span>
          <button type="button" disabled={value >= safeMaximum} aria-label={`Adicionar: ${label}`} onClick={() => setValue((count) => Math.min(safeMaximum, count + 1))} className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 text-lg text-neutral-700 transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-35">+</button>
        </div>
      </div>
    );
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleProceedBooking = () => {
    if (!staysPrice || staysPrice.source !== 'stays-live' || isCalculatingPrice || !selectedRangeAvailable) return;
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
      <div 
        className="min-h-screen py-6 sm:py-10 px-2 sm:px-6 flex justify-center items-start"
      >
        <div className="relative w-full max-w-5xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-neutral-200/90 animate-in zoom-in-95 duration-200">
          
          {/* Top Bar Navigation Crisp Glass */}
          <div className="sticky top-0 z-30 px-6 py-4 bg-white/95 backdrop-blur-xl border-b border-neutral-200 flex items-center justify-between">
            <button
              ref={detailCloseRef}
              type="button"
              onClick={onClose}
              aria-label="Fechar detalhes da acomodação"
              className="w-9 h-9 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 backdrop-blur-md flex items-center justify-center text-neutral-700 hover:text-neutral-950 shadow-2xs transition-all cursor-pointer hover:scale-105"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/60 hover:bg-white border border-white/80 backdrop-blur-md text-xs font-bold text-neutral-700 shadow-2xs transition-all cursor-pointer hover:scale-105"
              >
                <Share2 className="w-4 h-4" />
                <span>{copiedLink ? 'Link copiado!' : 'Compartilhar'}</span>
              </button>

              <button
                onClick={() => onToggleSave(property.id)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/60 hover:bg-white border border-white/80 backdrop-blur-md text-xs font-bold text-neutral-700 shadow-2xs transition-all cursor-pointer hover:scale-105"
              >
                <Heart
                  className={`w-4 h-4 transition-colors ${
                    isSaved ? 'fill-orange-500 text-orange-500' : 'text-neutral-700'
                  }`}
                />
                <span>{isSaved ? 'Salvo' : 'Salvar'}</span>
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-10 space-y-8">
            
            {/* Title & Metadata */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-3 py-1 rounded-full bg-orange-50 text-orange-700 font-bold text-xs border border-orange-200/80">
                  Central de Reservas Caldas Novas • Seleção Oficial
                </span>
              </div>
              <h1 id="property-detail-title" className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
                {property.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-y-2 gap-x-4 text-xs sm:text-sm text-neutral-600">
                {hasReviews && (
                  <>
                    <div className="flex items-center gap-1 font-semibold text-neutral-900">
                      <Star className="w-4 h-4 fill-neutral-900 text-neutral-900" />
                      <span>{property.rating.toFixed(2)}</span>
                      <span className="text-neutral-500 font-normal">({property.reviewCount} no último ano)</span>
                    </div>
                    <span>•</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={scrollToReviews}
                  className="underline font-medium text-neutral-600 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-sm"
                  aria-label={hasReviews ? `Ver ${property.reviewCount} avaliações dos hóspedes` : 'Ver seção de avaliações dos hóspedes'}
                >
                  {hasReviews
                    ? `${property.reviewCount} avaliações dos hóspedes`
                    : 'Avaliações dos hóspedes'}
                </button>
                <span>•</span>
                {property.isSuperhost && (
                  <>
                    <div className="flex items-center gap-1 font-semibold text-orange-600">
                      <Medal className="w-4 h-4 text-orange-500" />
                      <span>Anfitrião Verificado CRCN</span>
                    </div>
                    <span>•</span>
                  </>
                )}
                <span className="underline font-medium cursor-pointer hover:text-neutral-900">
                  {property.location.neighborhood}, {property.location.city} - {property.location.state}
                </span>
              </div>
            </div>

            {/* Photo Grid Gallery (Airbnb 5-photo layout) */}
            <div className="relative rounded-2xl overflow-hidden shadow-xs">
              <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-2 h-[340px] sm:h-[460px]">
                
                {/* Main large photo */}
                <button
                  type="button"
                  aria-label={`Ampliar foto principal de ${property.title}`}
                  className="md:col-span-2 md:row-span-2 relative overflow-hidden group cursor-pointer border-0 p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                  onClick={() => openPhotoGallery(0)}
                >
                  <img
                    src={property.images[0]}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                </button>

                {/* 4 smaller photos */}
                {property.images.slice(1, 5).map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Ampliar foto ${i + 2} de ${property.title}`}
                    className="relative overflow-hidden group cursor-pointer hidden md:block border-0 p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                    onClick={() => openPhotoGallery(i + 1)}
                  >
                    <img
                      src={img}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                  </button>
                ))}
              </div>

              {/* View all photos button */}
              <button
                onClick={() => openPhotoGallery(0)}
                className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-white/95 hover:bg-white text-xs font-bold text-neutral-900 shadow-md border border-neutral-200 transition-all cursor-pointer hover:scale-105"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Mostrar todas as {property.images.length} fotos</span>
              </button>
            </div>

            {/* Main content grid: 2 cols on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              
              {/* Left Column: Details, Host, Amenities, Sleeping */}
              <div className="lg:col-span-2 space-y-8 divide-y divide-neutral-100">
                
                <PropertyOverviewSection property={property} />

                <PropertyAmenitiesSection
                  listingAmenities={property.listingAmenities}
                  propertyAmenities={property.propertyAmenities}
                />

                {/* Airbnb Style Availability & Daily Price Calendar */}
                <div className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-neutral-900">
                        Calendário de Disponibilidade & Diárias
                      </h3>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Consulte os valores por noite e selecione as datas desejadas.
                      </p>
                    </div>
                    <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${calendarAvailable ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                      <span className={`w-2 h-2 rounded-full ${calendarAvailable ? 'bg-emerald-500' : 'bg-amber-500'} ${calendarAvailable ? 'animate-pulse' : ''}`} />
                      {calendarAvailable ? 'Sincronizado' : 'Indisponível'}
                    </span>
                  </div>

                  {/* Rolling Days Strip / Mini Grid */}
                  <div className="p-4 rounded-2xl border border-neutral-200 bg-neutral-50/70">
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 text-center text-xs">
                      {calendarDays.slice(0, 14).map((d, i) => {
                        const isSelectedIn = d.date === checkIn;
                        const isSelectedOut = d.date === checkOut;
                        const isInRange = d.date > checkIn && d.date < checkOut;
                        const isAvailable = Number(d.avail) > 0 && !d.closedToArrival;
                        const canSelectAsCheckOut = Boolean(checkIn && !checkOut && d.date > checkIn);
                        const dayPrice = d.prices?.[0]?._mcval?.BRL || property.pricePerNight;

                        return (
                          <button
                            key={i}
                            type="button"
                            disabled={!isAvailable && !canSelectAsCheckOut}
                            onClick={() => {
                              if (!checkIn || (checkIn && checkOut)) {
                                setCheckIn(d.date);
                                setCheckOut('');
                              } else if (d.date > checkIn) {
                                if (isCalendarRangeAvailable(calendarDays, checkIn, d.date)) {
                                  setCheckOut(d.date);
                                  setCalendarMessage('');
                                } else {
                                  setCalendarMessage('O período inclui uma data indisponível ou não atende à estadia mínima. Selecione outras datas.');
                                }
                              } else {
                                setCheckIn(d.date);
                              }
                            }}
                            className={`p-2 rounded-xl transition-all flex flex-col items-center justify-center cursor-pointer ${
                              isSelectedIn || isSelectedOut
                                ? 'bg-orange-600 text-white font-black shadow-md scale-105'
                                : isInRange
                                ? 'bg-orange-100 text-orange-950 font-bold'
                                : isAvailable || canSelectAsCheckOut
                                ? 'bg-white hover:bg-orange-50 border border-neutral-200/80 text-neutral-800'
                                : 'bg-neutral-100/50 text-neutral-300 line-through cursor-not-allowed'
                            }`}
                          >
                            <span className="text-[10px] font-bold opacity-80">
                              {new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'narrow' })}
                            </span>
                            <span className="text-xs font-black my-0.5">
                              {d.date.split('-')[2]}
                            </span>
                            <span className={`text-[9px] font-bold ${
                              isSelectedIn || isSelectedOut ? 'text-orange-100' : 'text-orange-600'
                            }`}>
                              R$ {dayPrice}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {calendarMessage && <p className="mt-2 text-xs text-amber-700" role="status">{calendarMessage}</p>}
                </div>

                <PropertyLocationSection title={property.title} location={property.location} />
                <PropertyHostSection host={property.host} />

              </div>

              {/* Right Column: Sticky Booking Widget in Liquid Glass */}
              <div className="lg:col-span-1">
                <div className="sticky top-24 bg-white/70 backdrop-blur-2xl rounded-3xl p-6 border border-white/90 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.1)] space-y-4">
                  
                  {/* Price Header */}
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-black text-neutral-900">
                        {formatCurrency(staysPrice?.dailyRate ?? property.pricePerNight, currency)}
                      </span>
                      <span className="text-xs text-neutral-500 ml-1">/ noite</span>
                    </div>

                    {hasReviews && (
                      <div className="flex items-center gap-1 text-xs font-semibold text-neutral-800 bg-white/60 px-2 py-0.5 rounded-lg border border-white/80 shadow-2xs">
                        <Star className="w-3.5 h-3.5 fill-neutral-900 text-neutral-900" />
                        <span>{property.rating.toFixed(2)}</span>
                        <span className="text-neutral-400">({property.reviewCount})</span>
                      </div>
                    )}
                  </div>

                  {/* Dates & Guests Selector Box with Glass Borders */}
                  <div className="rounded-2xl border border-neutral-300/80 bg-white/50 backdrop-blur-md divide-y divide-neutral-200/80 shadow-2xs">
                    <div className="grid grid-cols-2 divide-x divide-neutral-200/80">
                      <button
                        type="button"
                        onClick={() => openDatePicker('checkIn')}
                        aria-haspopup="dialog"
                        aria-expanded={isDatePickerOpen}
                        className="flex min-h-16 w-full items-center justify-between gap-2 p-2.5 text-left transition-colors hover:bg-orange-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500"
                      >
                        <span>
                          <span className="block text-[10px] font-bold uppercase text-neutral-500">Check-in</span>
                          <span className="mt-0.5 block text-xs font-semibold text-neutral-900">{formatDateLabel(checkIn)}</span>
                        </span>
                        <CalendarIcon className="h-4 w-4 shrink-0 text-orange-600" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openDatePicker('checkOut')}
                        aria-haspopup="dialog"
                        aria-expanded={isDatePickerOpen}
                        className="flex min-h-16 w-full items-center justify-between gap-2 p-2.5 text-left transition-colors hover:bg-orange-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500"
                      >
                        <span>
                          <span className="block text-[10px] font-bold uppercase text-neutral-500">Check-out</span>
                          <span className="mt-0.5 block text-xs font-semibold text-neutral-900">{formatDateLabel(checkOut)}</span>
                        </span>
                        <CalendarIcon className="h-4 w-4 shrink-0 text-orange-600" />
                      </button>
                    </div>

                    {/* Guests dropdown */}
                    <div className="relative z-30 p-2.5">
                      <button
                        ref={guestSelectorTriggerRef}
                        type="button"
                        onClick={toggleGuestSelector}
                        aria-haspopup="dialog"
                        aria-expanded={isGuestSelectorOpen}
                        className="w-full flex items-center justify-between text-left cursor-pointer"
                      >
                        <div>
                          <span className="text-[10px] uppercase font-bold text-neutral-500 block">Hóspedes</span>
                          <span className="text-xs font-semibold text-neutral-900">
                            {totalGuests} hóspede{totalGuests > 1 ? 's' : ''}{infants > 0 ? `, ${infants} bebê${infants > 1 ? 's' : ''}` : ''}
                          </span>
                        </div>
                        <ChevronDown className="w-4 h-4 text-neutral-500" />
                      </button>

                    </div>
                  </div>

                  {/* Reserve Button in Liquid Glass Gradient */}
                  <button
                    onClick={handleProceedBooking}
                    disabled={!staysPrice || staysPrice.source !== 'stays-live' || isCalculatingPrice || !selectedRangeAvailable}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white font-extrabold text-sm shadow-lg shadow-orange-500/35 border border-white/30 backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>{isCalculatingPrice ? 'Atualizando cotação...' : selectedRangeAvailable && staysPrice?.source === 'stays-live' ? 'Continuar para reserva' : 'Disponibilidade indisponível'}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <div className="flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-full bg-orange-50 text-orange-800 text-[10px] font-bold border border-orange-200/80">
                    <Sparkles className="w-3 h-3 text-orange-500" />
                    <span>{isCalculatingPrice ? 'Atualizando valores...' : staysPrice?.source === 'stays-live' ? 'Valores atualizados' : 'Valores indisponíveis'}</span>
                  </div>

                  {/* Price Breakdown Calculation */}
                  <div className="pt-3 border-t border-neutral-200/60 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between text-neutral-600">
                      <span>{staysPrice?.breakdown?.dailyRateText || `${formatCurrency(property.pricePerNight, currency)} x ${nights} noites`}</span>
                      <span>{formatCurrency(baseSubtotal, currency)}</span>
                    </div>

                    {staysPrice?.source !== 'stays-live' && discount > 0 && (
                      <div className="flex items-center justify-between text-emerald-600 font-semibold">
                        <span>Desconto de estadia</span>
                        <span>-{formatCurrency(discount, currency)}</span>
                      </div>
                    )}

                    {staysPrice?.source === 'stays-live' ? (staysPrice.cleaningFee > 0 ? (
                      <div className="flex items-center justify-between text-neutral-600">
                        <span>Taxa de limpeza{staysPrice.cleaningIncluded ? ' (incluída na diária)' : ''}</span>
                        <span>{formatCurrency(staysPrice.cleaningFee, currency)}</span>
                      </div>
                    ) : null) : visibleFees.length ? visibleFees.map((fee, index) => (
                      <div key={fee._id || index} className="flex items-center justify-between text-neutral-600">
                          <span>{getPropertyFeeLabel(fee)}{staysPrice?.feesIncluded ? ' (incluída na diária)' : ''}</span>
                        <span>{formatCurrency(getPropertyFeeAmount(fee, staysPrice?.currency || 'BRL'), currency)}</span>
                      </div>
                    )) : !staysPrice?.fees?.length ? (
                      <>
                        <div className="flex items-center justify-between text-neutral-600">
                          <span>{staysPrice?.breakdown?.cleaningFeeText || 'Taxa de limpeza & higienização'}</span>
                          <span>{formatCurrency(cleaningFee, currency)}</span>
                        </div>
                        <div className="flex items-center justify-between text-neutral-600">
                          <span>{staysPrice?.breakdown?.serviceFeeText || 'Taxa de serviço Central de Reservas'}</span>
                          <span>{formatCurrency(serviceFee, currency)}</span>
                        </div>
                      </>
                    ) : null}

                    <div className="pt-3 border-t border-neutral-200 flex items-center justify-between font-bold text-sm text-neutral-900">
                      <span>{staysPrice?.source === 'stays-live' ? 'Total da estadia' : 'Estimativa'}</span>
                      <span className="text-orange-600 text-base font-black">{formatCurrency(totalAmount, currency)}</span>
                    </div>
                  </div>

                </div>
              </div>

            </div>

            <PropertyReviewsSection
              property={{ rating: property.rating, reviewCount: property.reviewCount, reviewsSynced: property.reviewsSynced }}
              reviews={staysReviews}
            />

            <PropertyPoliciesSection rules={property.rules} />

          </div>

        </div>
      </div>

      {/* Centered lightbox gallery */}
      {isGuestSelectorOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[70] bg-transparent" aria-hidden="true" onMouseDown={() => setIsGuestSelectorOpen(false)} />
          <div
            ref={guestDialogRef}
            data-dialog-focus-root
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-selector-title"
            tabIndex={-1}
            className="fixed z-[71] rounded-3xl border border-white/90 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl"
            style={{ top: guestPopoverPosition.top, left: guestPopoverPosition.left, width: guestPopoverPosition.width }}
          >
            <div className="mb-3 flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h2 id="guest-selector-title" className="text-base font-bold text-neutral-900">Hóspedes</h2>
                <p className="mt-0.5 text-[11px] text-neutral-500">Limite de {guestLimit} hóspede{guestLimit === 1 ? '' : 's'} na acomodação</p>
              </div>
              <button ref={guestDialogCloseRef} type="button" onClick={() => setIsGuestSelectorOpen(false)} aria-label="Fechar seletor de hóspedes" className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="divide-y divide-neutral-100">
              {guestCounter('Adultos', adults, 1, guestLimit - children, setAdults)}
              {guestCounter('Crianças (2–12 anos)', children, 0, guestLimit - adults, setChildren)}
              {guestCounter('Bebês (até 2 anos)', infants, 0, 5, setInfants)}
            </div>
            <div className="mt-3 border-t border-neutral-100 pt-3 text-right">
              <button type="button" onClick={() => setIsGuestSelectorOpen(false)} className="rounded-full bg-orange-50 px-4 py-2 text-xs font-bold text-orange-800 transition hover:bg-orange-100">Aplicar</button>
            </div>
          </div>
        </>,
        document.body,
      )}

      {isDatePickerOpen && createPortal(
        <div
          ref={dateDialogRef}
          data-dialog-focus-root
          tabIndex={-1}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-white/25 p-4 backdrop-blur-xl animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stay-dates-title"
        >
          <div className="w-full max-w-sm rounded-3xl border border-white/90 bg-white/95 p-5 shadow-2xl backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 id="stay-dates-title" className="text-lg font-bold text-neutral-900">Escolha as datas</h2>
                <p className="mt-0.5 text-xs text-neutral-500">Selecione entrada e saída da hospedagem</p>
              </div>
              <button ref={dateDialogCloseRef} type="button" onClick={() => setIsDatePickerOpen(false)} aria-label="Fechar calendário" className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-orange-50/70 p-1.5">
              <button type="button" onClick={() => setActiveDateField('checkIn')} className={`rounded-xl px-3 py-2 text-left transition ${activeDateField === 'checkIn' ? 'bg-white text-orange-800 shadow-sm ring-1 ring-orange-100' : 'text-neutral-600 hover:bg-white/60'}`}>
                <span className="block text-[10px] font-bold uppercase tracking-wide">Check-in</span>
                <span className="mt-0.5 block text-xs font-semibold">{formatDateLabel(checkIn)}</span>
              </button>
              <button type="button" onClick={() => setActiveDateField('checkOut')} className={`rounded-xl px-3 py-2 text-left transition ${activeDateField === 'checkOut' ? 'bg-white text-orange-800 shadow-sm ring-1 ring-orange-100' : 'text-neutral-600 hover:bg-white/60'}`}>
                <span className="block text-[10px] font-bold uppercase tracking-wide">Check-out</span>
                <span className="mt-0.5 block text-xs font-semibold">{formatDateLabel(checkOut)}</span>
              </button>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setDisplayedMonth(new Date(calendarYear, calendarMonth - 1, 1))}
                disabled={calendarYear === today.getFullYear() && calendarMonth <= today.getMonth()}
                aria-label="Mês anterior"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-orange-200 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h3 className="text-sm font-bold capitalize text-neutral-900">{calendarMonthLabel}</h3>
              <button
                type="button"
                onClick={() => setDisplayedMonth(new Date(calendarYear, calendarMonth + 1, 1))}
                aria-label="Próximo mês"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition hover:border-orange-200 hover:bg-orange-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-neutral-400">
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((weekday) => <span key={weekday} className="py-2">{weekday}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {calendarCells.map((date, index) => {
                if (!date) return <span key={`empty-${index}`} className="h-10" />;
                const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const isSelected = dateValue === checkIn || dateValue === checkOut;
                const isInRange = Boolean(checkIn && checkOut && dateValue > checkIn && dateValue < checkOut);
                const isDisabled = dateValue < todayIso || (activeDateField === 'checkOut' && dateValue <= checkIn);
                return (
                  <button
                    key={dateValue}
                    type="button"
                    disabled={isDisabled}
                    aria-pressed={isSelected}
                    onClick={() => chooseDate(date)}
                    className={`h-10 rounded-xl text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                        : isInRange
                          ? 'bg-orange-100 text-orange-900'
                          : 'text-neutral-700 hover:bg-orange-50 hover:text-orange-800'
                    } disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 border-t border-neutral-100 pt-3 text-center text-[11px] text-neutral-500">
              {activeDateField === 'checkIn' ? 'Toque em um dia para escolher o check-in.' : 'Agora escolha o dia do check-out.'}
            </p>
          </div>
        </div>,
        document.body,
      )}

      {showAllPhotos && property.images.length > 0 && createPortal(
        <div
          ref={galleryDialogRef}
          data-dialog-focus-root
          tabIndex={-1}
          className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center overflow-hidden bg-white/95 p-4 backdrop-blur-2xl animate-in fade-in duration-200 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="property-gallery-title"
        >
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 text-neutral-900 sm:px-8">
            <div>
              <h3 id="property-gallery-title" className="text-sm font-semibold sm:text-base">{property.title}</h3>
              <p className="mt-0.5 text-xs text-neutral-600">{activePhotoIndex + 1} de {property.images.length} fotos</p>
            </div>
            <button
              ref={galleryCloseRef}
              type="button"
              onClick={() => setShowAllPhotos(false)}
              aria-label="Fechar galeria"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-md ring-1 ring-black/10 transition hover:bg-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="relative flex h-full w-full max-w-6xl items-center justify-center pb-20 pt-16">
            <img
              key={property.images[activePhotoIndex]}
              src={property.images[activePhotoIndex]}
              alt={`${property.title} — foto ${activePhotoIndex + 1}`}
              className="max-h-full max-w-full rounded-xl object-contain shadow-2xl sm:rounded-2xl"
            />
            {property.images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Foto anterior"
                  onClick={() => setActivePhotoIndex((index) => (index - 1 + property.images.length) % property.images.length)}
                  className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-md ring-1 ring-black/10 transition hover:bg-white sm:left-5 sm:h-12 sm:w-12"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  aria-label="Próxima foto"
                  onClick={() => setActivePhotoIndex((index) => (index + 1) % property.images.length)}
                  className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-neutral-900 shadow-md ring-1 ring-black/10 transition hover:bg-white sm:right-5 sm:h-12 sm:w-12"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>

          {property.images.length > 1 && (
            <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center gap-2 overflow-x-auto bg-white/90 px-4 pb-4 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:pb-5">
              {property.images.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  aria-label={`Abrir foto ${index + 1}`}
                  aria-current={index === activePhotoIndex}
                  onClick={() => setActivePhotoIndex(index)}
                  className={`h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 transition sm:h-14 sm:w-20 ${index === activePhotoIndex ? 'border-neutral-900 opacity-100' : 'border-transparent opacity-60 hover:opacity-100'}`}
                >
                  <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}

    </div>
  );
};
