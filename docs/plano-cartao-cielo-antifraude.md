# Plano de cartão Cielo, antifraude e confirmação Stays

Revisão: 03/11/2026, horário de Brasília. Base: main `76cd4cf`. Estado: primeira implementação local em andamento; nenhuma configuração de produção alterada nesta etapa.

## Escopo atualizado pelo responsável

Manter o Silent Order Post: número, validade e CVV seguem diretamente do navegador à Cielo; o backend recebe o PaymentToken e dados do pedido/pagador necessários à autorização. As credenciais da loja e a conferência do valor permanecem no servidor. Não implementar MPI V3, não trafegar dados brutos de cartão pelo backend e não iniciar um processo de certificação nesta etapa. A análise antifraude do provedor continua sendo um recurso separado a confirmar e integrar; SOP não a substitui.

Usar o antifraude integrado da API E-commerce: nossa aplicação envia a solicitação à Cielo com `Payment.FraudAnalysis`, e a Cielo encaminha a análise ao provedor habilitado. Não criar uma integração financeira apartada diretamente com o provedor. O responsável informou que não sabe qual provedor está habilitado; a comprovação da contratação permanece pendente. Não selecionar um provedor nem ativar o envio por tentativa.

A branch prepara o recebimento autenticado de ChangeType 3, a retenção do requisito de análise por tentativa e o bloqueio de confirmação automática para captura sem aceitação de risco consistente. O primeiro formato de aceitação reconhecido é o exemplo documentado ClearSale (`Status=1` e `StatusDescription=Accept`); formatos diferentes exigem conferência até homologação específica. Também rejeita campos brutos de cartão no endpoint da loja. Essas mudanças não habilitam nem contratam antifraude e não enviam novas transações para análise.

## Objetivo e condições de conclusão

Concluir a compra com cartão no checkout próprio, com até seis parcelas, proteção de risco validada e confirmação financeira na Stays somente após a confirmação autoritativa da Cielo. Preservar o Pix, o inventário e as integrações do parceiro Imobys.

O cartão só será considerado validado quando houver evidências separadas de configuração, tokenização, autenticação quando aplicável, análise de risco, captura, conciliação e confirmação na Stays. Testes simulados não comprovam habilitação comercial nem processamento real em produção.

## Diagnóstico confirmado no código

| Área | Situação encontrada | Consequência para o plano |
| --- | --- | --- |
| Dados do cartão | SOP no navegador; servidor recebe PaymentToken temporário | Preservar a arquitetura; não fazer PAN/CVV passarem pelo backend para encaixar uma integração nova |
| Autorização | `CieloEcommerceClient::createCardPayment` envia `Capture=true` | Introduzir política explícita de captura compatível com o antifraude contratado |
| Antifraude | Não há envio de `FraudAnalysis` nem leitura de seu resultado | Implementar requisição, persistência e decisões de risco, sem inferir aprovação pela captura isolada |
| 3DS | Não há fluxo nem `ExternalAuthentication` | Escolher antes a modalidade oficialmente suportada para a arquitetura SOP e a situação PCI do estabelecimento |
| Webhook | Aceita ChangeType 1, 5 e 25; rejeita 3 | Suportar evento de alteração de antifraude e consultar o estado real na API |
| Status financeiro | Autorizado fica pendente; capturado vira aprovado | Preservar a distinção e acrescentar a condição de risco/autenticação exigida pela política |
| Identificador do cartão | Novas tentativas usam MerchantOrderId com 32 caracteres | Referências de antifraude consultadas indicam tamanho 20; validar limite aplicável e adequar apenas novos pedidos, mantendo consultas históricas |
| Valores | Taxas 5,99% em 1x, 12,5% em 2–3x, 18% em 4–6x, calculadas por gross-up | Preservar regra atual e comprovar arredondamento, parcelas, total do gateway e lançamento contábil |
| Confirmação Stays | Já exige pagamento aprovado, valor/moeda compatíveis e conciliação financeira | Acrescentar bloqueios de risco sem duplicar lançamentos ou confirmar duas vezes |

Verificações executadas nesta revisão: 79 testes PHP passaram, com 430 asserções; os testes direcionados de formulário SOP, SDK, capacidades e checkout de página única passaram. São testes automatizados isolados, com respostas simuladas quando há gateway. Não houve nova cobrança real nem alteração de reserva.

Após a primeira implementação local, os 100 testes PHP direcionados passaram (613 asserções) e a suíte completa passou com 320 testes e 2.308 asserções. Pint e a verificação de whitespace também passaram. A migration aditiva foi exercitada no SQLite de testes; não foi aplicada em produção nem homologada em PostgreSQL nesta etapa. A consulta ao portal continuou indisponível por falha da conexão de automação; nenhum status comercial foi inferido dessa falha.

## Evidência de preparação da publicação de 03/11/2026

O responsável autorizou commit, PR, simulação e publicação do cartão após validação, preservando o Pix. PR #38. Uma inspeção temporária executada via GitHub Actions usou o acesso Coolify já existente, sem registrar credenciais, e será retirada do workflow antes do merge.

- Alvo confirmado: `hospeda-reservas-production`, aplicação `7pgw9mcr2vjt5red5pswmvi6`, estado `running:healthy`, imagem anterior `ghcr.io/centraldereservascaldas/hospeda-reservas:76cd4cf684b09e079ba562abcf75c720dfc48702`.
- Banco associado inequivocamente pelo host configurado na aplicação: `9bn7a32xssdvsi56wa3om1vv`, estado `running:healthy`.
- Backup novo solicitado no agendamento existente: execução `2lrwy4m1uqah3romaodlahrm`, `success`, 97.482 bytes, criada em 03/11/2026 às 17:57:58 de Brasília. O resultado do dump foi verificado pelo Coolify; não houve restauração em produção nem ensaio novo de restauração.
- Com as credenciais já implantadas, a Cielo retornou HTTP 200 no OAuth e HTTP 201 no endpoint SOP, com criação de AccessToken comprovada. Tokens e credenciais não foram exibidos. Essa verificação não enviou cartão nem solicitou autorização/captura financeira.
- A simulação integrada adicional de cartão cobriu captura em revisão sem baixa Stays, aceitação posterior por consulta autoritativa, webhook repetido e confirmação/lançamento únicos. Também existem cenários de aprovação e recusa. As respostas financeiras e a Stays nesses testes são simuladas; não comprovam autorização real de um cartão nem habilitação comercial de antifraude.
- Evidência operacional: [job de preparação no GitHub Actions](https://github.com/centraldereservascaldas/hospeda-reservas/actions/runs/41717137166/job/126200767886). A migration será compatível com a imagem anterior, que ignora os campos aditivos; eventual retorno de imagem deve preservar o banco e esses campos, sem executar `down` nem restaurar o dump automaticamente.

## Decisões que precisam vir antes do desenvolvimento

1. Confirmar que o produto é API E-commerce Cielo e qual provedor de antifraude está contratado para o MID efetivamente utilizado: ClearSale ou CyberSource. A existência de antifraude no Link/Checkout hospedado não comprova habilitação para a API própria.
2. Confirmar recursos e credenciais existentes de SOP e 3DS, domínios e configuração de captura. Reaproveitar as credenciais já cadastradas; solicitar somente algo comprovadamente ausente. Não gerar novas credenciais como tentativa de correção: a Cielo informa que a geração pode invalidar a chave atual, afetando parceiros que a compartilham.
3. Para uma eventual etapa futura de 3DS, resolver antes a compatibilidade com SOP. A documentação atual recomenda MPI V3, exclusivo para clientes com certificação PCI DSS. O MPI V2 está classificado como legado e a FAQ informa descontinuação, sem prazo fixado nas páginas consultadas. Não começar um fluxo V2 para refazê-lo logo depois; não enviar PAN ao backend para contornar essa decisão. A implementação atual não inclui 3DS e não deve ser apresentada como autenticada por esse protocolo.
4. Confirmar política comercial de captura, revisão manual, prazos e custo. Não contratar serviços, aceitar termos ou alterar parâmetros globais compartilhados sem decisão do responsável.

Esses itens ainda não foram comprovados no portal nesta revisão. Não interpretar a falta de comprovação como ausência de contratação.

## Etapas e critérios de passagem

| Etapa | Trabalho técnico | Participação do responsável | Só passa quando |
| --- | --- | --- | --- |
| 1. Inventário e contrato | Ler configurações existentes; confrontar MID, produto, ambiente, provider, SOP, 3DS, regras de captura e requisitos documentados | Entrar no portal/token quando solicitado; decidir eventual contratação | Registro de habilitações e compatibilidade da arquitetura; nenhuma suposição sobre produto ou credencial |
| 2. Contrato de dados | Mapear campos obrigatórios do provider escolhido: comprador/pagador, contato, endereço de cobrança quando exigido, itens, valor, datas e fingerprint; conferir limites e unidades | Validar informações comerciais eventualmente exigidas pelo provider | Exemplo de requisição completo e sanitizado, aceito no ambiente de homologação, sem inventar endereço ou preencher entrega física para hospedagem |
| 3. Política e backend | Separar status de autenticação, risco e pagamento; persistir identificadores e política aplicada por tentativa; adicionar bloqueios e eventos; preparar flags independentes por recurso de cartão | Aprovar a política de risco e o tratamento de revisão manual | Testes mostram que somente o conjunto permitido de estados pode confirmar a Stays |
| 4. Checkout SOP | Preservar envio direto do cartão à Cielo e autorização no backend por token; validar SDK, expiração, recusa, parcelas, retomada e envio ao provedor de risco escolhido | Acompanhar demonstração e decidir dados comerciais eventualmente exigidos | Nenhum PAN/CVV no payload da loja; valor e token conferidos no servidor; risco não decidido pelo navegador |
| 5. Homologação completa | Executar matriz abaixo com Cielo de homologação e Stays simulada; revisar segurança e observabilidade | Acompanhar demonstração e critérios de aceite | Evidências de aprovação, recusa, análise, captura, erro e recuperação; regressão Pix aprovada |
| 6. Publicação | PR e checks; backup compatível se houver migração; deploy com novas proteções inicialmente desativadas; conferir artefato e configuração; ativação após homologação | Autorizar mudanças comerciais ou de acesso que ainda forem necessárias e o teste real final, com limite definido | Teste real acompanhado confirma autorização/captura, lançamento Stays único e comunicação, sem afetar Imobys |

Não há necessidade de limitar imóveis a um piloto para executar esse plano. Isolamento técnico e revisão da ativação podem ser feitos por ambiente/flags de cartão; não haverá fallback para checkout Stays.

## Fluxo proposto, condicionado à habilitação do provedor

Cotação final da hospedagem e taxas → consentimento com valor/parcelas → pré-reserva com prazo → tokenização SOP e autenticação 3DS conforme modalidade validada → autorização/análise de risco → captura permitida → consulta autoritativa da Cielo → baixa financeira e confirmação única na Stays → confirmação ao cliente.

Ponto de partida recomendado para homologar o antifraude integrado: `AuthorizeFirst`, `SequenceCriteria=OnSuccess`, `Capture=false`, `CaptureOnLowRisk=true` e `VoidOnHighRisk=true`. A documentação descreve essa combinação para capturar após baixo risco e cancelar alto risco. A definição final depende do contrato e dos cenários reais do provider; não aplicar globalmente nem substituir a política atual antes dos testes.

Autenticação 3DS e antifraude têm funções distintas. Não presumir que toda autenticação dispensa análise nem que todo resultado positivo transfere a responsabilidade por contestação. Mapear exceções e elegibilidade segundo o contrato e os resultados reais.

| Situação | Tratamento esperado no site e na Stays |
| --- | --- |
| Apenas autorizado | Manter pendente; não dar baixa e não marcar reserva como paga |
| Risco em análise/revisão ou resultado desconhecido | Exibir análise em andamento; não capturar por fallback e não confirmar a Stays |
| Risco recusado | Bloquear confirmação e verificar cancelamento/estorno efetivo na Cielo |
| Capturado e demais critérios satisfeitos | Validar identidade da transação, valor, moeda e tentativa; atualizar o lançamento existente ou criar exatamente um; confirmar a reserva uma vez |
| Capturado com risco incompatível/inconclusivo | Encaminhar à conciliação operacional; não anunciar confirmação automática |
| Serviço de risco/3DS indisponível | Não reduzir silenciosamente a proteção; permitir recuperação segura ou atendimento |
| Prazo da pré-reserva vencido | Consultar novamente gateway e análise; resolver autorização/captura antes de liberar datas |
| Aprovação/captura tardia após liberação | Não reservar automaticamente datas possivelmente vendidas; colocar em tratamento operacional, com cancelamento/reembolso conforme autorização e política |
| Webhook repetido, atrasado ou fora de ordem | Consultar a API e aplicar transição idempotente; não rebaixar um estado confirmado por um aviso antigo |

Definir um limite de revisão compatível com a retenção das datas. Uma análise manual não pode manter disponibilidade bloqueada indefinidamente nem capturar depois de liberada sem detecção e tratamento. Antes de uma liberação, consultar Cielo e Stays novamente e lidar com a corrida entre aprovação, expiração e cancelamento.

## Alterações técnicas previstas

- `CieloEcommerceClient`: dados e parâmetros de antifraude, autenticação escolhida, política de captura e identificação compatível; sem retentativa cega de POST financeiro.
- `CieloCheckoutPaymentService`: decisões por risco/autenticação/pagamento, conciliação de resultado incerto e consulta por identificador antes de qualquer nova tentativa.
- `CieloWebhookController` e `ReconcileCieloPaymentWebhook`: ChangeType 3 quando aplicável, autenticação existente, fila e recuperação periódica; aviso apenas dispara consulta, não prova pagamento.
- Configuração/armazenamento: recursos de cartão com flags próprias; versão da política por tentativa para não reinterpretar pagamentos antigos com as regras novas. Não gravar credenciais ou payload sensível em logs; migrations somente se necessárias, aditivas e compatíveis.
- Formulário: campos mínimos realmente exigidos, fingerprint do provider, tratamento de desafio e estados de análise; destaque de número/valor das parcelas, com total final disponível antes do aceite.
- Stays: preservar pré-reserva e recebível pendente, completar o mesmo registro quando existir, conferir estado e valor via GET e somente então converter para reserva confirmada. Validar classificação contábil do cartão/parcelas e separar principal, acréscimo do cliente e tarifa efetiva para não duplicar receita ou taxas.

SOP protege o caminho dos dados de cartão, mas não comprova por si só certificação PCI da loja nem equivale a serviço antifraude. PAN e CVV não serão incluídos em banco, logs, analytics, URLs ou mensagens de WhatsApp. Segredos continuam exclusivamente no backend; o atendimento recebe apenas imóvel, datas, forma de pagamento, parcelas, valor e referência segura do erro.

## Matriz mínima de homologação

| Grupo | Cenários obrigatórios |
| --- | --- |
| Configuração | Credencial presente mas inválida; MID/ambiente/provider incorretos; serviço não contratado; SOP OAuth válido mas AccessToken SOP falha |
| Valores | 1x a 6x, taxas e gross-up atuais, arredondamento em centavos, parcela mínima, alteração de cotação, total adulterado no navegador e soma das parcelas |
| SOP | Token válido, expirado, reutilizado, SDK indisponível, timeout, duplo clique e retorno após sair da página |
| 3DS | Sem desafio, desafio aprovado/negado/abandonado, timeout, sessão vencida, troca de cartão/valor e resposta adulterada; executar apenas a modalidade selecionada |
| Risco | Aceito, rejeitado, revisão manual, erro, resposta ausente e aprovação/rejeição tardia; status de captura compatível em cada caso |
| Consistência | Autorização sem captura não confirma; webhook duplicado/fora de ordem/sem segredo; falha após envio; corrida de expiração; não lançar duas vezes |
| Stays | Total final de diárias mais taxas; disponibilidade e pré-reservas; falha ao criar/atualizar lançamento; falha ao confirmar após captura; recuperação sem repetir pagamento |
| Experiência | Desktop/mobile, desafio acessível, retomada do pedido, estados claros e WhatsApp sem dados sensíveis |
| Regressão | Pix continua gerando instruções, confirmando via webhook e reconciliando; ingressos continuam desativados; pedidos históricos e parceiro preservados |

Testes locais devem impedir HTTP real não simulado. Homologação externa usa exclusivamente credenciais/endpoints próprios de teste. Um teste real posterior exige escopo e valor definidos, acompanhamento e consulta final em Cielo e Stays; não é substituído por pagamento fabricado ou baixa manual.

## Evidências exigidas para liberar

Uma execução completa identificada por referência interna deve relacionar cotação aceita, parcela/total, sessão de autenticação se aplicável, análise do provider, PaymentId, captura, recebimento/processamento do webhook, registro financeiro e reserva Stays. Guardar somente metadados permitidos, com tempo de retenção e acesso restritos.

Publicação exige checks verdes, imagem e aplicação identificadas, fila/agendador saudáveis, segredo do webhook preservado e recuperação ensaiada. Desativar novas tentativas de cartão é a primeira ação de contingência; manter reconciliação dos pagamentos em andamento e Pix. Não desfazer migrações nem restaurar banco automaticamente para fazer rollback de código.

## Fontes oficiais consultadas

- [Antifraude da API E-commerce: contrato, provedores e sequência/captura](https://docs.cielo.com.br/ecommerce-cielo/docs/analise-de-fraude)
- [Referência ClearSale](https://docs.cielo.com.br/ecommerce-cielo/v3.0-en/reference/clearsale-fraud-analysis)
- [Referência CyberSource](https://docs.cielo.com.br/ecommerce-cielo/v3.0-en/reference/cybersource-fraud-analysis)
- [SOP: OAuth, token temporário e integração](https://docs.cielo.com.br/ecommerce-cielo/docs/integrando-com-o-sop)
- [Gerenciamento de microsserviços, credenciais e invalidação de chave](https://docs.cielo.com.br/ecommerce-cielo/docs/como-habilitar-microsservi%C3%A7os)
- [3DS: finalidade e diferença para antifraude](https://docs.cielo.com.br/ecommerce-cielo/docs/3ds-sobre)
- [MPI V3: requisito PCI e fluxo atual](https://docs.cielo.com.br/ecommerce-cielo/docs/mpi-v3)
- [FAQ MPI: migração, incompatibilidades e credenciais](https://docs.cielo.com.br/atendimento/docs/faq-nova-integracao-do-mpi-cielo)
- [Script MPI V2 classificado como legado](https://docs.cielo.com.br/ecommerce-cielo/docs/script-autenticacao)
- [Autorização com ExternalAuthentication](https://docs.cielo.com.br/ecommerce-cielo/docs/autorizacao-autenticacao)
- [Webhook e ChangeType 3](https://docs.cielo.com.br/ecommerce-cielo/docs/webhook)
- [Antifraude do Link/Checkout hospedado, produto distinto](https://docs.cielo.com.br/link/docs/antifraude-integrado)

As páginas contêm exemplos e requisitos que podem mudar. O esquema completo de campos, enumerações, limites, fingerprint e respostas do provider selecionado será fechado na etapa 2 com documentação específica e comprovação em homologação. O plano não trata lacunas de documentação como contratos já validados.
