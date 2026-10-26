import React, { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { supabase } from '../../services/supabase';

export const RecoveryLinkConfirmationPage: React.FC = () => {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get('token_hash');
  const isRecoveryLink = params.get('type') === 'recovery';
  const legacyRecoveryHash = new URLSearchParams(window.location.hash.slice(1));
  const hasLegacyRecoverySession = legacyRecoveryHash.get('type') === 'recovery';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasLegacyRecoverySession || !supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (data.session && !sessionError) {
        window.location.replace(`${window.location.origin}/#type=recovery`);
      } else {
        setError('Este link expirou ou já foi usado. Solicite um novo e-mail e abra o link mais recente.');
      }
    });
    return () => {
      active = false;
    };
  }, [hasLegacyRecoverySession]);

  const handleContinue = async () => {
    if (!supabase || !tokenHash || !isRecoveryLink) {
      setError('Este link não é válido. Solicite um novo e-mail de recuperação.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const { error: verificationError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });
      if (verificationError) throw verificationError;
      window.location.replace(`${window.location.origin}/#type=recovery`);
    } catch {
      setError('Este link expirou ou já foi usado. Solicite um novo e-mail e abra o link mais recente.');
      setBusy(false);
    }
  };

  const hasValidLink = Boolean((tokenHash && isRecoveryLink) || hasLegacyRecoverySession);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f4ee] px-4 py-10 text-neutral-900">
      <section className="w-full max-w-md rounded-3xl border border-white/80 bg-white/85 p-7 text-center shadow-[0_24px_80px_-24px_rgba(15,23,42,0.28)] backdrop-blur-2xl sm:p-9">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 text-orange-700">
          <ShieldCheck className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mt-5 text-sm font-semibold text-orange-700">Central de Reservas Caldas Novas</p>
        <h1 className="mt-2 text-2xl font-black">Redefinir senha</h1>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>
        ) : (
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            {hasLegacyRecoverySession
              ? 'A confirmação foi concluída. Abrindo a tela para escolher uma nova senha…'
              : hasValidLink
              ? 'Clique abaixo para confirmar que foi você quem pediu a troca de senha.'
              : 'Este link não está completo. Solicite um novo e-mail de recuperação.'}
          </p>
        )}

        {hasValidLink && !hasLegacyRecoverySession && !error && (
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={busy}
            className="liquid-glass-accent mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-extrabold text-white disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Verificando…' : 'Continuar para redefinir senha'}
            {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}

        <a href="/" className="mt-5 inline-block text-sm font-semibold text-neutral-600 underline underline-offset-4 hover:text-neutral-900">
          Voltar ao site
        </a>
      </section>
    </main>
  );
};
