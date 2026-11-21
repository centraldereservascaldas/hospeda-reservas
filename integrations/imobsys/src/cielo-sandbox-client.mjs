// Sandbox-only prototype. The destination is fixed and cannot be configured.
const ORIGIN='https://apisandbox.cieloecommerce.cielo.com.br';
const QUERY_ORIGIN='https://apiquerysandbox.cieloecommerce.cielo.com.br';

export function createCieloSandboxClient({merchantId, merchantKey, fetchImpl=fetch}) {
  if (typeof merchantId !== 'string' || !/^[a-f0-9-]{36}$/i.test(merchantId) || typeof merchantKey !== 'string' || !merchantKey.trim()) throw new Error('Credenciais sandbox necessárias.');
  async function post(payload) {
    const response=await fetchImpl(`${ORIGIN}/1/sales/`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','MerchantId':merchantId,'MerchantKey':merchantKey},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Cielo sandbox não confirmou a solicitação; consultar antes de repetir.');
    const body=await response.json();
    if (!body || typeof body !== 'object' || !body.Payment || typeof body.Payment !== 'object') throw new Error('Resposta sandbox inválida; consultar antes de repetir.');
    return body;
  }
  return {
    async findPayment(paymentId) {
      if (!/^[a-f0-9-]{36}$/i.test(paymentId||'')) throw new Error('Identificador de pagamento inválido.');
      const response=await fetchImpl(`${QUERY_ORIGIN}/1/sales/${encodeURIComponent(paymentId)}`,{method:'GET',redirect:'error',headers:{'MerchantId':merchantId,'MerchantKey':merchantKey},signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('Não foi possível consultar o pagamento sandbox.');
      const body=await response.json();
      if (!body || typeof body!=='object' || !body.Payment || typeof body.Payment!=='object') throw new Error('Resposta sandbox inválida.');
      return body;
    },
    async createPix({merchantOrderId,amountCents,customerName,customerIdentity,expirationSeconds=1800}) {
      if (!/^[a-z0-9]{1,25}$/i.test(merchantOrderId) || !Number.isSafeInteger(amountCents) || amountCents<1 || !customerName?.trim() || !/^\d{11}$/.test(customerIdentity||'') || !Number.isInteger(expirationSeconds) || expirationSeconds<60 || expirationSeconds>86400) throw new Error('Dados Pix inválidos.');
      return post({MerchantOrderId:merchantOrderId,Customer:{Name:customerName.trim(),Identity:customerIdentity,IdentityType:'CPF'},Payment:{Type:'Pix',Amount:amountCents,Currency:'BRL',QrCode:{Expiration:expirationSeconds}}});
    },
    async createCard({merchantOrderId,amountCents,customerName,customerIdentity,paymentToken,installments}) {
      if (!/^[a-z0-9]{1,25}$/i.test(merchantOrderId) || !Number.isSafeInteger(amountCents) || amountCents<1 || typeof customerName!=='string' || !customerName.trim() || !/^\d{11}$/.test(customerIdentity||'') || !/^[a-f0-9-]{36}$/i.test(paymentToken||'') || !Number.isInteger(installments) || installments<1 || installments>6 || Math.floor(amountCents/installments)<500) throw new Error('Dados de cartão inválidos.');
      return post({MerchantOrderId:merchantOrderId,Customer:{Name:customerName.trim(),Identity:customerIdentity},Payment:{Type:'CreditCard',Amount:amountCents,Currency:'BRL',Capture:true,Installments:installments,Interest:'ByMerchant',Provider:'Simulado',CreditCard:{PaymentToken:paymentToken}}});
    },
  };
}
