# Goal: construir o Portal de Controle do Site

## 1. Objetivo

Construir, em etapas pequenas e revisáveis, um portal interno para administrar o conteúdo e acompanhar o canal digital da Central de Reservas. O foco inicial e prioritário é o **front-end**, executado localmente, com uma experiência navegável, responsiva, acessível e coerente com a identidade e os padrões existentes no repositório.

O primeiro resultado deve validar navegação, hierarquia, componentes e jornadas com dados claramente fictícios. Não deve depender de serviços reais para parecer funcional. O Goal só estará completo quando o escopo front-end acordado estiver implementado, validado contra os critérios deste documento e documentado com suas limitações e próximos passos.

## 2. Instrução para o chat executor

Atue como líder técnico e de produto de uma implementação front-end local. Use subagentes LUNA para dividir trabalho independente, com um agente responsável por cada domínio e um agente líder responsável por integração, consistência, revisão e validação final. Faça primeiro descoberta e plano; depois implemente por fatias verticais revisáveis. Não aceite alterações concorrentes no mesmo arquivo sem combinar propriedade e integração.

Comece lendo `AGENTS.md`, `README.md`, `.agents/skills/implementar/SKILL.md`, `docs/frontend-quality-plan.md` e `docs/proposta-portal-controle-site.md`. A seção 18 da proposta é o checklist mestre e a fonte canônica do escopo detalhado, incluindo identidade visual, design system, telas, estados, acessibilidade, responsividade e a jornada “Adicionar afiliado”. Inspecione `git status`, branch, rotas e composição atuais do frontend antes de editar. Preserve alterações preexistentes. Não implemente backend ou produção como parte deste Goal.

## 3. Resultado inicial esperado

Entregar uma seção interna do portal, local e navegável, com:

1. **Shell do portal:** navegação, cabeçalho, contexto da página, estado ativo, navegação móvel e identidade visual interna.
2. **Início / visão geral:** alertas, pendências, atividade recente e cartões de demonstração identificados como dados fictícios.
3. **Conteúdo do site:** lista demonstrativa de páginas e um editor visual estruturado por campos/blocos aprovados, com rascunho local, prévia e estado editorial demonstrativo.
4. **Imóveis:** catálogo demonstrativo com busca/filtros e indicação de origem e status editorial, somente leitura nesta fase.
5. **Reservas:** lista demonstrativa pesquisável, cartões utilizáveis em mobile, detalhe resumido e origem/atualização explícitas; somente leitura.
6. **Afiliados e integrações:** telas de demonstração leves para validar navegação e estados. Não simular aprovações reais, comissões definitivas ou conexões reais.
7. **Estados de interface:** carregamento, vazio, erro recuperável, conteúdo parcial, sucesso, indisponibilidade e dados antigos, conforme aplicável.

Priorize primeiro shell, visão geral e fluxo editorial. Imóveis, reservas, afiliados e integrações entram depois, como superfícies de protótipo. Inclua a experiência demonstrativa de adicionar afiliado manualmente, com formulário, validações, revisão e estado final inerte. Se o prazo ou o tamanho do diff exigir redução, conclua uma fatia vertical de alta qualidade em vez de deixar muitas telas incompletas. Use a seção 18 da proposta para decompor e acompanhar os itens; não duplique uma lista divergente neste Goal.

## 4. Fora do escopo

- Backend Laravel/Express, rotas, banco de dados, migrations, políticas RLS e autenticação real.
- Chamadas à Stays, Supabase, gateways, analytics ou quaisquer integrações operacionais.
- Criar, editar, confirmar, cancelar ou cobrar reservas; alterar preços, disponibilidade ou dados de hóspedes.
- Publicação real de conteúdo, upload persistente de mídia ou envio de notificações.
- Aprovação real de afiliados, acesso de afiliados, atribuição financeira, comissão ou pagamento.
- Exibição de credenciais, segredos ou dados reais de produção.
- Deploy, publicação, commit, push ou merge.
- Redesenho do painel operacional ou substituição das áreas existentes de proprietário/admin.

Não conectar a UI a APIs existentes apenas porque estão disponíveis. Qualquer necessidade futura de backend deve ser registrada como dependência e submetida a um Goal separado.

## 5. Contexto e restrições do repositório

- Frontend existente: React 19, TypeScript, Vite 6 e Tailwind CSS 4. Reutilize bibliotecas instaladas; não adicione dependências sem autorização explícita.
- O backend Laravel coexiste com serviços legados. Preserve contratos `/api/*`, `server.ts`, checkout e fluxos de reserva.
- Já existe uma área de proprietário/admin em `src/components/owner/OwnerAccessAdminView.tsx` e rotas `/api/owner/admin/*`. Inventarie-a para evitar duplicação ou mudança acidental; não a incorpore como painel operacional sem uma decisão de produto.
- Consulte `docs/frontend-quality-plan.md` para padrões e prioridades de acessibilidade e qualidade.
- Use `npm` e `package-lock.json`; não crie outro lockfile.
- Organize componentes por domínio coeso. Prefira imports diretos e não crie barrels sem necessidade concreta.
- A proposta base é `docs/proposta-portal-controle-site.md`. Em caso de conflito entre hipótese da proposta e o escopo deste Goal, prevalecem este Goal e as decisões explícitas do usuário.

## 6. Princípios de implementação

### Segurança e privacidade

- Dados demonstrativos devem ser sintéticos, fáceis de reconhecer e marcados na interface como demonstração. Não copiar nem mascarar dados reais de produção para compor fixtures.
- Não armazenar segredos no frontend, em fixtures, screenshots, logs ou variáveis `VITE_*`.
- Não sugerir que esconder menu ou botão seja autorização. Como a fase é front-end, permissões serão apenas estados demonstrativos, com aviso de que não protegem dados nem operações.
- Usar dados mínimos nas demonstrações de reservas. Não incluir CPF, e-mail, telefone, documento, pagamento ou endereço.
- Compartilhamento, exportação, publicação, aprovação e alteração operacional são ações inertes ou indisponíveis neste protótipo.
- Não executar requisições externas, operações de escrita ou comandos contra ambientes de teste/produção.

### Arquitetura, componentização e atomização

- Começar com uma fronteira de domínio explícita, preferencialmente sob `src/components/site-control/` (ou o padrão de roteamento equivalente já existente após inspeção).
- Separar shell/layout, páginas por domínio, componentes de interface reutilizáveis, tipos e dados fictícios. Evitar um único componente monolítico ou abstrações prematuras.
- Componentizar quando houver reuso real, semântica própria, lógica independente ou necessidade de teste isolado. Exemplos: `PortalSidebar`, `MobilePortalNavigation`, `PageHeader`, `MetricCard`, `StatusBadge`, `FilterBar`, `EmptyState`, `ReservationCard` e `ContentPreview`.
- Manter componentes pequenos e com responsabilidade única; evitar fragmentação artificial em componentes de uma linha sem semântica própria.
- Tipar props, eventos, estados, filtros e modelos demonstrativos. Evitar `any`, coerções não validadas e duplicação de tipos.
- Isolar regras de apresentação dos dados e estado. Usar hooks apenas quando houver lógica de estado/comportamento reutilizável ou complexa.
- Manter conteúdo em português brasileiro e usar formatação local consistente para datas e valores demonstrativos.

### Tokens de design (design tokens)

- Inspecionar os tokens, variáveis CSS, Tailwind e componentes já existentes antes de introduzir novos.
- Reutilizar tokens existentes. Se o portal precisar de uma linguagem visual própria, centralizar cores, tipografia, espaçamento, raio, sombras e camadas em tokens nomeados, evitando valores mágicos repetidos.
- Tokens devem expressar intenção (por exemplo, superfície, texto secundário, estado de atenção), não nomes de tela ou valores isolados.
- Garantir contraste, estados que não dependem somente de cor e suporte a `prefers-reduced-motion`.
- Não criar um sistema visual genérico extenso antes de validar as telas prioritárias.

### Acessibilidade e mobile

- Associar labels a campos; fornecer nomes acessíveis a botões de ícone; preservar foco visível e ordem lógica de teclado.
- Navegação e diálogos devem ter semântica correta, nome acessível, Escape e gerenciamento de foco quando aplicável, inclusive retorno ao controle que abriu o diálogo.
- Mobile é requisito de primeira classe: sem tabela ilegível, rolagem horizontal não essencial, hover obrigatório, arrastar-e-soltar como único meio ou ação sensível por swipe.
- Validar layouts estreitos, zoom, teclado virtual, áreas seguras e estados sem depender de animação.
- Reutilizar componentes compartilhados somente quando servirem domínios distintos; componentes próprios do portal devem permanecer dentro do domínio.

## 7. Plano de execução em etapas

### Etapa 0: descoberta e plano

1. Confirmar branch e worktree, sem descartar alterações preexistentes.
2. Ler os documentos indicados e inspecionar `src/App.tsx`, `src/components/MainContentRouter.tsx`, padrões de páginas, tokens CSS, testes e configuração de lint.
3. Mapear a entrada local mais segura para expor o protótipo sem alterar jornadas públicas ou administrativas existentes.
4. Propor arquivos, fronteiras de domínio, componentes e critério de validação.
5. Resolver escolhas de baixo risco por convenção; pedir esclarecimento somente se uma decisão de produto bloquear a estrutura.

**Gate:** plano de arquivos e fluxo revisados antes de mudanças estruturais amplas.

### Etapa 1: fundação visual e navegação

- Criar o shell isolado do portal, com navegação desktop/mobile, cabeçalho, título e conteúdo.
- Criar rota/entrada local conforme arquitetura existente, sem quebrar a aplicação pública.
- Adicionar aviso visível de protótipo e dados fictícios.
- Implementar estados básicos, navegação por teclado e layout responsivo.

**Gate:** shell integrado, utilizável com teclado e sem regressão visível nas jornadas existentes.

### Etapa 2: visão geral

- Criar resumo com indicadores demonstrativos, alertas, tarefas pendentes e atividade recente.
- Em cada indicador, identificar período e fonte simulada; não apresentar como dado conectado.
- Prever carregamento, vazio, erro e dado desatualizado onde fizer sentido.

**Gate:** os cartões e alertas respondem a perguntas úteis sem insinuar que os dados são reais.

### Etapa 3: conteúdo editorial

- Criar lista demonstrativa de páginas e estados editoriais.
- Criar editor estruturado limitado aos tipos de bloco existentes ou propostos, sem HTML/JS/CSS arbitrário.
- Permitir editar rascunho somente em estado local; prévia e confirmação são demonstrativas.
- Sinalizar alterações não salvas e evitar perda acidental ao navegar.

**Gate:** jornada completa de abrir, editar, pré-visualizar, cancelar ou submeter demonstração, sem publicação real.

### Etapa 4: catálogo e reservas de demonstração

- Criar catálogo demonstrativo de imóveis e lista de reservas com busca e filtros locais.
- Identificar origem e atualização como simuladas.
- Em reservas, limitar campos, usar detalhe resumido e cartões em viewport estreito.
- Não implementar a hipótese de lista compartilhável/“whitelist” nesta fase, salvo se já aprovada como protótipo visual independente e claramente inerte.

**Gate:** busca, filtros, vazio, retorno da lista e responsividade funcionam sem dados reais.

### Etapa 5: afiliados e integrações demonstrativos

- Mostrar estrutura de solicitações de afiliados e estados simulados, sem aprovações efetivas ou comissão.
- Mostrar estado de integrações como fixtures identificadas, sem chamar fornecedores.
- Adiar detalhes que não validem uma jornada real do primeiro MVP.

**Gate:** interface deixa claro que não existem ações nem conexões reais.

### Etapa 6: integração, revisão e encerramento

- Revisar diff e consistência visual, nomenclatura, textos e acessibilidade.
- Executar as verificações proporcionais descritas na seção 10.
- Resolver erros introduzidos pelo diff; registrar falhas preexistentes separadamente.
- Resumir resultado, arquivos, verificações, limitações e decisões necessárias para um Goal posterior.

**Gate final:** critérios da seção 9 satisfeitos para as etapas implementadas e nenhum fluxo existente alterado sem intenção.

## 8. Plano de subagentes LUNA

O agente líder mantém o Goal, define contratos entre tarefas, integra e revisa todo o diff. Use os agentes abaixo apenas depois da Etapa 0, quando os limites de arquivos estiverem definidos:

| Responsabilidade | Escopo recomendado | Limites |
|---|---|---|
| LUNA 1: fundação e navegação | Shell, navegação desktop/mobile, entrada/rota e tokens específicos aprovados | Não editar `App.tsx`/roteador sem propriedade explicitamente atribuída pelo líder; não alterar jornadas existentes. |
| LUNA 2: visão geral | Página de início, cartões, alertas e fixtures locais | Trabalhar dentro do domínio da visão geral; não criar sistema visual paralelo. |
| LUNA 3: conteúdo editorial | Lista de páginas, editor estruturado, prévia local e componentes do domínio de conteúdo | Não publicar, persistir ou aceitar código arbitrário. |
| LUNA 4: revisão de UX/acessibilidade | Revisão estática dos componentes e critérios de teclado, semântica, mobile e estados | Preferir relatório de achados; só editar arquivos se o líder designar escopo sem conflito. |

Regras de coordenação:

- Cada agente recebe tarefa concreta, arquivos permitidos, arquivos proibidos, resultado esperado e comando de validação.
- Não delegar a dois agentes o mesmo arquivo ou o mesmo ponto de integração.
- Agentes não fazem commit, push, deploy, chamadas externas ou operações em serviços.
- O líder revisa integralmente o trabalho recebido; conclusão de agente não equivale a aceite.
- Se houver menos agentes disponíveis, serializar as responsabilidades sem mudar os gates.
- Não gastar paralelismo construindo superfícies de baixo valor antes de validar shell e jornada editorial.

## 9. Critérios de aceite

### Produto e escopo

- O portal é acessível por entrada local clara e não substitui nem confunde o painel operacional existente.
- A navegação reflete as áreas acordadas e o recorte de MVP é evidente.
- A interface informa que é um protótipo e diferencia todos os dados fictícios de dados conectados.
- Nenhuma ação do protótipo modifica reserva, preço, disponibilidade, conteúdo público, afiliado ou integração.

### Código

- Componentes agrupados por domínio e responsabilidades compreensíveis.
- Tipos explícitos em props, estados e modelos; nenhum `any` novo sem justificativa aprovada.
- Nenhuma dependência ou lockfile novo.
- Nenhuma chamada de rede nova para serviços operacionais.
- Nenhum segredo ou dado real incluído.
- Código segue padrões locais e não aumenta indevidamente acoplamento no `App.tsx`.

### UX, acessibilidade e responsividade

- Navegação por teclado, foco visível e nomes acessíveis em controles relevantes.
- Labels e mensagens de erro associados aos campos.
- Estados vazio, carregando, erro e sucesso previstos nas jornadas interativas implementadas.
- Conteúdo essencial e ações disponíveis em viewport estreito sem rolagem horizontal crítica.
- Movimento respeita `prefers-reduced-motion`; cor não é o único indicador de estado.
- Conteúdo demonstrativo e limites de autoridade são compreensíveis sem conhecimento técnico.

### Processo

- O diff é revisado e delimitado ao portal.
- Verificações relevantes foram executadas e seu resultado registrado.
- Nenhum commit, push, merge ou deploy foi realizado.

## 10. Verificações

Não executar a suíte inteira por padrão se uma checagem direcionada for suficiente. Não criar scripts de verificação ad hoc. Selecionar comandos de acordo com os arquivos e padrões locais, por exemplo:

- `npm run lint` para TypeScript/ESLint conforme aplicável;
- `npm run build` quando a integração com Vite/manifest ou a compilação do frontend for afetada;
- `npm test` com teste direcionado quando houver comportamento novo que justifique teste;
- `npm run format:check` somente se os arquivos alterados estiverem incluídos ou houver formatação relevante;
- `git diff --check` e inspeção do diff final;
- verificação manual local em desktop e viewport móvel para shell e jornadas centrais.

Não adicionar testes apenas por formalidade. Para comportamento interativo significativo, seguir as convenções existentes e cobrir a regressão com o menor teste relevante.

## 11. Riscos e decisões posteriores

Não bloquear o protótipo por decisões que podem permanecer como estados demonstrativos. Registrar para um Goal separado:

- autenticação e autorização reais por recurso, ação e campo;
- fonte de dados e contratos de leitura de reservas, imóveis e métricas;
- editor/CMS, persistência, versionamento, publicação e rollback;
- definição e disponibilidade de indicadores de negócio;
- identidade e regras comerciais de afiliados;
- integração com a administração existente de proprietários;
- finalidade, destinatário, campos, prazo e revogação da lista de entrega;
- auditoria, retenção, privacidade e consentimento aplicáveis;
- backend, observabilidade e estratégia de deploy.

## 12. Instrução final de execução

Execute este Goal localmente, começando pela descoberta e propondo um plano curto com fronteiras de arquivos. Construa primeiro o shell e a jornada editorial em front-end com fixtures sintéticas. Use subagentes LUNA para trabalho paralelo independente e faça integração centralizada. Pare em cada gate para revisão técnica do próprio líder, não para pedir confirmação desnecessária ao usuário. Se uma decisão bloquear segurança, escopo ou compatibilidade, explique a dependência e continue as partes independentes. Ao concluir, apresente o que funciona, como acessar localmente, arquivos principais, verificações executadas, limitações e o próximo Goal sugerido para backend/autorização/dados reais.
