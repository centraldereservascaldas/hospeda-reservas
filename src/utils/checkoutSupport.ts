export interface CheckoutSupportDetails {
  listingId?: string;
  listingTitle?: string;
  from?: string;
  to?: string;
  guests?: { adults: number; children: number; infants: number; pets: number };
  paymentMethod?: 'card' | 'pix';
  installments?: number;
  baseTotal?: number;
  balanceTotal?: number;
  total?: number;
  reference?: string;
  reservationCode?: string;
}

const supportNumber = '5564992946675';
const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const date = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value.split('-').reverse().join('/');
};

/** Only booking context is shared. Never serialize customer, token, Pix or card objects. */
export function getCheckoutSupportUrl(details: CheckoutSupportDetails): string {
  const lines = ['Olá! Preciso de ajuda para concluir uma reserva no checkout da CRCN.'];
  if (details.reservationCode && /^[A-Z0-9]{5}$/.test(details.reservationCode)) {
    lines.push(`Código da reserva: ${details.reservationCode}`);
  }
  if (details.listingTitle) lines.push(`Imóvel: ${details.listingTitle}`);
  if (details.listingId) {
    lines.push(`Código do imóvel: ${details.listingId}`);
    lines.push(
      `Imóvel no site: https://crcn.caldasindica.com/apartamento/${encodeURIComponent(details.listingId)}`,
    );
  }
  if (details.from && date(details.from)) lines.push(`Entrada: ${date(details.from)}`);
  if (details.to && date(details.to)) lines.push(`Saída: ${date(details.to)}`);
  if (details.guests) {
    const { adults, children, infants, pets } = details.guests;
    lines.push(
      `Hóspedes: ${adults} adulto(s), ${children} criança(s), ${infants} bebê(s), ${pets} pet(s)`,
    );
  }
  if (details.paymentMethod) {
    lines.push(`Como quero pagar: ${details.paymentMethod === 'pix' ? 'Pix' : 'Cartão'}`);
  }
  if (details.paymentMethod === 'card' && details.installments) {
    const installmentAmount =
      details.total !== undefined && Number.isFinite(details.total)
        ? ` de até ${money(Math.ceil(Math.round(details.total * 100) / details.installments) / 100)}`
        : '';
    lines.push(`Parcelamento: ${details.installments}x${installmentAmount}`);
  }
  if (details.baseTotal !== undefined && Number.isFinite(details.baseTotal)) {
    lines.push(`Hospedagem com taxas: ${money(details.baseTotal)}`);
  }
  if (details.balanceTotal !== undefined && Number.isFinite(details.balanceTotal)) {
    lines.push(`Saldo para conferência: ${money(details.balanceTotal)}`);
  }
  if (details.total !== undefined && Number.isFinite(details.total)) {
    lines.push(`Total para a forma escolhida: ${money(details.total)}`);
  }
  if (details.reference && /^[A-Za-z0-9]{40}$/.test(details.reference)) {
    lines.push(`Referência do pedido: ${details.reference}`);
  }
  lines.push(
    'Houve uma falha no checkout. Por favor, confiram a situação antes de iniciar outra cobrança.',
  );
  return `https://wa.me/${supportNumber}?text=${encodeURIComponent(lines.join('\n'))}`;
}
