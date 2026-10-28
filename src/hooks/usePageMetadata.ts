import { useEffect, useRef, useState } from 'react';
import { getAccommodationIdFromPath } from '../utils/searchUrlState';

const GENERIC_TITLE = 'Central de Reservas Caldas Novas - Hospedagens e Parques Termais';
const GENERIC_DESCRIPTION =
  'Central de Reservas Caldas Novas oficial. Encontre os melhores resorts, flats, condomínios com águas termais 24h e ingressos para parques aquáticos em Caldas Novas e Rio Quente.';
const CHECKOUT_TITLE = 'Acompanhe seu pedido | CRCN';
const CLIENT_NAVIGATION_EVENT = 'crcn:navigation';

interface ApprovedPropertyMetadata {
  approved: true;
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string | null;
}

function setMeta(attribute: 'name' | 'property', value: string, content: string | null): void {
  const selector = `meta[${attribute}="${value}"]`;
  document.head.querySelectorAll(selector).forEach((element) => element.remove());
  if (content === null) return;

  const meta = document.createElement('meta');
  meta.setAttribute(attribute, value);
  meta.content = content;
  document.head.append(meta);
}

function setCanonical(href: string | null): void {
  document.head.querySelectorAll('link[rel="canonical"]').forEach((element) => element.remove());
  if (href === null) return;

  const canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = href;
  document.head.append(canonical);
}

function applyMetadata({
  title,
  description,
  canonicalUrl,
  imageUrl,
  noindex,
}: {
  title: string;
  description: string;
  canonicalUrl: string | null;
  imageUrl: string | null;
  noindex: boolean;
}): void {
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', canonicalUrl);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:image', imageUrl);
  setMeta('name', 'twitter:card', imageUrl ? 'summary_large_image' : 'summary');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', imageUrl);
  setMeta('name', 'robots', noindex ? 'noindex, nofollow' : null);
  setCanonical(canonicalUrl);
}

function isNoindexPath(pathname: string): boolean {
  return Boolean(
    getAccommodationIdFromPath(pathname) || /^\/(?:checkout|reservar)(?:\/|$)/i.test(pathname),
  );
}

function isApprovedPropertyMetadata(
  value: unknown,
  propertyId: string,
): value is ApprovedPropertyMetadata {
  if (typeof value !== 'object' || value === null) return false;
  const metadata = value as Record<string, unknown>;
  if (!isSafeUrl(metadata.canonicalUrl, ['http:', 'https:'])) return false;
  const canonicalPath = new URL(metadata.canonicalUrl).pathname;
  return (
    metadata.approved === true &&
    typeof metadata.title === 'string' &&
    metadata.title.trim() !== '' &&
    typeof metadata.description === 'string' &&
    metadata.description.trim() !== '' &&
    canonicalPath === `/apartamento/${propertyId}` &&
    (typeof metadata.imageUrl === 'string' || metadata.imageUrl === null) &&
    (metadata.imageUrl === null || isSafeUrl(metadata.imageUrl, ['https:']))
  );
}

function hasServerCanonicalForProperty(propertyId: string): boolean {
  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) return false;

  try {
    return new URL(canonical.href, window.location.href).pathname === `/apartamento/${propertyId}`;
  } catch {
    return false;
  }
}

function isSafeUrl(value: unknown, protocols: string[]): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return protocols.includes(parsed.protocol) && parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

export function usePageMetadata(initialPathname: string): void {
  const [pathname, setPathname] = useState(initialPathname);
  const initialMetadataPathRef = useRef<string | null>(initialPathname);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    const updatePathname = () => {
      if (window.location.pathname !== initialMetadataPathRef.current) {
        initialMetadataPathRef.current = null;
      }
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', updatePathname);
    window.addEventListener(CLIENT_NAVIGATION_EVENT, updatePathname);
    return () => {
      window.removeEventListener('popstate', updatePathname);
      window.removeEventListener(CLIENT_NAVIGATION_EVENT, updatePathname);
    };
  }, []);

  useEffect(() => {
    const normalizedPathname = pathname.replace(/\/+$/, '') || '/';
    if (
      normalizedPathname === '/privacidade' ||
      normalizedPathname === '/termos' ||
      normalizedPathname === '/cancelamento'
    ) {
      return;
    }

    const propertyId = getAccommodationIdFromPath(pathname);
    const preserveInitialMetadata =
      propertyId !== null &&
      initialMetadataPathRef.current === pathname &&
      hasServerCanonicalForProperty(propertyId);
    const noindex = isNoindexPath(pathname);
    const requestSequence = ++requestSequenceRef.current;

    if (propertyId) {
      if (!preserveInitialMetadata) {
        applyMetadata({
          title: GENERIC_TITLE,
          description: GENERIC_DESCRIPTION,
          canonicalUrl: null,
          imageUrl: null,
          noindex: true,
        });
      }

      const controller = new AbortController();
      void fetch(`/api/public/property-metadata/${encodeURIComponent(propertyId)}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((metadata: unknown) => {
          if (requestSequence !== requestSequenceRef.current) return;
          if (initialMetadataPathRef.current === pathname) initialMetadataPathRef.current = null;
          if (!isApprovedPropertyMetadata(metadata, propertyId)) {
            applyMetadata({
              title: GENERIC_TITLE,
              description: GENERIC_DESCRIPTION,
              canonicalUrl: null,
              imageUrl: null,
              noindex: true,
            });
            return;
          }

          applyMetadata({
            title: metadata.title,
            description: metadata.description,
            canonicalUrl: metadata.canonicalUrl,
            imageUrl: metadata.imageUrl,
            noindex: false,
          });
        })
        .catch(() => {
          if (requestSequence !== requestSequenceRef.current) return;
          if (initialMetadataPathRef.current === pathname) initialMetadataPathRef.current = null;
          applyMetadata({
            title: GENERIC_TITLE,
            description: GENERIC_DESCRIPTION,
            canonicalUrl: null,
            imageUrl: null,
            noindex: true,
          });
        });

      return () => controller.abort();
    }

    applyMetadata({
      title: pathname.startsWith('/checkout/') ? CHECKOUT_TITLE : GENERIC_TITLE,
      description: GENERIC_DESCRIPTION,
      canonicalUrl: null,
      imageUrl: null,
      noindex,
    });

    return undefined;
  }, [pathname]);
}

export const PAGE_METADATA_NAVIGATION_EVENT = CLIENT_NAVIGATION_EVENT;
