export function isCpfDocument(value: string): boolean {
  return /^[\d.\s-]+$/.test(value) && value.replace(/\D/g, '').length === 11;
}

export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;

  for (let position = 9; position <= 10; position += 1) {
    let sum = 0;
    for (let index = 0; index < position; index += 1) {
      sum += Number(digits[index]) * (position + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    const checkDigit = remainder === 10 ? 0 : remainder;
    if (Number(digits[position]) !== checkDigit) return false;
  }

  return true;
}

export function isValidCnpj(value: string): boolean {
  const cnpj = value.replace(/[^a-z\d]/gi, '').toUpperCase();
  if (!/^[A-Z\d]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const check = (numbers: string, weights: number[]): number => {
    const remainder =
      numbers
        .split('')
        .reduce((sum, character, index) => sum + (character.charCodeAt(0) - 48) * weights[index], 0) %
      11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = check(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = check(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

export function isValidBrazilianTaxId(value: string): boolean {
  const normalized = value.replace(/[^a-z\d]/gi, '').toUpperCase();
  return normalized.length === 11 ? isValidCpf(normalized) : isValidCnpj(normalized);
}
