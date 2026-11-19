export const SITE_ORIGIN = 'https://reservascrcn.com.br';
const API_URL = 'https://api.cnsp.app/crcn';

export class ConnectorError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function validateProperty(property) {
  if (!property || !/^[1-9]\d{0,8}$/.test(property.base) || !/^[1-9]\d{0,11}$/.test(property.reference)) {
    throw new ConnectorError('invalid_property', 'Referência de imóvel inválida.', 400);
  }
  return property;
}

export function validateDates(from, to, now = new Date()) {
  const valid = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name) => parts.find((item) => item.type === name).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  if (!valid(from) || !valid(to) || from < today || to <= from) {
    throw new ConnectorError('invalid_dates', 'Informe datas válidas, com entrada futura ou hoje e saída posterior.', 400);
  }
  const nights = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (nights > 60) throw new ConnectorError('invalid_dates', 'A consulta permite até 60 noites.', 400);
  return { from, to, nights };
}

export function htmlToText(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Math.min(Number(value), 0x10ffff)))
    .replace(/&#x([a-f0-9]+);/gi, (_, value) => String.fromCodePoint(Math.min(parseInt(value, 16), 0x10ffff)))
    .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (_, key) => ({ nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' })[key.toLowerCase()])
    .replace(/\s+/g, ' ').trim();
}

export function moneyToCents(value) {
  if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?$/.test(value)) {
    throw new ConnectorError('invalid_price', 'O fornecedor retornou um valor fora do formato esperado.');
  }
  const [whole, decimal = '00'] = value.replaceAll('.', '').split(',');
  const cents = Number(whole) * 100 + Number(decimal);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new ConnectorError('invalid_price', 'Preço inválido retornado pelo fornecedor.');
  return cents;
}

export function parseAdvertisedQuote(html, expectedNights) {
  const text = htmlToText(html);
  const pix = [...text.matchAll(/R\$\s*([\d.,]+)\s*\/\s*no\s+PIX\b/gi)];
  const card = [...text.matchAll(/ou\s+R\$\s*([\d.,]+)\s+at[eé]\s+(\d+)x\s+no\s+cart[aã]o/gi)];
  const deposit = [...text.matchAll(/Entrada\s+R\$\s*([\d.,]+)\s+no\s+pix/gi)];
  const nights = [...text.matchAll(/(\d+)\s+dias\s*\/\s*(\d+)\s+noites?/gi)];
  if (pix.length !== 1 || card.length !== 1 || deposit.length !== 1 || nights.length !== 1
    || Number(nights[0][2]) !== expectedNights) {
    throw new ConnectorError('quote_unrecognized', 'Não foi possível identificar uma oferta única para o período. Nenhum preço foi estimado.');
  }
  const pixCents = moneyToCents(pix[0][1]);
  const cardCents = moneyToCents(card[0][1]);
  const depositCents = moneyToCents(deposit[0][1]);
  const maxInstallments = Number(card[0][2]);
  if (depositCents > pixCents || cardCents < pixCents || maxInstallments < 1 || maxInstallments > 12) {
    throw new ConnectorError('invalid_price', 'Os valores do fornecedor precisam de conferência.');
  }
  return { currency: 'BRL', pixCents, cardCents, depositCents, remainingPixCents: pixCents - depositCents, maxInstallments };
}

async function boundedResponse(response, maxBytes = 1500000) {
  if (!response.ok || response.status >= 300) throw new ConnectorError('upstream_http_error', 'O fornecedor não respondeu à consulta com sucesso.');
  if (!response.body) throw new ConnectorError('upstream_empty', 'O fornecedor retornou uma resposta vazia.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ConnectorError('upstream_too_large', 'A resposta do fornecedor excedeu o limite.');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createProvider({ fetchImpl = fetch, authorization = '' } = {}) {
  async function request(url, options = {}) {
    try {
      const response = await fetchImpl(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(20000) });
      const text = await boundedResponse(response);
      if (/Fatal error|Uncaught (?:TypeError|Error)|Stack trace:|Call to undefined method/i.test(text)) {
        throw new ConnectorError('upstream_application_error', 'O fornecedor retornou uma falha interna. Isso não significa ausência de imóveis ou disponibilidade.');
      }
      return text;
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError('upstream_unavailable', 'A consulta ao fornecedor não foi concluída. Tente novamente mais tarde.');
    }
  }

  return {
    readPublic: request,
    async status() {
      if (!authorization) return { configured: false, authenticated: null, actionsMapped: false };
      const text = await request(API_URL, { headers: { Authorization: authorization, Accept: 'application/json' } });
      let data;
      try { data = JSON.parse(text); } catch { throw new ConnectorError('upstream_unrecognized', 'Resposta de diagnóstico inesperada.'); }
      return { configured: true, authenticated: data.error === true && data.message === 'Action não informada', actionsMapped: false };
    },
    async property(property) {
      validateProperty(property);
      const url = `${SITE_ORIGIN}/parceiro/${property.base}/${property.reference}`;
      const html = await request(url);
      const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
      const title = heading ? htmlToText(heading[1]) : '';
      if (!title) throw new ConnectorError('property_unrecognized', 'Não foi possível reconhecer a página pública deste imóvel.');
      return { id: property.id, base: property.base, reference: property.reference, title, publicUrl: url, source: 'imobsys-public-website', bookingEnabled: false };
    },
    async quote(property, from, to) {
      validateProperty(property);
      const dates = validateDates(from, to);
      // Única operação POST permitida: a consulta pública de preços observada no site.
      // Não enviar ALUGAR, ID_ORCA, cliente, CPF ou ações de reserva.
      const body = new URLSearchParams({ Ajax: 'Ajax', Controller: 'parceiro', action: 'buscaPrecos', periodo: `${dates.from},${dates.to}`, e1: '0', s1: '0', ImovRef: property.reference, BaseConsulta: property.base });
      const html = await request(`${SITE_ORIGIN}/`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' }, body,
      });
      const amounts = parseAdvertisedQuote(html, dates.nights);
      return {
        propertyId: property.id, from, to, nights: dates.nights, ...amounts,
        source: 'imobsys-public-website', kind: 'advertised-offer', observedAt: new Date().toISOString(),
        availability: 'not-confirmed', guestCountVerified: false, feeBreakdownAvailable: false,
        bookingEnabled: false, paymentEnabled: false,
        warnings: ['Preço anunciado pelo site parceiro. Não confirma disponibilidade, bloqueio de datas, capacidade ou composição completa das taxas.', 'Não aplicar novamente o acréscimo do cartão sobre o valor de cartão do fornecedor.'],
      };
    },
  };
}
