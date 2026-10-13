# PRD — Reserva e pagamento no site CRCN

**Estado:** proposta para execução, sujeita às decisões comerciais e à revisão dos textos contratuais. **Atualizado:** 13/10/2026. **Plano de entrega:** [roadmap de vendas diretas](roadmap-vendas-diretas.md). **Decisão de arquitetura:** [ADR 0001](adr/0001-checkout-proprio-e-informacoes-em-camadas.md).

## Problema e resultado esperado

Hoje o visitante consegue explorar acomodações e obter cotação, mas não consegue concluir uma compra no site. A CRCN precisa vender uma reserva real com Pix ou cartão, receber o valor integral, registrá-la na Stays, entregar confirmação verdadeira ao hóspede e acompanhar exceções e repasse ao proprietário.

**Resultado do primeiro MVP:** uma pessoa reserva uma das unidades curadas, paga no site, recebe confirmação e documento corretos, encontra a reserva em “Minhas viagens” e sabe como proceder até o check-in. A equipe encontra pedido, cobrança, reserva e histórico no mesmo caso. O repasse do dia 15 pode ser operacional/manual no começo, com cálculo por contrato registrado.

## Público e necessidades

| Pessoa | Necessidade principal |
| --- | --- |
| Hóspede | Escolher com segurança, saber o custo total e as condições relevantes, pagar sem atrito, receber confirmação e instruções claras. |
| Atendimento CRCN | Localizar a venda, saber o estado real e resolver pagamento, reserva, cancelamento e chegada. |
| Financeiro CRCN | Conciliar valores recebidos, taxas, reembolsos e repasses por contrato. |
| Proprietário/empreendimento | Ter reserva correta na Stays e receber o valor devido no período contratado. |

## Princípios de experiência

1. **Informação progressiva:** anúncio para decidir, checkout para confirmar, documento para registrar, lembrete para preparar a chegada. O contrato posterior não introduz condição material inédita.
2. **Checkout curto:** pedir apenas dados necessários à compra. Dados adicionais de check-in vêm depois, com prazo e responsável claros.
3. **Condições específicas:** equipamentos, taxas e multas aparecem somente quando se aplicam à unidade ou à tarifa. A fonte deve ser uma ficha por imóvel, não um contrato genérico exibido indiscriminadamente.
4. **Estado verdadeiro:** “pagamento pendente”, “pagamento recebido; confirmação em andamento” e “reserva confirmada” são situações diferentes. Voucher definitivo só após confirmação de pagamento e reserva.
5. **Resolução humana possível:** falhas e exceções geram caso rastreável e contato, sem deixar o cliente sem resposta.

## Escopo funcional do MVP

### 1. Oferta e regras por imóvel

- Publicar apenas imóveis reais, com identificação Stays, fotos, capacidade, disponibilidade e cotação válidas.
- Manter por imóvel/tarifa: horários, itens fornecidos e ausentes, regras do condomínio, taxas externas conhecidas, instruções de acesso e política de cancelamento. Mostrar valor, destinatário e momento de pagamento das taxas externas quando conhecidos.
- Exibir no anúncio as condições que podem mudar a decisão de compra. No checkout, repetir um resumo de 2–3 avisos decisivos e o prazo exato de cancelamento, com links para as regras completas.
- Guardar no pedido a versão das condições apresentada e aceita. O texto de aceite deve mencionar condições acessíveis antes da compra; não afirmar que a pessoa leu um contrato que será enviado somente depois.

### 2. Checkout e pedido

- Permitir compra como visitante. Solicitar nome, e-mail, telefone e apenas outros dados estritamente necessários à cobrança/reserva.
- Exibir imóvel, datas, hóspedes, preço final, taxas, descontos, juros/parcelas aplicáveis e condições de cancelamento antes da ação de pagar.
- Revalidar preço e disponibilidade no servidor. Se houver alteração, interromper a compra, mostrar a nova proposta e exigir nova confirmação.
- Criar um pedido único, com valor e condições congelados, prazo interno, IDs externos e histórico de transições.

### 3. Pré-reserva e pagamento

- Criar `reserved` na Stays antes da cobrança. A CRCN controla expiração interna; 30 minutos é hipótese inicial a validar. Rotina do servidor trata abandono e falha, sem depender de navegador aberto.
- Disponibilizar Pix e cartão pelo Mercado Pago no primeiro MVP. Autenticar notificações, consultar estado no gateway e aplicar idempotência a tentativas, webhooks e lançamento na Stays.
- Após pagamento aprovado, confirmar a reserva na Stays e lançar o pagamento nela. Se a Stays falhar, abrir caso de atendimento e informar estado intermediário ao cliente.
- Não confirmar automaticamente Pix que entrar depois de a pré-reserva ter sido cancelada; verificar disponibilidade e resolver ou reembolsar.

### 4. Confirmação e estadia

- Enviar e-mail transacional e mostrar a reserva em “Minhas viagens” com status correto.
- Gerar comprovante/contrato personalizado após confirmação, com valores recebidos e saldo calculados a partir de pagamentos reais, dados da reserva e somente cláusulas/itens aplicáveis.
- Coletar dados adicionais de check-in depois do pagamento e entregar voucher quando os requisitos operacionais estiverem completos. Não prometer pulseiras liberadas nem acesso imediato sem confirmação do empreendimento.
- Enviar lembrete pré-check-in: horário, endereço, documentos, acesso, itens que levar, cobranças locais e suporte.

### 5. Atendimento e financeiro

- Substituir cancelamento direto por solicitação acompanhada, com política aceita, decisão, atualização Stays, reembolso no gateway e comunicação ao cliente.
- Dar à equipe uma fila mínima: pagamento aprovado sem reserva confirmada, Pix tardio, pré-reserva não liberada, e-mail falho, reembolso pendente e divergência financeira.
- Conciliar diariamente pedido, gateway e Stays. Registrar valor bruto, taxas, estornos, contestações e valor devido ao proprietário. Preparar o fechamento do dia 15 conforme contrato.

## Conteúdo por momento

| Momento | Mensagem/artefato | Evitar |
| --- | --- | --- |
| Anúncio | O que a unidade oferece, o que não oferece, taxas, horários e cancelamento. | Informações genéricas que parecem valer para todos os imóveis. |
| Checkout | Resumo financeiro, prazo de cancelamento, avisos decisivos e links para regras completas. | Contrato longo e tabela integral de multas ao lado do pagamento. |
| Pagamento pendente | Prazo e instrução de Pix/cartão, status e suporte. | “Reserva garantida” antes da confirmação. |
| Confirmado | Código, valores efetivos, contrato/comprovante e próximos passos. | Saldo fixo, método de pagamento presumido ou promessa operacional não verificada. |
| Pré-check-in | Lembrete específico da unidade e contatos. | Repetir o contrato inteiro. |

## Requisitos não funcionais e mensuração

- Segredos de Stays/gateway permanecem no servidor; dados de cartão ficam com o provedor. URLs e IDs públicos podem ser enviados ao navegador quando exigidos pela integração.
- Fluxo funciona no celular e com teclado, labels associados, foco visível e estados de carregamento/erro/sucesso acessíveis.
- Cobrança e confirmação suportam repetição de requisições e entrega fora de ordem de notificações. Cada ação tem horário, ator, resultado e referência externa.
- E-mail transacional e suporte ficam prontos para o lançamento. GA4/GTM medem funil e compra uma vez por pedido confirmado, sem informações pessoais nos eventos; marketing por e-mail exige preferência separada.
- Indicadores iniciais: visitas ao imóvel → checkout → pagamento aprovado → reserva confirmada; erros por etapa; tempo de confirmação; pagamentos sem reserva; cancelamentos; margem bruta por imóvel após taxas e repasse.

## Fora do primeiro MVP

- Cielo como segunda rota, roteamento inteligente de gateways, parcelamento/entrada com cobrança futura, repasse automático, portal completo do proprietário, recuperação automática de carrinho e automação extensa de marketing.
- Esses itens entram após existir operação manual observável, regras comerciais fechadas e métricas que justifiquem a automação.

## Critérios de aceite para abrir vendas

1. Uma compra controlada de Pix e uma de cartão percorrem cotação → `reserved` → pagamento aprovado → reserva confirmada e pagamento registrado na Stays → confirmação, contrato e voucher corretos.
2. O cliente vê preço final e política aplicável antes de pagar; a versão aceita fica associada ao pedido e coincide com o documento posterior.
3. Recusa, pagamento em análise, Pix expirado/tardio, webhook duplicado, preço alterado e falha Stays têm estado e procedimento de resolução; não há confirmação nem cobrança duplicadas.
4. Cancelamento e reembolso deixam pedido, gateway e Stays reconciliáveis; a equipe identifica o caso e o cliente recebe orientação.
5. Telas em celular, e-mails, dados da empresa, páginas legais e suporte estão prontos para os imóveis inicialmente vendidos.

## Decisões abertas

- Pagamento de 100% no MVP (recomendado) ou entrada de 50% e saldo posterior; juros e parcelamento reais.
- Política de cancelamento para venda direta sem conflito com “depósito não reembolsável”; origem da regra (Stays ou cadastro CRCN) e revisão jurídica.
- Prazo de `reserved`, expiração Pix e comportamento do cancelamento na conta Stays.
- Período de corte, fórmula contratual e ajustes do repasse do dia 15.
- Dados de check-in por empreendimento, contrato/voucher aceitos e responsáveis pelo atendimento.
- Public Key, segredo do webhook e credenciais de teste do Mercado Pago.

## Base visual reutilizável

O projeto **ainda não tem um design system formal ou biblioteca de componentes UI genéricos**. Tem uma base concreta: React 19, Tailwind CSS 4, três tokens globais (`focus-ring`, `page`, `glass-border`) e classes de superfície `liquid-glass*` em `src/index.css`; `useDialogFocus` padroniza foco de modais; componentes de catálogo, busca, propriedade e reserva ficam agrupados por domínio. O [plano de qualidade do frontend](frontend-quality-plan.md) prevê ampliar tokens semânticos e extrair primitivas somente com usos reais.

Para esta jornada, reutilizar primeiro o padrão atual de modal, preço, tipografia, superfícies, foco e movimento reduzido. Ao implementar checkout e páginas legais, consolidar **somente padrões repetidos** de botão, campo, aviso de status, resumo de preço e bloco de condições. Definir estados de carregamento, erro, pendente, sucesso e desabilitado. Registrar exemplos e regras de uso após os primeiros componentes compartilhados existirem; não bloquear a primeira venda para construir um kit genérico inteiro.
