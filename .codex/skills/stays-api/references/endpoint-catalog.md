# Catálogo completo de endpoints

Inventário derivado de `references/stays-openapi.json` (202 operações, 123 caminhos).
`*` marca parâmetro/campo obrigatório conforme o snapshot. Um `?` ou schema vazio indica que o contrato não especificou o formato com detalhe suficiente; consulte Swagger da conta antes de integrar.

**Efeito:** `read` consulta; `external action` pode iniciar checkout/enviar mensagem; `mutation` altera estado; `sensitive` envolve credencial/token. A classificação é uma triagem para leitura humana, não autorização. Verifique sempre descrição e schema: HTTP verb sozinho não determina o efeito.

Para encontrar uma operação: `python3 scripts/inspect-openapi.py <termos>`. Para atualizar este arquivo após trocar o snapshot: `python3 scripts/build-endpoint-catalog.py`.

## Índice por área

- [App settings](#app-settings) — 10 operações
- [Booking](#booking) — 34 operações
- [Calendar](#calendar) — 4 operações
- [Content](#content) — 38 operações
- [Core](#core) — 1 operações
- [Files](#files) — 1 operações
- [Finance](#finance) — 17 operações
- [Global settings](#global-settings) — 8 operações
- [Listing settings](#listing-settings) — 7 operações
- [Notifications](#notifications) — 1 operações
- [parr](#parr) — 12 operações
- [Promo codes](#promo-codes) — 5 operações
- [Reviews](#reviews) — 4 operações
- [SMM](#smm) — 4 operações
- [Statistics](#statistics) — 1 operações
- [Surveys](#surveys) — 2 operações
- [Task Manager](#task-manager) — 26 operações
- [Translation](#translation) — 25 operações
- [Users](#users) — 2 operações

## App settings

### `GET /settings/app/custom-fields`

Returns custom fields settings for app's listings.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `target*` (query; string (listing|reservation)) — Target for custom fields configuration.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `POST /settings/app/custom-fields`

Create custom field settings for app's listings

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `target*` (query; string (listing|reservation)) — Target for custom fields configuration.
- **Body (obrigatório):** `application/json`: `_idfield`:string, `type`*:string (text|integer|number|link), `internalName`*:string, `_msname`:object, `visibility`:string (public|hidden).
- **Respostas:** 200 application/json: `_idfield`:string, `type`:string (text|integer|number|link), `internalName`:string, `_msname`:object, `visibility`:string (public|hidden); 400 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /settings/app/custom-fields/{fieldId}`

Returns single custom field settings for app's listing.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `fieldId*` (path; string); `target*` (query; string (listing|reservation)) — Target for custom fields configuration.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_idfield`:string, `type`:string (text|integer|number|link), `internalName`:string, `_msname`:object, `visibility`:string (public|hidden); 4XX application/json: `message`:string.

### `PATCH /settings/app/custom-fields/{fieldId}`

Modify custom field settings for app's listings.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `fieldId*` (path; string); `target*` (query; string (listing|reservation)) — Target for custom fields configuration.
- **Body (obrigatório):** `application/json`: `_idfield`:string, `type`:string (text|integer|number|link), `internalName`:string, `_msname`:object, `visibility`:string (public|hidden).
- **Respostas:** 200 application/json: `_idfield`:string, `type`:string (text|integer|number|link), `internalName`:string, `_msname`:object, `visibility`:string (public|hidden); 4XX application/json: `message`:string.

### `DELETE /settings/app/custom-fields/{fieldId}`

Delete app custom field settings

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `fieldId*` (path; string); `target*` (query; string (listing|reservation)) — Target for custom fields configuration.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_idfield`:string, `type`:string (text|integer|number|link), `internalName`:string, `_msname`:object, `visibility`:string (public|hidden); 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /settings/app/listing-custom-fields`

Returns app custom fields.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** nenhum listado na operação.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `POST /settings/app/listing-custom-fields`

Create app custom field

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `_idfield`:string, `type`*:string (text|integer|number|link), `internalName`*:string, `_msname`:object, `visibility`:string (public|hidden).
- **Respostas:** 200 application/json: `_idfield`:string, `type`:string (text|integer|number|link), `internalName`:string, `_msname`:object, `visibility`:string (public|hidden); 400 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /settings/app/listing-custom-fields/{fieldId}`

Returns app custom field

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `fieldId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_idfield`:string, `type`:string (text|integer|number|link), `internalName`:string, `_msname`:object, `visibility`:string (public|hidden); 4XX application/json: `message`:string.

### `PATCH /settings/app/listing-custom-fields/{fieldId}`

Modify app custom field

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `fieldId*` (path; string).
- **Body (obrigatório):** `application/json`: `_idfield`:string, `type`:string (text|integer|number|link), `internalName`:string, `_msname`:object, `visibility`:string (public|hidden).
- **Respostas:** 200 application/json: `_idfield`:string, `type`:string (text|integer|number|link), `internalName`:string, `_msname`:object, `visibility`:string (public|hidden); 4XX application/json: `message`:string.

### `DELETE /settings/app/listing-custom-fields/{fieldId}`

Delete app custom field

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `fieldId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_idfield`:string, `type`:string (text|integer|number|link), `internalName`:string, `_msname`:object, `visibility`:string (public|hidden); 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.


## Booking

### `POST /book-request`

Checks booking possibility and returns url that you have to redirect guest to complete checkout process.

- **Efeito provável:** external action — may create a checkout, send, or enqueue communication; confirm target and content.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `from`*:string, `to`*:string, `aptid`*:string, `client`*:object, `persons`:number.
- **Respostas:** 200 application/json: `redirectUrl`*:string; 4XX application/json: `message`:string.

### `GET /booking/calculate-price`

Returns detailed price for listing for certain dates

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `listingId*` (query; one of: string; string) — Listing identifier; `from*` (query; string) — Start date.; `to*` (query; string) — End date.; `guests` (query; integer) — Max count of guests.; `promocode` (query; one of: string; string) — Promo code identifier.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_idlisting`:string, `from`:string, `to`:string, `guests`:number, `_mctotal`:object, `feesIncluded`:boolean, `fees`:array[object], `mainCurrency`:string (BRL|USD|EUR|MXN|ARS|UYU|PYG|CLP|COP|ZAR|XAF|BWP|MZN|NAD|SZL|LSL|AED|PEN|GBP|AUD|RUB|THB|DOP|CRC|SEK|IDR|CAD|NOK|GTQ|CHF); 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /booking/calculate-price`

Returns detailed price for listings for certain dates

- **Efeito provável:** read — POST used as a query in this operation; validate its documented body.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `from`*:string, `to`*:string, `listingIds`*:array[one of: string; string], `guests`:integer, `promocode`:one of: string; string.
- **Respostas:** 200 application/json: array[object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /booking/clients`

Returns client list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `name` (query; string) — Filtering by name.; `email` (query; string) — Filtering by email.; `phone` (query; string) — Filtering by phone.; `hasReservations` (query; boolean) — Allows to filter clients who has or doesn't have reservations; `reservationFilter` (query; string (creation|arrival|departure)) — Set criteria to search clients by reservations for certain period; `reservationFrom` (query; string) — Start date for searching by reservations; `reservationTo` (query; string) — End date for searching by reservations; `sort` (query; string (asc|desc)) — Sort type.; `sortBy` (query; string (name|email)) — Sort by.; `skip` (query; integer) — Number of records to skip for pagination.; `limit` (query; integer) — Maximum number of records to return..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object & object & object]; 4XX application/json: `message`:string.

### `POST /booking/clients`

Create new client item

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `kind`:string (person|company), `fName`:string, `lName`:string, `name`:string, `email`:string, `contactEmails`:array[object], `isUser`:boolean, `_iduser`:string, `creationDate`:string, `birthDate`:string, `gender`:string (|m|f), `civilState`:string (|single|married|devorced|widowed), `nationality`:string, `internalNote`:string, `clientSource`:string, `address`:object, `phones`:array[object], `documents`:array[object], `prefLang`:string (en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR), `alternateLangs`:array[en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR], `responsibility`:object.
- **Respostas:** 201 application/json: `phones`:array[object], `documents`:array[object], `prefLang`:string (en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR), `alternateLangs`:array[en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR], `internalNote`:string, `lastAccess`:object, `reservations`:array[object], `_iduser`:string; 4XX application/json: `message`:string.

### `GET /booking/clients/{clientId}`

Returns client detailed info.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `clientId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `phones`:array[object], `documents`:array[object], `prefLang`:string (en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR), `alternateLangs`:array[en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR], `internalNote`:string, `lastAccess`:object, `reservations`:array[object], `_iduser`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /booking/clients/{clientId}`

Update client item

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `clientId*` (path; string).
- **Body (obrigatório):** `application/json`: `kind`:string (person|company), `fName`:string, `lName`:string, `name`:string, `email`:string, `contactEmails`:array[object], `isUser`:boolean, `_iduser`:string, `creationDate`:string, `birthDate`:string, `gender`:string (|m|f), `civilState`:string (|single|married|devorced|widowed), `nationality`:string, `internalNote`:string, `clientSource`:string, `address`:object, `phones`:array[object], `documents`:array[object], `prefLang`:string (en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR), `alternateLangs`:array[en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR], `responsibility`:object.
- **Respostas:** 200 application/json: `phones`:array[object], `documents`:array[object], `prefLang`:string (en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR), `alternateLangs`:array[en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR], `internalNote`:string, `lastAccess`:object, `reservations`:array[object], `_iduser`:string; 4XX application/json: `message`:string.

### `GET /booking/extra-services`

Returns extra services

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `itemId` (query; string) — Extra service translation name identifier; `categoryId` (query; string) — Extra service translation category identifier.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /booking/extra-services/{id}`

Returns extra service

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `id*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `_msname`:object, `_msprice`:object, `itemId`:string, `categoryId`:string, `dateTimeRangeSettings`:object, `lodgingCheck`:boolean; 4XX application/json: `message`:string.

### `GET /booking/reservation-requests`

Returns list of reservation requests

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `from*` (query; string) — Start date.; `to*` (query; string) — End date.; `dateType*` (query; string (arrival|departure|creation)) — Criteria for applying dates range; `listingId` (query; one of: one of: string; string; array[one of: string; string]) — Listing identifier; `skip` (query; integer); `limit` (query; integer).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `POST /booking/reservation-requests`

Create new reservation request

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `listingId`*:one of: string; string, `_idclient`*:string, `checkInDate`*:string, `checkInTime`*:string, `checkOutDate`*:string, `checkOutTime`*:string, `message`:string, `_mctotal`:object, `communicationWays`:array[object], `marketingSource`:object, `guestsDetails`*:object.
- **Respostas:** 201 application/json: `_id`:string, `_idlisting`:one of: string; string, `_idclient`:string, `creationDate`:string, `creationTime`:string, `checkInDate`:string, `checkInTime`:string, `checkOutDate`:string, `checkOutTime`:string, `message`:string, `_mctotal`:object, `_mcdeposit`:object, `fees`:array[object], `communicationWays`:array[object], `marketingSource`:object, `guestsDetails`:object; 4XX application/json: `message`:string.

### `GET /booking/reservation-requests/{reserveRequestId}`

Returns a specific reservation request

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `reserveRequestId*` (path; string) — UniqID.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `_idlisting`:one of: string; string, `_idclient`:string, `creationDate`:string, `creationTime`:string, `checkInDate`:string, `checkInTime`:string, `checkOutDate`:string, `checkOutTime`:string, `message`:string, `_mctotal`:object, `_mcdeposit`:object, `fees`:array[object], `communicationWays`:array[object], `marketingSource`:object, `guestsDetails`:object; 4XX application/json: `message`:string.

### `DELETE /booking/reservation-requests/{reserveRequestId}`

Deletes a specific requested reservations.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `reserveRequestId*` (path; string) — UniqID.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `_idlisting`:one of: string; string, `_idclient`:string, `creationDate`:string, `creationTime`:string, `checkInDate`:string, `checkInTime`:string, `checkOutDate`:string, `checkOutTime`:string, `message`:string, `_mctotal`:object, `_mcdeposit`:object, `fees`:array[object], `communicationWays`:array[object], `marketingSource`:object, `guestsDetails`:object; 4XX application/json: `message`:string.

### `GET /booking/reservations`

Returns listing reservations.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `from*` (query; string) — Start date.; `to*` (query; string) — End date.; `dateType*` (query; string (arrival|departure|creation|creationorig|included)) — Criteria for applying dates range; `listingId` (query; one of: one of: string; string; array[one of: string; string]) — Listing identifier; `type` (query; one of: string (reserved|booked|contract|blocked|maintenance|canceled); array[reserved|booked|contract|blocked|maintenance|canceled]) — Reservation type; `_idclient` (query; string) — Client identifier; `skip` (query; integer); `limit` (query; integer).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object & object]; 4XX application/json: `message`:string.

### `POST /booking/reservations`

Create new listing reservation.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: one of: object & object; object & object.
- **Respostas:** 201 application/json: `_id`:string, `id`:string, `creationDate`:string, `creationTime`:string, `creationDateTime`:string, date-time, `checkInDate`:string, `checkInTime`:string, `checkOutDate`:string, `checkOutTime`:string, `_idlisting`:string, `_idclient`:string, `_idthread`:string, `type`:string (reserved|booked|contract|blocked|maintenance|canceled), `price`:object, `partner`:object, `fees`:array[object], `guests`:integer, `bookerDetails`:object, `guestsDetails`:object, `internalNote`:string, `_idpromoCode`:string, `partnerCode`:string, `isMaster`:boolean, `childs`:array[object], `reservationUrl`:string, `checkoutTerms`:array[object], `appCustomFields`:array[object], `cardsInfo`:array[object], `mealIncluded`:boolean, `guestSelfRegistration`:object, `clientsFiles`:array[object], `agencyFiles`:array[object]; 4XX application/json: `message`:string.

### `GET /booking/reservations-export`

Returns report in xlsx format

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `from*` (query; string) — Start date.; `to*` (query; string) — End date.; `dateType*` (query; string (arrival|departure|creation|creationorig|included)) — Criteria for applying dates range; `listingId` (query; one of: one of: string; string; array[one of: string; string]) — Listing identifier; `type` (query; one of: string (reserved|booked|contract|blocked|maintenance|canceled); array[reserved|booked|contract|blocked|maintenance|canceled]) — Reservation type; `_idclient` (query; string) — Client identifier.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/vnd.openxmlformats: string, binary; 4XX application/json: `message`:string.

### `POST /booking/reservations-export`

Returns reservations list

- **Efeito provável:** read — POST used as a query in this operation; validate its documented body.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `from`*:string, `to`*:string, `dateType`*:string (arrival|departure|creation|creationorig|included), `listingId`:array[one of: string; string], `_idclient`:string, `partnerCode`:string.
- **Respostas:** 200 application/json: array[object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /booking/reservations/{reserveId}`

Returns reservation detailed info.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `id`:string, `creationDate`:string, `creationTime`:string, `creationDateTime`:string, date-time, `checkInDate`:string, `checkInTime`:string, `checkOutDate`:string, `checkOutTime`:string, `_idlisting`:string, `_idclient`:string, `_idthread`:string, `type`:string (reserved|booked|contract|blocked|maintenance|canceled), `price`:object, `partner`:object, `fees`:array[object], `guests`:integer, `bookerDetails`:object, `guestsDetails`:object, `internalNote`:string, `_idpromoCode`:string, `partnerCode`:string, `isMaster`:boolean, `childs`:array[object], `reservationUrl`:string, `checkoutTerms`:array[object], `appCustomFields`:array[object], `cardsInfo`:array[object], `mealIncluded`:boolean, `guestSelfRegistration`:object, `clientsFiles`:array[object], `agencyFiles`:array[object], `earlyCheckInBlocking`:boolean, `lateCheckOutBlocking`:boolean, `beforeCheckInPreparationBlocking`:object, `afterCheckOutPreparationBlocking`:object; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /booking/reservations/{reserveId}`

Update reservation item

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode.
- **Body (obrigatório):** `application/json`: one of: object; object & object; object.
- **Respostas:** 200 application/json: `_id`:string, `id`:string, `creationDate`:string, `creationTime`:string, `creationDateTime`:string, date-time, `checkInDate`:string, `checkInTime`:string, `checkOutDate`:string, `checkOutTime`:string, `_idlisting`:string, `_idclient`:string, `_idthread`:string, `type`:string (reserved|booked|contract|blocked|maintenance|canceled), `price`:object, `partner`:object, `fees`:array[object], `guests`:integer, `bookerDetails`:object, `guestsDetails`:object, `internalNote`:string, `_idpromoCode`:string, `partnerCode`:string, `isMaster`:boolean, `childs`:array[object], `reservationUrl`:string, `checkoutTerms`:array[object], `appCustomFields`:array[object], `cardsInfo`:array[object], `mealIncluded`:boolean, `guestSelfRegistration`:object, `clientsFiles`:array[object], `agencyFiles`:array[object], `earlyCheckInBlocking`:boolean, `lateCheckOutBlocking`:boolean, `beforeCheckInPreparationBlocking`:object, `afterCheckOutPreparationBlocking`:object; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /booking/reservations/{reserveId}`

Delete reservation item

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `id`:string, `creationDate`:string, `creationTime`:string, `creationDateTime`:string, date-time, `checkInDate`:string, `checkInTime`:string, `checkOutDate`:string, `checkOutTime`:string, `_idlisting`:string, `_idclient`:string, `_idthread`:string, `type`:string (reserved|booked|contract|blocked|maintenance|canceled), `price`:object, `partner`:object, `fees`:array[object], `guests`:integer, `bookerDetails`:object, `guestsDetails`:object, `internalNote`:string, `_idpromoCode`:string, `partnerCode`:string, `isMaster`:boolean, `childs`:array[object], `reservationUrl`:string, `checkoutTerms`:array[object], `appCustomFields`:array[object], `cardsInfo`:array[object], `mealIncluded`:boolean, `guestSelfRegistration`:object, `clientsFiles`:array[object], `agencyFiles`:array[object]; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /booking/reservations/{reserveId}/extra-services`

Returns reservation extra services list

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /booking/reservations/{reserveId}/extra-services`

Add extra service

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode.
- **Body (obrigatório):** `application/json`: `_id`:string, `_idextra`:string, `_msname`:object, `_f_unitPrice`:number, `_i_unitCount`:number, `_f_val`:number, `startDate`:string, `endDate`:string, `startTime`:string, `endTime`:string, `desc`:string.
- **Respostas:** 200 application/json: `_id`:string, `_idextra`:string, `_msname`:object, `_f_unitPrice`:number, `_i_unitCount`:number, `_f_val`:number, `startDate`:string, `endDate`:string, `startTime`:string, `endTime`:string, `desc`:string; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /booking/reservations/{reserveId}/extra-services/{extraServiceId}`

Returns reservation extra-service item

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode; `extraServiceId*` (path; string) — Extra service identifier inside reservation.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `_idextra`:string, `_msname`:object, `_f_unitPrice`:number, `_i_unitCount`:number, `_f_val`:number, `startDate`:string, `endDate`:string, `startTime`:string, `endTime`:string, `desc`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /booking/reservations/{reserveId}/extra-services/{extraServiceId}`

Update reservation extra-service item

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode; `extraServiceId*` (path; string) — Extra service identifier inside reservation.
- **Body (obrigatório):** `application/json`: `_id`:string, `_idextra`:string, `_msname`:object, `_f_unitPrice`:number, `_i_unitCount`:number, `_f_val`:number, `startDate`:string, `endDate`:string, `startTime`:string, `endTime`:string, `desc`:string.
- **Respostas:** 200 application/json: `_id`:string, `_idextra`:string, `_msname`:object, `_f_unitPrice`:number, `_i_unitCount`:number, `_f_val`:number, `startDate`:string, `endDate`:string, `startTime`:string, `endTime`:string, `desc`:string; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /booking/reservations/{reserveId}/extra-services/{extraServiceId}`

Delete reservation payment.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode; `extraServiceId*` (path; string) — Extra service identifier inside reservation.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `id`:string, `creationDate`:string, `creationTime`:string, `creationDateTime`:string, date-time, `checkInDate`:string, `checkInTime`:string, `checkOutDate`:string, `checkOutTime`:string, `_idlisting`:string, `_idclient`:string, `_idthread`:string, `type`:string (reserved|booked|contract|blocked|maintenance|canceled), `price`:object, `partner`:object, `fees`:array[object], `guests`:integer, `bookerDetails`:object, `guestsDetails`:object, `internalNote`:string, `_idpromoCode`:string, `partnerCode`:string, `isMaster`:boolean, `childs`:array[object], `reservationUrl`:string, `checkoutTerms`:array[object], `appCustomFields`:array[object], `cardsInfo`:array[object], `mealIncluded`:boolean, `guestSelfRegistration`:object, `clientsFiles`:array[object], `agencyFiles`:array[object]; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /booking/reservations/{reserveId}/payments`

Returns reservation payments.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /booking/reservations/{reserveId}/payments`

Add reservation payment.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode.
- **Body (obrigatório):** `application/json`: `_id`:string, `_idpaymentProvider`:string, `type`*:string (credit|debit), `_f_val`*:number, `status`:string (pending|completed), `expirationDate`*:string, `paymentDate`:string, `competenceDate`:string, `name`:string, `desc`:string, `_f_fee`:number, `_f_tax`:number, `readonly`:boolean.
- **Respostas:** 200 application/json: `_id`:string, `_idpaymentProvider`:string, `type`*:string (credit|debit), `_f_val`*:number, `status`:string (pending|completed), `expirationDate`*:string, `paymentDate`:string, `competenceDate`:string, `name`:string, `desc`:string, `_f_fee`:number, `_f_tax`:number, `readonly`:boolean; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /booking/reservations/{reserveId}/payments/{paymentId}`

Returns reservation payment.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode; `paymentId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `_idpaymentProvider`:string, `type`*:string (credit|debit), `_f_val`*:number, `status`:string (pending|completed), `expirationDate`*:string, `paymentDate`:string, `competenceDate`:string, `name`:string, `desc`:string, `_f_fee`:number, `_f_tax`:number, `readonly`:boolean; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /booking/reservations/{reserveId}/payments/{paymentId}`

Update reservation payment

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode; `paymentId*` (path; string).
- **Body (obrigatório):** `application/json`: `_f_val`:number, `expirationDate`:string, `paymentDate`:string, `competenceDate`:string, `desc`:string, `name`:string, `_f_fee`:number, `_f_tax`:number.
- **Respostas:** 200 application/json: `_id`:string, `_idpaymentProvider`:string, `type`*:string (credit|debit), `_f_val`*:number, `status`:string (pending|completed), `expirationDate`*:string, `paymentDate`:string, `competenceDate`:string, `name`:string, `desc`:string, `_f_fee`:number, `_f_tax`:number, `readonly`:boolean; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /booking/reservations/{reserveId}/payments/{paymentId}`

Delete reservation payment

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode; `paymentId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `_idpaymentProvider`:string, `type`*:string (credit|debit), `_f_val`*:number, `status`:string (pending|completed), `expirationDate`*:string, `paymentDate`:string, `competenceDate`:string, `name`:string, `desc`:string, `_f_fee`:number, `_f_tax`:number, `readonly`:boolean; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /booking/reservations/{reserveId}/send-email`

Sends an email with a PDF attachment rendered from the specified template and reservation data.

- **Efeito provável:** external action — may create a checkout, send, or enqueue communication; confirm target and content.
- **Parâmetros:** `reserveId*` (path; one of: string; string; string) — UniqID, InternalID or partnerCode.
- **Body (obrigatório):** `application/json`: `templateName`*:string (contract|apartment-invoice|extras-invoice|total-invoice), `email`:string, `subject`:string, `body`:string.
- **Respostas:** 200 application/json: unspecified; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /booking/search-listings`

Returns free apartments list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `from*` (query; string) — Start date.; `to*` (query; string) — End date.; `guests` (query; integer) — Max count of guests.; `rooms` (query; integer) — Rooms count. 0 - Studio, 1 - one room, 2 - two rooms.; `cities` (query; array[string]) — Cities list as an array of city names.; `regions` (query; array[string]) — Regions list as an array of region names.; `countries` (query; array[string]) — Countries list as an array of region names.; `states` (query; array[string]) — States list as an array of region names.; `properties` (query; array[string]) — Properties IDs list as an array; `amenities` (query; array[string]) — Listing or property amenities as an array of amenity IDs.; `inventory` (query; array[string]) — Rooms inventory as an array of inventory names.; `id` (query; string) — Apartment internal code.; `sort` (query; string (rating|price)) — Sort by.; `skip` (query; integer) — Number of records to skip for pagination.; `limit` (query; integer) — Maximum number of records to return.; `isBookable` (query; boolean) — Filter apartments by minimum stay requirements to return only bookable properties..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object & object & object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /booking/search-listings`

Returns free apartments list.

- **Efeito provável:** read — POST used as a query in this operation; validate its documented body.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `from`*:string, `to`*:string, `guests`:integer, `rooms`:array[integer], `cities`:array[string], `regions`:array[string], `countries`:array[string], `states`:array[string], `properties`:array[one of: string; string], `amenities`:array[string], `inventory`:array[string], `listingId`:one of: string; string, `isBookable`:boolean, `sort`:string (rating|price), `skip`:integer, `limit`:integer.
- **Respostas:** 200 application/json: array[object & object & object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /booking/searchfilter`

Returns applicable parameters for search listings

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** nenhum listado na operação.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `guests`:array[object], `rooms`:array[object], `cities`:array[object], `regions`:array[object], `countries`:array[object], `states`:array[object], `properties`:array[object & object], `amenities`:array[object], `inventory`:array[object], `groups`:array[object]; 4XX application/json: `message`:string.


## Calendar

### `GET /calendar/listing/{listingId}`

Returns calendar data for certain listing

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `listingId*` (path; one of: string; string); `from*` (query; string) — Start date.; `to*` (query; string) — End date.; `ignorePriceGroupUnits` (query; boolean) — Ignore availability for price group units. Only master listing availability will be returned.; `ignoreCloneGroupUnits` (query; boolean) — Ignore availability for clone group units. Only master listing availability will be returned; `availNoPrices` (query; boolean) — Return real availability when no prices defined; `includeBlockedCount` (query; boolean) — Include number of blocked units for each day in the response.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /calendar/listing/{listingId}/batch`

Update prices and restrictions in batch.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `listingId*` (path; one of: string; string); `pricingModel` (query; string (rateplans|losd)).
- **Body (obrigatório):** `application/json`: one of: array[object]; array[object].
- **Respostas:** 200 application/json: unspecified; 4XX application/json: `message`:string.

### `PATCH /calendar/listing/{listingId}/prices`

Update rate values.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `from`*:string, `to`*:string, `prices`*:array[object].
- **Respostas:** 200 application/json: unspecified; 4XX application/json: `message`:string.

### `PATCH /calendar/listing/{listingId}/restrictions`

Update restriction.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `from`*:string, `to`*:string, `closedToArrival`*:boolean, `closedToDeparture`*:boolean.
- **Respostas:** 200 application/json: unspecified; 4XX application/json: `message`:string.


## Content

### `POST /content/clone-groups`

Create clone group.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `name`*:string, `_idmaster`*:string, `items`*:array[object].
- **Respostas:** 200 application/json: `name`:string, `_idmaster`:string, `visibleItems`:number, `totalItems`:number, `items`:array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/clone-groups/{masterId}`

Returns clone group.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `masterId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `name`:string, `_idmaster`:string, `visibleItems`:number, `totalItems`:number, `items`:array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /content/clone-groups/{masterId}`

Update clone group.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `masterId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `name`*:string.
- **Respostas:** 200 application/json: `name`:string, `_idmaster`:string, `visibleItems`:number, `totalItems`:number, `items`:array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /content/clone-groups/{masterId}`

Delete clone group.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `masterId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `name`:string, `_idmaster`:string, `visibleItems`:number, `totalItems`:number, `items`:array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/clone-groups/{masterId}/items`

Get clone group members.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `masterId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /content/clone-groups/{masterId}/items`

Add new member to clone group.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `masterId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `internalName`*:string.
- **Respostas:** 200 application/json: `internalName`*:string, `status`:string (active|hidden|inactive|draft), `visible`:boolean, `_idlisting`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/clone-groups/{masterId}/items/{listingId}`

Get clone group member.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `masterId*` (path; one of: string; string); `listingId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `internalName`*:string, `status`:string (active|hidden|inactive|draft), `visible`:boolean, `_idlisting`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /content/clone-groups/{masterId}/items/{listingId}`

Modify visibility and status of clone group member.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `masterId*` (path; one of: string; string); `listingId*` (path; string).
- **Body (obrigatório):** `application/json`: `visible`:boolean.
- **Respostas:** 200 application/json: `internalName`*:string, `status`:string (active|hidden|inactive|draft), `visible`:boolean, `_idlisting`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /content/clone-groups/{masterId}/items/{listingId}`

Delete member from clone group.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `masterId*` (path; one of: string; string); `listingId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `internalName`*:string, `status`:string (active|hidden|inactive|draft), `visible`:boolean, `_idlisting`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/groups`

Returns groups list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `skip` (query; integer) — Number of records to skip for pagination.; `limit` (query; integer) — Maximum number of records to return.; `status` (query; string (active|inactive)) — Group status..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object & object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /content/groups`

Adds a group item

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `internalName`*:string, `_id`:string, `status`:string (active|inactive), `types`:array[system|front|communication|highlight], `_mstitle`:object, `listingIds`:array[string].
- **Respostas:** 201 application/json: `_id`:string, `status`:string (active|inactive), `internalName`:string, `types`:array[system|front|communication|highlight], `_mstitle`:object, `listingIds`:array[string]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/groups/{groupId}`

Returns group item.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `groupId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `status`:string (active|inactive), `internalName`:string, `types`:array[system|front|communication|highlight], `_mstitle`:object, `listingIds`:array[string]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /content/groups/{groupId}`

Update a group

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `groupId*` (path; string).
- **Body (obrigatório):** `application/json`: `_id`:string, `status`:string (active|inactive), `internalName`:string, `types`:array[system|front|communication|highlight], `_mstitle`:object, `listingIds`:array[string].
- **Respostas:** 200 application/json: `_id`:string, `status`:string (active|inactive), `internalName`:string, `types`:array[system|front|communication|highlight], `_mstitle`:object, `listingIds`:array[string]; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /content/groups/{groupId}`

Remove group by _id

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `groupId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `status`:string (active|inactive), `internalName`:string, `types`:array[system|front|communication|highlight], `_mstitle`:object, `listingIds`:array[string]; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/listing-rooms/{listingId}`

returns room list

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /content/listing-rooms/{listingId}`

adds a room item

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `_id`:string, `_idtype`:string, `_idsubtype`:string, `_idlisting`:string, `beds`:array[object], `images`:array[object], `inventory`:array[object].
- **Respostas:** 201 application/json: `_id`:string, `_idtype`:string, `_idsubtype`:string, `_idlisting`:string, `beds`:array[object], `images`:array[object], `inventory`:array[object]; 400 application/json: `message`:string; 403 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/listing-rooms/{listingId}/{roomId}`

returns room by _id

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `listingId*` (path; one of: string; string); `roomId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `_idtype`:string, `_idsubtype`:string, `_idlisting`:string, `beds`:array[object], `images`:array[object], `inventory`:array[object]; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /content/listing-rooms/{listingId}/{roomId}`

update a room

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `listingId*` (path; one of: string; string); `roomId*` (path; string).
- **Body (obrigatório):** `application/json`: `_id`:string, `_idtype`:string, `_idsubtype`:string, `_idlisting`:string, `beds`:array[object], `images`:array[object], `inventory`:array[object].
- **Respostas:** 200 application/json: `_id`:string, `_idtype`:string, `_idsubtype`:string, `_idlisting`:string, `beds`:array[object], `images`:array[object], `inventory`:array[object]; 400 application/json: `message`:string; 404 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /content/listing-rooms/{listingId}/{roomId}`

removed room by _id

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `listingId*` (path; one of: string; string); `roomId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `_idtype`:string, `_idsubtype`:string, `_idlisting`:string, `beds`:array[object], `images`:array[object], `inventory`:array[object]; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/listings`

Returns listings list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `skip` (query; integer) — Number of records to skip for pagination.; `limit` (query; integer) — Maximum number of records to return.; `status` (query; array[active|hidden|inactive|draft]) — Listing activity status.; `groupId` (query; string) — Listing's group identifier.; `rel` (query; string (master|child)) — Listing's relation. Allows to filter master/child listings; `propertyId` (query; one of: string; string) — Property identifier.; `listingCategories` (query; array[vacationRental|longTermRental|forSale]) — Filter by listing categories/types.; `quicksearch` (query; string) — Quick search string. If present and at least 3 characters, listings will be searched by id, avatar, title, OTA codes, or address..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object & object & object & object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /content/listings`

Create new listing item.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `internalName`*:string, `_idproperty`:string, `_idpropertyType`:string, `_idtype`*:string, `subtype`*:string (private_room|entire_home|shared_room).
- **Respostas:** 201 application/json: `_mshouserules`:object, `_mssummary`:object, `_msnotes`:object, `_msspace`:object, `_msaccess`:object, `_msinteraction`:object, `_msneighborhood_overview`:object, `_mstransit`:object, `amenities`:array[object], `propertyAmenities`:array[object], `customFields`:array[object], `images`:array[object], `_idmainImage`:string, `appCustomFields`:array[object], `customhtml`:string, `_f_commercialPriority`:number, `_t_mainImageMeta`:object, `_t_imagesMeta`:array[object], `owner`:object, `isPriceGroupMaster`:boolean, `isCloneGroupMaster`:boolean; 400 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/listings/{listingId}`

returns listing item

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `otaChannels`:array[object]; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /content/listings/{listingId}`

Update a listing item.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `_idproperty`:string, `_idtype`:string, `subtype`:string (private_room|entire_home|shared_room), `status`:string (active|hidden|inactive|draft), `internalName`:string, `_mstitle`:object, `internalNote`:string, `address`:object, `latLng`:object, `_f_square`:number, `_mshouserules`:object, `_mssummary`:object, `_msnotes`:object, `_msspace`:object, `_msaccess`:object, `_msinteraction`:object, `_msneighborhood_overview`:object, `_mstransit`:object, `amenities`:array[object], `propertyAmenities`:array[object], `customFields`:array[object], `images`:array[object], `_idmainImage`:string, `appCustomFields`:array[object], `customhtml`:string, `_f_commercialPriority`:number.
- **Respostas:** 200 application/json: `_mshouserules`:object, `_mssummary`:object, `_msnotes`:object, `_msspace`:object, `_msaccess`:object, `_msinteraction`:object, `_msneighborhood_overview`:object, `_mstransit`:object, `amenities`:array[object], `propertyAmenities`:array[object], `customFields`:array[object], `images`:array[object], `_idmainImage`:string, `appCustomFields`:array[object], `customhtml`:string, `_f_commercialPriority`:number, `_t_mainImageMeta`:object, `_t_imagesMeta`:array[object], `owner`:object, `isPriceGroupMaster`:boolean, `isCloneGroupMaster`:boolean; 400 application/json: `message`:string; 404 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /content/price-groups`

Create price group.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `name`*:string, `_idmaster`*:string, `items`*:array[object].
- **Respostas:** 200 application/json: `name`:string, `_idmaster`:string, `visibleItems`:number, `totalItems`:number, `items`:array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/price-groups/{masterId}`

Returns price group.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `masterId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `name`:string, `_idmaster`:string, `visibleItems`:number, `totalItems`:number, `items`:array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /content/price-groups/{masterId}`

Update price group.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `masterId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `name`*:string.
- **Respostas:** 200 application/json: `name`:string, `_idmaster`:string, `visibleItems`:number, `totalItems`:number, `items`:array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /content/price-groups/{masterId}`

Delete price group.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `masterId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `name`:string, `_idmaster`:string, `visibleItems`:number, `totalItems`:number, `items`:array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/price-groups/{masterId}/items`

Get price group members.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `masterId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /content/price-groups/{masterId}/items`

Add new member to price group.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `masterId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `_idlisting`*:string.
- **Respostas:** 200 application/json: `_idlisting`*:string, `status`:string (active|hidden|inactive|draft), `visible`:boolean; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/price-groups/{masterId}/items/{listingId}`

Get price group member.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `masterId*` (path; one of: string; string); `listingId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_idlisting`*:string, `status`:string (active|hidden|inactive|draft), `visible`:boolean; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /content/price-groups/{masterId}/items/{listingId}`

Modify visibility of price group member.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `masterId*` (path; one of: string; string); `listingId*` (path; string).
- **Body (obrigatório):** `application/json`: `visible`:boolean.
- **Respostas:** 200 application/json: `_idlisting`*:string, `status`:string (active|hidden|inactive|draft), `visible`:boolean; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /content/price-groups/{masterId}/items/{listingId}`

Delete member from price group.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `masterId*` (path; one of: string; string); `listingId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_idlisting`*:string, `status`:string (active|hidden|inactive|draft), `visible`:boolean; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/properties`

returns properties list

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `skip` (query; integer) — number of records to skip for pagination; `limit` (query; integer) — maximum number of records to return; `status` (query; one of: string (active|inactive|draft); array[active|inactive|draft]) — property activity status.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object & object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /content/properties`

adds a property item

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `internalName`*:string, `_idtype`*:string.
- **Respostas:** 201 application/json: `_t_mainImageMeta`:object, `_t_imagesMeta`:array[object]; 400 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /content/properties/{propertyId}`

returns property item

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `propertyId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_t_mainImageMeta`:object, `_t_imagesMeta`:array[object]; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /content/properties/{propertyId}`

update a property item

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `propertyId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `_idtype`:string, `status`:string (active|inactive|draft), `internalName`:string, `_mstitle`:object, `_msdesc`:object, `_msneighborhood_overview`:object, `_mstransit`:object, `address`:object, `latLng`:object, `amenities`:array[object], `images`:array[object], `_idmainImage`:string.
- **Respostas:** 200 application/json: `_t_mainImageMeta`:object, `_t_imagesMeta`:array[object]; 400 application/json: `message`:string; 404 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /content/upload-files`

Sem resumo no contrato.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `multipart/form-data`: `files`*:one of: string, binary; array[string, binary], `documentId`*:string, `documentType`*:string (reserve).
- **Respostas:** 200 application/json: array[object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /content/upload-images`

Sem resumo no contrato.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `multipart/form-data`: `images`*:one of: string, binary; array[string, binary].
- **Respostas:** 200 application/json: array[string]; 400 application/json: `message`:string; 4XX application/json: `message`:string.


## Core

### `POST /core/exchange-token`

Changes token to existing user

- **Efeito provável:** sensitive — credential/token operation; do not invoke without a specific request and secure handling.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `hash`*:string.
- **Respostas:** 200 application/json: `token`:string; 404 application/json: `message`:string; 500 application/json: `message`:string; 4XX application/json: `message`:string.


## Files

### `GET /files/{fileId}`

Return file as binary data

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `fileId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 image/jpeg: string, binary; 200 image/png: string, binary; 200 image/webp: string, binary; 200 image/avif: string, binary; 200 image/gif: string, binary; 200 application/pdf: string, binary; 200 application/msword: string, binary; 200 application/vnd.openxmlformats-officedocument.wordprocessingml.document: string, binary; 200 application/vnd.oasis.opendocument.text: string, binary; 200 application/vnd.ms-excel: string, binary; 200 application/vnd.openxmlformats-officedocument.spreadsheetml.sheet: string, binary; 200 application/vnd.oasis.opendocument.spreadsheet: string, binary; 200 application/mp4: string, binary; 200 video/mp4: string, binary; 200 video/quicktime: string, binary; 200 text/html: string, binary; 200 audio/mpeg: string, binary; 200 audio/ogg: string, binary; 4XX application/json: `message`:string.


## Finance

### `GET /finance/accounting-transactions`

Returns transactions list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `from*` (query; string) — Start date to filter.; `to*` (query; string) — End date to filter.; `dateType*` (query; string (creation|payment|expiration|competence)) — Criteria for applying dates range; `type` (query; one of: string (credit|debit); array[credit|debit]) — Type of accounting; `skip` (query; integer) — Number of records to skip for pagination.; `limit` (query; integer) — Maximum number of records to return.; `listingId` (query; one of: string; string) — Listing identifier; `propertyId` (query; one of: string; string) — Property identifier; `ownerId` (query; string) — Landlord identifier; `bankAccountId` (query; string) — Bank account identifier; `categoryId` (query; string) — Category identifier; `operatorId` (query; string) — Operator identifier; `responsibleId` (query; string) — Responsible identifier.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `POST /finance/accounting-transactions`

Creates a finance accounting transaction.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `transactionName`:string, `internalNote`:string, `categoryId`:string, `_mcval`:object, `competenceDate`:string, `expirationDate`:string, `bankAccountId`:string, `responsible`:string (owner|company|both), `listingId`:one of: string; string, `companySplit`:integer, `ownerSplit`:integer, `paid`:boolean, `payment`:object, `type`:string (credit|debit).
- **Respostas:** 201 application/json: `transactionName`:string, `internalNote`:string, `bankAccountId`:string, `competenceDate`:string, `expirationDate`:string, `creationDate`:string, `listingId`:one of: string; string, `operatorId`:string, `type`:string (credit|debit), `_mcval`:object, `categoryId`:string, `companySplit`:integer, `ownerSplit`:integer, `responsible`:string (owner|company|both), `paid`:boolean, `payment`:object, `_id`:string; 4XX application/json: `message`:string.

### `GET /finance/accounting-transactions/{accountingTransactionId}`

Retrieve a specific accounting

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `accountingTransactionId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `transactionName`:string, `bankAccountId`:string, `competenceDate`:string, `expirationDate`:string, `creationDate`:string, `listingId`:one of: string; string, `operatorId`:string, `type`:string (credit|debit|balance), `_mcval`:object, `categoryId`:string, `companySplit`:integer, `ownerSplit`:integer, `responsible`:string (owner|company|both), `paid`:boolean, `payment`:object, `_id`:string, `balanceItems`:array[object]; 4XX application/json: `message`:string.

### `PATCH /finance/accounting-transactions/{accountingTransactionId}`

Edits a finance accounting transaction.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `accountingTransactionId*` (path; string) — Accounting transaction id.
- **Body (obrigatório):** `application/json`: `transactionName`:string, `internalNote`:string, `categoryId`:string, `_mcval`:object, `competenceDate`:string, `expirationDate`:string, `bankAccountId`:string, `responsible`:string (owner|company|both), `listingId`:one of: string; string, `companySplit`:integer, `ownerSplit`:integer, `paid`:boolean, `payment`:object.
- **Respostas:** 200 application/json: `transactionName`:string, `internalNote`:string, `bankAccountId`:string, `competenceDate`:string, `expirationDate`:string, `creationDate`:string, `listingId`:one of: string; string, `operatorId`:string, `type`:string (credit|debit), `_mcval`:object, `categoryId`:string, `companySplit`:integer, `ownerSplit`:integer, `responsible`:string (owner|company|both), `paid`:boolean, `payment`:object, `_id`:string; 4XX application/json: `message`:string.

### `DELETE /finance/accounting-transactions/{accountingTransactionId}`

Deletes a finance accounting transaction.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `accountingTransactionId*` (path; string) — Accounting transaction id.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `transactionName`:string, `bankAccountId`:string, `competenceDate`:string, `expirationDate`:string, `creationDate`:string, `listingId`:one of: string; string, `operatorId`:string, `type`:string (credit|debit|balance), `_mcval`:object, `categoryId`:string, `companySplit`:integer, `ownerSplit`:integer, `responsible`:string (owner|company|both), `paid`:boolean, `payment`:object, `_id`:string, `balanceItems`:array[object]; 4XX application/json: `message`:string.

### `GET /finance/ota-payouts`

Returns the OTA payouts list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `from` (query; string) — Start of the period, inclusive. Applied over the date selected by dateType. When both dates are given, from must not be after to and the period must not exceed one year.; `to` (query; string) — End of the period, inclusive. Applied over the date selected by dateType. When both dates are given, from must not be after to and the period must not exceed one year.; `dateType` (query; string (expected|paid|reference)) — Which date the period filters by. 'expected' filters by expectedAt, 'paid' by paidAt and 'reference' by referenceDate.; `channel` (query; string (airbnb|bookingcom)) — OTA channel to list the payouts of.; `status` (query; string (pending|paid|partially_paid|cancelled|unknown)) — Payout status.; `reservationPartnerCode` (query; string) — Returns the payouts that contain the reservation, matched on the partner code without distinguishing upper from lower case. The payout is returned with all of its items.; `skip` (query; integer) — Number of records to skip for pagination. Pages follow a total order (date, channel, payoutId) over the collection as it stands when each page is read; a sync writing between two requests can shift a batch across a page boundary, as with any offset pagination. Page over a closed period for a consistent view.; `limit` (query; integer) — Maximum number of records to return. A page shorter than the limit is the last one..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /finance/owner-profiles`

Gets financial profiles for property owners

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `skip` (query; integer) — Number of records to skip for pagination.; `limit` (query; integer) — Maximum number of records to return..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `list`*:array[object], `count`*:integer; 4XX application/json: `message`:string.

### `GET /finance/owners`

Returns finance owners.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `from*` (query; string) — Start date for searching by owner; `to*` (query; string) — End date for searching by owner.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /finance/owners/{ownerId}`

Returns finance owner by id.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `ownerId*` (path; string) — Owner id; `from*` (query; string) — Start date for searching by owner; `to*` (query; string) — End date for searching by owner.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `name`:string, `address`:object, `debit`:object, `credit`:object, `dateRange`:object, `listings`:array[object]; 4XX application/json: `message`:string.

### `GET /finance/owners/{ownerId}/{listingId}`

Returns finance owner by id and listing id.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `ownerId*` (path; string) — Owner id; `listingId*` (path; one of: string; string); `from*` (query; string) — Start date for searching by owner; `to*` (query; string) — End date for searching by owner.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `id`:string, `internalName`:string, `debit`:object, `credit`:object, `balance`:object, `lifeDebit`:object, `lifeCredit`:object, `lifeBalance`:object, `accounts`:array[object]; 4XX application/json: `message`:string.

### `POST /finance/owners/{ownerId}/{listingId}`

Creates a finance accounting with owner id and listing id.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `ownerId*` (path; string) — Owner id; `listingId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `date`*:string, `transactionName`*:string, `publicNote`:string, `internalNote`:string, `type`*:string (credit|debit), `_mcval`*:object, `status`*:string (paid|await), `paymentDate`:string, `_mcfee`:object, `_mctax`:object.
- **Respostas:** 201 application/json: `_id`:string, `date`:string, `internalName`:string, `transactionName`:string, `publicNote`:string, `internalNote`:string, `type`:string (credit|debit|balance), `reserveId`:string, `_mcval`:object, `status`:string (paid|await|inbalance), `paymentDate`:string, `_mcfee`:object, `_mctax`:object, `_mcvalpaid`:object; 4XX application/json: `message`:string.

### `PATCH /finance/owners/{ownerId}/{listingId}/{accountingId}`

Edits a finance accounting with owner id, listing id, accounting id.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `ownerId*` (path; string) — Owner id; `listingId*` (path; one of: string; string); `accountingId*` (path; string).
- **Body (obrigatório):** `application/json`: `date`:string, `transactionName`:string, `publicNote`:string, `internalNote`:string, `type`:string (credit|debit), `_mcval`:object, `status`:string (paid|await), `paymentDate`:string, `_mcfee`:object, `_mctax`:object.
- **Respostas:** 200 application/json: `_id`:string, `date`:string, `internalName`:string, `transactionName`:string, `publicNote`:string, `internalNote`:string, `type`:string (credit|debit|balance), `reserveId`:string, `_mcval`:object, `status`:string (paid|await|inbalance), `paymentDate`:string, `_mcfee`:object, `_mctax`:object, `_mcvalpaid`:object; 4XX application/json: `message`:string.

### `GET /finance/payment-providers`

Returns finance payment providers.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `status` (query; string (active|inactive)) — Payment provider status.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[one of: object; object; object]; 4XX application/json: `message`:string.

### `POST /finance/payment-providers`

Create new payment provider.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: one of: object; object.
- **Respostas:** 201 application/json: one of: object; object; object; 400 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /finance/payment-providers/{providerId}`

Returns finance payment providers by id.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `providerId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: one of: object; object; object; 4XX application/json: `message`:string.

### `PATCH /finance/payment-providers/{providerId}`

Update payment provider.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `providerId*` (path; string).
- **Body (opcional):** `application/json`: one of: object; object.
- **Respostas:** 200 application/json: one of: object; object; object; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /finance/positions`

Returns finance positions.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `type` (query; string (credit|debit)) — Type of position.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.


## Global settings

### `GET /settings/global/listing-custom-fields`

Returns custom fields

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** nenhum listado na operação.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `POST /settings/global/listing-custom-fields`

Add custom fields

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `_msname`:object, `varName`*:string, `varPreview`*:string.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `PATCH /settings/global/listing-custom-fields`

Update custom fields

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `id`*:number, `_msname`:object, `varName`:string, `varPreview`:string.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `DELETE /settings/global/listing-custom-fields`

Delete custom fields

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `id`*:number.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /settings/global/pricing-model`

Returns pricing model

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** nenhum listado na operação.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: one of: one of: object; object; object; 4XX application/json: `message`:string.

### `PATCH /settings/global/pricing-model`

Update pricing model

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: one of: object; object.
- **Respostas:** 200 application/json: one of: object; object; 4XX application/json: `message`:string.

### `GET /settings/global/timezone`

Returns the account time zone

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** nenhum listado na operação.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `timeZone`*:string; 4XX application/json: `message`:string.

### `PATCH /settings/global/timezone`

Update the account time zone

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `timeZone`*:string.
- **Respostas:** 200 application/json: `timeZone`*:string; 4XX application/json: `message`:string.


## Listing settings

### `GET /settings/listing/{listingId}/booking`

Returns booking settings for listing

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_idlisting`:string, `_idmasterListing`:string, `policy`:object, `instantBooking`:boolean, `checkInTime`:string, `checkInTimeEnd`:string, `checkOutTimeStart`:string, `checkOutTime`:string, `maxBookingAvailability`:integer, `preparationBlocking`*:object; 4XX application/json: `message`:string.

### `GET /settings/listing/{listingId}/house-rules`

Returns house rules for listing

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `smokingAllowed`:boolean, `eventsAllowed`:boolean, `petsAllowed`:string (yes|no|onrequest), `petsPriceType`:string (free|chargesmayapply), `quietHours`:boolean, `quietHoursDetails`:object, `_mshouserules`:object, `kidsAllowed`:boolean, `_i_kids`:integer, `_mskids`:object, `babiesAllowed`:boolean, `_i_babies`:integer, `_msbabies`:object, `_i_babyCribs`:integer, `_msnochildrenSuitable`:object; 4XX application/json: `message`:string.

### `PATCH /settings/listing/{listingId}/house-rules`

Update listing house rules

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `smokingAllowed`:boolean, `eventsAllowed`:boolean, `petsAllowed`:string (yes|no|onrequest), `petsPriceType`:string (free|chargesmayapply), `quietHours`:boolean, `quietHoursDetails`:object, `_mshouserules`:object, `kidsAllowed`:boolean, `_i_kids`:integer, `_mskids`:object, `babiesAllowed`:boolean, `_i_babies`:integer, `_msbabies`:object, `_i_babyCribs`:integer, `_msnochildrenSuitable`:object.
- **Respostas:** 200 application/json: `smokingAllowed`:boolean, `eventsAllowed`:boolean, `petsAllowed`:string (yes|no|onrequest), `petsPriceType`:string (free|chargesmayapply), `quietHours`:boolean, `quietHoursDetails`:object, `_mshouserules`:object, `kidsAllowed`:boolean, `_i_kids`:integer, `_mskids`:object, `babiesAllowed`:boolean, `_i_babies`:integer, `_msbabies`:object, `_i_babyCribs`:integer, `_msnochildrenSuitable`:object; 4XX application/json: `message`:string.

### `GET /settings/listing/{listingId}/owner-contract`

Returns owner contract for listing

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `useParentListingSettings`:boolean, `useParentListingOwnerAgent`:boolean, `owner`:object, `agent`:object, `registeredDate`:string, `isInSublease`:boolean, `isInExclusiveDistribution`:boolean, `duration`:object, `commission`:object; 4XX application/json: `message`:string.

### `PATCH /settings/listing/{listingId}/owner-contract`

Update listing owner contract

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `useParentListingSettings`:boolean, `useParentListingOwnerAgent`:boolean, `owner`:object, `agent`:object, `registeredDate`:string, `isInSublease`:boolean, `isInExclusiveDistribution`:boolean, `duration`:object, `commission`:object.
- **Respostas:** 200 application/json: `useParentListingSettings`:boolean, `useParentListingOwnerAgent`:boolean, `owner`:object, `agent`:object, `registeredDate`:string, `isInSublease`:boolean, `isInExclusiveDistribution`:boolean, `duration`:object, `commission`:object; 4XX application/json: `message`:string.

### `GET /settings/listing/{listingId}/sellprice`

Returns listing sell price configuration

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_idlisting`:string, `_idmasterListing`:string, `mainCurrency`:string (BRL|USD|EUR|MXN|ARS|UYU|PYG|CLP|COP|ZAR|XAF|BWP|MZN|NAD|SZL|LSL|AED|PEN|GBP|AUD|RUB|THB|DOP|CRC|SEK|IDR|CAD|NOK|GTQ|CHF), `region`:object, `fees`:array[object], `petFee`:object, `securityDeposit`:number, `guestsIncluded`:number, `extraGuests`:object, `dynamicPricingRules`:object; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /settings/listing/{listingId}/sellprice`

Updates listing sell price configuration

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `listingId*` (path; one of: string; string).
- **Body (obrigatório):** `application/json`: `fees`*:array[object].
- **Respostas:** 200 application/json: `_idlisting`:string, `_idmasterListing`:string, `mainCurrency`:string (BRL|USD|EUR|MXN|ARS|UYU|PYG|CLP|COP|ZAR|XAF|BWP|MZN|NAD|SZL|LSL|AED|PEN|GBP|AUD|RUB|THB|DOP|CRC|SEK|IDR|CAD|NOK|GTQ|CHF), `region`:object, `fees`:array[object], `petFee`:object, `securityDeposit`:number, `guestsIncluded`:number, `extraGuests`:object, `dynamicPricingRules`:object; 404 application/json: `message`:string; 4XX application/json: `message`:string.


## Notifications

### `POST /notifications/push`

Enqueues a push notification for async delivery.

- **Efeito provável:** external action — may create a checkout, send, or enqueue communication; confirm target and content.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `type`*:string, `recipient`*:one of: object; object; object, `title`*:string, `body`*:string, `url`:string, `data`:object, `idempotencyKey`*:string.
- **Respostas:** 202 application/json: `correlationId`*:string, `status`*:string (queued); 400 application/json: `message`:string; 403 application/json: `message`:string; 404 application/json: `message`:string; 409 application/json: `message`:string; 429 application/json: `message`:string; 4XX application/json: `message`:string.


## parr

### `GET /parr/listing-rates-sell`

Returns season rates sell for certain listing

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `listingId*` (query; one of: string; string); `from*` (query; string); `to*` (query; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /parr/listing-rates-sell/{seasonId}`

Returns season rate sell for certain listing

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `seasonId*` (path; string); `listingId*` (query; one of: string; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_idlisting`:string, `_idseason`:string, `type`:string (global|individual), `status`:string (active|inactive), `from`:string, `to`:string, `baseRateValue`:number, `ratePlans`:array[object], `monthlyRate`:object; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /parr/listing-rates-sell/{seasonId}`

Updates rate sell for certain listing and season.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `seasonId*` (path; string); `listingId*` (query; one of: string; string).
- **Body (obrigatório):** `application/json`: `type`*:string (global), `status`:string (active|inactive), `baseRateValue`:number, `monthlyRateValue`:number.
- **Respostas:** 200 application/json: `_idlisting`:string, `_idseason`:string, `type`:string (global|individual), `status`:string (active|inactive), `from`:string, `to`:string, `baseRateValue`:number, `ratePlans`:array[object], `monthlyRate`:object; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /parr/price-regions`

Returns price regions list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** nenhum listado na operação.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object & object]; 4XX application/json: `message`:string.

### `POST /parr/price-regions`

Create new price region.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `name`*:string.
- **Respostas:** 201 application/json: `_id`:string, `name`*:string; 400 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /parr/price-regions/{regionId}`

Update the price region

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `regionId*` (path; string).
- **Body (obrigatório):** `application/json`: `name`*:string.
- **Respostas:** 200 application/json: `name`*:string; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /parr/price-regions/{regionId}`

Remove the price region.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `regionId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `name`*:string; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /parr/seasons-sell`

Returns seasons list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `_idregion` (query; string) — ID season's region. Empty for default.; `from` (query; string) — Start date for searching; `to` (query; string) — End date for searching; `status` (query; string (active|inactive)) — Status of season; `_idlisting` (query; string) — ID to retrieve listing individual season..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[one of: object & object; object & object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /parr/seasons-sell`

Create new season.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: one of: object & object; object & object.
- **Respostas:** 201 application/json: one of: object & object; object & object; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /parr/seasons-sell/{seasonId}`

Returns the season by ID.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `seasonId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: one of: object & object; object & object; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /parr/seasons-sell/{seasonId}`

Update the season

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `seasonId*` (path; string).
- **Body (obrigatório):** `application/json`: one of: object & object; object & object.
- **Respostas:** 200 application/json: one of: object & object; object & object; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /parr/seasons-sell/{seasonId}`

Remove the season.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `seasonId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: one of: object & object; object & object; 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.


## Promo codes

### `GET /booking/promo-codes`

Returns promo-codes list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `name` (query; string) — Filtering by name; `status` (query; string (active|inactive)) — Filtering by promo code status; `used` (query; boolean) — Filtering by promo code used state; `skip` (query; integer) — Number of records to skip for pagination.; `limit` (query; integer) — Maximum number of records to return..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `POST /booking/promo-codes`

Create new promo code

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `_id`:string, `name`:string, `status`:string (active|inactive), `type`:string (fixed|percent), `_f_discount`:number, `_mcdiscount`:object, `maxUsesCount`:number, `maxUsesCountPerGuest`:number, `usedCount`:integer, `usedCountPerGuest`:integer, `useWithOtherPromotions`:boolean, `periodRestrictions`:object, `calendarRestrictions`:object, `productRestrictions`:object, `userRestrictions`:object, `target`:string (dailyPrice|total).
- **Respostas:** 201 application/json: `_id`:string, `name`:string, `status`:string (active|inactive), `type`:string (fixed|percent), `_f_discount`:number, `_mcdiscount`:object, `maxUsesCount`:number, `maxUsesCountPerGuest`:number, `usedCount`:integer, `usedCountPerGuest`:integer, `useWithOtherPromotions`:boolean, `periodRestrictions`:object, `calendarRestrictions`:object, `productRestrictions`:object, `userRestrictions`:object, `target`:string (dailyPrice|total); 4XX application/json: `message`:string.

### `GET /booking/promo-codes/{_id}`

Returns promo code detailed info.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `_id*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `name`:string, `status`:string (active|inactive), `type`:string (fixed|percent), `_f_discount`:number, `_mcdiscount`:object, `maxUsesCount`:number, `maxUsesCountPerGuest`:number, `usedCount`:integer, `usedCountPerGuest`:integer, `useWithOtherPromotions`:boolean, `periodRestrictions`:object, `calendarRestrictions`:object, `productRestrictions`:object, `userRestrictions`:object, `target`:string (dailyPrice|total); 4XX application/json: `message`:string.

### `PATCH /booking/promo-codes/{_id}`

Update promo code item

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `_id*` (path; string).
- **Body (obrigatório):** `application/json`: `_id`:string, `name`:string, `status`:string (active|inactive), `type`:string (fixed|percent), `_f_discount`:number, `_mcdiscount`:object, `maxUsesCount`:number, `maxUsesCountPerGuest`:number, `usedCount`:integer, `usedCountPerGuest`:integer, `useWithOtherPromotions`:boolean, `periodRestrictions`:object, `calendarRestrictions`:object, `productRestrictions`:object, `userRestrictions`:object, `target`:string (dailyPrice|total).
- **Respostas:** 200 application/json: `_id`:string, `name`:string, `status`:string (active|inactive), `type`:string (fixed|percent), `_f_discount`:number, `_mcdiscount`:object, `maxUsesCount`:number, `maxUsesCountPerGuest`:number, `usedCount`:integer, `usedCountPerGuest`:integer, `useWithOtherPromotions`:boolean, `periodRestrictions`:object, `calendarRestrictions`:object, `productRestrictions`:object, `userRestrictions`:object, `target`:string (dailyPrice|total); 4XX application/json: `message`:string.

### `DELETE /booking/promo-codes/{_id}`

Remove the promo code.

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `_id*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `name`:string, `status`:string (active|inactive), `type`:string (fixed|percent), `_f_discount`:number, `_mcdiscount`:object, `maxUsesCount`:number, `maxUsesCountPerGuest`:number, `usedCount`:integer, `usedCountPerGuest`:integer, `useWithOtherPromotions`:boolean, `periodRestrictions`:object, `calendarRestrictions`:object, `productRestrictions`:object, `userRestrictions`:object, `target`:string (dailyPrice|total); 4XX application/json: `message`:string.


## Reviews

### `GET /reviews/guest`

Retrieve guest reviews

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `from*` (query; string) — Start date.; `to*` (query; string) — End date.; `limit` (query; integer) — Number of results to return per page. Must be between 1 and 100.; `page` (query; integer) — Specifies the page number of the results to retrieve. Used in conjunction with the 'page size' parameter to implement pagination.; `clientId` (query; string); `listingId` (query; one of: string; string); `reserveId` (query; one of: string; string; string) — UniqID, InternalID or partnerCode.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `totalReviews`:integer, `reviewList`:array[one of: object & object; object & object; object & object; object & object]; 4XX application/json: `message`:string.

### `POST /reviews/guest`

Create a new guest internal review

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `day`:string, `cleaningRating`:number, `checkinRating`:number, `checkoutRating`:number, `reservationRating`:number, `maintenanceRating`:number, `treatmentRating`:number, `rating`:number, `positiveTraits`:string, `negativeTraits`:string, `reviewText`:string, `clientName`:string, `clientId`:string, `partnerId`:string, `listingId`:one of: string; string, `reserveId`:one of: string; string.
- **Respostas:** 201 application/json: `_id`:string, `status`:string, `day`:string, `apartment`:object, `client`:object, `partner`:object, `responser`:object, `cleanUser`:object, `checkInUser`:object, `checkOutUser`:object, `reserve`:object, `source`:string (internal), `cleaningRating`:number, `checkinRating`:number, `checkoutRating`:number, `reservationRating`:number, `maintenanceRating`:number, `treatmentRating`:number, `rating`:number, `positiveTraits`:string, `negativeTraits`:string, `reviewText`:string, `hostResponse`:string; 4XX application/json: `message`:string.

### `GET /reviews/guest/{reviewId}`

Retrieve a guest review

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `reviewId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `review`:one of: object & object; object & object; object & object; object & object; 4XX application/json: `message`:string.

### `PATCH /reviews/guest/{reviewId}`

Update a guest internal review

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `reviewId*` (path; string).
- **Body (obrigatório):** `application/json`: `day`:string, `cleaningRating`:number, `checkinRating`:number, `checkoutRating`:number, `reservationRating`:number, `maintenanceRating`:number, `treatmentRating`:number, `rating`:number, `positiveTraits`:string, `negativeTraits`:string, `reviewText`:string, `clientName`:string, `clientId`:string, `partnerId`:string, `listingId`:one of: string; string, `reserveId`:one of: string; string.
- **Respostas:** 200 application/json: `_id`:string, `status`:string, `day`:string, `apartment`:object, `client`:object, `partner`:object, `responser`:object, `cleanUser`:object, `checkInUser`:object, `checkOutUser`:object, `reserve`:object, `source`:string (internal), `cleaningRating`:number, `checkinRating`:number, `checkoutRating`:number, `reservationRating`:number, `maintenanceRating`:number, `treatmentRating`:number, `rating`:number, `positiveTraits`:string, `negativeTraits`:string, `reviewText`:string, `hostResponse`:string; 4XX application/json: `message`:string.


## SMM

### `GET /smm/threads`

Gets a list of threads

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `from*` (query; string) — Start date to filter. Will filter only threads with last message date greater than this date; `to*` (query; string) — End date to filter. Will filter only threads with last message date less than this date; `channel` (query; array[airbnb|bookingcom|expedia|website|whatsapp]) — Array of channels to filter; `status` (query; array[active|archive]) — Status to filter; `type` (query; string (any|noResYet|arrival|departure|lastAnswer)) — The type to filter. Can be 'any', 'noResYet', 'arrival', 'departure', 'lastAnswer'; `apartment` (query; array[one of: string; string]) — Apartment ids to filter; `reserveId` (query; one of: string; string; string) — UniqID, InternalID or partnerCode; `contentSearch` (query; string) — Search string to filter; `onlyUnread` (query; boolean) — Filter by unread status; `skip` (query; integer) — Number of items to skip; `limit` (query; integer) — Amount of items to return.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /smm/threads/{threadId}`

Gets a thread by id

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `threadId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `_idthread`:string, `channel`:string (airbnb|bookingcom|expedia|website|whatsapp), `status`:string (active|archived), `reservation`:object, `guest`:object, `partner`:object, `messages`:array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /smm/threads/{threadId}/messages`

Gets a thread's array of messages by id

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `threadId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `POST /smm/threads/{threadId}/messages`

Creates a new message in a thread

- **Efeito provável:** external action — may create a checkout, send, or enqueue communication; confirm target and content.
- **Parâmetros:** `threadId*` (path; string).
- **Body (obrigatório):** `multipart/form-data`: `attachments`:string, binary, `text`:string.
- **Respostas:** 201 application/json: array[string]; 404 application/json: `message`:string; 500 application/json: `message`:string; 4XX application/json: `message`:string.


## Statistics

### `GET /statistics/active-listings-history`

Retrieve active listings history

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `from` (query; string) — Start date. Defaults to 6 days before 'to'.; `to` (query; string) — End date. Defaults to today..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.


## Surveys

### `GET /surveys/{widgetId}/users/{_iduser}`

Gets whether a survey may be shown to a user

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `widgetId*` (path; string) — track.co widget id of the survey; `_iduser*` (path; string) — User the survey display state refers to.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `key`*:string, `enabled`*:boolean, `_dt`:string, date-time; 404 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.

### `PUT /surveys/{widgetId}/users/{_iduser}`

Allows or revokes the display of a survey for a user

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `widgetId*` (path; string) — track.co widget id of the survey; `_iduser*` (path; string) — User the survey display state refers to.
- **Body (obrigatório):** `application/json`: `enabled`*:boolean.
- **Respostas:** 200 application/json: `key`*:string, `enabled`*:boolean, `_dt`:string, date-time; 404 application/json: `message`:string; 409 application/json: `message`:string; 4XX application/json: `message`:string.


## Task Manager

### `POST /task-manager/api/attachments/upload`

Create attachment

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_CreateAttachment`
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `multipart/form-data`: `taskId`*:string, `uploadedBy`*:string, `files`*:array[string, binary].
- **Respostas:** 201 application/json: array[object]; default application/json: unspecified.

### `DELETE /task-manager/api/attachments/{attachmentId}`

Delete attachment

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_DeleteAttachment`
- **Parâmetros:** `attachmentId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 204: sem body/content documentado; default application/json: unspecified.

### `GET /task-manager/api/automations`

List automations

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetAutomations`
- **Parâmetros:** nenhum listado na operação.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `automations`*:array[object], `total`*:number, double; 401 application/json: `error`*:string; 500 application/json: `error`*:string; default application/json: unspecified.

### `POST /task-manager/api/automations`

Create automation

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_CreateAutomation`
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `taskTypeId`*:string, `title`*:string, `description`:string, `isActive`:boolean, `automateAllListings`:boolean, `listingsId`:array[string], `groupsId`:array[string], `propertiesId`:array[string], `trigger`:string (beforeCheckin|afterCheckin|beforeCheckout|afterCheckout), `offsetMinutes`:number, double.
- **Respostas:** 201 application/json: `id`*:string, `taskTypeId`*:string, `title`*:string, `description`:string, `isActive`*:boolean, `automateAllListings`*:boolean, `listingsId`:array[string], `groupsId`:array[string], `propertiesId`:array[string], `resolvedListingsId`:array[string], `trigger`*:string (beforeCheckin|afterCheckin|beforeCheckout|afterCheckout), `offsetMinutes`*:number, double, `createdBy`*:string, `updatedBy`*:string, `createdAt`*:string, date-time, `updatedAt`*:string, date-time, `_sn`*:string; 400 application/json: `error`*:string; 401 application/json: `error`*:string; default application/json: unspecified.

### `GET /task-manager/api/automations/{automationId}`

Get automation

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetAutomation`
- **Parâmetros:** `automationId*` (path; string) — Unique identifier of the automation.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `id`*:string, `taskTypeId`*:string, `title`*:string, `description`:string, `isActive`*:boolean, `automateAllListings`*:boolean, `listingsId`:array[string], `groupsId`:array[string], `propertiesId`:array[string], `resolvedListingsId`:array[string], `trigger`*:string (beforeCheckin|afterCheckin|beforeCheckout|afterCheckout), `offsetMinutes`*:number, double, `createdBy`*:string, `updatedBy`*:string, `createdAt`*:string, date-time, `updatedAt`*:string, date-time, `_sn`*:string; 401 application/json: `error`*:string; 404 application/json: `error`*:string; 500 application/json: `error`*:string; default application/json: unspecified.

### `PUT /task-manager/api/automations/{automationId}`

Update automation

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_UpdateAutomation`
- **Parâmetros:** `automationId*` (path; string) — Unique identifier of the automation.
- **Body (obrigatório):** `application/json`: `taskTypeId`:string, `title`:string, `description`:string, `isActive`:boolean, `automateAllListings`:boolean, `listingsId`:array[string], `groupsId`:array[string], `propertiesId`:array[string], `trigger`:string (beforeCheckin|afterCheckin|beforeCheckout|afterCheckout), `offsetMinutes`:number, double.
- **Respostas:** 200 application/json: `id`*:string, `taskTypeId`*:string, `title`*:string, `description`:string, `isActive`*:boolean, `automateAllListings`*:boolean, `listingsId`:array[string], `groupsId`:array[string], `propertiesId`:array[string], `resolvedListingsId`:array[string], `trigger`*:string (beforeCheckin|afterCheckin|beforeCheckout|afterCheckout), `offsetMinutes`*:number, double, `createdBy`*:string, `updatedBy`*:string, `createdAt`*:string, date-time, `updatedAt`*:string, date-time, `_sn`*:string; 400 application/json: `error`*:string; 401 application/json: `error`*:string; 404 application/json: `error`*:string; default application/json: unspecified.

### `DELETE /task-manager/api/automations/{automationId}`

Delete automation

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_DeleteAutomation`
- **Parâmetros:** `automationId*` (path; string) — Unique identifier of the automation.
- **Body:** não indicado no contrato.
- **Respostas:** 204: sem body/content documentado; 401 application/json: `error`*:string; 404 application/json: `error`*:string; 500 application/json: `error`*:string; default application/json: unspecified.

### `POST /task-manager/api/columns`

Create column

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_CreateColumn`
- **Parâmetros:** `X-Sn*` (header; string); `X-User-Id*` (header; string).
- **Body (obrigatório):** `application/json`: `name`*:string, `statusId`*:string.
- **Respostas:** 201 application/json: `id`*:string, `name`*:string, `order`*:number, double, `statusId`*:string, `createdBy`*:string, `updatedBy`*:string, `statusColor`:string, `_sn`*:string; default application/json: unspecified.

### `GET /task-manager/api/columns/all`

Get all columns

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetColumns`
- **Parâmetros:** `X-Sn*` (header; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `columns`*:array[object], `total`*:number, double; default application/json: unspecified.

### `GET /task-manager/api/columns/{columnId}`

Get column

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetColumn`
- **Parâmetros:** `columnId*` (path; string) — Unique identifier of the column to retrieve.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `id`*:string, `name`*:string, `order`*:number, double, `statusId`*:string, `createdBy`*:string, `updatedBy`*:string, `statusColor`:string, `_sn`*:string; default application/json: unspecified.

### `PUT /task-manager/api/columns/{columnId}`

Update column

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_UpdateColumn`
- **Parâmetros:** `columnId*` (path; string) — Unique identifier of the column to update; `X-Sn*` (header; string); `X-User-Id*` (header; string).
- **Body (obrigatório):** `application/json`: `name`:string, `order`:number, double, `statusId`:one of: string; string.
- **Respostas:** 200 application/json: `id`*:string, `name`*:string, `order`*:number, double, `statusId`*:string, `createdBy`*:string, `updatedBy`*:string, `statusColor`:string, `_sn`*:string; default application/json: unspecified.

### `DELETE /task-manager/api/columns/{columnId}`

Soft delete column

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_DeleteColumn`
- **Parâmetros:** `columnId*` (path; string) — Unique identifier of the column to soft delete.
- **Body:** não indicado no contrato.
- **Respostas:** 204: sem body/content documentado; default application/json: unspecified.

### `GET /task-manager/api/columns/{columnId}/tasks`

Get tasks from column

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetTasksFromColumn`
- **Parâmetros:** `columnId*` (path; string) — Unique identifier of the column to retrieve tasks from; `sortColumn` (query; string (createdAtDesc|dueDateAsc|dueDateDesc|nameAsc|nameDesc|priorityAsc|priorityDesc)) — Column to sort by (optional, default: createdAtDesc); `titleOrDescription` (query; string) — Title or description filter (optional); `assigneeId` (query; string) — Assignee filter (optional); `priority` (query; string (low|medium|high)) — Priority filter (optional); `periodStart` (query; string) — Period start filter (optional); `periodEnd` (query; string) — Period end filter (optional); `page` (query; number, double) — Page number for pagination (optional, default: 1); `pageSize` (query; number, double) — Number of tasks per page (optional, default: 20, max: 100).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `tasks`*:array[object], `total`*:number, double, `page`*:number, double, `pageSize`*:number, double, `hasMore`*:boolean; default application/json: unspecified.

### `POST /task-manager/api/columns/{columnId}/unarchive`

Unarchive column

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_UnarchiveColumn`
- **Parâmetros:** `columnId*` (path; string) — Unique identifier of the column to unarchive.
- **Body:** não indicado no contrato.
- **Respostas:** 204: sem body/content documentado; default application/json: unspecified.

### `GET /task-manager/api/groups`

List listing groups from the host

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetGroups`
- **Parâmetros:** `skip` (query; number, double) — Number of records to skip for pagination. minimum: 0, optional; `limit` (query; number, double) — Maximum number of records to return. optional; `status` (query; string (active|inactive)) — Group status filter. optional, default: 'active'.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `groups`*:array[object]; 400 application/json: `error`*:string; 401 application/json: `error`*:string; 500 application/json: `error`*:string; default application/json: unspecified.

### `GET /task-manager/api/listings`

Gets all listings from the host

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetListings`
- **Parâmetros:** `Authorization*` (header; string) — The authorization header; `X-Host-Origin*` (header; string) — The host origin header; `skip` (query; number, double) — Number of records to skip for pagination. minimum: 0, optional, default: 0; `limit` (query; number, double) — Maximum number of records to return. minimum: 1 maximum: 100, optional, default: 20; `status` (query; array[active|hidden|inactive|draft]) — Listing activity status. optional; `groupId` (query; string) — Listing's group identifier. optional; `rel` (query; string (master|child)) — Listing's relation. Allows to filter master/child listings. optional; `propertyId` (query; one of: string; string) — Property identifier. optional; `listingCategories` (query; array[vacationRental|longTermRental|forSale]) — Filter by listing categories/types. optional.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 400: sem body/content documentado; 500: sem body/content documentado; default application/json: unspecified.

### `GET /task-manager/api/properties`

List properties from the host

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetProperties`
- **Parâmetros:** `skip` (query; number, double) — Number of records to skip for pagination. minimum: 0, optional; `limit` (query; number, double) — Maximum number of records to return. optional; `status` (query; string (active|inactive|draft)) — Property status filter. optional, default: 'active'.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `properties`*:array[object]; 400 application/json: `error`*:string; 401 application/json: `error`*:string; 500 application/json: `error`*:string; default application/json: unspecified.

### `GET /task-manager/api/status`

Get all statuses

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetStatuses`
- **Parâmetros:** `X-Sn*` (header; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; default application/json: unspecified.

### `GET /task-manager/api/task-types`

List task types

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetTaskTypes`
- **Parâmetros:** nenhum listado na operação.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `taskTypes`*:array[object], `total`*:number, double; 400 application/json: `error`*:string; 401 application/json: `error`*:string; default application/json: unspecified.

### `GET /task-manager/api/task-types/{taskTypeId}`

Get task type

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetTaskType`
- **Parâmetros:** `taskTypeId*` (path; string) — Unique identifier of the task type.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `id`*:string, `name`*:string, `label`*:string, `description`:string, `icon`:string, `color`:string, `isSystem`*:boolean, `createdBy`*:string, `updatedBy`*:string; 401 application/json: `error`*:string; 404 application/json: `error`*:string; 500 application/json: `error`*:string; default application/json: unspecified.

### `POST /task-manager/api/tasks`

Create task

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_CreateTask`
- **Parâmetros:** `X-Sn*` (header; string); `X-User-Id*` (header; string).
- **Body (obrigatório):** `application/json`: `title`*:string, `description`:string, `priority`:string (low|medium|high), `columnId`*:string, `assigneeId`:string, `dueDate`:string, date-time, `order`:number, double, `listingId`:string.
- **Respostas:** 201 application/json: `id`*:string, `title`*:string, `description`:string, `priority`*:string (low|medium|high), `columnId`*:string, `assigneeId`:string, `dueDate`:string, `order`*:number, double, `createdBy`*:string, `updatedBy`*:string, `listingId`:string, `_sn`*:string; default application/json: unspecified.

### `GET /task-manager/api/tasks/priorities`

Get priority levels

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetPriorityLevels`
- **Parâmetros:** nenhum listado na operação.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[string]; default application/json: unspecified.

### `GET /task-manager/api/tasks/{taskId}`

Get task

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **operationId:** `TaskManager_GetTask`
- **Parâmetros:** `taskId*` (path; string) — Unique identifier of the task to retrieve.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `id`*:string, `title`*:string, `description`:string, `priority`*:string (low|medium|high), `columnId`*:string, `assigneeId`:string, `dueDate`:string, `order`*:number, double, `createdBy`*:string, `updatedBy`*:string, `listingId`:string, `_sn`*:string; default application/json: unspecified.

### `PUT /task-manager/api/tasks/{taskId}`

Update task

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_UpdateTask`
- **Parâmetros:** `taskId*` (path; string) — Unique identifier of the task to update; `X-User-Id*` (header; string).
- **Body (obrigatório):** `application/json`: `title`:string, `description`:string, `priority`:string (low|medium|high), `columnId`:string, `assigneeId`:string, `dueDate`:string, date-time, `order`:number, double, `listingId`:string.
- **Respostas:** 200 application/json: `id`*:string, `title`*:string, `description`:string, `priority`*:string (low|medium|high), `columnId`*:string, `assigneeId`:string, `dueDate`:string, `order`*:number, double, `createdBy`*:string, `updatedBy`*:string, `listingId`:string, `_sn`*:string; default application/json: unspecified.

### `DELETE /task-manager/api/tasks/{taskId}`

Delete task

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_DeleteTask`
- **Parâmetros:** `taskId*` (path; string) — Unique identifier of the task to permanently delete.
- **Body:** não indicado no contrato.
- **Respostas:** 204: sem body/content documentado; default application/json: unspecified.

### `POST /task-manager/api/tasks/{taskId}/move`

Move task

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **operationId:** `TaskManager_MoveTask`
- **Parâmetros:** `taskId*` (path; string) — Unique identifier of the task to move; `X-User-Id*` (header; string).
- **Body (obrigatório):** `application/json`: `columnId`*:string.
- **Respostas:** 200 application/json: `id`*:string, `title`*:string, `description`:string, `priority`*:string (low|medium|high), `columnId`*:string, `assigneeId`:string, `dueDate`:string, `order`*:number, double, `createdBy`*:string, `updatedBy`*:string, `listingId`:string, `_sn`*:string; default application/json: unspecified.


## Translation

### `GET /translation/bathroom-types`

Returns multilang list of bathroom types

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/bed-types`

Returns multilang list of bed types

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/bedroom-types`

Returns multilang list of bedroom types

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/communication-ways`

Returns communication ways items

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `id` (query; string) — Pass an optional search id to look for id.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/extra-services-categories`

Returns extra services categories

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking; `id` (query; string) — Pass an optional search id for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/extra-services-items`

Returns extra services items

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking; `id` (query; string) — Pass an optional search id to look for id.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/image-tags`

Returns multilang list of image tag types

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/inventory-categories`

Returns multilang inventory category list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /translation/inventory-items`

Returns multilang inventory list.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /translation/inventory-items-conditions`

Returns multilang conditions for inventory items.

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /translation/listing-amenities`

Returns listing amenities

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/listing-types`

Returns multilang list of listing types

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/marketing-sources`

Returns marketing sources items

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `id` (query; string) — Pass an optional search id to look for id.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/measure-units`

Returns measure units

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/multi-unit-property-types`

Returns multilang list of multi-unit property types

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/neighbourhoods`

Returns neighbourhoods

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/other-living-room-types`

Returns multilang list of other living room types

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/property-amenities`

Returns property amenities

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/room-subtypes`

Returns multilang list of room subtypes (semantic subtypes of other dependency rooms, e.g. kitchen, dining room, balcony, laundry, outdoor area)

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Optional case-insensitive substring filter applied to translated titles (e.g. matches any locale value in _mstitle).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `POST /translation/room-subtypes`

Creates a room subtype owned by the account

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** nenhum listado na operação.
- **Body (obrigatório):** `application/json`: `_mstitle`*:object.
- **Respostas:** 201 application/json: `_id`*:string, `_mstitle`*:object, `_b_readonly`*:integer (0|1); 400 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /translation/room-subtypes/{subtypeId}`

Returns a single room subtype

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `subtypeId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`*:string, `_mstitle`*:object, `_b_readonly`*:integer (0|1); 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `PATCH /translation/room-subtypes/{subtypeId}`

Updates a room subtype owned by the account. Subtypes provided by Stays (`_b_readonly` is 1) cannot be updated

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `subtypeId*` (path; string).
- **Body (obrigatório):** `application/json`: `_mstitle`*:object.
- **Respostas:** 200 application/json: `_id`*:string, `_mstitle`*:object, `_b_readonly`*:integer (0|1); 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `DELETE /translation/room-subtypes/{subtypeId}`

Deletes a room subtype owned by the account. Subtypes provided by Stays (`_b_readonly` is 1) cannot be deleted. Rooms already using the subtype keep their `_idsubtype`

- **Efeito provável:** mutation — changes persistent data; confirm target, scope, and final state.
- **Parâmetros:** `subtypeId*` (path; string).
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`*:string, `_mstitle`*:object, `_b_readonly`*:integer (0|1); 400 application/json: `message`:string; 404 application/json: `message`:string; 4XX application/json: `message`:string.

### `GET /translation/room-types`

Returns multilang list of room types

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.

### `GET /translation/single-unit-property-types`

Returns multilang list of single-unit property types

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `searchString` (query; string) — Pass an optional search string for looking.
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: array[object]; 4XX application/json: `message`:string.


## Users

### `GET /users`

Gets all users

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `skip` (query; integer) — Number of records to skip for pagination.; `limit` (query; integer) — Maximum number of records to return.; `search` (query; string) — Search users by name or email. Minimum 2 characters required.; `staffs` (query; integer) — Set to 1 to return only staff users: users with at least one job assigned or with access to the admin panel. Default 0 returns all active users..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `list`:array[object], `count`:integer; 4XX application/json: `message`:string.

### `GET /users/me`

Gets a currently logged-in user

- **Efeito provável:** read — retrieves data; minimize personal/financial fields in output.
- **Parâmetros:** `x-stays-internal-user-token*` (header; string) — Internal token for user authentication. Can be obtained via /core/exchange-token endpoint..
- **Body:** não indicado no contrato.
- **Respostas:** 200 application/json: `_id`:string, `email`:string, `rawAdr`:string, `login`:string, `name`:string, `language`:string (en_US|pt_BR|de_DE|es_ES|ru_RU|sv_SE|it_IT|fr_FR|pt_PT|el_GR), `permissions`:array[string]; 4XX application/json: `message`:string.

## Confirmação para alterações

- Consultas só precisam dos parâmetros necessários ao pedido; restrinja período e escopo.
- Uma mudança pontual pode ser executada quando o pedido identifica claramente ação, entidade, valor e período, e a autorização está explícita.
- Antes de alterações amplas — múltiplos anúncios/reservas/proprietários, regras globais, sincronização externa, configurações de pagamento/financeiro, lote de calendário, exclusão difícil de reverter ou comunicação em massa — prepare um plano concreto e peça confirmação explícita após mostrar alvo, escopo, valores/datas e efeitos esperados.
- Depois da escrita, releia o recurso ou calendário afetado e reporte estado real. Se a resposta não confirmar o resultado, pare; não repita uma chamada não idempotente.

Este catálogo não substitui o OpenAPI nem comprova permissões da conta. Schemas, enums, respostas e autorização podem mudar.
