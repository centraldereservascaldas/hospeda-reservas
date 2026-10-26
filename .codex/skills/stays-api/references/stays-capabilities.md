# Capacidades Stays: produto, painel e External API

Esta referência separa capacidades anunciadas/documentadas do produto, operações observadas no snapshot da conta e ações que a API não realiza. A API e a UI não são equivalentes; planos, permissões e configuração da conta podem ocultar ou restringir recursos.

## O que a plataforma Stays cobre

As páginas públicas da Stays descrevem um PMS para aluguel por temporada com channel manager, sincronização de disponibilidade/preço/anúncios com OTAs, calendário unificado, motor de reservas do site, reservas diretas, gestão de hóspedes, automação operacional (check-in/out, limpeza/manutenção), rotinas financeiras e prestação de contas a proprietários. Recursos disponíveis dependem do plano e da configuração da conta.

## O que a External API permite no snapshot da conta

O snapshot incluído lista 202 operações em 123 caminhos. Use `api-map.md` e `inspect-openapi.py` para descobrir as rotas, mas confirme sempre método, body, parâmetros, enums, auth e resposta no JSON.

| Capacidade | Exemplos do snapshot | Limite prático |
|---|---|---|
| Consulta e operação de reservas | busca, preço, exportação/lista/detalhe, cliente, pedido de reserva, pagamentos, extras | Reserva/checkout/pagamento não são sinônimos. `/book-request` devolve link para concluir checkout; não é confirmação de reserva paga. |
| Calendário | ler disponibilidade/preço/restrições; atualizar preços e restrições em lote ou separadamente | Escritas alteram inventário/venda. Confirme datas, anúncio e comportamento depois. |
| Precificação por temporada | regiões, temporadas, tarifas de anúncio; modelo de preço | API oficial diferencia tarifas por noite no calendário de preço por período em seasons/rates. Leia modelo/configuração primeiro. |
| Conteúdo de imóvel | property, listing, rooms, groups, clone/price groups, imagens, campos personalizados e vocabulários | Conectividade/mapeamento OTA não está documentada no snapshot de operações; não prometa alterar configuração de channel manager via esta API. |
| Financeiro | balanço/lançamentos de proprietários, transações contábeis, posições, provedores, perfis e repasses OTA | API não movimenta fundos por banco; relatório do painel pode ter colunas/rotinas não espelhadas na API. |
| Comunicação e operação | threads/mensagens SMM, e-mail de reserva, push, avaliações, tarefas e automações | Mensagem/alerta externo e alterações de tarefa/automação têm efeitos e exigem validação própria. |
| Settings e referência | configurações de preço, regras da casa/contrato, timezone, custom fields e dados de tradução | Alterações globais podem afetar muitos anúncios; leia impacto e permissão antes. |

## Como operar tarefas do painel que não têm endpoint evidente

- Primeiro confirme se existe operação correspondente no snapshot. Ausência de endpoint não significa que a função inexiste no produto.
- Para rotina de UI, use documentação da Stays Academy, tela autorizada disponível ou peça informação sobre plano/permissão. Separe passo oficial documentado de inferência.
- Recursos como conexões de OTA, mapeamento de anúncios, configuração de comissão, status/automação de repasse e alguns relatórios são descritos em guias do painel. O snapshot da External API não mostra endpoints de gestão de conexão dos canais nem toda a rotina financeira do UI; não fabrique uma chamada.
- A API pode ter endpoints não habilitados na conta, embora apareçam no snapshot. Um `403` indica falta de acesso/escopo naquela conta ou operação; não contorne via UI ou credenciais de usuário sem autorização.

## Fontes oficiais consultadas

- [FAQ da Stays Open API](https://academy.stays.net/en/support/solutions/articles/36000531215_en_us-faq-learn-how-stays-open-api-works-and-its-functionalities/): ativação no App Center, checkout, reservas, financeiro, calendário, temporadas e conteúdo; explica que a integração financeira registra/valida pagamentos e não executa transferências interbancárias.
- [Ferramentas Stays](https://stays.net/ferramentas/): visão do produto, channel manager, calendário unificado, motor direto e operação.
- [Rotina financeira do plano Administrador](https://academy.stays.net/pt-BR/support/solutions/articles/36000239561-plano-administrador-como-organizar-as-rotinas-financeiras/): comissão, status de repasse, balanço de proprietários, contas e relatórios.
- [Rotina financeira do plano Agência](https://onboarding.stays.net/pt-BR/support/solutions/articles/36000247886-plano-agencia-como-organizar-sua-rotina-financeira/): categorização, prestação de contas e fluxo de caixa.
- [Relatórios disponíveis na Stays](https://academy.stays.net/pt-BR/support/solutions/articles/36000393338-quais-relatorios-sao-gerados-na-stays/): reservas, recebimentos, contas a pagar, balancete e relatórios de proprietários.
- [Automação de repasses](https://onboarding.stays.net/pt-BR/support/solutions/articles/stays_doc_1786138480751-como-repassar-reservas-de-forma-automatica/): gatilhos, parcelamento e validação de créditos.
- [Regras de preços recorrentes](https://academy.stays.net/pt-BR/support/solutions/articles/36000022482-como-funcionam-as-regras-de-precos-recorrentes-do-stays-net/): modelo de preço por período e sazonalidade.

Documentação do produto consultada em 15/10/2026; a interface, o plano e o snapshot podem mudar. Para contratos de endpoint, o OpenAPI da conta incluído com esta skill é a fonte de verdade prioritária.
