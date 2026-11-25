# Roadmap do sistema de afiliados

Este documento organiza a evolução do programa de afiliados. Ele descreve trabalho planejado e não significa que cada etapa esteja disponível em produção.

## Estado verificado em 24/11/2026

### Implementado no PR, ainda não integrado

O [PR #75](https://github.com/centraldereservascaldas/hospeda-reservas/pull/75) está aberto como rascunho, com CI verde e mergeable no momento da verificação. Ele **não foi integrado à `main` nem implantado**. Os itens abaixo descrevem a branch do PR, não funcionalidades disponíveis em produção.

- Gera nickname de afiliado aprovado e links curtos persistidos para imóveis elegíveis.
- Redireciona por `/a/{token}`, registra cliques e protege o destino contra URL arbitrária.
- Mantém atribuição server-side por cookie HttpOnly protegido, por 7 dias, com regra de último clique válido.
- Lê a atribuição no servidor durante o checkout, registra conversão pendente e impede duplicação.
- Guarda referências de atribuição na conversão para auditoria e mostra dados relacionados na administração.
- Remove a captura antiga baseada em armazenamento local e assinatura controlada pelo cliente.
- CI do PR validou backend/frontend, migrations SQLite e PostgreSQL 16/17 e smoke checks.

**Próximo passo desta entrega:** revisar regra comercial, atribuição e privacidade/cookie; tirar o PR de rascunho e integrar pelo processo normal de revisão e aprovação. Nenhum merge ou deploy foi feito.

### Planejado, ainda sem implementação confirmada

- Barra de afiliado dentro das páginas de imóveis.
- Campanhas próprias, etiquetas por posicionamento e UTMs associadas aos short links.
- Relatórios para o afiliado por link/campanha, com conversões e comissões conciliáveis.
- Área financeira para dados PF/PJ, documentos, validação e pagamentos.
- Termos versionados, aceite auditável e regras comerciais aprovadas.
- API versionada com credenciais limitadas para campanhas, links e métricas.
- Operação de suporte, fraude, aprovação financeira e conciliação de pagamentos.

Os detalhes abaixo são planejamento e critérios de aceite; não são evidência de que o código exista ou esteja habilitado.

### Trabalho de planejamento concluído

- Roadmap inicial da barra de afiliado durante navegação documentado.
- Pesquisa comparativa documentada sobre atribuição/link do Mercado Livre, Booking.com, Awin e impact.com.
- Checklist de segurança inicial para a futura API de afiliado documentado.
- Checklist de regularização financeira, proteção documental e pauta de termos jurídicos/contábeis documentados.

Esses itens são entregáveis de análise e documentação; não contam como implementação de produto.

## Próximas etapas

### Barra de afiliado durante a navegação

**Objetivo:** permitir que um afiliado autenticado gere e copie seu link curto enquanto navega pelos imóveis, sem precisar voltar ao portal de afiliados.

- Exibir uma barra ou ação persistente para contas de afiliado autenticadas nas páginas elegíveis do catálogo.
- Na página de um imóvel elegível, oferecer “Criar link de afiliado” e copiar o link curto correspondente àquele imóvel.
- Reutilizar o endpoint de geração de links para manter um link estável por afiliado e imóvel.
- Exigir autenticação e aprovação do afiliado; não aceitar um destino arbitrário enviado pelo navegador.
- Ocultar ou desabilitar a ação em páginas sem destino elegível, imóveis indisponíveis ou contas suspensas.
- Mostrar estados de carregamento, sucesso ao copiar e erro recuperável, com suporte a teclado, leitores de tela e telas pequenas.
- Preservar a navegação e filtros atuais ao entrar e sair da experiência autenticada.

**Critérios de aceite:**

1. Um afiliado aprovado e autenticado consegue gerar/copiar o link a partir da página do imóvel.
2. O link aponta para o imóvel correto e passa pelo redirecionamento `/a/{token}` existente.
3. Repetir a ação para o mesmo imóvel retorna o mesmo link, sem criar links duplicados.
4. Visitantes, afiliados não aprovados e páginas não elegíveis não conseguem gerar links.
5. A barra não cobre conteúdo, checkout nem controles importantes em desktop ou mobile.

**Dependências:** concluir e integrar o PR da arquitetura de afiliados; validar a jornada de login/retorno do afiliado e definir em quais rotas do catálogo a barra deve aparecer.

**Status:** não implementado.

### Campanhas e UTMs

**Status:** não implementado.

**Objetivo:** permitir ao afiliado organizar divulgações e medir quais canais, campanhas e peças geram tráfego e reservas.

- Permitir criar, editar, arquivar e listar campanhas próprias, com nome, período opcional, canal e observações.
- Associar links curtos a uma campanha e opcionalmente a uma peça/canal específico, por exemplo `instagram-story` ou `newsletter-junho`.
- Gerar UTMs padronizadas (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content` e, quando aplicável, `utm_id`) a partir dos campos da campanha.
- Manter os parâmetros sob controle do servidor. O afiliado escolhe valores permitidos nos campos, mas não pode alterar o token, identidade do afiliado, destino validado ou dados usados para comissão.
- Redirecionar para uma página interna elegível com UTMs preservadas para analytics, sem usar UTMs como prova de autoria da venda.
- Exibir relatórios por campanha/canal: links, cliques válidos, reservas atribuídas, cancelamentos e comissões por status, respeitando atraso e janela de atualização.

**Modelo conceitual:** campanha é uma organização de marketing; UTM descreve origem/canal/conteúdo; link curto guarda o destino e o vínculo com afiliado/campanha; clique é um evento imutável; atribuição registra a regra comercial aplicada; conversão guarda um snapshot auditável. UTMs ajudam análise de tráfego, mas comissão depende da atribuição server-side autenticada pelo token e pelo cookie.

**Critérios de aceite:**

1. Campanha e link pertencem sempre ao afiliado autenticado, verificado no servidor.
2. Um link não pode receber `affiliate_id`, token de afiliado, comissão ou domínio de destino arbitrários via query string.
3. Reutilizar ou editar nome/UTMs não muda retroativamente os dados já registrados em cliques e conversões.
4. Relatórios distinguem clique bruto de clique válido e conversão pendente de aprovada, cancelada ou rejeitada.
5. Valores das UTMs têm limites de comprimento/caracteres e não podem conter dados pessoais ou segredos.

### API para afiliados e integrações

**Status:** desenho inicial apenas; não implementado e ainda sem consumidores confirmados.

**Objetivo:** permitir que afiliados técnicos integrem ferramentas próprias, sites e automações às operações permitidas na conta deles.

**Primeira versão recomendada:** API REST versionada (`/api/affiliate/v1`) para gerar e consultar recursos próprios. Começar com API keys pessoais revogáveis e escopos mínimos; usar OAuth 2.0 somente se surgir integração multiusuário/de terceiros que precise delegação formal.

**Operações candidatas para a primeira versão:**

- Consultar perfil, estado de aprovação, limites e escopos da credencial.
- Listar imóveis atualmente elegíveis e consultar os detalhes públicos permitidos para divulgação.
- Criar e listar campanhas do próprio afiliado.
- Criar links curtos para imóveis elegíveis, com campanha, destino interno validado e etiquetas de canal/conteúdo.
- Consultar métricas agregadas dos próprios links e campanhas, com janela temporal e paginação.
- Revogar e rotacionar suas credenciais.

**Fora da API do afiliado:** aprovar/suspender afiliados; alterar percentuais, regras ou status financeiros; criar ou confirmar reservas/pagamentos; consultar dados pessoais de hóspedes; ler dados de outros afiliados; escolher URL arbitrária/externa; marcar conversões como aprovadas; ou apagar trilha de auditoria.

**Segurança e operação obrigatórias antes de liberar:**

- Separar autenticação da API de afiliado da sessão do painel; proteger rotas com token Bearer em HTTPS.
- Mostrar a credencial em texto puro somente uma vez e armazenar somente hash; permitir nome, última utilização, escopos, expiração, revogação e rotação na interface.
- Escopos iniciais restritos, por exemplo `campaigns:read`, `campaigns:write`, `links:read`, `links:write`, `reports:read`; nenhuma chave com acesso administrativo.
- Aplicar autorização por objeto em toda requisição, garantindo que campaign/link/report pertença ao afiliado autenticado.
- Validar propriedade e elegibilidade do imóvel, filtrar campos de resposta e bloquear atribuição massiva de propriedades.
- Definir limites de requisições e criação de links, paginação, tamanho de payload, cotas e respostas `429` com `Retry-After`.
- Implementar idempotência para criações que possam ser repetidas por retries de rede; retornar erros consistentes, `request_id` e documentação OpenAPI.
- Auditar criação, revogação e uso das chaves, criação/alteração de campanhas e links; nunca registrar o segredo Bearer.
- Monitorar abuso, tentativas de acesso entre afiliados, links inválidos e volume anormal de cliques; disponibilizar política de retenção de eventos.
- Definir versionamento, descontinuação e suporte antes de chamar a API de estável.

**Critérios de aceite:**

1. Uma credencial só acessa dados e recursos do afiliado dono dela, inclusive quando IDs de outros afiliados são enviados.
2. Credenciais revogadas ou expiradas deixam de funcionar imediatamente, e suas operações ficam auditadas sem gravar o segredo.
3. Cada chave só executa operações cobertas pelos próprios escopos.
4. Limites de criação/consulta e proteção contra abuso estão ativos e documentados.
5. Existe especificação OpenAPI com exemplos, erros, limites, paginação, política de credenciais e changelog.

## Ordem sugerida

1. **Fechar a etapa base:** revisar o PR #75, validar atribuição, privacidade e cookie; integrar pelo processo normal.
2. **Definir o negócio:** aprovar comissão, cancelamentos, beneficiário do pagamento, critérios de afiliado e suporte.
3. **Implementar a barra contextual** para gerar links a partir de imóveis e testar autenticação/aprovação.
4. **Validar termos e regularização** com jurídico e contabilidade antes de decidir documentos, dados bancários e retenções.
5. **Construir campanhas e UTMs**, mantendo analytics separado da atribuição de comissão.
6. **Construir relatórios e financeiro**, com estados de conversão, comissão, retenção, pagamento e conciliação.
7. **Decidir e lançar API somente com consumidores definidos**, começando por métricas read-only.
8. **Homologar e liberar gradualmente**, com suporte, alertas, revisão de segurança, rollback e aprovação de negócio.

## Checklist mestre de análise e verificação

Marque cada item somente após revisar evidência (código, teste, decisão aprovada, tela ou execução registrada). Use `N/A` com justificativa quando não se aplicar. Uma etapa fica **pronta** quando todos os itens obrigatórios passam, os bloqueios estão resolvidos e o responsável registra a evidência.

### 0. Produto, políticas e preparação

- [ ] Definir quem pode se candidatar e os estados do afiliado: solicitado, em análise, aprovado, suspenso e encerrado.
- [ ] Definir processo de identidade, aprovação, convite, login, recuperação de acesso e encerramento da conta.
- [ ] Aprovar regra comercial: comissão, base de cálculo, elegibilidade de imóvel/estadia, cancelamento, reembolso, fraude, disputa e pagamento.
- [ ] Aprovar explicitamente janela e regra de atribuição (atual proposta: 7 dias e último clique de afiliado válido).
- [ ] Definir regras para afiliado comprar pelo próprio link, compras relacionadas e outras formas de autoindicação.
- [ ] Definir canais permitidos, divulgação de publicidade, uso de marca, spam e tráfego pago.
- [ ] Definir consentimento, aviso de privacidade, finalidade do cookie, retenção e descarte de cliques/atribuições.
- [ ] Definir quem é o contratante/beneficiário da divulgação e quem deve pagar a comissão em cada modelo de negócio.
- [ ] Obter revisão dos termos, regras de publicidade, tributação e fluxo de documentos por jurídico e contabilidade.
- [ ] Mapear fonte de verdade e sincronização de imóveis, usuários, reservas, pagamentos e status financeiros.
- [ ] Confirmar que o PR da arquitetura base foi integrado e que o ambiente alvo está na migração correspondente antes de iniciar dependências.
- [ ] Registrar dono de produto, responsável financeiro/operacional, suporte e decisão de lançamento.

**Gate:** política comercial, privacidade e operação aprovadas; fontes de dados e responsáveis identificados.

### 1. Base de links e atribuição

- [ ] Link usa token aleatório não sequencial, com unicidade e comportamento definido para revogação.
- [ ] Link referencia afiliado aprovado e destino interno elegível; não aceita URL arbitrária nem redirecionamento aberto.
- [ ] Clique grava token/link, destino, horário e metadados mínimos; define tratamento de bot, preview, duplicidade e tráfego inválido.
- [ ] Cookie é first-party, seguro em produção, HttpOnly, SameSite apropriado, com duração e finalidade divulgadas.
- [ ] Validar expiração, substituição pelo último clique, atualização de prazo e preservação do primeiro clique conforme a regra aprovada.
- [ ] Definir comportamento para navegador sem cookies, recusa de consentimento, múltiplos dispositivos, troca de dispositivo e modo privado.
- [ ] Checkout consulta atribuição no servidor, sem confiar em `affiliate_id`, UTMs, assinatura ou comissão enviada pelo cliente.
- [ ] Conversão tem chave de idempotência/uniqueness e snapshot imutável de link, afiliado, campanha e regra aplicável.
- [ ] Reserva inválida, checkout repetido, cookie vencido e link suspenso não bloqueiam a compra normal.
- [ ] Testar concorrência, falha transacional, migração, rollback compatível e índices no banco usado em produção.
- [ ] Validar testes de feature e integração de ponta a ponta do clique à comissão pendente.

**Gate:** cenários de atribuição e checkout testados nos bancos suportados; cookies e política de dados aprovados.

### 2. Painel do afiliado

- [ ] Painel mostra estado da conta, próximos passos, regras relevantes e contato de suporte.
- [ ] Autorização garante isolamento: afiliado consulta somente perfil, links, campanhas, cliques agregados e conversões próprios.
- [ ] Home distingue cliques, reservas, conversões pendentes, aprovadas, canceladas e comissões disponíveis/pagas.
- [ ] Cada indicador documenta período, fuso, atualização, definição, exclusões e motivo de divergência com analytics.
- [ ] Listas têm filtros, ordenação, paginação, estados vazio/carregando/erro e exportação com escopo controlado.
- [ ] Interfaces permitem localizar links/campanhas, copiar links e identificar destino, canal e status.
- [ ] Informações financeiras não afirmam comissão definitiva antes da validação de reserva/cancelamento.
- [ ] Acessibilidade validada: teclado, foco, labels, contraste, leitor de tela e diálogos.
- [ ] Responsividade validada em celular e desktop; estados não dependem só de cor ou hover.
- [ ] Sessão expirada, afiliado suspenso e falta de autorização são apresentados sem expor dados internos.

**Gate:** afiliado consegue entender o estado da conta e interpretar métricas sem acessar dados de terceiros.

### 3. Barra contextual e geração de links

- [ ] Definir rotas elegíveis onde a barra aparece e como funciona em catálogo, busca, detalhe, login e navegação mobile.
- [ ] Barra só aparece para afiliado autenticado e aprovado; a elegibilidade é revalidada no servidor na criação.
- [ ] Link gerado usa a página/imóvel atual validado, sem aceitar URLs passadas pelo navegador.
- [ ] Imóvel indisponível, privado, removido ou fora da política não pode gerar link.
- [ ] Link permanece estável quando a mesma pessoa gera novamente para o mesmo imóvel, salvo se houver campanha/subidentificador diferente permitido.
- [ ] A barra não cobre checkout, modais, ações principais, leitores de tela nem conteúdo em telas pequenas.
- [ ] Copiar, sucesso, falha, carregamento, teclado, retorno do login e navegação de volta foram verificados.
- [ ] Limites por afiliado e proteção contra geração em massa estão configurados.

**Gate:** links criados pela barra passam pelas mesmas validações e destino de `/a/{token}`.

### 4. Campanhas, etiquetas e UTMs

- [ ] Definir campos obrigatórios/opcionais e vocabulário controlado para source, medium, campaign e content.
- [ ] Distinguir campanha de promoção comercial, campanha de mídia do afiliado e eventual campanha interna do negócio.
- [ ] Validar nomes, caracteres, tamanho, unicidade, datas, arquivamento e alteração de campanha.
- [ ] Associar cada short link a campanha/etiqueta sem transferir propriedade entre afiliados.
- [ ] Gerar UTMs no servidor e definir quais passam na URL pública, quais ficam apenas como metadados internos e como evitar PII.
- [ ] Preservar parâmetros permitidos pela navegação e checkout sem sobrescrever parâmetros de reserva ou aceitar campos sensíveis.
- [ ] Regras de edição/arquivamento não alteram retroativamente eventos e conversões já registrados.
- [ ] Testar UTMs repetidas, malformadas, excessivas, Unicode, encoding, valores vazios e colisões de nomes.
- [ ] Separar relatório de campanha de atribuição de comissão; uma UTM sozinha nunca prova o afiliado responsável.

**Gate:** métricas de campanha reproduzíveis e sem efeito nas regras financeiras de atribuição.

### 5. Relatórios e operação financeira

- [ ] Acordar definições para clique bruto, clique válido, reserva iniciada, conversão atribuída, conversão válida e comissão.
- [ ] Mostrar atribuição e snapshot usados na conversão para facilitar auditoria e suporte.
- [ ] Exibir status e motivo de pendência, rejeição, cancelamento, estorno ou ajuste quando permitido.
- [ ] Garantir que a soma do relatório bate com registros de origem para o mesmo período e filtros.
- [ ] Tratar fuso, limites de período, dados atrasados, reserva alterada e reconciliação com a fonte autoritativa.
- [ ] Proteger exportação contra dados pessoais desnecessários, exposição de outros afiliados e arquivos sem expiração.
- [ ] Definir conciliação financeira, aprovação manual, segregação de funções, comprovantes e trilha de mudanças.
- [ ] Alertar sobre eventos atrasados, divergência, repetição, picos de fraude e conversões sem reserva correspondente.
- [ ] Confirmar que o painel financeiro separa valores calculados, aprovados, retidos, agendados, pagos, estornados e contestados.

**Gate:** financeiro consegue reconciliar comissão e explicar cada mudança de estado.

### 5A. Cadastro financeiro, documentos e regularização

**Status:** requisitos estão listados, mas aguardam definição do modelo comercial e validação jurídica/contábil; nenhum fluxo de upload ou aprovação foi implementado.

**Objetivo:** coletar e revisar somente os dados necessários para contratar e pagar o afiliado, com etapas claras para pessoa física e pessoa jurídica.

**Experiência do afiliado:**

- [ ] Criar seção “Financeiro e documentos”, separada dos dados públicos do perfil e do painel de campanhas.
- [ ] Mostrar checklist de cadastro, itens recebidos, validade, estado da revisão e motivo acionável para correção.
- [ ] Permitir salvar rascunho e retomar depois; avisar quando o cadastro financeiro incompleto impede pagamento.
- [ ] Permitir corrigir ou substituir documentos e dados bancários com confirmação e histórico, sem apagar trilha anterior.
- [ ] Registrar aceite da versão vigente dos termos do programa e disponibilizar cópia ao afiliado.
- [ ] Explicar finalidade, acesso, retenção e canal de solicitação de direitos para cada categoria de dado/documento.

**Dados a avaliar com jurídico e contabilidade antes de tornar obrigatórios:**

- [ ] Tipo de beneficiário e relação contratual: pessoa física, pessoa jurídica, representante, procurador ou outro caso autorizado.
- [ ] Identificação e dados cadastrais estritamente necessários para contrato e obrigações fiscais.
- [ ] Para pessoa jurídica, confirmar quais dados da empresa, representantes e poderes de assinatura são exigidos para esse modelo.
- [ ] Para pessoa física, confirmar dados exigidos para identificação, recibo e retenções; não pedir documentos genéricos sem fundamento e finalidade registrados.
- [ ] Dados de pagamento: meio suportado, titularidade compatível com o beneficiário, validação, alteração, fraude e tratamento de conta conjunta/representante.
- [ ] Documentos fiscais ou recibos aplicáveis a cada caso e momento em que podem ser emitidos/solicitados.
- [ ] Regras de retenção e obrigações acessórias que cabem à fonte pagadora, conforme natureza do pagamento e caracterização jurídica aprovada.
- [ ] Tratamento de menores, não residentes, beneficiários no exterior, MEI/Simples e procuradores, se o programa admitir esses perfis.
- [ ] Evidência de endereço ou documento de identidade somente quando houver requisito operacional/legal comprovado.

**Estados de regularização sugeridos:** `não iniciado`, `rascunho`, `enviado`, `em análise`, `ação necessária`, `regular`, `bloqueado para pagamento` e `encerrado`. A aprovação para divulgar pode ser diferente da regularidade para receber: o produto e o jurídico devem decidir se afiliado pode operar antes de finalizar o cadastro financeiro, mas pagamento deve respeitar os gates fiscais/contratuais definidos.

**Revisão interna e pagamento:**

- [ ] Definir papéis distintos: afiliado, analista, financeiro e administrador; aplicar menor privilégio e dupla revisão onde apropriado.
- [ ] Validar correspondência entre identidade, beneficiário do contrato, documento fiscal/recibo e titular da conta de pagamento.
- [ ] Mostrar pendências sem revelar números completos de documentos ou conta a pessoas sem necessidade.
- [ ] Manter trilha de quem visualizou, aprovou, rejeitou, pediu correção ou alterou cadastro, com motivo e data.
- [ ] Calcular valor bruto, deduções, retenções, líquido, competência, vencimento e referência ao documento/comprovante usados no pagamento.
- [ ] Estados financeiros separados de conversão: `apurada`, `aguardando regularização`, `aprovada para pagamento`, `agendada`, `paga`, `falha`, `contestada` e `estornada/ajustada`.
- [ ] Não alterar percentuais nem recalcular períodos fechados silenciosamente; ajustes devem gerar lançamento compensatório auditável.
- [ ] Fazer reconciliação entre comissões aprovadas, retenções, pagamento bancário e comprovante/recibo.

**Proteção de documentos:**

- [ ] Fazer inventário por tipo documental, finalidade, base legal validada, responsável, acesso e prazo de retenção.
- [ ] Preferir reduzir coleta. Se um dado puder ser validado sem guardar cópia, não armazenar a cópia por padrão.
- [ ] Armazenar arquivos em bucket privado, com criptografia, URLs temporárias, acesso autorizado no backend e proteção contra enumeração.
- [ ] Separar documentos de armazenamento público do site; nunca servir documento de identidade por URL pública ou frontend sem autorização.
- [ ] Limitar formato/tamanho, validar MIME e assinatura do arquivo, renomear com identificador aleatório e verificar malware.
- [ ] Restringir visualização/download por papel, registrar acesso, impedir anexos em logs e não colocar PII em nome de arquivo ou URL.
- [ ] Definir retenção e descarte seguro após obrigação legal/contratual, incluindo backups, cópias e fornecedor de armazenamento.
- [ ] Avaliar contrato e suboperadores do serviço de armazenamento/verificação; estabelecer resposta a incidente e atendimento ao titular.
- [ ] Documentar processo para acesso, correção e eliminação quando permitido, considerando documentos que precisem ser retidos por obrigação legal.

**Critérios de aceite:**

1. O afiliado vê exatamente o que falta, por que é solicitado, quem analisa e se pode continuar divulgando ou receber.
2. Requisitos são condicionais ao perfil aprovado por jurídico/contabilidade, em vez de exigir o mesmo pacote documental de todos.
3. Afiliado só vê os próprios dados/documentos; equipe interna acessa conforme papel, com auditoria.
4. Documentos nunca são públicos, nunca aparecem em logs e expiram/descartam de acordo com retenção aprovada.
5. Cada pagamento tem reconciliação entre valor bruto, retenções, valor líquido, beneficiário, estado e comprovante.

**Gate:** parecer jurídico e contábil vigente sobre natureza da relação, contrato, documentos, retenções, obrigações fiscais e retenção de dados; controles de acesso e armazenamento aprovados; fluxo financeiro testado em homologação.

### 6. API de afiliado

**Status:** não implementada.

- [ ] Confirmar consumidores, casos de uso, SLA, volume, suporte e se uma API pública é necessária agora.
- [ ] Definir contrato versionado, autenticação, escopos, paginação, filtros, limites, erros, idempotência e `request_id`.
- [ ] Começar com leitura agregada e recursos próprios; justificar cada operação de escrita separadamente.
- [ ] Se usar Sanctum, verificar versão/configuração instalada, hashing, expiração, revogação e compatibilidade com autenticação atual.
- [ ] Token é exibido uma vez; lista mostra apenas nome, escopos, criação, expiração e último uso; segredo nunca aparece de novo.
- [ ] Impedir leitura/criação/alteração entre afiliados mesmo ao trocar IDs em URL, body, filtros ou paginação.
- [ ] Testar escopo insuficiente, token revogado/expirado, conta suspensa, acesso cruzado e mass assignment.
- [ ] Aplicar rate limit por credencial/afiliado/IP, cota de criação, payload máximo, limites de consulta e resposta `429`.
- [ ] Evitar SSRF e open redirect validando destinos do lado servidor e permitindo somente rotas/domínios definidos.
- [ ] Auditar emissão, uso sensível, falhas de autorização, rotação e revogação sem gravar credenciais em logs.
- [ ] Publicar OpenAPI, exemplos seguros, política de versionamento, changelog e processo de suporte.
- [ ] Definir testes de contrato e mecanismo de revogação emergencial em caso de vazamento.

**Gate:** revisão de segurança aprovada; isolamento por afiliado, escopos e limites comprovados em testes automatizados.

### 7. Lançamento, observabilidade e manutenção

**Status:** pendente; CI verde do PR não equivale a homologação ou aprovação de produção.

- [ ] Feature flag e lançamento gradual definidos, com grupo piloto e critério de expansão/reversão.
- [ ] Métricas técnicas cobrem falha de redirect, criação de link, gravação de clique, atribuição, checkout e API.
- [ ] Logs e painéis não expõem token Bearer, cookie bruto, dados pessoais ou parâmetros sensíveis.
- [ ] Alarmes têm responsável, limiar, canal monitorado e procedimento de resposta.
- [ ] Backup, migration forward/rollback seguro e recuperação foram revisados antes de atualizar banco produtivo.
- [ ] Domínio, TLS, política de cookie, proxy/cache e cabeçalhos de redirect foram conferidos no ambiente final.
- [ ] Smoke test confirma criar link, clicar, navegar, finalizar fluxo de teste e encontrar conversão no painel.
- [ ] Suporte recebeu roteiro para explicar atraso, perda de cookie, cancelamento e discrepância de métricas.
- [ ] Termos, privacidade, retenção e tela de divulgação do afiliado foram publicados antes de abrir a funcionalidade.
- [ ] Decisão de lançamento registra versão, pessoa aprovadora, métricas iniciais, rollback e data da revisão pós-lançamento.

**Gate:** lançamento autorizado após revisão conjunta de produto, engenharia, segurança, operação e financeiro.

### Revisão jurídica dos termos do programa

Antes de abrir o cadastro, o jurídico deve revisar termos versionados e o fluxo de aceite. O checklist abaixo é pauta de revisão, não minuta jurídica:

- [ ] Identificar as partes e o papel de cada uma; esclarecer quem contrata e se beneficia da divulgação.
- [ ] Descrever o serviço esperado, autonomia do afiliado, canais permitidos e limites de representação, conforme avaliação jurídica.
- [ ] Definir elegibilidade, aprovação, suspensão, encerramento, comunicação, recurso e impacto sobre links e valores já apurados.
- [ ] Descrever cálculo de comissão com exemplos, base, imóveis elegíveis, atribuição, janela, último clique, exceções e arredondamento.
- [ ] Definir quando a comissão fica pendente, aprovada, exigível e pagável; prazo, saldo mínimo, cancelamento, reembolso, fraude e contestação.
- [ ] Especificar fluxo de pagamento PF/PJ, documentos e retenções conforme enquadramento aprovado, sem transferir obrigações legais da fonte pagadora por simples cláusula.
- [ ] Definir publicidade identificável, alegações permitidas, uso de marca, imagens, preços, disponibilidade, canais e conteúdo proibido.
- [ ] Tratar direitos de conteúdo, licenças e retirada após encerramento.
- [ ] Explicar dados pessoais, cookies, analytics, finalidade, base legal, compartilhamento, retenção, segurança e canal de direitos do titular.
- [ ] Revisar responsabilidade, confidencialidade, propriedade intelectual, lei/foro e resolução de disputas.
- [ ] Guardar versão aceita, data/hora, usuário e origem; apresentar novamente alterações materiais e registrar novo aceite quando exigido.
- [ ] Publicar resumo simples e acesso ao texto integral, em linguagem compatível com o funcionamento real do sistema.

### Registro por etapa

Para cada etapa, preencher antes de encerrar a revisão:

| Etapa | Responsável | Evidências/referências | Bloqueios e riscos | Decisão | Data |
| --- | --- | --- | --- | --- | --- |
| 0. Produto e políticas |  |  |  | Pendente |  |
| 1. Links e atribuição |  |  |  | Pendente |  |
| 2. Painel do afiliado |  |  |  | Pendente |  |
| 3. Barra e links |  |  |  | Pendente |  |
| 4. Campanhas e UTMs |  |  |  | Pendente |  |
| 5A. Cadastro e regularização |  |  |  | Pendente |  |
| 5B. Relatórios e pagamentos |  |  |  | Pendente |  |
| 6. API |  |  |  | Pendente |  |
| 7. Lançamento |  |  |  | Pendente |  |

Decisões possíveis: `Pendente`, `Em análise`, `Bloqueada`, `Aprovada`, `N/A`. `Aprovada` deve incluir links para evidência e quem aprovou.

## Referências de pesquisa

- Mercado Livre documenta janela de 24 horas e regra do último clique válido, além de etiquetas para separar canais. O mecanismo interno exato de persistência dos parâmetros/cookies não é público: [cálculo de ganhos](https://www.mercadolivre.com.br/l/como-seus-ganhos-sao-calculados), [geração de links](https://www.mercadolivre.com.br/l/afiliados-gere-seus-links) e [perguntas frequentes](https://www.mercadolivre.com.br/l/primeiros-passos-perguntas-frequentes-para-afiliados).
- A Awin documenta geração de deep links em lote via API e regras de destino elegível: [Generate Tracking Link](https://help.awin.com/apidocs/generatelink), [Create Tracking Links](https://help.awin.com/apidocs/create-tracking-links).
- A impact.com separa parâmetros `Sub ID` privados do afiliado e `Shared ID` visíveis para a marca, um padrão útil para separar metadados de relatório de identificadores de atribuição: [Sub ID e Shared ID](https://help.impact.com/partner/what-would-you-like-to-learn-about/platform-features/tracking/tracking-links/link-parameters/sub-id-and-shared-id-parameters-explained-for-partners).
- Laravel Sanctum suporta tokens pessoais com abilities, hash de token e expiração configurável. Isso parece adequado para uma primeira API do próprio afiliado; OAuth pode esperar até haver delegação para aplicações de terceiros: [Laravel Sanctum](https://laravel.com/framework/docs/13.x/sanctum).
- O checklist OWASP destaca riscos diretamente aplicáveis: autorização por objeto, autenticação, excesso de consumo, abuso de fluxos sensíveis e autorização por função: [OWASP API Security Top 10](https://devguide.owasp.org/en/07-training-education/07-api-top-ten/).
- A LGPD exige medidas técnicas e administrativas para proteger dados pessoais; a ANPD explica direitos do titular e papéis de controlador/operador: [Lei 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), [direitos do titular](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares), [agentes de tratamento](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados).
- A Receita Federal trata comissões e pagamentos por serviços sem vínculo e informa que rendimentos de trabalho não assalariado pagos por pessoa jurídica podem estar sujeitos a retenção; a escrituração pode envolver eSocial ou EFD-Reinf conforme a natureza da relação: [rendimentos do trabalho](https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/preenchimento/manual-mir/rendimentos/rendimentos-do-trabalho), [IRRF](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/IRRF), [EFD-Reinf](https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/perguntas-frequentes/sped/efd-reinf/efdr/1-geral/1-17-as-informacoes-sobre).
- A Receita Federal e o INSS descrevem deveres para remuneração de contribuinte individual; o enquadramento depende dos fatos e do modelo contratual: [contribuições previdenciárias de pessoa física](https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/tributos/contribuicoes-previdenciarias-pf), [INSS sobre prestadores](https://www.gov.br/inss/pt-br/noticias/saiba-como-comprovar-as-remuneracoes-de-prestadores-de-servicos).
- O CONAR atualizou em 2026 o guia de publicidade por influenciadores, incluindo identificação publicitária e governança, pontos relevantes para as regras de divulgação dos afiliados: [Guia de Marketing e Publicidade por Influenciadores](https://www.conar.org.br/noticias/guia-de-marketing-e-publicidade-por-influenciadores-digitais).
- Termos públicos de programas brasileiros mostram práticas como fluxo distinto para PF/PJ, recibos/documentos e retenções, mas não são automaticamente adequados ao nosso modelo: [termos do programa de afiliados Shopee](https://help.shopee.com.br/portal/10/article/124094-Programa-de-Afiliados-da-Shopee-Termos-e-Condi%C3%A7%C3%B5es).
