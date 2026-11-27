import { ConnectorError, SITE_ORIGIN, htmlToText, moneyToCents, validateDates } from './provider-http.mjs';

const attr = (html, key) => {
  const match = html.match(new RegExp(`\\b${key}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : '';
};

export function parseCondominiums(xml) {
  const found = new Map();
  for (const block of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/g)) {
    const location = block[1].match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!location) continue;
    let url;
    try { url = new URL(location); } catch { continue; }
    const match = url.pathname.match(/^\/condominio\/(\d+)$/);
    if (url.origin !== SITE_ORIGIN || !match) continue;
    const title = block[1].match(/<image:title>([\s\S]*?)<\/image:title>/)?.[1];
    const image = block[1].match(/<image:loc>([^<]+)<\/image:loc>/)?.[1];
    found.set(match[1], { id: match[1], title: title ? htmlToText(title) : `Condomínio ${match[1]}`, url: url.href, image: image?.startsWith(`${SITE_ORIGIN}/`) ? image : null });
  }
  if (!found.size) throw new ConnectorError('catalog_unrecognized', 'O sitemap não apresentou condomínios reconhecíveis.');
  return [...found.values()];
}

function publicIdentity(href) {
  let url;
  try { url = new URL(href, SITE_ORIGIN); } catch { return null; }
  const match = url.pathname.match(/^\/parceiro\/([1-9]\d{0,8})\/([1-9]\d{0,11})\/?$/);
  if (url.origin !== SITE_ORIGIN || !match) return null;
  return { id: `imobsys-crcn-${match[1]}-${match[2]}`, base: match[1], reference: match[2], publicUrl: `${SITE_ORIGIN}/parceiro/${match[1]}/${match[2]}` };
}

const displayDate = (date) => date.split('-').reverse().join('/');

export function parseOffers(html, from, to) {
  const offers = new Map();
  let identifiedRows = 0;
  for (const match of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
    if (cells.length < 4) continue;
    const identities = [...cells[3].matchAll(/href=["']([^"']+)["']/gi)].map((link) => publicIdentity(link[1])).filter(Boolean);
    if (!identities.length) continue;
    identifiedRows++;
    if (identities.length !== 1) throw new ConnectorError('offers_unrecognized', 'Linha de oferta com identificação ambígua.');
    const name = htmlToText(cells[0].match(/<b\b[^>]*>([\s\S]*?)<\/b>/i)?.[1] || '');
    const dateText = htmlToText(cells[1]);
    const priceText = htmlToText(cells[2]);
    const price = [...priceText.matchAll(/R\$\s*([\d.,]+)\s+no\s+PIX/gi)];
    if (!name || price.length !== 1 || !dateText.includes(displayDate(from)) || !dateText.includes(displayDate(to))) {
      throw new ConnectorError('offers_unrecognized', 'A listagem não confirmou identidade, preço e período de todas as ofertas.');
    }
    const nameParts = name.split('|').map((value) => value.trim());
    const description = htmlToText(cells[0]);
    const capacity = description.match(/Permitido\s+(\d+)\s+pessoas/i);
    const identity = identities[0];
    if (offers.has(identity.id)) throw new ConnectorError('offers_duplicated', 'O fornecedor repetiu uma referência de imóvel na listagem.');
    offers.set(identity.id, {
      ...identity, title: name, condominium: nameParts[0], unit: nameParts.slice(1).join('|').trim(),
      description, advertisedCapacity: capacity ? Number(capacity[1]) : null,
      features: attr(match[1], 'class').split(/\s+/).filter((value) => ['fogao', 'geladeira', 'tela', 'vistaPiscina'].includes(value)),
      from, to, pixCents: moneyToCents(price[0][1]), supplierDateText: dateText,
      availability: 'offered-by-supplier', availabilityConfirmed: false, bookingEnabled: false, paymentEnabled: false,
    });
  }
  const text = htmlToText(html);
  const explicitlyEmpty = /nenhum(?:a)?\s+(?:im[oó]ve(?:l|is)|apartamento|op[çc][aã]o)|n[aã]o\s+(?:h[aá]|encontramos|foram encontrados).*?(?:im[oó]ve|apartamento|dispon[ií]ve)/i.test(text);
  if (!identifiedRows && !explicitlyEmpty) throw new ConnectorError('offers_unrecognized', 'A resposta não contém ofertas reconhecíveis nem indicação explícita de resultado vazio.');
  return { offers: [...offers.values()], count: offers.size, explicitlyEmpty, paginationDetected: /(?:class|id)=["'][^"']*(?:pagination|paginacao)[^"']*["']/i.test(html) };
}

export function validateMonth(month, now = new Date()) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month || '')) throw new ConnectorError('invalid_month', 'Use um mês no formato AAAA-MM.', 400);
  const [year, number] = month.split('-').map(Number);
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(now));
  if (year < currentYear || year > currentYear + 2) throw new ConnectorError('invalid_month', 'Consulte meses entre o ano atual e os próximos dois anos.', 400);
  return { year, month: number, days: new Date(Date.UTC(year, number, 0)).getUTCDate() };
}

export function parseOccupancyMap(html, month) {
  const { days } = validateMonth(month);
  const units = [];
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    if (cells.length < 2) continue;
    const link = cells[1][2].match(/href=["'](\/imovel\/([A-Za-z0-9_-]+))["']/);
    if (!link) continue;
    if (cells.length !== days + 2) throw new ConnectorError('calendar_unrecognized', 'Quantidade de dias inesperada no calendário do fornecedor.');
    const condominium = htmlToText(cells[0][2]);
    const unit = htmlToText(cells[1][2]);
    if (!condominium || !unit) throw new ConnectorError('calendar_unrecognized', 'Unidade do calendário sem identificação.');
    units.push({
      publicReference: link[2], condominium, unit, publicUrl: `${SITE_ORIGIN}${link[1]}`,
      dates: cells.slice(2).map((cell, index) => {
        const style = attr(cell[1], 'style');
        const observation = /gradient/i.test(style) ? 'partial-marker' : /background/i.test(style) ? 'colored-marker' : 'unmarked';
        return { date: `${month}-${String(index + 1).padStart(2, '0')}`, observation, availability: 'unknown' };
      }),
    });
  }
  if (!units.length) throw new ConnectorError('calendar_unrecognized', 'O mapa não apresentou unidades reconhecíveis. Isso não significa que não há imóveis.');
  if (new Set(units.map((unit) => unit.publicReference)).size !== units.length) throw new ConnectorError('calendar_unrecognized', 'Referências duplicadas no calendário.');
  return { month, units, count: units.length, scope: 'public-local-units', availabilityConfirmed: false, legendVerified: false, warning: 'Cores e células sem marcação ainda não têm semântica confirmada. Um dia sem marcação não é tratado como disponível.' };
}

export function createCatalogProvider(provider) {
  return {
    async condominiums() {
      return parseCondominiums(await provider.readPublic(`${SITE_ORIGIN}/sitemap.xml`));
    },
    async offers(from, to, condominium = '') {
      validateDates(from, to);
      if (condominium && !/^[1-9]\d{0,8}$/.test(condominium)) throw new ConnectorError('invalid_condominium', 'Condomínio inválido.', 400);
      const localDate = (value) => value.split('-').reverse().join('-');
      const body = new URLSearchParams({ Ajax: 'Ajax', Controller: 'precos', action: 'listaprecos', periodo: `${localDate(from)},${localDate(to)}`, condominio: condominium, maxOcupantes: '', minPax: '1', addCrianca: '0' });
      const html = await provider.readPublic(`${SITE_ORIGIN}/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' }, body });
      return { from, to, observedAt: new Date().toISOString(), ...parseOffers(html, from, to), coverage: 'offers-for-selected-dates', catalogueComplete: false, bookingEnabled: false, paymentEnabled: false };
    },
    async calendar(month) {
      validateMonth(month);
      const body = new URLSearchParams({ cond: '', qtdeqrts: '', referencia: month });
      const html = await provider.readPublic(`${SITE_ORIGIN}/mapaocupacao`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' }, body });
      return { observedAt: new Date().toISOString(), ...parseOccupancyMap(html, month) };
    },
  };
}
