import { useEffect, useRef, useState, type FormEvent } from 'react';
import { crcnBackendApi } from '../../services/crcnBackendApi';
import { getCheckoutResumeToken } from '../../utils/checkoutResumeStorage';

interface CieloSopResult {
  PaymentToken?: string;
  Brand?: string;
  CardLast4Digits?: string;
}

interface CieloSopOptions {
  accessToken: string;
  environment: 'sandbox' | 'production';
  language: 'PT';
  enableBinQuery: false;
  enableVerifyCard: false;
  enableTokenize: false;
  cvvrequired: true;
  onSuccess: (result: CieloSopResult) => void;
  onError: () => void;
  onInvalid: () => void;
}

declare global {
  interface Window {
    bpSop_silentOrderPost?: (options: CieloSopOptions) => void;
  }
}

interface CieloSopCardFormProps {
  reference: string;
  amount: string;
  onAttemptFinished: () => void;
  previewOnly?: boolean;
}

const brands = [
  ['Visa', 'Visa'],
  ['Master', 'Mastercard'],
  ['Amex', 'American Express'],
  ['Elo', 'Elo'],
  ['Diners', 'Diners Club'],
  ['Discover', 'Discover'],
  ['JCB', 'JCB'],
] as const;

const scriptId = 'cielo-sop-script';

export function CieloSopCardForm({
  reference,
  amount,
  onAttemptFinished,
  previewOnly = false,
}: CieloSopCardFormProps) {
  const environmentRef = useRef<'sandbox' | 'production' | null>(null);
  const brandRef = useRef<HTMLSelectElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const installmentsRef = useRef<HTMLSelectElement>(null);
  const submittingRef = useRef(false);
  const [formStatus, setFormStatus] = useState<'loading' | 'ready' | 'error'>(previewOnly ? 'ready' : 'loading');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (previewOnly) return;

    let isCurrent = true;
    const resumeToken = getCheckoutResumeToken(reference);
    if (!resumeToken) {
      setFormStatus('error');
      return;
    }

    void crcnBackendApi.getCieloSopAccessToken(reference, resumeToken).then((credentials) => {
      if (!isCurrent || !credentials) {
        if (isCurrent) setFormStatus('error');
        return;
      }

      environmentRef.current = credentials.environment;
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = credentials.environment === 'production'
        ? 'https://transactionscus.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js'
        : 'https://transactionsandbox.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js';
      script.async = true;
      script.onload = () => {
        if (isCurrent) setFormStatus(typeof window.bpSop_silentOrderPost === 'function' ? 'ready' : 'error');
      };
      script.onerror = () => {
        if (isCurrent) setFormStatus('error');
      };
      document.head.append(script);
    });

    return () => {
      isCurrent = false;
      environmentRef.current = null;
      document.getElementById(scriptId)?.remove();
    };
  }, [previewOnly, reference]);

  const submitTokenizedPayment = async (result: CieloSopResult): Promise<void> => {
    const resumeToken = getCheckoutResumeToken(reference);
    const token = result.PaymentToken;
    const selectedBrand = brandRef.current?.value;
    const brand = result.Brand ? normalizeSopBrand(result.Brand) : selectedBrand;
    const cardholderName = nameRef.current?.value.trim();
    const cardholderEmail = emailRef.current?.value.trim();
    const installments = Number(installmentsRef.current?.value);

    if (!resumeToken || !token || !brand || !brands.some(([value]) => value === brand)
      || !cardholderName || !cardholderEmail || !Number.isInteger(installments)) {
      setSubmitError('Não foi possível validar o cartão. Confira os dados e tente novamente.');
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const response = await crcnBackendApi.createCheckoutPayment(reference, resumeToken, amount, {
        paymentMethod: 'card',
        paymentMethodId: brand,
        token,
        installments,
        cardholderName,
        cardholderEmail,
        idempotencyKey: crypto.randomUUID(),
      });
      if (response.kind === 'response' && response.success) return;
      setSubmitError(response.kind === 'response' ? response.message : 'Não foi possível processar o pagamento. Tente novamente.');
    } catch {
      setSubmitError('Não foi possível confirmar o resultado do pagamento. Atualize o pedido antes de tentar novamente.');
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
      onAttemptFinished();
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (previewOnly) return;
    if (submittingRef.current || formStatus !== 'ready' || !environmentRef.current) return;
    if (typeof window.bpSop_silentOrderPost !== 'function') {
      setFormStatus('error');
      setSubmitError('O formulário seguro da Cielo não está disponível. Atualize a página e tente novamente.');
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    const resumeToken = getCheckoutResumeToken(reference);
    const credentials = resumeToken
      ? await crcnBackendApi.getCieloSopAccessToken(reference, resumeToken)
      : null;
    if (!credentials || credentials.environment !== environmentRef.current) {
      submittingRef.current = false;
      setIsSubmitting(false);
      setSubmitError('Não foi possível preparar uma sessão segura da Cielo. Atualize a página e tente novamente.');
      return;
    }

    window.bpSop_silentOrderPost({
      accessToken: credentials.accessToken,
      environment: credentials.environment,
      language: 'PT',
      enableBinQuery: false,
      enableVerifyCard: false,
      enableTokenize: false,
      cvvrequired: true,
      onSuccess: (result) => { void submitTokenizedPayment(result); },
      onError: () => {
        submittingRef.current = false;
        setIsSubmitting(false);
        setSubmitError('A Cielo não conseguiu tokenizar o cartão. Confira os dados e tente novamente.');
      },
      onInvalid: () => {
        submittingRef.current = false;
        setIsSubmitting(false);
        setSubmitError('Confira o número, a validade e o código de segurança do cartão.');
      },
    });
  };

  return (
    <section className="space-y-4" aria-labelledby="checkout-card-title">
      {previewOnly && (
        <p className="rounded-xl border border-amber-300/80 bg-amber-50/65 px-4 py-3 text-sm font-semibold text-amber-950 shadow-sm backdrop-blur-xl" role="status">
          Prévia visual: não insira dados reais. Este formulário está desativado e não envia informações nem realiza cobranças.
        </p>
      )}
      <div>
        <h3 id="checkout-card-title" className="font-extrabold text-neutral-950">Pagamento com cartão</h3>
        <p className="mt-1 text-xs leading-5 text-neutral-600">A Cielo recebe os dados do cartão diretamente pelo SOP. O número e o código de segurança não passam pelo servidor da CRCN.</p>
      </div>
      {formStatus === 'loading' && <p role="status" className="text-sm text-neutral-600">Conectando ao formulário seguro da Cielo…</p>}
      {formStatus === 'error' && <p role="alert" className="text-sm text-rose-800">Não foi possível carregar o checkout seguro da Cielo. Atualize a página e tente novamente.</p>}
      <form className="space-y-3" onSubmit={(event) => { void handleSubmit(event); }}>
        <label className="block text-xs font-bold" htmlFor="cielo-card-holder">Nome do titular</label>
        <input ref={nameRef} id="cielo-card-holder" className="bp-sop-cardholdername liquid-glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 disabled:opacity-65" autoComplete="cc-name" required disabled={previewOnly} />
        <label className="block text-xs font-bold" htmlFor="cielo-card-number">Número do cartão</label>
        <input id="cielo-card-number" className="bp-sop-cardnumber liquid-glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 disabled:opacity-65" autoComplete="cc-number" inputMode="numeric" required disabled={previewOnly} />
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-bold" htmlFor="cielo-card-expiration">Validade</label><input id="cielo-card-expiration" className="bp-sop-cardexpirationdate liquid-glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 disabled:opacity-65" placeholder="MM/AAAA" autoComplete="cc-exp" required disabled={previewOnly} /></div>
          <div><label className="block text-xs font-bold" htmlFor="cielo-card-cvv">Código de segurança</label><input id="cielo-card-cvv" className="bp-sop-cardcvvc liquid-glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 disabled:opacity-65" autoComplete="cc-csc" inputMode="numeric" required disabled={previewOnly} /></div>
        </div>
        <input className="bp-sop-cardtype hidden" aria-hidden="true" tabIndex={-1} value="creditCard" readOnly />
        <label className="block text-xs font-bold" htmlFor="cielo-card-brand">Bandeira</label>
        <select ref={brandRef} id="cielo-card-brand" className="liquid-glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 disabled:opacity-65" required defaultValue="" disabled={previewOnly}><option value="" disabled>Selecione a bandeira</option>{brands.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label className="block text-xs font-bold" htmlFor="cielo-card-installments">Parcelas</label>
        <select ref={installmentsRef} id="cielo-card-installments" className="liquid-glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 disabled:opacity-65" required defaultValue="1" disabled={previewOnly}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}x</option>)}</select>
        <label className="block text-xs font-bold" htmlFor="cielo-card-email">E-mail do pedido</label>
        <input ref={emailRef} id="cielo-card-email" type="email" autoComplete="email" className="liquid-glass-input w-full rounded-xl px-3 py-2.5 text-sm outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 disabled:opacity-65" required disabled={previewOnly} />
        {submitError && <p role="alert" className="text-sm text-rose-800">{submitError}</p>}
        <button type="submit" disabled={previewOnly || formStatus !== 'ready' || isSubmitting} className="liquid-glass-accent w-full rounded-full px-5 py-3 text-sm font-bold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55">{previewOnly ? 'Pagamento desativado na prévia' : isSubmitting ? 'Processando com a Cielo…' : 'Pagar com cartão'}</button>
      </form>
    </section>
  );
}

function normalizeSopBrand(brand: string): string | null {
  const normalizedBrand = brand.trim().toLocaleLowerCase('pt-BR');
  const matchedBrand = brands.find(([value, label]) =>
    value.toLocaleLowerCase('pt-BR') === normalizedBrand
    || label.toLocaleLowerCase('pt-BR') === normalizedBrand,
  );

  if (matchedBrand) return matchedBrand[0];
  if (normalizedBrand === 'mastercard') return 'Master';
  if (normalizedBrand === 'american express') return 'Amex';
  if (normalizedBrand === 'jcb') return 'JCB';

  return null;
}
