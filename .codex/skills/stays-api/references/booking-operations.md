# Operações de Booking

Consulte sempre o OpenAPI antes de chamar a API. Estes fluxos registram contratos confirmados no snapshot da conta e não substituem os schemas completos.

## Reservas com check-in em uma data

Para listar chegadas em uma data, `POST /booking/reservations-export` é uma consulta de leitura. O body documentado contém:

| Campo | Obrigatório | Tipo / valores |
|---|---:|---|
| `from` | Sim | Data ISO `YYYY-MM-DD` |
| `to` | Sim | Data ISO `YYYY-MM-DD` |
| `dateType` | Sim | `arrival`, `departure`, `creation`, `creationorig` ou `included` |
| `listingId` | Não | Lista de 1 a 50 IDs únicos |
| `_idclient` | Não | ID único de cliente |
| `partnerCode` | Não | String |

Para check-ins de hoje:

1. Resolva “hoje” pela data local informada no contexto da conversa do usuário (por exemplo, `America/Sao_Paulo` na CRCN), não pela timezone do servidor.
2. Envie `from` e `to` iguais à data calculada e `dateType: "arrival"`.
3. A resposta documentada é um array de `ReservationExport` (baseado em `ReservationExportBase`). Confira `checkInDate` na resposta e mantenha apenas correspondências exatas com a data solicitada.
4. O schema de exportação expõe `type`; os valores documentados de `ReservationType` são `reserved`, `booked`, `contract`, `blocked`, `maintenance` e `canceled`. Para a lista operacional de hóspedes que chegam, apresente reservas de hóspedes (`reserved`, `booked`, `contract`) e sinalize separadamente ou exclua explicitamente `blocked`, `maintenance` e `canceled`. Se aparecer valor desconhecido, não o classifique por suposição.
5. A resposta pode trazer `_id`, `id`, `listing.internalName`, `checkInDate`, `checkOutDate`, `guestTotalCount` e `client` (nome, telefone e e-mail), além de campos financeiros e documentos. Retorne só o necessário para a operação; evite IDs, contato, documentos e valores financeiros se não forem pedidos.
6. Informe quantidade, data/timezone usada, filtro `dateType`, tipos incluídos/excluídos e erros/limitações. Não invente filtro de status no request: o schema desta operação não documenta um campo de status.

O schema local define o body como JSON obrigatório e a resposta `200` como array de `ReservationExport`; erros `400` e `4XX` usam `ErrorBase`. Valide o HTTP e a estrutura antes de resumir os resultados.

## Busca de disponibilidade e preço

- `GET`/`POST /booking/search-listings`: confirme body ou query do método escolhido; estas rotas consultam disponibilidade.
- `GET`/`POST /booking/calculate-price`: confirme os campos específicos e retorne a moeda e os valores como recebidos. Uma cotação não garante disponibilidade futura nem conclui uma reserva.
- `POST /book-request`: verifica a possibilidade de checkout e retorna uma URL para o hóspede concluir o fluxo. Não equivale a reserva paga/confirmada.

## Detalhe e relação de entidades

- `GET /booking/reservations/{reserveId}` recupera uma reserva.
- Use `_idlisting` retornado para `GET /content/listings/{listingId}` e o `_idproperty` do anúncio para `GET /content/properties/{propertyId}`, se nomes do anúncio/propriedade estiverem ausentes na reserva.
- Reutilize objetos já populados na resposta e evite consultas extras quando os dados necessários já estiverem presentes.
