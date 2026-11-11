import React, { useRef, useState } from 'react';
import type { Reservation, Currency, ReservationCancellationResult } from '../../types';
import {
  crcnBackendApi,
  ReservationCancellationSupportRequiredError,
} from '../../services/crcnBackendApi';
import type { DirectBookingOrderListItem } from '../../services/checkoutApi';
import type { DirectBookingCancellationReceipt } from '../../services/checkoutApi';
import { formatCurrency } from '../../utils/formatters';
import { getPublicPropertyTitle } from '../../utils/publicPropertyTitle';
import { useDialogFocus } from '../useDialogFocus';
import {
  Calendar,
  MapPin,
  Ticket,
  AlertCircle,
  CheckCircle2,
  X,
  Compass,
  FileText,
} from 'lucide-react';

const tripDialogOverlaySafeAreaStyle: React.CSSProperties = {
  paddingTop: 'max(1rem, env(safe-area-inset-top, 0px))',
  paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
  paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
  paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
};

const tripDialogSafeAreaHeightStyle: React.CSSProperties = {
  maxHeight:
    'calc(100dvh - max(1rem, env(safe-area-inset-top, 0px)) - max(1rem, env(safe-area-inset-bottom, 0px)))',
};

interface TripsViewProps {
  reservations: Reservation[];
  directBookingOrders?: DirectBookingOrderListItem[];
  directBookingOrdersError?: string;
  reservationsError?: string;
  reservationsLoading?: boolean;
  directBookingOrdersLoading?: boolean;
  onRetryAccountData?: () => void;
  onOpenAccount?: (mode: 'login' | 'signup') => void;
  accessToken?: string;
  currency: Currency;
  onCancelReservation: (id: string) => Promise<void | ReservationCancellationResult>;
  onExploreMore: () => void;
}

export const TripsView: React.FC<TripsViewProps> = ({
  reservations,
  directBookingOrders = [],
  directBookingOrdersError = '',
  reservationsError = '',
  reservationsLoading = false,
  directBookingOrdersLoading = false,
  onRetryAccountData,
  onOpenAccount,
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
  const [cancellationNoticeReceipt, setCancellationNoticeReceipt] =
    useState<DirectBookingCancellationReceipt | null>(null);
  const [localCancellationReceipts, setLocalCancellationReceipts] = useState<
    Record<string, DirectBookingCancellationReceipt>
  >({});
  const [cancellationConfirmationOrderId, setCancellationConfirmationOrderId] = useState<
    string | null
  >(null);
  const [cancellationRequestSubmittingId, setCancellationRequestSubmittingId] = useState<
    string | null
  >(null);
  const [cancellationRequestErrors, setCancellationRequestErrors] = useState<
    Record<string, string>
  >({});
  const [locallyRequestedCancellationIds, setLocallyRequestedCancellationIds] = useState<string[]>(
    [],
  );
  const voucherCloseButtonRef = useRef<HTMLButtonElement>(null);
  const keepTripButtonRef = useRef<HTMLButtonElement>(null);
  const voucherDialogRef = useDialogFocus(!!selectedVoucher, () => setSelectedVoucher(null), {
    initialFocusRef: voucherCloseButtonRef,
  });
  const cancellationDialogRef = useDialogFocus(
    !!cancellingId,
    () => {
      if (!isSubmittingCancellation) {
        setCancellingId(null);
        setCancellationError('');
      }
    },
    {
      initialFocusRef: keepTripButtonRef,
    },
  );

  const activeReservations = reservations.filter(
    (r) => r.status === 'confirmed' || r.status === 'pending',
  );
  const completedReservations = reservations.filter((r) => r.status === 'completed');
  const cancelledReservations = reservations.filter((r) => r.status === 'cancelled');
  const visibleDirectBookingOrders = directBookingOrders.filter(
    (order) =>
      !reservations.some(
        (reservation) => reservation.directBookingReference === order.publicReference,
      ),
  );
  const directBookingStatusLabels: Record<DirectBookingOrderListItem['status'], string> = {
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
  const openDirectBookingOrder = (order: DirectBookingOrderListItem): void => {
    window.location.assign(`/checkout/${encodeURIComponent(order.publicReference)}`);
  };
  const submitDirectBookingCancellation = async (
    order: DirectBookingOrderListItem,
  ): Promise<void> => {
    if (!accessToken) return;
    setCancellationRequestSubmittingId(order.publicReference);
    setCancellationRequestErrors((errors) => ({ ...errors, [order.publicReference]: '' }));
    try {
      const result = await crcnBackendApi.requestDirectBookingCancellation(
        accessToken,
        order.publicReference,
      );
      setLocallyRequestedCancellationIds((ids) => [...new Set([...ids, order.publicReference])]);
      setLocalCancellationReceipts((receipts) => ({
        ...receipts,
        [order.publicReference]: result.cancellationReceipt,
      }));
      setCancellationNoticeReceipt(result.cancellationReceipt);
      setCancellationConfirmationOrderId(null);
      setCancellationNotice(result.message);
    } catch (error) {
      console.warn('Unable to request cancellation:', error);
      setCancellationRequestErrors((errors) => ({
        ...errors,
        [order.publicReference]: 'Não foi possível enviar a solicitação. A reserva continua ativa.',
      }));
    } finally {
      setCancellationRequestSubmittingId(null);
    }
  };

  return (
    <div className="mx-auto min-h-[75vh] max-w-7xl px-4 py-6 [@media(max-height:400px)]:py-2 sm:px-6 sm:py-10 lg:px-8">
      <div className="flex flex-col items-start justify-between gap-3 border-b border-neutral-100 pb-5 [@media(max-height:400px)]:gap-1 [@media(max-height:400px)]:pb-2 sm:flex-row sm:items-center sm:gap-4 sm:pb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-neutral-900 tracking-tight [@media(max-width:639px)_and_(max-height:400px)]:text-base">
            Minhas Viagens e Reservas
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1 [@media(max-width:639px)_and_(max-height:400px)]:hidden">
            Acompanhe as estadias registradas nesta conta e o histórico disponível.
          </p>
        </div>

        <button
          onClick={onExploreMore}
          className="flex min-h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-black [@media(max-height:400px)]:hidden"
        >
          <Compass className="w-4 h-4" />
          <span>Explorar mais lugares</span>
        </button>
      </div>

      {cancellationNotice && (
        <p
          role="status"
          aria-live="polite"
          className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950"
        >
          {cancellationNotice}
          {cancellationNoticeReceipt && (
            <span className="mt-1 block font-mono text-xs font-bold">
              Protocolo {cancellationNoticeReceipt.protocol} · recebido em{' '}
              {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
                new Date(cancellationNoticeReceipt.requestedAt),
              )}
            </span>
          )}
        </p>
      )}

      {(reservationsError || directBookingOrdersError) && (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm text-amber-950">
            Não foi possível carregar todas as informações da sua conta.
            {reservationsError && ` Reservas: ${reservationsError}`}
            {directBookingOrdersError && ` Compras: ${directBookingOrdersError}`}
          </p>
          {onRetryAccountData && (
            <button
              type="button"
              onClick={onRetryAccountData}
              className="shrink-0 rounded-full border border-amber-800 px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {reservationsLoading && reservations.length > 0 && (
        <p role="status" aria-live="polite" className="mt-4 text-sm text-neutral-600">
          Atualizando suas reservas…
        </p>
      )}

      {(visibleDirectBookingOrders.length > 0 ||
        directBookingOrdersError ||
        directBookingOrdersLoading) && (
        <section className="mt-6" aria-labelledby="direct-booking-orders-title">
          <h2 id="direct-booking-orders-title" className="mb-1 text-lg font-bold text-neutral-900">
            Compras feitas no site
          </h2>
          <p className="mb-4 text-xs text-neutral-600">
            A pré-reserva não significa que a estadia esteja confirmada. Confira o estado de cada
            pedido.
          </p>
          {directBookingOrdersLoading && (
            <p role="status" aria-live="polite" className="mb-3 text-sm text-neutral-600">
              Carregando suas compras feitas no site…
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {visibleDirectBookingOrders.map((order) => (
              <article
                key={order.publicReference}
                className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm"
              >
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
                    {order.paymentStatus === 'refunded' && order.status !== 'reembolsado'
                      ? 'Pagamento estornado · reserva em revisão'
                      : order.paymentStatus === 'charged_back'
                        ? 'Pagamento contestado · reserva em revisão'
                        : order.status === 'cancelamento_solicitado' ||
                            locallyRequestedCancellationIds.includes(order.publicReference)
                          ? directBookingStatusLabels.cancelamento_solicitado
                          : directBookingStatusLabels[order.status]}
                  </span>
                </div>
                <p className="mt-3 text-xs text-neutral-600">
                  {order.from} até {order.to}
                  {order.expiresAt && ['pre_reservado', 'pagamento_pendente'].includes(order.status)
                    ? ` · ${order.origin === 'stays_existing' ? 'pagamento até' : 'pré-reserva até'} ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.expiresAt))}`
                    : ''}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                  <span className="text-[11px] font-bold uppercase text-neutral-500">
                    Total do pedido
                  </span>
                  <span className="text-sm font-black text-neutral-900">
                    {formatCurrency(Number(order.quoteTotal), 'BRL')}
                  </span>
                </div>
                {accessToken && (
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
                {accessToken &&
                  order.status === 'confirmado' &&
                  !locallyRequestedCancellationIds.includes(order.publicReference) && (
                    <div className="mt-3 border-t border-neutral-100 pt-3">
                      {cancellationConfirmationOrderId === order.publicReference ? (
                        <div
                          className="space-y-3"
                          role="group"
                          aria-label="Confirmar solicitação de cancelamento"
                        >
                          <p className="text-xs leading-5 text-neutral-700">
                            A Central analisará o pedido. Enviar esta solicitação não confirma o
                            cancelamento nem processa reembolso.
                          </p>
                          {cancellationRequestErrors[order.publicReference] && (
                            <p className="text-xs font-semibold text-rose-800" role="alert">
                              {cancellationRequestErrors[order.publicReference]}
                            </p>
                          )}
                          <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => setCancellationConfirmationOrderId(null)}
                              disabled={cancellationRequestSubmittingId === order.publicReference}
                              className="min-h-11 w-full rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 sm:w-auto"
                            >
                              Manter reserva
                            </button>
                            <button
                              type="button"
                              onClick={() => void submitDirectBookingCancellation(order)}
                              disabled={cancellationRequestSubmittingId === order.publicReference}
                              className="min-h-11 w-full rounded-xl bg-neutral-950 px-3 py-2 text-xs font-bold text-white hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
                            >
                              {cancellationRequestSubmittingId === order.publicReference
                                ? 'Enviando…'
                                : 'Enviar solicitação'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              setCancellationConfirmationOrderId(order.publicReference)
                            }
                            className="min-h-11 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-bold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                          >
                            Pedir análise de cancelamento
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                {(localCancellationReceipts[order.publicReference] ??
                  order.cancellationReceipt) && (
                  <p
                    className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                    role="status"
                  >
                    Solicitação recebida; o cancelamento ainda não foi concluído.
                    <span className="mt-1 block font-mono font-bold">
                      Protocolo{' '}
                      {
                        (
                          localCancellationReceipts[order.publicReference] ??
                          order.cancellationReceipt
                        )?.protocol
                      }{' '}
                      · recebido em{' '}
                      {new Intl.DateTimeFormat('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(
                        new Date(
                          (localCancellationReceipts[order.publicReference] ??
                            order.cancellationReceipt)!.requestedAt,
                        ),
                      )}
                    </span>
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {!accessToken &&
      reservations.length === 0 &&
      visibleDirectBookingOrders.length === 0 &&
      !reservationsLoading &&
      !directBookingOrdersLoading &&
      !reservationsError &&
      !directBookingOrdersError ? (
        <section
          className="mx-auto max-w-lg space-y-4 py-4 text-center [@media(max-width:639px)_and_(max-height:400px)]:space-y-0 [@media(max-width:639px)_and_(max-height:400px)]:py-0 sm:py-16"
          aria-labelledby="trips-sign-in-title"
        >
          <h2
            id="trips-sign-in-title"
            className="text-lg font-bold text-neutral-900 [@media(max-width:639px)_and_(max-height:400px)]:text-sm"
          >
            Entre na sua conta para ver suas reservas
          </h2>
          <p className="text-sm text-neutral-600 [@media(max-width:639px)_and_(max-height:400px)]:text-xs [@media(max-width:639px)_and_(max-height:400px)]:leading-4">
            Assim você pode acompanhar suas viagens, vouchers e pedidos feitos pelo site.
          </p>
          {onOpenAccount && (
            <div className="mx-auto flex w-full max-w-sm flex-row gap-2 pt-1 [@media(max-width:639px)_and_(max-height:400px)]:pt-0">
              <button
                type="button"
                onClick={() => onOpenAccount('login')}
                className="min-h-11 min-w-0 flex-1 rounded-full bg-neutral-900 px-3 py-3 text-sm font-bold text-white transition hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => onOpenAccount('signup')}
                className="min-h-11 min-w-0 flex-1 rounded-full border border-neutral-300 bg-white px-3 py-3 text-sm font-bold text-neutral-800 transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                Criar conta
              </button>
            </div>
          )}
        </section>
      ) : reservations.length === 0 &&
        visibleDirectBookingOrders.length === 0 &&
        !reservationsLoading &&
        !directBookingOrdersLoading &&
        !reservationsError &&
        !directBookingOrdersError ? (
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
      ) : reservations.length === 0 &&
        visibleDirectBookingOrders.length === 0 &&
        (reservationsLoading ||
          directBookingOrdersLoading ||
          reservationsError ||
          directBookingOrdersError) ? (
        <div className="mx-auto max-w-lg space-y-4 py-16 text-center" aria-live="polite">
          {reservationsLoading || directBookingOrdersLoading ? (
            <p role="status" className="text-sm font-semibold text-neutral-700">
              Carregando suas viagens e compras…
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-700">
                As informações da sua conta estão indisponíveis no momento.
              </p>
              {onRetryAccountData && (
                <button
                  type="button"
                  onClick={onRetryAccountData}
                  className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                >
                  Tentar novamente
                </button>
              )}
            </>
          )}
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
              <p className="text-xs text-neutral-500 italic">
                Você não tem viagens ativas no momento.
              </p>
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
                          <span className="text-[11px] font-extrabold text-orange-600 uppercase tracking-wider bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                            {res.code}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 border ${res.status === 'pending' || res.cancellationRequested ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200'}`}
                          >
                            {res.status === 'pending' || res.cancellationRequested ? (
                              <AlertCircle className="w-3 h-3" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            {res.cancellationRequested
                              ? 'Cancelamento solicitado'
                              : res.status === 'pending'
                                ? 'Não confirmada'
                                : 'Confirmada'}
                          </span>
                        </div>

                        {res.cancellationRequested && (
                          <p
                            className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-950"
                            role="status"
                          >
                            A Central está analisando sua solicitação. A reserva continua ativa até
                            a confirmação do cancelamento.
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
                            <span>
                              {res.checkIn} até {res.checkOut} ({res.nights} noites)
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-neutral-200/60 flex items-center justify-between">
                        <div>
                          <span className="text-[11px] text-neutral-600 block font-semibold uppercase">
                            Total
                          </span>
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
                              {res.directBookingReference ? 'Comprovante' : 'Voucher'}
                            </button>
                          )}

                          {res.status === 'confirmed' && !res.cancellationRequested && (
                            <button
                              onClick={() => {
                                setCancellationError('');
                                setCancellingId(res.id);
                              }}
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
                      <span className="text-[11px] font-bold text-neutral-600">{res.code}</span>
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
                      <span className="text-[11px] font-bold text-neutral-600">{res.code}</span>
                      <p className="text-xs font-bold text-neutral-700 line-clamp-1">
                        {getPublicPropertyTitle(res.propertyTitle)}
                      </p>
                      <p className="text-[11px] text-neutral-600">
                        {res.checkIn} - {res.checkOut}
                      </p>
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-neutral-950/70 backdrop-blur-md p-4"
          style={tripDialogOverlaySafeAreaStyle}
        >
          <div
            ref={voucherDialogRef}
            data-dialog-focus-root
            role="dialog"
            aria-modal="true"
            aria-labelledby="voucher-dialog-title"
            tabIndex={-1}
            className="my-auto w-full max-w-lg space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-neutral-200/90 bg-white/98 p-4 shadow-2xl backdrop-blur-2xl animate-in zoom-in-95 duration-150 sm:space-y-6 sm:bg-white/96 sm:p-8"
            style={tripDialogSafeAreaHeightStyle}
          >
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-orange-500" />
                <div>
                  <h3
                    id="voucher-dialog-title"
                    className="font-extrabold text-sm text-neutral-950 leading-tight"
                  >
                    {selectedVoucher.directBookingReference
                      ? 'Comprovante da reserva'
                      : selectedVoucher.status === 'completed'
                        ? 'Comprovante da hospedagem'
                        : 'Voucher Oficial de Hospedagem'}
                  </h3>
                  <p className="text-[11px] text-orange-700 font-bold">
                    Central de Reservas Caldas Novas
                  </p>
                </div>
              </div>
              <button
                ref={voucherCloseButtonRef}
                type="button"
                aria-label={
                  selectedVoucher.directBookingReference ? 'Fechar comprovante' : 'Fechar voucher'
                }
                onClick={() => setSelectedVoucher(null)}
                className="h-11 w-11 shrink-0 rounded-full border border-neutral-200 bg-neutral-100 text-neutral-600 shadow-xs hover:bg-neutral-200 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 rounded-2xl border border-neutral-200/80 bg-white/70 p-3 text-xs shadow-xs sm:p-4">
              {selectedVoucher.directBookingReference && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-950">
                  Este comprovante registra a reserva e não substitui as instruções de acesso e
                  check-in do empreendimento.
                </p>
              )}
              <div className="flex justify-between items-center">
                <span className="font-mono text-base font-extrabold text-orange-600">
                  {selectedVoucher.code}
                </span>
                <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px]">
                  {selectedVoucher.status === 'completed'
                    ? 'Hospedagem concluída'
                    : 'Reserva confirmada'}
                </span>
              </div>
              <div>
                <span className="text-neutral-600 block text-[11px] uppercase font-bold">
                  Empreendimento
                </span>
                <p className="font-bold text-sm text-neutral-900">
                  {getPublicPropertyTitle(selectedVoucher.propertyTitle)}
                </p>
                <p className="text-neutral-500">{selectedVoucher.propertyLocation}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-200/80">
                <div>
                  <span className="text-neutral-600 text-[11px]">Check-in</span>
                  <p className="break-words font-semibold text-neutral-800 [overflow-wrap:anywhere]">
                    {selectedVoucher.checkIn}
                    {selectedVoucher.checkInTime ? ` · ${selectedVoucher.checkInTime}` : ''}
                  </p>
                </div>
                <div>
                  <span className="text-neutral-600 text-[11px]">Check-out</span>
                  <p className="font-semibold text-neutral-800">
                    {selectedVoucher.checkOut}
                    {selectedVoucher.checkOutTime ? ` · ${selectedVoucher.checkOutTime}` : ''}
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-neutral-200/80">
                <span className="text-neutral-600 text-[11px]">Titular da Reserva</span>
                <p className="font-semibold text-neutral-800">
                  {selectedVoucher.guestName} ({selectedVoucher.guestEmail})
                </p>
              </div>

              {selectedVoucher.staysReservationId && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200/80 bg-orange-50 p-2.5 text-xs">
                  <div className="flex items-center gap-1.5 text-neutral-800 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Código da reserva</span>
                  </div>
                  <span className="break-all font-mono font-black text-orange-600">
                    {selectedVoucher.staysReservationId}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-neutral-200/80 flex justify-between items-center font-bold">
                <span>Total informado pela reserva</span>
                <span className="text-sm font-black text-neutral-900">
                  {formatCurrency(selectedVoucher.totalAmount, currency)}
                </span>
              </div>
            </div>

            <div className="flex">
              <button
                onClick={() => {
                  window.print?.();
                }}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-3 py-3 text-xs font-bold text-white shadow-md transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
              >
                <FileText className="w-4 h-4 text-orange-400" />
                <span>
                  {selectedVoucher.directBookingReference
                    ? 'Imprimir comprovante da reserva'
                    : 'Imprimir / Salvar Voucher PDF'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancellingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/60 p-4 backdrop-blur-sm"
          style={tripDialogOverlaySafeAreaStyle}
        >
          <div
            ref={cancellationDialogRef}
            data-dialog-focus-root
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-reservation-title"
            aria-describedby="cancel-reservation-description"
            tabIndex={-1}
            className="my-auto w-full max-w-md space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-neutral-100 bg-white p-4 shadow-2xl animate-in zoom-in-95 duration-150 sm:p-6"
            style={tripDialogSafeAreaHeightStyle}
          >
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-orange-200/80 bg-orange-100 text-orange-600 sm:h-12 sm:w-12">
              <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>

            <div className="text-center">
              <h3 id="cancel-reservation-title" className="font-bold text-base text-neutral-900">
                Deseja cancelar esta reserva?
              </h3>
              <p id="cancel-reservation-description" className="text-xs text-neutral-500 mt-1">
                Vamos enviar seu pedido para análise. Reembolso e eventuais cobranças seguem as
                condições da sua reserva. Reservas feitas por Airbnb, Booking ou outro canal devem
                ser canceladas no próprio canal.
              </p>
            </div>

            {cancellationError && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
              >
                {cancellationError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:gap-3">
              <button
                ref={keepTripButtonRef}
                type="button"
                disabled={isSubmittingCancellation}
                onClick={() => {
                  setCancellingId(null);
                  setCancellationError('');
                }}
                className="min-h-11 w-full rounded-full border border-neutral-300 px-3 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 sm:flex-1"
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
                      setCancellationNotice(
                        'Sua solicitação foi registrada para análise da Central. A reserva continua ativa até a confirmação do cancelamento.',
                      );
                    } else if (result === 'cancelled') {
                      setCancellationNotice('A reserva foi cancelada.');
                    }
                    setCancellingId(null);
                  } catch (error) {
                    console.warn('Unable to cancel guest reservation:', error);
                    setCancellationError(
                      error instanceof ReservationCancellationSupportRequiredError
                        ? 'Entre em contato com o atendimento para analisar o cancelamento desta reserva e seus pagamentos. A reserva continua ativa.'
                        : 'Não foi possível solicitar o cancelamento. A reserva continua ativa.',
                    );
                  } finally {
                    setIsSubmittingCancellation(false);
                  }
                }}
                className="min-h-11 w-full rounded-full bg-gradient-to-r from-orange-700 to-amber-700 px-3 py-2.5 text-xs font-extrabold text-white shadow-md shadow-orange-500/25 transition-all hover:from-orange-800 hover:to-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:cursor-wait disabled:opacity-60 sm:flex-1"
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
