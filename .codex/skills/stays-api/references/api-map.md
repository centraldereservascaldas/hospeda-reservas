# Mapa da Stays External API

Use este mapa para escolher a seção OpenAPI relevante. Os nomes correspondem às tags da especificação da conta; o arquivo completo incluído com a skill é `stays-openapi.json`.

| Tag | Escopo principal | Prefixos comuns |
|---|---|---|
| Booking | Disponibilidade, preço, reservas, solicitações, clientes, pagamentos e extras | `/booking/`, `/book-request` |
| Calendar | Calendário, preços e restrições por anúncio | `/calendar/` |
| Content | Cadastro do ciclo de anúncio: properties, listings, quartos, imagens/arquivos, grupos e associação de anúncios | `/content/` |
| Finance | Proprietários, razão/lançamentos, posições, provedores e repasses | `/finance/` |
| Promo codes | Códigos promocionais | `/booking/promo-codes` |
| parr | Regiões de preço, temporadas e tarifas sazonais | `/parr/` |
| Listing settings | Preços, reservas, regras da casa e contratos do anúncio | `/settings/listing/` |
| Global settings | Configurações globais, modelo de preço, fuso e campos | `/settings/global/` |
| App settings | Campos personalizados da aplicação | `/settings/app/` |
| SMM | Threads e mensagens | `/smm/` |
| Reviews | Avaliações de hóspedes | `/reviews/` |
| Task Manager | Tarefas, colunas, status, anexos, grupos e automações | `/task-manager/api/` |
| Translation | Tipos, comodidades, inventário e vocabulários | `/translation/` |
| Users | Usuários e identidade corrente | `/users/` |
| Files | Leitura de arquivo binário | `/files/` |
| Core | Operações-base, incluindo troca de token | `/core/` |
| Notifications | Enfileiramento de notificações | `/notifications/` |
| Statistics | Estatísticas de anúncios | `/statistics/` |
| Surveys | Preferência de exibição de pesquisas | `/surveys/` |

## Relações úteis

- Para operação diária de anúncio, consulte [`listing-lifecycle.md`](listing-lifecycle.md); cobre criar/subir, verificar prontidão, corrigir e ativar com validação.
- O ciclo básico é property (endereço/condomínio) → listing (unidade) → rooms (cômodos) → mídia associada → configurações de anúncio → calendário/tarifas → status e conexão de canal.
- Reserva → anúncio: `GET /booking/reservations/{reserveId}`; use `_idlisting` da resposta.
- Anúncio → propriedade/condomínio: `GET /content/listings/{listingId}`; use `_idproperty` para `GET /content/properties/{propertyId}`.
- Financeiro do proprietário: comece por `/finance/owners` e siga os identificadores retornados para a consulta de detalhe e anúncios associados. Consulte os schemas de cada rota; não confunda razão do proprietário com pagamento de reserva.
- Antes de usar uma rota, confirme a grafia e o método diretamente em `paths` do OpenAPI. Prefixos e relações acima são orientação para navegação, não substituem os schemas.
