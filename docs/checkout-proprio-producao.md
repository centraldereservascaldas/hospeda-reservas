# Checkout próprio em produção

O checkout próprio usa a Cielo para Pix e cartão e a Stays para a reserva e a confirmação. O checkout hospedado atual continua disponível enquanto as flags de venda direta estiverem desligadas.

## Configuração do serviço web no Coolify

- `APP_ENV=production` e `APP_DEBUG=false`.
- `DIRECT_BOOKING_PAYMENT_PROVIDER=cielo` e `CIELO_DIRECT_ENVIRONMENT=production`.
- `CIELO_DIRECT_PRODUCTION_ENABLED=true`, `CIELO_DIRECT_PRODUCTION_SOP_ENABLED=true` e `CIELO_DIRECT_PRODUCTION_PIX_ENABLED=true`.
- `CIELO_DIRECT_PRODUCTION_NOTIFICATION_MODE=polling` e `DIRECT_BOOKING_PAYMENT_RECONCILIATION_INTERVAL_SECONDS` entre 60 e 300.
- Manter `CIELO_MERCHANT_ID`, `CIELO_MERCHANT_KEY`, `CIELO_SOP_CLIENT_ID` e `CIELO_SOP_CLIENT_SECRET` no gerenciador de segredos. O checkout próprio usa esses valores quando os quatro `CIELO_DIRECT_PRODUCTION_*` correspondentes estiverem vazios. Se ambos os conjuntos existirem, os valores `CIELO_DIRECT_PRODUCTION_*` têm prioridade e devem pertencer ao mesmo merchant.
- Confirmar credenciais Stays, fonte de catálogo, termos aprovados, fila e scheduler no mesmo serviço. A reconciliação por polling depende do scheduler e do worker.

## Antes da primeira cobrança

1. Verificar a imagem e o banco do serviço `CRCN Hospeda Reservas`, backup recuperável, migrations e saúde do worker e scheduler.
2. Executar `php artisan direct-booking:check-readiness --json` no container. Todos os `checks` devem estar configurados.
3. Consultar `GET /api/checkout/readiness/LG02J` no domínio público. `termsAvailable` deve ser `true` antes de liberar venda. O endpoint reflete as flags atuais, então `ready` permanece `false` enquanto elas estiverem desligadas.
4. Confirmar a emissão de token SOP e uma consulta Cielo somente de leitura com as credenciais do serviço; isso não valida uma cobrança.
5. Definir o procedimento de atendimento para Pix pendente, cartão recusado e pagamento aprovado sem reserva `booked` na Stays. Validar no primeiro pedido controlado o total, a confirmação, o lançamento financeiro e a comunicação ao hóspede.

Ativar `DIRECT_BOOKING_ENABLED`, `DIRECT_BOOKING_PAYMENTS_ENABLED`, `DIRECT_BOOKING_CONFIRMATION_ENABLED` e `DIRECT_BOOKING_LIVE_PAYMENTS_ENABLED` somente depois dessas verificações. Essas quatro flags, junto com as credenciais e o ambiente de produção, permitem cobranças reais. Manter `PARK_TICKETS_PREVIEW_ENABLED=false`.
