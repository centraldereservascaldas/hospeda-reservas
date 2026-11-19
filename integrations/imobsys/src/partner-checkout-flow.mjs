import { cardPricing } from './checkout-quote.mjs';
import { reconcileSandboxPayment } from './sandbox-reconciliation.mjs';

/** Isolated sandbox orchestration. Durable claim must precede every external mutation. */
export function createPartnerCheckoutFlow({quoteProvider,reservations,verifyReservation,cielo,sellerStore,operations,enabled=false}) {
  return {
    async start(input) {
      if(enabled!==true)throw Error('Integração desativada.');
      if(!input||!/^[A-Za-z0-9]{1,25}$/.test(input.id||'')||!['pix','card'].includes(input.method))throw Error('Pedido inválido.');
      const quote=await quoteProvider(input);
      if(quote.provider!=='imobsys-crcn'||!Number.isSafeInteger(quote.pix?.totalCents)||quote.pix.totalCents<1||quote.propertyId!==input.propertyId||quote.from!==input.from||quote.to!==input.to||quote.guests!==input.guests||quote.pix.totalCents!==input.acceptedBaseCents)throw Error('Cotação alterada ou divergente.');
      const amount=input.method==='pix'?quote.pix.totalCents:cardPricing(quote.pix.totalCents,input.installments).totalCents;
      const order={id:input.id,merchantOrderId:input.id,simulation:true,propertyId:quote.propertyId,from:quote.from,to:quote.to,guests:quote.guests,amountCents:amount,method:input.method};
      operations.claim(input.id,order);
      try {
        const reservation=await reservations.create(input.reservationInput);
        operations.advance(input.id,'reservation_returned',{reference:reservation.reference});
        const verified=await verifyReservation(reservation,quote);
        if(verified!==true)throw Error('Pré-reserva não conferida.');
        order.reservationReference=reservation.reference;
        operations.advance(input.id,'payment_starting',{reference:reservation.reference});
        const payment=input.method==='pix'
          ?await cielo.createPix({merchantOrderId:input.id,amountCents:amount,customerName:input.customer.name,customerIdentity:input.customer.cpf})
          :await cielo.createCard({merchantOrderId:input.id,amountCents:amount,customerName:input.customer.name,customerIdentity:input.customer.cpf,paymentToken:input.paymentToken,installments:input.installments});
        const paymentId=payment?.Payment?.PaymentId;
        if(typeof paymentId!=='string')throw Error('Identificador de pagamento não confirmado.');
        operations.advance(input.id,'payment_pending',{paymentId,order});
        if(payment.Payment.Status===2){await reconcileSandboxPayment({client:cielo,store:sellerStore,order,paymentId});operations.advance(input.id,'awaiting_seller_confirmation',{paymentId});}
        return {orderId:input.id,reservationReference:reservation.reference,paymentId,simulation:true,status:payment.Payment.Status===2?'awaiting_seller_confirmation':'payment_pending',qrCode:input.method==='pix'?payment.Payment.QrCodeString||null:null};
      }catch(error){operations.advance(input.id,'attention_required',{});throw error;}
    },
  };
}
