export type MotionScrollTarget = Pick<Element, 'scrollIntoView'>;
type ScrollOptions = Omit<Parameters<MotionScrollTarget['scrollIntoView']>[0], 'behavior'>;

export function scrollIntoViewRespectingMotion(
  target: MotionScrollTarget,
  options: ScrollOptions = {},
  prefersReducedMotion = typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
): void {
  target.scrollIntoView({ ...options, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
}
