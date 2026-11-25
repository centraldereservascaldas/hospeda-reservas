# Design system do Portal Interno CRCN

## Objetivo e limite

O Portal Interno da Central de Reservas Caldas Novas deve herdar a identidade reconhecível do site público, mantendo componentes e regras próprias para as tarefas administrativas. Este sistema vive em `src/components/site-control/` e é aplicado sob `.site-control-portal`; não redefina estilos globais nem altere a experiência pública para atender ao portal.

## Princípios visuais

- **Marca oficial:** use `LogoCRCN` para o emblema e respeite sua tipografia e acentos. Não crie uma marca ou logotipo paralelo.
- **Paleta CRCN:** use a cor de destaque do tema (`--crcn-accent`, atualmente `#ea580c`) e os tons escuros/neutros já presentes no site. O portal pode usar superfícies administrativas mais silenciosas, com destaque laranja em navegação ativa, foco e ação principal.
- **Tipografia:** preserve Plus Jakarta Sans, já definida no frontend. Construa hierarquia com escala e peso consistentes; evite reduzir texto essencial para caber em layouts densos.
- **Superfícies:** fundo claro e neutro, cartões brancos, bordas discretas e sombra contida. Reserve gradientes e vidro para situações em que o próprio site já os utiliza e em que não prejudiquem leitura.
- **Estados:** sucesso, atenção, informação e erro devem ter cor, rótulo textual e forma/ícone quando necessário. A cor sozinha nunca comunica o estado.
- **Densidade:** priorize leitura e uso por toque; tabelas densas viram cartões em telas estreitas.

## Tokens

Os tokens vivem no escopo da aplicação `.site-control-portal`, no início de `site-control.css`. Eles cobrem:

- marca e hover (`--portal-brand-*`);
- texto primário, secundário, muted e subtil (`--portal-text-*`);
- superfícies, bordas, estados semânticos e foco;
- raios, espaçamento e sombras.

Use os tokens de intenção em novas regras. Não copie hexadecimais para cada componente. Se faltar um token, adicione um nome semântico no bloco raiz e aplique-o aos componentes que precisam dele. Para cores de marca já existentes, prefira referências às variáveis públicas `--crcn-*` quando compatíveis.

## Componentes-base

`design-system.tsx` fornece os elementos comuns iniciais:

- `PortalButton`: variantes `primary`, `secondary` e `quiet`, ícone opcional e props nativas de botão;
- `PortalCard`: superfície de conteúdo com semântica `article` ou `section`;
- `PortalStatus`: indicador com ponto decorativo e rótulo textual;
- `PortalPageHeading`: cabeçalho consistente de tela com eyebrow, título, descrição e ação opcional.

Antes de criar outro componente comum, confirme que há repetição real ou uma semântica/comportamento compartilhado. Componentes específicos de uma área ficam próximos à página desse domínio. Prefira imports diretos; não crie barrel para reexportar tudo.

## Padrões de implementação

- Estilos do portal precisam permanecer sob `.site-control-portal` ou classes `portal-*` para evitar vazamento para o site público.
- Prefira HTML semântico e atributos acessíveis; labels devem apontar para campos. Botões de ícone precisam de nome acessível.
- Alvos importantes devem ter pelo menos 44 px de altura/largura confortável, conforme o contexto; foco é visível e usa o acento CRCN.
- Respeite `prefers-reduced-motion`; transições não podem ser necessárias para entender estado.
- Estados vazio, carregando, erro e sucesso devem ser parte do desenho da tela, não remendos posteriores.
- Dados fictícios devem ser sintéticos e identificados como demonstração. UI não é autorização e não deve sugerir escrita real.
- Em mobile, prefira uma coluna, cartões rotulados e filtros recolhíveis; nunca dependa de hover, cor isolada ou arrastar-e-soltar.

## Processo para uma nova tela

1. Definir tarefa, usuário e ação primária da tela.
2. Escolher o padrão existente mais próximo (lista, detalhe, dashboard, formulário ou estado de sistema).
3. Compor a tela com `PortalPageHeading`, `PortalCard`, `PortalButton` e `PortalStatus` quando semântica e forma coincidirem.
4. Usar tokens semânticos e conferir contraste, teclado, toque, viewport estreito e zoom.
5. Revisar todos os estados e se a interface revela claramente origem e atualidade dos dados.
6. Verificar que nenhum estilo saiu do escopo do portal e que o site público permanece inalterado.

## Evolução

Este é um sistema inicial, extraído do frontend atual, e não uma declaração de que todos os padrões do site já foram inventariados. Ao implementar componentes ou telas existentes do site no futuro, registre padrões observados antes de abstraí-los. Evite migrar ou reescrever o site público dentro deste trabalho.
