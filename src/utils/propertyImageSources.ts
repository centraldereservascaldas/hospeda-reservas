export const CATALOG_IMAGE_SIZES =
  '(min-width: 1280px) 266px, (min-width: 1024px) calc((100vw - 216px) / 4), (min-width: 768px) calc((100vw - 156px) / 3), (min-width: 640px) calc((100vw - 112px) / 2), calc(100vw - 48px)';

export const COLLECTION_IMAGE_SIZES =
  '(min-width: 1280px) 234px, (min-width: 1024px) calc((100vw - 112px) / 5), (min-width: 640px) calc((100vw - 60px) / 2), min(72vw, 272px)';

interface PropertyImageSources {
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
}

export function getPropertyCardImageSources(src: string, sizes: string): PropertyImageSources {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return { src };
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'crcn.stays.net' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !/^\/image\/[a-f0-9]{24}$/.test(url.pathname)
  ) {
    return { src };
  }
  const variant = (width: number) => {
    const image = new URL(url);
    image.searchParams.set('width', String(width));
    image.searchParams.set('height', String((width * 3) / 4));
    return image.toString();
  };
  return {
    src: variant(640),
    srcSet: [320, 480, 640, 960, 1280].map((width) => `${variant(width)} ${width}w`).join(', '),
    sizes,
    width: 640,
    height: 480,
  };
}
