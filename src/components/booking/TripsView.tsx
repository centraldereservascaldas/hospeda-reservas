import React, { useRef, useState } from 'react';
import type { Reservation, Currency, ReservationCancellationResult } from '../../types';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import type { DirectBookingOrderSummary } from '../../services/crcnBackendApi';
import { formatCurrency } from '../../utils/formatters';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import { useDialogFocus } from '../useDialogFocus';
import { saveCheckoutResumeToken } from '../../utils/checkoutResumeStorage';
import { 
  Calendar, 
  MapPin, 
  Ticket, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Compass,
  FileText
} from 'lucide-react';

interface TripsViewProps {
  reservations: Reservation[];
  directBookingOrders?: DirectBookingOrderSummary[];
  directBookingOrdersError?: string;
  accessToken?: string;
  currency: Currency;
  onCancelReservation: (id: string) => Promise<void | ReservationCancellationResult>;
  onExploreMore: () => void;
}

export const TripsView: React.FC<TripsViewProps> = ({
  reservations,
  directBookingOrders = [],
  directBookingOrdersError = '',
  accessToken,
  currency,
  onCancelReservation,
  onExploreMore,
}) => {
  const [selectedVoucher, setSelectedVoucher] = useState<Reservation | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false);
  const [cancellationError, setCancellationError] = useState('');
  const [cancellationNotice, setCancellationNotice] = useState('');
  const [cancellationConfirmationOrderId, setCancellationConfirmationOrderId] = useState<string | null>(null);
  const [cancellationRequestSubmittingId, setCancellationRequestSubmittingId] = useState<string | null>(null);
  const [cancellationRequestErrors, setCancellationRequestErrors] = useState<Record<string, string>>({});
  const [locallyRequestedCancellationIds, setLocallyRequestedCancellationIds] = useState<string[]>([]);
  const voucherCloseButtonRef = useRef<HTMLButtonElement>(null);
  const keepTripButtonRef = useRef<HTMLButtonElement>(null);
  const voucherDialogRef = useDialogFocus(!!selectedVoucher, () => setSelectedVoucher(null), {
    initialFocusRef: voucherCloseButtonRef,
  });
  const cancellationDialogRef = useDialogFocus(!!cancellingId, () => {
    if (!isSubmittingCancellation) {
      setCancellingId(null);
      setCancellationError('');
    }
  }, {
    initialFocusRef: keepTripButtonRef,
  });

  const activeReservations = reservations.filter((r) => r.status === 'confirmed' || r.status === 'pending');
  const completedReservations = reservations.filter((r) => r.status === 'completed');
  const cancelledReservations = reservations.filter((r) => r.status === 'cancelled');
  const visibleDirectBookingOrders = directBookingOrders.filter(
    (order) =>
      !reservations.some((reservation) => reservation.directBookingReference === order.publicReference),
  );
  const directBookingStatusLabels: Record<DirectBookingOrderSummary['status'], string> = {
    iniciado: 'Pedido iniciado',
    cotado: 'Cotação registrada',
    pre_reservado: 'Pré-reserva',
    liberacao_pendente: 'Liberação pendente',
    pagamento_pendente: 'Pagamento pendente',
    pago_em_confirmacao: 'Pagamento aprovado · confirmação pendente',
    confirmado: 'Confirmada',
    concluido: 'Concluída',
    expirado: 'Pedido expirado',
    pagamento_recusado: 'Pagamento não aprovado',
    atencao_operacional: 'Em análise pela Central',
    cancelamento_solicitado: 'Cancelamento solicitado',
    reembolso_pendente: 'Reembolso em análise',
    reembolsado: 'Reembolsado',
    contestado: 'Pagamento contestado',
  };
  const openDirectBookingOrder = (order: DirectBookingOrderSummary): void => {
    if (!order.resumeToken) return;
    saveCheckoutResumeToken(order.publicReference, order.resumeToken);
    window.location.assign(`/checkout/${encodeURIComponent(order.publicReference)}`);
  };
  const submitDirectBookingCancellation = async (order: DirectBookingOrderSummary): Promise<void> => {
    if (!accessToken) return;
    setCancellationRequestSubmittingId(order.publicReference);
    setCancellationRequestErrors((errors) => ({ ...errors, [order.publicReference]: '' }));
    try {
      await crcnBackendApi.requestDirectBookingCancellation(accessToken, order.publicReference);
      setLocallyRequestedCancellationIds((ids) => [...new Set([...ids, order.publicReference])]);
      setCancellationConfirmationOrderId(null);
      setCancellationNotice(
        'A solicitação foi enviada para análise da Central. A reserva continua ativa até a confirmação do cancelamento; nenhum reembolso foi processado.',
      );
    } catch (error) {
      setCancellationRequestErrors((errors) => ({
        ...errors,
        [order.publicReference]:
          error instanceof Error
            ? error.message
            : 'Não foi possível registrar a solicitação. A reserva continua ativa.',
      }));
    } finally {
      setCancellationRequestSubmittingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 min-h-[75vh]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 border-b border-neutral-100">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight">
            Minhas Viagens e Reservas
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Acompanhe as estadias registradas nesta conta e o histórico disponível.
          </p>
        </div>

        <button
          onClick={onExploreMore}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-neutral-900 hover:bg-black text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          <Compass className="w-4 h-4" />
          <span>Explorar mais lugares</span>
        </button>
      </div>

      {cancellationNotice && (
        <p role="status" aria-live="polite" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950">
          {cancellationNotice}
        </p>
      )}

      {(visibleDirectBookingOrders.length > 0 || directBookingOrdersError) && (
        <section className="mt-6" aria-labelledby="direct-booking-orders-title">
          <h2 id="direct-booking-orders-title" className="mb-1 text-lg font-bold text-neutral-900">
            Compras feitas no site
          </h2>
          <p className="mb-4 text-xs text-neutral-600">
            A pré-reserva não significa que a estadia esteja confirmada. Confira o estado de cada pedido.
          </p>
          {directBookingOrdersError && (
            <p role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              {directBookingOrdersError}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {visibleDirectBookingOrders.map((order) => (
              <article key={order.publicReference} className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xs font-bold text-neutral-500">
                      Pedido {order.publicReference.slice(0, 12).toUpperCase()}
                    </p>
                    <h3 className="mt-1 text-sm font-extrabold text-neutral-900">
                      Acomodação {order.listingId}
                    </h3>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                    {order.paymentStatus === 'refunded'
                      ? 'Pagamento estornado · reserva em revisão'
                      : order.paymentStatus === 'charged_back'
                        ? 'Pagamento contestado · reserva em revisão'
                        : order.status === 'cancelamento_solicitado' || locallyRequestedCancellationIds.includes(order.publicReference)
                          ? directBookingStatusLabels.cancelamento_solicitado
                          : directBookingStatusLabels[order.status]}
                  </span>
                </div>
                <p className="mt-3 text-xs text-neutral-600">
                  {order.from} até {order.to}
                  {order.expiresAt && ['pre_reservado', 'pagamento_pendente'].includes(order.status)
                    ? ` · pré-reserva até ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.expiresAt))}`
                    : ''}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                  <span className="text-[10px] font-bold uppercase text-neutral-500">Total do pedido</span>
                  <span className="text-sm font-black text-neutral-900">
                    {formatCurrency(Number(order.quoteTotal), 'BRL')}
                  </span>
                </div>
                {order.resumeToken && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => openDirectBookingOrder(order)}
                      className="rounded-xl bg-neutral-950 px-4 py-2 text-xs font-bold text-white transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                    >
                      Abrir acompanhamento
                    </button>
                  </div>
                )}
                {accessToken && order.status === 'confirmado' && !locallyRequestedCancellationIds.includes(order.publicReference) && (
                  <div className="mt-3 border-t border-neutral-100 pt-3">
                    {cancellationConfirmationOrderId === order.publicReference ? (
                      <div className="space-y-3" role="group" aria-label="Confirmar solicitação de cancelamento">
                        <p className="text-xs leading-5 text-neutral-700">
                          A Central analisará o pedido. A reserva continuará ativa até a confirmação; esta solicitação não processa reembolso.
                        </p>
                        {cancellationRequestErrors[order.publicReference] && (
                          <p className="text-xs font-semibold text-rose-800" role="alert">
                            {cancellationRequestErrors[order.publicReference]}
                          </p>
                        )}
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setCancellationConfirmationOrderId(null)}
                            disabled={cancellationRequestSubmittingId === order.publicReference}
                            className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                          >
                            Manter reserva
                          </button>
                          <button
                            type="button"
                            onClick={() => void submitDirectBookingCancellation(order)}
                            disabled={cancellationRequestSubmittingId === order.publicReference}
                            className="rounded-xl bg-neutral-950 px-3 py-2 text-xs font-bold text-white hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60"
                          >
                            {cancellationRequestSubmittingId === order.publicReference ? 'Enviando…' : 'Enviar solicitação'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setCancellationConfirmationOrderId(order.publicReference)}
                          className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                        >
                          Pedir análise de cancelamento
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {reservations.length === 0 && visibleDirectBookingOrders.length === 0 ? (
        <div className="text-center py-20 max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center mx-auto border border-orange-200/60 shadow-xs">
            <Ticket className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-neutral-900">Nenhuma viagem agendada ainda</h3>
          <p className="text-xs text-neutral-500">
            Está na hora de tirar a poeira das malas e planejar seu próximo refúgio dos sonhos.
          </p>
          <button
            onClick={onExploreMore}
            className="px-7 py-3 rounded-full bg-gradient-to-r from-orange-700 to-amber-700 hover:from-orange-800 hover:to-amber-800 text-white font-extrabold text-xs shadow-md shadow-orange-500/25 transition-all cursor-pointer hover:scale-105 active:scale-95"
          >
            Começar a buscar
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          
          {/* Active / Upcoming Trips */}
          <div>
            <h2 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
              <span>Próximas viagens</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200/60">
                {activeReservations.length}
              </span>
            </h2>

            {activeReservations.length === 0 ? (
              <p className="text-xs text-neutral-500 italic">Você não tem viagens ativas no momento.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeReservations.map((res) => (
                  <div
                    key={res.id}
                    className="flex flex-col sm:flex-row bg-white/70 backdrop-blur-2xl rounded-3xl border border-white/80 overflow-hidden shadow-[0_12px_36px_-10px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_48px_-10px_rgba(244,63,94,0.18)] transition-all"
                  >
                    <img
                      src={res.propertyImage}
                      alt={getPublicPropertyTitle(res.propertyTitle)}
                      className="w-full sm:w-48 h-48 object-cover flex-shrink-0"
                    />

                    <div className="p-5 flex flex-col justify-between flex-1">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-extrabold text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                            {res.code}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border ${res.status === 'pending' || res.cancellationRequested ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}>
                            {res.status === 'pending' || res.cancellationRequested ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                            {res.cancellationRequested ? 'Cancelamento solicitado' : res.status === 'pending' ? 'Não confirmada' : 'Confirmada'}
                          </span>
                        </div>

                        {res.cancellationRequested && (
                          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-950" role="status">
                            A Central está analisando sua solicitação. A reserva continua ativa até a confirmação do cancelamento.
                          </p>
                        )}

                        <h3 className="font-extrabold text-sm text-neutral-900 mt-2 line-clamp-1">
                          {getPublicPropertyTitle(res.propertyTitle)}
                        </h3>

                        <div className="mt-2 space-y-1 text-xs text-neutral-600">
                          <p className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{res.propertyLocation}</span>
                          </p>
                          <p className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                            <span>{res.checkIn} até {res.checkOut} ({res.nights} noites)</span>
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-neutral-200/60 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-neutral-600 block font-semibold uppercase">Total</span>
                          <span className="font-black text-sm sm:text-base text-neutral-900">
                            {formatCurrency(res.totalAmount, currency)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {res.status === 'confirmed' && (
                            <button
                              onClick={() => setSelectedVoucher(res)}
                              className="px-3.5 py-1.5 rounded-xl bg-white/80 hover:bg-white border border-white/90 text-xs font-bold text-neutral-700 shadow-2xs hover:scale-105 transition-all cursor-pointer"
                            >
                              Voucher
                            </button>
                          )}

                          {res.status === 'confirmed' && !res.cancellationRequested && (
                            <button
                              onClick={() => { setCancellationError(''); setCancellingId(res.id); }}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold text-orange-600 hover:bg-orange-50/80 transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {completedReservations.length > 0 && (
            <div className="pt-6 border-t border-neutral-100">
              <h2 className="text-base font-bold text-neutral-700 mb-3">
                Viagens concluídas ({completedReservations.length})
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completedReservations.map((res) => (
                  <div
                    key={res.id}
                    className="p-4 rounded-2xl border border-neutral-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold text-neutral-600">{res.code}</span>
                      <p className="text-xs font-bold text-neutral-900 line-clamp-1">
                        {getPublicPropertyTitle(res.propertyTitle)}
                      </p>
                      <p className="text-[11px] text-neutral-600">
                        {res.checkIn} - {res.checkOut} · {formatCurrency(res.totalAmount, currency)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3">
                      <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                        Concluída
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedVoucher(res)}
                        className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-neutral-50 border border-neutral-200 text-xs font-bold text-neutral-700 shadow-2xs transition-colors cursor-pointer"
                      >
                        Comprovante
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cancelled Trips */}
          {cancelledReservations.length > 0 && (
            <div className="pt-6 border-t border-neutral-100">
              <h2 className="text-base font-bold text-neutral-500 mb-3">
                Viagens canceladas ({cancelledReservations.length})
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-75">
                {cancelledReservations.map((res) => (
                  <div
                    key={res.id}
                    className="p-4 rounded-2xl border border-neutral-200 bg-neutral-50 flex items-center justify-between"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-neutral-600">{res.code}</span>
                      <p className="text-xs font-bold text-neutral-700 line-clamp-1">{getPublicPropertyTitle(res.propertyTitle)}</p>
                      <p className="text-[11px] text-neutral-600">{res.checkIn} - {res.checkOut}</p>
                    </div>
                    <span className="text-xs font-semibold text-neutral-500 bg-neutral-200 px-2.5 py-1 rounded-full">
                      Cancelada
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Voucher Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-md flex items-center justify-center p-4">
          <div
            ref={voucherDialogRef}
            data-dialog-focus-root
            role="dialog"
            aria-modal="true"
            aria-labelledby="voucher-dialog-title"
            tabIndex={-1}
            className="bg-white/98 sm:bg-white/96 backdrop-blur-2xl rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 border border-neutral-200/90 shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-orange-500" />
                <div>
                  <h3 id="voucher-dialog-title" className="font-extrabold text-sm text-neutral-950 leading-tight">
                    {selectedVoucher.status === 'completed' ? 'Comprovante da hospedagem' : 'Voucher Oficial de Hospedagem'}
                  </h3>
                  <p className="text-[10px] text-orange-700 font-bold">Central de Reservas Caldas Novas</p>
                </div>
              </div>
              <button
                ref={voucherCloseButtonRef}
                type="button"
                aria-label="Fechar voucher"
                onClick={() => setSelectedVoucher(null)}
                className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 flex items-center justify-center text-neutral-600 hover:text-neutral-950 cursor-pointer shadow-xs"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-white/70 border border-neutral-200/80 space-y-3 text-xs shadow-xs">
              <div className="flex justify-between items-center">
                <span className="font-mono text-base font-extrabold text-orange-600">{selectedVoucher.code}</span>
                <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px]">
                  {selectedVoucher.status === 'completed' ? 'Hospedagem concluída' : 'Reserva confirmada'}
                </span>
              </div>
              <div>
                <span className="text-neutral-600 block text-[10px] uppercase font-bold">Empreendimento</span>
                <p className="font-bold text-sm text-neutral-900">{getPublicPropertyTitle(selectedVoucher.propertyTitle)}</p>
                <p className="text-neutral-500">{selectedVoucher.propertyLocation}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200/80">
                <div>
                  <span className="text-neutral-600 text-[10px]">Check-in</span>
                  <p className="font-semibold text-neutral-800">
                    {selectedVoucher.checkIn}
                    {selectedVoucher.checkInTime ? ` · ${selectedVoucher.checkInTime}` : ''}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-600 text-[10px]">Check-out</span>
                  <p className="font-semibold text-neutral-800">
                    {selectedVoucher.checkOut}
                    {selectedVoucher.checkOutTime ? ` · ${selectedVoucher.checkOutTime}` : ''}
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-neutral-200/80">
                <span className="text-neutral-600 text-[10px]">Titular da Reserva</span>
                <p className="font-semibold text-neutral-800">{selectedVoucher.guestName} ({selectedVoucher.guestEmail})</p>
              </div>

              {selectedVoucher.staysReservationId && (
                <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-neutral-800 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Código da reserva</span>
                  </div>
                  <span className="font-mono font-black text-orange-600">
                    {selectedVoucher.staysReservationId}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-neutral-200/80 flex justify-between items-center font-bold">
                <span>Total informado pela reserva</span>
                <span className="text-sm font-black text-neutral-900">{formatCurrency(selectedVoucher.totalAmount, currency)}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  window.print?.();
                }}
                className="flex-1 py-3 rounded-full bg-neutral-900 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-black transition-colors cursor-pointer shadow-md"
              >
                <FileText className="w-4 h-4 text-orange-400" />
                <span>Imprimir / Salvar Voucher PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancellingId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            ref={cancellationDialogRef}
            data-dialog-focus-root
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-reservation-title"
            aria-describedby="cancel-reservation-description"
            tabIndex={-1}
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 border border-neutral-100 shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mx-auto border border-orange-200/80">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 id="cancel-reservation-title" className="font-bold text-base text-neutral-900">Deseja cancelar esta reserva?</h3>
              <p id="cancel-reservation-description" className="text-xs text-neutral-500 mt-1">
                O pedido será enviado ao sistema de reservas. Reembolso e eventuais cobranças seguem as condições da sua reserva. Reservas feitas por Airbnb, Booking ou outro canal devem ser canceladas no próprio canal.
              </p>
            </div>

            {cancellationError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{cancellationError}</p>}

            <div className="flex gap-3 pt-2">
              <button
                ref={keepTripButtonRef}
                type="button"
                disabled={isSubmittingCancellation}
                onClick={() => { setCancellingId(null); setCancellationError(''); }}
                className="flex-1 py-2.5 rounded-full border border-neutral-300 font-semibold text-xs text-neutral-700 hover:bg-neutral-50 cursor-pointer"
              >
                Manter viagem
              </button>
              <button
                type="button"
                disabled={isSubmittingCancellation}
                onClick={async () => {
                  setIsSubmittingCancellation(true);
                  setCancellationError('');
                  try {
                    const result = await onCancelReservation(cancellingId);
                    if (result === 'requested') {
                      setCancellationNotice('Sua solicitação foi registrada para análise da Central. A reserva continua ativa até a confirmação do cancelamento.');
                    } else if (result === 'cancelled') {
                      setCancellationNotice('A reserva foi cancelada.');
                    }
                    setCancellingId(null);
                  } catch (error) {
                    setCancellationError(error instanceof Error ? error.message : 'Não foi possível solicitar o cancelamento. A reserva continua ativa.');
                  } finally {
                    setIsSubmittingCancellation(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-orange-700 to-amber-700 hover:from-orange-800 hover:to-amber-800 text-white font-extrabold text-xs cursor-pointer shadow-md shadow-orange-500/25 transition-all hover:scale-102 active:scale-98 disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmittingCancellation ? 'Enviando pedido…' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
