# Plano de execução — vendas diretas CRCN

Atualizado em 13/10/2026. Objetivo: vender reservas no próprio site, receber o valor total pela CRCN, registrar reserva e pagamento na Stays, atender o hóspede e repassar ao proprietário no dia 15 conforme o contrato aplicável.

Este plano organiza entregas e responsabilidades; não autoriza cobrança real, alterações na Stays de produção, publicação ou repasses. O [escopo inicial do MVP](mvp-vendas-diretas.md) e o [fluxo técnico atual](stays-checkout-flow.md) continuam como referências.

## Decisões já tomadas

- Checkout da CRCN no site, sem redirecionar ao checkout da Stays. Pix e cartão; Mercado Pago é a primeira integração proposta. Cielo fica como alternativa posterior, após confirmar o produto e as credenciais necessárias.
- A CRCN recebe 100% do valor cobrado do hóspede. O cálculo devido ao proprietário varia por contrato; o repasse ocorre no dia 15 do mês. Período de corte e tratamento de ajustes ainda precisam ser definidos.
- `reserved` na Stays é usado para pré-reserva. A CRCN controla um prazo interno e cancela a pré-reserva quando o pedido expira ou o pagamento falha. O prazo inicial proposto é 30 minutos, a validar com Pix, operação e Stays.
- O contrato de locação é enviado após a confirmação. O checkout mostra as condições essenciais e oferece acesso às regras completas antes do pagamento; não mostra o contrato inteiro no formulário. O documento posterior não pode introduzir uma cobrança ou restrição relevante que não estava acessível na compra.
- Regras por equipamento ou condomínio aplicam-se somente aos imóveis correspondentes. Não presumir que toda unidade tenha AirFryer, caixa de chaves, roupa de cama, pulseira ou estacionamento pago.

## Estado do sistema e ajustes obrigatórios

O catálogo, a cotação e a consulta à Stays já existem. Há implementação local ainda não integrada para pedido idempotente, pré-reserva `reserved`, retomada protegida, pagamento Mercado Pago, webhook/reconciliação e confirmação/lançamento financeiro na Stays. A interface de checkout continua desabilitada: as três flags estão desligadas e o catálogo não tem snapshots de condições comerciais aprovadas. A rota de retomada existe; `/reservar/{listingId}` abre o anúncio com filtros de datas e hóspedes e não inicia pedido. Essa implementação não foi validada ponta a ponta e não está autorizada para cobrar.

Na API das viagens, `reserved` é exposto como pendente; `booked` e `contract` como confirmados. Reservas encerradas agora aparecem em “Viagens concluídas”, com comprovante histórico; o voucher continua restrito às confirmadas. A conta de viagens ainda não incorpora pedidos de compra como visitante. Cancelamentos de reservas do checkout direto são encaminhados ao atendimento para evitar divergência entre Stays e gateway; cancelamento e reembolso coordenados continuam pendentes. Antes de vender, conferir o total cobrado contra taxas da cotação real.

Há alterações locais anteriores em andamento. Cada executor deve conferir `git status` antes de criar um worktree, preservar essas alterações e trabalhar a partir de uma base explicitamente escolhida pelo coordenador. Arquivos não commitados do checkout, documentação, rodapé e viagens não são pressupostos como já integrados a outras árvores.

## Jornada e estados

| Passo | Resultado necessário | Dono do registro |
| --- | --- | --- |
| 1. Curadoria | Imóvel real, inventário, regras e contrato de repasse conferidos | Stays + CRCN |
| 2. Escolha | Preço total e condições específicas visíveis | Site |
| 3. Pedido | Dados mínimos, cotação revalidada e versão das condições guardadas | CRCN |
| 4. Pré-reserva | `reserved` vinculado ao pedido e prazo interno | Stays + CRCN |
| 5. Cobrança | Pix ou cartão associado ao mesmo pedido, com idempotência | Gateway + CRCN |
| 6. Confirmação | Pagamento aprovado, Stays atualizada e lançamento financeiro conciliável | Gateway + Stays + CRCN |
| 7. Pós-venda | Confirmação, coleta de dados de check-in, voucher e instruções | CRCN |
| 8. Exceções | Expiração, falha, alteração, cancelamento, reembolso ou contestação acompanhados | CRCN |
| 9. Fechamento | Recebimento, taxas, estornos, valor do proprietário e repasse no dia 15 | Financeiro CRCN |

Estados internos mínimos: `iniciado` → `cotado` → `pre_reservado` → `pagamento_pendente` → `pago_em_confirmacao` → `confirmado` → `concluido`. Saídas excepcionais: `expirado`, `pagamento_recusado`, `atencao_operacional`, `cancelamento_solicitado`, `reembolso_pendente`, `reembolsado` e `contestado`. A interface usa mensagens simples; o histórico interno preserva a causa e os IDs externos. `reserved` nunca equivale a “confirmado” para o hóspede.

## Informação certa no momento certo

| Momento | Conteúdo obrigatório ou útil |
| --- | --- |
| Anúncio | Capacidade, horários, principais restrições, itens fornecidos e ausentes, taxas externas conhecidas e política de cancelamento daquela unidade/tarifa. |
| Checkout | Imóvel, datas, hóspedes, total e parcelas/juros se houver; prazo exato de cancelamento; 2–3 avisos decisivos para a unidade; links para regras completas, privacidade e termos. Confirmar concordância com as condições acessíveis naquele momento e guardar sua versão. |
| Pagamento pendente | Estado real do Pix/cartão, vencimento e próximo passo. Não exibir voucher definitivo. |
| Reserva confirmada | Comprovante/contrato personalizado, pagamento realizado, saldo real, código Stays e próximos passos. |
| Pré-check-in | Endereço, horários, documentos/dados exigidos, retirada de chaves, itens que levar e taxas a pagar no local. |
| Durante e após a estadia | Suporte, registro de ocorrências, avaliação e fechamento financeiro. |

O contrato modelo fornecido em 13/10/2026 é fonte para catalogar regras, não texto pronto para automatização. Antes de gerar documentos, corrigir divergências entre “cancelamento gratuito até 14 dias” e “depósito não reembolsável”, entre pagamento integral e entrada de 50%, e entre valor recebido e saldo do exemplo. Revisar juridicamente política, multas, realocação e exclusões de responsabilidade. Condicionar multas por equipamento ao inventário e distinguir taxas do condomínio das cobranças da CRCN. Não copiar dados pessoais do exemplo para fixtures ou documentação.

## Etapas sequenciais e critérios de saída

### E0 — Fechar regras comerciais e operacionais

1. Escolher um pequeno grupo de imóveis reais para a primeira venda; conferir item por item, fotos, capacidade, horários, taxas extras, instruções e responsável pelo check-in.
2. Definir pagamento inicial (recomendação: 100% no MVP), parcelamento e juros, política de cancelamento por imóvel/tarifa, horários de suporte e procedimento de reembolso.
3. Confirmar na conta Stays como `reserved` bloqueia e é cancelado, quais campos são exigidos para reserva/pagamento e se existe política de cancelamento recuperável antes da compra. Fazer validação controlada antes de usar produção.
4. Definir cálculo do proprietário, período de corte do dia 15, ajustes por reembolso/contestação e responsabilidade fiscal/contábil.
5. Revisar contrato, páginas legais e dados públicos da empresa com os responsáveis.

**Saída:** tabela aprovada por imóvel/contrato, política sem contradições, procedimentos de exceção e credenciais de teste prontas. Nenhum prazo de pré-reserva ou data de reembolso é prometido sem capacidade operacional correspondente.

### E1 — Base de pedido e reserva

1. Criar pedido persistido com valor, moeda, datas, hóspedes, cotação, taxas, condições aceitas, prazo, origem e IDs externos.
2. Revalidar preço e disponibilidade no servidor. Se o valor mudar, pedir nova confirmação do comprador.
3. Criar `reserved` uma vez por pedido. Expirar/cancelar no servidor em rotina recuperável; registrar tentativas e falhas. Evitar liberar disponibilidade se ainda houver pagamento em processamento.
4. Criar fila de atenção para “pago sem reserva confirmada”, “pré-reserva não liberada” e divergências de preço.

**Saída:** um pedido não cria reservas duplicadas; pré-reservas vencidas são tratadas; eventos e falhas podem ser auditados.

### E2 — Checkout e pagamento próprios

1. Implementar checkout como visitante com dados mínimos e resumo de preço e condições.
2. Integrar Mercado Pago para Pix e cartão: chave pública no navegador, segredos no backend, idempotência, vencimento do Pix alinhado ao pedido, webhooks autenticados e consulta do estado ao gateway.
3. Confirmar a reserva na Stays e lançar o pagamento somente após aprovação. Mostrar estado intermediário quando a Stays ainda não confirmou.
4. Tratar recusas, cartões em análise, Pix tardio, webhooks repetidos e divergência entre gateway e pedido.

**Saída:** cada pagamento tem um pedido e uma reserva identificáveis; cobrança duplicada ou confirmação prematura não ocorre. Compra em celular percorre o fluxo completo.

### E3 — Confirmação, contrato e atendimento

1. Corrigir estados de “Minhas viagens” e voucher para refletir pagamento e reserva reais, sem método de pagamento fixo ou promessa de pulseiras liberadas.
2. Enviar e-mail transacional e disponibilizar comprovante/contrato com dados corretos. Coletar após pagar somente o que for necessário para check-in.
3. Enviar lembrete pré-check-in com regras da unidade e canal de suporte. Falha de e-mail gera reenvio, sem repetir cobrança ou reserva.
4. Substituir cancelamento direto por solicitação acompanhada: política aplicável, decisão, Stays, gateway e comunicação ao cliente.

**Saída:** hóspede recebe confirmação verdadeira; equipe encontra pedido, cobrança, reserva e histórico; cancelamento não deixa pagamento e Stays divergentes.

### E4 — Operação da primeira venda e lançamento

1. Publicar páginas de Quem somos, Cancelamento e reembolso, Privacidade e Termos; contato, razão social/CNPJ e avaliações verificáveis. Só usar selo externo com direito de uso.
2. Configurar domínio, HTTPS, e-mail transacional, alertas, backups e ambiente de produção.
3. Executar roteiro com Pix e cartão aprovado/recusado/pendente, expiração, atraso, duplicidade, falha Stays, cancelamento, reembolso, e-mail e celular.
4. Abrir vendas primeiro no grupo curado; conferir pedidos e gateway diariamente e atender exceções manualmente.

**Saída:** uma venda ponta a ponta gera cobrança, reserva Stays, comunicação, comprovante e registro financeiro reconciliáveis. Responsável de plantão definido.

### E5 — Crescimento e plataforma completa

Após estabilizar a operação: GTM/GA4 com consentimento e eventos únicos de compra/reembolso; captação opcional e e-mail marketing; medição de abandono e conversão; recuperação de checkout; conciliação e repasse do dia 15 com regras contratuais; portal/extrato de proprietário; automação de reembolsos e disputas; Cielo como segunda rota se custo/aprovação/contingência justificar; indicadores de margem por imóvel. Cada automação substitui um procedimento manual já observado e medido.

## Frentes paralelas em agentes e worktrees

**Regra de coordenação:** um agente coordenador mantém o quadro de dependências, as decisões e a integração. Cada agente executor recebe um pacote fechado, um worktree próprio, uma base conhecida e arquivos reservados. Nenhum agente modifica `.env`, executa cobrança/reserva de produção, faz push, merge ou deploy. Alterações preexistentes na árvore principal não são copiadas automaticamente para worktrees; o coordenador decide como integrá-las antes de iniciar pacotes dependentes. Branches sugeridas usam o prefixo `codex/`.

| Pacote / agente | Pode começar | Entrega isolada | Área reservada | Depende de |
| --- | --- | --- | --- | --- |
| A — Regras e conteúdo | E0 | Matriz por imóvel, cancelamento, taxas, conteúdo do checkout, contrato e mensagens; pontos para revisão jurídica | Documentação/conteúdo; não editar checkout ou Stays | Informações comerciais da CRCN |
| B — Stays e modelo do pedido | E0, em paralelo a A | Contrato técnico, pedido/estados, pré-reserva, expiração e sincronização Stays | `app/`, `database/`, `routes/api.php` com ownership exclusivo | Regra de prazo, campos Stays; integra política versionada de A |
| C — Interface e transparência | E0, em paralelo a A e B | Anúncio, resumo do checkout, regras relevantes, estados de pagamento e acessibilidade | `src/components/`, `src/services/` e tipos frontend atribuídos por arquivo | Contrato de API acordado com B; texto final de A |
| D — Pagamento | Depois de B definir pedido/IDs; pode avançar em estudo e adaptador isolado antes | Mercado Pago, webhook, idempotência e conciliação de status | Serviço/integrador e controlador de pagamento exclusivos no backend | Pedido persistido de B, credenciais de teste |
| E — Comunicação e voucher | Depois dos estados de B; conteúdo em paralelo | Templates transacionais, contrato personalizado, coleta pós-pagamento e voucher correto | Templates/e-mail e componentes de viagens reservados | Política de A, estados de B, confirmação de D |
| F — Confiança, legal e aquisição | Em paralelo a B–E | Páginas institucionais, identidade, GTM/GA4 básico e consentimento | Páginas e layout atribuídos; `.env.example` só com o coordenador | Conteúdo aprovado, IDs públicos de medição |
| G — Operação e financeiro | Pode modelar em paralelo; integrar depois de D | Fila de exceções, conciliação diária, cancelamentos, reembolsos e modelo de repasse | Módulos administrativos/financeiros exclusivos | Estados de B/D, contratos e corte do dia 15 |

**Ordem de integração:** A define condições e B define o contrato do pedido/API; C e D integram-se a B; E integra-se ao resultado confirmado; F pode entrar por partes; G recebe eventos finais. O coordenador resolve conflitos de `routes/api.php`, tipos compartilhados, `.env.example`, README e componentes de checkout. Pacotes B e D não editam o mesmo arquivo ao mesmo tempo. Se precisarem da mesma classe ou migração, dividir uma interface estável primeiro e executar a edição compartilhada em sequência.

Cada pacote deve entregar: diff limitado, decisões, estados de sucesso/erro/vazio, verificação proporcional, riscos e instruções de integração. O coordenador revisa e integra um pacote de cada vez, verifica os contratos entre frontend/API/Stays/gateway e atualiza o quadro antes de liberar dependentes. Não marcar um pacote concluído porque o código compila: o critério de saída funcional precisa ser demonstrado.

### Modelo de despacho ao agente

> Execute somente o pacote [letra] de `docs/roadmap-vendas-diretas.md` em worktree isolado. Leia `AGENTS.md`, skills e regras aplicáveis. Confirme base, arquivos reservados e alterações preexistentes antes de editar. Respeite o contrato de API acordado e não toque em arquivos de outros pacotes. Não use credenciais reais nem faça cobrança ou reserva em produção. Entregue diff, decisões, verificações, riscos e dependências para integração; não faça commit, push, merge ou deploy sem autorização explícita.

## Pendências que bloqueiam a primeira cobrança

- Política de cancelamento aplicável a venda direta, sem contradição; origem dessa política na Stays ou cadastro CRCN, versão salva no pedido.
- Definição de pagamento integral ou entrada/saldo. O fluxo de 100% antecipado é a hipótese do MVP até decisão comercial.
- Confirmação controlada do comportamento de `reserved`, do cancelamento e do prazo de 30 minutos; plano para Pix aprovado após a expiração.
- Public Key, segredo de webhook e credenciais de teste do Mercado Pago. Credenciais de produção já compartilhadas em conversa devem ser substituídas antes da abertura pública.
- Contratos de repasse: fórmula por imóvel, período de corte para o dia 15 e tratamento de reembolso/contestação.
- Dados exigidos pelo empreendimento para check-in, horários e equipe responsável por exceções.
- Revisão do contrato e textos públicos pelos responsáveis comercial/jurídico/contábil antes de publicar.
