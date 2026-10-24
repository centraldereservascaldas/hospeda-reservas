# Checklist do design system interno — Hospeda Reservas

## Propósito

Consolidar as decisões visuais e de interação já usadas pelo produto para que novas telas e ajustes evoluam com consistência. Este material é interno ao time do Hospeda Reservas e serve como fonte de referência para design e implementação; não é uma página pública nem uma proposta de rebranding.

O sistema parte da identidade existente — hospedagem e lazer em Caldas Novas, tons quentes, superfícies claras e o tratamento glass já usado no produto — e reduz divergências conforme os componentes forem revisados. Exceções continuam possíveis quando necessárias ao contexto e documentadas.

## Skill e materiais locais

- [x] Buscar skills, arquivos e referências dedicados a design systems nas skills globais, plugins locais e skills do projeto.
- [x] Consultar o grafo Graphify já existente e conferir os arquivos de estilo e o plano de qualidade do frontend.
- [x] Registrar a conclusão: não foi encontrada uma skill local dedicada a design system; esta checklist é o roteiro específico do projeto.

## Retrato inicial do frontend

- [x] Runtime identificado: React 19, TypeScript, Vite 6 e Tailwind CSS 4.
- [x] `src/index.css` declara tokens Tailwind para `focus-ring`, `page` e `glass-border` em `@theme`; a escala ganhou `caption` (12 px/16 px) para rótulos de categoria e metadados dos cartões. A adoção precisa seguir pelas demais superfícies em cada wave.
- [x] A folha global inclui foco visível, suporte a `prefers-reduced-motion`, animações utilitárias e uma família de superfícies `liquid-glass-*`.
- [x] Ícones usam a biblioteca compartilhada `lucide-react`.
- [ ] Escala tipográfica ainda precisa ser consolidada: há valores arbitrários em dezenas de componentes e permanecem usos abaixo de 11 px em conteúdo da interface.
- [ ] Escala e regras de tamanho de ícones precisam ser inventariadas; a biblioteca é consistente, mas os tamanhos são definidos por componente.
- [ ] Tokens semânticos de cor, espaçamento, raio, sombra, camada e dimensões responsivas precisam ser definidos ou validados contra os usos atuais.
- [ ] Componentes compartilhados e componentes de domínio precisam ser inventariados por papel e estados antes de decidir novas abstrações.
- [ ] Contraste, zoom, aumento de texto, safe areas, estados completos e consistência visual precisam de validação por fluxo e breakpoint.

## Princípios do sistema

- [ ] Manter uma fonte de verdade para tokens, com nomes semânticos ligados a papéis de interface.
- [ ] Separar valores base (paleta, escala e medidas) dos tokens de uso (texto principal, superfície elevada, ação primária, foco, erro etc.).
- [ ] Reutilizar Tailwind CSS 4, a biblioteca de ícones e os componentes existentes; não introduzir dependência ou camada paralela sem necessidade concreta.
- [ ] Criar componentes compartilhados quando houver comportamento e apresentação realmente repetidos; preservar componentes específicos dos domínios quando os fluxos divergirem.
- [ ] Registrar exceções de produto com contexto e limitar seu alcance ao componente ou domínio que precisa delas.
- [ ] Projetar para conteúdo real em larguras estreitas e validar a adaptação a telas intermediárias e largas.
- [ ] Priorizar legibilidade, hierarquia, acessibilidade e clareza de preço/ação em todas as jornadas.

## Fundamentos e tokens

### Cores e superfícies

- [ ] Mapear as cores de marca e seus usos reais sem substituir a identidade atual por uma paleta nova.
- [ ] Definir tokens semânticos para texto, fundo da página, superfícies/cards, bordas, separadores, links, ações e foco.
- [ ] Definir tokens para sucesso, atenção, erro e informação, incluindo fundo, texto, borda e ícone.
- [ ] Documentar níveis e variantes de glass, contraste sobre conteúdo variável e alternativas sem `backdrop-filter`.
- [ ] Validar contraste em todas as combinações aprovadas, inclusive composições glass reais.
- [ ] Avaliar modo escuro somente se houver requisito de produto; evitar tokens incompletos sem suporte de ponta a ponta.

### Tipografia e leitura

- [ ] Registrar famílias, fallbacks, pesos disponíveis e regras de carregamento da fonte.
- [ ] Definir escala semântica para display, título de página, seção, componente, corpo, corpo compacto, label, auxiliar e metadado.
- [ ] Para cada papel, definir tamanho, peso, altura de linha, espaçamento entre letras e comportamento responsivo.
- [ ] Estabelecer limite mínimo de legibilidade para conteúdo essencial; permitir exceção somente em metadados densos com validação visual.
- [ ] Definir regras para títulos, nomes de imóveis, preços, datas, contadores, texto legal, tradução, quebra, truncamento e números tabulares.
- [ ] Verificar ampliação de texto e zoom do browser sem perda de informação, sobreposição ou corte.
- [ ] Conferir a hierarquia em cartões, calendário, filtros, modal, checkout, viagens e painel do proprietário.

### Ícones e ilustrações

- [ ] Confirmar `lucide-react` como biblioteca padrão e documentar quando uma exceção é aceitável.
- [ ] Definir tamanhos por função (metadado, ícone junto a texto, ação compacta, navegação e destaque), incluindo mobile e desktop.
- [ ] Padronizar traço, alinhamento ótico, cor, preenchimento e espaçamento entre ícone e rótulo.
- [ ] Separar tamanho visual do ícone do alvo touch; ações móveis continuam fáceis de tocar sem ampliar demais o desenho.
- [ ] Exigir nome acessível para botão somente com ícone; ícones decorativos ficam ocultos da árvore de acessibilidade.
- [ ] Conferir ícones em botões, navegação inferior, categorias, estados vazios, filtros, calendário e mapa nos breakpoints definidos.

### Espaçamento, layout e responsividade

- [ ] Inventariar espaçamentos e estabelecer escala coerente para gaps, padding e margens.
- [ ] Definir breakpoints e mudanças de composição com base no conteúdo, evitando exceções sem justificativa.
- [ ] Documentar largura de conteúdo, margens, colunas, grids, densidade, proporção de mídia e trilhos horizontais.
- [ ] Definir alvos de toque, dimensões mínimas de controles, altura de campos e distância entre ações.
- [ ] Definir comportamento para safe areas, barras fixas, teclado virtual, paisagem e viewport dinâmica.
- [ ] Validar 320, 360, 375, 390, 430, 768, 1024, 1280 e 1440 CSS px; indicar regiões com rolagem interna.
- [ ] Documentar padrões de interação touch: estados pressed, swipe, trilhos arrastáveis, inércia, rolagem aninhada e alternativas por botão quando um gesto não for descoberto facilmente.
- [ ] Preservar zoom por pinça e comportamento do viewport; validar teclado virtual e safe areas em navegadores/dispositivos reais quando disponíveis.

### Forma, profundidade e camadas

- [ ] Definir raios por papel: cartões, campos, badges, menus e modais.
- [ ] Definir níveis de sombra/elevação que funcionem em superfícies claras e glass.
- [ ] Centralizar níveis de empilhamento de conteúdo, menus, diálogos, navegação fixa e notificações.
- [ ] Definir bordas, divisores e estados hover, pressed, selected, disabled e focus-visible.
- [ ] Validar a família liquid-glass e consolidar variantes visualmente duplicadas após o inventário.

### Movimento

- [ ] Catalogar duração, curva e distância de transições por tipo de interação.
- [ ] Usar movimento para explicar estado e hierarquia, sem prejudicar tarefas.
- [ ] Respeitar `prefers-reduced-motion` em CSS e animações controladas por JavaScript.
- [ ] Verificar que ausência de movimento não remove informação ou feedback de estado.

## Componentes e padrões

- [ ] Inventariar componentes por domínio: navegação, busca, catálogo, imóvel, condomínio, conta, reservas, checkout, proprietário e suporte.
- [ ] Para cada componente candidato ao sistema, registrar propósito, API/props, conteúdo, variações, composição e limites de uso.
- [ ] Definir estados comuns: padrão, hover, foco, pressionado, selecionado, desabilitado, loading, vazio, erro e sucesso, conforme aplicável.
- [ ] Revisar botões e links: hierarquia, largura, ícones, loading, disabled e nomes acessíveis.
- [ ] Revisar campos: label associado, descrição, obrigatório, erro, foco, teclado móvel e valor longo.
- [ ] Revisar cards, badges/chips, tabs, menus, accordions, navegação, tabelas, calendário, paginação e estados vazios.
- [ ] Revisar diálogos: nome, semântica modal, foco inicial, contenção e retorno de foco, Escape, rolagem e diálogos aninhados.
- [ ] Documentar padrões para preço, disponibilidade, datas, hóspedes, imagens, políticas e mensagens de erro.
- [ ] Preservar acessibilidade e fluxo de teclado ao substituir ou compor componentes.

## Acessibilidade e qualidade

- [ ] Semântica HTML adequada e ordem de leitura coerente.
- [ ] Foco visível, sem ser encoberto por barras fixas, recortado ou deslocado por hover.
- [ ] Controles com nome acessível; estado não comunicado somente por cor ou ícone.
- [ ] Contraste conferido em superfícies sólidas e composições glass reais.
- [ ] Alvos touch e espaçamento entre controles verificados em telas móveis.
- [ ] Gestos têm resposta previsível, limites claros e não são a única forma de alcançar uma ação importante.
- [ ] Rótulos, ícones, hierarquia e feedback ajudam pessoas com diferentes idades, visão e familiaridade digital a entender posição, estado e próxima ação.
- [ ] Zoom, aumento de fonte, conteúdo longo e tradução testados em jornadas importantes.
- [ ] Movimento reduzido e estados loading, erro, vazio e sucesso revisados.
- [ ] Não introduzir dependências nem mudar contratos de API como efeito colateral da consolidação visual.

## Waves de construção e adoção

### Wave DS0 — inventário e decisões

- [x] Registrar stack e tokens globais existentes.
- [x] Confirmar biblioteca de ícones e buscar material local dedicado.
- [ ] Catalogar componentes, variações e divergências por domínio.
- [ ] Validar a identidade atual com produto e registrar decisões que dependam de preferência visual.
- [ ] Definir critérios mensuráveis e responsáveis por contribuição e revisão.

### Wave DS1 — tokens

- [ ] Consolidar tokens no mecanismo já usado pelo projeto (`src/index.css` e Tailwind CSS 4 `@theme`).
- [ ] Definir e validar cor, tipografia, tamanhos de ícone, espaçamento, raios, sombras, camadas, movimento e breakpoints.
- [ ] Migrar superfícies tocadas na auditoria mobile para tokens estáveis quando o papel for comum.
- [ ] Documentar exceções que ainda não possam ser consolidadas.

### Wave DS2 — primitivas e componentes comuns

- [ ] Mapear componentes compartilhados e padrões repetidos antes de criar abstrações.
- [ ] Consolidar componentes primitivos para controles, formulários, superfícies, badges e ícones quando houver repetição real.
- [ ] Definir estados, APIs e acessibilidade por componente.
- [ ] Evitar migração em massa que misture refatoração visual com jornadas críticas sem cobertura.

### Wave DS3 — padrões de domínio

- [ ] Aplicar o sistema a catálogo e descoberta, detalhe/reserva, conta/viagens, proprietário/admin e suporte.
- [ ] Resolver diferenças entre desktop e mobile sem duplicar tokens ou criar escalas concorrentes.
- [ ] Rever loading, erro, vazio e sucesso em cada fluxo afetado.

### Wave DS4 — documentação viva e adoção

- [ ] Documentar tokens, componentes, exemplos recomendados e usos a evitar no repositório.
- [ ] Usar nomes e imports diretos conforme as convenções do projeto.
- [ ] Integrar os critérios ao plano de qualidade do frontend e às waves de responsividade.
- [ ] Revisar diff, lint, build e verificações direcionadas; registrar pendências com evidência.

## Critérios de conclusão

- [ ] Tokens centrais têm uma fonte de verdade e nomes por papel de uso.
- [ ] Tipografia e ícones têm escalas conferidas em larguras móveis, intermediárias e desktop.
- [ ] Componentes principais têm estados e regras de composição documentados e aplicados nos fluxos cobertos.
- [ ] Acessibilidade, zoom, textos longos, safe areas e movimento reduzido fazem parte da validação.
- [ ] Exceções remanescentes são conhecidas e justificadas; nenhum valor arbitrário novo é introduzido sem papel definido.
- [ ] `npm run lint`, `npm run build` e `git diff --check` passam na adoção; testes existentes relacionados são executados quando aplicável.
- [ ] Checklist do design system e plano de qualidade apontam para a mesma fonte de decisões.

## Relação com a auditoria mobile

Esta checklist complementa [a auditoria de layout e redimensionamento mobile](mobile-layout-audit-checklist.md). Durante a auditoria, consolidar e usar primeiro os tokens de tipografia e ícones compartilhados pelas telas tocadas; a auditoria visual completa e a migração por domínio seguem as waves acima. O design system não está concluído apenas por existir um documento ou uma escala inicial.

### Registro inicial — 2026-10-18

- Criado o roteiro interno DS0–DS4 e conectado à auditoria mobile. O goal ativo continua acompanhando a execução por waves; esta checklist não substitui nem encerra esse trabalho.
- `npm run lint`, `npm run build` e `git diff --check` passaram neste checkpoint. Nenhum teste foi executado.
- Ainda falta decidir e implementar os tokens; os tamanhos registrados como baseline não são valores aprovados do sistema.

### Exceção responsiva em validação — calendário compacto

- A grade de datas do widget inline usa sete colunas. Em 320 px, cada célula de data mede `35×44` CSS px, com 4 px entre colunas; os botões de mês e a ação “Hoje” seguem com pelo menos `44×44`. O arranjo preserva todos os dias sem overflow horizontal. Tratar 35 px como largura contextual do alvo do dia, não como tamanho geral de botão; validar a facilidade de toque em aparelho real antes de aprovar como regra do sistema.
- Os calendários do widget de busca e do detalhe permitem `pan-y pinch-zoom`; a seleção de intervalo continua disponível por arrasto horizontal e também por toque individual. Em Chromium emulado, o calendário do detalhe rolou verticalmente, aceitou pinça até `1,25×` e voltou a `1×`, e um arrasto horizontal escolheu entrada/saída. Essa evidência não substitui teste físico em Safari iOS e Android antes de fechar a regra.

### Adoção de tipografia — Wave 2 mobile, 2026-10-18

- O token `caption` (12 px/16 px) passou a cobrir rótulos e metadados do detalhe da acomodação, calendário, disponibilidade, painel de reserva, avaliações e localização, além dos usos anteriores no catálogo e rodapé.
- A adoção é incremental e ainda não aprova a escala completa. Inventariar os tamanhos restantes, definir papéis/tamanhos de ícones e validar zoom, contraste, texto ampliado e exceções por componente nas próximas waves.
- No chat da Sofia, respostas essenciais agora usam `text-sm` (14 px/20 px) também em telas estreitas; o campo de mensagem usa `text-base` (16 px) em mobile para evitar texto de entrada excessivamente pequeno e reduzir o risco de zoom automático ao focar no Safari iOS. Essa exceção responsiva do campo deve ser conferida em aparelho real.
- O atalho inline da Sofia no cabeçalho da busca usa texto de ação `text-sm` e alvo mínimo de 44 px. Em viewport curta/estreita ele permanece visível, com gap e padding menores; a affordance não depende exclusivamente do botão flutuante.
- A grade semanal do calendário da acomodação mantém células de dia menores que 44 px em largura por restrição de sete colunas. Tratar como exceção provisória de domínio até validar toque em aparelho e alternativa de navegação; não generalizar para outros controles.
- A navegação inferior usa rótulos de ação em 14 px e ícones em 20 px, verificados em retrato `320×568` e paisagem `568×320`. Reservar `caption` de 12 px para metadados e rótulos compactos; não usar como padrão de ações principais. Essa decisão é incremental e ainda precisa de conferência com texto ampliado e dispositivos físicos.
- A galeria de acomodação reduz sua altura para 240 px quando a viewport tem até 400 px de altura, para caber abaixo do cabeçalho em paisagem curta. Tratar como regra responsiva do componente; a escala geral de proporções de mídia ainda precisa ser inventariada.
- A ação de ampliar fotos usa rótulo de 14 px, ícone de 16 px e alvo de `221×44` em 320 px e 568 px de largura; manter hierarquia de ação mesmo quando sobreposta à imagem.
- Na página de acomodação, textos explicativos essenciais (comodidades, políticas, biografia e comentários) usam `text-sm` (14/20 px); datas, categorias e metadados podem usar `caption` (12/16 px). Mapas e ações relacionadas usam rótulo de 14 px e ícone de 16 px. Esta adoção ainda precisa cobrir todas as superfícies do produto.
- Âncoras de seção na página do imóvel reservam 48 px de scroll margin para posicionar o título abaixo do cabeçalho fixo; revisar esse valor se a altura responsiva do cabeçalho mudar.

### Exceção responsiva — painel de reserva em baixa altura

- Em viewports com até 400 px de altura, o painel de reserva reduz padding/gap e a CTA reduz o padding vertical para manter a ação principal dentro de paisagens curtas. Validação em 568×320: CTA `478×46` integralmente visível; datas seguem com 64 px e hóspedes com 44 px. Em larguras de 320 a 430 px no modo retrato, a CTA fica no fluxo e não há overflow horizontal.
- Os controles internos mantêm alvos adequados enquanto o espaçamento do cartão se adapta. Esta regra é uma exceção local de layout por baixa altura e ainda requer conferência em aparelho físico e com aumento de texto.

### Ação de retomada em telas estreitas e baixas

- O link principal de saída da retomada recebeu alvo `min-h-11` (44 px); em 320 px de largura, o texto pode quebrar e ampliar o alvo para 56 px. Viewports com até 360 px de largura ou 400 px de altura reduzem título/espaçamento e ocultam apenas a descrição introdutória redundante, mantendo a instrução de recuperação no cartão. Em 568×320, a ação termina 8 px antes da borda inferior.
- Aplicar o princípio a outras páginas de jornada única: preservar a próxima ação na primeira dobra quando a altura é muito baixa, sem reduzir o alvo de toque nem remover instrução necessária.
- Verificação da retomada responsiva: `npm run lint`, `npm run build`, Prettier e `git diff --check` passaram; geometria visual conferida em Chromium. Estados autenticados e serviços reais continuam fora desta evidência.

### Redução de densidade decorativa na home mobile

- Cartões de categoria abaixo de 640 px usam agora superfície de ícone de 36 px e cartão de 70 px; a partir de 640 px, seguem em 40 px/86 px. Os desenhos Lucide continuam em 20 px, com label de 12 px. A ação é o cartão inteiro (70 px de altura no mobile), preservando alvo confortável; os ícones de ação continuam separados de seu alvo touch.
- A chamada principal da busca usa 14 px em mobile e uma frase curta; em 640 px ou mais mantém a frase longa. Essa combinação reduz quebra excessiva sem diminuir o texto de ação. Validar posteriormente com ampliação de texto, leitores de tela em dispositivos e idiomas diferentes.
- Testes direcionados da home mobile e roteamento passaram (25/25); lint, build, Prettier e `git diff --check` passaram. Há fallback informativo de `/api/resorts` no ambiente Node sem Laravel local.
- Até 400 px de altura, cartões de categoria mantêm 12 px de texto e alvo de 54 px, reduzindo apenas a caixa do ícone e os espaços ao redor. Na busca, o primeiro campo de 44 px fica 12 px acima da navegação em `568×320`; a regra também foi verificada em `320×320`, `360×320` e `812×375`.

### Campos e navegação do checkout mobile

- No modal de checkout, labels dos três dados pessoais usam 14 px; inputs usam 14 px com 44 px de altura mínima. O status usa 12 px. O cabeçalho fixo durante a rolagem mantém o controle de voltar em 44×44 px, inclusive em paisagem curta.
- A ação de pagamento permanece no fluxo depois dos dados e condições. O aceite exige uma ação explícita, e o botão fica desabilitado enquanto os dados e requisitos não estiverem prontos; não fixar CTA sobre o texto legal ou formulário.
- Validação de layout com respostas sintéticas em Chromium; serviço/cartão reais e teclado virtual em aparelho seguem pendentes.

# Registro da Wave 5 — controles e densidade

- Alvo de toque móvel: mínimo de 44×44 px para fechar, abas, navegação de mês e ações do painel; validar dimensões renderizadas em viewport real.
- Formulários: rótulos e entradas legíveis (14 px nas áreas revisadas), campos com altura mínima de 44 px, densidade reduzida em telas estreitas e fotos em grade de 3 colunas no celular.
- Não compactar ou ampliar ícones isoladamente sem conferir a hierarquia ao lado de texto, metadados e ações. A decisão deve considerar a densidade percebida por viewport e preservar os tokens compartilhados.
- Evidência da rodada é estática; os estados de proprietário/admin aguardam sessão autorizada para revisão visual e de interação.

### Modal de conta — rolagem em baixa altura

- Em `GuestAccountModal`, limitar a superfície do diálogo a `100dvh - 2rem` e separar cabeçalho do conteúdo rolável. Em celulares com altura suficiente, o conteúdo permanece integralmente visível; em paisagem ou altura baixa, rola dentro do corpo sem deslocar o cabeçalho nem o controle de fechar.
- O botão fechar segue com 44×44 px; o foco inicial e o retorno por Escape continuam parte do padrão acessível de diálogos.
- Dimensões medidas no Chromium em retrato de 320–430 px, paisagem de 568×320 e 812×375 e tablets/desktop até 1024×768. Ajustar para áreas seguras e teclado virtual reais só com validação em dispositivo.

### Estado de conteúdo simulado

- Dados de demonstração exibem um aviso textual persistente nas superfícies de catálogo e detalhe, com contraste e semântica de status. O aviso informa que preço e disponibilidade são fictícios e que reservas/pagamentos estão desativados.
- Cotações simuladas podem ser renderizadas para testar a hierarquia de preço, mas a ação de reserva continua desabilitada. Selo de avaliação/anfitrião só aparece com dado real verificável; as fixtures simuladas não afirmam Guest Favorite, Superhost ou avaliações.
- Revisar esse padrão quando houver outros simuladores de dados: fonte, limitações e ações habilitadas precisam ficar claros junto à informação exibida.
