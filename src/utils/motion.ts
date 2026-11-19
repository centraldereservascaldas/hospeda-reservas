export type MotionScrollTarget = Pick<Element, 'scrollIntoView'>;
type ScrollOptions = Omit<Parameters<MotionScrollTarget['scrollIntoView']>[0], 'behavior'>;

export function matchesMediaQuery(query: string): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') return window.matchMedia(query).matches;

  const maxWidth = query.match(/\(max-width:\s*(\d+)px\)/);
  if (maxWidth) return window.innerWidth <= Number(maxWidth[1]);

  const minWidth = query.match(/\(min-width:\s*(\d+)px\)/);
  if (minWidth) return window.innerWidth >= Number(minWidth[1]);

  return false;
}

export function scrollIntoViewRespectingMotion(
  target: MotionScrollTarget,
  options: ScrollOptions = {},
  prefersReducedMotion = typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
): void {
  target.scrollIntoView({ ...options, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
}
