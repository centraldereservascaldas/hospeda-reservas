import type { Dispatch, SetStateAction } from 'react';
import { isValidBrazilianPhone, normalizeBrazilianPhone } from './existingBookingPreviewUtils';
import { formatBrazilianDocument, formatBrazilianPhone } from '../../utils/checkoutInputFormatting';
import { isValidCpf } from '../../utils/cpf';

export type ExistingReservationGuest = {
  fullName: string;
  cpf: string;
  email: string;
  phone: string;
};

const fieldClass =
  'mt-1.5 min-h-12 w-full rounded-xl border border-neutral-400/70 bg-white px-3 text-base text-neutral-950 outline-none focus-visible:border-orange-700 focus-visible:ring-2 focus-visible:ring-orange-700/20 disabled:bg-neutral-100';

export function ExistingReservationGuestFields({
  guest,
  onChange,
  disabled,
}: {
  guest: ExistingReservationGuest;
  onChange: Dispatch<SetStateAction<ExistingReservationGuest>>;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-3 flex items-center gap-3 text-lg font-bold">
        <span className="checkout-section-number" aria-hidden="true">
          1
        </span>
        Dados do titular da reserva
      </legend>
      <p className="text-sm text-neutral-600">
        Confirme quem ficará responsável pela hospedagem. Os dados do titular podem ser diferentes
        dos dados do pagador.
      </p>
      <label className="block text-sm font-semibold">
        Nome completo
        <input
          className={fieldClass}
          required
          value={guest.fullName}
          onChange={(event) => onChange((current) => ({ ...current, fullName: event.target.value }))}
          autoComplete="name"
        />
      </label>
      <label className="block text-sm font-semibold">
        CPF do titular da reserva
        <input
          className={fieldClass}
          required
          inputMode="numeric"
          autoComplete="off"
          value={guest.cpf}
          onChange={(event) => {
            const cpf = formatBrazilianDocument(event.target.value.replace(/\D/g, '').slice(0, 11));
            event.currentTarget.setCustomValidity(
              isValidCpf(cpf) ? '' : 'Informe um CPF válido do titular da reserva.',
            );
            onChange((current) => ({ ...current, cpf }));
          }}
          onInvalid={(event) =>
            event.currentTarget.setCustomValidity('Informe um CPF válido do titular da reserva.')
          }
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          E-mail
          <input
            className={fieldClass}
            required
            type="email"
            value={guest.email}
            onChange={(event) => onChange((current) => ({ ...current, email: event.target.value }))}
            autoComplete="email"
          />
        </label>
        <label className="block text-sm font-semibold">
          Telefone
          <input
            className={fieldClass}
            required
            type="tel"
            value={guest.phone}
            onChange={(event) => {
              const phone = formatBrazilianPhone(normalizeBrazilianPhone(event.target.value));
              event.currentTarget.setCustomValidity(
                isValidBrazilianPhone(phone)
                  ? ''
                  : 'Informe um telefone brasileiro válido com DDD.',
              );
              onChange((current) => ({ ...current, phone }));
            }}
            onInvalid={(event) =>
              event.currentTarget.setCustomValidity('Informe um telefone brasileiro válido com DDD.')
            }
            autoComplete="tel"
          />
        </label>
      </div>
    </fieldset>
  );
}
