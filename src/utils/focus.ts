type FocusableTarget = Pick<HTMLElement, 'focus'>;

export function focusWithoutScrolling(target: FocusableTarget | null): void {
  target?.focus({ preventScroll: true });
}
