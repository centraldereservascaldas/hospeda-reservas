import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getHomeDateSuggestions,
  getHomeDiscoveryCollections,
} from '../src/utils/homeDateSuggestions.ts';

test('home suggestions combine real weekends with seasonal dates without duplicates', () => {
  const suggestions = getHomeDateSuggestions(new Date(2026, 9, 29, 12), () => 0.25);

  assert.equal(suggestions.length, 4);
  assert.equal(suggestions.filter((suggestion) => suggestion.kind === 'weekend').length, 2);
  assert.equal(
    new Set(suggestions.map((suggestion) => `${suggestion.checkIn}|${suggestion.checkOut}`)).size,
    suggestions.length,
  );
  for (const suggestion of suggestions) {
    assert.ok(suggestion.checkIn >= '2026-10-31');
    assert.ok(suggestion.checkOut > suggestion.checkIn);
  }
});

test('weekend suggestions always run from Friday to Sunday', () => {
  const suggestions = getHomeDateSuggestions(new Date(2026, 9, 29, 12), () => 0.75);
  const weekends = suggestions.filter((suggestion) => suggestion.kind === 'weekend');

  for (const weekend of weekends) {
    assert.equal(new Date(`${weekend.checkIn}T12:00:00`).getDay(), 5);
    assert.equal(new Date(`${weekend.checkOut}T12:00:00`).getDay(), 0);
  }
});

test('home discovery creates pet and holiday collections when no future event is confirmed', () => {
  const collections = getHomeDiscoveryCollections(new Date(2026, 9, 29, 12), () => 0.25);

  assert.deepEqual(
    collections.map((collection) => collection.id),
    ['pets', 'holidays'],
  );
  assert.equal(collections.find((collection) => collection.id === 'pets')?.suggestions.length, 5);
  assert.equal(
    collections.some((collection) => collection.id === 'caldas-country'),
    false,
  );
  assert.equal(
    collections.find((collection) => collection.id === 'holidays')?.suggestions.length,
    5,
  );
});

test('home collections never suggest past dates across holidays and year changes', () => {
  for (const now of [
    new Date(2026, 10, 26),
    new Date(2026, 11, 31),
    new Date(2027, 0, 1),
    new Date(2027, 10, 21),
  ]) {
    const earliest = new Date(now);
    earliest.setDate(earliest.getDate() + 2);
    const minimum = `${earliest.getFullYear()}-${String(earliest.getMonth() + 1).padStart(2, '0')}-${String(earliest.getDate()).padStart(2, '0')}`;
    for (const suggestion of [
      ...getHomeDateSuggestions(now),
      ...getHomeDiscoveryCollections(now).flatMap((collection) => collection.suggestions),
    ]) {
      assert.ok(suggestion.checkIn >= minimum);
      assert.ok(suggestion.checkOut > suggestion.checkIn);
    }
  }
});
