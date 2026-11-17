import { ChevronDown } from 'lucide-react';

const summaryClass =
  'flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 [&::-webkit-details-marker]:hidden';

export function ExistingReservationConditions() {
  return (
    <section
      className="mt-6 border-t border-neutral-200 pt-5"
      aria-labelledby="reservation-conditions-title"
    >
      <h2 id="reservation-conditions-title" className="text-lg font-bold">
        Antes de pagar
      </h2>
      <p className="mt-1 text-sm leading-6 text-neutral-600">
        Clique para consultar as informações desta reserva.
      </p>
      <div className="mt-3 space-y-2">
        <details className="group rounded-xl border border-neutral-300/80 bg-white/60">
          <summary className={summaryClass}>
            Condições de pagamento
            <ChevronDown size={18} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
          </summary>
          <div className="space-y-2 px-4 pb-4 text-sm leading-6 text-neutral-600">
            <p>
              Este checkout é para pagar o saldo da reserva existente. Confira o valor a pagar e os
              dados da hospedagem antes de continuar.
            </p>
            <p>
              No Pix, não há acréscimo. No cartão, confira a quantidade de parcelas, o valor de cada
              parcela, o acréscimo e o total final exibidos antes de confirmar.
            </p>
            <p>
              Gerar um Pix não significa que ele foi pago. Aguarde a confirmação do pagamento na
              página de acompanhamento.
            </p>
          </div>
        </details>
        <details className="group rounded-xl border border-neutral-300/80 bg-white/60">
          <summary className={summaryClass}>
            Cancelamento, alterações e reembolso
            <ChevronDown size={18} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
          </summary>
          <div className="space-y-2 px-4 pb-4 text-sm leading-6 text-neutral-600">
            <p>
              Consulte os prazos, as condições de cancelamento e eventuais valores retidos na
              confirmação original da sua reserva na Booking.com.
            </p>
            <p>
              O pagamento por esta página não altera as condições contratadas. Para solicitar uma
              alteração, cancelamento ou reembolso, fale com nosso atendimento. A solicitação
              precisa ser analisada; ela não confirma um cancelamento ou estorno.
            </p>
          </div>
        </details>
        <details className="group rounded-xl border border-neutral-300/80 bg-white/60">
          <summary className={summaryClass}>
            Regras e detalhes da hospedagem
            <ChevronDown size={18} aria-hidden="true" className="shrink-0 group-open:rotate-180" />
          </summary>
          <div className="space-y-2 px-4 pb-4 text-sm leading-6 text-neutral-600">
            <p>
              Confira apartamento, datas e número de hóspedes no resumo desta página. Horários de
              entrada e saída, documentos necessários e regras do condomínio devem ser consultados
              na confirmação original e nas orientações da hospedagem.
            </p>
            <p>
              Se encontrar alguma diferença ou tiver dúvidas sobre as condições, use o botão de
              WhatsApp abaixo antes de pagar.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
