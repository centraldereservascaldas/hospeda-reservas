import { RefObject, useEffect, useRef } from 'react';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const openDialogs: HTMLElement[] = [];

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    const style = window.getComputedStyle(element);
    return !element.hidden && style.visibility !== 'hidden' && style.display !== 'none' && element.tabIndex >= 0;
  });
}

interface DialogFocusOptions {
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnEscape?: boolean;
}

/** Keeps keyboard focus inside the active dialog and returns it to its opener. */
export function useDialogFocus(
  isOpen: boolean,
  onClose: () => void,
  options: DialogFocusOptions = {},
): RefObject<HTMLDivElement | null> {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialFocusRef = options.initialFocusRef;
  const closeOnEscape = options.closeOnEscape ?? true;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openDialogs.push(dialog);
    const initialFocus = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
    initialFocus.focus();

    const isTopDialog = () => openDialogs[openDialogs.length - 1] === dialog;
    const hasNestedDialog = () => !!dialog.querySelector('[role="dialog"][aria-modal="true"]');
    const isInAnotherDialog = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('[role="dialog"][aria-modal="true"]:not([data-dialog-focus-root])');

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog() || isInAnotherDialog(event.target)) return;
      if (event.key === 'Escape' && closeOnEscape) {
        if (hasNestedDialog()) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isTopDialog() || dialog.contains(event.target as Node) || isInAnotherDialog(event.target)) return;
      (focusableElements(dialog)[0] ?? dialog).focus();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      const index = openDialogs.lastIndexOf(dialog);
      if (index !== -1) openDialogs.splice(index, 1);
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen, initialFocusRef, closeOnEscape]);

  return dialogRef;
}
