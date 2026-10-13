import React from 'react';

interface AuthCallbackNoticeProps {
  message: string;
  isError: boolean;
  onDismiss: () => void;
}

export const AuthCallbackNotice: React.FC<AuthCallbackNoticeProps> = ({
  message,
  isError,
  onDismiss,
}) => (
  <div
    role={isError ? 'alert' : 'status'}
    aria-live="polite"
    className={`fixed left-1/2 top-24 z-[120] flex w-[min(92vw,560px)] -translate-x-1/2 items-start gap-3 rounded-2xl border bg-white/95 px-5 py-4 text-sm font-semibold shadow-xl backdrop-blur-xl ${isError ? 'border-red-200 text-red-900' : 'border-emerald-200 text-emerald-900'}`}
  >
    <span className="flex-1">{message}</span>
    <button
      type="button"
      aria-label="Fechar aviso"
      onClick={onDismiss}
      className="-mt-1 rounded-full px-2 py-1 text-lg leading-none text-emerald-800 hover:bg-emerald-100"
    >
      ×
    </button>
  </div>
);
