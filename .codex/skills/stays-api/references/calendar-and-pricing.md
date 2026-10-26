# Calendário e preços

Use para consultar disponibilidade por unidade, tarifas diárias, restrições de estadia e regras de preço. As rotas de mutação podem afetar venda e inventário imediatamente.

## Consulta

1. Confirme a timezone da conta via `GET /settings/global/timezone` quando “hoje”, virada de dia ou período local forem relevantes. Não suponha que o timezone do computador é o da conta.
2. Leia `GET /calendar/listing/{listingId}` para o anúncio e intervalo corretos. Confirme no schema os parâmetros e a estrutura que contém preços e restrições.
3. Leia também configuração de preço do anúncio (`GET /settings/listing/{listingId}/sellprice`), configuração de reserva e house rules quando a dúvida depender dessas regras.
4. Diferencie tarifa de calendário, modelo de preço, temporada e configuração de venda; consulte os recursos correspondentes antes de explicar uma divergência.

## Alterar datas, preços e restrições

- Para valores diários use `PATCH /calendar/listing/{listingId}/prices`; para regras de estadia use `/restrictions`; o endpoint `/batch` pode alterar ambos. Escolha o menor escopo que representa a solicitação.
- Leia o intervalo atual antes de alterar. Confirme anúncio, datas inclusivas/exclusivas, timezone, moeda, preço e cada restrição pelo schema. Nunca invente precedência entre calendário, temporada, grupo e configuração do anúncio.
- Para temporadas e regiões de preço, use `/parr/seasons-sell`, `/parr/price-regions` e `/parr/listing-rates-sell` conforme a entidade. Leia a temporada/região e anúncios afetados antes da mutação.
- Para modelo global (`/settings/global/pricing-model`) ou configuração de venda por anúncio (`/settings/listing/{listingId}/sellprice`), verifique se o impacto é global ou local e liste o escopo antes de pedir autorização para escrever.
- Após qualquer PATCH, releia calendário e configuração afetados e compare com o valor esperado. Se o resultado divergir, pare e reporte; não tente compensar com escritas adicionais sem confirmar o plano.

## Confirmação de impacto

Mudanças em calendário/tarifas podem alterar cotações disponíveis. Antes da escrita, apresente os valores e datas exatos que serão alterados e o anúncio alvo. Mudanças globais, sazonais ou em grupos exigem explicitar todos os anúncios/períodos potencialmente abrangidos. Escritas continuam dependendo de autorização clara para a ação concreta.
