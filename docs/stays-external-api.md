# Stays External API — referência do projeto

> Referência operacional baseada no Swagger autenticado da conta em `https://crcn.stays.net/external/v1/docs/` (OAS 3.0, API 1.0.0), consultado em 2026-10-02. Este arquivo resume endpoints e uso; não é uma cópia integral do documento OpenAPI. A especificação e permissões podem mudar: confirme no Swagger da conta antes de implementar.

## Base URL e autenticação

- Servidor exibido no Swagger: `https://crcn.stays.net/external/v1`.
- O projeto configura a integração no backend por `STAYS_BASE_URL`, `STAYS_CLIENT_ID` e `STAYS_CLIENT_SECRET` (ver `.env.example`).
- Nunca expor client secret/token no navegador, logs, respostas públicas ou neste documento.
- O Swagger tem botão **Authorize**; esquema exato e formato do token devem ser confirmados na seção de segurança do Swagger antes de montar chamadas manuais. Não assumir OAuth/Bearer apenas pelo botão.
- Não executar operações mutáveis sem solicitação explícita e validação em ambiente apropriado.

## Convenções de chamada

- Prefixar cada caminho abaixo com `https://crcn.stays.net/external/v1`.
- Enviar e aceitar JSON (`Content-Type: application/json`, `Accept: application/json`) quando aplicável. Uploads e downloads binários têm formatos próprios.
- `listingId` pode ser o identificador aceito pelo endpoint; em reviews, `reserveId` é documentado como UniqID, InternalID ou partnerCode.
- Conferir os parâmetros obrigatórios e os schemas individuais no Swagger. Campos opcionais, enums e formatos podem variar por operação.
- Para lista paginada, respeitar limites e percorrer páginas até completar os resultados. A única faixa confirmada nesta leitura é `limit` de 1 a 100 no `GET /reviews/guest`.
- **Teste ao vivo em 2026-10-02:** `page` é zero-indexado (a primeira página é `page=0`). Em um anúncio ativo consultado, `page=0` retornou 3 itens e `page=1` retornou 0, com `totalReviews=3`.
- **Limite de período observado:** intervalo inclusivo de exatamente um ano foi rejeitado com HTTP 422 (“Date range cannot be greater than 1 year”); use um intervalo menor que um ano, por exemplo 2025-10-03 a 2026-10-02.
- Tratar timeouts, 4xx/5xx, respostas vazias e mudanças de schema. Não converter falha da API em dados “oficiais” fictícios.

Exemplo de forma (placeholder, sem credencial real):

```http
GET https://crcn.stays.net/external/v1/reviews/guest?from=2026-01-01&to=2026-12-31&listingId={LISTING_ID}&limit=100&page=1
Authorization: <esquema e token conforme Swagger da conta>
Accept: application/json
```

## Endpoints documentados na conta

### Calendário

| Método | Caminho | Uso conforme Swagger |
|---|---|---|
| GET | `/calendar/listing/{listingId}` | Consultar calendário de um anúncio |
| PATCH | `/calendar/listing/{listingId}/prices` | Atualizar tarifas |
| PATCH | `/calendar/listing/{listingId}/restrictions` | Atualizar restrições |
| PATCH | `/calendar/listing/{listingId}/batch` | Atualizar preços/restrições em lote |

### Reservas e booking

| Método | Caminho | Uso conforme Swagger |
|---|---|---|
| POST | `/book-request` | Verificar possibilidade e obter URL de checkout Stays |
| GET | `/booking/searchfilter` | Consultar parâmetros aplicáveis à busca |
| GET, POST | `/booking/search-listings` | Buscar apartamentos livres |
| GET, POST | `/booking/calculate-price` | Calcular preço para datas/anúncio(s) |
| GET | `/booking/reservations` | Listar reservas |
| POST | `/booking/reservations` | Criar reserva (mutável) |
| GET, POST | `/booking/reservation-requests` | Listar/criar solicitações de reserva |
| GET, DELETE | `/booking/reservation-requests/{reserveRequestId}` | Consultar/remover solicitação |
| GET, POST | `/booking/reservations-export` | Exportar/listar reservas |
| GET, PATCH, DELETE | `/booking/reservations/{reserveId}` | Consultar/alterar/excluir reserva |
| GET, POST | `/booking/reservations/{reserveId}/payments` | Consultar/adicionar pagamento |
| GET, PATCH, DELETE | `/booking/reservations/{reserveId}/payments/{paymentId}` | Consultar/alterar/excluir pagamento |
| GET, POST | `/booking/reservations/{reserveId}/extra-services` | Consultar/adicionar serviço extra |
| GET, PATCH, DELETE | `/booking/reservations/{reserveId}/extra-services/{extraServiceId}` | Consultar/alterar/remover serviço |
| POST | `/booking/reservations/{reserveId}/send-email` | Enviar e-mail com PDF gerado |
| GET | `/booking/extra-services`, `/booking/extra-services/{id}` | Consultar serviços extras |
| GET, POST | `/booking/clients` | Consultar/criar clientes |
| GET, PATCH | `/booking/clients/{clientId}` | Consultar/alterar cliente |
| GET | `/booking/promo-codes`, `/booking/promo-codes/{_id}` | Consultar códigos promocionais |
| POST, PATCH, DELETE | `/booking/promo-codes[/{_id}]` | Criar/alterar/remover código (mutável) |

### Avaliações de hóspedes — foco desta integração

`GET /reviews/guest` retorna `{ totalReviews, reviewList }` no exemplo do Swagger. Parâmetros documentados:

| Parâmetro | Obrigatório | Descrição |
|---|---:|---|
| `from` | Sim | Data inicial (string; confirmar formato aceito no Swagger) |
| `to` | Sim | Data final |
| `limit` | Não | Resultados por página, de 1 a 100 |
| `page` | Não | Página, usado com `limit` |
| `clientId` | Não | Filtrar por cliente |
| `listingId` | Não | Filtrar por anúncio |
| `reserveId` | Não | UniqID, InternalID ou partnerCode |

O exemplo de schema mostra fontes `internal`, `airbnb`, `bookingcom` e `expedia`, cada uma com formatos diferentes. Campos incluem `status`, `day`, `apartment.id`, `source`, `rating` e campos de conteúdo; dependendo da origem podem aparecer `reviewText`, `publicReview`, comentários por categoria, resposta do anfitrião ou `privateFeedback`.

**Teste de leitura real (2026-10-02):** autenticação Basic configurada no servidor funcionou. Uma consulta limitada a menos de um ano retornou HTTP 200, `totalReviews=141` no conjunto consultado e 41 itens na página solicitada (página 1). Esses 41 itens incluíram `airbnb` (19), `bookingcom` (18) e `internal` (4). Em um anúncio ativo obtido de `/content/listings`, filtro por `listingId` + `page=0` retornou HTTP 200 e 3 avaliações `bookingcom`; `totalReviews` também foi 3. No conjunto desse anúncio, o status observado foi `new`. A resposta foi processada localmente e apenas contagens/nomes de campos foram registrados: nenhum nome de hóspede, texto, identificador ou campo `privateFeedback` foi exibido. **O teste prova que a leitura e os dados de origem Booking.com/Airbnb estão disponíveis pela API; não prova que status `new` autorize publicação pública.** Validar essa regra com a Stays antes de exibir conteúdo.

### Mapeamento por origem (amostra ao vivo, página 0)

Os nomes abaixo foram observados em até 100 avaliações retornadas entre 2025-10-03 e 2026-10-02. Quantidades por plataforma são apenas da primeira página, não o total da conta. Não foram inspecionados nem registrados valores de comentários ou dados de hóspedes.

| Origem | Registros na amostra | Comentário candidato | Nota/categorias candidatas |
|---|---:|---|---|
| `airbnb` | 63 | `publicReview` | `rating` (1–5 observado); categorias: `cleanlinessRating` → limpeza, `accuracyRating` → precisão, `communicationRating` → comunicação, `locationRating` → localização, `checkinRating` → check-in, `valueRating` → custo-benefício. `privateFeedback` existe em parte dos registros e nunca pode ser exibido. |
| `bookingcom` | 32 | `headlineComment`, `positiveComment`, `negativeComment` (montar somente quando publicação/status estiver autorizada) | `rating` (0,5–5 observado; o campo `originalRating` é outra escala e não deve substituir `rating`); categorias: `cleanRating` → limpeza, `locationRating` → localização, `valueRating` → custo-benefício. `facilitiesRating` e `staffRating` não devem ser renomeados para precisão/comunicação sem validação semântica. |
| `internal` | 4 | `reviewText` | `rating` (1–5 no schema; 2–5 observado); `cleaningRating` → limpeza e `checkinRating` → check-in. `checkoutRating`, `reservationRating`, `maintenanceRating` e `treatmentRating` não têm correspondência direta no modelo de categorias atual. |
| `expedia` | 1 | `publicReview` | `rating` / `overallRating`; somente um registro foi observado, então a escala precisa de confirmação. `roomCleanRating` pode corresponder a limpeza e `communicationRating` a comunicação; outros campos não devem ser forçados nas categorias atuais. |

**Campos comuns para normalização:** `id` ← `_id`; vínculo do anúncio ← `apartment._id` (no teste filtrado, os três registros retornados correspondiam por `_id`; `apartment.id` não correspondia ao `listingId` enviado); `date` ← `day`; `source` e `status` preservados como metadados. Usar `apartment._id`/ID oficial do catálogo para vincular registros, nunca título/nome do condomínio.

**Autor e avatar:** a resposta observada não tem avatar do hóspede; `apartment.avatar` é do apartamento e não pode ser usada como foto do autor. `client.fName` pode conter dado pessoal. Até confirmar consentimento e política pública, exibir um rótulo genérico como “Hóspede” e o selo da plataforma, sem nome pessoal ou avatar inventado.

**Compatibilidade com o tipo atual:** `Review` em `src/types/index.ts` exige nome/avatar e seis notas de categoria numéricas, mas a API não fornece todos esses campos para todas as origens. Na implementação, esses atributos precisam ser opcionais/nullable e a UI deve renderizar apenas categorias realmente recebidas. Não preencher lacunas com 0 ou notas fixas, pois isso aparentaria uma avaliação real.

**Bloqueio de publicação:** na amostra, todos os status observados foram `new`. Não assumir que `new` significa publicado. A camada pública deve falhar de forma fechada até a Stays confirmar qual status representa uma avaliação visível e quais campos de cada origem podem ser publicados. Mesmo após essa confirmação, excluir sempre `privateFeedback`, nomes/IDs do cliente, dados de reserva e campos internos.

**Regra de privacidade/publicação:** nunca renderizar `privateFeedback`, dados pessoais do hóspede (`client.fName/lName`) ou conteúdo de status não confirmado como público. Confirmar os valores reais de `status` e a política de visibilidade com Stays. Usar apenas campos públicos apropriados por origem (`reviewText`/`publicReview` e resposta pública quando autorizada); não inferir que todo item retornado está liberado para o site. A resposta por origem deve ser normalizada sem misturar critérios de notas incompatíveis.

Outras operações de reviews no Swagger:

| Método | Caminho | Uso |
|---|---|---|
| POST | `/reviews/guest` | Criar avaliação interna (mutável; não usar para importar avaliações automaticamente) |
| GET | `/reviews/guest/{reviewId}` | Consultar avaliação específica |
| PATCH | `/reviews/guest/{reviewId}` | Alterar avaliação interna (mutável) |

Não usar POST/PATCH para automatizar conteúdo sem um fluxo aprovado. Para notas agregadas, a documentação examinada não define um endpoint de agregação: agregá-las localmente apenas a partir de avaliações públicas válidas, documentando a regra e evitando contar avaliações privadas/ocultas.

### Mensagens (SMM)

| Método | Caminho | Uso |
|---|---|---|
| GET | `/smm/threads`, `/smm/threads/{threadId}` | Listar/consultar conversas |
| GET | `/smm/threads/{threadId}/messages` | Consultar mensagens |
| POST | `/smm/threads/{threadId}/messages` | Enviar mensagem (efeito externo) |

### Financeiro

Operações documentadas: `GET/POST /finance/payment-providers`, `GET/PATCH /finance/payment-providers/{providerId}`, `GET /finance/owners`, `GET /finance/owners/{ownerId}`, `GET /finance/owners/{ownerId}/{listingId}`, `POST /finance/owners/{ownerId}/{listingId}`, `PATCH /finance/owners/{ownerId}/{listingId}/{accountingId}`, `GET /finance/positions`, `GET/POST /finance/accounting-transactions`, `GET/PATCH/DELETE /finance/accounting-transactions/{accountingTransactionId}`, `GET /finance/ota-payouts` e `GET /finance/owner-profiles`. Tratar todo dado financeiro como sensível e limitar acesso; operações de escrita exigem aprovação explícita.

### Conteúdo e catálogo

O Swagger documenta operações para anúncios, propriedades, quartos, imagens/arquivos, grupos e grupos clonados/de preço:

- `GET/POST /content/listings`, `GET/PATCH /content/listings/{listingId}`
- `GET/POST /content/properties`, `GET/PATCH /content/properties/{propertyId}`
- `GET/POST /content/listing-rooms/{listingId}`, `GET/PATCH/DELETE /content/listing-rooms/{listingId}/{roomId}`
- `POST /content/upload-images`, `POST /content/upload-files`
- `GET/POST /content/groups`, `GET/PATCH/DELETE /content/groups/{groupId}`
- `/content/clone-groups` e `/content/price-groups`, com rotas de grupos e membros (`GET/POST/PATCH/DELETE` conforme operação)

Para catálogo do site, preferir consultas GET e normalizar IDs, fotos, descrição, comodidades e ocupação. Escritas em conteúdo podem publicar/alterar anúncios e não devem ser usadas como parte de uma leitura de catálogo.

### Preços sazonais, configurações e demais grupos

- Preços/regiões/temporadas: `/parr/price-regions`, `/parr/seasons-sell`, `/parr/listing-rates-sell` (GET/POST/PATCH/DELETE conforme operação do Swagger).
- Configurações globais: `/settings/global/pricing-model`, `/settings/global/listing-custom-fields`, `/settings/global/timezone`.
- Configurações do app: `/settings/app/listing-custom-fields`, `/settings/app/custom-fields` e recursos individuais.
- Configurações do anúncio: `/settings/listing/{listingId}/sellprice`, `/booking`, `/house-rules`, `/owner-contract` (métodos indicados individualmente no Swagger).
- Usuários: `GET /users`, `GET /users/me`.
- Arquivos: `GET /files/{fileId}` (binário).
- Traduções/dicionários: `/translation/*` para tipos de imóvel/quarto, camas, comodidades, inventário, bairros, serviços extras, comunicação, origem de marketing e tags de imagem; há também criação/edição/remoção de subtipos de quarto.
- Core: `POST /core/exchange-token` (sensível à autenticação).
- Task Manager: `/task-manager/api/*` para tarefas, colunas, anexos, automações, status, imóveis/grupos e tipos de tarefa. Há operações GET e mutáveis; upload/delete devem ser tratados com cautela.
- Estatísticas: `GET /statistics/active-listings-history`.
- Notificações: `POST /notifications/push` envia/enfileira notificações externas.

Esta seção é um mapa resumido; schemas, parâmetros, códigos de resposta e métodos exatos devem ser lidos na operação correspondente do Swagger da conta.

## Integração recomendada neste projeto

1. Fazer chamadas Stays somente no servidor; o frontend chama rotas próprias `/api/...`.
2. Reutilizar o cliente/backend de Stays existente e sua configuração de base URL/token, sem duplicar segredos.
3. Implementar primeiro somente leitura de avaliações: `GET /reviews/guest` por `listingId`, intervalo de datas limitado e paginação `limit <= 100`.
4. Definir intervalo histórico e estratégia de atualização/cache; deduplicar por `_id`; vincular por `apartment.id`/ID confiável do anúncio, não pelo título.
5. Criar normalizador discriminado por `source`, descartando campos privados e respeitando status/publicação após confirmação dos valores oficiais.
6. Não preservar as avaliações seed/mock atuais como se fossem reais. Sem resposta oficial/avaliações públicas, exibir estado vazio em vez de inventar nota ou comentários.
7. Testar paginação, datas, anúncios sem avaliação, fontes diferentes, item oculto, comentários privados, erros/timeout, duplicidade e não vazamento de dados no JSON público.
8. Conferir no site Stays quais avaliações são visíveis e comparar uma amostra por apartamento antes de publicar.

## Limites desta captura

O Swagger autenticado foi inspecionado visualmente na sessão da conta em 2026-10-02. A rede do shell deste ambiente não permitiu baixar o JSON/YAML OpenAPI diretamente; por isso **não foi possível salvar o documento OpenAPI bruto completo**. O guia acima é um índice documentado e resumido, não substitui a especificação viva. Não foram feitas chamadas de teste, criação/alteração de reservas, mensagens, preços ou configurações.
