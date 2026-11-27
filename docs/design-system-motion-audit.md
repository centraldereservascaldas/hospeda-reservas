# Auditoria de motion do frontend principal

## Escopo e método

- Escopo: frontend React/TypeScript principal integrado à API Laravel, folhas globais em `src/index.css` e interações correspondentes em `src/`.
- Fora de escopo: blog Astro, animações de terceiros não presentes no checkout local e efeitos nativos do navegador que não sejam configurados pelo produto.
- Método: leitura estática dos estilos e componentes, busca por `animation`, `transition`, View Transitions, utilitários Tailwind e `prefers-reduced-motion`.
- Situação: inventário estático inicial. Ele identifica padrões e fontes, mas não prova fluidez, timing percebido, cancelamento em todos os fluxos ou desempenho em dispositivos físicos.
- Vocabulário: **observado** significa encontrado no código; **proposto** é uma recomendação ainda não adotada como regra; **implementado** descreve uma mudança no código; **validado** exige método e ambiente registrados para o critério específico.

## Inventário observado

| Padrão e fonte                                                                   | Movimento encontrado                                                                                                                                                                | Evidência de movimento reduzido                                                                                                            | Leitura e estado                                                                                                                               |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendário de busca, `src/index.css` (`.search-calendar-day`)                    | 150 ms `ease` para sombra e cor; pressão usa `scale(0.94)`.                                                                                                                         | A transição é removida e o transform de `:active` é zerado.                                                                                | **Observado.** Feedback de interação localizado; sem escala compartilhada.                                                                     |
| Painel compartilhado da busca, `src/index.css` (`.search-modal-shared-panel`)    | 260 ms para dimensões e padding; conteúdo entra em 180 ms com opacidade e pequeno deslocamento/escala.                                                                              | Animação e transição são removidas.                                                                                                        | **Observado.** Preserva contexto, mas interrupção/reabertura deve ser verificada no navegador.                                                 |
| Utilitário `.animate-in`, `src/index.css`                                        | Entrada com duração configurável, padrão 200 ms, `ease-out`.                                                                                                                        | A regra global remove animações.                                                                                                           | **Observado.** A duração do utilitário pode variar por consumidor.                                                                             |
| Trilha de categorias, `src/index.css` (`.category-filter-track`)                 | Transform em 900 ms com curva própria.                                                                                                                                              | Duração é reduzida globalmente; `will-change` volta a `auto`.                                                                              | **Observado.** Exceção longa, precisa ser julgada pelo comportamento real da trilha.                                                           |
| Campos e método de pagamento, `src/index.css`                                    | Campos usam 150 ms para borda/sombra; método de pagamento usa 150 ms em borda, fundo, sombra e transform.                                                                           | A regra global reduz a duração a praticamente zero.                                                                                        | **Observado.** Feedback local de controle.                                                                                                     |
| CTA de pagamento de reserva existente, `src/index.css` (`checkout-submit-pulse`) | Havia pulso de sombra infinito de 3,2 s.                                                                                                                                            | A regra global o desligava; foco, hover e pressão pausavam enquanto ativos.                                                                | **Implementado:** removido nesta alteração por ser decorativo e contínuo. A hierarquia da CTA e o feedback acionado por interação permanecem.  |
| Busca em destaque, `src/index.css`                                               | Segmento ativo muda em 260 ms; popover entra em 220 ms e sai em 140 ms; a busca compacta entra em 280 ms.                                                                           | As transições e animações correspondentes são removidas.                                                                                   | **Observado.** Valores e curvas são específicos por interação.                                                                                 |
| Indicadores compartilhados de categoria/filtro, `src/index.css`                  | Seleção do header usa posição/tamanho em 320 ms; indicador de filtros usa transform em 280 ms; opacidade entre 120 e 150 ms.                                                        | Transições são removidas e `will-change` é limpo.                                                                                          | **Observado.** Movimento orienta a seleção; precisa de validação com mudanças rápidas de categoria.                                            |
| Painel compartilhado de busca, `src/index.css`                                   | Posição/tamanho em 360 ms, raio em 280 ms, opacidade/transform em 160 ms.                                                                                                           | Transição é removida.                                                                                                                      | **Observado.** Saída desativa pointer events; a relação com foco e desmontagem deve ser verificada por estado.                                 |
| View Transitions, `src/App.tsx`, `src/components/Header.tsx` e `src/index.css`   | Busca compartilhada: grupo 420 ms, conteúdo antigo 150 ms, novo 220 ms com 80 ms de atraso. Conteúdo de descoberta: grupo 380 ms, saída 150 ms, entrada 280 ms com 60 ms de atraso. | O app não inicia a transição se a preferência reduzida estiver ativa; o CSS também remove animações dos pseudo-elementos.                  | **Observado.** Há fallback sem View Transitions e proteção para transição já ativa. Testar interrupção e navegação repetida continua pendente. |
| Recolhimento da barra de filtros, `src/index.css`                                | `grid-template-rows` em 400 ms a partir de 640 px.                                                                                                                                  | Transição é removida.                                                                                                                      | **Observado.** Mudança de layout; conferir foco e conteúdo durante recolhimento.                                                               |
| Spinners e ping, componentes React com utilitários Tailwind                      | `animate-spin` em estados de carregamento; `animate-ping` no indicador da assistente.                                                                                               | A regra global `animation: none` desativa a animação, mas deixa o elemento visual estático; textos de status precisam continuar presentes. | **Observado.** Confirmar cada estado para que o significado não dependa do ícone animado.                                                      |
| Scroll iniciado pelo app, `src/utils/motion.ts` e consumidores                   | Rolagem suave quando movimento normal é permitido.                                                                                                                                  | Usa `behavior: auto` quando `prefers-reduced-motion` está ativo.                                                                           | **Observado.** Helper compartilhado já tem testes direcionados no projeto.                                                                     |

O inventário é representativo dos mecanismos e casos específicos encontrados. Classes genéricas `transition` e variantes Tailwind também aparecem em muitos componentes; a busca estática não conta instâncias com precisão nem prova que todas são distintas visualmente. Consultar os arquivos de origem antes de generalizar ou consolidar qualquer padrão.

## Candidatos a tokens, ainda não aprovados

O código contém valores próximos, mas não equivalentes: transições curtas entre 120 e 220 ms, painéis e seleções entre 260 e 360 ms, mudanças de layout entre 380 e 420 ms e exceções como 900 ms. Esses agrupamentos são **propostos para investigação**, não uma escala normativa.

Antes de criar tokens, comparar o efeito e a tarefa de cada consumidor. Uma futura proposta deve registrar nome semântico, valor observado, usos, exceções e alternativa em movimento reduzido. Não migrar valores apenas para reduzir a quantidade de números.

## Contrato recomendado para novos padrões

Antes de adicionar motion, registrar:

- **Propósito:** orientação, relação de causa e efeito, atenção necessária ou feedback de estado. Se nenhum propósito ajudar a tarefa, manter a interface estática.
- **Alvo e propriedades:** elementos que se movem e propriedades animadas; evitar animar layout extenso sem necessidade.
- **Gatilho e duração:** evento que inicia, se repete, quando termina e se pode ser interrompido ou revertido.
- **Estado durável:** resultado e status precisam estar disponíveis sem depender do término da animação.
- **Acessibilidade:** preferência reduzida, semântica, foco, teclado e mensagem textual para status relevante.
- **Resiliência:** comportamento com ativação repetida, fechamento rápido, navegação, falha ou resposta tardia.
- **Custo visual/técnico:** viewport/dispositivo inspecionado, conteúdo deslocado, layout/pintura e eventual custo de asset ou biblioteca.

Para exemplos da documentação, declarar se a amostra executa um fluxo real ou apenas demonstra CSS. Fornecer controle de reprodução para animações não contínuas. Não reproduzir automaticamente efeitos decorativos em loop.

## Governança proporcional

- Uma mudança de motion entra pelo fluxo normal de revisão do frontend. A pessoa responsável pelo componente revisa implementação e estados; decisões que alterem a linguagem visual compartilhada devem ser revisadas pela pessoa responsável pelo produto/design, quando definida.
- Cada proposta registra motivo, componente/rota, evidência, alternativas consideradas, estado de movimento reduzido, validação feita, limitações e responsável pela decisão.
- Exceções locais continuam válidas se documentarem contexto e condição de revisão. Não precisam ser convertidas em tokens ou primitivas compartilhadas.
- Rever a decisão quando o componente mudar de fluxo, surgir repetição em outros domínios, a preferência reduzida mudar, ou uma falha de acessibilidade/performance for reportada.
- Uma alteração de token compartilhado exige busca de consumidores, plano de migração compatível e verificação nos fluxos afetados. Não há política de release/versionamento separada porque o frontend ainda não publica uma biblioteca de componentes independente.

## Validação necessária para fechar a auditoria

- [ ] Reproduzir entradas e saídas de busca, filtros e navegação com ativação repetida e fechamento durante a transição.
- [ ] Comparar os mesmos estados com `no-preference` e `prefers-reduced-motion: reduce` no navegador.
- [ ] Confirmar foco e acionabilidade durante a entrada/saída de diálogos, popovers e filtros recolhidos.
- [ ] Confirmar que estados de carregamento continuam compreensíveis quando a rotação/pulsação do ícone é desativada.
- [ ] Inspecionar layout, pintura e resposta em aparelho representativo para a trilha de categorias e View Transitions.
- [ ] Só então aprovar tokens ou alterações adicionais de motion.

## Histórico

- 2026-11-27: inventário estático inicial e documentação de decisões; pulso infinito da CTA de pagamento removido; seção viva de motion adicionada ao design system interno. A rota e seus três exemplos foram inspecionados no Chrome desktop; lint e build Vite passaram. A preferência reduzida foi descrita pelo CSS, mas a comparação visual pareada com essa preferência segue pendente.
