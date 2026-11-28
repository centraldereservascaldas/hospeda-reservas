import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useDialogFocus } from '../useDialogFocus';
import { IconButton } from '../IconButton';
import { formatPropertyDescription } from './formatPropertyDescription';
import type { ReservationSummary } from './existingReservationSummary';
import { getCheckoutSupportUrl } from '../../utils/checkoutSupport';

const date = (value: string | null) =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split('-').reverse().join('/')
    : 'Não informada';

export function ExistingReservationStayCard({ summary }: { summary: ReservationSummary }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<'apartment' | 'condo'>('apartment');
  const [photo, setPhoto] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(open, () => setOpen(false), { returnFocusRef: triggerRef });
  const start = summary.checkIn ? Date.parse(`${summary.checkIn}T00:00:00Z`) : NaN;
  const end = summary.checkOut ? Date.parse(`${summary.checkOut}T00:00:00Z`) : NaN;
  const nights =
    Number.isFinite(start) && Number.isFinite(end) && end > start
      ? Math.round((end - start) / 86_400_000)
      : null;
  const details = summary.propertyDetails;
  const hasDetails =
    !!details &&
    (details.images.length > 0 ||
      !!details.description ||
      details.condoImages.length > 0 ||
      !!details.condoDescription);
  const photos = section === 'apartment' ? (details?.images ?? []) : (details?.condoImages ?? []);
  const description = section === 'apartment' ? details?.description : details?.condoDescription;

  return (
    <>
      <section
        className="checkout-summary-card mb-6 grid overflow-hidden rounded-3xl border bg-white/90 sm:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)]"
        aria-label="Resumo da hospedagem"
      >
        {(summary.image || hasDetails) && (
          <button
            ref={triggerRef}
            type="button"
            disabled={!hasDetails}
            onClick={() => {
              setSection('apartment');
              setPhoto(0);
              setOpen(true);
            }}
            aria-haspopup={hasDetails ? 'dialog' : undefined}
            aria-label={
              hasDetails
                ? `Ver fotos e detalhes de ${summary.property || 'sua hospedagem'}`
                : 'Sua hospedagem'
            }
            className="relative min-h-48 overflow-hidden bg-neutral-200 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-orange-700 sm:min-h-full"
          >
            {summary.image && !imageLoaded && (
              <div
                aria-hidden="true"
                className="absolute inset-0 animate-pulse bg-neutral-200 motion-reduce:animate-none"
              />
            )}
            {summary.image && (
              <img
                src={summary.image}
                alt=""
                decoding="async"
                fetchPriority="high"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <span className="absolute left-5 top-5 rounded-full bg-white/95 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-orange-800">
              Sua hospedagem
            </span>
            {hasDetails && (
              <span className="absolute bottom-4 right-4 rounded-full bg-slate-950/75 px-3 py-2 text-xs font-semibold text-white">
                Ver fotos e detalhes
              </span>
            )}
          </button>
        )}
        <div className="p-5 sm:p-7">
          {summary.partnerCode && (
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-800">
              Reserva realizada pela Booking.com
            </p>
          )}
          <h2 className="text-xl font-extrabold text-slate-900 sm:text-2xl">
            {summary.property || 'Sua hospedagem'}
          </h2>
          <dl className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-2">
            {summary.partnerCode && (
              <div>
                <dt className="font-semibold text-slate-500">Número da reserva na Booking.com</dt>
                <dd className="break-all font-medium text-slate-800">{summary.partnerCode}</dd>
              </div>
            )}
            <div>
              <dt className="font-semibold text-slate-500">Número da reserva CRCN</dt>
              <dd className="font-medium text-slate-800">{summary.code}</dd>
            </div>
          </dl>
          <dl className="checkout-trip-details mt-5 grid gap-3 rounded-2xl p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-semibold">Datas</dt>
              <dd className="mt-1 text-slate-600">
                {date(summary.checkIn)} – {date(summary.checkOut)}
              </dd>
            </div>
            {nights !== null && (
              <div>
                <dt className="font-semibold">Hospedagem</dt>
                <dd className="mt-1 text-slate-600">
                  {nights} {nights === 1 ? 'noite' : 'noites'}
                </dd>
              </div>
            )}
            <div>
              <dt className="font-semibold">Hóspedes</dt>
              <dd className="mt-1 text-slate-600">{summary.guests ?? 'Não informado'}</dd>
            </div>
          </dl>
          <a
            href={getCheckoutSupportUrl({
              requestType: 'reservation_changes',
              reservationCode: summary.code,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-11 items-center text-sm text-slate-600 underline underline-offset-2"
          >
            Desejo realizar alterações nos dados
          </a>
        </div>
      </section>
      {open && (
        <div
          ref={dialogRef}
          data-dialog-focus-root
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="existing-property-title"
          className="fixed inset-0 z-[2147483647] overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm sm:grid sm:place-items-center sm:p-6"
        >
          <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-800">
                  Detalhes da hospedagem
                </p>
                <h2
                  id="existing-property-title"
                  className="mt-1 text-xl font-extrabold text-slate-900"
                >
                  {section === 'apartment'
                    ? summary.property || 'Sua hospedagem'
                    : details?.condoTitle || 'Condomínio'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar detalhes da hospedagem"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="p-5 sm:p-6">
              <div
                className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1"
                role="group"
                aria-label="Escolha o que deseja ver"
              >
                {(['apartment', 'condo'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={section === value}
                    onClick={() => {
                      setSection(value);
                      setPhoto(0);
                    }}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${section === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                  >
                    {value === 'apartment' ? 'Apartamento' : 'Condomínio'}
                  </button>
                ))}
              </div>
              {photos.length > 0 && (
                <>
                  <div className="relative overflow-hidden rounded-2xl bg-slate-100">
                    <img
                      src={photos[photo]}
                      alt={`Foto ${photo + 1} da hospedagem`}
                      className="h-64 w-full object-cover sm:h-80"
                    />
                    {photos.length > 1 && (
                      <>
                        <IconButton
                          aria-label="Foto anterior"
                          onClick={() => setPhoto((photo - 1 + photos.length) % photos.length)}
                          size="compact"
                          variant="custom"
                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/95 shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                        >
                          <ChevronLeft size={20} aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          aria-label="Próxima foto"
                          onClick={() => setPhoto((photo + 1) % photos.length)}
                          size="compact"
                          variant="custom"
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/95 shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
                        >
                          <ChevronRight size={20} aria-hidden="true" />
                        </IconButton>
                      </>
                    )}
                  </div>
                  <div
                    className="mt-2 flex gap-2 overflow-x-auto pb-1"
                    aria-label="Galeria de fotos"
                  >
                    {photos.map((url, index) => (
                      <button
                        key={url}
                        type="button"
                        aria-label={`Abrir foto ${index + 1}`}
                        aria-current={index === photo}
                        onClick={() => setPhoto(index)}
                        className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${index === photo ? 'border-orange-700' : 'border-transparent'}`}
                      >
                        <img
                          src={url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="mt-5">
                <h3 className="font-bold text-slate-900">
                  Sobre {section === 'apartment' ? 'o apartamento' : 'o condomínio'}
                </h3>
                <div className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
                  {description
                    ? formatPropertyDescription(description)
                    : 'Descrição não disponível.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
