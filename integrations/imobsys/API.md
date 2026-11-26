# API de integração ImobSys — referência técnica

Estado da branch `codex/imobsys-checkout-integration`. Este serviço é um laboratório separado do site e não é uma API oficial da ImobSys. A implementação deve ser consultada para o estado mais recente; a presença de rotas não significa que vendas estejam habilitadas.

## Execução e segurança

- Node.js 22 ou superior: `node --env-file-if-exists=.env src/server.mjs`.
- Endereço local padrão: `http://127.0.0.1:8012`. O container pode escutar em `0.0.0.0` para comunicação por rede Docker privada; `IMOBSYS_ALLOWED_HOSTS` precisa listar os hosts internos permitidos, separados por vírgula. O serviço não deve receber domínio público nem porta publicada no host.
- Os endpoints `/internal/` exigem `X-Local-Control` com a chave local. Os do navegador também exigem `X-Worker-Id` (UUID). A chave é privada: não colocar em frontend, repositório, URL ou documentação compartilhada.
- O executor Playwright usa sessão ImobSys em memória. Sessão expirada ou executor desconectado impede consultas autenticadas. Não se deve transportar cookies para o navegador do cliente.
- `data/` é ignorado pelo Git. Contém snapshots, controle local e bancos SQLite de testes; em instalação isolada, exige armazenamento persistente protegido.
- `PORT`, `CNSP_AUTHORIZATION`, `IMOBSYS_SANDBOX_FLOW_ENABLED`, `IMOBSYS_RESERVATION_CREATION_ENABLED`, `CIELO_SANDBOX_MERCHANT_ID` e `CIELO_SANDBOX_MERCHANT_KEY` são configurações do servidor. As flags ficam desligadas por padrão. Criar pré-reserva pode alterar a ImobSys real mesmo quando o pagamento é sandbox.

## Consultas HTTP

Datas usam `YYYY-MM-DD`. Os endpoints abaixo são locais e `GET`, exceto quando indicado. Respostas de erro costumam conter `success: false`, `code` e, quando disponível, `message`.

| Rota | Parâmetros | Finalidade e limites |
| --- | --- | --- |
| `/api/health` | — | Saúde do processo. Os campos de modo não substituem a verificação das flags reais. |
| `/api/properties` | — | Referências configuradas e observadas; catálogo não garantido completo. |
| `/api/catalog` | — | Snapshot de catálogo e cobertura. |
| `/api/media` | — | Fotos mapeadas, quando o snapshot existir. |
| `/api/coverage` | — | Cobertura das consultas realizadas, quando disponível. |
| `/api/integration/status` | — | Estado do pacote de candidatos, quando preparado. |
| `/api/provider/status` | — | Diagnóstico da credencial CNSP; não prova que ações estejam mapeadas. |
| `/api/preview` | `from`, `to` opcionais em conjunto | Prévia baseada em períodos previamente salvos, não busca ao vivo. |
| `/api/calendar` | `month=YYYY-MM` | Marcações observadas no mapa; não comprova disponibilidade diária. |
| `/api/availability` | `from`, `to`, `propertyId` opcional | Ofertas públicas; ausência de oferta não prova indisponibilidade. |
| `/api/properties/{id}/details` | — | Detalhes disponíveis de uma referência configurada. |
| `/api/properties/{id}/quote` | `from`, `to` | Preço anunciado no site público, sujeito aos limites da origem. |
| `/api/admin/status` | — | Estado da sessão administrativa e do executor. |
| `/api/admin/availability` | `from`, `to`, `unit` e `guests` opcionais | Consulta autenticada da rede; distingue oferta observada de reserva garantida. |
| `/api/v1/accommodations/search` | `from`, `to`, `guests` (1 a 10) | Busca autenticada com envelope semelhante ao da Stays e origem `imobsys-live`. |
| `/api/checkout-quote` | `propertyId`, `from`, `to`, `guests` (2 a 10) | Reconsulta a oferta e calcula Pix e parcelas; retorna modo de simulação e não habilita pagamento. |

Exemplo de busca local:

```http
GET /api/v1/accommodations/search?from=2027-05-17&to=2027-05-19&guests=2
```

A resposta tem `success`, `source`, `total`, `from`, `to`, `guests`, `data`, `unquotedCount`, `meta` e `pagination`. Cada item tem ID composto como `imobsys-crcn-2-663`, título e `calculatedPrice.totalAmount` em reais. O total Pix é obtido da oferta; diária e taxas individuais permanecem `null` quando não comprovadas. `availabilityConfirmed: false` e `reservationGuaranteed: false` indicam que a busca não bloqueia o imóvel. Fotos e metadados completos não estão integrados a essa resposta.

## Controle interno e sandbox

### Busca entre serviços

`GET /internal/offers/search?from=2027-05-17&to=2027-05-19&guests=2&page=1&pageSize=20` exige `X-Local-Control`. Aceita `page` de 1 a 10000 e `pageSize` de 1 a 100, com padrão 1 e 20. A paginação ocorre sobre as ofertas retornadas pela consulta, não sobre um catálogo completo do fornecedor. A resposta contém identidade composta, base, referência, datas, hóspedes, preço total em centavos, moeda e capacidade quando reconhecida; atributos não comprovados são `null`. `offer_observed` indica oferta encontrada, sem garantia de disponibilidade ou bloqueio. `absenceMeans: unknown` indica que ausência não comprova indisponibilidade. Reserva e pagamento continuam desativados nesta rota.

O parâmetro opcional `condominiumId` utiliza apenas vínculos explícitos em `verified-property-metadata.json`. Esse cadastro é parcial: apenas a unidade `imobsys-crcn-2-663` está vinculada ao condomínio `imobsys-crcn-condo-86`, conforme observação no painel. A resposta informa `unmappedCondominiumCount`, pois ofertas sem vínculo podem pertencer ao condomínio selecionado. Se não houver oferta mapeada para o filtro e houver ofertas sem vínculo, ou se a busca estiver vazia, retorna `503 condominium_mapping_unavailable`. Não deduzir que o condomínio não tem ofertas.

### Conciliação de condomínios Stays ↔ ImobSys

As rotas internas abaixo também exigem `X-Local-Control`, permitem somente `GET`, e são limitadas pelo rate limit interno. Elas só consultam snapshots observados e não fazem busca ao vivo, reserva ou pagamento.

| Rota | Parâmetros | Finalidade |
| --- | --- | --- |
| `GET /internal/condominiums/catalog` | — | Lista nomes e IDs observados no sitemap/ofertas, mais o crosswalk de identidades importado. A completude da identidade é informada separadamente da completude de ofertas. |
| `GET /internal/condominiums/reconcile` | `staysPropertyId`, `staysName` | Sugere candidatos por igualdade do nome normalizado ou devolve vínculo cruzado verificado explicitamente. |

O resultado da comparação nominal nunca confirma identidade: igualdade exata normalizada retorna `review_required`, e candidatos conflitantes retornam `ambiguous`. Sem candidato, `unknown` significa somente que o catálogo observado não contém correspondência; não prova inexistência ou indisponibilidade. Não há comparação aproximada nem equivalência inferida por slug, número ou apelido.

O crosswalk resumido fica em `condominium-crosswalk.json` e contém somente property keys, IDs, nomes, estados por provedor, estado do vínculo, evidência e data do snapshot de origem. Uma linha só entra em `verified` quando o `match_status` da fonte começa por `verified_` e os dois registros de provedor estão ativos. `pending_review` permanece em revisão e `source_only` fica sem vínculo. O snapshot original tinha 20 verificados, 6 em revisão e 17 sem vínculo. Em 20/11/2026, o vínculo diRoma Resort / diRoma Internacional Resort foi conferido na página oficial do empreendimento e incorporado, resultando em 21 verificados, 5 em revisão e 16 sem vínculo. O ID Stays e o ID numérico bruto do provedor ImobSys permanecem em campos separados. `imobsysCondominiumId` é a chave namespaced usada pelo conector, não o ID bruto do provedor. O snapshot foi sincronizado em `2026-10-15T19:05:24.585Z`; os estados atuais dos provedores não foram revalidados. O crosswalk não indica completude de ofertas, disponibilidade ou autorização para reserva.

O vínculo verificado exige que o ID e nome normalizado Stays continuem correspondendo ao registro importado, e que o nome/ID ImobSys permaneçam presentes no conjunto verificado. Comparações nominais e sugestões da fonte nunca definem `matchConfirmed` nem devolvem uma chave de filtro como vínculo confirmado. Resultados ausentes permanecem `unknown`, nunca indisponibilidade.

Fotos são associadas pelo ID completo ao snapshot `data/media.json`, somente quando sua origem e caminho forem aceitos; quando não houver foto comprovada, `images` é `null`. Situação ativa e autorização para o site permanecem desconhecidas. O serviço depende da sessão autenticada do executor e retorna erro se ela não estiver disponível. O processo remoto e a renovação da sessão ainda não foram validados para operação contínua. O cache de consulta dura 10 segundos; até duas consultas simultâneas são aceitas, e o trabalho no navegador expira após 60 segundos. O limite local é 30 consultas por minuto.

| Método e rota | Função |
| --- | --- |
| `GET /internal/browser/heartbeat` | Registra atividade do executor autenticado. |
| `GET /internal/browser/next` | Entrega a próxima consulta ao executor. |
| `POST /internal/browser/result` | Recebe resultado ou erro de um trabalho pendente. |
| `POST /internal/admin-session` | Recebe envelope cifrado da sessão, com autenticação local. |
| `GET /internal/seller/orders` | Lista pedidos sandbox pendentes de ação do vendedor. |
| `POST /internal/checkout/start` | Inicia orquestração isolada, apenas com flags e credenciais sandbox configuradas. |
| `GET /internal/checkout/{id}` | Consulta operação sandbox persistida. |
| `POST /internal/checkout/reconcile` | Consulta resultado na Cielo sandbox e encaminha à fila quando verificado. |
| `POST /internal/checkout/seller-confirm` | Marca pedido de teste como confirmado pelo vendedor na fila local. |

Essas rotas não são contratos públicos para o navegador do hóspede. `/internal/checkout/start` recebe identidade, período, quantidade de hóspedes, valor-base aceito, método, dados do titular e contexto da reserva; cartão requer token de pagamento e número de parcelas. O servidor reconsulta a cotação, verifica o valor, registra a operação antes de mutações e não repete automaticamente um resultado incerto. Falhas de orquestração respondem `checkout_requires_review`. Não enviar número de cartão ou código de segurança ao serviço.

O fluxo de teste pode criar uma pré-reserva verdadeira no fornecedor quando a respectiva flag estiver ligada; ela exige cancelamento e verificação posterior. A fila `sandbox_orders` é destinada a testes e não equivale a confirmação automática na ImobSys. O pagamento é executado exclusivamente nos endpoints sandbox da Cielo no código atual; a integração de produção e o fluxo de navegador ainda não estão prontos.

## Páginas e componentes

- `/previa`: prévia local do catálogo salvo, com fotos e preços observados.
- `/fila-previa`: visualização demonstrativa da fila.
- `/seller-orders`: tela local da fila sandbox; exige chave de controle para consultar dados.
- Na aplicação principal, `/mais-opcoes` e `/integracao/imobsys` são prévias de desenvolvimento. O checkout dessa aba ainda não efetiva reservas.

## Fontes externas utilizadas

O conector consulta páginas públicas de `reservascrcn.com.br`, o painel autenticado `app.reservascrcn.com.br` e, para testes, a Cielo sandbox. As ações observadas de pesquisa incluem `parceiro/buscaPrecos`, `precos/listaprecos` e `hospedagem/getOrcamentoRede`. A criação observada usa `reservaOnline/reservarImovelParceiro` e está protegida por flag. Não se trata de documentação oficial do fornecedor; mudanças no HTML ou nas ações podem interromper a integração.

## Verificação

```powershell
node --test tests/*.test.mjs
```

Os testes cobrem mapeamento, cotações, política do navegador, proteção de endpoints internos, orquestração simulada e conciliação sandbox. Testes com dependências simuladas não comprovam disponibilidade real nem compra completa no navegador. Consulte também [COMPARACAO-STAYS.md](COMPARACAO-STAYS.md).
