export function formatBrazilianDocument(value: string, allowAlphanumericCnpj = false): string {
  const normalized = allowAlphanumericCnpj
    ? value.replace(/[^a-z\d]/gi, '').toUpperCase()
    : value.replace(/\D/g, '');
  const hasLetters = /[A-Z]/i.test(normalized);
  const digits = normalized.slice(0, 14);
  if (allowAlphanumericCnpj && hasLetters) {
    const cnpj = digits.slice(0, 12);
    return `${cnpj.slice(0, 2)}${cnpj.length > 2 ? `.${cnpj.slice(2, 5)}` : ''}${cnpj.length > 5 ? `.${cnpj.slice(5, 8)}` : ''}${cnpj.length > 8 ? `/${cnpj.slice(8, 12)}` : ''}${digits.length > 12 ? `-${digits.slice(12)}` : ''}`;
  }
  if (digits.length <= 11) {
    return (
      digits.slice(0, 3) +
      (digits.length > 3 ? `.${digits.slice(3, 6)}` : '') +
      (digits.length > 6 ? `.${digits.slice(6, 9)}` : '') +
      (digits.length > 9 ? `-${digits.slice(9)}` : '')
    );
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}${digits.length > 12 ? `-${digits.slice(12)}` : ''}`;
}

export function formatBrazilianPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length < 3) return digits ? `(${digits}` : '';
  const local = digits.slice(2);
  const split = digits.length === 11 ? 5 : 4;
  return `(${digits.slice(0, 2)}) ${local.slice(0, split)}${local.length > split ? `-${local.slice(split)}` : ''}`;
}

export function formatCardExpiration(value: string): string {
  const raw = value.replace(/\D/g, '').slice(0, 6);
  const digits = raw.length === 6 ? raw.slice(0, 2) + raw.slice(4) : raw.slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

export function formatCardNumber(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function isValidCardNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{12,19}$/.test(digits) || /^([0-9])\1+$/.test(digits)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}
