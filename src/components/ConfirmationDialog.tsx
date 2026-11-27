import { useId, type ReactNode, type RefObject } from 'react';
import { Button } from './Button';
import { useDialogFocus } from './useDialogFocus';

export interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  isPending?: boolean;
  error?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onConfirm: () => void;
  onClose: () => void;
}

/** A focused decision dialog for consequential actions. The caller owns the action state. */
export function ConfirmationDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = 'Cancelar',
  isPending = false,
  error,
  returnFocusRef,
  onConfirm,
  onClose,
}: ConfirmationDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const dialogRef = useDialogFocus(isOpen, onClose, { returnFocusRef });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto bg-neutral-950/45 p-4 backdrop-blur-sm">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isPending || undefined}
        data-dialog-focus-root
        tabIndex={-1}
        className="my-auto w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-5 shadow-2xl outline-none sm:p-6"
      >
        <h2 id={titleId} className="text-lg font-extrabold text-neutral-950">
          {title}
        </h2>
        <div id={descriptionId} className="mt-2 text-sm leading-6 text-neutral-700">
          {description}
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-900"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            loading={isPending}
            loadingLabel={pendingLabel}
            aria-describedby={error ? errorId : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
