import { useState } from 'react';
import { ArrowRight, Plus, ShieldCheck, Trash2, UserRound, UsersRound } from 'lucide-react';
import { CheckoutResumePage } from './CheckoutResumePage';
import type { CheckoutResumeResponse } from '../../services/checkoutApi';

const example: CheckoutResumeResponse = {
  success: true,
  order: {
    publicReference: 'A'.repeat(40),
    status: 'confirmado',
    reservationConfirmed: true,
    listingId: 'exemplo',
    guestName: 'Cliente Exemplo',
    from: '2026-11-20',
    to: '2026-11-23',
    quoteTotal: '900.00',
    currency: 'BRL',
    paymentStatus: 'approved',
    expiresAt: null,
    createdAt: null,
  },
  confirmation: { reservationCode: 'EXEMPLO', confirmedAt: null },
  payment: { enabled: false, methods: [], publicKey: null, provider: 'unavailable', attempt: null },
};

const inputClass =
  'mt-2 w-full min-h-12 rounded-xl border border-neutral-300 bg-white px-4 text-base text-neutral-950 placeholder:text-neutral-400 outline-none transition focus:border-orange-600 focus:ring-4 focus:ring-orange-600/10';
const labelClass = 'block text-sm font-semibold text-neutral-800';

function GuestFormPreview() {
  const [companions, setCompanions] = useState<number[]>([]);
  const [nextId, setNextId] = useState(1);
  return (
    <section
      aria-labelledby="guest-preview-title"
      className="overflow-hidden rounded-[1.75rem] border border-neutral-200 bg-white shadow-[0_20px_65px_-40px_rgba(37,30,18,0.45)]"
    >
      <div className="border-b border-neutral-100 bg-gradient-to-br from-orange-50 via-white to-white px-6 py-7 sm:px-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
            <UsersRound size={21} aria-hidden="true" />
          </span>
          <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-bold text-orange-800">
            PRÓXIMA ETAPA
          </span>
        </div>
        <p className="mb-2 text-sm font-bold text-emerald-700">Pagamento confirmado</p>
        <h2
          id="guest-preview-title"
          className="text-2xl font-black tracking-tight text-neutral-950"
        >
          Preencha os dados dos hóspedes
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Informe agora os dados do titular e de cada acompanhante para preparar o check-in da sua
          reserva.
        </p>
      </div>
      <div className="space-y-7 px-6 py-7 sm:px-8">
        <fieldset className="space-y-4">
          <legend className="mb-4 flex items-center gap-2 text-base font-bold text-neutral-950">
            <UserRound size={18} className="text-orange-700" aria-hidden="true" /> Titular da
            hospedagem
          </legend>
          <label className={labelClass}>
            Nome completo
            <input
              className={inputClass}
              autoComplete="name"
              placeholder="Como aparece no documento"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              CPF
              <input className={inputClass} inputMode="numeric" placeholder="000.000.000-00" />
            </label>
            <label className={labelClass}>
              Telefone
              <input
                className={inputClass}
                type="tel"
                autoComplete="tel"
                placeholder="(00) 00000-0000"
              />
            </label>
          </div>
        </fieldset>
        <div className="border-t border-neutral-100 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-neutral-950">Acompanhantes</h3>
              <p className="mt-1 text-sm text-neutral-500">Adicione quem vai com você.</p>
            </div>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600">
              {companions.length}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {companions.map((id, index) => (
              <fieldset
                key={id}
                className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
              >
                <legend className="sr-only">Acompanhante {index + 1}</legend>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold">Acompanhante {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => setCompanions((items) => items.filter((item) => item !== id))}
                    aria-label={`Remover acompanhante ${index + 1}`}
                    className="rounded-lg p-2 text-neutral-500 hover:bg-white hover:text-red-700 focus-visible:outline-2 focus-visible:outline-orange-700"
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </div>
                <label className={labelClass}>
                  Nome completo
                  <input className={inputClass} placeholder="Nome do acompanhante" />
                </label>
                <label className={labelClass}>
                  Documento
                  <input className={inputClass} placeholder="CPF ou documento de identidade" />
                </label>
              </fieldset>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setCompanions((items) => [...items, nextId]);
              setNextId((id) => id + 1);
            }}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-orange-200 px-4 text-sm font-bold text-orange-800 transition hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            <Plus size={17} aria-hidden="true" /> Adicionar acompanhante
          </button>
        </div>
        <div className="space-y-3 border-t border-neutral-100 pt-6">
          <button
            type="button"
            disabled
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white opacity-55"
          >
            <span>Enviar dados dos hóspedes</span>
            <ArrowRight size={17} aria-hidden="true" />
          </button>
          <p className="flex items-start gap-2 text-xs leading-5 text-neutral-500">
            <ShieldCheck className="mt-0.5 shrink-0 text-orange-700" size={15} aria-hidden="true" />
            Demonstração: esta prévia não envia dados para uma reserva real.
          </p>
        </div>
      </div>
    </section>
  );
}

export function PaymentConfirmationPreview() {
  return (
    <>
      <div
        role="status"
        className="bg-orange-100 px-4 py-3 text-center text-sm font-bold text-orange-950"
      >
        Prévia com dados fictícios — nenhum pagamento foi realizado
      </div>
      <CheckoutResumePage
        reference={example.order.publicReference}
        previewData={example}
        previewGuestForm={<GuestFormPreview />}
      />
    </>
  );
}
