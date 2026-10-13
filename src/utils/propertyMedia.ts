import type { Property } from '../types';

export function isSafeMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

export function sanitizePropertyMedia(property: Property): Property {
  return {
    ...property,
    images: property.images.filter(isSafeMediaUrl),
    ...(property.complexImages
      ? { complexImages: property.complexImages.filter(isSafeMediaUrl) }
      : {}),
    host: {
      ...property.host,
      avatar: isSafeMediaUrl(property.host.avatar) ? property.host.avatar : '',
    },
  };
}
