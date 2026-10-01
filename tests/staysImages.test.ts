import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStaysImages, mergeStaysImageSources } from '../src/utils/staysImages.ts';

test('collects every supported Stays gallery field and preserves distinct photos', () => {
  const images = extractStaysImages({
    _t_imagesMeta: [{ url: 'https://cdn.stays.test/a.jpg' }, { url: 'https://cdn.stays.test/b.jpg' }],
    images: ['https://cdn.stays.test/b.jpg', 'https://cdn.stays.test/c.jpg'],
    photos: [{ src: 'https://cdn.stays.test/d.jpg' }],
    _t_mainImageMeta: { url: 'https://cdn.stays.test/cover.jpg' },
  });

  assert.deepEqual(images, [
    'https://cdn.stays.test/a.jpg',
    'https://cdn.stays.test/b.jpg',
    'https://cdn.stays.test/c.jpg',
    'https://cdn.stays.test/d.jpg',
    'https://cdn.stays.test/cover.jpg',
  ]);
});

test('merges list and detail galleries when the list response has only a cover', () => {
  const merged = mergeStaysImageSources(
    { _t_mainImageMeta: { url: 'https://cdn.stays.test/cover.jpg' } },
    { _t_imagesMeta: [{ url: 'https://cdn.stays.test/room.jpg' }, { url: 'https://cdn.stays.test/pool.jpg' }] },
  );

  assert.deepEqual(merged, [
    'https://cdn.stays.test/cover.jpg',
    'https://cdn.stays.test/room.jpg',
    'https://cdn.stays.test/pool.jpg',
  ]);
});

test('preserves the cached full gallery when a dated search returns only its cover', () => {
  const gallery = mergeStaysImageSources(
    { _t_mainImageMeta: { url: 'https://cdn.stays.test/search-cover.jpg' } },
    { images: [
      'https://cdn.stays.test/cached-bedroom.jpg',
      'https://cdn.stays.test/cached-pool.jpg',
      'https://cdn.stays.test/search-cover.jpg',
    ] },
  );

  assert.deepEqual(gallery, [
    'https://cdn.stays.test/search-cover.jpg',
    'https://cdn.stays.test/cached-bedroom.jpg',
    'https://cdn.stays.test/cached-pool.jpg',
  ]);
});

test('ignores invalid URLs and duplicate images', () => {
  assert.deepEqual(extractStaysImages({ images: ['data:image/png;base64,abc', 'https://cdn.stays.test/a.jpg', 'https://cdn.stays.test/a.jpg'] }), [
    'https://cdn.stays.test/a.jpg',
  ]);
});
