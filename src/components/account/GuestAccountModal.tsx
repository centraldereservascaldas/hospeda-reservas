import React, { useEffect, useRef, useState } from 'react';
import { X, LogIn, UserPlus, ShieldCheck, ArrowLeft } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../../services/supabase';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { useDialogFocus } from '../useDialogFocus';

interface GuestAccountModalProps {
  isOpen: boolean;
  initialMode: 'login' | 'signup' | 'recovery';
  onClose: () => void;
}

export const GuestAccountModal: React.FC<GuestAccountModalProps> = ({ isOpen, initialMode, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus(isOpen, onClose, { initialFocusRef: closeButtonRef });
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'recovery'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [recoveryComplete, setRecoveryComplete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setError('');
    setMessage('');
    setRecoveryComplete(false);
    setPassword('');
  }, [isOpen, initialMode]);

  const syncSession = async (activeSession: Session) => {
    setSession(activeSession);
    setEmail(activeSession.user.email || '');
    setFullName(String(activeSession.user.user_metadata?.full_name || activeSession.user.user_metadata?.name || ''));
    setSyncing(true);
    setSynced(false);
    setError('');
    try {
      const result = await crcnBackendApi.syncStaysGuest(activeSession.access_token);
      if (!result?.success) throw new Error(result?.message || 'Não foi possível sincronizar seu cadastro com o sistema de reservas.');
      setSynced(true);
      setMessage('Sua conta está conectada e sincronizada. Você já pode fechar esta janela e continuar usando o site.');
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : 'Não foi possível sincronizar seu cadastro.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !supabase) return;
    let cancelled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, activeSession) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery');
        setSession(activeSession);
        setError('');
        setMessage('');
        return;
      }
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setSynced(false);
        setSyncing(false);
        setFullName('');
        setEmail('');
        setPassword('');
        setMode('login');
        setError('');
        setMessage('');
        return;
      }
      if (!activeSession || (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION')) return;
      if (activeSession.user.email_confirmed_at) void syncSession(activeSession);
    });
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return;
      if (sessionError) setError('Não foi possível recuperar sua sessão. Entre novamente.');
      else if (data.session?.user.email_confirmed_at) void syncSession(data.session);
      else {
        setSession(null);
        setSynced(false);
        setSyncing(false);
        setFullName('');
        setEmail('');
        setPassword('');
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !session || !synced || syncing || error) return;
    const closeTimer = window.setTimeout(onClose, 3000);
    return () => window.clearTimeout(closeTimer);
  }, [isOpen, session, synced, syncing, error, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      setError('O serviço de login ainda não está configurado neste site.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === 'forgot') {
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/`,
        });
        if (recoveryError) throw recoveryError;
        setMessage('Se houver uma conta com esse e-mail, enviaremos um link para redefinir a senha. Confira também a pasta de spam.');
      } else if (mode === 'recovery') {
        if (password.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword('');
        setRecoveryComplete(true);
        setMessage('Senha alterada com sucesso. Você já pode continuar usando sua conta.');
      } else if (mode === 'signup') {
        if (fullName.trim().split(/\s+/).filter(Boolean).length < 2) throw new Error('Informe seu nome completo.');
        if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
        localStorage.setItem('hospeda_pending_email_confirmation', 'true');
        const { data, error: signupError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (signupError) throw signupError;
        if (!data.session) {
          setPassword('');
          setMessage('Enviamos um link de confirmação para seu e-mail. Abra-o e volte a esta página para entrar.');
          return;
        }
        await syncSession(data.session);
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (loginError) throw loginError;
        if (!data.session) throw new Error('Não foi possível iniciar sua sessão.');
        await syncSession(data.session);
      }
      setPassword('');
    } catch (submitError) {
      if (mode === 'signup') localStorage.removeItem('hospeda_pending_email_confirmation');
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível acessar sua conta.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    const { error: signOutError } = await supabase?.auth.signOut() || {};
    if (signOutError) {
      setError('Não foi possível encerrar a sessão. Tente novamente.');
      return;
    }
    setSession(null);
    setSynced(false);
    setSyncing(false);
    setFullName('');
    setEmail('');
    setPassword('');
    setMode('login');
    setError('');
    setMessage('');
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-slate-900/10 px-4 py-8 backdrop-blur-[3px]">
      <section ref={dialogRef} data-dialog-focus-root tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="guest-account-title" className="liquid-glass-card my-auto w-full max-w-md overflow-hidden rounded-3xl border border-white/80 !bg-white/55 shadow-[0_24px_80px_-20px_rgba(15,23,42,0.3)] backdrop-blur-2xl">
        <div className="liquid-glass-accent flex items-center justify-between border-b border-white/40 px-6 py-5 text-white">
          <div>
            <p className="text-xs font-semibold text-white/85">Central de Reservas Caldas Novas</p>
            <h2 id="guest-account-title" className="mt-1 text-xl font-black">Minha conta</h2>
          </div>
          <button ref={closeButtonRef} type="button" aria-label="Fechar janela da conta" onClick={onClose} className="rounded-full border border-white/50 bg-white/15 p-2 transition hover:bg-white/25"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-5 bg-white/35 p-6 backdrop-blur-xl">
          {!supabaseConfigured ? (
            <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">O serviço de login ainda não está configurado.</p>
          ) : mode === 'recovery' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-neutral-600">Digite sua nova senha para concluir a recuperação da conta.</p>
              {!recoveryComplete && <div><label htmlFor="account-modal-password" className="mb-1.5 block text-sm font-semibold text-neutral-700">Nova senha</label><input id="account-modal-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-white/90 bg-white/90 px-4 py-3 text-sm text-neutral-950 shadow-[inset_0_1px_3px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.05)] outline-none backdrop-blur-md transition placeholder:text-neutral-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25" /><p className="mt-1.5 text-xs text-neutral-500">Use pelo menos 8 caracteres.</p></div>}
              {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
              {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">{message}</p>}
              {recoveryComplete ? <button type="button" onClick={onClose} className="liquid-glass-accent w-full rounded-xl px-4 py-3.5 text-sm font-extrabold text-white">Concluir</button> : <button type="submit" disabled={busy} className="liquid-glass-accent w-full rounded-xl px-4 py-3.5 text-sm font-extrabold text-white disabled:opacity-60">{busy ? 'Salvando…' : 'Alterar senha'}</button>}
            </form>
          ) : session ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-900"><ShieldCheck className="h-5 w-5" /> Conta conectada</div>
                <p className="mt-2 font-bold text-neutral-900">{fullName || 'Hóspede'}</p>
                <p className="text-sm text-neutral-600">{email}</p>
                <p role="status" className="mt-3 text-xs text-emerald-900">{syncing ? 'Sincronizando seu cadastro…' : synced ? 'Cadastro sincronizado com o sistema de reservas.' : 'Sessão ativa.'}</p>
              </div>
              {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => void handleSignOut()} className="text-sm font-bold text-neutral-600 underline underline-offset-4 hover:text-neutral-900">Sair da conta</button>
                {synced && !syncing && <span role="status" className="text-xs font-medium text-neutral-500">Fechando automaticamente…</span>}
              </div>
            </div>
          ) : (
            <>
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/75 bg-white/30 p-1.5 text-sm font-bold shadow-inner backdrop-blur-xl">
                <button type="button" onClick={() => { setMode('login'); setError(''); setMessage(''); }} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 transition ${mode === 'login' ? 'bg-white text-orange-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}><LogIn className="h-4 w-4" /> Entrar</button>
                <button type="button" onClick={() => { setMode('signup'); setError(''); setMessage(''); }} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 transition ${mode === 'signup' ? 'bg-white text-orange-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}><UserPlus className="h-4 w-4" /> Criar conta</button>
              </div>
              {mode === 'forgot' && <button type="button" onClick={() => { setMode('login'); setError(''); setMessage(''); }} className="flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-orange-700"><ArrowLeft className="h-4 w-4" /> Voltar para entrar</button>}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && <div><label htmlFor="account-modal-name" className="mb-1.5 block text-sm font-semibold text-neutral-700">Nome completo</label><input id="account-modal-name" autoComplete="name" required minLength={3} value={fullName} onChange={(event) => setFullName(event.target.value)} className="w-full rounded-xl border border-white/90 bg-white/90 px-4 py-3 text-sm text-neutral-950 shadow-[inset_0_1px_3px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.05)] outline-none backdrop-blur-md transition placeholder:text-neutral-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25" /></div>}
                <div><label htmlFor="account-modal-email" className="mb-1.5 block text-sm font-semibold text-neutral-700">E-mail</label><input id="account-modal-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-white/90 bg-white/90 px-4 py-3 text-sm text-neutral-950 shadow-[inset_0_1px_3px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.05)] outline-none backdrop-blur-md transition placeholder:text-neutral-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25" /></div>
                {mode !== 'forgot' && <div><label htmlFor="account-modal-password" className="mb-1.5 block text-sm font-semibold text-neutral-700">Senha</label><input id="account-modal-password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : 1} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-white/90 bg-white/90 px-4 py-3 text-sm text-neutral-950 shadow-[inset_0_1px_3px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.05)] outline-none backdrop-blur-md transition placeholder:text-neutral-500 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25" />{mode === 'signup' && <p className="mt-1.5 text-xs text-neutral-500">Use pelo menos 8 caracteres.</p>}</div>}
                {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
                {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">{message}</p>}
                <button type="submit" disabled={busy} className="liquid-glass-accent w-full rounded-xl px-4 py-3.5 text-sm font-extrabold text-white transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60">{busy ? 'Aguarde…' : mode === 'signup' ? 'Criar conta' : mode === 'forgot' ? 'Enviar link de recuperação' : 'Entrar'}</button>
              </form>
              {mode === 'login' && <button type="button" onClick={() => { setMode('forgot'); setError(''); setMessage(''); }} className="w-full text-center text-sm font-semibold text-orange-700 underline underline-offset-4 hover:text-orange-900">Esqueci minha senha</button>}
              <p className="text-center text-xs text-neutral-500">Sua senha é protegida e não é enviada ao sistema de reservas.</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
