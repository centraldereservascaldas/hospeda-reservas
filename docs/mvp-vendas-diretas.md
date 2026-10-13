# MVP de vendas diretas de reservas

Atualizado em 13/10/2026. Objetivo: o hóspede escolhe uma acomodação real, paga no site, recebe confirmação e voucher, e a reserva e o pagamento ficam registrados na Stays.

## Onde estamos

| Parte | Situação atual | Falta para vender no site |
| --- | --- | --- |
| Catálogo, disponibilidade e preço | A API Laravel consulta a Stays e revalida a cotação antes do checkout. | Publicar apenas anúncios reais e reserváveis, com fotos, regras e preço conferidos. Remover links comerciais para anúncios demonstrativos. |
| Checkout | O redirecionamento para a Stays foi desativado; o site informa que o pagamento próprio está em preparação. | Cobrança no próprio site, com uma tentativa de compra identificável e estados claros: aguardando, pago, confirmado, falhou ou cancelado. |
| Reserva e pagamento na Stays | O hóspede é sincronizado e pode ver reservas da Stays em “Minhas viagens”. | Criar ou segurar a reserva pela API, confirmar após o pagamento e lançar o pagamento na reserva. Conciliar eventuais falhas. |
| Confirmação e voucher | Existe uma tela imprimível baseada em reservas retornadas pela Stays. | Coletar os dados exigidos para check-in, confirmar o pagamento e a reserva antes de liberar o voucher, e enviar e-mail. |
| Confiança e aquisição | Há contato no rodapé e conteúdo de anúncios. | Identidade empresarial verificável, políticas, avaliações reais, mensuração e captação de contatos com autorização. |

O rodapé mostra “Privacidade” e “Termos” como texto sem páginas. As promessas de reserva garantida e liberação imediata de pulseiras foram retiradas da interface; o voucher agora informa apenas o estado da reserva.

## Jornada mínima recomendada

1. **Escolha:** mostrar somente acomodações ativas na Stays. Revalidar datas, disponibilidade e valor final antes de cobrar.
2. **Identificação:** pedir nome, e-mail e telefone do responsável. Permitir compra como convidado; oferecer conta após a compra, sem exigir confirmação de e-mail como etapa de pagamento.
3. **Proteção da disponibilidade:** criar uma reserva temporária na Stays (`reserved`) antes da cobrança, **se a conta Stays confirmar que esse estado segura as datas e pode ser liberado com segurança**. Definir prazo curto para Pix e cancelar a reserva temporária quando expirar ou falhar.
4. **Pagamento:** exibir Pix e cartão no checkout do site. Recomendo **Mercado Pago Payment Brick como primeira rota do MVP**, pois cobre os dois meios em uma única integração. Preparar a Cielo como segunda rota, após identificar o produto contratado e testar suas credenciais, notificações e estornos.
5. **Confirmação:** aceitar o pagamento somente após notificação autenticada e consulta de status ao gateway. Confirmar a reserva como `booked` na Stays, registrar o pagamento nela e guardar a relação entre pedido, transação e reserva. Repetição de notificações não pode criar outra reserva ou outro lançamento.
6. **Dados e voucher:** pedir depois do pagamento apenas os dados adicionais que o empreendimento exige para o check-in. Enviar confirmação e disponibilizar voucher com código real da Stays somente quando pagamento, reserva e dados obrigatórios estiverem completos. Enquanto isso, mostrar “pagamento recebido; confirmação em andamento” e acionar atendimento se houver falha.
7. **Pós-venda:** permitir consulta da reserva e solicitação de cancelamento; tratar reembolso no gateway e atualização da Stays como um único processo acompanhado pela equipe.

Se a reserva temporária não puder ser usada nessa conta Stays, definir e testar com a Stays outro mecanismo de proteção da disponibilidade **antes** de cobrar o hóspede. Uma cobrança aprovada sem reserva deve gerar alerta imediato e fluxo de resolução ou reembolso.

## Checklist para abrir as primeiras vendas

### Essencial antes de cobrar

- [ ] Validar ao menos um conjunto inicial de anúncios reais: ID Stays, disponibilidade, preço total, fotos, capacidade, regras de check-in e política de cancelamento.
- [ ] Escolher a primeira rota de pagamento e fechar o fluxo de reserva temporária, vencimento de Pix, cartão recusado, pagamento aprovado, estorno e falha de sincronização com a Stays.
- [ ] Criar registro local do pedido e painel simples para a equipe localizar pagamentos pendentes, reservas confirmadas e casos que exigem atendimento.
- [ ] Configurar e-mail transacional com domínio da empresa: pagamento recebido, reserva confirmada, pedido de dados para check-in, voucher e falha que exige contato.
- [ ] Publicar páginas de **Quem somos**, **Cancelamento e reembolso**, **Privacidade** e **Termos de uso**; apresentar essas regras antes de pagar e registrar a versão aceita. Revisar o texto comercial e jurídico com o responsável pela empresa.
- [ ] Mostrar razão social, CNPJ, canais reais de atendimento e horário de suporte no site, inclusive no celular. Contar uma breve história verdadeira da CRCN e ligar ao Perfil da Empresa no Google.
- [ ] Usar avaliações verificáveis. Exibir link para o perfil da empresa no Reclame AQUI, se existir; usar selo de reputação somente se a empresa tiver direito a ele.
- [ ] Configurar domínio HTTPS, ambiente de produção, backups e alerta para pagamento aprovado sem reserva/voucher.

### Mensuração e marketing mínimos

- [ ] Carregar o Google Tag Manager por ID configurado no `.env` (`VITE_GTM_ID`); configurar o GA4 no contêiner. Se o ID GA4 também for fornecido por `.env`, manter **um único** caminho de carregamento para evitar eventos duplicados. IDs públicos podem usar `VITE_`; tokens privados dos gateways ficam apenas no backend.
- [ ] Medir busca, visualização de acomodação, início de checkout, pagamento iniciado e `purchase` **uma vez por reserva confirmada**, com ID único de transação e valor real. Medir erro de pagamento e abandono para descobrir onde se perdem vendas.
- [ ] Oferecer preferência separada para receber ofertas por e-mail, registrar a escolha e dar opção de descadastro. Usar um provedor de e-mail/marketing para a primeira lista e uma campanha simples; automações maiores podem vir depois.
- [ ] Configurar Perfil da Empresa no Google e Search Console com o domínio do site, e acompanhar visitas → checkout → reservas pagas.
- [ ] Mostrar preferência de cookies/medição e explicar o uso de dados na política de privacidade.

## Dados e decisões que faltam

- **Mercado Pago:** chave pública para o Payment Brick, credenciais de teste, segredo de webhook, meios habilitados, parcelamento e política de taxas. O Client ID e o Access Token fornecidos foram guardados apenas no `.env` local. O checkout da CRCN não pode cobrar enquanto a chave pública e a validação de notificações não estiverem configuradas.
- **Cielo:** confirmar se as credenciais são da API E-commerce, Cielo Conecta, Pix ou 3DS. A API E-commerce usa `MerchantId` + `MerchantKey`; `ClientId` + `ClientSecret` pertencem a outros fluxos. Os dois valores recebidos foram guardados no `.env` local sem presumir que substituem `MerchantKey`.
- **Stays e operação:** confirmar comportamento e expiração de `reserved`, cadastro do meio de pagamento, marcação de origem da venda, dados obrigatórios do check-in, formato de voucher aceito e procedimento de cancelamento.
- **Empresa:** validar razão social/CNPJ, link do Perfil da Empresa no Google, perfil do Reclame AQUI, história curta, contatos/horários, política comercial e endereço de e-mail do domínio.

## Critério de lançamento

Uma compra de teste deve percorrer o caminho completo no celular: cotação real → reserva protegida → Pix ou cartão → pagamento confirmado → reserva `booked` e pagamento na Stays → coleta dos dados necessários → e-mail e voucher corretos. Também devem funcionar pagamento recusado, Pix expirado, notificação repetida, cancelamento/reembolso e falha da Stays após pagamento. O GA4 deve registrar uma única compra; nenhuma tela deve anunciar reserva ou pulseiras liberadas antes da confirmação correspondente.

## Referências

- [Fluxo atual do projeto](stays-checkout-flow.md), [checkout Laravel](../app/Http/Controllers/Api/BookingController.php), [reservas do hóspede](../app/Http/Controllers/Api/GuestReservationController.php), [rodapé](../src/components/AppFooter.tsx) e [voucher atual](../src/components/booking/TripsView.tsx).
- [Stays: criação e atualização de reservas, pagamentos e notificações](https://stays.net/external-api/).
- [Mercado Pago: Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/introduction) e [credenciais necessárias](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/prerequisites).
- [Cielo: autenticação e tipos de credenciais](https://docs.cielo.com.br/ecommerce-cielo/reference/gerenciamento-de-credenciais).
- [Google: eventos de comércio eletrônico](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce) e [modo de consentimento](https://developers.google.com/tag-platform/security/guides/consent).
- [ANPD: guia de cookies e proteção de dados](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais).
