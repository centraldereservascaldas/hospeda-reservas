# ADR 0002 — Acesso direto e seguro ao checkout de reserva existente

**Estado:** aceito; implementação em andamento. **Data:** 28/11/2026. **Escopo:** retomada e pagamento de saldo de reservas já registradas na Stays. **Relacionado:** [ADR 0001](0001-checkout-proprio-e-informacoes-em-camadas.md).

## Contexto

O titular compartilha `/checkout/{codigoDaReserva}` para pagar uma reserva da Stays em pré-reserva. A jornada atual exige login, o que impede o cliente de abrir o checkout diretamente. O usuário esclareceu que deseja somente o código curto da reserva, sem conta, autenticação adicional ou envio de e-mail.

## Decisão

1. `/checkout/{codigoDaReserva}` abre diretamente, sem login e sem registro, usando somente o código curto de cinco caracteres da Stays.
2. O sistema exibe o link curto para novas pré-reservas (`type=reserved`). O backend consulta a Stays em cada resumo e criação de checkout. Um link já compartilhado pode continuar o pagamento quando a Stays promover a reserva a `booked`, desde que exista saldo positivo confirmado e verificável. Reservas pagas, canceladas ou em outro estado não liberam cobrança.
3. O checkout mostra apenas o necessário para pagar. A consulta de saldo usa total e pagamentos registrados na Stays; se o total for positivo, o pago for zero e não existir crédito/recebível, oferece quitação de 100% ou entrada Pix de 50%. Depois de uma entrada conciliada, o mesmo link pode oferecer apenas o saldo restante verificado.
4. Cada pagamento deve lançar/conciliar somente o valor capturado como pagamento na Stays. O total da reserva permanece inalterado, o valor pago é acumulado e o saldo restante é recalculado pela Stays após a conferência do pagamento.
5. O código curto é a única informação usada no endereço de acesso. A rota aplica limites de requisição, ausência de cache e validação do saldo no servidor. Respostas nunca devem incluir dados de contato do hóspede.
6. A ativação dessas rotas e do plano de entrada é independente da criação de novas reservas e das flags de cobrança real em produção. Este ADR não declara credenciais Cielo, configuração Stays ou ambiente de produção prontos.

## Consequências

- A rota pública depende de proteção contra enumeração e abuso; aplicar limites de requisição e respostas sem cache.
- Nenhum e-mail é disparado nessa jornada.
- O checkout atual pode existir em produção enquanto as flags globais `DIRECT_BOOKING_ENABLED`, `DIRECT_BOOKING_PAYMENTS_ENABLED`, `DIRECT_BOOKING_CONFIRMATION_ENABLED` e `DIRECT_BOOKING_LIVE_PAYMENTS_ENABLED` permanecem conforme operação aprovada.
- A baixa da entrada exige auditoria do ledger, idempotência por ciclo e prova posterior de que o total original não mudou e o saldo diminuiu pelo valor pago.

## Alternativas consideradas

| Alternativa | Decisão |
| --- | --- |
| Exigir conta Supabase e login do titular | Rejeitada para esta jornada. Impedia o pagamento pelo link enviado ao cliente. |
| Enviar link adicional por e-mail | Rejeitada. O cliente deve receber e usar somente o código curto da reserva. |
| Exigir reserva `reserved` para cada pagamento pelo mesmo link | Rejeitada porque a Stays pode promover a reserva a `booked` após uma entrada conciliada, antes da quitação do saldo. |

## Critérios para considerar a decisão implementada

- Abrir `/checkout/RO21J` sem sessão apresenta checkout se a consulta Stays retornar a reserva `RO21J` como `reserved`; após entrada conciliada, o mesmo link pode oferecer somente o saldo residual verificado.
- Código inexistente, reserva cancelada ou saldo não verificável não inicia cobrança. Uma reserva `booked` sem valor pago confirmado também não libera uma cobrança inicial.
- Com total positivo, pago zero e nenhum recebível existente, são mostradas opções de 100% e entrada Pix de 50%.
- Após pagar a entrada, o total Stays continua igual; o valor pago é acumulado e o saldo restante pode ser pago pelo mesmo link.
- Revisar limites de requisição, idempotência, valores e logs antes da ativação de produção.
