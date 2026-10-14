# Especificação de execução — checkout e pagamentos próprios CRCN

**Estado:** plano de produto e engenharia; ainda não habilita vendas. **Data:** 13/10/2026. **Relacionados:** [PRD](prd-vendas-diretas.md), [ADR 0001](adr/0001-checkout-proprio-e-informacoes-em-camadas.md), [roadmap](roadmap-vendas-diretas.md), [MVP](mvp-vendas-diretas.md).

## 1. Objetivo e fronteiras

Permitir que o hóspede escolha uma acomodação, conheça o preço e as condições aplicáveis, pague **100% do valor à CRCN** por Pix ou cartão **dentro do site**, e receba uma reserva efetivamente confirmada na Stays. O pedido da CRCN coordena a cotação, a pré-reserva, a cobrança, a confirmação, o pós-venda e a conciliação. O checkout hospedado da Stays não participa da jornada.

O primeiro lançamento usa Mercado Pago. Cielo é uma possível segunda integração, após o fluxo e a conciliação estarem estáveis. Repasse ao proprietário, com regra variável por contrato e rotina no dia 15, pode ser manual e auditável no MVP.

**Não chamar de confirmado:** pedido cotado, pré-reserva `reserved`, Pix gerado, cartão em análise ou pagamento aprovado sem confirmação da Stays. **Não emitir voucher definitivo** antes de pagamento aprovado, reserva confirmada e dados operacionais necessários completos. A liberação de pulseiras/acesso depende de confirmação específica do empreendimento.

## 2. Situação do código em 13/10/2026

| Área | Estado verificado | Próxima entrega |
| --- | --- | --- |
| Cotação e disponibilidade | `DirectCheckoutService` revalida disponibilidade e preço antes do pedido. | Conferir composição do total, taxas e capacidade para as unidades piloto. |
| Pedido local | Modelo, enum, migração e `POST /api/checkout` estão implementados localmente, com chave de idempotência e snapshot versionado de condições. | Revisar transições, histórico e idempotência no fluxo completo. |
| Pré-reserva | O fluxo local cria `reserved`, registra ação/ID externo e exige prazo interno configurado. | Validar semântica e liberação na conta CRCN; aprovar prazo por imóvel/tarifa antes de configurar ambiente. |
| Pagamento | Criação de tentativa Mercado Pago, tokenização recebida pelo backend, webhook assinado e reconciliação autoritativa estão ligados ao pedido. | Validar com credenciais de teste e cobrir estados Pix/cartão; cobranças seguem bloqueadas. |
| Confirmação Stays | Pagamento aprovado pode iniciar confirmação `booked` e registro financeiro idempotente na Stays, com estados de atenção em falhas. | Validar contratos e recuperação em ambiente de teste, sem chamadas mutáveis de produção. |
| Interface | `CheckoutModal` consulta condições aprovadas, mas deixa formulário e compra desabilitados. `/reservar/{listingId}` abre o anúncio com filtros; `/checkout/{referenciaPublica}` retoma pedido com token no header. | Aprovar snapshots comerciais e completar a interface Pix/cartão e a transição da seleção para a criação do pedido. |
| Pós-venda | Viagens `completed` agora aparecem em histórico com comprovante; pedidos de visitantes ainda não entram em “Minhas viagens”. | Associar o pedido ao acesso do hóspede, concluir coleta de dados, documento, e-mail e suporte. |

O código descrito está em alterações locais não integradas e não foi validado ponta a ponta. As flags de checkout, pagamentos e confirmação permanecem desligadas; o catálogo não contém snapshots aprovados e não há prazo de retenção Stays configurado. Preservar alterações locais, `server.ts` e contratos `/api/*` durante a migração. Não usar credenciais reais nem iniciar cobrança ou escrita mutável na Stays de produção.

## 3. Fontes de verdade e identificadores

| Informação | Fonte autoritativa | Cópia local necessária |
| --- | --- | --- |
| Inventário, regras de ocupação, cotação e reserva | Stays | ID do anúncio/reserva, cotação e resposta reduzida para auditoria. |
| Estado e valor de pagamento/reembolso | Gateway | ID externo, método, estado, valor, moeda, eventos e instantes. |
| Condições exibidas e aceitas, estado da jornada | Pedido CRCN | Snapshot versionado, aceite, prazos e histórico. |
| Dados exigidos para check-in | Ficha operacional aprovada por imóvel | Estado de preenchimento e envio, com acesso restrito. |

O `order_id` UUID é a referência interna e o `external_reference` enviado ao gateway. Guardar também `stays_reservation_id`, `gateway_payment_id`, IDs de tentativas, reembolsos e notificações. Nenhuma busca por e-mail/nome deve ser usada para conciliar pagamentos. Toda operação mutável usa chave de idempotência própria e estável; repetir uma tentativa com payload diferente é erro. O fluxo local persiste a chave Mercado Pago antes da chamada e, para Pix, guarda o payload de retry cifrado até receber um ID. Cartão nunca persiste o token: submissões sem resposta/ID ficam em atenção para evitar novo POST ambíguo. Reenvio Pix usa a mesma chave e payload, limitado a três submissões no total e somente com as flags de cobrança e confirmação ligadas; desligá-las bloqueia esse retry.

## 4. Jornada do hóspede e conteúdo de cada tela

1. **Anúncio:** fotos e descrição reais, ocupação, calendário, horários, itens presentes/ausentes, taxas externas conhecidas, condições de cancelamento daquela unidade/tarifa e suporte. A cotação mostra o total e sua composição.
2. **Checkout:** no celular, resumo compacto acessível durante toda a compra; imóvel, datas, hóspedes, total em BRL, taxas e parcelas/juros reais. Pedir nome, e-mail, telefone e documentos somente quando a integração de cobrança/reserva exigir. Comprar sem criar conta. Campo de cupom apenas se houver oferta real.
3. **Condições:** destacar 2–3 regras que podem mudar a decisão, prazo exato de cancelamento/reembolso e links para condições completas, privacidade e termos. Aceite independente da inscrição em marketing. Guardar versão, horário e conteúdo aplicável no pedido. O contrato enviado depois deve concordar com essas condições.
4. **Pagamento:** selecionar Pix ou cartão. Para cartão, usar componente/tokenização do Mercado Pago; PAN e CVV não passam pelo Laravel, banco, logs ou analytics. Mostrar parcelas e custo total antes da confirmação. Para Pix, mostrar QR, copia e cola, favorecido/valor e validade reais. O relógio representa somente prazo efetivo do pagamento e da pré-reserva.
5. **Aguardando:** Pix pendente ou cartão em análise mostra status e próxima ação. Fechar o navegador não altera o pedido. A consulta por ID público opaco/autorização recupera o estado sem expor PII.
6. **Pagamento recebido:** comunicar “pagamento recebido; estamos confirmando a reserva” até a Stays confirmar. Se houver falha, abrir caso urgente e informar atendimento sem prometer reserva.
7. **Confirmado:** mostrar localizador real, imóvel/datas/hóspedes, valores recebidos, condições, canal de suporte e próximos passos. Enviar e-mail transacional. Coletar dados adicionais de check-in depois, com prazo claro; voucher final somente quando estiver correto e operacionalmente liberado.

Textos e estados de carregamento/erro devem manter o contexto sem apagar campos não sensíveis. Erros de cartão não devem revelar detalhes internos do provedor. Foco de teclado, labels, mensagens acessíveis e retorno do foco no diálogo seguem as convenções do frontend.

### Lições de checkout de infoproduto aplicadas

Adotar uma oferta clara, poucos campos, pagamento rápido, estado pós-pagamento explícito e recuperação de falha. Prova social deve ser verificável e preferencialmente aparecer no anúncio; não usar notificações de compra fabricadas. Contador só pode refletir retenção real. *Order bump*, upsell, pop-up de saída e recuperação automática de carrinho ficam fora do MVP; um adicional de hospedagem só pode ser vendido se puder ser cumprido e registrado.

### URLs de seleção, checkout e retomada

Usar dois momentos distintos. **Antes de existir pedido**, a URL pode preservar escolhas públicas e editáveis, por exemplo `/reservar/{listingId}?checkin=2026-10-18&checkout=2026-10-23&adults=2&children=0&infants=0&pets=0`. Esses parâmetros apenas preenchem a interface: não constituem cotação, bloqueio, aceite ou autorização de pagamento. O backend valida formato, ordem das datas e capacidade, consulta novamente a Stays e devolve preço e condições atuais. `listingId` na rota representa o identificador público do anúncio; o ID Stays correspondente é resolvido no servidor. Não duplicar o mesmo imóvel em `productId` salvo necessidade demonstrada.

**Após criar o pedido**, usar uma rota de retomada como `/checkout/{referenciaPublica}`. Ela consulta o pedido persistido e seu estado; datas, hóspedes, valor, termos aceitos e prazo vêm do servidor, não de parâmetros anexados à URL. `referenciaPublica` deve ser opaca, não sequencial e diferente de IDs de gateway/Stays quando possível. Sua mera posse não deve liberar nome, e-mail, telefone, QR Pix ou dados da viagem: exigir sessão autenticada ou credencial de retomada curta e restrita. Definir expiração, revogação e comportamento de troca de conta para essa credencial. Não incluir o segredo de retomada em URLs enviadas a ferramentas de analytics.

| Parâmetro candidato | Uso antes do pedido | Após criar o pedido |
| --- | --- | --- |
| `checkin`, `checkout`, `adults`, `children`, `infants`, `pets` | Pré-preencher seleção; sempre revalidar no servidor. | Ignorar como fonte de verdade. Alteração exige nova cotação, nova pré-reserva quando aplicável e novo aceite. |
| `installments` | Preferência opcional de apresentação, somente se cartão/parcelamento estiver habilitado. | Validar oferta e total do gateway; não alterar o valor cobrado por query string. |
| `currency` | O MVP suporta apenas BRL; omitir se não houver escolha real. | Valor/moeda vêm do pedido e do gateway. |
| `coupon` | Código opcional, se existir promoção cadastrada e validada pelo servidor. | Desconto precisa estar congelado no pedido antes da cobrança. |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_id`, `utm_content`, `gclid` | Atribuição de campanha, com limites de tamanho e sem dados pessoais. | Guardar atribuição permitida no pedido; não depender de repassar toda a query pelo checkout. |
| `orderId`, `paymentId`, token de cartão, preço, CPF, e-mail | Não usar. | Não expor em query string como prova de identidade, pagamento ou preço. |

Ao editar datas/hóspedes depois do pedido, não reutilizar a mesma cobrança ou a mesma oferta congelada: criar uma nova revisão/pedido conforme o estado atual e invalidar ou resolver a pré-reserva anterior antes de prosseguir. Links de campanha levam à seleção; links transacionais de e-mail levam a uma retomada protegida. Rotas de checkout e retorno devem evitar indexação, limpar parâmetros desnecessários do histórico quando apropriado e configurar política de `Referrer-Policy` compatível com os recursos externos. Nunca registrar URL completa contendo credenciais ou dados pessoais.

O caminho pré-pedido `/reservar/{listingId}` abre o anúncio e pré-preenche filtros de datas e hóspedes; a cotação e a criação do pedido continuam sendo validadas no servidor. A retomada `/checkout/{referenciaPublica}` já existe localmente: ela exige `X-Checkout-Resume-Token`, sem expor PII na resposta. O token é guardado na sessão do navegador que criou o pedido; um fluxo de recuperação por e-mail ou sessão autenticada ainda precisa ser desenhado antes de oferecer retomada entre dispositivos. A resposta inclui o estado resumido da última tentativa; QR e copia e cola Pix só aparecem enquanto a tentativa estiver pendente/em análise e dentro da validade, sem iniciar uma nova cobrança.

## 5. Sequência transacional

```mermaid
sequenceDiagram
    actor H as Hóspede
    participant F as Site
    participant B as API CRCN
    participant S as Stays
    participant M as Mercado Pago
    H->>F: Escolhe imóvel, datas e hóspedes
    F->>B: Solicita cotação/checkout
    B->>S: Revalida disponibilidade e preço
    B-->>F: Total e condições aplicáveis
    H->>F: Informa dados e aceita condições
    F->>B: Cria pedido com Idempotency-Key
    B->>S: Cria pré-reserva reserved
    S-->>B: ID da pré-reserva
    B-->>F: Pedido, prazo e métodos disponíveis
    H->>F: Seleciona Pix ou cartão tokenizado
    F->>B: Solicita tentativa de pagamento
    B->>M: Cria cobrança com idempotência e external_reference
    M-->>B: ID e estado da cobrança
    M-->>B: Webhook assinado
    B->>M: Consulta pagamento por ID
    alt Pagamento aprovado e reserva válida
        B->>S: Confirma reserva e registra pagamento
        S-->>B: IDs e estado confirmado
        B-->>F: Reserva confirmada
    else Divergência ou falha
        B-->>F: Pagamento recebido; atendimento em andamento
    end
```

**Regra de corte:** não cobrar antes de obter e persistir a pré-reserva. Não manter transação de banco aberta durante chamadas de rede; usar estados persistidos, *jobs* recuperáveis e travas curtas ao aplicar cada resultado. Se uma chamada à Stays ou gateway der timeout, consultar por referência/ID antes de repetir a escrita. O retorno do navegador nunca é prova de pagamento; webhook autenticado e consulta ao gateway alimentam o mesmo reconciliador.

## 6. Estados e invariantes

O enum existente inclui `iniciado`, `cotado`, `pre_reservado`, `pagamento_pendente`, `pago_em_confirmacao`, `confirmado`, `concluido`, `expirado`, `pagamento_recusado`, `atencao_operacional`, `cancelamento_solicitado`, `reembolso_pendente`, `reembolsado` e `contestado`. Conservar esse vocabulário, mas guardar **estado do pedido, da tentativa de pagamento e da reserva separadamente**: uma tentativa recusada não torna impossível oferecer outra no mesmo pedido válido.

| Situação | Regra |
| --- | --- |
| `cotado` | Valor e termos congelados; ainda não há bloqueio ou cobrança. |
| `pre_reservado` | ID Stays `reserved` persistido e prazo interno conhecido. Só então iniciar cobrança. |
| `pagamento_pendente` | Gateway recebeu tentativa; Pix/avaliação pode continuar pendente. Não liberar retenção enquanto houver pagamento com possibilidade real de aprovação sem plano de resolução. |
| `pago_em_confirmacao` | Gateway aprovou valor/moeda/referência corretos; sincronização Stays pendente. Sem voucher. |
| `confirmado` | Pagamento aprovado, reserva Stays confirmada e vínculo conferido. Evento comercial de compra emitido uma vez. |
| `expirado` | Cobrança não aprovada no prazo e pré-reserva liberada com confirmação; resultados tardios vão à atenção operacional. |
| `atencao_operacional` | Falha/ambiguidade com responsável, prioridade, prazo e ação registrada. Nunca ocultar pagamento recebido. |

**Invariantes obrigatórios:** um pedido não confirma duas reservas; uma tentativa de pagamento aprovada não cria dois lançamentos na Stays; valor, BRL e `external_reference` precisam corresponder ao pedido; eventos repetidos ou fora de ordem não fazem regressão de estado; pedido expirado não confirma Pix tardio automaticamente; reembolso não é considerado concluído apenas porque foi solicitado.

## 7. Pré-reserva, prazo e disputa com o tempo

O prazo de retenção segue **sem aprovação comercial/operacional**. A aplicação não assume 30 minutos nem cria `reserved` enquanto `DIRECT_BOOKING_RESERVATION_HOLD_MINUTES` estiver vazio ou inválido. Depois de uma resposta reconciliada `reserved`, grava `expires_at` com o prazo configurado. A rotina `direct-booking:recover-reservations` consulta pedidos expirados, lê o estado externo e só envia `PATCH type=canceled` quando o estado consultado ainda é `reserved`; após PATCH, consulta de novo e só marca o pedido `expirado` quando lê `canceled`. Falha ou resultado ambíguo fica em `atencao_operacional`, com ação persistida para recuperação e atendimento.

### Contrato confirmado no OpenAPI local — 13/10/2026

Fonte consultada: `references/stays-openapi.json` da skill CRCN `/Users/murilloalves/Projects/CRCN/.codex/skills/stays-api/`, fluxo de schemas em `references/operation-workflow.md`.

| Operação documentada | Campos/status documentados | Limite da documentação |
| --- | --- | --- |
| `POST /booking/reservations` | `type=reserved` é uma variante de criação; `listingId`, `checkInDate`, `checkOutDate`, `_idclient` e `guests` são obrigatórios. `guestsDetails`, `price.currency`, `_f_expected`, `_f_total` e `internalNote` aparecem como opcionais. Sucesso `201`, schema `ReservationBase`. | Não declara se `reserved` bloqueia inventário, seu TTL, dados efetivamente obrigatórios por conta/listing ou se o tipo é conversível em `booked`. |
| `GET /booking/reservations/{reserveId}` | Consulta por ID; sucesso `200 ReservationWithBlocking`, ausência `404`. | Não descreve consistência após escrita nem comportamento para cancelamentos em processamento. |
| `PATCH /booking/reservations/{reserveId}` | Variante `type=canceled`, com `cancelMessage` e `isGuestCancellationRequested` opcionais; sucesso `200 ReservationWithBlocking`. | Não garante que `canceled` libere inventário e em quanto tempo. |
| `DELETE /booking/reservations/{reserveId}` | Documenta sucesso `200 ReservationBase`. | Sem semântica de liberação/exclusão explícita; não é usado pelo fluxo. |
| `GET /booking/reservations` | Filtros `from`, `to`, `dateType`, opcional `listingId`, `type`, paginação; retorno de reservas. | Não documenta busca por `internalNote`, consistência ou que resultado vazio prove ausência de uma escrita que sofreu timeout. |
| `GET/POST /booking/clients` | Busca por `email`; criação aceita cadastro de cliente; POST sucesso `201 ClientDetailed`. | Não garante unicidade/consistência da busca. O código exige correspondência de e-mail exato única e não ativa conta/login. |

Embora a OpenAPI marque preço/moeda e detalhes de hóspedes como opcionais, uma reserva `reserved` só pode avançar para cobrança após a consulta confirmar total de hóspedes, moeda e valor do pedido; o PATCH para `booked` ocorre depois do pagamento aprovado. Se esses campos não vierem ou divergirem nessa etapa, a cobrança/alteração é interrompida e o pedido fica em atenção operacional. Uma reserva já `booked` pode ser reconciliada mesmo sem campos comerciais opcionais, desde que a identidade bata; todo detalhe comercial que a Stays retornar precisa corresponder ao pedido. A conferência de identidade exige ID, imóvel, hóspede, datas e marcador interno. O fluxo gera marcador interno `CRCN_DIRECT_ORDER:<uuid>` em `internalNote` e tenta reconciliar timeouts por listagem do anúncio/datas/estado e igualdade exata do marcador. Isso só é seguro se a conta devolver e preservar `internalNote` e se a listagem refletir a escrita no tempo esperado; validar ambos antes de habilitar. Se a confirmação após timeout não for conclusiva, o código não repete POST e registra atenção operacional. O cancelamento usa PATCH documentado; ainda exige comprovar que a unidade ficou novamente disponível por consulta/teste controlado.

**Validação controlada necessária na Stays (sem produção durante esta etapa):** confirmar em ambiente de teste e para cada tipo de imóvel piloto: semântica de `reserved`/bloqueio, campos aceitos e exigidos, validade/conversão, persistência de `internalNote`, leitura após timeout, efeito e tempo de `PATCH canceled`, disponibilidade após cancelamento, relação com dados do hóspede e regras da conta. Não executar criação ou cancelamento real até obter autorização específica e ambiente/IDs aprovados.

O Mercado Pago informa prazo mínimo configurável de **30 minutos** para o Pix da Payments API. Não presumir que um Pix de 30 minutos caberá numa retenção total de 30 minutos iniciada antes da geração do QR. Definir margens para chamadas, confirmação e atraso do webhook; alinhar expiração do Pix, retenção Stays e mensagem ao hóspede somente após validação. Se não houver garantia operacional, usar prazo de retenção maior ou outro procedimento aprovado. Um *job* frequente examina pedidos vencidos, consulta gateway, cancela cobrança pendente quando suportado, libera a Stays e registra cada resultado. Não apagar pedido nem histórico.

Pagamento após liberação ou aprovação durante timeout é caso prioritário: verificar disponibilidade atual; só confirmar com reserva válida e aceite da mesma oferta. Caso contrário, conduzir reembolso e comunicação. Nenhum robô cria nova reserva de preço diferente sem concordância do hóspede.

## 8. Pagamento Mercado Pago

**Escolha técnica do MVP:** manter a Payments API já representada em `MercadoPagoClient`, com Payment Brick/tokenização para cartão e Pix por `/v1/payments`, após confirmar os campos exatos da versão em uso. Não misturar IDs e webhooks de Payments API e Orders API sem uma decisão explícita de migração.

- Credenciais: Public Key no frontend é pública; Access Token e segredo de webhook ficam no servidor. Configurar pares distintos de teste e produção, URLs de webhook por ambiente e chave de habilitação de cobrança. Credenciais expostas anteriormente em conversa devem ser rotacionadas antes do lançamento.
- Cartão: o navegador envia somente token/identificador e opções do método; backend calcula valor do pedido. Não aceitar valor fornecido pelo browser para cobrar. Registrar bandeira/últimos dígitos apenas se fornecidos com segurança pelo gateway e úteis ao suporte. Estados `approved`, `pending`, `in_process`, `rejected`, `cancelled`, `refunded` e `charged_back` devem ser mapeados segundo a resposta real.
- Pix: gerar QR e copia e cola a partir da resposta do gateway; persistir ID e validade, exibir o valor cobrado e aguardar aprovação. A chave Pix informada pela empresa não substitui a cobrança por API nem serve para conciliação automática neste fluxo.
- Webhook: validar `x-signature`, `x-request-id` e `data.id` com o segredo; rejeitar assinatura inválida; buscar o pagamento na API; conferir `external_reference`, valor e moeda; aplicar evento uma vez. Responder rapidamente e processar reconciliação em *job*. Consultar gateway também por rotina periódica para reparar webhook perdido.
- Tentativas: uma nova tentativa de cartão/Pix requer nova chave de pagamento e só ocorre se o pedido ainda estiver elegível. Um pedido pode ter várias tentativas, mas no máximo uma aprovação válida para a compra. Se duas cobranças forem aprovadas por exceção, bloquear confirmação adicional e abrir reembolso/caso.
- Reembolso/contestação: registrar solicitação, decisão conforme política, comando com idempotência, status real no gateway, atualização da Stays e comunicação. Contestação não é equivalente a cancelamento voluntário.

Conferir documentação oficial para [Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/introduction), [Pix e expiração](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix), [cartão e idempotência](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/cards) e [assinatura de webhooks](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications) no momento da implementação.

## 9. Modelo de dados e contrato HTTP propostos

Preservar `direct_booking_orders` como agregado principal. Adicionar tabelas/registro relacional de **tentativas de pagamento**, **eventos externos recebidos**, **ações Stays** e **reembolsos** conforme necessidade de auditoria, com unicidade para IDs externos e chaves de idempotência. O JSON `operational_events` atual pode apoiar histórico legível, mas não substitui chaves únicas e registros transacionais. Valores monetários em centavos ou decimal exato; nunca `float` como base de igualdade de cobrança. Restringir PII por função e política de retenção.

Contrato HTTP que existe no código local; a habilitação e validação ponta a ponta continuam pendentes:

| Rota | Uso | Resposta relevante |
| --- | --- | --- |
| `POST /api/checkout` | Cria pedido idempotente, revalida oferta e tenta `reserved` somente com prazo configurado. | `201` somente com `pre_reservado` verificado; `503` mantém pedido consultável em caso de dependência ou ambiguidade; resposta inclui `{reference, token, path}` para retomada e usa `Cache-Control: no-store, private`. Métodos de pagamento ficam desabilitados. |
| `POST /api/checkout/{publicReference}/payments` | Cria tentativa Pix ou cartão tokenizado, protegida pelo token de retomada. | Estado e instruções Pix; nunca PAN/CVV; resposta não é armazenada em cache. A rota responde indisponível enquanto pagamentos estiverem desligados. |
| `GET /api/checkout/{publicReference}` | Consulta estado após recarregar/retornar; caminho correspondente no site: `/checkout/{publicReference}`. | Exige `X-Checkout-Resume-Token`, responde `Cache-Control: no-store, private` e não usa cache no cliente; referência sozinha/query string não autoriza acesso. Retorna resumo do pedido e da tentativa, incluindo Pix apenas enquanto válido; `payment.enabled=false` continua indicando que não se pode iniciar nova cobrança. |
| `POST /api/webhooks/mercadopago` | Recebe notificação assinada. | Aceite rápido; processamento assíncrono, deduplicado e reconciliado por consulta ao gateway. |
| `POST /api/reservations/{id}/cancellation-requests` | Solicita cancelamento acompanhado. | Esta rota ainda não está implementada; não há protocolo automatizado de reembolso. |

Não usar `GET` público com UUID como única proteção para nome, telefone, e-mail, QR e dados de viagem. Mensagens de erro são estruturadas (`code`, `message`, `order` quando seguro) e não incluem payloads brutos de Stays/gateway. Documentar HTTP `409` para preço/termos/disponibilidade alterados, `422` para entrada inválida e `503` para dependência indisponível. Qualquer resposta bem-sucedida precisa representar uma ação real persistida.

Referências para o desenho de URLs: a [Shopify documenta links que pré-carregam um checkout](https://shopify.dev/docs/apps/build/checkout/create-cart-permalinks), a [Stripe separa a sessão criada no servidor de sua URL de acesso](https://docs.stripe.com/api/checkout/sessions) e a [OWASP alerta para exposição de informação em query strings](https://community.owasp.org/). São padrões de referência, não contratos de API da CRCN nem documentação dos parâmetros internos do Airbnb.

## 10. Integração Stays e pós-venda

Validar no Swagger autenticado da conta os payloads e transições de `POST /booking/reservations`, `PATCH /booking/reservations/{reserveId}` e `POST /booking/reservations/{reserveId}/payments`. O índice [Stays External API](stays-external-api.md) confirma as rotas, mas **não prova** a semântica de `reserved`, campos obrigatórios nem a política de cancelamento. O código deve consultar a reserva após timeout antes de repetir escrita.

Lançar na Stays o pagamento **realmente aprovado**, com ID do gateway/método/valor e unicidade local. Confirmar a reserva uma vez, consultar o resultado e comparar anúncio, datas, hóspedes e valor. Se a Stays aceitar pagamento e falhar confirmação, ou o inverso, manter estados separados e reconciliar; não enviar e-mail de “confirmado”.

Após confirmação, gerar documento personalizado a partir do snapshot aceito e dados reais. A ficha por imóvel define inventário, taxas locais, horários, cancelamento, acesso e itens condicionais. Coleta pós-pagamento pede apenas o necessário para check-in; estado pendente de dados não altera o fato de a reserva estar confirmada. E-mails transacionais distintos: pagamento recebido, confirmação, pedido de dados, voucher pronto, exceção/atendimento, cancelamento e reembolso. Cada envio é rastreado e pode ser repetido sem recriar reserva.

## 11. Operação, segurança e observabilidade

**Fila diária mínima:** pagamento aprovado sem reserva confirmada; Pix tardio; duas aprovações; pré-reserva não liberada; lançamento Stays divergente; e-mail falho; reembolso pendente; contestação. Cada caso tem pedido, IDs externos, horário, valor, responsável, próximo passo e prazo de atendimento. Reconciliação compara pedido ↔ gateway ↔ Stays diariamente e registra saldo/ajuste, inclusive taxas do gateway. Fechamento do proprietário no dia 15 usa contrato específico, competência/corte e ajustes aprovados pelo financeiro.

Não registrar tokens, QR Pix completo, CPF, PAN/CVV, segredo, corpo integral de webhook ou payload de hóspedes em logs e eventos GA4. Usar HTTPS, controles de acesso para suporte/financeiro, limites de requisições, CSRF/CORS coerentes com a arquitetura, segredo de webhook por ambiente, rotação de chaves, backups e alertas. Dados do cartão pertencem ao componente/provedor; revisar escopo PCI da integração antes da produção.

Eventos de produto: `view_item`, `begin_checkout`, `add_payment_info`, `payment_pending`, `payment_failed`, `purchase` e `refund` apenas quando semanticamente corretos. `purchase` uma vez por pedido confirmado, com valor e ID estáveis; sem e-mail/telefone/documento. Segmentar por imóvel, dispositivo, origem e método sem expor dados pessoais. Métricas: reservas confirmadas por checkout iniciado, aprovação por método, tempo até confirmação, pagamentos sem reserva, reembolsos, contestações, contatos ao suporte e margem após taxa/repasse. Campanhas e e-mail marketing exigem preferência separada da comunicação transacional.

## 12. Cenários de validação antes de abrir vendas

| Cenário | Resultado esperado |
| --- | --- |
| Cotação mudou ou unidade esgotou | Nova oferta/erro claro; sem pré-reserva ou cobrança com valor antigo. |
| Clique duplo, refresh ou retry | Um pedido/pré-reserva por chave e uma cobrança por tentativa. |
| Cartão recusado | Mensagem recuperável; pedido válido permite nova tentativa sem duplicar reserva. |
| Cartão em análise e Pix pendente | Nenhuma confirmação; prazo e processo de verificação explícitos. |
| Pix pago dentro do prazo | Aprovação verificada no gateway, Stays confirmada, pagamento lançado uma vez. |
| Pix pago após liberação | Caso urgente, sem confirmação automática; reacomodação aceita ou reembolso. |
| Webhook repetido, fora de ordem ou ausente | Mesmo estado final após reconciliação; compra/evento/e-mail únicos. |
| Gateway timeout após criar pagamento | Buscar por referência/ID antes de nova tentativa. |
| Stays timeout/falha após pagamento | Estado intermediário e alerta urgente; nunca voucher prematuro. |
| Cancelamento, reembolso e contestação | Políticas, gateway, Stays e pedido reconciliados; cliente informado do estado real. |
| E-mail falho | Reenvio isolado, sem nova cobrança/reserva. |
| Celular, teclado e conexão instável | Resumo, total, regras, métodos e estados compreensíveis; retomada segura. |

## 13. Plano de entrega e critérios de conclusão

| Etapa | Entrega | Condição de avanço |
| --- | --- | --- |
| **0 — Regras** | 2–5 imóveis piloto, fichas e cancelamento aprovados; pagamento integral, parcelamento, prazos e suporte definidos. | Não há contradição entre anúncio, checkout e contrato. |
| **1 — Contratos e dados** | Pedido, tentativas, eventos, API de consulta e estados persistidos. | Retentativas não duplicam pedido; cada transição é auditável. |
| **2 — Stays** | `reserved`, expiração, confirmação e lançamento de pagamento. | Comportamento validado na conta e recuperável após timeout. |
| **3 — Gateway** | Pix/cartão tokenizado, webhook, consulta e conciliação. | Cenários de aprovação, recusa, atraso e duplicidade resolvidos. |
| **4 — Interface e comunicação** | Checkout mobile, páginas de estado, e-mails, coleta pós-pagamento e voucher verdadeiro. | Hóspede e equipe veem o mesmo estado, sem promessa prematura. |
| **5 — Operação piloto** | Painel/fila mínima, rotina diária e roteiro de exceções. | Compras controladas Pix e cartão percorrem o fluxo completo e são conciliáveis. |
| **6 — Otimização** | GA4/GTM, recuperação responsável, testes de UX, repasse automatizado e possível Cielo. | Dados do piloto justificam cada automação. |

Frentes independentes podem trabalhar em regras/conteúdo, UI e comunicação enquanto pedido/Stays/gateway amadurecem; os contratos de API e ownership de arquivos são definidos antes dos worktrees. A integração final permanece sequencial para evitar que frontend e cobrança usem versões diferentes da jornada. O [roadmap](roadmap-vendas-diretas.md) detalha pacotes para agentes.

**Critério de lançamento:** demonstrar dois pagamentos controlados (Pix e cartão) com total correto, pré-reserva válida, confirmação Stays, lançamento financeiro único, e-mail/voucher corretos e registro conciliável; demonstrar também todos os cenários críticos da tabela. Revisão comercial/jurídica/contábil, credenciais de produção rotacionadas, monitoramento e responsável operacional definidos antes de habilitar cobrança pública.

## 14. Decisões ainda necessárias

1. Política de cancelamento por imóvel/tarifa e sua fonte oficial; resolver as contradições do contrato modelo.
2. Prazo de `reserved` e prazo de Pix que funcionem juntos na conta Stays e no Mercado Pago; procedimento para pagamento tardio.
3. Número de parcelas, juros, taxas da CRCN e cálculo exato do valor devido ao proprietário por contrato.
4. Campos de hóspede exigidos pela Stays/empreendimento antes e depois da confirmação.
5. Responsável e tempo de resposta para pagamento aprovado sem reserva, reembolso e contestação.
6. Public Key, credenciais de teste e segredo de webhook do Mercado Pago; confirmação do produto/API habilitado na conta.

Essas decisões bloqueiam a **cobrança real**, mas não bloqueiam a implementação isolada dos modelos, interface, contratos e procedimentos.

### Próximo pacote de integração

O pacote seguinte é Mercado Pago (Payments API): tentativas separadas do pedido, cartão tokenizado e Pix, idempotência por tentativa, webhook assinado, consulta autoritativa, expiração coordenada com a retenção, tratamento de aprovação tardia e conciliação. Deve consumir apenas pedido em `pre_reservado` com `stays_reservation_id` e `expires_at` persistidos; neste estado os métodos continuam desabilitados. Antes de validar cobrança, ainda são necessários credenciais de teste, confirmação do produto/API habilitado, política de parcelamento/custo, prazos compatíveis e protocolo de pagamento tardio/reembolso. Não declarar o MVP conciliável até validar compra controlada ponta a ponta em CRCN, gateway e Stays.
