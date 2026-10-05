import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ShieldCheck } from 'lucide-react';
import { Property, Currency } from '../types';
import { formatCurrency } from '../utils/formatters';
import { crcnBackendApi, CalculatedPriceResponse } from '../services/crcnBackendApi';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingData: {
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
  } | null;
  currency: Currency;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  bookingData,
  currency,
}) => {
  
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [messageToHost, setMessageToHost] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [currentQuote, setCurrentQuote] = useState<CalculatedPriceResponse | null>(bookingData?.quote || null);

  useEffect(() => {
    setCurrentQuote(bookingData?.quote || null);
    setCheckoutError('');
  }, [bookingData]);

  if (!isOpen || !bookingData) return null;

  const { property, checkIn, checkOut, guests, nights, totalAmount, cleaningFee, discount } = bookingData;
  const shownTotal = currentQuote?.total ?? totalAmount;

  const handleFinalizeBooking = async () => {
    if (!currentQuote || currentQuote.source !== 'stays-live') {
      setCheckoutError('Não há uma cotação oficial válida. Volte à acomodação e atualize o preço.');
      return;
    }
    if (!guestName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      setCheckoutError('Informe nome completo e um e-mail válido para continuar.');
      return;
    }
    setIsProcessing(true);
    setCheckoutError('');
    try {
      const response = await crcnBackendApi.createCheckout({
        listingId: property.staysListingId || property.id,
        from: checkIn,
        to: checkOut,
        guests,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        quoteTotal: currentQuote.total,
      });
      if (response?.code === 'quote_changed' && response.quote) {
        setCurrentQuote(response.quote);
        setCheckoutError(`${response.message || 'O preço foi atualizado.'} Confira o novo total antes de continuar.`);
      } else if (response?.success && response.redirectUrl) {
        window.location.assign(response.redirectUrl);
      } else {
        setCheckoutError(response?.message || 'Não foi possível iniciar o checkout seguro. Tente novamente.');
      }
    } catch {
      setCheckoutError('Falha de comunicação ao revalidar sua reserva. Nenhuma reserva foi confirmada. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="min-h-screen py-8 px-3 sm:px-6 flex justify-center items-start"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-4xl bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden border border-neutral-200/90 animate-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-neutral-200 bg-white/95 backdrop-blur-md flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 flex items-center justify-center text-neutral-700 transition-colors shadow-2xs"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-black text-neutral-950">
                Central de Reservas Caldas Novas • Confirmar Estadia
              </h2>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/70 hover:bg-white border border-white/80 flex items-center justify-center text-neutral-500 hover:text-neutral-900 transition-colors shadow-2xs"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* CHECKOUT STEP */}
          <div className="p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
              
              {/* Left Column: Form & Payment (7 cols) */}
              <div className="lg:col-span-7 space-y-8">
                
                {/* Trip details summary */}
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-neutral-900">Resumo da sua estadia em Caldas Novas</h3>
                  
                  <div className="flex items-center justify-between py-2 border-b border-neutral-100 text-xs sm:text-sm">
                    <div>
                      <p className="font-bold text-neutral-900">Datas</p>
                      <p className="text-neutral-600">{checkIn} até {checkOut} ({nights} noites)</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-neutral-100 text-xs sm:text-sm">
                    <div>
                      <p className="font-bold text-neutral-900">Hóspedes</p>
                      <p className="text-neutral-600">
                        {guests.adults + guests.children} hóspedes
                        {guests.infants > 0 ? `, ${guests.infants} bebês` : ''}
                        {guests.pets > 0 ? `, ${guests.pets} pets` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Guest Contact Information */}
                <div className="space-y-4">
                  <h3 className="text-base font-bold text-neutral-900">Dados do hóspede titular</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="font-semibold text-neutral-700 block mb-1">Nome completo</label>
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 outline-none text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-neutral-700 block mb-1">E-mail do hóspede titular</label>
                      <input
                        type="email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-neutral-300 focus:border-neutral-900 outline-none text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-sky-200 bg-sky-50 text-xs text-sky-900">
                  <p className="font-bold">Pagamento seguro</p>
                  <p className="mt-1">Você seguirá para um ambiente seguro para revisar a disponibilidade, escolher a forma de pagamento e concluir a reserva. Este site não coleta nem processa dados de cartão.</p>
                </div>

                {/* Message to Central */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-neutral-700 block">
                    Observações para a Central de Reservas Caldas Novas (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={messageToHost}
                    onChange={(e) => setMessageToHost(e.target.value)}
                    placeholder="Ex: Horário estimado de chegada, solicitação de berço ou dúvidas sobre parques..."
                    className="w-full p-3 rounded-xl border border-neutral-300 text-xs focus:border-neutral-900 outline-none"
                  />
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    disabled={isProcessing || !currentQuote || currentQuote.source !== 'stays-live'}
                    onClick={handleFinalizeBooking}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white font-extrabold text-sm shadow-lg shadow-orange-500/35 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <span>Revalidando disponibilidade e preço...</span>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Continuar para checkout • {formatCurrency(shownTotal, currency)}</span>
                      </>
                    )}
                  </button>
                  {checkoutError && <p role="alert" className="text-center text-xs font-semibold text-red-700 mt-2">{checkoutError}</p>}
                  <p className="text-center text-[10px] text-neutral-400 mt-2">
                    A reserva só estará confirmada após a conclusão do pagamento.
                  </p>
                </div>

              </div>

              {/* Right Column: Reservation Preview */}
              <div className="lg:col-span-5">
                <div className="p-6 rounded-3xl border border-neutral-200/90 bg-white/70 backdrop-blur-xl space-y-4 shadow-sm">
                  {/* Property Card Mini */}
                  <div className="flex gap-4">
                    <img
                      src={property.images[0]}
                      alt={property.title}
                      className="w-24 h-24 rounded-2xl object-cover flex-shrink-0 shadow-sm"
                    />
                    <div className="flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-orange-600 uppercase">
                          {property.subtitle}
                        </span>
                        <h4 className="font-bold text-xs text-neutral-900 line-clamp-2 mt-0.5">
                          {property.title}
                        </h4>
                      </div>
                      {property.reviewsSynced && property.reviewCount > 0 && (
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-neutral-800">
                          <span>★ {property.rating.toFixed(2)}</span>
                          <span className="text-neutral-400">({property.reviewCount} avaliações)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-neutral-200/80 my-3" />

                  {/* Price breakdown */}
                  <h4 className="text-xs font-bold text-neutral-900">Detalhamento da Estadia</h4>
                  <div className="space-y-2 text-xs text-neutral-600">
                    <div className="flex justify-between">
                      <span>{formatCurrency(currentQuote?.dailyRate ?? property.pricePerNight, currency)} x {nights} noites</span>
                      <span>{formatCurrency(currentQuote?.baseTotal ?? property.pricePerNight * nights, currency)}</span>
                    </div>

                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-semibold">
                        <span>Desconto estadia prolongada</span>
                        <span>-{formatCurrency(discount, currency)}</span>
                      </div>
                    )}

                    {cleaningFee > 0 && (
                      <div className="flex justify-between">
                        <span>Taxa de limpeza{currentQuote?.cleaningIncluded ? ' (incluída na diária)' : ''}</span>
                        <span>{formatCurrency(cleaningFee, currency)}</span>
                      </div>
                    )}

                    <div className="border-t border-neutral-200 pt-3 flex justify-between font-bold text-sm text-neutral-900">
                      <span>Total final</span>
                      <span className="text-orange-600 text-base font-black">{formatCurrency(shownTotal, currency)}</span>
                    </div>
                  </div>

                  {/* Protection Banner */}
                  <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200/80 text-xs text-neutral-700 flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-neutral-900">Garantia Central de Reservas CN</p>
                      <p className="text-[11px] text-neutral-600 mt-0.5">
                        Pulseiras e acesso garantido a parques e piscinas com apoio de nossa equipe em Caldas Novas.
                      </p>
                    </div>
                  </div>

                </div>
              </div>

            </div>

        </div>
      </div>
    </div>
  );
};
