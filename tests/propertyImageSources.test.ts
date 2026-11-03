import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CATALOG_IMAGE_SIZES,
  getPropertyCardImageSources,
} from '../src/utils/propertyImageSources.ts';

const image = 'https://crcn.stays.net/image/6a356fe93db977efbea5a948';

test('offers verified Stays image variants while reserving the card aspect ratio', () => {
  const attrs = getPropertyCardImageSources(image, CATALOG_IMAGE_SIZES);
  assert.equal(attrs.src, `${image}?width=640&height=480`);
  assert.match(attrs.srcSet || '', /width=320&height=240 320w/);
  assert.match(attrs.srcSet || '', /width=1280&height=960 1280w/);
  assert.equal(attrs.sizes, CATALOG_IMAGE_SIZES);
  assert.equal(attrs.width! / attrs.height!, 4 / 3);
});

test('preserves other providers and signed or non-standard URLs without inventing transformations', () => {
  for (const src of [
    'https://images.example.test/apartment.jpg',
    `${image}?signature=preserve`,
    'https://crcn.stays.net.evil.example/image/6a356fe93db977efbea5a948',
    'https://user:password@crcn.stays.net/image/6a356fe93db977efbea5a948',
    'https://crcn.stays.net/image/6a356fe93db977efbea5a948/custom-photo.jpg',
    '',
  ])
    assert.deepEqual(getPropertyCardImageSources(src, CATALOG_IMAGE_SIZES), { src });
});
