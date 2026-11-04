# E7 — Comparação integrada controlada

Status: em execução, sem novo deploy. A primeira comparação identificou regressão de CLS e foi rejeitada. O ajuste ainda precisa da amostra completa e das jornadas de busca/detalhe/interação.

## Versões e método

O código da E0 (`76cd4cf684b09e079ba562abcf75c720dfc48702`) foi reconstruído em diretório temporário com as mesmas dependências do candidato frontend `1428413`. `package.json` e lockfile não diferem entre essas versões. Ambos os builds não tinham arquivos `.env*` nem variáveis `VITE_*` herdadas. Os hashes dos bundles diferem dos publicados, portanto esta comparação não reproduz byte a byte os artefatos de produção.

A fixture entrega 30 acomodações fictícias, preços coerentes com o período e resposta de API após 450 ms. Ambos os braços recebem os mesmos headers de cache: assets imutáveis e API sem cache. Imagens externas são substituídas por SVG local, sem interceptação Playwright, preservando o cache HTTP. Uma execução piloto com routing foi descartada porque routing desativa o cache, inclusive para assets locais; seus resultados não estão no dataset.

Usam-se os observadores, a rede CDP, a CPU, os viewports e a janela de 20 segundos da E0: três contextos por dispositivo, cada um com navegação fria e quente, 24 navegações no total. A instrumentação aceita `CRCN_BASELINE_URL`; seu padrão público permanece igual. Fixture e substituição de imagens são ativadas explicitamente para esta comparação. Não houve consultas reais a Stays, reservas ou pagamentos.

## Primeira comparação — reprovada por estabilidade visual

Medianas de três execuções; tempos em milissegundos, bytes transferidos concluídos ao corte. “Primeiro preço” mantém a definição da E0: sinal de texto/label com preço em elemento sobreposto ao viewport, sem provar que toda a imagem ou o texto de preço esteja visível.

| Cenário | LCP antes → candidato | CLS antes → candidato | Primeiro preço antes → candidato | Buscas antes → candidato | Bytes antes → candidato |
| --- | --- | --- | --- | --- | --- |
| Mobile frio | 884 → 892 | 0,570 → 0,668 | 2.458 → 2.378 | 15 → 2 | 838.227 → 358.900 |
| Mobile quente | 436 → 408 | 0 → 0 | 344 → 364 | 11 → 0 | 561.590 → 135.271 |
| Desktop frio | 820 → 824 | 0,457 → 0,522 | 2.169 → 2.172 | 15 → 5 | 838.243 → 448.255 |
| Desktop quente | 316 → 320 | 0,00014 → 0,00018 | 270 → 272 | 11 → 0 | 561.574 → 135.271 |

O LCP ficou dentro do limiar de investigação da E0, mas a piora fria de CLS ultrapassou +0,02 em ambos os dispositivos. A redução de carga não compensa essa regressão. Não usar os números de fixture para declarar Web Vitals públicos ou p75 real.

## Causa e correção em validação

O observador de layout do navegador atribuiu o principal shift ao `#stays-apartments-catalog`: o catálogo aparecia em `y=232` e era deslocado para fora do viewport quando as vitrines eram montadas acima dele após a chegada do catálogo. O skeleton de catálogo tornou maior a área afetada por essa inserção tardia.

A estrutura existente de vitrines passa a montar durante o carregamento do catálogo, mantendo a mesma posição quando os dados chegam. As consultas continuam condicionadas à visibilidade dos cartões; não se habilitou consulta de seções distantes. Catálogo vazio confirmado e dados simulados preservam o comportamento específico existente.

Em um diagnóstico curto de seis segundos, o shift principal de aproximadamente 0,666 desapareceu; a soma dos shifts observados passou de 0,66756 para 0,00064. Trata-se de uma execução diagnóstica com screenshots, não da mediana de aprovação nem do CLS de toda a jornada. A amostra de 20 segundos será repetida no commit corrigido.

Passaram 29 testes direcionados de roteamento, vitrines e visibilidade; lint/TypeScript, build, formatação e diff. O teste de roteamento verifica que as vitrines já existem no carregamento e conservam o mesmo nó ao receber dados. O CI do backend anterior `5c1a580` também passou integralmente; isso não substitui os gates do próximo SHA.

## Reproduzir

Configure `CRCN_PLAYWRIGHT_MODULE` e `CRCN_CHROMIUM_EXECUTABLE` com a instalação local disponível. Os scripts não adicionam dependências ao projeto.

```sh
CRCN_BEFORE_BUILD=/caminho/build-e0 CRCN_AFTER_BUILD=/caminho/build-candidato node docs/estudos/sprint-4-e7-fixture.mjs
CRCN_BASELINE_URL=http://127.0.0.1:3191/ CRCN_BASELINE_FIXTURE=true CRCN_BASELINE_OUTPUT=/tmp/e7-before node docs/estudos/baseline-performance-e0-home.mjs
CRCN_BASELINE_URL=http://127.0.0.1:3192/ CRCN_BASELINE_FIXTURE=true CRCN_BASELINE_OUTPUT=/tmp/e7-after node docs/estudos/baseline-performance-e0-home.mjs
```

Execute os braços sequencialmente, sem builds/testes concorrentes. O diagnóstico está em `sprint-4-e7-layout.mjs`. Os cenários de busca e interação usam os respectivos scripts da E0 com as mesmas variáveis.

Dados iniciais e fontes dos shifts: [JSON](sprint-4-e7-integracao-inicial-2026-11-03.json). Pendências: repetição após correção, busca/interação, jornadas afetadas, medição do worker, cota para ativar aquecimento e comparação pública após entrega validada. p75 real permanece não aferido.


## Home corrigida — primeira amostra completa

O commit `4a87750` passou em todos os gates do run `41754598492`, incluindo frontend, backend, PostgreSQL e container. As 12 navegações após o ajuste usam o mesmo método da comparação inicial.

| Cenário | LCP antes → corrigido (ms) | CLS antes → corrigido | Primeiro preço antes → corrigido (ms) | Buscas antes → corrigido | Bytes antes → corrigido |
| --- | --- | --- | --- | --- | --- |
| Mobile frio | 884 → 928 | 0,570 → 0,00064 | 2.458 → 1.673 | 15 → 2 | 838.227 → 358.908 |
| Mobile quente | 436 → 404 | 0 → 0 | 344 → 361 | 11 → 0 | 561.590 → 135.270 |
| Desktop frio | 820 → 844 | 0,457 → 0,05687 | 2.169 → 1.470 | 15 → 5 | 838.243 → 448.263 |
| Desktop quente | 316 → 324 | 0,00014 → 0,00018 | 270 → 274 | 11 → 0 | 561.574 → 135.270 |

O deslocamento principal foi eliminado, e os tempos da home ficaram dentro do limiar de investigação da E0. O sinal de montagem do primeiro cartão do catálogo abaixo da dobra, porém, passou de aproximadamente 1.484 para 1.671 ms no desktop frio (+187 ms), próximo do limiar de 200 ms. Serão executadas mais três repetições desktop em cada braço antes da avaliação final. O preço da primeira vitrine aparece antes; os dois sinais medem conteúdo diferente e não serão usados para esconder a espera do catálogo.

O script da home passa a aceitar `CRCN_PROFILE=desktop` e `CRCN_REPETITION_START=4` para essa repetição adicional, sem alterar os observadores ou as três repetições padrão. Use diretórios de saída separados e execute sequencialmente. Busca e interações estão em execução; jornadas, custo do worker, publicação e medição pública continuam pendentes.

Dados da home corrigida: [JSON](sprint-4-e7-integracao-corrigida-2026-11-03.json). Esses resultados continuam sendo de fixture, não p75 real.


## Repetições adicionais, busca e interações

Com seis amostras por cenário desktop, a montagem do catálogo frio passou de mediana 1.480,05 ms (faixa 1.470,6–1.489,5; MAD 4,95) para 1.672,4 ms (1.666,5–1.675,0; MAD 1,85). A diferença de +192,35 ms permaneceu abaixo do limiar inicial de investigação de 200 ms, mesmo após repetir o cenário próximo desse limite. É um custo observado, não um ganho: a primeira vitrine passou a aparecer antes e a não empurrar a lista, enquanto a lista abaixo da dobra demorou um pouco mais. Não se declara significância estatística com seis amostras.

No desktop frio agregado, LCP passou de 818 para 844 ms, CLS de 0,45749 para 0,05687 e primeiro preço da vitrine de 2.172 para 1.471 ms. Permanecem as ressalvas de imagem fictícia e janela limitada; a comparação pública ainda é necessária para avaliar o LCP do artefato entregue.

A busca datada teve três repetições mobile por braço: primeiro cartão cotado de mediana 2.273 para 1.603 ms; duas consultas/30 cartões no código E0, uma consulta/12 cartões na primeira página do candidato. A paginação posterior é validada na jornada, sem tratar 12 cartões como busca global concluída.

Abertura/fechamento do diálogo de busca, três ciclos na mesma página por dispositivo: mobile [32,40,40] → [24,32,32] ms; desktop [64,72,56] → [96,80,88] ms. O desktop ficou mais lento nessa pequena amostra, dentro do limiar de duração definido na E0 e abaixo de 200 ms; os valores não são INP p75 nem representam todas as interações.

## Jornada e ajustes de acessibilidade encontrados

Em Chromium com movimento reduzido, passaram os cenários 320×844, 390×844, 844×390 e 1365×900: carregar mais por Enter, manter foco durante carregamento, abrir a 13ª acomodação, obter calendário/cotação válidos, abrir/fechar a galeria por teclado e voltar aos mesmos 24 cartões. A diferença de scroll foi zero nos quatro perfis e o retorno não fez nova busca: continuaram duas consultas. O botão de continuar a reserva estava habilitado com os dados fictícios, mas não foi acionado.

Lista vazia, erro/retry da busca e erro/retry da próxima página também passaram, preservando os resultados existentes quando cabível. Não houve overflow horizontal nos pontos verificados nem erros de página. Os únicos POSTs foram busca e cotação na fixture; não se criaram pedidos, reservas ou pagamentos.

A jornada revelou perda de foco ao desabilitar nativamente “Carregar mais” durante a consulta. O botão usa `aria-disabled` nesse intervalo e bloqueia novas ativações no handler, preservando o foco. O fim definitivo continua desabilitado. Outro caso revelou largura inicial de desktop na barra de categorias ao voltar do detalhe; ela passa a começar com um cartão, dimensões responsivas, medida em layout effect e limite de largura no trilho. O trilho respeita a largura da coluna disponível, e a correção foi validada nos quatro perfis.

Passaram 37 testes direcionados de busca/roteamento, depois 15 do roteador com o caso de ativação repetida e 20 de categorias/roteador com o ajuste de largura; lint/TypeScript e build passaram. A suíte completa do lote passou com 555 testes frontend; formatação, Pint e diff também passaram. As medições de tempo anteriores identificam explicitamente seu commit; os ajustes da jornada exigem gates no novo SHA e verificação do artefato final.

## Consumo upstream no runtime anterior

O container `8fb6b098a47c` estava saudável e executava `9518dc35c9f44ad7554f6a2ae7c17e6a105988c1`. Foram feitas duas leituras públicas de busca, uma por processo PHP independente, como usuário web, pelo kernel da aplicação. Cada execução tinha teto de seis chamadas externas e prazo externo de 45 segundos; um middleware permitia somente os endpoints de consulta necessários. Não foram alterados código/configuração ou dados comerciais. Os caches normais da aplicação podem ser usados por essas leituras.

Ambas responderam 200 com oito resultados e zero sem cotação. Foram duas chamadas Stays na primeira leitura e duas na repetida, sem bloqueios pelo teto do probe. Tempos do handler: 3.136 e 1.357 ms; bootstrap: 206 e 238 ms; pico de memória alocada PHP: 28 MiB em cada processo. A variação de duração não é atribuída a cache, pois as duas leituras consultaram o provedor. Esses números excluem trânsito público/CDN/Apache e não medem o worker. O carimbo `reportedAt` corresponde ao término do probe.

A comparação equivalente após a publicação, o custo do worker e a medição pública permanecem pendentes. O aquecimento de ofertas continua desligado até calibrar sua parcela de orçamento Stays.

Instrumentos e dados: `sprint-4-e7-jornadas.mjs`, `sprint-4-e7-upstream-probe.php` e [JSON de validação local](sprint-4-e7-validacao-local-2026-11-03.json). A revisão da validade de busca em relação ao relógio do cliente também permanece na auditoria anterior à publicação.
