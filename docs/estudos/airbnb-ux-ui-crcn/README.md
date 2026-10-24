# Estudo da jornada de reserva do Airbnb para o CRCN

**Status:** em andamento
**Observado em:** 18/10/2026
**Referência:** Airbnb Brasil em Chrome, perfil “Caldas”, desktop
**Escopo:** UX, UI, fluxo de compra e oportunidades de arquitetura de componentes para a Central de Reservas Caldas Novas.

## Objetivo

Documentar padrões úteis da jornada de reserva do Airbnb e traduzi-los em recomendações compatíveis com o produto Hospeda Reservas. O Airbnb é referência de estudo, não especificação a copiar: as decisões devem respeitar o inventário, as regras comerciais, a integração Stays, o checkout hospedado e a identidade do CRCN.

**Princípio de transferência:** para cada padrão, identificar (1) a necessidade do hóspede, (2) a evidência observada, (3) por que a solução pode ajudar e (4) como adaptá-la e validar no CRCN. O objetivo é aprender e modelar boas práticas, não reproduzir telas literalmente nem inferir a implementação proprietária do Airbnb. Uma semelhança visual só é útil quando atende às regras de inventário, operação, marca e pagamento do CRCN.

## Progresso da checklist

- [x] Busca, resultados, detalhe e transparência de preço observados na interface.
- [x] Checkout autenticado observado até a etapa anterior à confirmação: resumo editável, métodos de pagamento apresentados e ausência de campos adicionais de hóspede nesta tela registrados sem copiar dados pessoais/financeiros.
- [x] Pós-pagamento sem submissão: estados de pedido, confirmação, cobrança e recuperação foram mapeados com a Central de Ajuda oficial; a aparência/texto integral das telas após submissão segue não observado.
- [x] Componentização e responsabilidades de estado mapeadas a partir do código atual do CRCN; sem inferências sobre a arquitetura proprietária do Airbnb.
- [x] Recomendações, critérios preliminares e plano incremental incluídos.
- [x] Responsividade e interação examinadas por amostra em 390 × 844 e desktop: foco, teclado, Escape, popovers e estados de carregamento/indisponibilidade; dispositivo físico e auditoria assistiva completa permanecem fora do escopo desta inspeção.
- [x] Documento revisado e verificado para problemas de whitespace; sem alteração de código da aplicação.

## Método e limite atual

Foi realizada uma inspeção manual da interface visível no navegador: busca, resultados, detalhe do anúncio, detalhamento de preço e início do checkout. A pesquisa usou Caldas Novas, duas pessoas, de 6 a 8 de novembro de 2026. Não foram enviados dados pessoais, não houve criação de conta, reserva ou pagamento.

Os itens em “Jornada observada” descrevem o que a interface apresentou. Interpretações estão qualificadas como possibilidade ou sinal; as recomendações são propostas para validar no CRCN, não fatos sobre a implementação interna do Airbnb.

A autenticação foi feita pelo usuário no perfil Chrome “Caldas”. A inspeção continuou na página **“Confirmar e pagar”** e parou antes do botão final, que combina concordância com termos e envio da confirmação/pagamento. Não foram inseridos dados, alterada a forma de pagamento nem acionado esse botão.

## Jornada observada

### 1. Busca

- A navegação principal separa “Tudo”, “Acomodações”, “Experiências” e “Serviços”. A escolha de “Acomodações” muda o contexto sem abrir uma página intermediária.
- A busca agrupa destino, período e hóspedes em um único controle horizontal no desktop; os campos abrem popovers contextualizados.
- Ao digitar “Caldas Novas, Goiás”, o campo sugere a cidade e pontos/empreendimentos relevantes. A seleção explícita da cidade reduz ambiguidade.
- O calendário mostra dois meses, permite datas exatas ou flexíveis e apresenta indicação visual de datas com menor/maior preço.
- O seletor de hóspedes apresenta adultos, crianças, bebês e animais em linhas independentes, com limites e explicações por faixa etária.
- A consulta manteve destino, datas e hóspedes na URL e apresentou esses filtros resumidos no cabeçalho dos resultados.

### 2. Resultados

- A página informou “Mais de mil acomodações em Caldas Novas”, com busca resumida e filtros rápidos visíveis (pets, estacionamento, banheira, cozinha, TV), além de acesso a filtros completos.
- Os cartões combinaram imagem em proporção consistente, favorito, categoria/local, nota e quantidade de avaliações, nome do anúncio, capacidade e preço total para o período selecionado. Alguns anúncios também mostraram preço anterior, desconto, parcelamento e cancelamento gratuito.
- Os cartões alternam fotos com controle acessível e etiquetas como “Preferido dos hóspedes”. Esses selos acrescentam contexto de confiança sem exigir abrir cada detalhe.
- O mapa ocupava grande parte da coluna direita no desktop. Na captura inicial, ainda estava em carregamento/placeholder, enquanto os cartões já estavam renderizados. Isso pode criar uma área vazia perceptível se o mapa demorar.
- Quando uma acomodação selecionada não estava disponível no período, a tela apresentou recomendações para datas próximas e outras acomodações disponíveis. A alternativa fica próxima ao contexto que causou o impedimento.

### 3. Detalhe da acomodação

- A galeria começa com uma composição assimétrica: foto principal grande e quatro imagens secundárias, com ação “Mostrar todas as fotos”. Compartilhar e salvar ficam alinhados ao título.
- O conteúdo começa com tipo e localização, capacidade/quartos/camas/banheiros, distintivo e avaliações. Em seguida aparecem anfitrião, destaques, descrição, quartos, comodidades, acessibilidade, calendário, avaliações, mapa/localização, anfitrião e políticas.
- A reserva fica em um painel lateral destacado, com preço total e desconto, datas e hóspedes, ação de reserva e mensagem explícita de que ainda não haverá cobrança.
- A página usa sinais de confiança contextualizados: superhost, histórico de avaliações, distribuição por critérios, destaques extraídos das avaliações e resposta do anfitrião.
- Regras e condições importantes (cancelamento, horários, limite de hóspedes) ficam agrupadas em “O que você deve saber”. A descrição longa também pode conter custos/regras locais — neste anúncio havia taxa única de check-in cobrada na recepção; esse valor não apareceu no resumo do preço online.
- O calendário da acomodação sinaliza indisponibilidade e requisitos mínimos de noites. No anúncio visto, algumas datas não aceitavam check-in ou indicavam estadia mínima.

### 4. Transparência de preço

- O resultado e o detalhe mostraram o total do período sem exigir navegar até pagamento.
- O detalhamento abriu um popover separado, mostrando duas noites × R$ 437,85 (R$ 875,70), duas linhas de “Oferta especial” (-R$ 66,15 e -R$ 65,21) e total online de R$ 744,34. O cartão/painel arredondou para R$ 745; a interface também apresentou 6 parcelas sem juros de R$ 124,06.
- A repetição do preço no cartão, painel lateral e checkout mantém a comparação visível ao longo da jornada. Ao mesmo tempo, diferença entre valor arredondado e centavos precisa ser explicada de forma consistente no CRCN.
- A descrição do mesmo anúncio informa uma taxa única de check-in de R$ 77, paga diretamente na recepção do condomínio, fora do total online detalhado. O valor foi localizado no texto longo, não na discriminação do preço. Para comparar o custo completo da estadia, essa obrigação deveria ser apresentada antes da decisão, com distinção clara entre pagamento online e pagamento no local.

### 5. Checkout observado até agora

- A ação “Reservar” abriu uma página dedicada, “Confirmar e pagar”, mantendo a acomodação, datas, hóspedes, cancelamento e total no resumo.
- A página divide o avanço em “Entrar ou cadastrar-se”, “Adicione uma forma de pagamento” e “Revise sua reserva”.
- O resumo mostra a política de cancelamento, permite alterá-la, permite editar datas e hóspedes, discrimina valores e mantém moeda selecionável.
- O preço e a chamada “Você ainda não será cobrado” no detalhe tornam explícito o próximo passo sem sugerir que a reserva já está confirmada.
- A página de checkout inicialmente exigiu autenticação. Depois que o usuário entrou, a página apresentou diretamente formas de pagamento e revisão da reserva; não apareceu formulário de dados do hóspede nesta etapa.

#### Continuação após autenticação

- Com a sessão autenticada, o checkout mostrou uma lista de formas de pagamento salvas, incluindo uma opção expirada desabilitada, e a possibilidade de adicionar cartão de crédito ou pagar por Pix. A documentação registra apenas esses padrões de interface; nenhum identificador, final de cartão ou dado financeiro da conta foi copiado.
- O cartão selecionado por padrão foi mantido sem interação. O seletor de formas de pagamento separa opções salvas de novas opções e informa quando uma forma está indisponível.
- A interface ofereceu parcelamento e ação “Alterar”; no resumo, continuaram visíveis as duas noites, os descontos, o total, moeda, datas, hóspedes e política de cancelamento. Datas, hóspedes e política podiam ser alterados antes de confirmar.
- Antes da ação final, “Termos de reserva” abre uma explicação com links para os termos de pagamento e regras para hóspedes, além de acesso à política de reembolso/remarcação e cobrança por danos. O resumo da política informa reembolso integral se o anfitrião cancelar antes do check-in e prazo de 72 horas para relatar problemas de viagem; detalhes e elegibilidade dependem dos termos completos.
- No detalhe do preço, a expansão apresentou a discriminação exata para essas datas. Escape fechou o popover e retornou o foco ao botão que o abriu, confirmando comportamento de foco nesse controle específico.
- A ação final “Confirmar e pagar” vinha acompanhada de texto de concordância com os termos de reserva e Termos de Serviço. Por isso, a inspeção parou sem ativá-la. Não foram observados os dados de cobrança posteriores, a submissão, a pré-reserva nem uma tela de sucesso.
- Após autenticar, o Airbnb também apresentou na página inicial um atalho “Continuar buscando” com destino, datas e número de hóspedes anteriores. Isso demonstra retorno contextual sem necessidade de reconstruir a consulta.

#### Estados posteriores descritos publicamente pelo Airbnb

O fluxo visual para depois do botão final não foi acessado. Para não efetuar uma reserva, consultei a Central de Ajuda oficial apenas para entender estados e regras publicados. O conteúdo abaixo é documentação de suporte, não observação direta da interface de checkout nem garantia de que todos os anúncios/formas de pagamento sigam o mesmo caminho.

| Estado descrito na Central de Ajuda | Sinal ou ação publicada | O que modelar no CRCN |
| --- | --- | --- |
| Pedido aguardando anfitrião | O anfitrião tem até 24 horas para responder; se recusar ou expirar, a pessoa não é cobrada e pode reservar outra acomodação. | Diferenciar pedido enviado de reserva confirmada; mostrar status atual, prazo, que nenhuma cobrança ocorreu e um caminho para continuar a busca se for recusado/expirar. Não chamar isso de “pré-reserva” no CRCN sem confirmar se o backend realmente retém disponibilidade. |
| Reserva confirmada | A confirmação pode aparecer em Mensagens/Viagens e pode gerar email, SMS e push conforme configurações. Em muitas reservas a cobrança ocorre quando a reserva é confirmada, mas depende do tipo e forma de pagamento. | Mostrar confirmação somente após resposta autoritativa do backend/provedor; informar status e próximo passo; não usar “confirmada” enquanto pagamento/reserva ainda estiver pendente. |
| Aguardando pagamento ou dados | A ajuda descreve uma etapa temporária em que dados de pagamento ou identificação faltantes podem ser atualizados; o prazo publicado para pagamento pendente pode chegar a 24 horas. | Dizer exatamente qual ação falta, até quando, se datas estão retidas e o que ocorre ao expirar; oferecer retomada segura sem criar pedidos duplicados. |
| Segundo pagamento não processado (plano parcelado/programado) | A pessoa é avisada e solicitada a tentar o pagamento; se não regularizar em até 72 horas, a reserva é cancelada e eventual reembolso depende da política de cancelamento. | Separar falha de parcela de falha de reserva inicial; dar nova tentativa, prazo e efeito da política em linguagem clara. |
| Não há reserva visível/sem confirmação | A ajuda orienta verificar conta, email e pagamentos recusados/estornados; a reserva pode não ter sido concluída ou pode ter sido cancelada, com suporte como alternativa. | Criar recuperação que consulte o estado do pedido no backend antes de permitir repetição, explicando cobrança pendente/recusada e canal de suporte. |

Esses estados ajudam a desenhar o mapa conceitual de pós-compra, mas não autorizam copiar prazos/regras para o CRCN: adotar apenas o que corresponder ao contrato real de Stays, adquirente, política comercial e termos locais. As regras publicadas pelo Airbnb podem mudar e variam por produto, localidade e forma de pagamento.

As referências específicas são: [status do pedido e confirmação para hóspedes](https://www.airbnb.com.br/help/article/234) e [prazo de resposta/expiração](https://www.airbnb.com.br/help/article/75); [pagamento pendente, consultado na perspectiva de anfitrião](https://www.airbnb.com.br/help/article/2411); [momento da cobrança](https://www.airbnb.com.br/help/article/92); [falha de pagamento programado](https://www.airbnb.com.br/help/article/3783); e [reserva não encontrada ou sem confirmação](https://www.airbnb.com.br/help/article/2064). Essa documentação não fornece captura do fluxo visual após o botão final.

## Arquitetura atual do CRCN relacionada

O frontend documentado no repositório usa React 19, TypeScript, Vite e Tailwind CSS. A família de acomodação está em `src/components/property/`, busca em `src/components/search/` e checkout em `src/components/booking/`.

- `StaysSearchWidget.tsx` concentra busca, campos de destino, calendário e seletor de hóspedes com variantes de apresentação; propaga destino, datas, hóspedes e identificador de acomodação para a busca.
- `PropertyDetailModal.tsx` coordena datas, hóspedes, galeria, disponibilidade e orçamento. Já delega seções, cabeçalho, galeria, calendário, seletor de hóspedes e painel de reserva a componentes irmãos.
- `PropertyBookingPanel.tsx` apresenta valor de referência ou cotação ao vivo, datas, hóspedes, estado de disponibilidade/cotação e ação de continuação. A ação só é liberada com datas explicitamente selecionadas, intervalo disponível e cotação ao vivo confirmada; dados simulados não podem iniciar reserva.
- `CheckoutModal.tsx` busca termos e prontidão de compra, revalida orçamento, pede aceitação de termos e dados do hóspede e previne envio duplicado. A continuidade depende de checkout habilitado, condições válidas e método de pagamento disponível.
- `crcnBackendApi.ts` mantém chamadas e contratos HTTP; valida respostas externas antes de disponibilizá-las à interface.

Essa decomposição existente é uma boa base para aprender com o Airbnb sem recriar uma página monolítica. A jornada observada sugere manter estado compartilhado de busca/datas/hóspedes no nível de composição e deixar controles visuais e seções como componentes de domínio com props tipadas. Busca, disponibilidade, preço e pagamento devem permanecer estados distintos, com o backend como autoridade para cotação, termos e prontidão.

## Recomendações preliminares para o CRCN

| Padrão observado | Necessidade que atende / por que pode ajudar | Modelo para o CRCN |
| --- | --- | --- |
| Preço total em resultados e detalhe | Ajuda a comparar opções pelo custo da viagem, reduzindo surpresa tardia; noites e descontos dão contexto ao total. | Mostrar total cotado para as datas e número de noites, discriminar taxas online e no local e usar a cotação atual confirmada pelo backend. |
| Busca resumida e editável | Mantém orientação sobre a consulta e reduz esforço para corrigir um filtro sem recomeçar. | Preservar destino, datas e hóspedes no estado/URL; permitir edição mantendo os demais critérios. |
| Cartões comparáveis e sinais de confiança | Permite filtrar opções mentalmente e avaliar credibilidade antes de abrir cada acomodação. | Priorizar foto, nome, localização/condomínio, capacidade, avaliação com contagem e preço; exibir selos somente quando sustentados por dados do CRCN. |
| Alternativas junto da indisponibilidade | Dá um próximo passo no momento de fricção e evita uma busca sem saída. | Sugerir datas próximas e acomodações similares, mantendo destino, hóspedes e filtros válidos. |
| Galeria, fatos e reputação antes da decisão | Responde perguntas visuais e práticas antes de pedir compromisso. | Hierarquizar galeria, identidade, capacidade, avaliações, comodidades, regras e painel de orçamento, com dados validados do catálogo. |
| Regras e detalhamento acessíveis no contexto da compra | Facilita revisar o que está incluído e as condições antes de avançar. | Separar total pago online, custos no local, caução, regras de lazer, horários, cancelamento e requisitos mínimos antes do checkout. |
| Resumo editável no checkout | Permite corrigir datas, hóspedes ou política sem abandonar a revisão do pedido. | Manter resumo editável e apresentar etapas/termos; explicar com precisão quando o CRCN cria pedido, pré-reserva ou inicia cobrança. |
| Estados e interações previsíveis | Controles com foco e feedback claro reduzem incerteza e tornam a jornada operável por teclado. | Cobrir cotação consultando/confirmada/falhou/desatualizada; exigir disponibilidade/preço atuais e implementar nome, semântica, foco, Escape, teclado, responsividade e `prefers-reduced-motion` em diálogos/popovers. |

Essas transferências são hipóteses para o CRCN, não prova de que o Airbnb aumenta conversão por esses meios. Devem ser priorizadas conforme as dúvidas e falhas observadas nos dados e testes do Hospeda Reservas.

## Proposta de componentização para o CRCN

Esta proposta deriva do fluxo observado e das fronteiras que já existem no código do CRCN; não representa conhecimento sobre os componentes internos do Airbnb.

| Área | Responsabilidade de interface sugerida | Base existente no CRCN |
| --- | --- | --- |
| Busca contextual | Resumo editável de destino, datas e hóspedes; popovers controlados; estado serializável na URL | `StaysSearchWidget`, `useAccommodationSearch`, `useSearchUrlSync` |
| Resultados | Cabeçalho com quantidade e filtros ativos, cartões comparáveis, estados de carregamento/vazio/erro e alternativas de data | `PropertyCatalogGrid`, `PropertyCard`, `ActiveSearchFilters`, `AvailabilitySearchState` |
| Mapa | Painel sincronizado com resultados, com placeholder explícito e foco/seleção compartilhados | `InteractiveMap` |
| Detalhe | Galeria e conteúdo por seções; dados do anúncio tipados; navegação acessível entre overview, avaliações, localização e políticas | `PropertyDetailModal` e seções em `property/` |
| Reserva | Painel resumido persistente; seletor de datas/hóspedes; estados separados para disponibilidade, cotação e erro | `PropertyBookingPanel`, `PropertyDatePickerDialog`, `PropertyGuestSelectorDialog`, `usePropertyAvailability` |
| Checkout | Resumo editável, termos, dados exigidos, meios de pagamento e estados de envio/erro claramente compostos | `CheckoutModal`, `CheckoutResumePage`, APIs de `crcnBackendApi` |

Manteria busca, seleção de datas/hóspedes, disponibilidade, orçamento e pagamento como estados coordenados pelo controlador da jornada, mas com fontes de verdade distintas. Componentes de apresentação recebem props explícitas e emitem intenções; o backend confirma preço, elegibilidade, termos e transições do pedido. A próxima extração só deve ocorrer quando uma responsabilidade concreta justificar a nova fronteira, respeitando a decomposição já feita em `property/`, `search/` e `booking/`.

## Critérios preliminares para uma implementação futura

- Alterar destino, datas ou hóspedes preserva os demais filtros e mantém estado restaurável na URL.
- Resultados apresentam preço total para o período solicitado, com moeda e número de noites, e o total confere com o resumo de checkout.
- Datas indisponíveis não permitem avançar; o estado explica o bloqueio e oferece alternativas relevantes sem perder contexto.
- O detalhe explicita taxas pagas no local, cancelamento, regras de condomínio e requisitos de estadia antes da ação de continuar.
- A continuidade do CRCN depende de cotação e disponibilidade atuais validadas pelo servidor; falhas oferecem nova tentativa e não parecem confirmação.
- O resumo de checkout permite revisar datas/hóspedes e identifica quando o usuário aceita termos, cria pré-reserva ou inicia cobrança.
- Campos e diálogos têm rótulos, semântica, foco inicial/retorno, Escape e suporte a teclado; a jornada funciona em viewport móvel e respeita movimento reduzido.
- Nenhuma tela anuncia reserva confirmada antes de confirmação do backend; falhas de pagamento deixam claro se existe pedido pendente e qual ação recupera o fluxo.

## Acessibilidade e interação observadas

- Na página de detalhe, a navegação inicial por Tab exibiu contorno de foco visível no logotipo e no controle de busca. Foi uma amostra curta em desktop, não uma auditoria completa de teclado.
- A galeria completa abriu uma experiência de tour com navegação por categorias. Pressionar Escape fechou o tour e devolveu o foco ao controle “Mostrar todas as fotos”, que o havia aberto.
- No seletor de busca, as instruções do calendário informaram setas para navegar por dia/semana, Page Up/Down para mês, Enter para selecionar e Escape para limpar. Após Escape fechar o painel sem submeter uma nova busca, o foco voltou ao botão que resume a busca.
- A árvore de acessibilidade observada expôs o tour como container e seus controles com nomes; isso não basta para concluir se a semântica modal é adequada em leitores de tela. Vale validar comportamento e anúncio com tecnologia assistiva antes de transformar em recomendação de implementação.
- Em 390 × 844, o detalhe priorizou a foto principal e trouxe título, capacidade, reputação e CTA fixo de preço/reserva na base; o restante do conteúdo segue verticalmente. O CTA permaneceu visível junto do início do detalhe.
- Nos resultados móveis, a busca compacta manteve datas e hóspedes visíveis; filtros rápidos ficaram em faixa horizontal, o mapa ocupou o fundo e a lista surgiu em painel inferior que pode ser expandido, com navegação inferior persistente. O painel de busca abriu abas verticais para Acomodações/Experiências/Serviços; o calendário mostrou mais de dois meses em rolagem e instruções de teclado; datas flexíveis ofereceram durações e meses em chips.
- Essas observações confirmam adaptação estrutural nesta largura, mas não cobertura completa de aparelhos, zoom, orientação, leitores de tela ou conteúdo extremo.

## Plano incremental sugerido para o CRCN

O plano ordena o trabalho por risco para a decisão do hóspede e dependência técnica. São recomendações para planejamento, não alterações implementadas neste estudo.

1. **P0 — Confiança no preço e na disponibilidade.** Confirmar com Stays/backend total, noites, taxas pagas online/no local, regras e estado de disponibilidade. Manter cotação consultando/confirmada/desatualizada/falhou e impedir continuação com dados antigos. Cobrir sucesso, timeout, indisponibilidade e nova tentativa.
2. **P1 — Busca, comparação e alternativas.** Preservar destino/datas/hóspedes na URL, permitir edição contextual e apresentar cartões comparáveis com atributos comprovados. Quando não houver resultado, sugerir datas próximas e alternativas sem apagar filtros aplicáveis.
3. **P2 — Detalhe e decisão informada.** Organizar galeria, localização, capacidade, avaliações, comodidades e políticas; destacar restrições e custos locais antes da continuação. Manter o painel de orçamento coerente com a cotação confirmada.
4. **P3 — Checkout resiliente e inclusivo.** Reutilizar o resumo editável com etapas claras, termos e estados de envio/erro; explicitar quando há pré-reserva e cobrança. Validar teclado/foco, semântica dos diálogos, retorno de foco, Escape e layouts em larguras móveis com leitor de tela e movimento reduzido.
5. **P4 — Aprendizado com uso real.** Após instrumentação compatível com privacidade, revisar métricas de erro de cotação, indisponibilidade, retorno à busca, abandono por etapa, contatos sobre preço/regras e sucesso de tarefas em testes moderados. Definir metas com a linha de base do CRCN antes de comparar mudanças.

Cada etapa deve preservar os contratos `/api/*`, a cotação do servidor e o checkout hospedado existente, salvo decisão técnica explícita. A proposta de componentes acima serve como mapa de responsabilidades; evitar extração sem fronteira de domínio concreta.

## Limites e pontos que dependem de outro contexto

O checkpoint autenticado cobriu a página até o botão final. O Airbnb não exibiu campos adicionais de dados do hóspede nessa etapa. As telas e mensagens visuais depois de “Confirmar e pagar” não puderam ser observadas sem efetuar a operação; os estados de pedido, confirmação, cobrança e recuperação foram complementados por documentação pública, identificada separadamente na seção anterior. Não foi submetida a reserva, aceito o compromisso final ou efetuado pagamento.

A Central de Ajuda complementa as regras de status e pagamento, mas não substitui observar a tela resultante. Para validar mensagens, erro de cobrança e recuperação visualmente sem usar a conta real, seria necessário um ambiente de demonstração/sandbox oficialmente disponibilizado ou capturas fornecidas pelo usuário sem dados pessoais. Até lá, não presumir textos, hierarquia ou aparência das telas do Airbnb após o botão final.

O estudo responsivo foi feito por viewport de navegador, não em dispositivo físico. A revisão de teclado foi amostral e não substitui auditoria com leitores de tela. Antes de converter as recomendações em código, validar os fluxos prioritários com hóspedes do CRCN e confirmar as regras operacionais com a equipe responsável.

## Evidências consultadas

- Busca Airbnb Brasil: [Caldas Novas, 6–8 de novembro de 2026, 2 adultos](https://www.airbnb.com.br/s/Caldas-Novas--Goi%C3%A1s/homes?date_picker_type=calendar&checkin=2026-11-06&checkout=2026-11-08&adults=2&refinement_paths%5B%5D=%2Fhomes&search_type=search_query).
- Detalhe do anúncio observado: [Laguna Flat 334 • Vista Lago • Nascer do Sol & Resort](https://www.airbnb.com.br/rooms/1643463222845152517?adults=2&check_in=2026-11-06&check_out=2026-11-08).
- Central de Ajuda consultada em 18/10/2026: [status da reserva do hóspede](https://www.airbnb.com.br/help/article/234), [quando o pagamento é cobrado](https://www.airbnb.com.br/help/article/92), [prazo para resposta do anfitrião](https://www.airbnb.com.br/help/article/75), [pagamento pendente na perspectiva do anfitrião](https://www.airbnb.com.br/help/article/2411), [pagamento programado e falha da segunda parcela](https://www.airbnb.com.br/help/article/3783) e [reserva não encontrada](https://www.airbnb.com.br/help/article/2064). Esta fonte documenta regras e caminhos de suporte, não capturas de telas pós-compra.
- Código local consultado: `src/components/search/StaysSearchWidget.tsx`, `src/components/property/PropertyDetailModal.tsx`, `src/components/property/PropertyBookingPanel.tsx`, `src/components/booking/CheckoutModal.tsx` e `src/services/crcnBackendApi.ts`.

As observações descrevem a interface e conteúdo apresentados nessa sessão e podem variar por anúncio, conta, disponibilidade, localização e versão do Airbnb. Não foi feita análise do código-fonte proprietário do Airbnb; comentários sobre implementação são recomendações para a arquitetura CRCN, não afirmações sobre a arquitetura interna do Airbnb.
