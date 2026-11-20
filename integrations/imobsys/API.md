# API de integração ImobSys — referência técnica

Estado da branch `codex/imobsys-checkout-integration`. Este serviço é um laboratório separado do site e não é uma API oficial da ImobSys. A implementação deve ser consultada para o estado mais recente; a presença de rotas não significa que vendas estejam habilitadas.

## Execução e segurança

- Node.js 22 ou superior: `node --env-file-if-exists=.env src/server.mjs`.
- Endereço padrão: `http://127.0.0.1:8012`. O serviço escuta somente em loopback e valida os cabeçalhos `Host` e `Origin`.
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
| `/api/v1/accommodations/search` | `from`, `to`, `guests` (2 a 10) | Busca autenticada com envelope semelhante ao da Stays e origem `imobsys-live`. |
| `/api/checkout-quote` | `propertyId`, `from`, `to`, `guests` (2 a 10) | Reconsulta a oferta e calcula Pix e parcelas; retorna modo de simulação e não habilita pagamento. |

Exemplo de busca local:

```http
GET /api/v1/accommodations/search?from=2027-05-17&to=2027-05-19&guests=2
```

A resposta tem `success`, `source`, `total`, `from`, `to`, `guests`, `data`, `unquotedCount`, `meta` e `pagination`. Cada item tem ID composto como `imobsys-crcn-2-663`, título e `calculatedPrice.totalAmount` em reais. O total Pix é obtido da oferta; diária e taxas individuais permanecem `null` quando não comprovadas. `availabilityConfirmed: false` e `reservationGuaranteed: false` indicam que a busca não bloqueia o imóvel. Fotos e metadados completos não estão integrados a essa resposta.

## Controle interno e sandbox

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
