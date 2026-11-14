# Auditoria do checkout e plano de lançamento

**Atualizado em:** 14/11/2026
**Escopo:** checkout de reservas novas e cobrança de reservas existentes no site CRCN.
**Tipo de documento:** análise do código e da documentação local; não é certificação de produção nem parecer jurídico.

## Como ler este relatório

- **Implementado no código:** existe caminho ou proteção no repositório. Não significa que foi testado ponta a ponta ou habilitado em produção.
- **Parcial:** existe uma base, mas falta completar a experiência, aprovar conteúdo ou comprovar o comportamento real.
- **Falta validar:** depende de configuração, teste integrado ou confirmação com Stays, Cielo, equipe ou responsáveis da empresa.
- **Falta definir/aprovar:** é uma decisão comercial, operacional ou jurídica; não deve ser inventada pela interface.

O checkout tem duas jornadas relacionadas, mas diferentes:

1. **Reserva nova:** o site cota uma acomodação, cria um pedido/pré-reserva, recebe pagamento e precisa confirmar a reserva na Stays.
2. **Reserva existente:** o hóspede abre uma reserva já cadastrada na Stays e paga o saldo em aberto. A cobrança e a conciliação do pagamento com essa reserva são etapas distintas.

## Resumo executivo

Há componentes importantes de engenharia: validação no servidor, retomada protegida, idempotência, limites de requisição, bloqueios contra tentativas concorrentes, webhooks, reconciliação e estados que distinguem pagamento recebido de reserva confirmada.

O checkout ainda não deve ser considerado pronto para lançamento. No código local, os gates de venda direta e de checkout de reserva existente vêm desligados por padrão. As páginas legais estão vazias/não aprovadas, não aparecem nos checkouts isolados e o aceite de pagamento de reserva existente não substitui o aceite das condições comerciais e legais. Também faltam validações integradas e prontidão operacional comprovada.

**Prioridades antes de abrir vendas:**

1. Aprovar e publicar condições comerciais e documentos legais; exibi-los e registrar o aceite aplicável em cada jornada.
2. Provar em ambiente controlado o fluxo completo de cobrança, confirmação e conciliação com Stays.
3. Configurar e ensaiar suporte, e-mail, fila, scheduler, alertas e tratamento de cancelamento/reembolso.
4. Corrigir a retomada automática após falhas temporárias de consulta do pedido.
5. Fazer QA de acessibilidade, celular, consentimento e dados pessoais nas rotas isoladas.

## O que existe no código local

### Jornada e interface

- A rota de checkout de reserva existente identifica um código curto da Stays, consulta um resumo no servidor e apresenta cobrança por métodos habilitados. O saldo e os dados exibidos vêm da resposta do backend, não da query string.
- A jornada de reserva nova tem resumo, dados do comprador, opções de Pix/cartão, condições do imóvel e estados de pagamento/retomada.
- Após pagamento e confirmação, há coleta de dados dos hóspedes. O fluxo local inclui pré-preenchimento dos dados do comprador e validação de CPF; o limite de acompanhantes usa capacidade do apartamento.
- O checkout tem mensagens e chamadas de suporte para algumas falhas.
- As telas de reserva existente e retomada são montadas como páginas independentes. Elas não recebem automaticamente o rodapé global do catálogo. A rota de reserva existente também retorna antes de montar o componente global de preferências de medição.

### Pagamento, reserva e conciliação

- O backend guarda pedidos e tentativas de pagamento; há chaves de idempotência e proteções de concorrência para reduzir cobranças/registros duplicados.
- Webhooks são registrados e encaminhados para reconciliação com a fonte autoritativa do gateway. A página de retorno do navegador não deve, sozinha, confirmar pagamento.
- O fluxo separa estado do pedido, estado do pagamento e estado da reserva Stays. Reserva nova só deve ser apresentada como confirmada quando pagamento e Stays estiverem confirmados.
- Há registros operacionais e uma área interna para exceções; alguns procedimentos de cancelamento e estorno são manuais e exigem conferência da equipe.
- Há testes automatizados no repositório para pagamentos, reservas existentes, conciliação, páginas de checkout, CPF e URLs. Este relatório não executou a suíte.

### URLs, parâmetros e medição

- As URLs podem carregar imóvel, datas, hóspedes e um conjunto permitido de UTMs/identificadores de campanha.
- Esses valores são contexto e atribuição. Preço, saldo, política, pagamento e estado da reserva devem continuar vindo do servidor.
- A retomada usa referência pública e credencial enviada em cabeçalho/armazenamento do navegador, não token na query string. Respostas privadas usam `no-store`; endpoints de retomada e de escrita têm limites de requisição.
- A captura de atribuição é condicionada às preferências de medição no fluxo que monta esse componente. O consentimento precisa ser revisto também nas páginas isoladas.

## Checklist por área

| Área | Estado | Pendência concreta |
|---|---|---|
| Termos gerais, privacidade e cancelamento | **Falta publicar/aprovar** | `config/legal_pages.php` contém documentos sem conteúdo e com `approved=false`. Aprovar texto, versão, data e responsável. O rodapé global só lista documentos publicados; os checkouts isolados não têm esse rodapé. |
| Aceite da reserva nova | **Parcial** | O código registra versão e snapshot das condições do imóvel aceitas. Adicionar links claros para documentos legais, explicar o que está sendo aceito e verificar se os textos cobrem o preço final, taxas, cancelamento e responsabilidades aplicáveis. |
| Aceite de pagamento existente | **Parcial** | A caixa confirma o pagamento do saldo. Falta apresentar os termos do pagamento, eventuais juros/taxas, política de contestação/cancelamento aplicável e links legais; registrar versão e evidência de aceite compatíveis com a decisão aprovada. |
| Condições por acomodação | **Falta aprovar por imóvel/tarifa** | Validar preço/taxas, cancelamento/reembolso, forma e prazo de pagamento, validade da pré-reserva, atendimento, check-in, capacidade e restrições. Bloquear compra se as condições materiais estiverem indisponíveis ou desatualizadas. |
| Total, juros e parcelas | **Falta validar integrado** | Comparar total mostrado, parâmetros enviados à Cielo, valor efetivamente autorizado/capturado e valores registrados na Stays. Cobrir cada número de parcelas disponível e arredondamento. |
| Reserva temporária nova | **Falta validar com Stays** | Confirmar que `reserved` bloqueia disponibilidade, por quanto tempo, que `canceled` libera inventário e o que acontece com Pix aprovado após expiração. A existência de código não comprova a semântica na conta CRCN. |
| Reserva existente e pagamento parcial | **Falta validar ponta a ponta** | Confirmar os valores “Em aberto”, “A confirmar” e “Pago” antes/depois de Pix e cartão; assegurar que pagamento parcial não confirme e que taxas/extras não causem divergência de conciliação. |
| Webhook e reconciliação | **Implementado; falta ensaio integrado** | Ensaiar assinatura inválida, repetição, atraso, fora de ordem, indisponibilidade e timeout ambíguo. Confirmar que consulta autoritativa resolve o estado sem duplicar cobrança ou lançamento. A Stripe e a Adyen recomendam webhooks para acionar o trabalho pós-pagamento assíncrono. |
| Retomada e fallback | **Parcial** | O polling automático da página de retomada agenda nova consulta quando recebe estado válido. Uma falha temporária retorna antes de reagendar; adicionar retry com intervalo crescente, manter botão manual e exibir “última atualização”. |
| Cancelamento e reembolso | **Parcial/manual** | O sistema encaminha e verifica algumas ações, mas o processo não é totalmente automático. Definir autoridade para decidir, executar em Stays/gateway, conciliar, informar o cliente e guardar comprovantes. |
| E-mail transacional | **Falta validar configuração e entrega** | O código possui fila e recuperação, mas o envio está desligado por padrão no exemplo de configuração. Validar domínio/remetente, worker, templates, bounce, retry e mensagens de pagamento pendente, confirmação, check-in e cancelamento. |
| Suporte e operação | **Parcial** | Há contato/WhatsApp e fila interna. Definir horário, SLA, responsáveis e escalonamento para pagamento aprovado sem reserva, reserva sem pagamento, estorno pendente e divergência da Stays. |
| Segurança e dados pessoais | **Parcial; revisão necessária** | Confirmar acesso mínimo no painel, retenção e exclusão de CPF/telefone/e-mail, redação de logs, proteção de tokens, política de referenciador e ausência de dados pessoais em UTMs, analytics, mensagens de erro e ferramentas de suporte. |
| Consentimento de medição | **Falta validar em cada rota** | Testar aceitar/recusar/alterar preferências, e garantir que tags e atribuição sigam o consentimento em catálogo, checkout novo, checkout existente, retomada e confirmação. Separar aceite de compra da autorização de marketing. |
| Observabilidade e alertas | **Falta validar em produção** | Confirmar alertas acionáveis para webhook falho, pagamento aprovado sem reserva, fila parada, e-mail falho e reconciliação pendente. O diagnóstico de prontidão valida presença/formato de configuração, não operação real. |
| QA de interface | **Falta validação completa** | Percorrer as duas jornadas em celular e desktop, teclado e leitor de tela; verificar loading, vazio, erro, pagamento pendente, atualização, CPF inválido, falha de rede, recusa e sucesso. Medir contraste em superfícies claras/translúcidas. |
| Documentação e configuração publicada | **Precisa sincronizar** | Parte de `docs/mvp-vendas-diretas.md`, ADR e especificação descreve fases anteriores e recomendações antigas de provedor. Atualizar depois de confirmar o fluxo e a configuração efetivos, sem tratar docs antigos como prova da produção. |

## URL e parâmetros recomendados

- Manter URL curta e estável, com referência opaca do pedido/reserva; usar query apenas para contexto necessário e atribuição autorizada.
- Não colocar nome, e-mail, CPF, telefone, dados de cartão, QR Pix, saldo, status de pagamento nem credencial de retomada na URL.
- Não confiar em datas, hóspedes, imóvel ou valores da query como autorização ou cotação. O backend deve revalidar os dados e retornar o resumo autoritativo.
- Preservar UTMs e identificadores permitidos apenas pelo tempo e finalidade definidos na política de medição. Usar convenção única e valores padronizados para evitar relatórios fragmentados.
- Evitar enviar URL completa a logs e ferramentas externas quando ela contiver parâmetros desnecessários. A OWASP documenta que valores sensíveis em URL podem aparecer em histórico, logs e cabeçalhos `Referer`; o Google orienta não enviar PII para Analytics.

## Critérios para liberar um piloto

### Produto e conteúdo

- [ ] Imóveis piloto, preços, taxas, capacidade e condições comerciais foram conferidos com os responsáveis.
- [ ] Termos, privacidade, cancelamento/reembolso e conteúdo de aceite foram aprovados, versionados e publicados.
- [ ] Links legais estão visíveis no checkout novo e existente e funcionam em celular.
- [ ] O checkout explica estados pendentes sem prometer confirmação prematura.

### Técnico e financeiro

- [ ] A imagem/ref do código contém as alterações revisadas; não há dependência de mudança local não integrada.
- [ ] `direct-booking:check-readiness` foi executado no ambiente correto e todas as verificações foram entendidas. Resultado positivo não substitui compra controlada.
- [ ] Cielo, Stays, banco, worker, scheduler, domínio, fila, alertas e e-mail foram conferidos sem expor credenciais.
- [ ] Pix e cartão passaram por testes controlados, incluindo recusado, pendente, expirado, webhook repetido/atrasado e falha de Stays.
- [ ] Para reserva nova: cotação → `reserved` → pagamento → confirmação `booked` → lançamento único na Stays foi comprovado.
- [ ] Para reserva existente: pagamento aparece em “A confirmar” enquanto pendente; após confirmação, aparece em “Pago”; a reserva só sai de pré-reserva quando a regra de saldo definida for satisfeita.
- [ ] Valores, taxas, extras, arredondamento e parcelamento conciliam entre tela, gateway, pedido local e Stays.
- [ ] Um evento de compra é emitido uma vez, com valor e identificador corretos, somente após a confirmação autoritativa.

### Operação e recuperação

- [ ] Há responsável e prazo para tratar cada exceção prioritária.
- [ ] Cancelamento e reembolso foram executados e reconciliados em ambiente controlado; processo manual está documentado se não houver automação.
- [ ] Scheduler, worker e e-mail foram interrompidos em teste para comprovar alertas e recuperação.
- [ ] Backup recuperável, saúde, rollback e compatibilidade das migrations foram verificados antes do piloto.
- [ ] Existe limite de tráfego/piloto, acompanhamento diário e decisão clara de pausar cobrança.

## Ordem de trabalho recomendada

1. **P0 — Aprovações e conteúdo:** políticas, condições dos imóveis, aceite e dados de suporte.
2. **P0 — Integridade financeira:** testes controlados de Cielo e Stays para reserva nova e cobrança de reserva existente.
3. **P0 — Operação:** fila, responsáveis, prazos, e-mail, monitoramento, cancelamento e reembolso.
4. **P1 — Resiliência:** retry após falhas de consulta, reconciliação, eventos atrasados e fallback claro para atendimento.
5. **P1 — Privacidade e segurança:** consentimento por rota, retenção de dados, logs, acesso interno, cabeçalhos e análise de tags.
6. **P2 — UX e conversão:** consistência visual entre jornadas, resumo fixo no celular, clareza de parcelas, acessibilidade e análise de abandono.
7. **P2 — Documentação:** atualizar MVP, ADR e runbook com fatos validados e configuração vigente.

## Limites desta análise

- Este relatório foi produzido a partir do código e documentação presentes no worktree local em 14/11/2026. O branch tinha alterações não commitadas; este relatório não prova que todas elas estejam na `main` ou em produção.
- Não foram consultados Coolify, Stays, Cielo, banco de produção nem segredos. Nenhuma cobrança, reserva ou chamada mutável foi feita.
- Não foram executados testes nesta etapa. Os testes existentes precisam ser executados após a integração das mudanças e complementados por ensaios controlados de ponta a ponta.
- O texto legal e as políticas comerciais precisam de aprovação das pessoas responsáveis pela empresa e revisão profissional apropriada; este relatório identifica necessidades, não redige nem valida parecer jurídico.

## Referências do projeto

- [Checkout próprio em produção](checkout-proprio-producao.md)
- [MVP de vendas diretas](mvp-vendas-diretas.md)
- [Especificação de checkout e pagamentos](especificacao-checkout-pagamentos-proprios.md)
- [ADR 0001 — Checkout próprio e informações em camadas](adr/0001-checkout-proprio-e-informacoes-em-camadas.md)
- [Fluxo de checkout e Stays](stays-checkout-flow.md)
- [Configuração de documentos legais](../config/legal_pages.php)
- [Rota e rodapé do checkout](../src/App.tsx) e [rodapé global](../src/components/AppFooter.tsx)
- [URLs do checkout](../src/utils/checkoutUrl.ts)
- [Rotas de pagamento e webhooks](../routes/api.php)
- [Guia de lançamento do MVP](mvp-vendas-diretas.md#checklist-para-abrir-as-primeiras-vendas)

## Referências externas

- [Stripe — processamento pós-pagamento por webhook](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted)
- [Adyen — usar webhooks para lógica de negócio assíncrona](https://docs.adyen.com/development-resources/webhooks/webhook-types)
- [Google Analytics — parâmetros UTM e convenções de campanha](https://support.google.com/analytics/answer/10917952?hl=en-GS)
- [Google Analytics — evitar informações pessoais identificáveis nas URLs](https://support.google.com/analytics/answer/6366371?hl=en-SD)
- [OWASP — riscos de identificadores de sessão em URLs](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [ANPD — guia de cookies e proteção de dados pessoais](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais)
