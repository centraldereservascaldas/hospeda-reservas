import assert from 'node:assert/strict';
import test from 'node:test';
import { STAYS_NET_APARTMENTS } from '../src/data/staysApartments.ts';
import { isSafeMediaUrl, sanitizePropertyMedia } from '../src/utils/propertyMedia.ts';

test('accepts only absolute HTTP(S) media URLs without embedded credentials', () => {
  assert.equal(isSafeMediaUrl('https://cdn.stays.net/property.jpg'), true);
  assert.equal(isSafeMediaUrl('http://images.example.test/host.jpg'), true);
  assert.equal(isSafeMediaUrl('javascript:alert(1)'), false);
  assert.equal(isSafeMediaUrl('data:image/svg+xml,<svg/>'), false);
  assert.equal(isSafeMediaUrl('//cdn.stays.net/property.jpg'), false);
  assert.equal(isSafeMediaUrl('https://user:pass@cdn.stays.net/property.jpg'), false);
  assert.equal(isSafeMediaUrl('not a URL'), false);
});

test('removes invalid listing and condominium images and clears an invalid host avatar', () => {
  const property = STAYS_NET_APARTMENTS[0]!;
  const sanitized = sanitizePropertyMedia({
    ...property,
    images: ['https://cdn.stays.net/cover.jpg', 'javascript:alert(1)', 'data:image/png;base64,abc'],
    complexImages: ['https://cdn.stays.net/pool.jpg', '//cdn.stays.net/invalid.jpg'],
    host: { ...property.host, avatar: 'data:image/svg+xml,<svg/>' },
  });

  assert.deepEqual(sanitized.images, ['https://cdn.stays.net/cover.jpg']);
  assert.deepEqual(sanitized.complexImages, ['https://cdn.stays.net/pool.jpg']);
  assert.equal(sanitized.host.avatar, '');
  assert.equal(sanitized.title, property.title);
});
