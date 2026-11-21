// Neutral staging contract. It is deliberately not imported by the production site.
export function stageListing(property, media = null) {
  const amount = property.lastObservedOffer?.pixCents;
  if (!/^imobsys-crcn-\d+-\d+$/.test(property.id) || !property.title) throw new Error('Invalid supplier identity');
  if (amount != null && (!Number.isSafeInteger(amount) || amount <= 0)) throw new Error('Invalid observed price');
  const apartmentImages = media?.propertyId === property.id ? (media.apartmentImages || []).filter(image => {
    try { const u = new URL(image.url); return image.kind === 'apartment' && u.origin === 'https://reservascrcn.com.br' && /^\/fotos\/[^/]+\/imoveis\/[^/]+\/fotos\//.test(u.pathname); } catch { return false; }
  }) : [];
  return {
    id: property.id,
    supplier: { system: 'imobsys', account: 'crcn', base: property.base, reference: property.reference },
    title: property.title, condominium: property.condominium || null, unit: property.unit || null,
    description: property.description || null,
    capacity: { advertised: property.advertisedCapacity || null, verified: false },
    amenities: property.features || [],
    images: apartmentImages,
    sourceUrl: property.publicUrl,
    lifecycle: { status: 'observed-in-offers', activeConfirmed: false, published: false },
    price: amount ? { currency: 'BRL', totalCents: amount, from: property.lastObservedOffer.from, to: property.lastObservedOffer.to, observedAt: property.lastObservedOffer.observedAt, kind: 'supplier-pix-offer', feesVerified: false } : null,
    availability: { status: 'unknown', requiresRecheck: true },
    capabilities: { booking: false, payment: false },
    missingForPublication: [...(apartmentImages.length ? ['photo-delivery-and-content-review'] : ['apartment-photos']), 'active-status', 'verified-availability', 'fee-breakdown', 'reservation-lifecycle'],
  };
}
