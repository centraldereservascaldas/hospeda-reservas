import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Star, 
  Heart, 
  Share2, 
  Medal, 
  ShieldCheck, 
  Calendar as CalendarIcon, 
  Users, 
  Sparkles, 
  ChevronRight, 
  Check, 
  Bed, 
  BedDouble, 
  MapPin, 
  Clock, 
  Maximize2,
  ChevronDown,
  ChevronLeft,
  Info,
  Building,
  Home,
  Waves
} from 'lucide-react';
import { Property, Currency } from '../types';
import { formatCurrency, calculateNights } from '../utils/formatters';
import { crcnBackendApi, CalculatedPriceResponse } from '../services/crcnBackendApi';
import { isCalendarRangeAvailable } from '../utils/staysAvailability';

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
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [staysPrice, setStaysPrice] = useState<CalculatedPriceResponse | null>(null);
  const [calendarDays, setCalendarDays] = useState<any[]>([]);
  const [calendarAvailable, setCalendarAvailable] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState('');
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);

  useEffect(() => {
    if (!property) return;
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
  }, [property?.id, initialCheckIn, initialCheckOut, initialGuests.adults, initialGuests.children, initialGuests.infants, initialGuests.pets]);

  useEffect(() => {
    if (!showAllPhotos) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowAllPhotos(false);
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
  }, [property?.id, checkIn]);

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
  }, [property?.id, checkIn, checkOut, adults, children]);

  if (!property) return null;

  const nights = calculateNights(checkIn, checkOut);
  const baseSubtotal = staysPrice ? staysPrice.baseTotal : property.pricePerNight * nights;
  const discount = staysPrice ? staysPrice.discount : 0;
  const cleaningFee = staysPrice ? staysPrice.cleaningFee : property.cleaningFee;
  const serviceFee = staysPrice ? staysPrice.serviceFee : Math.round((baseSubtotal - discount) * property.serviceFeeRate);
  const totalAmount = staysPrice ? staysPrice.total : baseSubtotal - discount + cleaningFee + serviceFee;
  const totalGuests = adults + children;
  const selectedRangeAvailable = calendarAvailable && isCalendarRangeAvailable(calendarDays, checkIn, checkOut);
  const isCounterFee = (fee: NonNullable<CalculatedPriceResponse['fees']>[number]) =>
    /balc[aã]o|counter/i.test(`${fee.internalName || ''} ${fee._mstitle?.pt_BR || ''} ${fee._mstitle?.pt_PT || ''}`);
  const visibleFees = staysPrice?.fees?.filter((fee) => !isCounterFee(fee)) || [];
  const feeLabel = (fee: NonNullable<CalculatedPriceResponse['fees']>[number]) =>
    fee._mstitle?.pt_BR || fee._mstitle?.pt_PT || fee.internalName || 'Taxa da hospedagem';
  const feeAmount = (fee: NonNullable<CalculatedPriceResponse['fees']>[number]) =>
    Number(fee._mcval?.[staysPrice?.currency || 'BRL'] ?? fee._mcval?.BRL ?? 0);

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

  // Amenities breakdown (apartamento vs condomínio)
  const apartmentAmenities = property.listingAmenities && property.listingAmenities.length > 0
    ? property.listingAmenities
    : [
        'Ar-condicionado split silencioso',
        'Copa completa com micro-ondas e frigobar',
        'Wi-Fi fibra óptica de alta velocidade',
        'Smart TV no quarto e sala',
        'Roupa de cama e banho higienizada',
        'Banheiro privativo com ducha termal',
      ];

  const condoAmenities = property.propertyAmenities && property.propertyAmenities.length > 0
    ? property.propertyAmenities
    : [
        'Acesso livre ao Parque Aquático Termal',
        'Piscinas termais naturais quentes 24 horas',
        'Toboáguas para adultos e crianças',
        'Sauna a vapor e ofurôs relaxantes',
        'Recepção e portaria 24 horas com suporte ao hóspede',
        'Estacionamento privativo numerado e monitorado',
        'Restaurante, pizzaria e lanchonetes no complexo',
        'Quadra poliesportiva e salão de jogos',
      ];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="min-h-screen py-6 sm:py-10 px-2 sm:px-6 flex justify-center items-start"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative w-full max-w-5xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-neutral-200/90 animate-in zoom-in-95 duration-200">
          
          {/* Top Bar Navigation Crisp Glass */}
          <div className="sticky top-0 z-30 px-6 py-4 bg-white/95 backdrop-blur-xl border-b border-neutral-200 flex items-center justify-between">
            <button
              onClick={onClose}
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
              <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
                {property.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-y-2 gap-x-4 text-xs sm:text-sm text-neutral-600">
                <div className="flex items-center gap-1 font-semibold text-neutral-900">
                  <Star className="w-4 h-4 fill-neutral-900 text-neutral-900" />
                  <span>{property.rating.toFixed(2)}</span>
                  <span className="text-neutral-500 font-normal">({property.reviewCount} avaliações)</span>
                </div>
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
                <div 
                  className="md:col-span-2 md:row-span-2 relative overflow-hidden group cursor-pointer"
                  onClick={() => openPhotoGallery(0)}
                >
                  <img
                    src={property.images[0]}
                    alt={property.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                </div>

                {/* 4 smaller photos */}
                {property.images.slice(1, 5).map((img, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden group cursor-pointer hidden md:block"
                    onClick={() => openPhotoGallery(i + 1)}
                  >
                    <img
                      src={img}
                      alt={`Foto ${i + 2}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                  </div>
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
                
                {/* Space Summary */}
                <div className="pb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-neutral-900">
                        {property.subtitle}
                      </h2>
                      <p className="text-xs sm:text-sm text-neutral-500 mt-1">
                        Até {property.maxGuests} hóspedes • {property.bedrooms} quartos • {property.beds} camas • {property.bathrooms} banheiros
                      </p>
                    </div>

                    <img
                      src={property.host.avatar}
                      alt={property.host.name}
                      className="w-14 h-14 rounded-full object-cover ring-2 ring-orange-500/20 shadow-md"
                    />
                  </div>

                  {property.isGuestFavorite && (
                    <div className="mt-6 p-4 rounded-2xl border border-neutral-200 bg-neutral-50/70 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-6 h-6 text-orange-500 flex-shrink-0" />
                        <div>
                          <p className="font-bold text-sm text-neutral-900">Preferido dos hóspedes</p>
                          <p className="text-xs text-neutral-500">Uma das acomodações mais bem avaliadas no Hospeda pelos hóspedes.</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-lg font-black text-neutral-900">{property.rating.toFixed(2)}</span>
                        <div className="flex text-amber-500 text-xs">★★★★★</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Highlights */}
                <div className="pt-6 pb-2 space-y-4">
                  {property.highlights.map((h, idx) => (
                    <div key={idx} className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900">{h.title}</p>
                        <p className="text-xs text-neutral-500">{h.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Description */}
                <div className="pt-6">
                  <h3 className="text-lg font-bold text-neutral-900 mb-3">Sobre este espaço</h3>
                  <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
                    {property.description}
                  </p>
                </div>

                {/* Sleeping arrangements */}
                <div className="pt-6">
                  <h3 className="text-lg font-bold text-neutral-900 mb-4">Onde você vai dormir</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {property.sleepingArrangements.map((room, idx) => (
                      <div key={idx} className="p-4 rounded-2xl border border-neutral-200/90 bg-white/80 shadow-2xs">
                        <BedDouble className="w-6 h-6 text-orange-600 mb-3" />
                        <p className="font-extrabold text-xs text-neutral-900">{room.roomName}</p>
                        <p className="text-[11px] text-neutral-600 font-medium mt-1">{room.bedType}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Amenities separated by apartment and condominium */}
                <div className="pt-6 space-y-6">
                  <h3 className="text-lg font-bold text-neutral-900">O que esse lugar oferece</h3>

                  {/* No Apartamento */}
                  <div className="p-5 rounded-2xl bg-orange-50/40 border border-orange-100 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black text-orange-950 uppercase tracking-wider">
                      <Home className="w-4 h-4 text-orange-600" />
                      <span>No Apartamento</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {apartmentAmenities.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 text-xs font-semibold text-neutral-800">
                          <Check className="w-4 h-4 text-orange-600 flex-shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* No Condomínio & Parque Aquático */}
                  <div className="p-5 rounded-2xl bg-sky-50/40 border border-sky-100 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black text-sky-950 uppercase tracking-wider">
                      <Waves className="w-4 h-4 text-sky-600" />
                      <span>No Condomínio & Complexo Termal</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {condoAmenities.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 text-xs font-semibold text-neutral-800">
                          <Check className="w-4 h-4 text-sky-600 flex-shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

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

                {/* Where you will be / Onde você estará (Airbnb Style Map Section) */}
                <div className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-neutral-900">
                        Onde você estará
                      </h3>
                      <p className="text-xs text-neutral-600 mt-0.5">
                        {property.location.neighborhood ? `${property.location.neighborhood}, Caldas Novas - GO` : 'Caldas Novas - GO'}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-orange-600 flex items-center gap-1 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
                      <MapPin className="w-3.5 h-3.5 text-orange-500" />
                      Região das Águas Termais
                    </span>
                  </div>

                  {/* Stylized Interactive Map Card */}
                  <div className="relative rounded-2xl overflow-hidden border border-neutral-200 bg-[#e8e6e1] shadow-xs h-72 sm:h-80 group">
                    {/* Map Graphic Layer */}
                    <div className="absolute inset-0 w-full h-full opacity-90">
                      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <pattern id="modalMapGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#d5d0c7" strokeWidth="0.8" />
                          </pattern>
                        </defs>
                        {/* Land backdrop */}
                        <rect width="100%" height="100%" fill="#f4f1ea" />
                        <rect width="100%" height="100%" fill="url(#modalMapGrid)" opacity="0.6" />

                        {/* Thermal Water Rivers / Streams in Caldas Novas */}
                        <path
                          d="M -20,120 Q 180,80 340,160 T 700,140 Q 880,180 1100,100"
                          fill="none"
                          stroke="#93c5fd"
                          strokeWidth="14"
                          strokeLinecap="round"
                          opacity="0.55"
                        />
                        <path
                          d="M 120,-20 Q 220,180 420,240 T 750,380"
                          fill="none"
                          stroke="#bfdbfe"
                          strokeWidth="8"
                          strokeLinecap="round"
                          opacity="0.45"
                        />

                        {/* Avenue / Roads lines */}
                        <path d="M 0,200 L 1000,200" stroke="#ffffff" strokeWidth="6" />
                        <path d="M 0,200 L 1000,200" stroke="#e0dbd1" strokeWidth="2" strokeDasharray="6 4" />
                        <path d="M 450,0 L 450,400" stroke="#ffffff" strokeWidth="6" />
                        <path d="M 450,0 L 450,400" stroke="#e0dbd1" strokeWidth="2" strokeDasharray="6 4" />
                        
                        {/* Secondary streets */}
                        <path d="M 150,50 L 800,320" stroke="#ffffff" strokeWidth="4" opacity="0.8" />
                        <path d="M 280,350 L 650,20" stroke="#ffffff" strokeWidth="4" opacity="0.8" />

                        {/* Green park zones */}
                        <circle cx="22%" cy="30%" r="55" fill="#dcfce7" opacity="0.7" />
                        <circle cx="78%" cy="70%" r="70" fill="#dcfce7" opacity="0.7" />
                      </svg>
                    </div>

                    {/* Central Property Orange Beacon Pin */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
                      <div className="relative flex items-center justify-center">
                        <span className="absolute w-12 h-12 rounded-full bg-orange-500/30 animate-ping" />
                        <div className="relative w-11 h-11 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center shadow-xl border-2 border-white">
                          <Building className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="mt-1.5 px-3 py-1 rounded-xl bg-neutral-900/90 text-white text-[11px] font-extrabold shadow-lg backdrop-blur-md flex items-center gap-1.5 border border-white/20 whitespace-nowrap">
                        <span className="w-2 h-2 rounded-full bg-orange-400" />
                        <span>{property.title.split('-')[0].trim()}</span>
                      </div>
                    </div>

                    {/* Floating Nearby Points of Interest */}
                    <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-none">
                      <div className="px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur-md border border-white/80 shadow-2xs text-[10px] font-bold text-neutral-800 flex items-center gap-1.5">
                        <Waves className="w-3 h-3 text-sky-600" />
                        <span>Parques Termais a poucos metros</span>
                      </div>
                      <div className="px-2.5 py-1 rounded-lg bg-white/90 backdrop-blur-md border border-white/80 shadow-2xs text-[10px] font-bold text-neutral-800 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-orange-600" />
                        <span>{property.location.address || 'Acesso rápido às principais atrações'}</span>
                      </div>
                    </div>

                    {/* Open in external Maps button */}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${property.title}, Caldas Novas, GO`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-3 right-3 z-20 px-3 py-1.5 rounded-xl bg-white/95 hover:bg-white text-xs font-bold text-neutral-900 shadow-md border border-neutral-200 transition-all hover:scale-105 flex items-center gap-1.5"
                    >
                      <span>Abrir no Google Maps</span>
                      <MapPin className="w-3.5 h-3.5 text-orange-600" />
                    </a>
                  </div>

                  {/* Neighborhood highlights */}
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-neutral-700">
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-150">
                      <p className="font-bold text-neutral-900">Bairro Turístico</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">Região nobre cercada de restaurantes, empórios e conveniências 24h.</p>
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-150">
                      <p className="font-bold text-neutral-900">Segurança & Portaria</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">Condomínio fechado com controle de acesso, biometria e pulseiras.</p>
                    </div>
                    <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-150">
                      <p className="font-bold text-neutral-900">Acesso Facilitado</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">Fácil locomoção para o centro, Feira do Luar e parques aquáticos.</p>
                    </div>
                  </div>
                </div>
                <div className="pt-6">
                  <div className="flex items-start gap-4">
                    <img
                      src={property.host.avatar}
                      alt={property.host.name}
                      className="w-14 h-14 rounded-full object-cover shadow-sm"
                    />
                    <div>
                      <h3 className="text-base font-bold text-neutral-900">
                        Hospedado por {property.host.name}
                      </h3>
                      <p className="text-xs text-neutral-500">
                        Cadastrado em {property.host.joinedYear} • {property.host.isSuperhost ? 'Superhost verificado' : 'Anfitrião'}
                      </p>
                      <p className="text-xs text-neutral-700 mt-2 italic leading-relaxed">
                        "{property.host.bio}"
                      </p>
                      <div className="mt-3 flex items-center gap-4 text-xs text-neutral-600">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-neutral-400" />
                          Tempo de resposta: {property.host.responseTime}
                        </span>
                        <span>Taxa de resposta: {property.host.responseRate}</span>
                      </div>
                    </div>
                  </div>
                </div>

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

                    <div className="flex items-center gap-1 text-xs font-semibold text-neutral-800 bg-white/60 px-2 py-0.5 rounded-lg border border-white/80 shadow-2xs">
                      <Star className="w-3.5 h-3.5 fill-neutral-900 text-neutral-900" />
                      <span>{property.rating.toFixed(2)}</span>
                      <span className="text-neutral-400">({property.reviewCount})</span>
                    </div>
                  </div>

                  {/* Dates & Guests Selector Box with Glass Borders */}
                  <div className="rounded-2xl border border-neutral-300/80 bg-white/50 backdrop-blur-md divide-y divide-neutral-200/80 overflow-hidden shadow-2xs">
                    <div className="grid grid-cols-2 divide-x divide-neutral-200/80">
                      <div className="p-2.5">
                        <label className="text-[10px] uppercase font-bold text-neutral-500 block">Check-in</label>
                        <input
                          type="date"
                          value={checkIn}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={(e) => {
                            const nextCheckIn = e.target.value;
                            setCheckIn(nextCheckIn);
                            if (checkOut && nextCheckIn >= checkOut) setCheckOut('');
                          }}
                          className="w-full text-xs font-semibold text-neutral-900 outline-none mt-0.5 bg-transparent"
                        />
                      </div>
                      <div className="p-2.5">
                        <label className="text-[10px] uppercase font-bold text-neutral-500 block">Check-out</label>
                        <input
                          type="date"
                          value={checkOut}
                          min={checkIn ? new Date(new Date(`${checkIn}T12:00:00`).getTime() + 86400000).toISOString().slice(0, 10) : undefined}
                          onChange={(e) => setCheckOut(e.target.value)}
                          className="w-full text-xs font-semibold text-neutral-900 outline-none mt-0.5 bg-transparent"
                        />
                      </div>
                    </div>

                    {/* Guests dropdown */}
                    <div className="relative p-2.5">
                      <button
                        onClick={() => setIsGuestSelectorOpen(!isGuestSelectorOpen)}
                        className="w-full flex items-center justify-between text-left cursor-pointer"
                      >
                        <div>
                          <label className="text-[10px] uppercase font-bold text-neutral-500 block">Hóspedes</label>
                          <span className="text-xs font-semibold text-neutral-900">
                            {totalGuests} hóspede{totalGuests > 1 ? 's' : ''} {pets > 0 ? `, ${pets} pet` : ''}
                          </span>
                        </div>
                        <ChevronDown className="w-4 h-4 text-neutral-500" />
                      </button>

                      {isGuestSelectorOpen && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white/90 backdrop-blur-2xl border border-white/90 rounded-2xl p-4 shadow-2xl z-20 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">Adultos</span>
                            <div className="flex items-center gap-2">
                              <button
                                disabled={adults <= 1}
                                onClick={() => setAdults(adults - 1)}
                                className="w-6 h-6 rounded-full border border-neutral-300 disabled:opacity-40"
                              >-</button>
                              <span className="text-xs font-bold w-4 text-center">{adults}</span>
                              <button
                                disabled={totalGuests >= property.maxGuests}
                                onClick={() => setAdults(adults + 1)}
                                className="w-6 h-6 rounded-full border border-neutral-300"
                              >+</button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">Crianças (2-12)</span>
                            <div className="flex items-center gap-2">
                              <button
                                disabled={children <= 0}
                                onClick={() => setChildren(children - 1)}
                                className="w-6 h-6 rounded-full border border-neutral-300 disabled:opacity-40"
                              >-</button>
                              <span className="text-xs font-bold w-4 text-center">{children}</span>
                              <button
                                disabled={totalGuests >= property.maxGuests}
                                onClick={() => setChildren(children + 1)}
                                className="w-6 h-6 rounded-full border border-neutral-300"
                              >+</button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">Animais de estimação</span>
                            <div className="flex items-center gap-2">
                              <button
                                disabled={pets <= 0}
                                onClick={() => setPets(pets - 1)}
                                className="w-6 h-6 rounded-full border border-neutral-300 disabled:opacity-40"
                              >-</button>
                              <span className="text-xs font-bold w-4 text-center">{pets}</span>
                              <button
                                onClick={() => setPets(pets + 1)}
                                className="w-6 h-6 rounded-full border border-neutral-300"
                              >+</button>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-neutral-100 flex justify-end">
                            <button
                              onClick={() => setIsGuestSelectorOpen(false)}
                              className="text-xs font-bold text-orange-600 underline cursor-pointer"
                            >
                              Fechar
                            </button>
                          </div>
                        </div>
                      )}
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
                          <span>{feeLabel(fee)}{staysPrice?.feesIncluded ? ' (incluída na diária)' : ''}</span>
                        <span>{formatCurrency(feeAmount(fee), currency)}</span>
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

            {/* Reviews Section */}
            <div className="pt-8 border-t border-neutral-200">
              <div className="flex items-center gap-3 mb-6">
                <Star className="w-6 h-6 fill-neutral-900 text-neutral-900" />
                <h3 className="text-xl font-bold text-neutral-900">
                  {property.rating.toFixed(2)} • {property.reviewCount} avaliações
                </h3>
              </div>

              {/* Review Dimension Progress Bars */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 p-6 rounded-2xl bg-neutral-50/70 border border-neutral-100">
                {[
                  { label: 'Limpeza', score: 4.9 },
                  { label: 'Precisão', score: 5.0 },
                  { label: 'Comunicação', score: 5.0 },
                  { label: 'Localização', score: 4.9 },
                  { label: 'Check-in', score: 5.0 },
                  { label: 'Custo-benefício', score: 4.8 },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold text-neutral-700">
                      <span>{item.label}</span>
                      <span>{item.score.toFixed(1)}</span>
                    </div>
                    <div className="h-1.5 w-full bg-neutral-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-neutral-900 rounded-full"
                        style={{ width: `${(item.score / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Review cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {property.reviews.map((rev) => (
                  <div key={rev.id} className="p-4 rounded-2xl border border-neutral-100 bg-white shadow-2xs space-y-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={rev.authorAvatar}
                        alt={rev.authorName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <p className="text-xs font-bold text-neutral-900">{rev.authorName}</p>
                        <p className="text-[11px] text-neutral-400">{rev.date}</p>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-700 leading-relaxed">
                      "{rev.comment}"
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* House Rules & Cancellation Policy */}
            <div className="pt-8 border-t border-neutral-200 space-y-4">
              <h3 className="text-lg font-bold text-neutral-900">Regras e Políticas</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-neutral-700">
                <div className="p-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 space-y-2">
                  <p className="font-bold text-neutral-900">Regras da casa</p>
                  {property.rules.map((rule, idx) => (
                    <p key={idx} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-neutral-400" />
                      <span>{rule}</span>
                    </p>
                  ))}
                </div>
                <div className="p-4 rounded-2xl border border-neutral-100 bg-neutral-50/50 space-y-2">
                  <p className="font-bold text-neutral-900">Política de cancelamento flexível</p>
                  <p className="text-neutral-600 leading-relaxed">
                    Cancele até 48 horas antes do check-in para receber reembolso integral. Caso cancele após esse prazo, a primeira noite e a taxa de serviço não serão reembolsadas.
                  </p>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>

      {/* Centered lightbox gallery */}
      {showAllPhotos && property.images.length > 0 && createPortal(
        <div
          className="fixed inset-0 z-[2147483647] flex flex-col items-center justify-center overflow-hidden bg-white/95 p-4 backdrop-blur-2xl animate-in fade-in duration-200 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`Galeria de fotos de ${property.title}`}
          onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAllPhotos(false); }}
        >
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 text-neutral-900 sm:px-8">
            <div>
              <h3 className="text-sm font-semibold sm:text-base">{property.title}</h3>
              <p className="mt-0.5 text-xs text-neutral-600">{activePhotoIndex + 1} de {property.images.length} fotos</p>
            </div>
            <button
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
