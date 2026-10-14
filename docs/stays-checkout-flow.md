# Stays quote and checkout flow

> Estado em 13/10/2026: o checkout hospedado da Stays foi removido da jornada. O modal mostra o resumo, consulta as condições aprovadas e mantém os campos e a compra desabilitados. O catálogo ainda não contém snapshots de condições aprovados, então `GET /api/checkout/terms/{listingId}` responde `503` e `POST /api/checkout` não avança no estado atual. As flags `DIRECT_BOOKING_ENABLED`, `DIRECT_BOOKING_PAYMENTS_ENABLED` e `DIRECT_BOOKING_CONFIRMATION_ENABLED` estão desligadas; prazo de retenção, tipo e provedor financeiro Stays também não estão configurados. Nenhuma cobrança real ou publicação foi feita. O plano de checkout próprio está em [MVP de vendas diretas](mvp-vendas-diretas.md).

Na API de reservas existentes, `reserved` é exposto como `pending`; não representa confirmação, não recebe método de pagamento presumido e não libera voucher. A nova rotina de checkout pode cancelar uma pré-reserva própria após expiração, mas isso depende de uma retenção Stays aprovada e configurada.

## Authoritative pricing

`POST /api/price` obtains a fresh Stays `booking/calculate-price` quote and normalizes it in `src/utils/staysPricing.ts`. Search results use the same normalizer. When Stays says `feesIncluded: true`, the nightly display is the full PMS total divided by nights; cleaning is shown only as an informational included amount. When fees are not included, non-cleaning charges (including the account-specific counter fee) are folded into the displayed nightly rate, while cleaning stays separate. The PMS final total remains authoritative in both cases. Fee labels other than cleaning are not exposed as separate rows. The live quote check on 2026-10-01 returned `feesIncluded: true` and a `Tarifa Balcão` fee for listing `LH20J`; the normalizer includes that amount in the displayed nightly rate without exposing its fee row.

With Stays credentials configured, a failed/invalid live quote (including a quote without an explicit `feesIncluded` flag) returns an error instead of presenting the local estimate as official. The local estimate remains available for catalog preview only and is not eligible for checkout.

## Checkout sequence

1. The detail view requires a live quote before allowing the guest to continue.
2. The checkout view carries the quote's nightly and fee-inclusion fields so its breakdown agrees with the detail view.
3. O contrato antigo de `/api/checkout` exigia autenticação e redirecionava para o checkout hospedado da Stays. Ele foi removido.
4. `GET /api/checkout/terms/{listingId}` entrega somente snapshot com versão aprovada no catálogo; na ausência dele, responde `503 checkout_conditions_unavailable`.
5. `POST /api/checkout` valida hóspede, datas, hóspedes, aceite/versionamento e `Idempotency-Key`; exige condições aprovadas, disponibilidade e preço revalidados na Stays. Divergência de total responde `409 quote_changed`.
6. Com as flags atuais, `POST /api/checkout` responde `503 checkout_disabled` antes de consultar a Stays ou gravar um pedido. Se for habilitado depois da aprovação comercial, tenta criar uma pré-reserva `reserved` somente com prazo interno configurado, persiste a ação de forma idempotente e verifica o resultado na Stays. Só responde `201 pre_reserved` após confirmar essa pré-reserva; falhas e resultados ambíguos ficam em atenção operacional.
7. A retomada `GET /api/checkout/{publicReference}` exige `X-Checkout-Resume-Token`, envia `Cache-Control: no-store, private` e não inclui PII. Ela retorna somente o resumo da tentativa mais recente; instruções Pix (QR e copia e cola) só são incluídas para tentativa pendente/em análise antes do vencimento. A consulta não inicia nova cobrança. O webhook do Mercado Pago valida assinatura, grava a notificação e agenda reconciliação que consulta o estado autoritativo no gateway. A rotina periódica também consulta tentativas com ID externo persistido para reparar notificações perdidas; ela roda mesmo sem novas cobranças habilitadas, mas exige token de acesso do gateway. A confirmação `booked` e o lançamento financeiro na Stays são protegidos por flags e configurações ainda desligadas.
8. Reutilizar a mesma chave de checkout com o mesmo conteúdo retoma o pedido; reutilizá-la com dados diferentes responde `409 idempotency_key_reused`. `reserved`, pagamento pendente ou pagamento aprovado sem confirmação da Stays nunca é apresentado como reserva confirmada.

Error responses incluem `checkout_disabled`, `checkout_conditions_unavailable`, `invalid_checkout_request`, `invalid_guest_count`, `quote_unavailable`, `availability_unavailable`, `dates_unavailable`, `quote_changed`, `reservation_hold_unconfigured` e estados de atenção operacional. A resposta segura de retomada não expõe dados pessoais.

## Configuration and integration limits

Set `STAYS_BASE_URL`, `STAYS_CLIENT_ID`, and `STAYS_CLIENT_SECRET` in the server environment. The base URL may be the account root or already include `/external/v1`; the backend normalizes either form. Credentials must never be placed in frontend code.

The checked-in demo catalog includes synthetic `STAYS-CN-*` listing identifiers that Stays rejects. At app startup, the catalog now refreshes through the backend and replaces that seed with the account's real active listing IDs. Direct links using a synthetic ID can still resolve to a demo detail, but cannot obtain a live quote or proceed to checkout. The account query on 2026-10-01 returned 58 active listings; it did not contain the advertised L'acqua Flat 204, so that property must be added/mapped in the Stays account before its deep link can be booked. No similarly named unit is substituted automatically.

The Stays hosted-checkout API documents a redirect URL, but this application currently has no verified Stays callback/webhook handler to reconcile a completed checkout into the site's local Trips view. Therefore local confirmation, payment status, voucher, and PMS reservation ID are intentionally not fabricated. Implementing that synchronization requires an authenticated reservation notification/webhook or a verified return flow from the Stays account.

## Stays photo gallery diagnosis and correction

The gallery is rendered from `Property.images`; the card carousel and detail gallery do not truncate the array themselves. The loss occurred during ingestion: the mapper assumed gallery entries only came from `_t_imagesMeta`, while collection responses can contain only the cover and detail responses may expose images in alternate fields. The detail route repeated the `_t_imagesMeta`-only assumption. Also, the browser persisted live properties and reused that cache at startup, so stale one-photo data could remain visible until a fresh catalog pull completed.

The backend now normalizes URLs from `_t_imagesMeta`, `images`, `photos`, `imageList`, `_t_images`, `gallery`, other photo-list metadata fields, and main-image fields; merges list and detail response galleries with URL deduplication; and retains an existing gallery if a detail fetch fails or has no gallery. The same extractor is used by catalog and individual-detail routes. If a direct-detail call by short ID fails, the server resolves the ID against the paginated account catalog before fetching its detail. The client persists fresh catalog galleries and refreshes a directly opened listing into the same cache.

Live per-listing counts could not be re-audited in this run because the Stays host refused the direct connection. Therefore this correction prevents losses in the website pipeline, but cannot create source photos absent from an apartment's Stays record. After API connectivity returns, run a catalog audit reporting each listing ID/title, source field counts, normalized gallery count, and detail-fetch outcome; compare it to the website output and flag zero/one-photo listings for review in the PMS. Do not copy one apartment's photos to another.

## Verification

Pricing normalization tests cover included and excluded fees, counter-fee embedding, cleaning treatment, invalid totals, and quote-change tolerance. Gallery tests cover alternate Stays image fields, merging list/detail results, duplicates, and invalid URLs. Run `npm test` and `npm run lint`. A production Vite bundle still depends on spawning esbuild; in restricted environments where Windows returns `spawn EPERM`, the frontend bundle cannot be verified there even when TypeScript and unit tests pass.
