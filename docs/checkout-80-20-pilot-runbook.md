# Preparação do piloto do checkout próprio CRCN

Este roteiro prepara a validação do checkout com Mercado Pago e Stays em ambiente de teste. Ele não autoriza cobranças reais, reservas em produção, publicação ou habilitação das vendas. Nenhum teste de sandbox foi executado na preparação deste documento.

## Estado atual e bloqueios

- As flags `DIRECT_BOOKING_ENABLED`, `DIRECT_BOOKING_PAYMENTS_ENABLED`, `DIRECT_BOOKING_CONFIRMATION_ENABLED` e `DIRECT_BOOKING_LIVE_PAYMENTS_ENABLED` devem permanecer desligadas enquanto este roteiro estiver sendo preparado.
- A allowlist `DIRECT_BOOKING_PILOT_LISTING_IDS` aceita apenas 2–5 IDs públicos CRCN existentes no catálogo. Vazia, fora dessa faixa ou com ID desconhecido, não deixa nenhum imóvel elegível. O snapshot de cada imóvel precisa ter versão correspondente e os cinco campos não vazios: `Preço e taxas`, `Cancelamento e reembolso`, `Forma e prazo de pagamento`, `Prazo da pré-reserva` e `Atendimento e suporte`.
- A configuração local consultada em 14/10/2026 mostra as flags de checkout/pagamento desligadas e o prazo do token de retomada em 30 dias. Essa é a escolha registrada para o piloto; a equipe ainda precisa aprovar quem pode revogar o token e em quais situações.
- O catálogo `resources/data/stays-apartments.json` ainda não contém `directSaleTermsVersion` e `directSaleTermsSnapshot` aprovados. Sem esses dados, o registro `DirectSaleTermsRegistry` não considera um imóvel elegível e o checkout permanece indisponível.
- A regra temporária do cartão limita a uma parcela. Isso é uma trava técnica provisória, não a aprovação comercial do parcelamento.
- O roadmap propõe 30 minutos para a pré-reserva, mas classifica esse prazo como hipótese a validar com Stays e operação. Nenhum prazo foi aprovado/configurado para o piloto. Além disso, com os limites atuais do Pix (30 minutos mínimos mais 5 minutos de margem), a proteção do código exige prazo **maior que 35 minutos**; portanto, a proposta de 30 minutos não permite iniciar Pix.
- O MVP prevê cobrar 100% do valor ao hóspede, mas os documentos ainda pedem decisão comercial final entre pagamento integral e entrada/saldo. Não habilitar venda até registrar essa decisão.
- A validade automática do link de retomada é de 30 dias, conforme escolha registrada para esta preparação. O painel permite revogação manual; a equipe ainda precisa definir quem pode revogar e em quais situações. Revogar o link só bloqueia a retomada pelo token: não cancela reserva nem pagamento.
- A tela de retomada permite imprimir um comprovante do estado registrado, e o e-mail de confirmação inclui o localizador Stays quando ele está disponível. Isso não é o voucher operacional do condomínio: a jornada de checkout próprio ainda não coleta todos os dados de check-in nem emite um voucher final validado pela operação.

### O que o código já cobre e o que continua aberto

| Área                         | Estado verificável no código/configuração                                                                                                                       | Dependência para concluir                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preço e taxas                | A API revalida a cotação Stays; o checkout mostra composição e total retornados pela cotação.                                                                   | Conferir preço, taxas e quem as recebe para cada imóvel/tarifa piloto.                                                                             |
| Elegibilidade do piloto      | A API só aceita imóveis na allowlist de 2–5 IDs públicos existentes e com os cinco campos comerciais obrigatórios; o aceite e snapshot são guardados no pedido. | Escolher os imóveis e cadastrar conteúdo completo e aprovado de preço/taxas, cancelamento, pagamento, prazo de pré-reserva e suporte para cada um. |
| Pagamento                    | O valor enviado é o total da cotação; Pix e cartão estão integrados ao fluxo.                                                                                   | Decisão comercial final sobre pagamento integral versus entrada/saldo, parcelas/juros, credenciais e QA.                                           |
| Pré-reserva                  | Criação e recuperação Stays `reserved` estão implementadas; sem duração configurada, o serviço recusa iniciar.                                                  | Aprovar duração compatível com Stays, Pix e atendimento.                                                                                           |
| Falhas e reconciliação       | Há idempotência, reconciliação via gateway/webhook, recuperação periódica e fila administrativa para exceções.                                                  | Executar os cenários deste roteiro no ambiente isolado e atribuir a rotina diária a uma pessoa/equipe.                                             |
| E-mail e voucher             | O e-mail condicionado a reserva `booked` pode incluir o localizador; a retomada imprime comprovante.                                                            | Configurar e validar entrega; aprovar coleta de check-in e conteúdo/formato do voucher do condomínio.                                              |
| Atendimento, alertas e legal | O e-mail público da CRCN está no rodapé e no e-mail de confirmação; não há horário/plantão, páginas legais funcionais nem canal de alerta configurado.          | Confirmar horário, responsável/plantão, destinatários de alerta e revisão comercial/jurídica.                                                      |

Os comandos agendados de recuperação/reconciliação rodam a cada minuto; a reconciliação de pagamentos já aprovados usa o intervalo configurado (24 horas por padrão). Isso é automação técnica, não prova de que o scheduler, workers, alertas ou atendimento estejam ativos no ambiente de QA/produção.

## Dados que a operação precisa aprovar

Preencher uma linha por imóvel piloto (de 2 a 5). Não habilitar o checkout com campos vazios ou texto provisório.

| Campo                                                       | Imóvel 1 | Imóvel 2 | Imóvel 3 | Imóvel 4 | Imóvel 5 |
| ----------------------------------------------------------- | -------- | -------- | -------- | -------- | -------- |
| ID público CRCN e ID Stays conferidos                       |          |          |          |          |          |
| Fotos, capacidade, horários e inventário conferidos         |          |          |          |          |          |
| Origem oficial da política de cancelamento                  |          |          |          |          |          |
| Texto e prazo de cancelamento/reembolso aprovados           |          |          |          |          |          |
| Taxas incluídas e cobradas à parte                          |          |          |          |          |          |
| Prazo `reserved` confirmado na conta Stays                  |          |          |          |          |          |
| Procedimento para pagamento Pix tardio                      |          |          |          |          |          |
| Dados obrigatórios para check-in e momento da coleta        |          |          |          |          |          |
| Pessoa/equipe responsável por exceções e horário de suporte |          |          |          |          |          |
| Versão do snapshot comercial aprovado                       |          |          |          |          |          |

Decisões comuns para todos os imóveis:

- Registrar a decisão comercial final: cobrar 100% na compra ou entrada/saldo. A especificação atual implementa o total integral.
- Aprovar número de parcelas, juros e eventuais custos. O código está provisoriamente limitado a uma parcela.
- Aprovar o prazo de pré-reserva compatível com Stays, Pix e atendimento.
- Se for mantida a regra atual de Pix (30 minutos mínimos mais 5 de margem), escolher prazo `reserved` acima de 35 minutos ou aprovar outra combinação de prazo Pix e margem antes de configurar o checkout.
- Definir valor devido ao proprietário, corte do dia 15 e tratamento de estorno/contestação.
- Revisar os textos comerciais, jurídicos e contábeis e as páginas institucionais antes de publicar.

## Pré-requisitos de ambiente de teste

Antes de alterar qualquer flag, a pessoa responsável deve confirmar:

1. `APP_ENV` está em `local` ou outro ambiente isolado de testes, nunca em produção.
2. O Access Token, Public Key e segredo de webhook configurados pertencem ao ambiente de teste do Mercado Pago. Não reutilizar credenciais de produção.
3. A conta/ambiente Stays usado é explicitamente de teste ou foi autorizado para operações controladas. Não validar escritas com uma conta de produção.
4. `DIRECT_BOOKING_STAYS_PAYMENT_TYPE` e `DIRECT_BOOKING_STAYS_PAYMENT_PROVIDER_ID` apontam para um tipo/provedor de pagamento válido e autorizado nessa conta Stays de teste; não presumir esses identificadores.
5. `DIRECT_BOOKING_RESERVATION_HOLD_MINUTES` tem o prazo aprovado. Com os padrões atuais, Pix exige mais de 35 minutos de retenção; configurar 30 minutos fará o serviço recusar o início.
6. A fila assíncrona e o scheduler estão configurados para o ambiente isolado; não usar conexão `sync`. Há worker ativo e o scheduler executa os comandos de recuperação.
7. O transporte de e-mail é de teste ou uma caixa controlada, sem enviar mensagens a hóspedes reais.
8. Há dados de hóspede e cartões/Pix de teste fornecidos pelo gateway; não inserir dados reais de clientes.
9. `DIRECT_BOOKING_PILOT_LISTING_IDS` contém exatamente os 2–5 IDs públicos CRCN escolhidos; cada ID Stays associado foi conferido.
10. Os snapshots comerciais aprovados existem para os imóveis escolhidos e os identificadores foram revisados por duas pessoas.
11. As políticas de cancelamento, prazo `reserved`, suporte e procedimentos de pagamento tardio estão registrados e revisados.

Se um dos pré-requisitos não puder ser confirmado, parar antes de habilitar qualquer flag.

## Habilitação isolada para a sessão de QA

Somente depois de aprovar os pré-requisitos, a pessoa responsável por QA deve habilitar `DIRECT_BOOKING_ENABLED`, `DIRECT_BOOKING_PAYMENTS_ENABLED` e `DIRECT_BOOKING_CONFIRMATION_ENABLED` **no ambiente isolado**, apontando apenas para credenciais de teste. Manter `DIRECT_BOOKING_LIVE_PAYMENTS_ENABLED=false`; não mudar variáveis de produção. O `.env` local é ignorado pelo Git e não deve ser copiado para documentação ou logs.

Ao terminar a sessão, desligar imediatamente as três flags funcionais, limpar credenciais temporárias e guardar apenas IDs de teste e evidências sem PII, tokens, QR Pix ou segredos.

## Inicialização local para QA

Só depois de todos os pré-requisitos aprovados e de confirmar `APP_ENV` isolado, iniciar cada processo em um terminal separado na raiz do projeto:

1. API Laravel em `http://127.0.0.1:8000`: `composer dev`.
2. Interface Vite em `http://localhost:3000`: `npm run dev`.
3. Worker da fila `database` (usada por webhook e e-mail): `composer queue:work`.
4. Scheduler local (recuperação e expiração): `composer schedule:work`.

Antes de habilitar as três flags funcionais, conferir `php artisan config:show direct-booking` e `php artisan schedule:list`. A lista mostra tarefas agendadas, mas não prova que o scheduler ou worker está executando; confirmar nos terminais que ambos permanecem ativos. Se o ambiente não puder usar a conexão de fila `database` assíncrona, não iniciar o QA do checkout. Não executar `composer setup` neste roteiro: ele pode criar/copiar configuração e aplicar migrações no banco configurado.

## Roteiro de compra controlada

Executar separadamente um fluxo Pix e um fluxo de cartão. Usar um imóvel aprovado e datas disponibilizadas para QA.

1. Abrir o anúncio e conferir imóvel, datas, hóspedes, capacidade, taxas e total.
2. Conferir condições do snapshot exibido e a versão registrada no pedido.
3. Confirmar que a cotação do servidor corresponde ao total mostrado; alteração de cotação deve exigir nova confirmação, sem criar cobrança pelo valor anterior.
4. Criar o pedido uma vez e conferir referência, valor, moeda, datas e hóspedes persistidos.
5. Confirmar na conta Stays de teste que a reserva ficou em `reserved`, protegeu as datas conforme o contrato aprovado e tem `expires_at` local coerente.
6. Iniciar Pix ou cartão de teste; confirmar que existe uma tentativa associada ao pedido e que PAN/CVV nunca aparecem no backend, banco, logs ou analytics.
7. Para Pix, conferir valor, favorecido, QR/copia-e-cola e validade informados pelo gateway; validar expiração sem pagar fora do fluxo seguro.
8. Para cartão, verificar aprovação/recusa pelo cartão de teste. A interface atual aceita apenas uma parcela até nova decisão comercial.
9. Aguardar a consulta autoritativa do gateway. Webhook recebido sozinho não deve confirmar pedido nem reserva.
10. Após aprovação, verificar a ordem: pagamento aprovado → confirmação `booked` na Stays → lançamento financeiro único → e-mail correto com referência do pedido, contato de suporte e localizador Stays → comprovante imprimível com os dados persistidos. Em “Minhas viagens”, uma reserva do checkout direto deve aparecer como “Comprovante” e o documento como “Comprovante da reserva”, com o aviso de que não substitui instruções de acesso/check-in; reservas legadas mantêm o fluxo de voucher existente. O comando de recuperação/reconciliação roda a cada minuto no scheduler local configurado; confirmar no ambiente isolado que o scheduler e os workers realmente estão ativos. Não tratar esse comprovante como voucher do condomínio.
11. Conferir que “Minhas viagens” e a retomada mostram o mesmo estado, total, referência Stays e próximos passos.
12. Registrar IDs de teste, horários, resultado observado e divergências; não registrar token de retomada, QR Pix completo ou dados pessoais.

## Matriz de exceções para QA

| Cenário                               | Como preparar depois de aprovados os ambientes                          | Resultado esperado                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Cotação alterada/unidade indisponível | Alterar datas/oferta entre cotação e criação, usando fluxo de teste     | Nenhum pedido/cobrança com valor antigo; comprador precisa rever oferta.                                                            |
| Duplo clique/retry                    | Repetir a mesma requisição com a mesma chave e payload                  | Mesmo pedido/tentativa; não criar reserva ou cobrança duplicada.                                                                    |
| Reuso de chave com payload diferente  | Reutilizar a chave mudando método ou dados                              | Conflito explícito; não executar outra cobrança.                                                                                    |
| Cartão recusado                       | Usar caso recusado fornecido pelo gateway de teste                      | Mensagem recuperável, sem confirmação; nova tentativa só após estado anterior resolvido.                                            |
| Cartão em análise/Pix pendente        | Usar casos de teste pendentes                                           | Mostrar aguardando; não confirmar Stays, e-mail de confirmação ou comprovante definitivo.                                           |
| Webhook repetido/fora de ordem        | Reenviar notificações de teste em ordens diferentes                     | Deduplicação e estado final derivado da consulta autoritativa, sem duplicar ações.                                                  |
| Webhook ausente/atrasado              | Não enviar notificação ou atrasar entrega no ambiente de teste          | Recuperação periódica consulta gateway e converge sem cobrança nova.                                                                |
| Timeout após criação no gateway       | Simular timeout via ferramenta/configuração de teste controlada         | Pedido fica em estado incerto e consulta/recuperação busca o pagamento antes de permitir outra tentativa.                           |
| Pagamento aprovado após `expires_at`  | Usar cenário de teste aprovado pelo gateway e controlado pela equipe    | Atenção operacional; não confirmar automaticamente nem afirmar reserva confirmada.                                                  |
| Stays indisponível após aprovação     | Induzir falha somente no stub/conta de teste autorizada                 | Pagamento permanece conciliado; fila urgente; sem confirmação/comprovante prematuro; recuperação não duplica reserva ou lançamento. |
| E-mail indisponível                   | Usar transporte de teste que falha                                      | Reprocessar e-mail sem repetir cobrança ou reserva.                                                                                 |
| Retomada autenticada                  | Entrar com e-mail confirmado igual ao pedido em outro navegador         | Acessa sem receber o token permanente; e-mail diferente não acessa.                                                                 |
| Token visitante vencido/revogado      | Ajustar relógio/fixtures apenas em QA isolado ou usar registro de teste | Token inválido; data de expiração/revogação continua distinguível no painel.                                                        |

Falhas de rede devem ser simuladas em sandbox/stub. Não provoque falha usando credenciais de produção, não force Pix real e não solicite estorno/cancelamento real como parte do roteiro.

## Uso do painel operacional durante o QA

No painel de administração, abra a fila de vendas diretas e use **Atualizar fila** após cada reconciliação. A ordenação prioriza pagamento aprovado sem reserva confirmada; confira referência do pedido, ID de pagamento e ID Stays antes de falar com o hóspede ou repetir uma ação.

- **Webhook sem pedido vinculado:** confira o ID e estado no Mercado Pago. O botão **Tentar conciliação novamente** só aparece para notificação em falha ainda abaixo do limite (10 tentativas). Ele consulta o pagamento no gateway; não cria cobrança. Se o limite acabou ou o worker/fila não está disponível, faça conferência manual e não repita a cobrança.
- **Pagamento aprovado sem `booked` na Stays:** não reenvie o pagamento. Compare valor/moeda/ID no gateway e a reserva na Stays; aguarde a recuperação automática. Se continuar em atenção, registre a divergência e encaminhe à pessoa responsável definida pela operação.
- **Cancelamento/estorno manual:** o botão de encaminhamento só registra a conferência e exige uma tentativa aprovada compatível. A equipe executa separadamente a ação autorizada na Stays e o estorno no Mercado Pago conforme a política aprovada. Depois use os botões de consulta para confirmar cada estado. Consultar não executa cancelamento nem solicita outro estorno.
- **Reembolso pendente:** manter o caso aberto até o painel confirmar os dois fatos: reserva cancelada na Stays e pagamento `refunded` no gateway. Não informar conclusão ao hóspede antes disso.
- **E-mail falho:** confira a outbox e use o fluxo de recuperação de e-mail; reenviar mensagem não deve criar cobrança ou reserva.

O painel não atribui responsável, prazo, plantão ou alerta externo. Até a operação definir esses dados e um canal monitorado, a equipe deve acompanhar a fila manualmente durante o piloto; não considerar o scheduler como substituto de plantão.

## Evidências mínimas a guardar

- Referência pública do pedido e IDs de tentativa, pagamento de teste e reserva Stays de teste.
- Datas/horários de cada transição e resultado final observado em cada sistema.
- Composição do preço, moeda, versão das condições e prazo de reserva/Pix.
- Estado da outbox (sem conteúdo com PII) e confirmação de que houve um único e-mail esperado.
- Capturas redigidas da interface e do painel operacional, sem token, QR Pix, e-mail, telefone ou identificadores de hóspede.
- Divergências e ação de recuperação, incluindo prova de que o retry não duplicou efeitos.

## Critério para sair do piloto

O piloto só está validado quando Pix e cartão completarem os fluxos de sucesso e suas falhas críticas convergirem entre pedido CRCN, gateway, Stays, outbox e interface. Também é necessário ter as decisões comerciais aprovadas, páginas legais revisadas, canal/equipe de suporte definidos, e-mails e alertas observáveis e rotina diária de conciliação atribuída. Hoje há fila no painel e comandos de recuperação/reconciliação, mas ainda não há destinatário/canal de alerta nem pessoa/plantão operacional definidos. O rodapé ainda exibe “Privacidade” e “Termos” como texto sem páginas; as páginas e o consentimento de cookies/medição precisam de conteúdo aprovado antes de serem publicados. Para emitir voucher do condomínio, ainda falta aprovar e implementar a coleta dos dados de check-in e validar o documento/instrução com cada imóvel. Até essa aprovação, manter as flags desligadas e não abrir vendas.
