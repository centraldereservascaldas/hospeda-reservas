import { useId } from 'react';

export function getPixPayerIdentification(
  value: string,
): { type: 'CPF' | 'CNPJ'; number: string } | null {
  const number = value.replace(/\D/g, '');
  if (number.length === 11) return { type: 'CPF', number };
  if (number.length === 14) return { type: 'CNPJ', number };
  return null;
}

export function PixPayerIdentificationField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="mt-4 block text-sm font-medium text-neutral-900">
      CPF ou CNPJ de quem vai pagar o Pix
      <input
        id={id}
        name="pixPayerDocument"
        value={value}
        required
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        pattern="(?:[0-9]{11}|[0-9]{14})"
        maxLength={14}
        title="Informe os 11 dígitos do CPF ou os 14 dígitos do CNPJ."
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 14))}
        className="mt-1.5 min-h-12 w-full rounded-xl border border-neutral-400/70 bg-white px-3 text-base outline-none focus-visible:border-orange-700 focus-visible:ring-2 focus-visible:ring-orange-700/20 disabled:bg-neutral-100"
      />
      <span className="mt-1 block text-xs font-normal text-neutral-600">
        Usado pela Cielo para identificar o pagador.
      </span>
    </label>
  );
}
