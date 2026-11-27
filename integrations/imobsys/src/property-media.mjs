import { SITE_ORIGIN, ConnectorError, validateProperty, htmlToText } from './provider-http.mjs';

export async function fetchPropertyMedia(provider, propertyId) {
  const match = typeof propertyId === 'string'
    ? propertyId.match(/^imobsys-crcn-([1-9]\d{0,8})-([1-9]\d{0,11})$/)
    : null;
  if (!match || !provider || typeof provider.readPublic !== 'function') {
    throw new ConnectorError('invalid_property', 'Referência de imóvel inválida.', 400);
  }

  const property = { id: propertyId, base: match[1], reference: match[2] };
  validateProperty(property);
  const html = await provider.readPublic(`${SITE_ORIGIN}/parceiro/${property.base}/${property.reference}`);

  return parsePropertyMedia(html, property);
}

export function parsePropertyMedia(html, property) {
  validateProperty(property);
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const inputValue = (id) => {
    const tags = [...html.matchAll(/<input\b[^>]*>/gi)].map(m => m[0]);
    const tag = tags.find(t => t.match(/\bid=["']([^"']*)["']/i)?.[1] === id);
    return tag?.match(/\bvalue=["']([^"']*)["']/i)?.[1] || null;
  };
  if (inputValue('ImovRef') !== property.reference || inputValue('BaseConsulta') !== property.base) throw new ConnectorError('media_identity_mismatch', 'A página não confirmou a identidade do parceiro.');
  const detailBlock = html.match(/<div\b[^>]*class=["'][^"']*\bpi-margin-top-15\b[^"']*["'][^>]*>((?:(?!<\/div>)[\s\S])*?COMODIDADES\s+DO\s+APARTAMENTO(?:(?!<\/div>)[\s\S])*?)<\/div>/i)?.[1];
  const description = detailBlock
    ? detailBlock.replace(/<br\s*\/?\s*>/gi, '\n').split('\n').map(htmlToText).filter(Boolean).join('\n').slice(0, 10000)
    : null;
  const images = new Map();
  for (const match of html.matchAll(/\b(?:src|href|data-src)=["']([^"']+)["']/gi)) {
    let url;
    try { url = new URL(htmlToText(match[1]), SITE_ORIGIN); } catch { continue; }
    if (url.origin !== SITE_ORIGIN || !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) continue;
    const unit = url.pathname.match(/^\/fotos\/([^/]+)\/imoveis\/([^/]+)\/fotos\//i);
    const condo = url.pathname.match(/^\/fotos\/([^/]+)\/condominios\/([^/]+)\/fotos\//i);
    if (!unit && !condo) continue;
    images.set(url.href, { url: url.href, kind: unit ? 'apartment' : 'condominium', sourceReference: (unit || condo)[2], sourceAccount: (unit || condo)[1], association: 'supplier-property-page', deliveryVerified: false });
  }
  const apartmentImages = [...images.values()].filter(i => i.kind === 'apartment');
  const condominiumImages = [...images.values()].filter(i => i.kind === 'condominium');
  return { propertyId: property.id, observedAt: new Date().toISOString(), description, apartmentImages, condominiumImages, calendarIdentity: inputValue('idUnidade'), calendarIdentityVerified: false, availabilityConfirmed: false };
}
