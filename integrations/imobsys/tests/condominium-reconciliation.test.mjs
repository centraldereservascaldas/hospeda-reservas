import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCondominiumCandidates, normalizeCondominiumName, reconcileCondominiumIdentity } from '../src/condominium-reconciliation.mjs';

const crosswalk = JSON.parse(readFileSync(new URL('../condominium-crosswalk.json', import.meta.url), 'utf8'));

const snapshot = {
  updatedAt: '2026-11-20T10:00:00.000Z',
  condominiums: [
    { id: '86', title: 'Lacqua diRoma' },
    { id: '87', title: 'Lacqua diRoma' },
    { id: '88', title: 'Condomínio Águas' },
  ],
  properties: [
    { id: 'imobsys-crcn-2-663', condominium: 'Lacqua diRoma' },
    { id: 'imobsys-crcn-2-664', condominium: 'Condomínio Águas' },
    { id: 'imobsys-crcn-2-665', condominium: 'Condomínio Águas' },
  ],
};

test('normalizes accents and punctuation for exact-name suggestions', () => {
  assert.equal(normalizeCondominiumName(' Condomínio Águas! '), 'condominio aguas');
});

test('builds observed candidates and only uses explicit unit metadata for ImobSys IDs', () => {
  const candidates = buildCondominiumCandidates(snapshot, {
    'imobsys-crcn-2-663': { condominiumId: 'imobsys-crcn-condo-86' },
  });
  const lacqua = candidates.find(({ normalizedName }) => normalizedName === 'lacqua diroma');
  assert.deepEqual(lacqua.sitemapIds, ['86', '87']);
  assert.deepEqual(lacqua.imobsysCondominiumIds, ['imobsys-crcn-condo-86']);
  assert.equal(candidates.find(({ normalizedName }) => normalizedName === 'condominio aguas').imobsysCondominiumIds.length, 0);
});

test('exact normalized names remain review-only without a verified crosswalk', () => {
  const candidates = buildCondominiumCandidates(snapshot, {});
  const result = reconcileCondominiumIdentity({
    staysPropertyId: 'stays-condo-44',
    staysName: '  LACQUA diroma ',
    candidates,
  });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.matchConfirmed, false);
  assert.equal(result.imobsysCondominiumId, null);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.identityCatalogueComplete, false);
  assert.equal(result.offerCatalogueComplete, false);
});

test('unknown names never infer a match or indicate unavailability', () => {
  const result = reconcileCondominiumIdentity({
    staysPropertyId: 'stays-condo-45',
    staysName: 'Different place',
    candidates: buildCondominiumCandidates(snapshot, {}),
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.absenceMeans, 'unknown');
  assert.equal(result.imobsysCondominiumId, null);
});

test('only an explicit verified and currently observed crosswalk confirms identity', () => {
  const candidates = buildCondominiumCandidates(snapshot, {
    'imobsys-crcn-2-663': { condominiumId: 'imobsys-crcn-condo-86' },
  });
  const verifiedMappings = [{
    staysPropertyId: 'stays-condo-44',
    staysName: 'Lacqua diRoma',
    imobsysCondominiumId: 'imobsys-crcn-condo-86',
    imobsysName: 'Lacqua diRoma',
    evidence: 'Manually checked in both supplier dashboards',
    verifiedAt: '2026-11-20T10:00:00.000Z',
  }];
  const result = reconcileCondominiumIdentity({ staysPropertyId: 'stays-condo-44', staysName: 'Lacqua diRoma', candidates, verifiedMappings });
  assert.equal(result.status, 'verified');
  assert.equal(result.matchConfirmed, true);
  assert.equal(result.imobsysCondominiumId, 'imobsys-crcn-condo-86');
});

test('stale or malformed verified mappings fail closed', () => {
  const candidates = buildCondominiumCandidates(snapshot, {});
  const mapping = {
    staysPropertyId: 'stays-condo-44', staysName: 'Lacqua diRoma',
    imobsysCondominiumId: 'imobsys-crcn-condo-86', imobsysName: 'Lacqua diRoma',
    evidence: 'Manually checked in both supplier dashboards', verifiedAt: '2026-11-20T10:00:00.000Z',
  };
  const stale = reconcileCondominiumIdentity({ staysPropertyId: 'stays-condo-44', staysName: mapping.staysName, candidates, verifiedMappings: [mapping] });
  assert.equal(stale.status, 'review_required');
  assert.equal(stale.matchConfirmed, false);
  assert.equal(stale.imobsysCondominiumId, null);
  assert.throws(() => reconcileCondominiumIdentity({ staysPropertyId: 'stays-condo-44', staysName: mapping.staysName, candidates, verifiedMappings: [{ ...mapping, staysPropertyId: 'bad/id' }] }), { code: 'mapping_invalid' });
});

test('provider catalog imports only explicit verified statuses and keeps review states separate', () => {
  assert.equal(crosswalk.catalogueComplete, true);
  assert.equal(crosswalk.verified.length, 21);
  assert.equal(crosswalk.suggested.length, 5);
  assert.equal(crosswalk.suggested.filter(({ candidates: items }) => items.length > 0).length, 1);
  assert.equal(crosswalk.unmatched.length, 16);
  assert.ok(crosswalk.verified.every(({ matchStatus }) => matchStatus.startsWith('verified_')));
  assert.ok(crosswalk.suggested.every(({ status }) => status === 'review_required'));
  assert.ok(crosswalk.unmatched.every(({ status }) => status === 'unmatched'));
  assert.ok(crosswalk.verified.every(({ staysPropertyId, imobsysProviderId }) => staysPropertyId !== imobsysProviderId));
});

test('confirmed source crosswalk accepts verified provider aliases but returns IDs separately', () => {
  const candidates = buildCondominiumCandidates({ condominiums: [], properties: [] }, {}, crosswalk);
  const mapping = crosswalk.verified.find(({ matchStatus }) => matchStatus === 'verified_manual');
  const result = reconcileCondominiumIdentity({
    staysPropertyId: mapping.staysPropertyId,
    staysName: mapping.staysName,
    candidates,
    verifiedMappings: crosswalk.verified,
  });
  assert.equal(result.status, 'verified');
  assert.equal(result.matchConfirmed, true);
  assert.equal(result.imobsysProviderId, mapping.imobsysProviderId);
  assert.equal(result.imobsysCondominiumId, mapping.imobsysCondominiumId);
  assert.notEqual(result.stays.propertyId, result.imobsysProviderId);
});

test('source suggestions remain review-only and unmatched Stays records are not promoted', () => {
  const candidates = buildCondominiumCandidates({ condominiums: [], properties: [] }, {}, crosswalk);
  const suggestion = crosswalk.suggested.find(({ candidates: items }) => items.length > 0);
  const result = reconcileCondominiumIdentity({
    staysPropertyId: suggestion.staysPropertyId,
    staysName: suggestion.staysName,
    candidates,
    verifiedMappings: crosswalk.verified,
    reviewRecords: crosswalk.suggested,
  });
  assert.equal(result.status, 'review_required');
  assert.equal(result.matchConfirmed, false);
  assert.equal(result.imobsysCondominiumId, null);
  assert.equal(result.candidates[0].imobsysCondominiumId, null);
  assert.equal(result.candidates[0].imobsysProviderId, suggestion.candidates[0].imobsysProviderId);
});
