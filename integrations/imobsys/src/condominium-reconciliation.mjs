import { ConnectorError } from './provider-http.mjs';

const validStaysId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const validCondominiumId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);

export function normalizeCondominiumName(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function buildCondominiumCandidates(snapshot, metadata = {}, crosswalk = null) {
  if (!snapshot || !Array.isArray(snapshot.condominiums) || !Array.isArray(snapshot.properties)) {
    throw new ConnectorError('catalog_unavailable', 'O catálogo observado de condomínios não está disponível.', 503);
  }

  const candidates = new Map();
  const add = ({ name, sitemapId = null, condominiumId = null, providerId = null, propertyKey = null, evidence }) => {
    const normalizedName = normalizeCondominiumName(name);
    if (!normalizedName) return;

    const key = normalizedName;
    const candidate = candidates.get(key) || {
      normalizedName,
      name: String(name).trim(),
      sitemapIds: [],
      imobsysCondominiumIds: [],
      imobsysProviderIds: [],
      propertyKeys: [],
      evidence: [],
    };
    if (sitemapId !== null && !candidate.sitemapIds.includes(sitemapId)) candidate.sitemapIds.push(sitemapId);
    if (condominiumId !== null && !candidate.imobsysCondominiumIds.includes(condominiumId)) candidate.imobsysCondominiumIds.push(condominiumId);
    if (providerId !== null && !candidate.imobsysProviderIds.includes(providerId)) candidate.imobsysProviderIds.push(providerId);
    if (propertyKey !== null && !candidate.propertyKeys.includes(propertyKey)) candidate.propertyKeys.push(propertyKey);
    if (evidence && !candidate.evidence.includes(evidence)) candidate.evidence.push(evidence);
    candidates.set(key, candidate);
  };

  for (const condominium of snapshot.condominiums.slice(0, 1000)) {
    const sitemapId = typeof condominium?.id === 'string' && /^[1-9]\d{0,8}$/.test(condominium.id)
      ? condominium.id
      : null;
    if (sitemapId && typeof condominium.title === 'string') {
      add({ name: condominium.title, sitemapId, evidence: 'public-sitemap-name' });
    }
  }

  for (const property of snapshot.properties.slice(0, 5000)) {
    if (!property || typeof property.id !== 'string') continue;
    const condoName = typeof property.condominium === 'string' ? property.condominium : null;
    const propertyMetadata = metadata[property.id];
    const condominiumId = typeof propertyMetadata?.condominiumId === 'string'
      && validCondominiumId(propertyMetadata.condominiumId)
      ? propertyMetadata.condominiumId
      : null;
    if (condoName) {
      add({
        name: condoName,
        condominiumId,
        evidence: condominiumId ? 'verified-property-metadata' : 'observed-offer-name',
      });
    }
  }

  if (crosswalk && Array.isArray(crosswalk.verified) && Array.isArray(crosswalk.suggested) && Array.isArray(crosswalk.unmatched)) {
    for (const mapping of crosswalk.verified) {
      add({
        name: mapping.imobsysName,
        condominiumId: mapping.imobsysCondominiumId,
        providerId: mapping.imobsysProviderId,
        propertyKey: mapping.propertyKey,
        evidence: `verified-crosswalk:${mapping.matchStatus}`,
      });
    }
    for (const item of crosswalk.suggested) {
      for (const candidate of item.candidates || []) {
        add({
          name: candidate.imobsysName,
          providerId: candidate.imobsysProviderId,
          propertyKey: candidate.propertyKey,
          evidence: 'unverified-cross-provider-suggestion',
        });
      }
    }
    for (const item of crosswalk.unmatched) {
      add({
        name: item.name,
        providerId: item.providerId,
        propertyKey: item.propertyKey,
        evidence: 'provider-only-record',
      });
    }
  }

  return [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      sitemapIds: candidate.sitemapIds.sort(),
      imobsysCondominiumIds: candidate.imobsysCondominiumIds.sort(),
      imobsysProviderIds: candidate.imobsysProviderIds.sort(),
      propertyKeys: candidate.propertyKeys.sort(),
      evidence: candidate.evidence.sort(),
    }))
    .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName, 'pt-BR'));
}

function validateVerifiedMappings(mappings) {
  if (!Array.isArray(mappings) || mappings.length > 1000) {
    throw new ConnectorError('mapping_invalid', 'O cadastro de conciliação verificada é inválido.', 500);
  }

  const ids = new Set();
  return mappings.map((mapping) => {
    if (!mapping || !validStaysId(mapping.staysPropertyId)
      || typeof mapping.staysName !== 'string' || !normalizeCondominiumName(mapping.staysName)
      || !validCondominiumId(mapping.imobsysCondominiumId)
      || typeof mapping.imobsysName !== 'string' || !normalizeCondominiumName(mapping.imobsysName)
      || typeof mapping.evidence !== 'string' || mapping.evidence.trim().length < 8
      || typeof mapping.verifiedAt !== 'string' || !Number.isFinite(Date.parse(mapping.verifiedAt))) {
      throw new ConnectorError('mapping_invalid', 'O cadastro de conciliação verificada é inválido.', 500);
    }
    if (ids.has(mapping.staysPropertyId)) {
      throw new ConnectorError('mapping_invalid', 'Há mais de um vínculo verificado para o mesmo ID Stays.', 500);
    }
    ids.add(mapping.staysPropertyId);
    return mapping;
  });
}

/**
 * Name equality only produces a review candidate. Only an explicit, audited
 * crosswalk may return an ImobSys condominium ID as a confirmed match.
 */
export function reconcileCondominiumIdentity({ staysPropertyId, staysName, candidates, verifiedMappings = [], reviewRecords = [] }) {
  if (!validStaysId(staysPropertyId) || typeof staysName !== 'string'
    || staysName.trim().length < 1 || staysName.trim().length > 160
    || !Array.isArray(candidates) || candidates.length > 2000) {
    throw new ConnectorError('invalid_reconciliation_query', 'Informe o ID e o nome do condomínio Stays.', 400);
  }

  const normalizedStaysName = normalizeCondominiumName(staysName);
  const mappings = validateVerifiedMappings(verifiedMappings);
  const explicitMapping = mappings.find((mapping) => mapping.staysPropertyId === staysPropertyId);
  const reviewRecord = Array.isArray(reviewRecords)
    ? reviewRecords.find((record) => record?.staysPropertyId === staysPropertyId)
    : null;
  const exactCandidates = candidates.filter((candidate) => candidate
    && typeof candidate.normalizedName === 'string'
    && candidate.normalizedName === normalizedStaysName);

  if (explicitMapping) {
    const nameStillMatches = normalizeCondominiumName(explicitMapping.staysName) === normalizedStaysName;
    const targetStillObserved = candidates.some((candidate) => candidate
      && candidate.imobsysCondominiumIds?.includes(explicitMapping.imobsysCondominiumId)
      && normalizeCondominiumName(candidate.name) === normalizeCondominiumName(explicitMapping.imobsysName));
    if (nameStillMatches && targetStillObserved) {
      return {
        success: true,
        source: 'verified-condominium-crosswalk',
        stays: { propertyId: staysPropertyId, name: staysName.trim() },
        status: 'verified',
        matchConfirmed: true,
        matchMethod: 'explicit-crosswalk',
        imobsysCondominiumId: explicitMapping.imobsysCondominiumId,
        imobsysProviderId: explicitMapping.imobsysProviderId ?? null,
        propertyKey: explicitMapping.propertyKey ?? null,
        candidates: [{
          imobsysCondominiumId: explicitMapping.imobsysCondominiumId,
          name: explicitMapping.imobsysName,
          imobsysProviderId: explicitMapping.imobsysProviderId ?? null,
          propertyKey: explicitMapping.propertyKey ?? null,
          evidence: explicitMapping.evidence,
          verifiedAt: explicitMapping.verifiedAt,
        }],
        identityCatalogueComplete: true,
        identityCatalogSnapshotAt: explicitMapping.verifiedAt,
        offerCatalogueComplete: false,
        availabilityConfirmed: false,
        absenceMeans: 'unknown',
      };
    }

    return {
      success: true,
      source: 'observed-condominium-catalogue',
      stays: { propertyId: staysPropertyId, name: staysName.trim() },
      status: 'review_required',
      reason: !nameStillMatches ? 'stays_name_changed_since_verification' : 'imobsys_target_not_observed',
      matchConfirmed: false,
      matchMethod: null,
      imobsysCondominiumId: null,
      candidates: exactCandidates.map((candidate) => ({
        imobsysCondominiumId: null,
        name: candidate.name,
        evidence: candidate.evidence,
        sitemapIds: candidate.sitemapIds,
      })),
      identityCatalogueComplete: true,
      identityCatalogSnapshotAt: explicitMapping.verifiedAt,
      offerCatalogueComplete: false,
      availabilityConfirmed: false,
      absenceMeans: 'unknown',
    };
  }

  if (reviewRecord) {
    return {
      success: true,
      source: 'explicit-crosswalk-review-queue',
      stays: { propertyId: staysPropertyId, name: staysName.trim() },
      status: 'review_required',
      reason: normalizeCondominiumName(reviewRecord.staysName) === normalizedStaysName
        ? reviewRecord.reason
        : 'stays_name_changed_since_catalog_snapshot',
      matchConfirmed: false,
      matchMethod: null,
      imobsysCondominiumId: null,
      candidates: (reviewRecord.candidates || []).map((candidate) => ({
        imobsysCondominiumId: null,
        imobsysProviderId: candidate.imobsysProviderId ?? null,
        propertyKey: candidate.propertyKey ?? null,
        name: candidate.imobsysName ?? null,
        canonicalName: candidate.canonicalName ?? null,
        score: candidate.score ?? null,
        evidence: 'unverified-suggestion-requires-human-review',
      })),
      identityCatalogueComplete: true,
      identityCatalogSnapshotAt: reviewRecord.catalogSnapshotAt ?? null,
      offerCatalogueComplete: false,
      availabilityConfirmed: false,
      absenceMeans: 'unknown',
    };
  }

  const ambiguous = exactCandidates.some((candidate) => candidate.sitemapIds.length > 1
    || candidate.imobsysCondominiumIds.length > 1) || exactCandidates.length > 1;
  const candidatesForReview = exactCandidates.map((candidate) => ({
    imobsysCondominiumId: null,
    imobsysProviderIds: candidate.imobsysProviderIds,
    propertyKeys: candidate.propertyKeys,
    name: candidate.name,
    evidence: candidate.evidence,
    sitemapIds: candidate.sitemapIds,
    ambiguous: candidate.sitemapIds.length > 1 || candidate.imobsysCondominiumIds.length > 1,
  }));

  return {
    success: true,
    source: 'observed-condominium-catalogue',
    stays: { propertyId: staysPropertyId, name: staysName.trim() },
    status: exactCandidates.length === 0 ? 'unknown' : ambiguous ? 'ambiguous' : 'review_required',
    matchConfirmed: false,
    matchMethod: exactCandidates.length === 0 ? null : 'exact-normalized-name-candidate',
    imobsysCondominiumId: null,
    candidates: candidatesForReview,
    identityCatalogueComplete: false,
    offerCatalogueComplete: false,
    availabilityConfirmed: false,
    absenceMeans: 'unknown',
  };
}
