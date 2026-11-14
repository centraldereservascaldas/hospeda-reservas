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
