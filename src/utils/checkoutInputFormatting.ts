export function formatBrazilianDocument(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14);
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
