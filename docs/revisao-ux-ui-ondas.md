# Revisão de UX/UI e plano de correção por ondas

Estado: revisão e plano concluídos dentro do acesso disponível, com limitações registradas abaixo. Referência examinada: `main` no commit `7e5d1f2`. Este documento é um plano de revisão e correção; nenhuma alteração de produto está autorizada por ele.

## Leitura rápida

| Tema | O que a revisão encontrou | Onde conferir |
| --- | --- | --- |
| Teclado e camadas | Dias do calendário da busca não entram no Tab; os painéis da barra não recebem foco na abertura direta; a recuperação e as preferências têm conflito de foco. | F01, F21, F47, F55 |
| Busca e layout | A seleção de datas não avança para hóspedes no desktop; painéis permanecem abertos ao rolar; há colisões e cortes em dimensões específicas. | F02, F03, F06, F17 |
| Dados da viagem | Uma rota de condomínio perde datas e hóspedes; há inconsistências na contagem e em filtros com preço desconhecido. | F05, F28, F29, F49, F50 |
| Checkout | Retorno por link direto reabre a tela; o carregamento depende do catálogo; respostas de erro e acompanhamento Pix precisam de comunicação mais clara. | F23, F24, F27, F37, F39 |
| Visual e informação | Indicador de cartão encobre texto em 320 px; descrição e camas podem vir incompletas ou confusas; taxa local precisa de confirmação. | F22, F45, F46 |
| Preferências e métricas | Painel longo ocupa grande área em telas pequenas; há conflito de foco e a rota de privacidade respondeu 404. Instrumentação e consentimento têm caminhos diferentes e exigem reconciliação. | F31–F34, F42–F44, F47, F51 |
| Confiabilidade | Houve tela vazia com asset 404 e uma resposta 504 em amostras pontuais; causa e frequência são desconhecidas. | F41 |

O destaque da parcela é intencional e não integra os achados. As prioridades P1 e evidências correspondentes estão na triagem antes das ondas. Há achados comprovados em produção, outros reproduzidos com simulação e outros que permanecem hipótese de código; consultar o estado de cada item. Não houve implementação de correções.

### Como usar os achados

| Tipo de evidência | Exemplos | Decisão antes de corrigir |
| --- | --- | --- |
| Observado na interface de produção | F01, F03, F17, F37, F46, F47 e F49 | Reproduzir o estado descrito na versão que será alterada e transformar a sequência em critério de regressão. |
| Reproduzido com respostas ou dados simulados | F14, F24, F27, F38 e F39 | Preservar a simulação e conferir o contrato real da integração antes de generalizar. |
| Comportamento ou risco identificado no código | F52, F53 e F54 | Reproduzir com dados fictícios e confirmar condições de entrada antes de estimar frequência ou impacto. |
| Dependência ou causa ainda não comprovada | Origem da falha F41, dados de camas em F45 e publicação da política em F51 | Investigar a fonte autoritativa; não assumir causa, corrigir às cegas ou criar informação ausente. |

Esses grupos são exemplos, não uma classificação exaustiva. Uma mesma questão pode ter mais de uma evidência. A prioridade expressa impacto potencial na tarefa; não representa frequência medida. Cada achado detalha contexto, limites, ação sugerida e teste futuro.

## Escopo e método

- Jornadas prioritárias: busca, resultados, imóvel, dados do hóspede, checkout e recuperação, com atenção a teclado, rolagem, tamanho de janela, estado de dados e hierarquia visual.
- Método: workflow `review-interface` da skill local `ux-ui-intelligence`, leitura de código e testes existentes, e inspeções manuais anteriores no site público e no simulador local. Dados de simulação são fictícios; a prévia de checkout não executa pagamento.
- Versão da skill verificada em 26/11/2026: a `main` remota apontava para `e36ac9a183daafeecc3dc7b1aa47e166fa1c32e2`; os hashes de `SKILL.md` e `references/workflows/review-interface.md` instalados localmente coincidiam com esse commit. Essa comparação cobre os dois arquivos usados na revisão, não todos os arquivos da skill. O repositório separado da skill continha alterações locais preexistentes, que foram preservadas.
- Graphify: extração AST local de 1.774 arquivos de código, sem extração semântica por modelo e sem agrupamento, em `/tmp/hospeda-ux-graph/graphify-out/graph.json`. O grafo bruto contém 20.319 nós e 41.005 relações; 16.306 nós têm origem em `.agents`, incluindo bibliotecas auxiliares, e não representam módulos do produto. As consultas precisam ser delimitadas por caminho e confirmadas no código. Cinco arquivos Astro tiveram extração parcial e três SQL não foram extraídos por falta do parser; documentos e imagens não foram indexados. O grafo anterior em `graphify-out` não foi substituído.
- Contagem por origem dos nós do grafo: `src` 1.089 nós em 170 arquivos; `app` 887 em 132; `tests` 1.289 em 204; `database` 121 em 40; `blog` 54 em 16; `.agents` 16.306 em 1.107. São arquivos com nós identificados, não uma auditoria linha a linha nem prova de que todos os arquivos de cada diretório foram extraídos integralmente. Há 198 nós sem caminho de origem informado.
- Conferência dos caminhos em `src` na mesma revisão: `rg --files src` listou 171 arquivos e o grafo tinha nós para 170 deles; o arquivo sem nós era `src/index.css`. Ele foi lido diretamente para investigar tokens e F46. Essa contagem não verifica completude dos símbolos ou relações dos outros arquivos, nem cobre arquivos ignorados pela configuração do `rg`.
- A mesma comparação encontrou nós para 132 de 132 arquivos listados em `app`, 16 de 16 em `resources/views` e 3 de 3 em `routes`. Ter ao menos um nó por arquivo não significa extração completa nem revisão integral do backend ou das páginas renderizadas; os caminhos relevantes às jornadas foram conferidos diretamente.
- O grafo em `/tmp` é temporário e não deve ser tratado como artefato persistente. Foi confirmado que existe nesta sessão; antes de usá-lo futuramente, verificar existência e versão do código, e refazer a extração se necessário. Em 26/11/2026, o executável indicou pacote Graphify 0.9.53 e skill Codex 0.9.43; essa diferença fica registrada para a próxima atualização, sem alterar instalações globais durante a revisão.
- Prioridade P1: impede uma tarefa principal para um grupo de usuários. P2: afeta uma decisão, continuidade ou recuperação. P3: inconsistência localizada ou melhoria estrutural. Prioridades são julgamento técnico, não medição de frequência ou impacto comercial.
- Evidência de código indica comportamento ou risco; somente observações de navegador indicadas como tal foram reproduzidas visualmente. Não foi feita avaliação completa com leitor de tela, usuários ou dispositivo físico.
- Escopo autorizado: leitura do código, testes e simulações locais, navegação pública em produção e interceptação temporária de respostas no navegador. Não foram autorizadas alterações do produto, pagamentos reais ou operações sobre reservas. A lista de viewports da onda 5 é uma proposta de validação; a gama oficialmente suportada pelo produto não foi informada.
- Pelo workflow `review-interface`, estados indisponíveis devem ser tratados como **NÃO TESTADOS**, não como aprovados: jornadas autenticadas de conta e proprietário não foram percorridas com dados reais; pagamento real, leitor de tela, dispositivos físicos e pesquisa com usuários não foram exercitados. As razões e demais limites estão na matriz ao final. Os achados de fonte sem reprodução permanecem hipóteses de comportamento até validação indicada em cada item.

## Mapa de responsabilidades e pontos de mudança

| Jornada | Entradas e composição | Estado e integração | Pontos compartilhados |
| --- | --- | --- | --- |
| Busca e filtros | `App.tsx`, `Header.tsx`, `StaysSearchWidget.tsx`, `SearchModal.tsx`, `FilterModal.tsx` | `useAccommodationSearch.ts`, `useSearchUrlSync.ts`, `searchUrlState.ts`, `crcnBackendApi.ts` | `CalendarMonthGrid.tsx`, `GuestCounterList.tsx`, `useDialogFocus.ts` |
| Resultados e favoritos | `MainContentRouter.tsx`, `PropertyCatalogGrid.tsx`, `PropertyCard.tsx`, `WishlistsView.tsx` | `useAccommodationCatalog.ts`, `useExploreCatalogViewModel.ts`, `useSavedPropertyIds.ts` | cotação, imagens, categorias e formatação de preço |
| Imóvel | `src/components/property/PropertyDetailModal.tsx`, componentes `Property*` | `src/components/property/usePropertyAvailability.ts`, `src/components/property/usePropertyQuote.ts`, `useAccommodationRouting.ts` | calendário, foco, camadas e estado de viagem |
| Checkout | `CheckoutEntry.tsx`, `SinglePageCheckout.tsx`, `CieloSopCardForm.tsx`, `CheckoutResumePage.tsx` | `checkoutApi.ts`, armazenamento de rascunho e retomada | valores, condições, seleção de pagamento e diálogos |
| Conta e proprietário | `GuestAccountModal.tsx`, `TripsView.tsx`, `HostDashboardView.tsx` | `useAccountWorkspaceData.ts`, serviços de conta e proprietário | autenticação, foco, estados vazios e erros |

O Graphify apontou essas relações como caminhos de investigação; cada achado abaixo foi conferido diretamente no código. `StaysSearchWidget` contém 1.698 linhas e combina variantes, calendários, posicionamento, eventos e envio. Há também componentes já separados e tokens em `src/index.css`; tamanho isolado não demonstra defeito nem justifica reescrita. Priorizar a separação que permita testar o ciclo de vida dos painéis e compartilhar contratos de calendário e foco.

Na busca, preservar as proteções já existentes: `useAccommodationSearch.ts` cancela a consulta anterior e usa geração para descartar respostas antigas, distingue cotações parciais e mantém resultados quando a paginação falha; `SearchPagination.tsx` oferece nova tentativa e informa que os filtros atuam sobre os imóveis carregados. Há testes para estado parcial e falha de paginação em `tests/accommodationSearchHook.test.ts:511` e `:574`; eles não demonstram todos os estados no navegador.

Quando nenhuma acomodação carregada corresponde aos filtros e ainda há páginas disponíveis, `AvailabilitySearchState.tsx:117–128` comunica que a busca ainda não está completa e orienta carregar mais ou ajustar filtros; `MainContentRouter.tsx:312–315` evita mostrar o vazio definitivo nessa condição e mantém a paginação em `:390–392`. Em produção em 26/11/2026, uma busca de 1 a 3/12 para dois adultos teve 12 imóveis carregados; o filtro de cinco quartos mostrou zero entre os carregados e avisou sobre outras páginas. Depois de aplicar e selecionar “Carregar mais”, a contagem passou a 24 e o aviso e o filtro permaneceram. É uma proteção a preservar. A verificação é pontual e não cobre o fim das páginas ou a visibilidade do aviso em listas longas.

**Falha de calendário no imóvel:** em produção, substituí localmente a resposta de calendário de LI23J por HTTP 503. O painel manteve a reserva desabilitada, indicou disponibilidade não confirmada e ofereceu “Verificar disponibilidade novamente”; o calendário exibiu erro e nova tentativa. Após retirar a interceptação e tentar novamente, a mensagem passou a indicar cotação expirada. A atualização da cotação habilitou “Continuar para reserva”. Isso verifica proteção e recuperação nesse cenário, não o sucesso completo de uma reserva ou indisponibilidade real da API.

**Falha e recuperação pontuais em produção com bloqueio local de rede:** após esse cenário, a requisição de próxima página foi interrompida apenas no navegador de teste. A interface preservou a contagem de 24 imóveis e o filtro de cinco quartos, mostrou alerta de falha e “Tentar carregar mais”. Após remover o bloqueio, a tentativa avançou para 36 imóveis e o filtro continuou ativo. O experimento não alterou o servidor e não cobre a última página ou todas as causas de falha.

Consultas adicionais `graphify explain` no grafo desta revisão apontaram três áreas de regressão compartilhada: `useCheckoutDraftRecovery` liga leitura da viagem e rascunho à validação de hóspedes, calendário e cotação; `useDialogFocus` é consumido por diálogos de diversos domínios; `emitFunnelEvent` é chamado por busca, roteamento do imóvel, checkout, cartão e retomada. As ligações relevantes foram conferidas no código. O grafo AST é parcial e não comprova execução de cada caminho, por isso a ausência de uma ligação nele não é prova de que ela inexista.

**Mapa complementar de conta e proprietário:** o grafo indexou os imports dinâmicos de `TripsView` e `HostDashboardView` por `MainContentRouter.tsx` e de `ExistingReservationCheckout` por `App.tsx`. A leitura direta confirmou que `App.tsx:147–169` conecta os hooks de dados e ações de conta, que o roteador repassa seus resultados para viagens em `MainContentRouter.tsx:398–413`, e que a tela de proprietário só é montada com acesso aprovado e token em `:430–435`. O painel monta `OwnerAccountingTransactions` em `HostDashboardView.tsx:429`, enquanto a reserva existente tem entrada própria em `App.tsx:769–775` e usa hooks separados para resumo e recuperação. Consultas por nome exato dos dois hooks de conta e da tabela contábil não retornaram nós de símbolo no grafo, embora o código comprove essas conexões; portanto o grafo não é inventário completo de relações. A inspeção indica onde executar regressões de F38 e F52–F54, não comprova autorização no backend nem jornadas autenticadas reais.

**Escopo da análise do mapa:** `MainContentRouter.tsx` contém uma variante de mapa e mensagens para resultados sem coordenadas, mas em `App.tsx` o estado começa em `grid` e a única chamada encontrada a `setViewMode` define novamente `grid`; não foi encontrado controle conectado que selecione `map`. A existência do componente não demonstra que a funcionalidade esteja ativa para clientes. Antes de investir em testes de UX do mapa ou removê-lo, confirmar com produto se é experiência planejada, desativada ou código legado. Nenhum defeito de mapa é afirmado sem caminho de acesso confirmado.

**Movimento reduzido, proteção existente:** `src/index.css:157–168,409–420,1079–1102` contém regras para desativar animações, reduzir transições e interromper animações de transição compartilhada quando a preferência está ativa; `src/utils/motion.ts:18–24` escolhe rolagem automática em vez de suave nesse caso. Em 26/11/2026, `npx tsx --test tests/reducedMotionStyles.test.ts` passou um teste de presença dessas regras. O teste verifica o texto CSS e não comprova a aparência, a cascata computada nem todos os caminhos de rolagem no navegador. Preservar as regras e validar a transição condomínio → datas → hóspedes e os diálogos com a preferência ativa e alterada durante o uso. Em navegador automatizado local a 1280 × 800, com a preferência emulada como `reduce`, `matchMedia` confirmou a preferência e três segmentos da busca apresentaram `animation-name: none` e duração computada de transição de aproximadamente 0,01 ms. Uma tentativa de abrir o painel de condomínio não encontrou um painel com o seletor inspecionado, então essa amostra não valida a transição entre etapas nem os diálogos. Em nova tentativa, aguardando a montagem do painel, a abertura de “Onde” funcionou tanto sem preferência quanto com movimento reduzido: a duração computada do painel passou de até 0,36 s para aproximadamente 0,01 ms. Com movimento reduzido, selecionar “Todos os condomínios” abriu o calendário de entrada, também com duração aproximada de 0,01 ms. Isso verifica essa passagem local e suas propriedades CSS, não a seleção completa de datas, a passagem a hóspedes ou a percepção em dispositivo físico. Em outra sessão local com a preferência ativa, selecionar 1 e 3/12/2026 fechou o calendário e devolveu foco ao botão “Quando”, sem abrir hóspedes automaticamente, consistente com F03. Ao abrir “Quem” manualmente, o painel de hóspedes mostrou animação `none` e transição computada de aproximadamente 0,01 ms. A verificação cobre clique e CSS computado nessa dimensão, não teclado completo nem percepção em dispositivo físico. As sessões de teste foram fechadas em seguida.

Em 26/11/2026, as suítes `staysSearchWidgetAccessibility`, `searchModalAccessibility`, `dialogFocus` e `accommodationSearchHook` foram executadas: 45 testes passaram. Houve avisos de busca de `/api/resorts` com URL relativa inválida no ambiente Node de teste; isso não comprova falha da API em navegador. Os testes cobrem, entre outros pontos, descarte de respostas antigas e navegação do calendário do widget, mas não invalidam F01, que diz respeito ao calendário de outra variante no modal, nem as colisões e cortes observados em navegador.

### Inventário inicial para modularização e tokens

| Família | Existente | Contrato a preservar antes de compartilhar |
| --- | --- | --- |
| Calendários | `search/CalendarMonthGrid.tsx`, `SearchDateCalendar.tsx`, `property/PropertyDatePickerDialog.tsx`, `CalendarDayButton.tsx` | Busca e imóvel têm regras, dados de disponibilidade e foco distintos. Comparar primeiro navegação por teclado, seleção de intervalo, meses e expiração. |
| Hóspedes | `search/GuestCounterList.tsx`, `property/PropertyGuestSelectorDialog.tsx` | Busca tem pets e limite geral; imóvel tem limite por acomodação. Definir contagem e casos F05, F09, F28 e F29 antes de unificar comportamento. |
| Diálogos e camadas | `useDialogFocus.ts`, `DeferredModal.tsx` e diálogos por domínio | Foco, portal proprietário, Escape, sobreposição e retorno precisam de um contrato verificável; a tela bloqueante de recuperação atual não usa o mesmo hook. |
| Tokens | `src/index.css` já define cores de calendário, foco, tipografia e medidas da busca | Inventariar usos reais e estados interativos antes de criar novos nomes; contraste e movimento reduzido exigem validação em interface. |

Há valores de camada distintos no código, como `z-50` no checkout e detalhe, `z-[70]` e `z-[71]` no seletor de hóspedes e `z-[1000]` nos painéis da busca. São indícios para estabelecer uma política de camadas, não prova isolada de sobreposição indevida: contexto de empilhamento, portal e estado ativo precisam ser verificados. Não foram propostas substituições automáticas nem um sistema de componentes completo.

## Achados rastreados

### F01 · P1 · Dias do calendário do modal fora da navegação por teclado

**Observado no navegador local e evidência de código, confiança alta:** no modal aberto pela busca compacta, após selecionar a aba “Datas”, a sequência de Tab passou por fechar e pelo painel, seguindo diretamente para “Próximo mês”, sem alcançar os dias. `src/components/search/SearchModal.tsx:290` passa `focusDate={undefined}` e manipulador de teclado vazio a `CalendarMonthGrid`; `src/components/search/CalendarMonthGrid.tsx:135` atribui `tabIndex=-1` a todos os dias nessa situação. A suíte de `tests/searchModalAccessibility.test.ts` aciona os dias com clique e verifica setas das abas, sem demonstrar seleção de dias por teclado.

**Confirmado em produção em 26/11/2026, desktop 1280 × 800:** abri a busca compacta e a aba “Datas”. O DOM apresentava 36 dias habilitados, todos com `tabIndex=-1`; a sequência de Tab passou pelo fechamento e pelo painel e chegou a “Próximo mês” sem focar um dia. Isso confirma o caminho de teclado observado, sem equivaler a teste com leitor de tela.

**Impacto:** a sequência de Tab observada não alcança os dias, dificultando a seleção por teclado. A confirmação com tecnologia assistiva ainda é necessária.

**Ação:** fornecer um dia focável e navegação entre dias/meses; preservar seleção e foco. **Verificação:** completar entrada e saída com Tab, setas, Enter e Escape em desktop e mobile, incluindo troca de mês.

### F02 · P2 · Painel da busca permanece sobre a página

**Observado no navegador local:** abrir “Quem” na busca inicial e rolar até o rodapé deixa o painel de hóspedes sobre o conteúdo, embora a barra original já tenha desaparecido. Em outra sessão, após buscar e abrir um imóvel, o painel apareceu sobre o detalhe.

**Confirmado em produção em 26/11/2026, desktop 1280 × 800:** com “Quem” aberto, rolar até o rodapé manteve o seletor fixo sobre o conteúdo, enquanto a barra original da busca deixou de estar visível. Não foi avaliada nessa reprodução a sobreposição sobre o detalhe do imóvel.

**Evidência de código:** `src/components/search/StaysSearchWidget.tsx:1014` recalcula a posição ao rolar e redimensionar, limita o topo à janela e usa portal fixo com `z-[1000]` em `:1587`. O envio da busca em `:1118` não fecha explicitamente os seletores. A segunda ocorrência requer reprodução adicional para identificar todos os caminhos que a provocam.

**Ação:** definir ciclo de vida dos painéis quando a origem fica invisível, a pesquisa é enviada, a rota muda ou outro diálogo abre. **Verificação:** rolar em ambas as direções, pesquisar e abrir imóvel com cada painel aberto; conferir foco e Escape.

### F03 · P2 · Datas não avançam para hóspedes

**Observado no navegador local:** “Todos os condomínios” abre o calendário. Ao selecionar 1–3 de dezembro, o calendário fecha e “Quem” permanece fechado. Em `StaysSearchWidget.tsx:1681`, concluir o intervalo fecha o calendário e devolve o foco a “Quando”.

**Confirmado em produção em 26/11/2026, desktop 1280 × 800:** selecionar “Todos os condomínios” abriu o calendário; escolher 1 e 3 de dezembro fechou o painel, deixou o seletor de hóspedes fechado e devolveu o foco a “Quando”. Não foi enviada busca nem criada reserva nesse teste.

**Ação:** após intervalo válido, avançar para hóspedes com continuidade visual, permitindo pesquisar imediatamente e respeitando movimento reduzido. **Verificação:** testar mouse, teclado, voltar para datas, Escape e intervalos alterados.

**Contrato proposto para desktop:** a seleção de condomínio já troca `activeDropdown` por `activeDatePicker` mantendo o mesmo portal; a conclusão do intervalo em `:1681–1688` deveria estabelecer o estado de hóspedes na mesma transição, em vez de fechar e mover foco para “Quando”. O efeito em `:1000–1045` já recalcula posição e encaminha foco ao painel de hóspedes quando esse estado fica ativo; a alteração planejada deve verificar a ordem de foco real, preservar datas e contadores, permitir voltar aos segmentos e deixar “Buscar” acessível. Testar clique fora, Escape, envio, rolagem, redimensionamento e `prefers-reduced-motion`; a transição solicitada se refere à barra inicial desktop, não implica modificar automaticamente o fluxo compacto ou móvel. O uso do portal compartilhado por si só não prova que a animação esteja correta ou seja suave em todos os tamanhos.

**Movimento reduzido em produção:** com a preferência emulada em desktop, a abertura do painel de condomínio apresentou `animation-name: none` e transição calculada de aproximadamente 0,00001 s; escolher “Todos os condomínios” abriu o calendário. É uma verificação pontual do painel atual, não comprovação de toda a jornada nem da futura transição para hóspedes.

### F04 · P2 · Cotação expirada continua parecendo atual

**Evidência de código, confiança alta:** `src/utils/propertyDisplayPrice.ts:44` usa a cotação armazenada quando a confirmada expirou e retorna um preço normal; o ramo de aviso em `:61` fica inalcançável para esse caso. `src/components/search/AvailabilitySearchState.tsx:52` não renderiza o estado `stale`. O teste `tests/propertyDisplayPrice.test.ts:68` explicita a decisão de manter o preço visível. O detalhe revalida a cotação, portanto não se conclui que pagamento aceite preço antigo.

**Observado em produção em 26/11/2026:** depois de uma busca de 1 a 3/12 para dois adultos, a página inicialmente indicou disponibilidade confirmada. Após aproximadamente 50 segundos, a indicação de disponibilidade desapareceu do cartão LI23J, mas permaneceram R$ 231,00 e 6x de R$ 46,96 sem indicação de validade no cartão. Essa observação pontual não prova que o valor tenha mudado no fornecedor nem que seja utilizado para pagamento.

**Detalhe após espera adicional:** ao abrir o imóvel e observar a tela após demora da ferramenta de inspeção, ela mostrava “Cotação expirada”, oferecia “Tentar cotação novamente” e mantinha a ação de reserva desabilitada. Como houve espera adicional longa até a captura, essa observação não mede quanto tempo levou para o detalhe consultar inicialmente nem o estado imediatamente após abrir.

**Impacto provável:** o visitante pode comparar preços sem saber que a consulta perdeu validade. **Ação:** distinguir preço anterior de preço confirmado e oferecer atualização, sem apagar resultados desnecessariamente. **Verificação:** expirar cotação com relógio controlado, verificar aviso e recuperação em cada resultado e no detalhe.

### F05 · P2 · Total de hóspedes pode crescer no modo Surpreenda-me

**Observado no navegador local e evidência de código:** pesquisei com 1 adulto e 1 bebê. Em “Surpreenda-me”, a interface inicialmente mostrava “2 Pessoas + 1 bebê”; selecionei “3 Pessoas” e busquei. O resultado apresentou “3 adultos, 1 bebê”, total de 4 hóspedes e URL com `adults=3&infants=1`. Em `StaysSearchWidget.tsx:1135`, se o total selecionado difere do anterior, o novo total vira quantidade de adultos e os bebês anteriores são mantidos. `countOccupancyGuests` soma bebês. O widget nessa variante é usado em `SearchModal.tsx:658`.

**Confirmado em produção em 26/11/2026:** após buscar com 1 adulto e 1 bebê, “Surpreenda-me” mostrava “2 Pessoas + 1 bebê”. Selecionar “3 Pessoas” e iniciar a busca resultou em “3 adultos, 1 bebê” e URL `adults=3&infants=1`. O teste não iniciou reserva.

**Ação:** definir se o campo representa ocupação total ou adultos e preservar uma composição coerente. **Verificação:** repetir o caso observado e pesquisar com diferentes adultos, crianças e bebês, comparando UI, URL e requisição simulada.

### F06 · P2 · Conteúdo cortado no painel de hóspedes

**Observado no navegador local, 1024 × 400 CSS px:** abrir “Quem” e expandir “Vai levar um animal de serviço?” deixa a explicação abaixo da borda visível. Rolar sobre o painel movimentou a página de fundo e não revelou o texto. `StaysSearchWidget.tsx:1027` limita altura ao viewport; o portal em `:1602` usa `overflow-hidden`; a lista em `:1664` não é envolvida por área rolável própria. `GuestCounterList.tsx:48` contém quatro linhas com altura mínima e conteúdo expansível.

**Confirmado em produção em 26/11/2026, 1024 × 400 CSS px:** ao abrir a explicação de animal de serviço, a captura visual mostrou o botão na borda inferior do painel e o texto explicativo cortado. A reprodução de rolagem sobre o painel foi feita no ambiente local, não repetida nessa observação de produção.

**Altura adicional em produção:** a 640 × 300 CSS px, sem expandir a explicação, o painel mediu 276 px de altura para 376 px de conteúdo; os controles de pets ficaram parcialmente fora do viewport e o botão de informação ficou abaixo dele. O painel computou `overflow-y: hidden`; ao focar programaticamente “Aumentar animais de estimação”, o navegador deslocou o conteúdo e o botão passou a receber o clique no centro. Isso mostra que o foco pode revelar esse controle, não comprova acessibilidade por rolagem, toque ou percurso completo por teclado. Em outra sessão na mesma dimensão, a roda do mouse sobre o painel moveu a página de fundo em 260 px e deixou a rolagem interna em zero, sem revelar os controles cortados. Em uma tentativa separada, o primeiro Tab após abertura por clique levou ao botão de busca e as 11 pressões seguintes percorreram controles da página, sem entrar no painel. A abertura por teclado foi examinada separadamente em F55; essas sequências não determinam o comportamento de leitores de tela. As sessões foram fechadas.

**Impacto:** a explicação expandida não fica visível nessa janela; outros tamanhos, zoom e texto ampliado ainda exigem verificação. **Ação:** permitir rolagem interna e manter ação de saída e foco visíveis. **Verificação:** repetir 1024 × 400, testar 320 px e zoom, inclusive texto de animal de serviço expandido e foco por teclado.

### F07 · P2 · Risco de foco atravessar camadas independentes

**Evidência de código:** `src/components/useDialogFocus.ts:14` agrega todos os elementos de todos os portais `data-dialog-focus-portal` do documento ao diálogo ativo; `:27` também considera qualquer portal como pertencente ao diálogo. A busca e a ação fixa do imóvel usam esse marcador. Isso não comprova uma falha em todos os casos, mas permite que um portal sem relação seja incluído no ciclo de foco.

**Ação:** associar portais ao diálogo proprietário e coordenar a camada ativa. **Verificação:** testar busca aberta ao abrir imóvel, galeria e calendário aninhados, Tab/Shift+Tab, Escape e retorno do foco; confirmar também isolamento do fundo com tecnologia assistiva.

**Alcance da mudança compartilhada:** o mesmo hook é usado em busca, filtros, imóvel, galerias, conta, checkout, termos, reservas, assistente e proprietário. Qualquer alteração nessa camada exige regressão das famílias afetadas e dos diálogos aninhados; o uso comum não demonstra que todas apresentam o problema. O calendário do imóvel escolhe explicitamente uma data focável no primeiro mês exibido (`PropertyDatePickerDialog.tsx:109–133`), portanto não se deve presumir que reproduza automaticamente F01, observado no calendário da busca.

**Matriz mínima de regressão para a mudança de foco:** busca com seus três portais, detalhe com ação fixa, calendário e hóspedes aninhados; galeria de imóvel e condomínio; conta e filtros; checkout com contrato; comprovante e cancelamento de viagens; assistente; proprietário e detalhes de contabilidade. Para cada caso, testar Tab e Shift+Tab, Escape, fechamento da camada superior e retorno ao controle correto. Os portais identificados em `StaysSearchWidget.tsx:364,623,1590` e `PropertyBookingPanel.tsx:299` devem ser associados ao diálogo que os abriu; a lista decorre da leitura do código e não significa que cada combinação tenha sido reproduzida.

### Decisão de produto · Apresentação da parcela

O destaque da parcela no catálogo e no cartão é intencional. O total parcelado também é exibido no checkout. Essa hierarquia está aprovada pelo responsável e não é um achado, defeito ou item de correção. Em produção, na cotação de LI23J para 1 a 3/12/2026, o resultado mostrava 6x de R$ 46,96 e o checkout discriminava o total e o acréscimo; os valores são sujeitos a mudança. O identificador F08 foi retirado da lista de achados e do plano de correção.

### F09 · P3 · Idade de bebês descrita de duas formas

**Evidência de código:** busca usa “Menores de 2 anos” em `GuestCounterList.tsx:26`; imóvel mostra “Bebês (até 2 anos)” ao lado de “Crianças (2–12 anos)” em `PropertyGuestSelectorDialog.tsx:125`. Aos dois anos as descrições se sobrepõem.

**Ação:** alinhar a redação à regra validada de ocupação. **Verificação:** conferir busca, imóvel, resumo e requisitos da integração.

### F10 · P2 · Calendário pode depender de uma leitura pontual da largura

**Evidência de código:** `StaysSearchWidget.tsx:739` calcula o número de meses com `window.innerWidth` durante a renderização; o pai atualiza posição no resize, mas a lógica depende de renderização incidental. Há outra implementação de calendário que acompanha `matchMedia` em `SearchDateCalendar.tsx:28`. No navegador local, o calendário aberto passou de dois meses a um ao reduzir de 640 para 639 px; nessa passagem ele permaneceu aberto sobre a navegação móvel. Isso confirma a mudança de disposição nessa sequência, mas não prova atualização correta em todos os caminhos de redimensionamento.

**Risco:** divergência de estado ou foco ao redimensionar com seleção parcial; ainda não foi reproduzida. **Ação:** definir uma fonte reativa de breakpoint ou usar layout CSS adequado, preservando foco e data. **Verificação:** cruzar 639/640 px com datas parcialmente selecionadas e conferir fechamento, foco e disposição.

### F11 · P2 · Favoritos removidos retornam ao reabrir

**Evidência de código, confiança alta:** `src/utils/savedPropertyIds.ts:13` converte uma lista armazenada vazia em dois IDs padrão. `src/hooks/useSavedPropertyIds.ts:12` grava a lista após cada alteração. Assim, remover todos os favoritos grava `[]`, mas a próxima inicialização restaura os IDs padrão; uma primeira visita sem dados também recebe favoritos sem ação do visitante. Os testes em `tests/savedPropertyIds.test.ts` registram esse fallback, mas não cobrem o caso `[]`.

**Confirmado em produção em 26/11/2026, na sessão isolada de teste:** após gravar uma lista de favoritos vazia e recarregar a página, o armazenamento passou a conter dois IDs. O estado anterior da sessão foi restaurado em seguida. O teste verifica a persistência do estado, não a apresentação dos dois imóveis em todas as consultas.

**Impacto provável:** a lista deixa de refletir a escolha explícita e o estado vazio não persiste. **Ação:** distinguir ausência de dados, armazenamento inválido e lista vazia válida; verificar se existe migração necessária para IDs antigos. **Verificação:** remover todos, recarregar e confirmar lista vazia; iniciar em armazenamento limpo e testar dados inválidos. Não foi alterado o armazenamento do usuário para reproduzir.

### F12 · P2 · Favoritos dependem do resultado atual

**Evidência de código, confiança alta:** `src/hooks/useExploreCatalogViewModel.ts:60` monta favoritos filtrando apenas `properties`; `src/hooks/useAccommodationSearch.ts:400` substitui essa lista pelos imóveis da pesquisa. Se um favorito não pertence à página carregada da pesquisa, seu ID continua salvo, mas o imóvel não aparece em favoritos, que pode inclusive mostrar estado vazio.

**Confirmado em produção em 26/11/2026, sessão isolada a 320 × 700:** salvei o imóvel LG02J, que acomoda cinco pessoas, e abri uma busca de dez adultos sem resultados; a tela de favoritos informou que a lista estava vazia, embora o ID ainda constasse no armazenamento. O estado anterior da sessão foi restaurado depois do teste. Não foi usada conta autenticada.

**Ação:** obter os imóveis salvos independentemente da página atual, com estados de carregamento, indisponível e erro. **Verificação:** salvar dois imóveis, buscar um intervalo que retorne somente um, abrir favoritos, recarregar e conferir ambos sem repetir consultas desnecessárias. Reprodução visual ainda pendente.

### F13 · P2 · Cadastro perde a explicação de erro local

**Evidência de código:** `src/components/account/GuestAccountModal.tsx:179` lança erro específico para nome incompleto; o `catch` em `:210` passa a mensagem por `getAccountErrorMessage`, que em `:16` reconhece apenas erros de autenticação e usa mensagem genérica para esse caso. A validação nativa cobre alguns outros campos, mas a regra de nome completo depende desta verificação.

**Reproduzido na interface de produção em sessão isolada:** com todas as requisições de escrita bloqueadas na aba, preenchi nome de uma palavra e dados fictícios; a mensagem foi “Não foi possível acessar sua conta agora. Confira os dados e tente novamente”, sem orientar a completar o nome. Nenhum cadastro foi enviado; o bloqueio foi removido ao final. O teste demonstra a mensagem exibida, não todas as validações da conta.

**Cobertura verificada:** em 26/11/2026, as suítes `guestAccountModalAccessibility`, `headerAccountMenu` e `accountWorkspaceDataHook` passaram 9 testes, incluindo foco e descarte de respostas da conta anterior. Não exercitam o envio de nome incompleto de F13.

**Impacto provável:** a pessoa recebe mensagem de acesso genérica sem saber que precisa completar o nome. **Ação:** apresentar erro local associado ao campo, mantendo a mensagem genérica para erros inesperados do serviço. **Verificação:** informar nome de uma palavra com demais campos fictícios válidos e confirmar explicação, foco e correção sem envio externo. Não foi criado cadastro.

### F14 · P2 · Resposta antiga pode substituir o mês selecionado no painel do proprietário

**Evidência de código, confiança alta para a corrida:** em `src/components/owner/HostDashboardView.tsx:86`, cada troca de mês inicia `loadDashboard`; o resultado de qualquer chamada executa `setDashboard(data)` e `setLoading(false)`, sem cancelamento ou identificação da requisição atual. Se uma consulta anterior terminar depois da consulta do mês escolhido, seus dados podem ser mostrados sob o mês mais recente; uma falha antiga também pode limpar os dados novos.

**Cobertura verificada:** `hostDashboardAccessibility` e `ownerDashboardValidation` passaram 13 testes em 26/11/2026, incluindo anúncio de carregamento, responsividade de componentes e validação de respostas. Eles não demonstram a troca rápida de meses com respostas fora de ordem.

**Confirmado em teste isolado:** com respostas e token fictícios, selecionei novembro enquanto outubro ainda carregava, resolvi novembro primeiro e depois outubro. A tela manteve o título de novembro e passou a exibir o período de outubro. O teste temporário passou e foi removido. Não houve acesso a dados reais de proprietário; falhas fora de ordem e troca de conta ainda precisam de simulação.

**Troca de token no componente isolado:** em outro teste temporário, mantive `HostDashboardView` montado, troquei o token e resolvi a resposta anterior depois da nova; os dados fictícios anteriores substituíram os novos. Na aplicação, `MainContentRouter.tsx:430–434` só monta o painel com acesso aprovado, e `useAccountWorkspaceData` apresenta `loading` ao mudar de token, o que normalmente desmonta o painel. Portanto, o teste do componente não demonstra exposição entre contas na jornada real; é necessário testar a composição e a renovação de sessão antes de concluir alcance ou impacto.

**Teste de composição simplificada:** montei o hook de acesso e o painel com a mesma condição de acesso aprovado, usando respostas fictícias. Ao trocar de token e concluir a consulta antiga depois da nova, o painel permaneceu com os dados da sessão nova. O teste temporário passou e foi removido. Isso confirma a proteção nessa composição e sequência, não cobre todas as transições de autenticação nem elimina o defeito de troca de meses dentro da mesma sessão.

**Ação:** associar resultado, erro e carregamento ao mês e à sessão que os solicitaram, descartando respostas antigas. **Verificação:** simular duas respostas em ordem inversa, inclusive erro da primeira e troca de conta; confirmar que o período mostrado corresponde aos dados. Não houve acesso a dados privados nem alteração de reservas.

### F15 · P2 · Aceite permanece marcado quando o valor parcelado muda

**Observado na prévia local e evidência de código:** marquei o aceite demonstrativo de R$ 957,35 em 1x e selecionei 6x. O texto passou para R$ 1.097,57 e o checkbox permaneceu marcado; o resumo e o acréscimo também mudaram. `src/components/booking/SinglePageCheckout.tsx:573` recebe novo preço do formulário, e o texto em `:822` acompanha o valor. Trocar método limpa o aceite, mas mudar parcelas em `CieloSopCardForm.tsx:690` não limpa esse estado. Não foi verificado se usuários percebem a mudança ou se o produto exige nova confirmação.

**Ação:** revisar o contrato de aceite quando parcelas mudam, mantendo o total e a consequência visíveis; se o aceite representar valor específico, exigir confirmação novamente após alteração relevante. **Verificação:** na prévia, aceitar e trocar 1x/6x, observar checkbox, resumo e ação; verificar acessibilidade do anúncio do total. Nenhum pagamento foi iniciado.

### F16 · P2 · Sugestões de datas não informam o ano

**Observação e correção da revisão anterior:** no site público foi visto “Consciência Negra, 19 nov – 22 nov” em 26/11/2026, e inicialmente foi descrito como data passada. Isso não está comprovado: `src/utils/surpriseDates.ts:62` constrói opções futuras até 370 dias, incluindo o ano seguinte, enquanto `src/components/search/SeasonalDateSuggestions.tsx:92` formata apenas dia e mês. O período pode ser de 2027. O achado confirmado pela implementação é a ausência do ano, que impede distinguir as duas situações; não se deve tratar aquele cartão como vencido sem conferir seus parâmetros.

**Ação:** mostrar o ano quando necessário para identificar o período, inclusive na descrição acessível e ao atravessar ano. **Verificação:** revisar sugestões entre novembro e dezembro, datas no ano seguinte e períodos que atravessam o Réveillon; conferir também a URL gerada.

### F17 · P2 · Texto de hóspedes sobrepõe o botão de busca em 640 px

**Observado no navegador local, 640 × 700 CSS px:** na busca inicial, abrir “Quando” expande o botão laranja “Buscar”. O segmento “Quem” fica estreito: o texto de um hóspede quebra e invade visualmente a área do botão. Em 768 × 700 o texto também quebrou, mas a colisão foi mais evidente em 640. `src/components/search/StaysSearchWidget.tsx:1262` distribui três colunas iguais e `:1525` amplia o botão ativo; o segmento de hóspedes contém texto e botão na mesma linha em `:1468`.

**Confirmado também em produção em 26/11/2026, 640 × 700 CSS px:** ao abrir “Quando”, a captura visual mostrou o botão “Buscar” sobre o texto do segmento “Quem”, que ficou parcialmente encoberto e quebrou em várias linhas. A observação não depende do simulador nem de criar uma reserva.

**Impacto:** leitura e identificação dos controles ficam prejudicadas na largura observada. **Ação:** reservar largura suficiente aos controles ou mudar a composição nesse intervalo; manter nomes, foco e ação visíveis. **Verificação:** repetir em 640, 768 e valores próximos com cada painel aberto, rótulos longos e zoom. A causa de outras sobreposições relatadas ainda precisa de localização própria.

### F18 · P2 · Nova falha em sugestão para pets não oferece retorno

**Evidência de código, confiança alta para o caminho de falha:** cartões de pets com erro exibem “Tente novamente” e “Consulta indisponível. Tente buscar” em `src/components/search/SeasonalDateSuggestions.tsx:705` e `:802`. Ao ativar o cartão, `openDateSuggestion` inicia outra consulta em `:589`; se ela falhar ou não retornar imóvel compatível, o caminho em `:621–631` retorna sem mudar o estado do cartão, informar que a tentativa terminou ou oferecer outra ação. O código também não altera o estado para carregando durante essa tentativa acionada pelo cartão. Uma ocorrência de cartão indisponível foi vista em produção anteriormente, mas essa segunda falha não foi reproduzida em navegador.

**Impacto provável:** a pessoa pode não perceber que a tentativa ocorreu ou terminou e ficar sem caminho claro para continuar. **Ação:** comunicar carregamento e resultado da nova tentativa e oferecer recuperação coerente com o filtro de pets, sem afirmar aceitação antes de confirmá-la. **Verificação:** simular erro repetido, resultado vazio e recuperação com imóvel compatível; conferir retorno visual e anunciado sem criar reserva.

### F19 · P2 · Sugestão pode manter cotação expirada ao voltar à aba

**Evidência de código, cenário ainda não reproduzido:** `src/components/search/SeasonalDateSuggestions.tsx:393` arma um temporizador para expiração, mas retorna sem alterar `quotes` se `document.hidden` estiver ativo quando ele dispara. O listener de visibilidade em `:197` atualiza coleções apenas quando muda o dia; na renderização em `:692` a cotação é escolhida pelo número de hóspedes sem verificar `expiresAt`. A abertura em `:587` também reutiliza o imóvel destacado existente. Além disso, `requestsRef` mantém a entrada da consulta até o grupo deixar de estar visível, o que pode impedir nova consulta enquanto permanece visível (`:270–292`). O teste existente em `tests/seasonalDateSuggestions.test.ts:271` verifica remontagem com cache expirado, não esse retorno à aba ainda montada.

**Impacto provável:** preço e indicação de disponibilidade podem permanecer aparentes após perderem validade até outra atualização de estado. O detalhe possui sua própria revalidação, então não se conclui que uma reserva use esse preço. **Ação:** reavaliar validade ao retomar visibilidade e antes de abrir a sugestão; concluir o ciclo das requisições e oferecer atualização sem consultas em laço. **Verificação:** deixar aba em segundo plano além do prazo, voltar no mesmo dia, observar cartão e clicar; repetir com consulta lenta, erro e mudança de hóspedes.

### F20 · P2 · Recuperação do checkout pode orientar a voltar ao imóvel e abrir a página inicial

**Observado no navegador local e evidência de código:** abri diretamente o checkout com o imóvel simulado `JQ08G` e datas de 1 a 3 de dezembro. A recuperação recusou corretamente o anúncio simulado e pediu para voltar ao imóvel; “Voltar” abriu `/`, sem o imóvel e as datas. `src/hooks/useCheckoutDraftRecovery.ts:25` pode recuperar imóvel e datas da URL e sinaliza erro se a consulta ou validação falhar. A mensagem em `src/App.tsx:621` pede que a pessoa volte ao imóvel, mas o botão em `:633` usa o histórico apenas se houver a marca da navegação interna; caso contrário abre `/`. A observação confirma o acesso direto no simulador; outros motivos de falha e navegação interna ainda precisam ser verificados.

**Confirmado também em produção em 26/11/2026:** um checkout aberto diretamente com identificador fictício mostrou a orientação para voltar ao imóvel; “Voltar” levou à página inicial sem parâmetros da viagem. Esse identificador não representa um imóvel válido, portanto o teste não demonstra qual deve ser o destino para uma falha com imóvel existente.

**Impacto provável:** recuperar a viagem exige localizar novamente o anúncio e as datas. **Ação:** quando os dados de viagem forem válidos, oferecer retorno identificado ao imóvel preservando o contexto; para dados ausentes, informar claramente o destino e permitir nova busca. **Verificação:** abrir o checkout com dados fictícios por navegação interna, link direto, rascunho ausente e consulta indisponível; conferir destino, rótulo e possibilidade de tentar novamente. Não foi iniciada reserva.

### F21 · P1 · Tela de recuperação do checkout permite foco atrás da camada

**Observado no navegador local e evidência de código:** ao abrir diretamente o checkout com imóvel simulado, a tela branca de erro cobriu toda a página. O primeiro Tab colocou foco no botão da marca na página encoberta, em vez de “Tentar novamente” ou “Voltar”. A árvore de acessibilidade também apresentava busca, cartões e rodapé junto com o aviso. Em `src/App.tsx:613`, a camada fixa usa `role="status"`, com botões de ação, mas não usa o gerenciamento de foco dos diálogos nem torna o conteúdo subjacente inerte. O comportamento específico de leitores de tela ainda não foi verificado.

**Confirmado em produção em 26/11/2026:** um link direto com identificador fictício abriu a tela de recuperação; o primeiro Tab focou o botão da marca atrás da camada, e não suas ações. Nenhuma reserva foi criada. O teste de leitor de tela continua pendente.

**Impacto:** quem começa pelo teclado encontra um controle invisível em vez das ações de recuperação. **Ação:** escolher semântica compatível com a tela bloqueante, mover foco para a recuperação e impedir interação com o fundo enquanto estiver ativa; devolver foco ou navegar para um destino coerente. **Verificação:** percorrer Tab/Shift+Tab no carregamento e no erro, testar Escape e retorno, e confirmar isolamento do fundo com leitor de tela.

### F22 · P2 · Taxa local e formas de pagamento divergentes na descrição

**Observado em produção:** a descrição do imóvel LI23J mencionava pulseira de R$ 10 por pessoa e apresentava formas de pagamento distintas em trechos diferentes: um incluía Pix, outro informava apenas cartão. O resumo do checkout mostrava R$ 231,00 sem linha separada para pulseira. Não foi confirmado se a taxa já estava incluída ou seria paga separadamente.

**Ação:** confirmar condições com a fonte responsável, eliminar contradição e deixar explícito o que é pago no local e o que integra o total. **Verificação:** comparar anúncio, regras e checkout para diferentes hóspedes e imóveis com taxa local.

### F23 · P2 · Checkout novo depende da montagem da página de catálogo

**Confirmado no código:** a rota `/checkout` cai em `MarketplaceApp` em `src/App.tsx:810`; essa aplicação monta o catálogo e demais elementos da página e apresenta o checkout por `AppOverlayLayer.tsx:192`. No acesso direto, `useCheckoutDraftRecovery.ts:39` espera `catalogLoading` antes de procurar o imóvel e revalidar calendário e preço. O aviso de recuperação cobre o fundo, mas não o isola, conforme F21. Rotas de retomada e de reserva existente já têm entradas próprias em `src/App.tsx:769` e `:779`.

**Avaliação:** usar uma camada sobre uma página não é defeito por si só. Aqui o acoplamento é estrutural e já tem consequência observada de foco no fundo; a espera pelo catálogo é confirmada no código e foi observada nas amostras de tempo abaixo. Ainda é necessário medir sua contribuição com cache e rede controlados e avaliar o eventual lampejo visual em produção. Não presumir que o servidor entregue HTML da página inicial como causa.

**Direção proposta:** criar entrada de página para `/checkout`, isolada do catálogo, com carregamento e erro próprios; recuperar diretamente imóvel e viagem e continuar revalidando disponibilidade e preço no servidor. Preservar navegação, retorno ao imóvel, rascunho, parâmetros, autenticação e pagamento. Avaliar se navegação interna ainda precisa de apresentação modal, sem duplicar regra de negócio. **Verificação:** acesso direto e atualização, histórico, link sem rascunho, erro e rede lenta; medir requisições e tempo antes/depois, conferir foco e fundo, além de retomada e pagamento com ambiente seguro.

**Investigação da demora no acesso direto:** o catálogo inicia sua consulta em `src/hooks/useAccommodationCatalog.ts:28`, e a recuperação espera `catalogLoading` em `useCheckoutDraftRecovery.ts:39`, mesmo que o imóvel já esteja no cache. Depois procura o imóvel ou o consulta individualmente e só então inicia calendário e preço em paralelo (`:45–68`). A camada de checkout é ativada após receber o resultado (`src/components/AppOverlayLayer.tsx:192`); condições e disponibilidade do pagamento começam em paralelo quando o componente de checkout é montado (`src/components/booking/SinglePageCheckout.tsx:99,132`). Isso estabelece dependências sequenciais reais, mas não mede quanto cada etapa demorou na observação em produção.

**Contrato para a futura entrada independente:** interpretar e validar imóvel, datas, hóspedes e moeda; recuperar o rascunho quando aplicável; consultar dados do imóvel sem aguardar a lista completa; validar calendário e cotação antes de permitir prosseguir; carregar condições e disponibilidade de pagamento; preservar autenticação, retorno e histórico; manter a retomada de pedido existente e os contratos da API. Medir separadamente navegação até a primeira indicação de carregamento, resumo utilizável e pagamento disponível, além de tempo e quantidade das consultas críticas. Comparar condições equivalentes de cache, conexão e respostas antes e depois, sem usar dados pessoais ou criar cobranças. Não há meta numérica ou ganho comprovado nesta revisão.

**Medição pontual de produção em 26/11/2026:** em uma abertura direta para LI23J e 1–3/12, o navegador registrou catálogo entre 379 e 880 ms após início da navegação; calendário e preço começaram em 905 ms e novamente em 1.667 ms; condições e prontidão do pagamento começaram em 2.904 ms. A segunda dupla terminou em torno de 2.579–2.587 ms, e condições/prontidão em torno de 3.998 ms. São tempos aproximados de uma única execução, com cache e rede não controlados, não médias nem metas de desempenho. A repetição das chamadas foi observada; uma possível causa é o efeito depender de `properties`, mas a causa precisa ser confirmada com rastreamento antes de modificar o código. Não foram inseridos dados pessoais nem iniciado pedido.

**Segunda abertura nas mesmas condições gerais:** o catálogo terminou em aproximadamente 1.090 ms; houve uma chamada de calendário e uma de preço a partir de 1.097 ms, e condições/prontidão iniciaram em 2.268 ms e terminaram até 2.749 ms. A duplicação da primeira medição não ocorreu nessa segunda. Isso reforça que a repetição não é invariável; ainda faltam medições com rede e cache controlados e confirmação de causa.

**Sequência planejada para reduzir espera:** (1) medir início, fim e falha do catálogo, imóvel, calendário, preço, condições e disponibilidade de pagamento, além de tempo até a tela e até o pagamento ficar habilitado; repetir acesso direto e navegação interna com cache frio e quente e rede lenta, sem dados pessoais. (2) Na entrada independente, iniciar recuperação do imóvel sem aguardar o catálogo, evitando montar busca e catálogo nessa rota. (3) Iniciar código visual e consultas independentes em paralelo assim que seus identificadores forem validados; só antecipar chamadas quando o contrato garantir identidade correta e não provocar duplicação nem alterar estado. (4) Mostrar estrutura de checkout e progresso imediatamente, mantendo ações de pagamento bloqueadas até preço, disponibilidade, condições e método estarem confirmados. (5) Comparar tempos e quantidade de chamadas antes/depois, exercitar erro, retry, acesso direto, histórico e links de retomada, e confirmar revalidação no servidor antes de criar pedido. As etapas são propostas para futura implementação, não alteração já realizada.

### F24 · P2 · Checkout afirma que preço foi atualizado quando a nova consulta falha

**Evidência de código, ainda não reproduzida em navegador:** ao receber `quote_changed`, `src/components/booking/SinglePageCheckout.tsx:312` desmarca o aceite e consulta o preço. Em `:320`, só substitui a cotação se a resposta tiver origem `stays-live`; mesmo com resposta nula ou outra origem, em `:321` informa que o resumo foi atualizado. `src/services/crcnBackendApi.ts:766` retorna `null` quando a consulta falha ou seus dados não conferem, deixando o valor anterior em tela. O teste em `tests/singlePageCheckout.test.ts:500` cobre a atualização bem-sucedida, não a falha. O serviço direto rejeita a divergência antes de criar o pedido (`app/Services/DirectCheckoutService.php:145`), portanto esta evidência não demonstra cobrança indevida.

**Confirmado em teste isolado em 26/11/2026:** adaptei temporariamente o teste existente para que a atualização retornasse `null` após `quote_changed`. A tela pediu para conferir o “resumo atualizado”, mas manteve o valor anterior de R$ 3.192,22; o aceite foi desmarcado e a tokenização não foi iniciada. A primeira execução falhou por uma expectativa numérica incorreta; corrigida a expectativa, o teste passou e o arquivo temporário foi removido. Não houve pagamento real.

**Impacto provável:** a pessoa recebe uma instrução incorreta, pode aceitar novamente o valor antigo e encontrar outra rejeição, sem saber que precisa recuperar a cotação. **Ação:** distinguir atualização confirmada de falha ou origem inválida, impedir nova aceitação de cotação sabidamente desatualizada e oferecer nova consulta e retorno apropriado. **Verificação:** simular `quote_changed` seguido de erro, resposta inválida e sucesso, nos fluxos Pix e cartão; conferir mensagem, valor, aceite e ausência de pagamento enquanto não houver preço confirmado.

### F25 · P2 · Barra final pode impedir recuperação de link direto do checkout

**Evidência de código, dependente de como o servidor entrega a URL:** `src/App.tsx:708` remove barras finais para aceitar `/checkout/` como rota conhecida, mas `src/utils/checkoutDraft.ts:8` reconhece somente `/checkout` e `/checkout/nova` exatamente. Portanto, se `/checkout/` chegar ao aplicativo sem redirecionamento, `src/hooks/useCheckoutDraftRecovery.ts:21` não inicia a recuperação e a camada em `src/App.tsx:613` também não aparece. O aplicativo monta a página de catálogo sem recuperar a viagem, mesmo que o link tenha parâmetros válidos. O comportamento efetivo do servidor em produção e o acesso direto ainda precisam de reprodução; os testes de barra final encontrados cobrem código de reserva, não este caminho.

**Verificação adicional em produção:** a requisição a `/checkout/` recebeu redirecionamento 301 para o caminho sem barra, preservando os parâmetros da viagem, de modo que o problema condicional não foi demonstrado nessa entrada. Uma abertura direta de `/checkout` no navegador recuperou a viagem e exibiu o checkout após o catálogo. Uma requisição HTTP direta a esse caminho retornou status 404 embora o navegador tenha carregado a aplicação e recuperado a viagem; investigar essa resposta separadamente, incluindo comportamento de cache e infraestrutura, sem concluir que o acesso esteja bloqueado.

**Ação:** adotar uma normalização consistente da rota ou redirecionamento canônico que preserve os parâmetros, inclusive na navegação por histórico. **Verificação:** abrir e atualizar `/checkout` e `/checkout/` com viagem válida e inválida, conferir URL final, recuperação, hóspedes e retorno; repetir com a rota legada e testar a configuração real do servidor.

### F26 · P2 · Acesso direto ao checkout recebe HTTP 404 apesar de abrir a interface

**Confirmado em produção em 26/11/2026:** uma requisição GET para `/checkout` com parâmetros de viagem respondeu HTTP 404 e HTML; a página inicial respondeu 200. No navegador, o HTML carregou o aplicativo e a viagem foi recuperada, portanto não se observou bloqueio visual do checkout. A resposta 404 pode afetar clientes, monitoramento e ferramentas que dependem do status HTTP, mesmo quando o JavaScript consegue continuar.

**Causa compatível no código local:** `app/Http/Controllers/SpaController.php:17` reconhece caminhos `checkout/` seguidos de identificador, mas não `/checkout` isolado. Esse caminho também não consta da lista em `:185`, então cai na resposta com shell e status 404 em `:192`. A correspondência entre esse código e o deploy não foi comprovada por inspeção do artefato de produção.

**Ação:** tratar a rota válida de checkout novo como resposta bem-sucedida mantendo `noindex` e preservar 404 para caminhos desconhecidos. **Verificação:** testes HTTP GET e HEAD de `/checkout` com e sem parâmetros, barra final e rota legada, bem como rotas de retomada e caminhos inexistentes; conferir corpo, status, redirecionamento e cabeçalho de indexação. Validar também carregamento com JavaScript e acesso via histórico, sem criar reserva.

### F27 · P3 · Erro real de preço é apresentado como cotação não confirmada

**Evidência de código:** `src/services/crcnBackendApi.ts:815` converte falha HTTP, timeout ou resposta inválida em `null`. Em `src/components/property/usePropertyQuote.ts:43`, esse retorno é tratado no caminho de sucesso com `failed: false`; assim, o painel em `PropertyBookingPanel.tsx:129` e `:149` não mostra a mensagem específica de falha. O botão de nova tentativa continua disponível quando o período selecionado está disponível (`:267`), e a reserva permanece desabilitada. O teste `tests/propertyAvailabilityHook.test.ts:130` simula uma promessa rejeitada, enquanto a implementação real do serviço normalmente captura a exceção e retorna `null`.

**Teste isolado em 26/11/2026:** com o serviço real e `fetch` simulado retornando HTTP 503, o hook encerrou o carregamento com cotação `null` e `priceRequestFailed: false`. O teste temporário passou e foi removido. Isso confirma a transformação da falha e o estado do hook; não verifica a mensagem completa do painel em navegador nem envolve a API de produção.

**Confirmado na interface de produção com erro interceptado localmente:** no imóvel LI23J, para 1 a 3/12 e dois adultos, a resposta de `/api/price` foi substituída por HTTP 503 somente na sessão de teste. O painel mostrou “Disponibilidade confirmada; cotação ainda não confirmada”, ofereceu nova tentativa e manteve “Cotação indisponível” desabilitado, sem comunicar a falha da consulta. Após retirar a interceptação e selecionar “Tentar cotação novamente”, a interface habilitou “Continuar para reserva”. Não foi criada reserva nem se afirma que a API real retornou 503.

**Impacto provável:** a pessoa vê preço não confirmado sem saber que uma consulta falhou; o caminho de recuperação existe. **Ação:** definir um resultado tipado que distinga falha de consulta, resposta sem cotação e sucesso, mantendo a reserva bloqueada até confirmação. **Verificação:** simular timeout, erro HTTP, resposta inválida e retorno válido vazio no limite real do serviço, conferir mensagem e retry; testar também respostas fora de ordem após mudar datas e hóspedes. O hook já usa chave de contexto e limpeza para rejeitar respostas antigas, comportamento que deve ser preservado.

### F28 · P3 · Limites de pets divergem entre seleção, URL e checkout

**Evidência de código, cenário extremo não reproduzido:** o contador de pets em `src/components/search/GuestCounterList.tsx:43` permite aumentos sem limite. Ao restaurar a busca pela URL, `src/utils/searchUrlState.ts:174` limita a quantidade a 17; a URL direta do checkout aceita até 50 (`src/utils/checkoutUrl.ts:69`); e o backend aceita até 20 na criação do pedido (`app/Http/Requests/StoreCheckoutRequest.php:36`). No detalhe, a quantidade selecionada é preservada no payload (`PropertyDetailModal.tsx:404`). Assim, uma seleção acima desses limites pode mudar após restauração ou ser rejeitada posteriormente, dependendo da jornada. Não foi verificado se há outra validação anterior para todos os caminhos.

**Ação:** definir com produto uma regra única e apropriada para pets, comunicar o limite no controle e alinhar interpretação da URL e validação do servidor. **Verificação:** testar limite, limite mais um, recarga, histórico e acesso direto ao checkout com dados simulados; confirmar que o valor não muda silenciosamente nem chega a tentativa de pagamento inválida. Não presumir que 17, 20 ou 50 seja a regra correta de negócio.

### F29 · P2 · Detalhe pode receber hóspedes acima da capacidade sem orientar ajuste

**Evidência de código:** `PropertyDetailModal.tsx:171` copia hóspedes do contexto inicial sem ajustar nem validar a capacidade do imóvel, que é calculada em `:307–308`. O seletor impede novos aumentos quando atinge o limite, mas não reduz nem avisa que uma seleção inicial já excedeu esse limite (`PropertyGuestSelectorDialog.tsx:123`). O botão e a ação de prosseguir verificam datas e cotação, mas não comparam a ocupação com `guestLimit` (`PropertyBookingPanel.tsx:88` e `PropertyDetailModal.tsx:390`). A busca normal filtra capacidade, mas outras entradas ainda precisam de reprodução. Se a cotação for retornada nesse contexto, o checkout pode ser iniciado; a validação do servidor em `DirectCheckoutService.php:94` rejeita excesso antes de criar pedido. Não foi comprovado que o fornecedor retorne cotação para esse caso.

**Observado em produção em 26/11/2026:** abri o imóvel LI23J diretamente com 10 adultos e datas de 1 a 3/12/2026. A ficha indicou capacidade para até 5 hóspedes, mas o painel manteve 10 pessoas e mostrou “Disponibilidade confirmada; cotação ainda não confirmada”, sem explicar a incompatibilidade. O botão permaneceu desabilitado como “Cotação indisponível”; não foi possível afirmar, a partir dessa observação, que o fluxo chegaria ao checkout. Não houve tentativa de reserva.

**Recuperação observada no mesmo cenário:** ao abrir o seletor, o limite de 5 aparece e os botões de aumentar ficam desabilitados. Reduzir manualmente de 10 para 5 e aplicar atualizou a URL, gerou nova cotação e habilitou “Continuar para reserva”. A recuperação existe, mas a pessoa precisa descobrir que deve abrir o seletor para identificar a razão; o teste terminou antes de iniciar a reserva.

**Retorno à busca, leitura de código:** `PropertyDetailModal.tsx:187–205` atualiza os parâmetros da URL após edição; `useAccommodationRouting.ts:244–264` usa essa URL para restaurar a busca quando o imóvel foi aberto diretamente. O histórico interno segue outro caminho, e `PropertyDetailModal.tsx:207–242` contém preservação específica para apresentação de página. Essa leitura não comprova que todos os fluxos de volta mostrem os hóspedes atualizados: validar fechamento por botão e histórico, tanto em link direto quanto em navegação interna, e comparar URL, seletor e nova consulta.

**Ação:** preservar a seleção original e informar claramente que ela excede a capacidade, oferecendo ajuste explícito antes de continuar; não remover hóspedes silenciosamente. **Verificação:** abrir link direto de imóvel pequeno com grupo maior, navegar entre imóveis e simular cotação retornada e indisponível; conferir mensagem, controle, botão e validação do servidor sem criar reserva.

### F30 · P2 · Checkout perde a explicação específica de respostas 422

**Evidência de código, sem reprodução em navegador:** `BookingController.php:217–240` entrega código e mensagem do serviço; por exemplo, `DirectCheckoutService.php:94–95` retorna 422 com explicação de capacidade excedida e informa que nenhum pedido foi iniciado. Porém, `src/services/checkoutApi.ts:508` converte toda resposta 422 em `invalid_checkout_request` e mensagem genérica, inclusive as respostas de negócio com código próprio. `SinglePageCheckout.tsx:325` mostra essa mensagem genérica e não usa `fieldErrors`, mesmo quando o cliente os extrai. Isso pode ocultar a razão e o ajuste necessário em casos como F29, além de falhas de validação de dados. A evidência não indica criação de pedido ou cobrança nesse cenário.

**Simulação local do cliente:** uma resposta HTTP 422 sintética com código `invalid_guest_count` e mensagem de capacidade excedida produziu `invalid_checkout_request` e “Confira os dados informados antes de continuar.” A consulta usou `fetch` substituído em memória e não fez chamada de rede nem criou pedido. Isso confirma a transformação no cliente, não o comportamento visual completo do checkout.

**Ação:** distinguir erro de validação por campo de erro de negócio já tipado, preservar mensagens seguras e oferecer correção ou retorno à etapa adequada; associar erros relevantes aos campos e foco. **Verificação:** simular 422 por capacidade, hóspedes, CPF e dados de contato no cartão e Pix, conferir mensagem e recuperação, e confirmar que erros desconhecidos ainda recebem fallback seguro sem exposição de dados.

**Verificação das suítes existentes:** em 26/11/2026, `tsx --test tests/singlePageCheckout.test.ts tests/checkoutDraftRecovery.test.ts tests/reservationApiValidation.test.ts` passou 43 de 43 testes. A cobertura inclui revalidação de checkout, reconsulta de preço bem-sucedida, Pix e cartão simulados e resposta lenta de disponibilidade de pagamento; não demonstra o comportamento específico de 422 descrito neste achado nem a atualização de preço que falha em F24. As mensagens de erro impressas durante testes de respostas inválidas foram esperadas e a execução terminou sem falhas.

### F31 · P2 · Preferências de medição ocupam espaço e exigem leitura técnica

**Observado em produção e evidência de código:** em tela móvel de 320 × 700, o painel de primeira visita cobriu parte significativa do checkout. `src/components/MeasurementPreferences.tsx:111` mostra uma explicação longa sobre tags e cookies, dois controles de categoria e apenas “Recusar” e “Salvar escolhas”; não há ação direta “Aceitar tudo” nem link de privacidade dentro do painel. A pessoa pode escolher analytics e publicidade separadamente e reabrir as preferências, recursos que devem ser preservados.

**Medição de produção em sessão isolada:** na página inicial, o retângulo do painel media 296 × 430 px em viewport de 320 × 700, cerca de 57% da área visível; em 1280 × 800 media 512 × 330 px, cerca de 17%. São medidas pontuais do retângulo, não avaliação de obstrução ou legibilidade em todos os dispositivos. A preferência anterior da sessão de teste foi restaurada.

**Altura reduzida em 320 × 400:** reabri o painel sem alterar escolhas. Ele ocupou 296 × 304 px, de y=16 a y=320; o conteúdo tinha 428 px de altura e exigia rolagem interna. Na posição inicial da captura, o texto e apenas o primeiro controle apareciam; os botões de escolha não estavam visíveis. O teste confirma a necessidade de rolar nesse estado, não uma impossibilidade de alcançá-los. O redesenho deve manter ações claras e acessíveis em alturas curtas, respeitando a área segura.

**Contratos já existentes:** os dois controles são checkboxes associados a rótulos; ao abrir, o componente move foco para o título e, após salvar ou recusar, tenta retornar ao controle anterior. O painel é uma região, não um diálogo modal, e o componente não define fechamento por Escape. `tests/measurementConsent.test.ts:188–228` verifica foco inicial e retorno após salvar, além da persistência e reabertura de escolhas independentes; `:230–244` verifica classes de rolagem no painel fixo. Esses testes não substituem navegação real por teclado, inspeção visual de foco ou validação dos novos três botões. No redesenho, decidir explicitamente se a camada é modal e como descartar mudanças não salvas; preservar escolhas anteriores e retorno de foco conforme a decisão.

**Direção solicitada:** primeira camada curta com três ações de significado distinto: “Recusar”, “Personalizar” e “Aceitar tudo”; explicar em uma frase a finalidade de medição e publicidade e oferecer link para uma política de privacidade publicada e acessível. A rota proposta `/privacidade` respondeu 404 na verificação descrita em F51; resolver a disponibilidade do documento antes de depender desse endereço. “Personalizar” abre a segunda camada com controles separados e “Salvar escolhas”; recusar desliga ambas as categorias e aceitar tudo ativa ambas. Confirmar redação e nomenclatura com produto. Em mobile, dimensionar pela altura disponível e safe areas, permitir rolagem quando necessário e não cobrir controles críticos; em desktop manter posição visível sem impedir a jornada. Não prometer que as pessoas compreenderão ou aceitarão mais sem validação.

**Hierarquia e privacidade:** o usuário deseja destacar aceite. A orientação da ANPD desaconselha dificultar rejeição ou configuração e dar destaque apenas ao aceite; recomenda-se manter as três ações facilmente visíveis, legíveis e com esforço comparável, e validar o desenho com responsável por privacidade. Fonte: [Guia orientativo da ANPD, seção sobre banners de cookies](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf/%40%40display-file/file). **Verificação:** primeira visita, cada escolha, alteração e revogação, 320 px e altura reduzida, teclado, foco, links e sobreposição com busca, imóvel e checkout; verificar que nenhuma preferência é ligada por padrão.

### F32 · P2 · Medição do funil depende simultaneamente de analytics e publicidade

**Evidência de código:** `src/utils/measurementEvents.ts:32–35` só envia eventos de busca, imóvel, checkout e compra se ambas as categorias forem aceitas e o GTM estiver carregado; `measurementConsent.ts:117–118` permite carregar Google Analytics com analytics isolado, mas só carrega GTM quando as duas categorias estão ativas. Assim, aceitar apenas analytics pode carregar a tag GA sem emitir os eventos do funil por esse caminho. Isso é o comportamento do código, não prova de configuração efetiva do GTM ou de perda quantitativa em produção.

**Armazenamento indisponível:** `saveMeasurementConsent` captura falha de gravação e o componente mantém a escolha na memória da página, podendo carregar as tags conforme ela. Porém, `emitFunnelEvent` relê a escolha do `localStorage`; se a leitura ou gravação falhar, não encontra o consentimento e deixa de emitir eventos por esse caminho. Ao recarregar, o painel volta a pedir escolha. Isso é inferência do código para esse ambiente e não comprova envio de tags ou eventos de terceiros. A especificação deve definir comportamento coerente e informado para essa sessão, mantendo ausência de consentimento como padrão quando não há escolha verificável.

**Teste controlado em 26/11/2026:** com `localStorage` simulado para lançar erro, a interface aceitou as duas escolhas e fechou; a leitura persistida retornou `null`. Com ID GTM fictício, a função de carregamento inseriu o elemento de script no DOM simulado, mas `emitFunnelEvent` rejeitou um evento de busca. O teste temporário passou e foi removido; o ambiente simulado não carregou serviço externo nem prova comportamento de tags reais. O recarregamento permanece inferido da inicialização do componente.

**Direção proposta:** mapear eventos e destinos por finalidade e auditar configuração real antes de decidir como medir; se aprovado, permitir métricas de uso com analytics aceito sem exigir publicidade, mantendo categorias separadas e não enviando dados para fins recusados. Para medir exibição e escolha do banner, definir antes quais eventos podem ser coletados com cada estado de consentimento e qual alternativa agregada é adequada; não presumir permissão de rastrear quem recusou. Não incluir nome, e-mail, telefone, CPF, dados de cartão ou parâmetros livres. **Verificação:** matriz de quatro combinações de consentimento mais ausência, revogação e retorno; inspecionar rede, dataLayer, armazenamento e eventos reais em ambiente controlado; medir escolhas e conversão apenas conforme a política aprovada.

**Inventário de eventos no código:** `search` no envio da busca, `view_item_list` na lista, `view_item` na navegação do imóvel, `begin_checkout` ao iniciar checkout, `add_payment_info` em componentes de pagamento e `purchase` somente após confirmação de reserva e pagamento. O identificador de transação enviado por `emitConfirmedPurchase` é derivado por hash e há deduplicação local (`measurementEvents.ts:52–95`). Existe evento de atualização de preferências no `dataLayer` quando ele está disponível, mas não há instrumento explícito de impressão ou clique do painel em `MeasurementPreferences.tsx`. Este inventário não demonstra entrega, configuração de destinos, nem cobertura de todos os caminhos Pix e cartão em produção. A futura auditoria deve comparar eventos efetivamente entregues, suas condições e duplicidade, preservando escolhas e confirmação autoritativa da compra.

**Limite da deduplicação:** a trava em memória é específica da instância e o marcador em `localStorage` é local ao navegador; a leitura e a gravação não formam uma operação atômica entre abas. Outro navegador, armazenamento limpo ou duas abas simultâneas podem tentar emitir a mesma compra. O `transaction_id` é determinístico para a referência, o que permite deduplicação no destino se configurada, mas o código local não comprova essa configuração. O teste existente (`measurementConsent.test.ts:259–299`) verifica emissão única na mesma instância, não entre abas ou dispositivos. A reconciliação deve testar esses cenários e a confirmação efetiva no destino, sem presumir perda ou duplicação nos relatórios atuais.

**Plano de medição a definir antes da implementação:**

| Etapa | Indicador proposto | Condição e limite de interpretação |
| --- | --- | --- |
| Preferências | Apresentações e escolhas por opção, além de reaberturas e mudanças | Definir previamente método e finalidade autorizados para cada estado, inclusive ausência ou recusa; não inferir denominador completo apenas de tags dependentes de consentimento. |
| Busca | Buscas iniciadas, concluídas, vazias e com erro; avanço entre etapas | Diferenciar tentativa, resposta e resultado vazio, sem armazenar texto livre; contar conforme consentimento aplicável. |
| Imóvel | Abertura de resultado e passagem ao checkout | Identificador técnico validado, sem dados pessoais; evitar duplicação por remontagem ou histórico. |
| Checkout | Carregamento, falhas recuperáveis, escolha de Pix/cartão e início de tentativa | Estabelecer momentos equivalentes para cada método e tratar retomadas; não incluir campos, dados do pagador ou código Pix. |
| Compra | Pedidos confirmados e valor agregado | Exigir confirmação autoritativa, deduplicar por identificador protegido e reconciliar com backend; pagamentos pendentes e recusados não são compra. |

Definir unidade de contagem, janela temporal, responsáveis, destino de cada evento e método de reconciliação. Taxas de conversão calculadas apenas sobre usuários que permitiram medição não representam necessariamente todos os visitantes; não presumir que aceitar a medição seja necessário para realizar reserva.

### F33 · P2 · Revogação com apenas Google Analytics carregado não segue o recarregamento descrito

**Evidência de código, efeito em rede ainda não verificado:** `MeasurementPreferences.tsx:76–85` só recarrega após revogação quando encontra `crcn-gtm-script`. Com analytics aceito e publicidade recusada, `measurementConsent.ts:117–118` pode carregar o script Google Analytics sem GTM; ao revogar analytics nessa situação, o código atualiza o estado de consentimento no `dataLayer`, mas não executa o recarregamento mencionado no texto da interface nem remove o script já inserido. Isso não demonstra que dados continuem sendo enviados: a resposta efetiva da tag e as requisições posteriores devem ser inspecionadas.

**Confirmado em produção em 26/11/2026, sessão isolada:** com analytics permitido e publicidade recusada, o script GA estava presente e GTM ausente. Ao clicar “Recusar”, a escolha gravada passou a negar ambas; o documento não recarregou e o elemento do script GA permaneceu. O estado anterior da sessão foi restaurado após o teste. A presença do elemento não demonstra tráfego após revogação, que não foi auditado.

**Ação:** definir e implementar uma estratégia verificável para cada combinação de tags e revogação, alinhar o texto ao comportamento e garantir atualização imediata das escolhas; avaliar explicitamente o tratamento dos dados e cookies existentes. **Verificação:** em ambiente controlado, aceitar apenas analytics, revogar e inspecionar comandos, carregamento e rede após a escolha e após navegação; repetir com ambas as categorias e com armazenamento indisponível, sem usar dados pessoais.

**Testes existentes executados em 26/11/2026:** `measurementConsent`, `measurementAttribution` e `checkoutAttributionIntegration` passaram 22 testes. Eles cobrem preferências separadas, atribuição e não carregamento na próxima página após revogação; não comprovam o comportamento de rede da tag já carregada na mesma página no caso acima.

### F34 · P2 · Evento de pagamento Pix não está na mesma etapa do checkout novo

**Evidência de código, sem observação de produção:** `CieloSopCardForm.tsx:273` emite `add_payment_info` para cartão antes da chamada de pagamento. A retomada em `CheckoutResumePage.tsx:412–417` emite o evento para Pix antes da tentativa, mas o Pix do checkout novo em `SinglePageCheckout.tsx:331–376` prepara e envia o pagamento sem chamada correspondente. Outros destinos ou tags externas não foram auditados; portanto, isso indica lacuna no evento da aplicação, não prova que relatórios de produção estejam incompletos.

**Ação:** definir a etapa exata que cada evento representa, alinhar Pix e cartão e deduplicar tentativas e retomadas conforme o objetivo da análise, respeitando F32 e o consentimento. **Verificação:** simular fluxos de Pix e cartão em ambiente seguro, inclusive falha, retry, retomada e consentimento parcial; conferir payload e quantidade de eventos sem enviar dados do pagador nem realizar cobrança.

**Rastreamento adicional:** após o Pix do checkout novo, `SinglePageCheckout.tsx:465–562` renderiza o acompanhamento e o código diretamente, sem montar `CheckoutResumePage`; assim, a emissão da retomada não ocorre automaticamente nesse caminho. Isso fortalece a conclusão sobre o código local, mas não audita tags externas ou a versão implantada.

### F35 · P2 · Cópia do Pix no checkout novo não informa sucesso nem falha

**Evidência de código, não exercitada em produção:** `SinglePageCheckout.tsx:525–535` chama `navigator.clipboard?.writeText` sem aguardar o resultado nem apresentar confirmação ou erro. Se a API não estiver disponível ou a operação falhar, o botão não comunica o resultado; há uma área de texto somente leitura que permite seleção manual. Já `CheckoutResumePage.tsx:386–392` e `:1104–1115` tratam sucesso e falha na retomada. Não foi criado Pix real nesta revisão.

**Teste isolado em 26/11/2026:** no cenário Pix simulado do checkout, substituí temporariamente `navigator` por objeto sem `clipboard` e acionei “Copiar código Pix”. Não apareceu mensagem de sucesso ou falha; a área de texto do código permaneceu presente. O teste passou e foi removido. Ele confirma ausência de feedback nesse caso específico, sem testar dispositivos reais nem rejeição assíncrona da API.

**Ação:** tornar o resultado da cópia perceptível e anunciado, oferecer orientação para seleção manual em caso de falha e manter consistência com a retomada. **Verificação:** simular cópia bem-sucedida, API ausente e rejeição em dispositivos e navegadores relevantes; verificar foco, anúncio e possibilidade de copiar manualmente, sem gerar pagamento real.

### F36 · P2 · Prazo e expiração do Pix pouco claros no checkout novo

**Evidência de código, não exercitada com pagamento real:** o painel Pix de `SinglePageCheckout.tsx:465–541` não exibe `expiresAt`, embora a tentativa possa conter esse campo e a tela de retomada o mostre em `CheckoutResumePage.tsx:1125`. O acompanhamento em `SinglePageCheckout.tsx:186–199` para a atualização automática quando o pedido está `expirado`, mas o texto da própria tela não possui ramo específico para esse estado; pode permanecer a mensagem genérica de acompanhamento, com link para detalhes. A resposta real do provedor e outros cenários de expiração ainda precisam de validação; não se afirma que um Pix vencido possa ser pago ou que uma cobrança seja criada.

**Teste simulado em 26/11/2026:** adaptei temporariamente o teste existente do checkout para retornar pedido `expirado` após um Pix pendente. O código Pix deixou de ser exibido, enquanto o título permaneceu “Acompanhando sua confirmação” e a descrição genérica de verificação continuou visível. O teste passou e foi removido; não houve pedido nem pagamento real. Essa sequência específica confirma a falta de mensagem de expiração e também a proteção que oculta o código no estado simulado.

**Ação:** quando houver prazo confiável, mostrar validade com fuso claro e, ao receber expiração autoritativa, informar o estado e próximos passos sem sugerir pagamento de código vencido. **Verificação:** simular prazo, expiração do pagamento e da pré-reserva, atraso e falha de consulta; conferir atualização, remoção ou indicação de código vencido e caminho seguro de recuperação.

### F37 · P1 · Retorno do checkout acessado por link direto reabre o checkout

**Confirmado em produção em 26/11/2026:** ao abrir diretamente `/checkout` com o imóvel LI23J, datas de 1 a 3/12/2026 e dois adultos, o botão “Voltar para acomodação” deixou a URL no checkout e, após breve carregamento, o diálogo de checkout reapareceu. Nenhuma reserva ou pagamento foi iniciado.

**Causa provável no código local:** `src/App.tsx:236–245` só volta no histórico quando existe o marcador de entrada do modal e, nos demais casos, apenas limpa os dados da reserva. A rota permanece `/checkout`, o que faz `src/hooks/useCheckoutDraftRecovery.ts:20–26` iniciar novamente a recuperação. A confirmação do código implantado e das demais variantes de histórico depende de comparação com o artefato de produção.

**Ação:** definir destino explícito para a acomodação quando não existir entrada anterior apropriada, preservando imóvel, datas e hóspedes. **Verificação:** abrir link direto em nova aba, usar botão e Escape, testar entrada pela acomodação, voltar e avançar no histórico, recarregar e conferir que não há reabertura involuntária nem perda do contexto.

### F38 · P2 · Resposta de ação iniciada em outra sessão pode deixar a conta atual carregando

**Evidência de código e teste isolado:** `src/hooks/useAccountActions.ts:53–76` aguarda o cancelamento e uma nova leitura antes de atualizar reservas, e `:81–101` aguarda a solicitação de acesso de proprietário antes de atualizar status e aviso. Esses callbacks capturam o token e os setters da sessão que iniciou a ação. Em `src/hooks/useAccountWorkspaceData.ts:62–77` e `:113–125`, os setters gravam o token capturado mesmo se o estado atual já pertencer a outra sessão. Em 26/11/2026, um teste temporário com respostas simuladas carregou a sessão antiga, guardou seus setters, carregou a sessão nova e executou os setters antigos: a lista da nova sessão ficou vazia e os indicadores de reservas e proprietário retornaram a carregamento. O teste passou ao demonstrar esse estado e foi removido depois da execução. Houve avisos de URL relativa de outra consulta no ambiente Node, sem relação demonstrada com o resultado. A notificação de solicitação também não está vinculada à sessão no callback. Não houve teste em produção nem evidência de exposição de dados ou alteração de reserva indevida.

**Ação:** associar cada resultado e aviso à sessão que o iniciou e descartar atualizações obsoletas, preservando a confirmação autoritativa da operação. **Verificação:** simular cancelamento e solicitação de proprietário pendentes, trocar a sessão, concluir primeiro as consultas da sessão nova e depois resolver ou rejeitar a ação antiga; conferir lista, aviso, status e carregamento da nova sessão. Cobrir também renovação de token, saída e falha de atualização, sem cancelar reservas reais.

**Confirmação adicional em testes isolados:** os dois hooks foram montados juntos, com APIs simuladas. Uma solicitação de proprietário da sessão antiga ficou pendente; após carregar uma nova sessão, sua resposta foi liberada. O status de proprietário da nova sessão passou para `loading` e o aviso de solicitação enviada apareceu na nova sessão. Em outro teste, um cancelamento simulado iniciado na sessão antiga foi resolvido após o carregamento da nova: suas reservas deixaram de aparecer e o indicador voltou a carregamento. Os testes temporários foram removidos depois de passar. Isso confirma essas sequências específicas; rejeições e renovação de token ainda precisam ser exercitadas. Nenhuma reserva real foi cancelada.

### F39 · P1 · Falha de consulta pode interromper acompanhamento automático do Pix sem aviso claro

**Evidência de código, não reproduzida com pagamento:** `SinglePageCheckout.tsx:173–203` interrompe a consulta periódica ao receber uma resposta diferente de `ready` ou uma exceção, e define `statusUnavailable`. Se a última tentativa Pix continuar pendente, `:385–389` mantém `pendingPix` e `:485–500` prioriza a mensagem de pagamento Pix, afirmando que a confirmação aparecerá na página. Nesse estado existe botão manual “Atualizar situação” e link de suporte, mas o texto não informa que o acompanhamento automático parou. Não se conclui que o pagamento ou a reserva tenham falhado, nem que houve perda financeira.

**Confirmado em teste isolado em 26/11/2026:** adaptei temporariamente o cenário Pix já existente em `tests/singlePageCheckout.test.ts:279–377`, com criação de pedido, pagamento e consulta simulados. Após o retorno `unavailable`, a interface continuou exibindo “Pague com Pix nesta página” e a promessa de confirmação na página; o título “Estamos conferindo seu pedido” não apareceu. A atualização manual foi então exercitada e a consulta simulada respondeu. O teste passou e o arquivo temporário foi removido. Isso reproduz a mensagem no frontend local, sem transação real e sem medir a duração da interrupção.

**Ação:** comunicar indisponibilidade e última atualização confiável, oferecer nova consulta e avaliar retomada automática com limites e tratamento de credenciais, sem sugerir repetição do pagamento. **Verificação:** simular Pix pendente seguido de erro temporário, resposta não pronta, recuperação e confirmação; conferir anúncio acessível, ausência de duplicação de pagamento e consistência com a página de detalhes.

**Comparação com a retomada:** `CheckoutResumePage.tsx:335–377` também encerra o ciclo periódico quando `resumeCheckout` retorna estado diferente de `ready`. Para `unavailable`, porém, `:667–683` troca o conteúdo por um alerta explícito e oferece “Tentar novamente”; a tentativa é manual. `checkoutApi.ts:796–831` transforma falhas de rede e respostas inválidas em `unavailable`. Assim, a recuperação comunicada difere entre as duas telas, mas nenhuma das duas garante retomada automática após falha. Essa comparação é leitura de código e não verifica o comportamento do provedor em produção.

### F40 · P2 · Acesso ao pedido em outro navegador perde o contexto ao encaminhar para login

**Evidência de código, sem teste de conta autenticada:** quando não há sessão nem token local, `CheckoutResumePage.tsx:649–663` orienta entrar na conta usada no pedido, mas o link leva apenas a `/`, sem referência de retorno ou abertura direta da autenticação. A pessoa precisa reencontrar o pedido após entrar ou voltar à URL anterior. Existe um caminho alternativo pela lista de viagens, que abre a referência em `TripsView.tsx:158`; a sua disponibilidade para o pedido em questão depende da conta e dos dados retornados. Não se conclui que o acesso ao pedido seja impossível.

**Confirmado em produção em 26/11/2026, sem autenticação:** uma referência fictícia de 40 caracteres abriu a mensagem de acesso; o link “Ir para a CRCN e entrar na minha conta” navegou para a página inicial, sem abrir o diálogo de login. Não foi acessado pedido real nem testado o retorno após autenticação.

**Verificação pontual por teclado:** após novo acesso à mesma rota fictícia, três pressões de Tab alcançaram, em ordem, preferências de medição, link da marca e link para entrar na conta. O link principal de recuperação é, portanto, alcançável nessa sequência; isso não verifica foco visível, leitores de tela, outros estados ou dispositivos.

**Ação:** preservar uma referência interna validada e conduzir a pessoa do login à retomada, sem colocar credenciais na URL e sem revelar existência de pedido a terceiros. **Verificação:** simular acesso em navegador sem token, login com conta correspondente e não correspondente, cancelamento do login, falhas de sessão e retorno pelo histórico; conferir também a alternativa da lista de viagens e acessibilidade do foco.

### F41 · P1 · Falha pontual de carregamento na página de acompanhamento

**Observado em produção em 26/11/2026, com referência fictícia:** em uma navegação para `/checkout/` seguida de 40 caracteres, o HTML respondeu 200, mas o JavaScript `/assets/index-Bb5J9atl.js` indicado pela página respondeu 404; a tela ficou vazia após cinco segundos. Na tentativa seguinte, a mesma rota respondeu 504 após cerca de 30 segundos. Uma consulta posterior por `curl` à página inicial e outra à rota de acompanhamento retornaram 200. Em uma navegação anterior, a tela de recuperação havia aberto normalmente. São amostras pontuais: não demonstram frequência, duração do incidente, causa, relação entre as duas falhas ou impacto em pedidos reais.

**Ação:** investigar consistência entre HTML e artefatos publicados, cache, implantação e disponibilidade da origem, correlacionando registros e versões sem expor credenciais. Planejar prevenção de referências a assets indisponíveis e uma recuperação legível para falhas de carregamento, além de monitoramento da rota. **Verificação:** testar implantações e cache com HTML anterior e novo, recursos ausentes e retorno 5xx, inclusive reabertura e histórico; acompanhar saúde e latência por janela representativa. Não iniciar pedido nem pagamento para esse teste.

**Proteções já presentes no código local:** `Dockerfile:30–38` combina os assets da imagem anterior e do build atual; `docker/merge-static-assets.mjs` mantém os anteriores por 30 dias e rejeita colisões de conteúdo. O workflow `release-image.yml:234–274` procura a imagem anterior e força a reconstrução dessa etapa; os testes de contêiner verificam o asset do HTML e políticas de cache (`docker/check-static-assets.sh`). Essa leitura mostra proteções planejadas, não prova que a imagem em produção as contenha ou que a imagem anterior correta tenha sido usada. Investigar o digest efetivamente implantado, manifesto de retenção e logs do deploy antes de supor cache ou ausência da proteção como causa.

**Nova consulta pública às 21:07 UTC:** o mesmo arquivo que havia retornado 404 respondeu 200 com `Cache-Control: public, max-age=31536000, immutable` e `CF-Cache-Status: MISS`; a rota fictícia de acompanhamento respondeu 200 com `Cache-Control: no-cache, private` e `CF-Cache-Status: DYNAMIC`. Isso mostra recuperação naquela amostra, mas não identifica a origem do 404 nem explica o 504 anterior. Não foram consultadas credenciais ou dados de pedidos.

### F42 · P2 · Busca pelo modal não emite o mesmo evento da barra principal

**Evidência de código, sem auditoria de tags externas:** `StaysSearchWidget.tsx:1149–1155` emite `search` antes de chamar a busca. Já `SearchModal.tsx:213–247` aplica os filtros e chama a mesma busca ao confirmar, sem emitir esse evento; a função compartilhada em `useAccommodationSearch.ts` também não o emite. A variante do widget incorporada no modal mantém sua própria emissão, portanto a diferença depende do caminho usado. A configuração do GTM e outros instrumentos não foram auditados, logo não se conclui a quantidade de buscas ausentes nos relatórios de produção.

**Confirmado em sessão isolada na interface de produção:** com as duas escolhas simuladas no armazenamento e o carregamento externo do GTM bloqueado, o elemento de tag estava presente. Confirmar “Buscar Reserva” no modal iniciou uma nova requisição `/api/search`, mas não acrescentou evento `search` ao `dataLayer` observado. A primeira tentativa não conseguiu clicar durante a estabilização da interface; a repetição com espera acionou a busca. Não houve envio ao GTM e a observação não audita outras tags ou relatórios.

**Comparação da barra principal:** nas mesmas condições isoladas e com GTM externo bloqueado, o botão “Buscar hospedagens” iniciou uma requisição e acrescentou um evento `search` ao `dataLayer`. Isso confirma a diferença entre os dois caminhos observados, sem demonstrar a entrega a destinos externos.

**Ação:** definir o significado de uma busca iniciada, instrumentar o ponto comum ou seus caminhos de forma consistente e evitar duplicidade na variante incorporada; respeitar as escolhas de medição. **Verificação:** simular confirmação pela barra principal e pelo modal, busca sem datas, limpar filtros, retorno pelo histórico e retry; comparar um evento por ação definida, parâmetros e ausência de emissão sem consentimento aplicável.

### F43 · P2 · Início de checkout mede clique no imóvel, não todas as entradas na tela

**Evidência de código:** `useAppOverlayActions.ts:52–57` emite `begin_checkout` quando a pessoa inicia a reserva no detalhe. A recuperação por URL ou rascunho em `useCheckoutDraftRecovery.ts:20–99` recompõe o checkout sem passar por esse callback; não há outro emissor desse evento no código pesquisado. Portanto, o evento da aplicação descreve um clique de início, e não todas as aberturas do checkout. Isso pode ser uma definição válida, mas não deve ser usado como contagem de visitas à tela sem validar a semântica. Tags externas e relatórios efetivos não foram auditados.

**Ação:** definir separadamente clique de início, carregamento concluído e retomada, mantendo identificador não pessoal e consentimento aplicável. **Verificação:** comparar detalhe → checkout, link direto, recarga, retorno pelo histórico e recuperação após falha; evitar contar a mesma transição duas vezes e reconciliar métricas com as definições de produto.

### F44 · P2 · Valor do evento de compra representa cotação, não necessariamente pagamento total

**Evidência de código:** `measurementEvents.ts:52–89` usa `order.quoteTotal` como `value` de `purchase`. No checkout, o resumo de cartão inclui acréscimo (`SinglePageCheckout.tsx:910–930`), e o serviço Cielo registra separadamente valor base, taxa e total da tentativa (`CieloCheckoutPaymentService.php:329–346`). Assim, quando houver acréscimo, o valor da cotação e o total do pagamento podem diferir. Isso não demonstra erro de cobrança: a questão é qual valor os relatórios devem representar. A configuração efetiva das tags e os relatórios não foram auditados.

**Ação:** definir com produto e financeiro se o indicador representa hospedagem, valor pago ou receita, documentar taxas e moeda e obter o valor apropriado de fonte confirmada, sem alterar a ênfase visual da parcela. **Verificação:** simular compras confirmadas Pix, cartão à vista e parcelado, comparar cotação, taxa, tentativa aprovada e evento, incluindo arredondamento, estorno e reconciliação com backend; evitar registrar dados do pagador ou pagamento pendente como compra.

### F45 · P2 · Descrição e composição das camas dificultam entender o imóvel

**Observado em produção em 26/11/2026:** no imóvel LI23J, a descrição exibiu trechos concatenados como “auxiliar solteiro- ar-condicionado” e “TV LCDItens de”; a seção “Onde você vai dormir” mostrou “1 cama, 1 cama”, enquanto o resumo indicava quatro camas. Essa observação não determina se a origem é o cadastro, o processamento dos dados ou a apresentação, nem comprova uma contagem incorreta da acomodação.

**Evidência de código:** `PropertyOverviewSection.tsx:24–45` formata a descrição com substituições de texto e `:150–165` apresenta `room.bedType` diretamente. A revisão deve comparar o dado original com a resposta da API e a tela antes de decidir onde corrigir; não inferir o tipo ou a quantidade de camas a partir de texto incompleto.

**Comparação com API pública em 26/11/2026:** a resposta de `/api/accommodations/LI23J` já trazia `beds: 4`, `sleepingArrangements` com `bedType: "1 cama, 1 cama"` e a descrição com os trechos concatenados. Isso localiza a inconsistência na resposta ou em etapas anteriores à renderização; não permite distinguir cadastro original de transformação do backend. O componente ainda precisa ser avaliado quanto à apresentação, mas não se deve atribuir a origem do texto apenas ao frontend.

**Transformação identificada no código local:** `AccommodationController.php:105–111` monta cada descrição a partir de `room.beds`, usando quantidade padrão 1 e tipo padrão “cama” quando os campos faltam; se a lista resultar vazia, usa “1 cama de casal”. Esses fallbacks podem apresentar dados não confirmados como específicos. Não foi inspecionada a resposta privada da Stays para LI23J nem comprovado que o deploy use a mesma versão, portanto a causa exata do exemplo permanece aberta. Testar ausência, formato alternativo e quantidades reais da origem antes de substituir os padrões.

**Cobertura a acrescentar na correção:** o teste de detalhe em `tests/Feature/AccommodationApiTest.php:260–301` usa resposta de quartos vazia e verifica imagens, sem exercitar um quarto com lista de camas ausente ou com campos parciais. Preparar respostas fictícias da integração para quarto sem camas, sem tipo, sem quantidade e com múltiplos tipos; conferir a resposta pública, a apresentação e a consistência com o total informado. Decidir um texto de informação indisponível com produto e validar que nenhum valor padrão é apresentado como fato confirmado.

**Ação:** corrigir a origem ou a transformação identificada, apresentar tipos e quantidades de camas compreensíveis e preservar dados sem inventar informação ausente. **Verificação:** comparar imóveis com uma e várias camas, beliches, camas auxiliares, conteúdo HTML e pontuação irregular; validar consistência entre resumo, quartos e descrição com o responsável pelo cadastro.

### F46 · P2 · Indicador de seleção sobrepõe o texto do cartão no checkout estreito

**Observado em produção em 26/11/2026:** com viewport de 320 × 400 e cartão selecionado, o círculo com marca de seleção encobriu parte da palavra “Cartão”. A captura mostra a colisão visual mesmo que a comparação geométrica de elementos interativos não tenha encontrado interseções entre botões: o indicador é um pseudo-elemento dentro do próprio botão. O nome acessível permaneceu “Cartão, processado pela Cielo” e o estado estava marcado como pressionado; não foi feito teste com leitor de tela.

**Comparação na mesma dimensão:** ao selecionar Pix, o indicador não sobrepôs o texto visível “Pix” na captura, e o botão apresentou `aria-pressed=true`. Isso delimita essa amostra; outros tamanhos e traduções ainda precisam de verificação.

**Altura adicional:** em 320 × 700, após selecionar cartão novamente, a captura também mostrou a marca sobre a palavra “Cartão”. O defeito foi observado nas duas alturas testadas com 320 px de largura; isso não determina um breakpoint exato.

**Varredura geométrica pontual:** em 700 px de altura, calculando a posição horizontal do `::after` e da caixa do texto no mesmo navegador, houve interseção aproximada de 9,7 px em 320 e 4,7 px em 330; não houve interseção horizontal nas amostras de 340, 350, 360, 375, 390 e 414 px. São medidas para a fonte e o estado carregados nessa sessão, não um limite universal; zoom, idioma e outras fontes podem alterar o resultado.

**Causa compatível no código local:** `src/index.css:749` posiciona o indicador em `::after`, enquanto os dois métodos dividem a largura em `SinglePageCheckout.tsx:689`. A relação com o artefato implantado ainda não foi confirmada. **Ação:** reservar espaço para o indicador ou ajustar a disposição sem prejudicar o nome e estado acessíveis. **Verificação:** 320 e 375 px, zoom de 200%, texto longo e ambos os métodos selecionados; conferir também foco, alvo de toque e altura reduzida.

### F47 · P1 · Diálogos de checkout e imóvel impedem foco no painel de medição

**Reproduzido na interface de produção em 26/11/2026:** com o checkout aberto em 320 × 400, reabri as preferências pelo evento usado pela aplicação, sem alterar a escolha salva. A tentativa de focar o título do painel devolveu o foco ao link da marca dentro do checkout; ao pressionar Tab, o foco passou para “Voltar para acomodação”, não para os controles de preferências. O painel estava visível sobre o checkout. Isso confirma o conflito nessa sequência; o uso com leitores de tela precisa de teste específico.

**Primeira visita confirmada em contexto isolado:** em uma nova sessão sem preferências anteriores, a abertura direta do checkout mostrou o painel de medição. Ao terminar a abertura, o foco estava no link da marca dentro do checkout e o Tab seguinte foi para “Voltar para acomodação”, fora do painel. O contexto foi encerrado sem salvar escolha ou iniciar reserva. Não foi testado leitor de tela.

**Percurso adicional:** em outra sessão isolada equivalente, 50 pressões de Tab não levaram o foco a nenhum controle dentro da região de preferências. A verificação mede apenas esse percurso no navegador e viewport testados; não comprova comportamento de todos os atalhos de tecnologia assistiva.

**Detalhe do imóvel:** em outra primeira visita isolada, a 375 × 667, abri diretamente LI23J com datas e hóspedes. O painel de medição estava visível sobre o diálogo do imóvel, e 50 pressões de Tab também não alcançaram sua região. Nenhuma escolha foi salva. A evidência amplia o conflito à combinação observada de imóvel e preferências, sem generalizar para todos os diálogos.

**Causa compatível no código local:** `MeasurementPreferences.tsx:52–64` tenta focar o título fora do checkout, enquanto `useDialogFocus.ts:94–96` redireciona foco externo ao diálogo ativo. O painel de medição não é identificado como portal pertencente a esse diálogo. Não se comprova por essa leitura a versão do código implantado. **Ação:** coordenar a camada ativa e seu foco com o checkout, preservando escolhas e retorno ao elemento adequado. **Verificação:** primeira visita e reabertura sobre checkout e outros diálogos, Tab/Shift+Tab, ativação das três opções planejadas, retorno de foco, rolagem e tecnologia assistiva; verificar que não haja consentimento implícito ou alteração de escolhas ao fechar.

**Implementação em revisão:** o painel fixo agora é marcado como portal de foco, então o gerenciamento existente de checkout e detalhe o reconhece dentro da camada ativa; o painel de preferências embutido em páginas legais fica fora desse contrato. Testes verificam a marcação condicional e a navegação por teclado do mecanismo de portais já usado pelos diálogos. Não foi adicionada persistência nem mudança nas escolhas. Testes combinados de navegador, Escape/fechamento e leitor de tela ainda pendentes. PR #87, base `codex/ux-search-flow`.

### F48 · P2 · Detalhes do condomínio não oferecem caminho direto às acomodações

**Observado em produção em 26/11/2026:** no diretório `/condominios`, abrir “Ver detalhes de Aquarius Flat” mostrou fotos e descrição em um diálogo, mas não apresentou ação para ver as acomodações associadas. O cartão de origem oferece o link “Ver condomínio e acomodações”, que fica atrás do diálogo; a pessoa precisa fechá-lo e escolher esse outro controle. Não foi medido se usuários encontram esse caminho ou se isso afeta conversão.

**Evidência de código:** `CondominiumDetailModal.tsx` recebe o resumo e `onClose`, exibindo descrição e galeria sem ação de navegação; `CondominiumDirectory.tsx` fornece o link no cartão. **Ação:** avaliar ação explícita no detalhe para avançar às acomodações do condomínio, preservando datas e hóspedes quando houver contexto; validar destino e dados disponíveis antes de escolher a navegação. **Verificação:** abrir pelo cartão e teclado, avançar e voltar, testar condomínio sem anúncios, com pesquisa ativa e em janela pequena; conferir rótulo, foco e histórico.

**Galeria e foco em produção:** no mesmo condomínio, a galeria abriu com nome acessível; a seta direita avançou para a segunda de 12 fotos. Escape fechou a galeria e devolveu o foco a “Mostrar todas as 12 fotos”; um segundo Escape fechou o detalhe e devolveu o foco ao controle que o abriu. Essa proteção deve ser preservada, sem presumir cobertura de leitor de tela ou outras combinações.

### F49 · P2 · Jornada pelo condomínio perde datas e hóspedes selecionados

**Confirmado em produção em 26/11/2026:** ao abrir `/condominios` com datas de 1 a 3/12/2026 e dois adultos, o link “Ver condomínio e acomodações” de Aquarius Flat apontava para uma URL sem parâmetros. A página do condomínio também apresentava links de imóvel sem esses parâmetros. Ao abrir o apartamento LG02J, a URL não continha a viagem e o detalhe pediu “Confirme as datas”. Nenhuma reserva foi iniciada. A observação cobre esse caminho, não todos os links do diretório ou outras formas de navegação.

**Pontos de passagem no código local:** `CondominiumDirectory.tsx:206–211` usa `condominium.pageUrl` diretamente; na página renderizada pelo servidor, `resources/views/seo/condominium.blade.php:27–28` usa `listingPath` nos links de cada imóvel. A correção precisa cobrir as duas etapas e verificar os demais links da página, mantendo URLs canônicas e dados válidos. A correspondência exata com a versão implantada permanece não comprovada.

**Ação:** definir uma passagem segura do contexto de viagem por diretório, página de condomínio e imóvel, validando parâmetros e permitindo confirmação pelo usuário; não presumir disponibilidade nem preço ao recuperar os dados. **Verificação:** datas e hóspedes válidos, ausência ou parâmetros inválidos, navegação direta, retorno e atualização; conferir que o imóvel revalida preço e disponibilidade e que filtros não são carregados indevidamente.

### F50 · P2 · Filtro apenas de preço máximo pode incluir imóvel sem preço

**Evidência de código e teste isolado:** sem datas, `propertySearchFilters.ts:44–55` compara `property.pricePerNight` diretamente aos limites. A apresentação em `propertyDisplayPrice.ts` trata preço não positivo como ausência de preço. Em um cenário fictício com preço `0` e apenas máximo de R$ 1.000, a função de filtro incluiu o imóvel; ao definir mínimo de R$ 1, excluiu-o. Assim, preço desconhecido pode ser tratado como zero para o filtro máximo. A tentativa de reproduzir o caminho na interface de produção não chegou à aplicação do filtro; não se afirma frequência ou impacto real.

**Confirmação por URL em produção:** em sessão isolada, `/s/homes?price_max=1000` sem datas exibiu o cartão LG02J com a orientação “Pesquise as datas para ver o total da estadia”. A resposta pública do catálogo para esse ID tinha `pricePerNight: 0` e sem cotação calculada. Isso confirma a inclusão do imóvel sem preço naquele caminho e amostra; não prova que a diária real supere o limite escolhido. A tentativa anterior pelo diálogo não chegou à aplicação do filtro.

**Comparação com mínimo de R$ 1:** em outra sessão isolada, `/s/homes?price_min=1&price_max=1000` não exibiu LG02J e mostrou “Nenhum imóvel corresponde a esses filtros”. Como o preço do catálogo não estava informado, a mensagem pode ser interpretada como uma conclusão sobre preços que não foram verificados. A amostra não demonstra que existam imóveis com diária dentro dessa faixa; a ação deve comunicar a falta de dados sem prometer resultados.

**Ação:** definir comportamento explícito para preço desconhecido em filtros, coerente com o rótulo e a ausência de cotação; não inventar preço nem ocultar essa limitação. **Verificação:** sem datas, preços desconhecidos e válidos com limites mínimo, máximo e ambos; com datas, cotação válida e expirada; conferir mensagens, contagem e retorno ao limpar filtros em interface e testes de domínio.

### F51 · P1 · Política de privacidade proposta para o painel está indisponível

**Confirmado em produção em 26/11/2026:** a rota pública `/privacidade` respondeu HTTP 404 e apresentou “Página indisponível”; a consulta a `/api/public/legal-pages/privacidade` também respondeu 404. O painel atual não oferece esse link, mas o usuário solicitou acesso à política no redesenho e o endereço havia sido proposto neste relatório. Não se conclui por essas respostas se há documento publicado em outro endereço, nem se a ausência é temporária ou intencional.

**Índice público:** na mesma data, `/api/public/legal-pages` retornou apenas o contrato de locação, sem entrada de privacidade. Isso verifica o índice fornecido pela aplicação naquela consulta, não exclui a existência de política em serviço ou endereço externo.

**Regra de publicação local:** `LegalPageRegistry.php:76–140` só retorna páginas publicadas com dados, seções e aprovações válidas para a versão e conteúdo. A auditoria anterior `docs/auditoria-checkout-e-plano-de-lancamento.md:62` já apontava pendência de publicação e aprovação desses documentos. Isso não identifica a configuração atual de produção. A solução precisa respeitar o processo de revisão e aprovação aplicável, sem apenas forçar a rota a responder 200.

**Evidência de código local:** `PublicLegalPageController.php:19–23` retorna 404 quando o registro não contém a página; `LegalDocumentPage.tsx:16` depende da API. Não foi verificado o registro ou a versão implantada. **Ação:** identificar e validar com os responsáveis o documento público correto, seu conteúdo e publicação, e vincular o painel ao destino funcional; evitar incluir link quebrado. **Verificação:** GET direto e navegação pelo painel, título e conteúdo, falha e recuperação, versão e atualização, teclado e mobile; confirmar também o comportamento caso o documento deixe de estar disponível.

### F52 · P2 · Exportação financeira pode interpretar texto como fórmula em planilhas

**Evidência de código:** `src/components/owner/OwnerAccountingTransactions.tsx:26,116–134` envolve as células do CSV em aspas e duplica aspas internas, mas não neutraliza prefixos que aplicativos de planilha podem interpretar como fórmulas. A exportação inclui título do imóvel, código da reserva, descrição e observação pública. Em `app/Http/Controllers/Api/OwnerDashboardController.php:129–145`, descrição e observação podem vir dos dados de contas da integração; não foi comprovado quem consegue inserir esses valores nem que exista dado malicioso em produção. Aspas CSV garantem estrutura, mas não necessariamente impedem interpretação posterior como fórmula.

**Impacto condicional:** se um desses campos contiver conteúdo interpretável como fórmula e o arquivo for aberto em um aplicativo que o execute, o relatório pode apresentar cálculos inesperados ou, conforme a fórmula e o aplicativo, acionar recursos externos. A revisão não abriu um arquivo malicioso e não demonstra exploração ou efeito em produção.

**Ação:** definir política de exportação de texto que neutralize interpretações de fórmula, preservando os valores numéricos como números e sem alterar os dados de origem. **Verificação:** gerar CSV com valores simulados iniciados por `=`, `+`, `-`, `@`, tabulação e espaços, além de aspas, quebras de linha e acentos; conferir integridade das colunas e abertura segura nos aplicativos de planilha suportados. Testar também totais negativos e decimais para evitar corromper valores legítimos.

### F53 · P2 · Reserva sem imóvel no catálogo pode mostrar foto de outra acomodação

**Evidência no código local:** `GuestReservationController.php:333–344` procura a acomodação no catálogo estático e, se ela não for encontrada ou não tiver imagem, usa a imagem do primeiro imóvel do catálogo. `TripsView.tsx:520–523` exibe essa imagem junto do título da reserva. No arquivo local consultado, o catálogo tinha 19 registros e o primeiro, JQ08G, tinha imagem. Para uma reserva de outro imóvel ausente do catálogo, essa lógica pode associar a foto de JQ08G a ela. Não foi examinada uma reserva real nem demonstrada a frequência dessa condição em produção.

**Ação:** usar imagem apenas quando houver associação confirmada com a acomodação; caso contrário, exibir uma alternativa neutra e acessível. **Verificação:** simular reserva de imóvel conhecido com foto, conhecido sem foto e ID não encontrado; comparar cartão e alternativa visual, inclusive carregamento falho, sem usar dados reais.

### F54 · P2 · Total ausente de reserva pode aparecer como valor zero

**Evidência no código local:** `GuestReservationController.php:336` usa zero quando ambos os campos de preço consultados estão ausentes; `TripsView.tsx:578,630,796` apresenta esse número como total nas viagens e no comprovante. A ausência de preço e um total efetivamente igual a zero ficam indistinguíveis nessa resposta. Não foi consultada reserva real para estabelecer se a integração envia esses campos em todos os casos, nem foi observado valor incorreto em produção.

**Ação:** preservar a distinção entre valor ausente e valor confirmado, mantendo compatibilidade da API e identificando a moeda e fonte do valor antes de apresentá-lo em comprovante. **Verificação:** simular valores ausentes, zero confirmado, valor positivo e resposta inválida; conferir cartão, comprovante e acessibilidade, sem criar ou modificar reserva. Investigar também a moeda de origem antes de propor conversão.

### F55 · P1 · Abertura direta dos painéis da busca não desloca o foco para seus controles

**Observado em produção:** a 640 × 300 CSS px, com foco no botão “Quem”, pressionar Enter abriu o painel, mas o foco permaneceu no acionador. As sete pressões de Tab seguintes passaram pelo botão de busca, filtros e cartões da página, sem entrar no painel, que ainda estava aberto. Em outro teste local a 1280 × 800, a abertura por Enter também deixou foco em “Quem”; o primeiro Tab foi para “Buscar hospedagens” com o painel ainda aberto. Os testes começaram com foco programaticamente no acionador, e não cobrem todo o percurso desde o início da página nem leitor de tela.

**Outros segmentos, primeira abertura local:** a 1280 × 800, em recargas independentes com foco no acionador e Enter, “Onde”, “Quando” e “Quem” abriram seus respectivos painéis, mas mantiveram o foco no acionador; Tab seguiu respectivamente para “Quando”, “Quem” e “Buscar”. Isso amplia o mesmo padrão aos três segmentos nessa amostra, sem afirmar que os controles internos sejam inalcançáveis por todos os meios. Em produção, em recargas independentes na mesma dimensão, a sequência também manteve foco no acionador dos três painéis e o Tab seguiu para o próximo segmento ou para “Buscar”. As sessões foram fechadas.

**Percurso adicional em produção:** a 1280 × 800, após abrir “Quem” com Enter a partir do acionador, 100 pressões de Tab não alcançaram nenhum controle do painel, que permaneceu aberto durante a sequência. Os primeiros focos foram busca, filtros e um cartão da página. Isso demonstra dificuldade nessa sequência, sem provar que nenhum outro atalho ou meio de navegação permita alcançar o painel. O navegador foi fechado.

**Condomínio e datas em produção:** em sessões recarregadas a 1280 × 800, a mesma sequência de abertura com Enter e até 100 pressões de Tab não alcançou controles dentro dos painéis de condomínio ou de calendário, que permaneceram abertos. Combinado com a amostra de hóspedes, o percurso limita o acesso por teclado a etapas centrais da busca; por isso F55 foi elevado a P1. Não foram testados todos os atalhos ou tecnologias assistivas. O navegador foi fechado.

**Comparação local de montagem:** a 1280 × 800, abrir hóspedes por Enter, fechar com Escape, aguardar o fechamento e abrir novamente deixou o foco em “Quem” nas duas aberturas. Em outra sessão, abrir condomínio, selecionar “Todos os condomínios” e trocar diretamente do calendário aberto para “Quem” colocou o foco em “Aumentar adultos”. A diferença é compatível com uma dependência da montagem do portal, mas não prova a causa nem reproduz todas as transições. As sessões foram fechadas.

**Evidência de código e hipótese:** `StaysSearchWidget.tsx:1000–1045` tenta focar o primeiro botão habilitado em um `requestAnimationFrame`, enquanto a visibilidade do portal é estabelecida pelo mesmo efeito. Uma corrida de montagem é uma possibilidade, não uma causa comprovada; a versão implantada também não foi identificada. **Impacto:** a pessoa que abre a escolha por teclado não recebe acesso imediato aos contadores e pode seguir pela página enquanto o painel permanece visível. **Ação:** associar foco ao painel efetivamente montado e definir comportamento coerente de Tab, Shift+Tab e saída, sem exigir que um painel não modal prenda o foco. **Verificação:** abertura por Enter e Espaço, primeira abertura e reabertura, retorno de datas e troca de painéis, Tab e Shift+Tab, Escape, rolagem e alturas reduzidas em desktop, além de teste com tecnologia assistiva.

## Cruzamento com o PR #81

Em 26/11/2026, o PR [#81](https://github.com/centraldereservascaldas/hospeda-reservas/pull/81) estava aberto, com destino `main` e head `d3b906c10607766d43154556a66b2c91e1c94c50`. Sua base `77d6597ab459ad4132148e790df3f84d07b387ff` já inclui o PR #80 e é posterior ao código `7e5d1f2` desta revisão. A análise abaixo refere-se a essa versão específica, não comprova implantação ou correção em produção.

| Item | Relação com o PR | Próxima validação |
| --- | --- | --- |
| F18 e F19 | O componente remove as consultas e cotações automáticas dos cartões que originavam esses caminhos. A solução substitui o comportamento anterior; os achados deixam de se aplicar àquele código caso o PR seja integrado. | Testar carregamento, erro, ausência de resultados e recuperação da busca iniciada pelo cartão; não marcar resolvido na produção antes de implantação e verificação. |
| F16 | `formatPeriod` continua mostrando dia e mês sem ano, tanto no texto como no nome acessível do cartão. | Mostrar o ano quando necessário e testar datas do ano seguinte e travessia de ano. |
| F03, F06, F17 e F55 | O PR não modifica o seletor compartilhado da busca; o PR #80 modificou estilos desse componente. | Reproduzir cada problema na base mais recente e no PR, pois o diff sozinho não prova o comportamento visual. |
| Imóvel apresentado | O cartão sazonal exibe foto e título do imóvel, mas chama `onSelect` com datas e hóspedes sem identificador do imóvel. Cartões de outras coleções usam `onOpenProperty`. | Definir a intenção e testar se o resultado corresponde à expectativa gerada pelo cartão, inclusive imóvel indisponível. |
| Pets | A escolha do cartão inclui ao menos um pet, mas não passa categoria `pet_friendly`; a consulta usa a contagem de pessoas e o filtro local avalia a categoria já existente, não o número de pets. | Simular resultados que aceitam e não aceitam pets, testar categoria anterior e decidir o contrato da busca. O risco é de código, não foi reproduzido na interface do PR. |
| Movimento reduzido | A nova seta do carrossel chama `scrollBy` com comportamento `smooth` sem consultar a preferência. | Validar o movimento computado e real sob `prefers-reduced-motion`, inclusive teclado e mobile. |

No checkout isolado desse head, `npx tsx --test tests/seasonalDateSuggestions.test.ts tests/homeDateSuggestions.test.ts tests/mainContentRouter.test.ts` passou 22 testes. Eles incluem ausência de consultas automáticas e parâmetros básicos ao clicar, mas não comprovam os resultados da busca, filtragem de pets, o destino do cartão ou a experiência visual. Os checks do GitHub ainda estavam em execução na última consulta. Não houve merge ou mudança de produto nesta revisão.

## Plano de investigação e correção por ondas

As caixas abaixo são trabalho futuro. Uma onda só avança para implementação com escopo e validação definidos; itens ainda classificados como risco exigem reprodução antes de assumir defeito.

Em 26/11/2026, a conferência de rastreabilidade encontrou referências diretas aos 54 achados atuais nas caixas das ondas. F08 foi retirado dos achados por decisão de produto; a numeração foi preservada para não mudar as demais referências. A presença de um identificador no checklist não comprova que a correção ou sua validação tenham sido executadas.

### Primeira triagem dos itens P1

| Item | Evidência | Próximo passo de correção |
| --- | --- | --- |
| F01 · Calendário da busca | Reproduzido por teclado em produção. | Tornar dias navegáveis e testar seleção, meses e foco. |
| F21 · Foco na recuperação | Reproduzido por teclado em produção. | Isolar o fundo e posicionar foco nas ações, coordenando com F23. |
| F37 · Retorno do checkout direto | Reproduzido em produção. | Definir retorno ao imóvel com viagem preservada e testar histórico. |
| F39 · Acompanhamento Pix | Reproduzido em teste local com consulta simulada. | Comunicar falha e recuperar consulta sem induzir novo pagamento. |
| F41 · Tela vazia e 504 | Observados pontualmente em produção; causa desconhecida e resposta posterior bem-sucedida. | Investigar artefato, cache, deploy e origem antes de escolher a correção. |
| F47 · Preferências e foco | Reproduzido em primeira visita isolada no checkout e no imóvel, e na reabertura sobre checkout; marcação de portal e contrato de navegação por teclado verificados em testes. | Em revisão no PR #87; fluxo combinado e leitor de tela pendentes. |
| F51 · Política de privacidade | Rota e API responderam 404 na amostra em produção. | Identificar documento correto e publicar destino acessível antes de vinculá-lo no painel. |
| F55 · Foco nos painéis da busca | Abertura por Enter e percurso de 100 Tabs não alcançaram os controles dos três painéis nas amostras em produção. | Garantir foco inicial e navegação coerente, testando abertura, troca e saída de cada painel. |

As prioridades indicam impacto potencial na tarefa, não frequência medida. F41 não deve ser tratado como causa confirmada de F23; são observações distintas. A decisão de produto sobre destaque de parcelas foi retirada dos achados e não entra nesta triagem.

### Organização sugerida das sprints

| Sprint | Entrega verificável | Dependência principal |
| --- | --- | --- |
| 1 | Datas acessíveis, foco da recuperação, hóspedes consistentes, informação de cotação válida e recuperação de sugestões (F01, F04, F05, F16, F18, F19, F21, F28, F50) | Definir regra de contagem e apresentação da cotação expirada. |
| 2 | Painéis não encobrem conteúdo nem sobrevivem a mudanças de contexto; transição de datas para hóspedes (F02, F03, F06, F07, F10, F17, F55) | Mapear foco, ancoragem, camadas e comportamento em rolagem antes de extrair código compartilhado. |
| 3 | Imóvel e checkout preservam viagem, recuperam falhas e oferecem escolhas de medição claras (F09, F15, F20, F22–F27, F29–F37, F39–F47, F51) | Definir contrato de aceite, confirmar taxas locais, mapear destinos de medição e medir a jornada antes de alterar a arquitetura. |
| 4 | Componentes, camadas e tokens extraídos conforme contratos comprovados | Inventariar repetição real e aproveitar o aprendizado das jornadas anteriores; executar gradualmente. |
| 5 | Favoritos e conta preservam escolhas, painel do proprietário mostra período correto e diretório oferece continuidade (F11–F14, F38, F48–F49, F52–F54) | Isolar fontes de favoritos e preparar respostas simuladas para corrida e falha; reservar acesso para validação das áreas restritas. |

Critério comum de conclusão para cada sprint: casos de reprodução do achado passam, estados de carregamento/vazio/erro aplicáveis têm recuperação, navegação por teclado e foco foram conferidos, layout foi verificado em tamanhos pertinentes e o resultado foi registrado. A matriz completa de dispositivos, leitores de tela e validação com usuários precisa ser planejada conforme acesso; uma captura isolada não substitui essas verificações. A lista de larguras é cobertura proposta, não alegação de dispositivos oficialmente suportados.

A ordem das sprints é uma proposta, não uma dependência rígida entre todas as tarefas. F01 e F21 têm prioridade P1; a correção de foco em F21 deve ser coordenada com a possível página independente de F23 para evitar retrabalho. A hierarquia de destaque da parcela é uma decisão de produto aprovada. F22 exige confirmação das regras do imóvel, F15 exige decisão sobre o aceite e F25 continua condicional à forma como cada ambiente normaliza a URL.

**Sequência sugerida dentro das ondas:** primeiro tornar datas, painéis, recuperação e preferências utilizáveis por teclado (F01, F21, F47, F55), e tratar o retorno direto do checkout (F37) e a comunicação de falha no acompanhamento Pix (F39). Em paralelo, tratar contagem, transição e painéis que ficam sobrepostos (F05, F02, F03, F06, F17); coordenar recuperação, erros e carregamento do checkout com F20, F23, F24, F26 e F30. Os testes locais de F35, F36 e F39 cobrem cenários específicos simulados; os demais estados do provedor e a correção futura exigem validação adicional. As preferências e métricas (F31–F34 e F47) devem ser definidas juntas para que o novo painel reflita a instrumentação efetiva. F04, F19 e F29 exigem preservar validação de dados e não substituir preço ou hóspedes silenciosamente. Favoritos, conta e proprietário continuam no escopo da onda 5; a posição na tabela não impede antecipar uma correção independente.

### Onda 1 · Jornada bloqueada e integridade da busca

- [ ] F01 implementado no desktop: dias disponíveis entram na ordem de Tab e setas movem o foco entre datas, incluindo virada de mês. Código inicial no commit `55bf827`; complemento de foco no commit `5771e0c`. Testes e navegador desktop passaram. Validação móvel, seleção por Enter e fechamento por Escape no calendário permanecem pendentes.
- [ ] Corrigir foco e isolamento do fundo na tela de recuperação de checkout (F21).
- [ ] Reproduzir F05 com bebês, crianças e pets; alinhar composição, URL e parâmetros de busca.
- [ ] Alinhar os limites de pets da interface, URLs e validação de reserva após definir a regra de negócio (F28).
- [ ] Identificar e comunicar preço expirado (F04), com atualização e estados de falha.
- [ ] Definir e testar preço desconhecido no filtro de faixa e sua comunicação na lista (F50).
- [ ] Apresentar o ano de datas sazonais quando necessário (F16) e verificar expiração real antes de remover sugestões.
- [ ] Tratar carregamento, falha repetida e recuperação no cartão de sugestão para pets (F18).
- [ ] Revalidar sugestões ao retornar à aba após a expiração e encerrar corretamente consultas concluídas (F19).
- [ ] Validar que mudanças não alteram contratos de API e não apresentam disponibilidade vencida como confirmada.

### Execução da Goal · 26/11/2026

**Pacote F01 · teclado no calendário da busca.** Na base `origin/main` (`706a2f8`), o calendário do modal passava `focusDate={undefined}` e não tratava teclas nos dias. Agora cada mês visível expõe uma data futura disponível na ordem de Tab; as setas movem o foco por dia e mantêm o foco ao atravessar o limite do mês, incluindo a rolagem do intervalo visível. A escolha de data e as validações de busca permanecem inalteradas. Implementação e teste: commit `55bf827`.

**Validação:** teste direcionado `date calendar enters the Tab order and moves focus by day with arrow keys` passou; lint/TypeScript passou; build frontend/blog passou (com avisos já existentes sobre fonte e tamanho de chunk). No navegador local a 1200 × 885, abrir a aba “Datas” colocou foco em 26/11/2026; ArrowRight moveu para 27/11 e, ao focar 30/11 e pressionar ArrowRight, para 01/12. O catálogo estava em modo de simulação, mas a verificação só percorreu calendário e não consultou nem submeteu uma reserva. O arquivo inteiro `searchModalAccessibility.test.ts` permaneceu pendente no runner Node 26 sem reportar testes individuais; portanto foi usado o teste direcionado. Leitor de tela não testado.

**Pacote F55 · foco nos painéis compartilhados da busca.** A reprodução local a 1200 × 885 confirmou que Enter abria os painéis, mas deixava o foco nos acionadores. A causa estava no seletor do calendário, que encontrava primeiro a célula `div` em vez do botão de data; além disso, a tentativa de foco ocorria antes de o portal ser montado. O foco inicial agora acontece após a montagem visível do portal e seleciona um controle interativo: busca do condomínio, botão de data ou contador de adultos. Escape devolve foco ao segmento. Implementação/teste no commit `ff1172f`.

**Validação F55:** teste direcionado percorreu os três painéis, Escape e a transição condomínio → datas. No navegador local, abrir cada painel por Enter colocou foco em seu primeiro controle; Escape retornou ao acionador; escolher “Todos os condomínios” abriu o calendário e focou 26/11/2026. A interface indicava ambiente de simulação; nenhuma reserva ou consulta de disponibilidade foi enviada. Leitor de tela não testado; a validação responsiva móvel permanece na matriz da onda 5.

**Pacote F02/F03 · ciclo de vida e continuidade da busca.** Implementação e testes no commit `e214d24`. A origem do painel agora é fechada quando sai completamente da janela; uma busca válida também fecha o portal antes de chamar a navegação. A seleção do intervalo no desktop avança para hóspedes no mesmo painel e transfere foco ao primeiro controle habilitado; no viewport móvel, o painel fecha e o foco volta a “Quando”, sem avanço automático. F02 permanece parcial porque o navegador local tem conteúdo simulado curto e manteve o segmento visível durante a rolagem; abertura do detalhe e navegação por histórico após a busca precisam ser revalidadas com um catálogo que permita reproduzir a saída real da origem.

**Validação F02/F03:** testes direcionados passaram para origem fora da janela, envio de busca, transição desktop com datas preservadas e ausência de avanço automático no viewport móvel. No navegador local a 1200 × 885, selecionar “Todos os condomínios”, check-in 1/12/2026 e check-out 3/12/2026 abriu “Selecionar hóspedes” e focou “Aumentar adultos”; os campos mantiveram as datas ISO corretas. O catálogo indicava modo de simulação, sem envio de busca/reserva. A rolagem real não retirou o segmento do viewport nessa página curta; a simulação geométrica coberta por teste unitário verifica o fechamento quando isso acontece.

**Regressão de teste F03:** a suíte compartilhada tinha uma asserção antiga que esperava retorno do foco a “Quando” após selecionar as datas, em conflito com o avanço desktop aprovado em F03. A expectativa agora verifica o diálogo de hóspedes e o foco em “Diminuir adultos”. O teste também stubba a lista de condomínios antes de cada caso para não disparar `/api/resorts` no Node.

**Complemento F01 · comportamento de foco e execução dos testes.** O foco agora permanece na aba selecionada quando a pessoa ativa outra etapa; isso mantém o padrão de navegação do tablist. A data só recebe foco programático após uma seta ser pressionada dentro do calendário, no próximo frame, e o foco acompanha a data alvo depois da renderização. Em navegador local desktop, a aba “Datas” permaneceu focada após clique; ArrowRight no tablist moveu o foco para “Hóspedes”; ArrowRight dentro do calendário moveu o foco de 26 para 27/11/2026. O teste mantém um ponto de tabulação por mês e percorre dias e meses. O stub de `getResorts` foi movido para `beforeEach` para impedir que testes seguintes iniciem chamadas ao endpoint relativo. Evidência: `searchModalAccessibility.test.ts` (7/7), suíte completa do frontend em Node 24 (641/641), lint/TypeScript, build frontend/blog e navegador local. O catálogo estava em simulação; não houve busca de disponibilidade, reserva ou pagamento. Ficam pendentes a sequência móvel, seleção por Enter e Escape no calendário e leitores de tela.

### Onda 2 · Painéis, camadas e interação responsiva

- [ ] F02 parcial: painéis fecham após envio ou quando a origem deixa a janela; testes direcionados passaram. Validar detalhe e saída real da origem em página longa/catálogo disponível antes de concluir.
- [x] Corrigir transição datas → hóspedes no desktop (F03), preservando datas e foco; em mobile, manter o calendário fechado sem abrir hóspedes automaticamente. Testes direcionados e navegador local passaram.
- [x] Corrigir F55: abertura e retorno por teclado verificados nos painéis de condomínio, datas e hóspedes; a seleção de “Todos os condomínios” transfere o foco para uma data disponível. Testes direcionados e navegador local a 1200 × 885 passaram em 26/11/2026. A matriz móvel continua na validação geral da onda 5.
- [ ] Reproduzir e resolver corte em altura curta e mudança de largura (F06 e F10).
- [ ] Delimitar portais ao diálogo correto e revisar modais aninhados (F07).
- [ ] Corrigir a colisão do segmento de hóspedes com “Buscar” em 640 px (F17) e verificar controles adjacentes.
- [ ] Inspecionar os botões relatados sobrepostos com captura e reprodução por largura, altura, zoom e conteúdo longo; registrar local e causa antes de corrigir.

### Onda 3 · Imóvel e checkout

- [ ] Revisar mudança de parcela depois do aceite, condições, erros de campos, loading, falha, recuperação e retorno ao imóvel com dados fictícios.
- [ ] Validar o contrato de aceite após mudança do valor parcelado (F15).
- [ ] Alinhar mensagem e destino no retorno de checkout não recuperável, preservando o contexto quando possível (F20).
- [ ] Corrigir retorno do checkout aberto diretamente e testar botão, Escape e histórico sem reabrir o diálogo (F37).
- [ ] Corrigir sobreposição do indicador de seleção no método de pagamento em largura estreita (F46).
- [ ] Sinalizar e recuperar interrupções no acompanhamento de pagamento pendente, sem induzir pagamento duplicado (F39).
- [ ] Preservar o destino do pedido na passagem para autenticação e conferir alternativas seguras de recuperação entre dispositivos (F40).
- [ ] Investigar falhas de asset e respostas 5xx observadas na rota de acompanhamento e validar publicação, cache e recuperação (F41).
- [ ] Esclarecer taxa local e formas de pagamento nas regras e no checkout (F22).
- [ ] Projetar entrada independente para o checkout novo e medir carregamento, preservando recuperação e contratos (F23).
- [ ] Tratar falha na atualização de preço após rejeição por mudança, sem apresentar cotação antiga como nova (F24).
- [ ] Verificar e normalizar barras finais em links diretos de checkout, preservando parâmetros e histórico (F25).
- [ ] Corrigir status HTTP da rota válida de checkout e preservar `noindex` e 404 de caminhos desconhecidos (F26).
- [ ] Diferenciar erro de consulta de preço e cotação ausente no detalhe, preservando tentativa e bloqueio de reserva (F27).
- [ ] Validar capacidade no detalhe e orientar ajuste explícito quando a viagem recebida excede o imóvel (F29).
- [ ] Investigar e corrigir apresentação ou origem da descrição e da composição de camas, sem inferir dados ausentes (F45).
- [ ] Preservar explicações de erros 422 e associar validações aos campos ou à etapa de correção (F30).
- [ ] Redesenhar preferências de medição com recusa, personalização, aceite direto, link de privacidade e reabertura, validando responsividade, foco e escolhas (F31).
- [ ] Identificar e disponibilizar a política de privacidade correta antes de incluí-la no painel (F51).
- [ ] Marcar as preferências fixas como portal de foco do diálogo ativo, sem aplicar isso ao texto embutido nas páginas legais (F47). Testes do contrato de portal e da marcação condicional passaram; fluxo combinado no navegador, Escape/fechamento e leitor de tela pendentes. PR #87.
- [ ] Auditar destinos e eventos por categoria de consentimento e definir métricas de interação sem coletar dados indevidos (F32).
- [ ] Alinhar evento de busca entre barra e modal, distinguindo envio, limpeza e restauração sem duplicidade (F42).
- [ ] Definir e validar métricas distintas de clique, carregamento e retomada do checkout (F43).
- [ ] Definir valor monetário do evento de compra e reconciliar cotação, taxas e pagamento aprovado (F44).
- [ ] Verificar e alinhar o comportamento de revogação de analytics e GTM com o texto apresentado (F33).
- [ ] Alinhar significado e cobertura de eventos de pagamento Pix e cartão, com deduplicação e testes de consentimento (F34).
- [ ] Informar sucesso ou falha ao copiar o Pix e permitir recuperação manual no checkout novo (F35).
- [ ] Explicar validade e expiração do Pix e indicar próximos passos com base no estado autoritativo (F36).
- [ ] Validar explicitamente a matriz de preferências: sem escolha; recusar ambas; analytics somente; publicidade somente; aceitar ambas; reabrir e revogar cada categoria. Para cada caso verificar estado persistido, tags, eventos permitidos e retomada de navegação em ambiente controlado.
- [ ] Padronizar idades (F09), validar capacidade e persistência de datas e hóspedes em histórico e links.
- [ ] Revisar galeria, regras, mapa, fotos ausentes, estados de disponibilidade, preços e mensagens de falha.

### Onda 4 · Componentes e sistema visual

- [ ] Inventariar os seletores, calendários, modais, contadores e botões existentes antes de extrair abstrações; registrar diferenças de comportamento por jornada.
- [ ] Separar responsabilidades do `StaysSearchWidget` em unidades coesas de estado, posicionamento e apresentação, preservando contratos e comportamento validado.
- [ ] Definir política de camadas, foco, fechamento e ancoragem; substituir valores ad hoc em etapas pequenas, sem impor modalidade onde não existe.
- [ ] Revisar tokens semânticos de cor, foco, superfícies, espaçamento e camadas onde há repetição real; medir contraste nos estados efetivos.
- [ ] Evitar atomização baseada apenas em tamanho de arquivo; criar primitivas quando há contrato estável e consumidores reais.

### Onda 5 · Regressão e áreas complementares

- [ ] Corrigir persistência e recuperação de favoritos sem depender da pesquisa atual (F11 e F12), com estados vazios e falhas distintos.
- [ ] Preservar mensagens de validação local no cadastro e associá-las aos campos (F13).
- [ ] Impedir que respostas antigas do painel do proprietário substituam o período mais recente (F14).
- [ ] Neutralizar interpretação de fórmulas em campos textuais da exportação financeira e validar planilhas suportadas (F52).
- [ ] Substituir foto de imóvel não associado por alternativa neutra e distinguir total ausente de zero confirmado nas viagens e no comprovante (F53 e F54).
- [ ] Tratar resultados de ações de conta que terminem após troca de sessão e reproduzir os casos ainda pendentes de renovação e rejeição, incluindo avisos e indicadores de carregamento (F38).
- [ ] Avaliar caminho direto do detalhe do condomínio às acomodações e validar preservação do contexto da viagem (F48).
- [ ] Preservar e revalidar datas e hóspedes na passagem por diretório e página do condomínio até o imóvel (F49).
- [ ] Validar busca e checkout em 320, 375, 640, 768, 1024 e 1280 CSS px, alturas pequenas, zoom de 200%, conteúdo longo e movimento reduzido.
- [ ] Cobrir teclado, foco visível, Escape, fundo inerte e retorno em diálogos aninhados; avaliação com leitor de tela separada de inspeção DOM.
- [ ] Revisar filtros, estados vazios/erro, favoritos, login, diretório de condomínios, conta e proprietário conforme acesso autorizado, registrando estados não disponíveis.
- [ ] Executar verificações proporcionais por mudança e comparar com o checklist de `docs/frontend-quality-plan.md`; registrar resultado e limitações por onda.

## Limites e pendências da investigação

| Área | Evidência já obtida | Ainda não comprovado |
| --- | --- | --- |
| Busca desktop | Interação de condomínio, datas, hóspedes, rolagem e colisão em tamanhos pontuais; código e testes existentes examinados. | Matriz completa de larguras, zoom, leitor de tela, rede instável e todas as combinações de filtros. |
| Busca móvel | Em 320 × 700 no simulador e na produção: seleção de todos os condomínios, datas de 1 a 3/12/2026, ajuste para dois adultos e busca com resultados e parâmetros correspondentes. Na produção, a abertura de LI23J e o avanço até o checkout preservaram os parâmetros da viagem. | Outras combinações e falhas, teclado e leitores de tela em aparelhos físicos. |
| Imóvel | Abertura e informações em produção, inclusive F29 em link direto, inspeção local e análise de disponibilidade, cotação e hóspedes. Em produção a 320 × 700, a galeria abriu, avançou da primeira para a segunda foto e Escape retornou foco ao controle de abertura. F27 foi reproduzido na interface com HTTP 503 interceptado localmente e nova tentativa bem-sucedida. Após busca simulada, o detalhe preservou datas e hóspedes e desativou reserva de dados simulados. | Outras falhas de preço, caminhos adicionais de F29, galeria e regras em outros estados e dispositivos. |
| Checkout | Pix, cartão e parcelas até antes de inserir dados ou aceitar condições em produção; prévia local e recuperação de erro local. Em 320 × 700 na produção, acesso direto exibiu resumo e campos, e a troca para Pix atualizou o total de R$ 245,72 para R$ 231,00 na cotação consultada; o botão permaneceu desabilitado sem dados e aceite. Em 1024 × 400, capturas do topo, das condições e aceite e da região inferior do cartão não mostraram sobreposição; uma inspeção geométrica dos botões, inputs e selects no diálogo não encontrou interseções nem overflow horizontal. Não foram preenchidos campos nem marcadas condições; outros estados não foram cobertos. Foram confirmados o retorno que reabre o checkout (F37) e o caminho sem credenciais com referência fictícia (F40). Cenários específicos de cópia, expiração e falha de consulta Pix foram reproduzidos com respostas simuladas (F35, F36 e F39). | Criação de pedido e processamento real, outros estados de expiração e cópia, rejeição, recuperação autenticada entre dispositivos e matriz responsiva. |
| Conta, favoritos e proprietário | Análise de código e cenários F11–F14 e F38. Em produção, o menu desconectado abriu o cadastro e Escape retornou foco a “Minha Conta”; F11 e F12 foram reproduzidos em sessão isolada. F13 foi submetido com dados fictícios e requisições de escrita bloqueadas; F38 foi reproduzido com APIs simuladas. | Cadastro real, outras validações submetidas, jornadas autenticadas, permissões e estados com dados reais; cenários restantes de F38. |
| Componentes e tokens | Inventário inicial, relações do grafo e leitura direta de componentes. | Medição de contraste, análise completa de movimento reduzido e validação com usuários. |

Em produção a 640 × 400 CSS px, a página inicial não apresentou overflow horizontal na medição do documento (640 px de conteúdo e viewport). Ao abrir hóspedes, o painel ocupou aproximadamente 608 × 376 px a partir de (16, 16), com os controles de adultos, crianças, bebês e pets presentes no texto. Essa medição não verifica se todos os controles são alcançáveis, se o texto está cortado dentro de elementos filhos ou se há colisões no painel. Em nova amostra na mesma dimensão, os nove controles do painel estavam dentro do viewport e seus pontos centrais correspondiam aos próprios controles na inspeção geométrica; os quatro botões de redução estavam desabilitados nos valores mínimos. Aumentar adultos atualizou o botão para “Quem: 2 hóspedes”; Escape fechou o painel e devolveu o foco a esse botão. Isso não verifica outros tamanhos, todo o percurso por teclado ou leitores de tela. O teste usou redimensionamento do viewport, não zoom de navegador; a verificação real com zoom de 200% continua pendente. A sessão foi fechada ao final.

Em 640 × 700 na produção, uma captura da região de contato, escolha de pagamento e condições não mostrou colisão; a verificação geométrica dos controles do diálogo também não encontrou interseções ou transbordamento horizontal nesse estado. Essa amostra é distinta da colisão da busca em F17 e não cobre todos os estados do checkout.

Em 375 × 667, após redimensionar o mesmo checkout, a captura de contato e escolha entre Pix e cartão não mostrou sobreposição visível, e a mesma verificação geométrica não encontrou colisões entre controles ou overflow horizontal. Em 320 × 400, o indicador do cartão selecionado sobrepôs seu próprio texto (F46), falha que a comparação entre controles não detecta. Não foram enviados dados nem exercitados os estados de erro nessas dimensões.

No detalhe de LI23J em 320 × 400, uma varredura geométrica inicial não encontrou transbordamento horizontal. Ela indicou interseção entre o controle da foto principal e o botão “Mostrar todas as fotos”, que é disposto sobre a imagem; a geometria sozinha não determina defeito, pois ambos abrem a galeria. O estado inicial ainda carregava as imagens, e não foram inspecionadas todas as posições da página ou interação por toque nessa amostra.

Na inspeção computada dos métodos de pagamento em produção, os textos secundários “Cielo” e “Sem taxa” tinham 11,2 px e cor `rgb(100, 116, 139)`; o botão inativo de confirmação tinha texto `rgb(105, 115, 134)` sobre `rgb(214, 217, 222)`. Esses valores identificam alvos para avaliação visual, mas os fundos dos métodos incluem transparência e exigem composição real para calcular contraste. Não se afirma conformidade nem falha de contraste a partir desses valores; distinguir também controles ativos de desabilitados na avaliação.

Na captura de 375 × 667, uma amostra de fundo próxima a “Sem taxa” foi `rgb(254, 254, 255)`; comparada à cor CSS do texto, resulta em contraste aproximado de 4,72:1. É uma amostra estática de um estado e fundo, não uma auditoria de contraste dos demais controles, fundos variáveis, foco ou estados interativos. A primeira tentativa de leitura por Python não pôde usar Pillow; a amostra foi obtida com AppKit e o cálculo de luminância em seguida.

- Em 26/11/2026, `npx tsx --test tests/tripsDialogs.test.ts tests/guestAccountModalAccessibility.test.ts tests/hostDashboardAccessibility.test.ts tests/ownerAccountingTransactions.test.ts` passou 19 testes. Eles incluem nome, foco e Escape em diálogos de viagem, aviso de cancelamento recebido sem afirmar conclusão, estados do painel de proprietário e descarte de resposta antiga no detalhe contábil. Os testes são simulados e não cobrem os cenários específicos F14, F38 e F52–F54 nem comprovam a jornada autenticada real. O aviso de `localStorage` no Node e a mensagem de cancelamento exigindo suporte ocorreram durante testes que terminaram aprovados.
- Em 26/11/2026, `npx tsx --test tests/existingReservationCheckout.test.ts tests/existingReservationSummary.test.ts tests/existingReservationResume.test.ts tests/existingReservationResumeStorage.test.ts` passou 34 testes. Os casos incluem consulta indisponível com nova tentativa, retomada de resposta perdida, tentativa anterior que bloqueia novo pagamento, recusa e expiração, saldo após entrada conciliada, armazenamento bloqueado e validação de valores e métodos. Os testes usam dados e respostas controlados; não comprovam a versão implantada, operações reais, todos os provedores ou acessibilidade em navegador e leitor de tela. A leitura de `useExistingReservationCheckoutRecovery.ts` também mostra bloqueio até conferir a tentativa anterior e oferece acompanhamento e nova consulta; preservar esse comportamento ao reorganizar o checkout.
- Em 26/11/2026, `propertyAvailabilityHook`, `propertyDetailBookingAccessibility`, `propertyDateSelection` e `propertyPricing` passaram 64 testes. A cobertura inclui expiração, respostas antigas, limite do seletor para uma seleção ajustada nele e navegação de galeria. A suíte original não comprova o cenário F29 de seleção inicial acima da capacidade nem o comportamento de `null` descrito em F27; este último foi verificado separadamente com resposta HTTP simulada e na interface com interceptação local. Houve avisos de URLs relativas de API no Node de teste; isso não demonstra falha da API em produção.
- A evidência está vinculada à versão local `7e5d1f2`; não foi identificada a versão efetivamente implantada em produção, então observações do site e causas do código local não devem ser tratadas como correspondência comprovada.
- Em 26/11/2026, o frontend local em `127.0.0.1:3000`, o health e a prontidão da API em `127.0.0.1:8000` e o health por meio do proxy do frontend responderam HTTP 200. Isso verifica disponibilidade pontual e prontidão informada pela aplicação, não integrações de pagamento, filas ou todas as rotas. Os processos já estavam ativos; não foram iniciados nem reiniciados nesta verificação.

- O grafo é índice de navegação, não prova de execução, aparência nem cobertura semântica. Precisa de leitura direta dos arquivos.
- Há inspeções anteriores de busca e detalhe no simulador, um exame visual da prévia de checkout e teste pontual do checkout em produção até a seleção de pagamento, sem preenchimento de dados, aceite ou pagamento. Uma busca móvel completa foi exercitada em 320 × 700 CSS px com dados simulados; isso não cobre outras condições. Não há teste de pagamento real, usuários, leitor de tela nem matriz responsiva completa.
- Conta e proprietário foram revisados por código e testes simulados; reserva existente e retomada também tiveram estados simulados revisados. As conexões de suporte foram conferidas no grafo e diretamente no código. Riscos não reproduzidos e jornadas autenticadas reais permanecem explicitamente pendentes de validação nas respectivas ondas, pois esta revisão não usou contas nem dados reais.
- **Não testado:** processamento real de pagamento, criação de reserva e dados pessoais, pois a revisão está limitada a verificações sem efeitos externos; leitor de tela e dispositivos físicos não foram exercitados; áreas autenticadas de conta e proprietário não foram avaliadas ponta a ponta nesta sessão. Esses limites não são resultados de sucesso ou falha.
