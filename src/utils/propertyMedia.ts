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

export function isImobSysPhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      ((url.hostname === 'reservascrcn.com.br' &&
        /^\/fotos\/[^/]+\/imoveis\/[^/]+\/fotos\/[^/]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) ||
        (url.hostname === 'api-do-diogo.caldasindica.com' &&
          /^\/v1\/media\/[a-f0-9]{64}\.(?:jpg|png|webp)$/i.test(url.pathname)))
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
