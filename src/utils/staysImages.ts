export type StaysImageListing = {
  _t_imagesMeta?: unknown;
  images?: unknown;
  photos?: unknown;
  imageList?: unknown;
  _t_images?: unknown;
  gallery?: unknown;
  _t_mainImageMeta?: unknown;
  mainImage?: unknown;
  _t_photosMeta?: unknown;
  _t_imageList?: unknown;
  _t_imagesList?: unknown;
  image?: unknown;
  coverImage?: unknown;
};

export function extractStaysImages(listing: StaysImageListing | null | undefined): string[] {
  if (!listing) return [];
  const urls: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value)) urls.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      const image = value as Record<string, unknown>;
      const candidate = image.url || image.src || image.href || image._t_url || image._t_mainImageMeta;
      if (candidate) visit(candidate);
      else if (image.path && typeof image.path === 'string' && /^https?:\/\//i.test(image.path)) visit(image.path);
    }
  };

  for (const field of ['_t_imagesMeta', 'images', 'photos', 'imageList', '_t_images', 'gallery', '_t_photosMeta', '_t_imageList', '_t_imagesList', 'image', 'coverImage'] as const) {
    visit(listing[field]);
  }
  visit(listing._t_mainImageMeta);
  visit(listing.mainImage);
  return [...new Set(urls)];
}

export function mergeStaysImageSources(...sources: Array<StaysImageListing | null | undefined>): string[] {
  return [...new Set(sources.flatMap(extractStaysImages))];
}
