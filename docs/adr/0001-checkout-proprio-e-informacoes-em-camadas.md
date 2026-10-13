# ADR 0001 — Checkout próprio e informações em camadas

**Estado:** aceito para orientar o desenho; detalhes comerciais e jurídicos pendentes. **Data:** 13/10/2026. **Escopo:** venda direta de reservas no site CRCN. **PRD:** [reserva e pagamento](../prd-vendas-diretas.md).

## Contexto

O site consulta inventário e cotação da Stays, mas não cobra nem confirma reservas no checkout da CRCN. A empresa quer receber o valor total no próprio site e registrar a reserva na Stays. O contrato de locação existente é enviado após a confirmação e contém regras gerais, multas e itens que não se aplicam a todas as unidades. Exibi-lo integralmente no formulário de pagamento criaria excesso de informação; enviá-lo apenas depois da compra não pode ser o primeiro momento em que uma condição material aparece.

Também precisamos distinguir pré-reserva, pagamento e reserva confirmada. A Stays aceita `reserved`, e a CRCN pode controlar a expiração dessa pré-reserva internamente. O gateway é a fonte do estado da cobrança; a Stays é a fonte da reserva; o pedido CRCN registra a relação entre ambos e as condições aceitas.

## Decisão

1. **Checkout da CRCN:** o hóspede escolhe, informa dados mínimos e paga com Pix ou cartão no site. Mercado Pago é a primeira integração planejada. Cielo só entra após necessidade demonstrada e confirmação de credenciais/produto.
2. **Pedido local persistido:** guarda cotação final, identidade do comprador, imóvel/datas/hóspedes, versão das condições aceitas, prazo interno e identificadores de pré-reserva, pagamento e reserva.
3. **Pré-reserva Stays antes da cobrança:** criar `reserved` e controlar o vencimento no servidor. O prazo inicial de 30 minutos é uma hipótese operacional, dependente de validação do bloqueio/liberação na conta Stays e do vencimento da cobrança.
4. **Confirmação por duas fontes:** somente pagamento aprovado no gateway e reserva confirmada na Stays produzem estado “confirmado” e voucher definitivo. Pagamento aprovado com falha na Stays gera caso urgente; Pix tardio após liberação não confirma automaticamente.
5. **Informação em camadas:** anúncio mostra características e condições relevantes; checkout repete preço total, cancelamento e poucos avisos decisivos, com links para regras completas; contrato personalizado é enviado após a confirmação; instruções práticas são lembradas antes do check-in.
6. **Aplicabilidade por unidade:** equipamentos, taxas e multas condicionais dependem da ficha da unidade/condomínio e da tarifa. O contrato posterior usa apenas o que se aplica à reserva.
7. **Aceite verificável:** antes de pagar, a pessoa acessa as condições aplicáveis e confirma sua concordância; o pedido guarda a versão apresentada. O texto de aceite não declara leitura de contrato enviado apenas posteriormente.
8. **URL em dois momentos:** antes do pedido, datas e hóspedes na URL são apenas uma seleção pré-preenchida e sempre revalidada. Depois do pedido, uma referência pública opaca permite retomar o estado persistido com controle de acesso; preço, condições, reserva e pagamento nunca são inferidos da query string.

## Consequências

- O checkout pode permanecer curto, enquanto preço, cancelamento e restrições decisivas continuam claros antes do pagamento.
- São necessários cadastro editorial por imóvel, versionamento de regras, pedido local, rotina de expiração, webhooks, idempotência, fila de exceções e reconciliação diária.
- Contrato, e-mail, voucher e lembretes devem derivar dos mesmos dados da reserva; valores recebidos e saldo são calculados, não texto fixo.
- Regras comerciais contraditórias do contrato modelo precisam ser resolvidas e revisadas antes de publicar ou automatizar. A decisão não aprova multa, retenção integral, realocação ou exclusão de responsabilidade específicas.
- Uma alteração de datas/hóspedes após o pedido exige nova cotação e resolução da pré-reserva/cobrança anterior; links de retomada não podem expor dados pessoais apenas pela posse de um ID.
- O padrão visual existente (Tailwind, superfícies, tokens e foco de diálogos) é reutilizado. Componentes compartilhados são extraídos quando houver repetição concreta; não se cria uma biblioteca geral como pré-requisito do MVP.

## Alternativas consideradas

| Alternativa | Motivo para não escolher agora |
| --- | --- |
| Checkout hospedado da Stays | Não atende à decisão de vender e cobrar dentro do site CRCN. |
| Mostrar o contrato inteiro antes de pagar | Aumenta a carga visual e repete detalhes operacionais; as condições materiais podem ser resumidas e acessadas em profundidade por links. |
| Enviar todas as regras somente após o pagamento | O cliente poderia descobrir taxa ou restrição decisiva depois da compra. |
| Cobrar sem `reserved` | Aumenta a chance de pagamento aprovado sem disponibilidade protegida. |
| Integrar Mercado Pago e Cielo simultaneamente | Duplica estados, conciliação e operação antes da primeira venda. |

## Pontos de revisão

- Confirmar na Stays que `reserved` bloqueia e que o cancelamento libera disponibilidade na conta utilizada.
- Fechar prazo de expiração, política de Pix tardio, forma de pagamento (100% ou entrada/saldo) e política de cancelamento por imóvel/tarifa.
- Revisar com responsáveis comercial, jurídico e contábil a redação pública e o contrato personalizado.
- Reavaliar gateway secundário e componentes UI compartilhados com dados da operação, após o primeiro ciclo de vendas.
