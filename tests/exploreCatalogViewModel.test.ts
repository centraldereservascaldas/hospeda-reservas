import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import type { Property } from '../src/types/index.ts';
import { createDefaultSearchFilters } from '../src/utils/searchUrlState.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  getComputedStyle: dom.window.getComputedStyle,
});

const { cleanup, renderHook } = await import('@testing-library/react');
const { useExploreCatalogViewModel } = await import('../src/hooks/useExploreCatalogViewModel.ts');

afterEach(cleanup);

test('derives catalog results, categories, saved properties, and empty-catalog states', () => {
  const [firstProperty, otherProperty] = STAYS_NET_APARTMENTS;
  assert.ok(firstProperty);
  assert.ok(otherProperty);
  const property = { ...firstProperty, complexName: 'Condomínio de teste' };
  const filters = {
    ...createDefaultSearchFilters(),
    destination: property.location.city,
    minBedrooms: 2,
    guests: { adults: 2, children: 0, infants: 0, pets: 0 },
  };
  const options = {
    properties: [property, otherProperty],
    catalogProperties: [property, otherProperty],
    filters,
    savedPropertyIds: [otherProperty.id],
    catalogLoading: true,
    catalogLoadError: false,
    catalogPropertiesLoadError: false,
  };

  const { result, rerender } = renderHook((props) => useExploreCatalogViewModel(props), {
    initialProps: options,
  });

  assert.deepEqual(
    result.current.filteredProperties.map(({ id }) => id),
    [property.id],
  );
  assert.equal(
    result.current.availableCategories.some(({ id }) => id === 'all'),
    true,
  );
  assert.equal(
    result.current.availableCategories.some(({ id }) => id === 'pools_24h'),
    true,
  );
  assert.equal(result.current.savedPropertiesList[0]?.id, otherProperty.id);
  assert.deepEqual(result.current.missingSavedPropertyIds, []);
  assert.equal(result.current.savedPropertiesState, 'stale');
  assert.equal(result.current.catalogStatus, 'stale');
  assert.equal(result.current.isCondominiumView, false);
  assert.ok(result.current.condominiums.length > 0);

  rerender({ ...options, properties: [], catalogLoading: true });
  assert.equal(result.current.catalogStatus, 'loading');

  rerender({ ...options, properties: [], catalogLoading: false, catalogLoadError: true });
  assert.equal(result.current.catalogStatus, 'error');

  rerender({ ...options, properties: [property], catalogLoading: false, catalogLoadError: true });
  assert.equal(result.current.catalogStatus, 'stale');
});

test('condominium directory contains only groups with listings matching active filters', () => {
  const firstProperty = STAYS_NET_APARTMENTS[0]!;
  const matchingProperty = {
    ...firstProperty,
    complexName: 'Condomínio com piscina',
    amenities: ['Piscina'],
  };
  const otherProperty = {
    ...STAYS_NET_APARTMENTS[1]!,
    complexName: 'Condomínio sem piscina',
    amenities: ['Wi-Fi'],
  };
  const options = {
    properties: [matchingProperty, otherProperty],
    catalogProperties: [matchingProperty, otherProperty],
    filters: {
      ...createDefaultSearchFilters(),
      category: 'condominiums',
      amenities: ['Piscina'],
    },
    savedPropertyIds: [],
    catalogLoading: false,
    catalogLoadError: false,
    catalogPropertiesLoadError: false,
  };

  const { result } = renderHook((props) => useExploreCatalogViewModel(props), {
    initialProps: options,
  });

  assert.deepEqual(result.current.filteredProperties, [matchingProperty]);
  assert.deepEqual(
    result.current.condominiums.map(({ name }) => name),
    ['Condomínio com piscina'],
  );
});

test('keeps category choices available while later search pages remain unchecked', () => {
  const options = {
    properties: [],
    catalogProperties: [],
    filters: createDefaultSearchFilters(),
    savedPropertyIds: [],
    catalogLoading: false,
    catalogLoadError: false,
    catalogPropertiesLoadError: false,
    hasMoreSearchResults: true,
  };
  const { result } = renderHook(() => useExploreCatalogViewModel(options));
  assert.equal(
    result.current.availableCategories.some((category) => category.id === 'pet_friendly'),
    true,
  );
  assert.equal(
    result.current.availableCategories.some((category) => category.id === 'hot_tub'),
    true,
  );
});

test('resolves saved properties from the full catalog after search results change', () => {
  const [savedProperty, searchResult] = STAYS_NET_APARTMENTS;
  assert.ok(savedProperty);
  assert.ok(searchResult);
  const options = {
    properties: [searchResult],
    catalogProperties: [savedProperty, searchResult],
    filters: createDefaultSearchFilters(),
    savedPropertyIds: [savedProperty.id],
    catalogLoading: false,
    catalogLoadError: false,
    catalogPropertiesLoadError: false,
  };

  const { result } = renderHook(() => useExploreCatalogViewModel(options));

  assert.deepEqual(
    result.current.savedPropertiesList.map(({ id }) => id),
    [savedProperty.id],
  );
  assert.deepEqual(result.current.missingSavedPropertyIds, []);
  assert.equal(result.current.savedPropertiesState, 'ready');
});

test('only marks unmatched saved IDs unavailable after a successful full catalog load', () => {
  const [property] = STAYS_NET_APARTMENTS;
  assert.ok(property);
  const options = {
    properties: [],
    catalogProperties: [] as Property[],
    filters: createDefaultSearchFilters(),
    savedPropertyIds: [property.id],
    catalogLoading: false,
    catalogLoadError: false,
    catalogPropertiesLoadError: false,
  };

  const { result, rerender } = renderHook((props) => useExploreCatalogViewModel(props), {
    initialProps: options,
  });

  assert.deepEqual(result.current.missingSavedPropertyIds, [property.id]);
  assert.equal(result.current.savedPropertiesState, 'ready');

  rerender({ ...options, catalogProperties: [property], catalogPropertiesLoadError: true });
  assert.deepEqual(
    result.current.savedPropertiesList.map(({ id }) => id),
    [property.id],
  );
  assert.equal(result.current.savedPropertiesState, 'error');
  assert.deepEqual(result.current.missingSavedPropertyIds, []);

  rerender({ ...options, catalogProperties: [], catalogPropertiesLoadError: true });
  assert.deepEqual(result.current.missingSavedPropertyIds, []);
  assert.equal(result.current.savedPropertiesState, 'error');
});
