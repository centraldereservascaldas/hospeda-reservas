/** Test-only: an independently queried captured payment is required before seller handoff. */
export async function reconcileSandboxPayment({client,store,order,paymentId}) {
  if (order?.simulation!==true || !['pix','card'].includes(order.method) || !/^[a-zA-Z0-9]{1,25}$/.test(order.merchantOrderId||'')) throw new Error('Pedido sandbox inválido.');
  const result=await client.findPayment(paymentId), payment=result.Payment;
  if (result.MerchantOrderId!==order.merchantOrderId || payment.PaymentId!==paymentId || payment.Status!==2 || payment.Amount!==order.amountCents || payment.Currency!=='BRL' || payment.Type!==(order.method==='pix'?'Pix':'CreditCard')) throw new Error('Pagamento sandbox ainda não confirmado ou divergente.');
  store.recordPaid({...order,paymentId,simulation:true,paymentVerified:true});
  return {status:'awaiting_seller_confirmation',simulation:true};
}
