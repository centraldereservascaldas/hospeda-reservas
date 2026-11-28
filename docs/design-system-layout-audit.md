# Auditoria inicial de espaçamento e layout

## Escopo e método

- Escopo: frontend React/TypeScript principal integrado à API Laravel, arquivos `src/**/*.{tsx,ts,css}` e configuração de tema CSS-first do Tailwind.
- Fora de escopo: blog Astro, dimensões de assets de terceiros e a definição de uma escala nova sem revisão visual.
- Runtime encontrado: Tailwind CSS 4.3.3. A escala-base do framework define `--spacing: 0.25rem`, equivalente a 4 CSS px sob a raiz padrão de 16 px. As utilities usam essa escala; ela já é uma fonte-base de spacing.
- Método: leitura de `src/index.css`, tema Tailwind instalado e busca estática das utilities de padding, margin, gap, space e border radius em 180 arquivos TypeScript/CSS de `src`.
- Limite: os números de busca são ocorrências literais no código, não contagem de componentes renderizados. Classes geradas dinamicamente podem escapar, e uma mesma utility pode cumprir papéis diferentes.
- Status: valores e usos listados como **observados** são evidência do código; as decisões sobre uma escala semântica além das utilities existentes continuam **propostas**.

## Escala-base observada no Tailwind

As classes mais recorrentes na busca estática incluem `px-4` (181 ocorrências), `px-3` (180), `p-4` (126), `py-2` (100), `gap-2` (207), `gap-3` (182), `mt-1` (141), `mt-2` (81), `rounded-xl` (290), `rounded-full` (276), `rounded-2xl` (175) e `rounded-3xl` (62). Os totais são aproximações lexicais, não uma métrica de qualidade.

| Utility observada | Valor efetivo padrão | Nota                                     |
| ----------------- | -------------------: | ---------------------------------------- |
| `*-1`             |                 4 px | Base da escala Tailwind.                 |
| `*-2`             |                 8 px | Recorrente em gaps e margens compactas.  |
| `*-3`             |                12 px | Recorrente em gaps e padding horizontal. |
| `*-4`             |                16 px | Recorrente em padding e gutters.         |
| `*-6`             |                24 px | Usado para respiros maiores.             |
| `rounded-lg`      |                 8 px | Raio padrão do tema instalado.           |
| `rounded-xl`      |                12 px | Raio padrão do tema instalado.           |
| `rounded-2xl`     |                16 px | Raio padrão do tema instalado.           |
| `rounded-3xl`     |                24 px | Raio padrão do tema instalado.           |
| `rounded-full`    |              9999 px | Utility para formas pill/circulares.     |

Essas utilities são a escala-base existente, não uma nova escala própria aprovada pelo produto. Não é necessário criar aliases CSS para cada utility sem uma necessidade de interoperabilidade ou nome semântico.

## Variáveis de layout semântico já existentes

| Variável                        | Valor observado                                                       | Uso e status                                                                                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--layout-page-gutter`          | 16 px base, 24 px a partir de 640 px, 32 px a partir de 1024 px       | **Implementado** em containers da área de usuário, catálogo, proprietário, administração, detalhe de propriedade, rodapé e design system. Preserva gutters gerais de página; header, categoria de busca e preview de parceiro mantêm papéis locais distintos. |
| `--spacing-control-comfortable` | 44 px                                                                 | **Implementado** em `Button` médio, `TextInput` e `NativeSelect`; formaliza o `min-h-11` compartilhado sem mudar a escala base do Tailwind. O botão pequeno preserva 40 px.                                                                                   |
| `--radius-control`              | 12 px, alias de `--radius-xl`                                         | **Implementado** como `rounded-control` em `TextInput`, `NativeSelect` e `InstallmentPicker`; o catálogo confirmou `0.75rem` e 12 px computados.                                                                                                              |
| `--header-edge-spacing`         | 12 px por padrão, 32 px a partir de 640 px, 48 px a partir de 1440 px | Margem lateral responsiva do cabeçalho. **Observado** em `src/index.css`.                                                                                                                                                                                     |
| `--header-expanded-width`       | 1280 px                                                               | Limite configurado para o cabeçalho expandido. **Observado**; confirmar consumidores antes de generalizar.                                                                                                                                                    |
| `--header-compact-search-width` | 352 px por padrão, 256 px entre 640 e 900 px                          | Largura preferida da busca compacta, limitada pelo espaço disponível. **Observado**.                                                                                                                                                                          |
| `--search-bar-width`            | 850 px                                                                | Referência de largura da busca. **Observado**.                                                                                                                                                                                                                |
| `--search-calendar-width`       | 850 px                                                                | Referência de largura do calendário de busca. Compartilha valor com a barra, mas o papel é separado. **Observado**.                                                                                                                                           |
| `--search-calendar-gap`         | 24 px                                                                 | Separação entre meses do calendário. **Observado**.                                                                                                                                                                                                           |
| `--search-calendar-day-size`    | 52 px em telas maiores; 43 px até 639 px                              | Tamanho do dia do calendário. É uma medida de componente, não spacing geral. **Observado**.                                                                                                                                                                   |
| `--search-bar-segment-height`   | 64 px                                                                 | Altura mínima de segmentos da busca. É uma dimensão de componente. **Observado**.                                                                                                                                                                             |
| `--search-bar-segment-padding`  | 24 px                                                                 | Padding horizontal do segmento de busca. **Observado**.                                                                                                                                                                                                       |

Os valores vêm de `:root` e media queries de `src/index.css`; seus nomes já expressam layout ou domínio. Valores iguais não tornam os tokens intercambiáveis: largura de calendário e largura de busca podem evoluir separadamente.

## Bordas e raios observados

- O tema Tailwind instalado fornece `--radius-sm` 4 px, `--radius-md` 6 px, `--radius-lg` 8 px, `--radius-xl` 12 px, `--radius-2xl` 16 px e `--radius-3xl` 24 px.
- No código, os raios mais recorrentes são `rounded-xl`, `rounded-full`, `rounded-2xl` e `rounded-3xl`.
- **Alias semântico implementado:** `--radius-control` aponta para `--radius-xl` (12 px) e gera `rounded-control`. `TextInput`, `NativeSelect` e o acionador/opções de `InstallmentPicker` usam o alias para nomear a geometria comum de controles. O valor primitivo permanece no tema Tailwind; botões pill, badges, cards, diálogos e notices mantêm raios próprios.
- Foram encontrados raios arbitrários isolados como `rounded-[0.9rem]`, `rounded-[1.25rem]`, `rounded-[1.35rem]` e `rounded-[2rem]`. Não migrar automaticamente: verificar o componente, a geometria e o papel visual primeiro.
- Bordas de 1 px aparecem com frequência como utility padrão `border`. Isso não exige um token de espaçamento. Espessuras, cor, transparência e raio são decisões distintas.

## Direção de consolidação

1. **Manter Tailwind como escala primitiva de espaço.** A base de 4 px já está instalada. O algoritmo do squad que propõe uma grade de 4 px e mapeamento ao valor mais próximo é uma heurística; não é motivo para remapear automaticamente uma interface.
2. **Separar primitivos de papéis semânticos.** Utilities de 4/8/12/16/24 px são primitivas. Gutters responsivos, largura de conteúdo e espaçamento entre seções podem receber variáveis CSS quando repetidos por vários consumidores com a mesma função.
3. **Usar gap para espaçamento entre irmãos quando a composição permitir.** Manter margin quando ela expressa posicionamento ou fluxo próprio. Não trocar margin e padding apenas porque os valores numéricos coincidem.
4. **Preservar dimensões específicas de domínio.** Calendário, busca, checkout, header e painéis podem precisar de regras próprias por tarefa e viewport.
5. **Evitar `--spacing` override global neste estágio.** Isso mudaria a interpretação das utilities Tailwind por todo o frontend. Preferir a escala instalada e introduzir apenas tokens semânticos validados.
6. **Tratar raios arbitrários como candidatos de revisão.** Só consolidar quando os consumidores compartilharem geometria e propósito; os raios Tailwind já cobrem os valores recorrentes.
7. **Registrar exceções com fonte, consumidor, viewport e motivo.** Reavaliar quando o layout do componente ou seus consumidores mudar.

## Plano de trabalho

- [x] Confirmar versão do Tailwind e escala-base existente.
- [x] Levantar utilities e variáveis globais relacionadas a espaçamento, layout e raio.
- [x] Separar medidas primitivas, semânticas, de componente e valores arbitrários.
- [~] Validar os candidatos de tokens semânticos nos layouts renderizados em larguras representativas. Catálogo/header e raiz de resultados foram conferidos a 390/640/1024 px (16/24/32 px, sem overflow); a raiz de resultados também foi conferida a 390×380 px (8 px pela exceção de altura, sem overflow). Comparar consumidores autenticados ainda pendente.
- [x] Registrar um token semântico de layout onde usos compartilhados confirmaram a necessidade: gutter de página.
- [x] Nomear a altura mínima compartilhada de 44 px nos três primitivos de controle sem redefinir a escala base `--spacing` do Tailwind.
- [~] Pilotar raio semântico de controle: alias de 12 px aplicado em campo de texto, select nativo e seletor de parcelas. Em `/design-system#formularios`, browser mediu token `0.75rem` e `border-radius: 12px` nos controles. Outros papéis e consumidores autenticados permanecem sem auditoria visual.
- [~] Migrar em etapas os consumidores escolhidos. O container de resultados no `MainContentRouter.tsx` passou a usar o gutter geral, somando oito consumidores. Permanecem locais o gutter da navegação de categorias, header e preview de parceiro; a exceção de viewport baixa no catálogo (até 639 px/400 px de altura) reduz o gutter a 8 px por necessidade de espaço. A renderização da raiz foi medida mesmo com o estado de falha/vazio da API local; consumidores autenticados ainda faltam.
- [ ] Rever bordas, grids, larguras de conteúdo, breakpoints e safe areas em fluxos representativos.

## Referências de origem

O squad `design-markman` cobre spacing e radius em `checklists/ds-pattern-audit-checklist.md`, `tasks/ds-extract-tokens.md`, `data/token-mapping-reference.md`, `data/design-token-best-practices.md`, `docs/DS-CURATION-PIPELINE-PROPOSAL.md` e nos scripts `curate_spacing.cjs` e `curate_radius.cjs`, preservados em `.agents/skills/ux-ui-intelligence/references/design-markman/source.zip`. Os scripts pressupõem os artefatos de extração do ambiente upstream e não foram executados neste projeto.
