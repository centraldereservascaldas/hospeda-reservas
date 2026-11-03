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

**Visibilidade no site:** por solicitação do responsável pelo projeto, importar avaliações retornadas pela API independentemente do status; registros que não estejam `published` recebem no site a indicação “Ainda não publicada na Stays”. Essa decisão não altera o status no painel Stays. A documentação oficial informa que a publicação normal passa pelo status `Publicado`: [como gerenciar avaliações](https://academy.stays.net/pt-BR/support/solutions/articles/36000106713-es_mx-c%C3%B3mo-gestionar-la-evaluaci%C3%B3n-de-los-hu%C3%A9spedes), [Booking.com](https://academy.stays.net/en/support/solutions/articles/36000364639_en_us-faq-how-the-stays-integration-to-booking-reviews-works/) e [Airbnb](https://academy.stays.net/en/support/solutions/articles/36000355903_en_us-faq-how-the-integration-between-stays-and-airbnb-reviews-works). O site continua excluindo `privateFeedback`, nomes/IDs do cliente, dados de reserva e campos internos.

O site consulta as avaliações dos últimos 365 dias, inicia a paginação em `page=0`, e usa cache temporário no backend. A nota e contagem exibidas refletem avaliações retornadas nesse período, independentemente do status de publicação, não o histórico completo de toda a vida do anúncio.

**Regra de privacidade:** nunca renderizar `privateFeedback`, dados pessoais do hóspede (`client.fName/lName`), dados de reserva ou campos internos. O conteúdo de comentário é normalizado pelos campos de cada origem, sem expor o status bruto e sem misturar critérios de notas incompatíveis; a interface identifica os itens ainda não publicados.

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

## Painel de proprietário no site

O painel do site consulta somente leitura os endpoints documentados `GET /finance/owners/{ownerId}?from=...&to=...` e `GET /booking/reservations` (com `dateType=included` e `listingId`). O endpoint financeiro retorna o proprietário, os totais de débito/crédito e seus anúncios; as reservas são buscadas apenas para esses IDs e datas. O site não chama `GET /finance/owner-profiles`, que retorna identificadores fiscais completos.

### Aprovação obrigatória

O Swagger não documenta um e-mail de login que associe com segurança a conta do site ao cadastro financeiro do proprietário. Assim, a conta autenticada pode solicitar acesso, mas a solicitação permanece `pending` até a equipe verificar a identidade e inserir o ID correto da Stays. Nunca aprovar com base apenas no nome informado pelo solicitante.

1. Aplicar a migração `supabase/migrations/20261006000000_owner_access.sql`.
2. Verificar a identidade do proprietário fora do site e localizar o `_id` em `GET /finance/owners` na Stays.
3. No SQL Editor do Supabase, associar o UUID autenticado (tabela `auth.users`) ao `_id` conferido:

```sql
insert into public.owner_access (user_id, full_name, stays_owner_id, status, approved_at)
values ('UUID-DO-USUARIO-VERIFICADO', 'Nome verificado', 'ID-DO-PROPRIETARIO-NA-STAYS', 'approved', now())
on conflict (user_id) do update
set full_name = excluded.full_name,
    stays_owner_id = excluded.stays_owner_id,
    status = 'approved',
    approved_at = now();
```

A tabela não concede leitura direta a `anon`/`authenticated`; só o servidor com a chave `service_role` confere o vínculo. A rota de painel autentica e-mail confirmado, confere `status=approved` no servidor e somente então consulta a Stays. O site não envia e-mail/telefone do hóspede no resultado do painel. Reservas e totais podem conter dados pessoais/financeiros; manter HTTPS, acesso operacional restrito e logs sem corpos de resposta.

O painel implementado apresenta propriedades, reservas confirmadas/canceladas/bloqueios, calendário derivado das reservas retornadas e créditos/débitos do mês. Ele não altera calendários, reservas, cobranças nem anúncios. O resumo financeiro usa os agregados que a API documenta; não deve ser chamado de extrato detalhado até validar em produção os campos de lançamento retornados pela conta Stays.

### Análise administrativa de solicitações

O servidor oferece duas listas de acesso, além da autenticação Supabase com e-mail confirmado: `OWNER_REVIEWER_EMAILS` permite somente consultar, aprovar e recusar solicitações de proprietários; `OWNER_ADMIN_EMAILS` inclui essas ações e as operações de pagamentos e reservas. Os endereços são separados por vírgula. Configure somente e-mails da equipe em variáveis do servidor — nunca em `VITE_*`. A área de revisão lista pedidos pendentes e consulta `GET /finance/owners` somente no servidor, com `from` e `to` obrigatórios (janela dos últimos 10 anos); o resultado enviado ao navegador é reduzido a ID, nome e quantidade de imóveis, sem dados financeiros ou fiscais. A busca exige pelo menos dois caracteres e a resposta desconhecida é rejeitada em vez de retornar a carga bruta.

O endpoint `/finance/owner-profiles` foi descartado para este fluxo: o Swagger informa que ele retorna identificadores fiscais completos e exige concessão explícita à aplicação. Não pedir essa permissão para fazer o vínculo de conta.

Para aprovar, a equipe deve confirmar a identidade do solicitante por um canal oficial e selecionar o registro Stays correspondente. O servidor confirma que o pedido está pendente, que o ID existe na lista Stays e que o proprietário não está associado a outra conta; então grava o vínculo e os campos `reviewed_by`/`reviewed_at`. O nome sozinho nunca é considerado prova. Configure também a nova migração `20261006010000_owner_access_review_metadata.sql` antes de habilitar aprovações.

## Limites desta captura

O Swagger autenticado foi inspecionado visualmente na sessão da conta em 2026-10-02. A rede do shell deste ambiente não permitiu baixar o JSON/YAML OpenAPI diretamente; por isso **não foi possível salvar o documento OpenAPI bruto completo**. O guia acima é um índice documentado e resumido, não substitui a especificação viva. Não foram feitas chamadas de teste, criação/alteração de reservas, mensagens, preços ou configurações.
