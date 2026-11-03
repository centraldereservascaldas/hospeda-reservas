import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** Observe actual visibility, including clipping by horizontal scrolling parents. */
export function useDiscoveryVisibility(
  rootRef: RefObject<HTMLDivElement | null>,
  keys: string[],
): ReadonlySet<string> {
  const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let active = true;
    const allowed = new Set(keys);
    const targets = [...root.querySelectorAll<HTMLElement>('[data-discovery-query]')].filter(
      (element) => allowed.has(element.dataset.discoveryQuery ?? ''),
    );
    const threshold = (element: HTMLElement) =>
      element.dataset.discoveryQuery === 'catalog' ? 0.01 : 0.35;
    const update = (entries: Array<{ element: HTMLElement; ratio: number }>) => {
      if (!active) return;
      setVisible((previous) => {
        const next = new Set(previous);
        for (const entry of entries) {
          const key = entry.element.dataset.discoveryQuery!;
          if (entry.ratio > 0 && (previous.has(key) || entry.ratio >= threshold(entry.element)))
            next.add(key);
          else next.delete(key);
        }
        return next.size === previous.size && [...next].every((key) => previous.has(key))
          ? previous
          : next;
      });
    };

    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          update(
            entries.map((entry) => ({
              element: entry.target as HTMLElement,
              ratio: entry.isIntersecting ? entry.intersectionRatio : 0,
            })),
          );
        },
        { threshold: [0, 0.01, 0.35] },
      );
      targets.forEach((element) => observer.observe(element));
      return () => {
        active = false;
        observer.disconnect();
      };
    }

    let timer: number | undefined;
    const measure = () => {
      timer = undefined;
      update(
        targets.map((element) => {
          const rect = element.getBoundingClientRect();
          let left = Math.max(0, rect.left),
            right = Math.min(window.innerWidth, rect.right);
          let top = Math.max(0, rect.top),
            bottom = Math.min(window.innerHeight, rect.bottom);
          for (
            let parent = element.parentElement;
            parent && parent !== root;
            parent = parent.parentElement
          ) {
            const style = window.getComputedStyle(parent);
            const clip = parent.getBoundingClientRect();
            if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
              left = Math.max(left, clip.left);
              right = Math.min(right, clip.right);
            }
            if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
              top = Math.max(top, clip.top);
              bottom = Math.min(bottom, clip.bottom);
            }
          }
          const ratio =
            rect.width > 0 && rect.height > 0
              ? (Math.max(0, right - left) * Math.max(0, bottom - top)) / (rect.width * rect.height)
              : 0;
          return { element, ratio };
        }),
      );
    };
    const scheduleMeasure = () => {
      if (timer === undefined) timer = window.setTimeout(measure, 0);
    };
    measure();
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);
    root.addEventListener('scroll', scheduleMeasure, true);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      root.removeEventListener('scroll', scheduleMeasure, true);
    };
  }, [keys, rootRef]);

  return visible;
}
