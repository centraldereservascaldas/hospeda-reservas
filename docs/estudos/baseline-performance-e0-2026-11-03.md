# E0 — Identificação da versão e baseline de performance

Data: 03/11/2026. Sprint 0. Escopo: observação de produção, medições públicas e registros locais, sem mudança de configuração, código ou dados comerciais em produção.

## Resultado e limite de conclusão

A versão pública foi vinculada ao container ativo e ao commit remoto por imagem, digest, roteamento e checksums. O baseline contém 12 navegações de home, três buscas datadas e duas páginas de interação (três ciclos cada), executadas sequencialmente. A E0 entrega identificação e baseline de laboratório; p75 real, chamadas upstream e hit ratio do servidor continuam sem medição. Essas pendências não foram transformadas em números estimados nem em instrumentação publicada.

A goal da conversa acompanha o plano completo por sprints. Este registro encerra o trabalho de medição da Sprint 0; não inicia E1 nem autoriza publicação.

## Versão identificada

| Evidência                                                    | Valor observado                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Commit da imagem em execução e `main` consultada             | `76cd4cf684b09e079ba562abcf75c720dfc48702`                                                                         |
| Imagem                                                       | `ghcr.io/centraldereservascaldas/hospeda-reservas:76cd4cf684b09e079ba562abcf75c720dfc48702`                        |
| Digest em `RepoDigests`                                      | `sha256:91e871b15214f7617093693762c45406cfd168f5008175822867354b56f745b4`                                          |
| Aplicação Coolify                                            | `7pgw9mcr2vjt5red5pswmvi6`, `hospeda-reservas-production`                                                          |
| Container                                                    | `4286e684691a`, iniciado em 03/11 às 16:54:35 BRT; saudável nas duas verificações                                  |
| Entrada pública                                              | `index-CA52iMh1.js`                                                                                                |
| SHA-256 do JS público e do arquivo no container              | `05d8d4469591f6a8026b67f485d680fc25ebb871953c0213504870d87b82a370`                                                 |
| SHA-256 de `SeasonalDateSuggestions.tsx`, GitHub e container | `7ba122c8f196e458f63e4ff833fdea95673c15c7b88a25bd0f070e42b5d196fe`                                                 |
| Checkout local                                               | `codex/calendario-responsivo-cache`, HEAD `ddcb1c429ed466b9d3ec97e0ce9a2ed2922337eb`, com alterações preexistentes |
| Relação entre commits                                        | Publicado 67 commits à frente do HEAD local; não representa integração das alterações locais pendentes             |

O roteamento Traefik desse container inclui o domínio com e sem `www`. Todas as 12 navegações de home observaram a mesma entrada JS; a verificação final manteve container e checksum. Não houve diferenças reportadas por `docker diff` sob `src`, `app`, `public` e `resources` do container consultado. Isso é evidência do artefato observado, não promessa de que produção permanecerá nessa versão.

A [run 41705601210](https://github.com/centraldereservascaldas/hospeda-reservas/actions/runs/41705601210) terminou com os seis jobs, inclusive `publish` e `deploy`, bem-sucedidos nesse SHA. O workflow remoto consultado condiciona deploy na `main` a `PRODUCTION_DEPLOY_ENABLED=true`; a variável estava ligada. Nenhum workflow foi disparado ou modificado.

## Fonte das vitrines e consultas

O código publicado está em [SeasonalDateSuggestions.tsx no SHA observado](https://github.com/centraldereservascaldas/hospeda-reservas/blob/76cd4cf684b09e079ba562abcf75c720dfc48702/src/components/search/SeasonalDateSuggestions.tsx), montado por `MainContentRouter.tsx:313`. Não existe no HEAD local analisado anteriormente.

- Linhas 124–205: busca sugestões com limite 8; executa a primeira coleção em paralelo e depois as restantes, sem aguardar aproximação da tela. Deduplicação fica no mapa daquele efeito.
- Linhas 210–243: outra busca datada com limite 100 para o período do catálogo.
- Linhas 246–258: busca sem datas com limite 100 para metadados de categorias.
- O cliente pagina esses limites em lotes de 20. Na home, há períodos sobrepostos entre sugestões e a consulta maior.
- Linhas 49–78 e 180–192: `sessionStorage` guarda estados `ready` e `unavailable` por 15 minutos; erro de consulta também pode chegar a `unavailable`. Separar erro de ausência de oferta na E1.
- Linhas 396 e 516: imagens das vitrines usam lazy loading, incluindo as primeiras da composição atual.

As requisições e parâmetros efetivamente observados estão no JSON anexo. Houve repetição de consultas com parâmetros idênticos em cache quente. O número de chamadas do navegador não é o número de chamadas à Stays: cache interno, auxiliares e aquecimento podem alterar essa relação.

## Método reproduzível

- Host: macOS 26.5.2, arm64; Chromium headless `156.0.8078.4`; Playwright `1.64.0-alpha-1790635538000`. Fixar essas versões na comparação ou declarar mudança de ferramenta.
- Idioma `pt-BR`, timezone `America/Sao_Paulo`; sem login e sem aceitar tags opcionais. Nenhuma reserva, pagamento ou submissão do formulário de busca durante ciclos de interação.
- Rede CDP fixa: latência configurada de 150 ms; download de 500.000 bytes/s (4 Mbit/s); upload de 125.000 bytes/s (1 Mbit/s). Isso é emulação configurada, sem garantia de latência fim a fim exatamente igual.
- Mobile: 390 × 844 CSS px, DPR 2, touch e modo mobile, CPU 4× mais lenta. Desktop: 1365 × 900, DPR 1, CPU sem desaceleração. A rede é igual nos dois; não são aparelhos físicos nem user agents comerciais de celular.
- Três contextos novos por perfil; em cada contexto, primeira navegação `cold`, seguida de nova navegação `warm` na mesma aba, preservando HTTP cache, cookies e storage. Não foram limpos ou invalidados caches da CDN e do backend.
- Observação até 20 s após `DOMContentLoaded`; sem rolagem na home. Recursos não concluídos até o corte não entram nos bytes concluídos. Medidas são relativas ao início da navegação.
- LCP: última entrada do observer antes do corte. CLS: maior janela de sessão de mudanças sem entrada recente, com lacunas de 1 s e duração máxima de 5 s. Não equivalem necessariamente ao ciclo de vida completo da página.
- Primeiro preço visível: amostragem a cada 100 ms de botão/cartão com `R$` e retângulo sobreposto ao viewport. É sinal de conteúdo no DOM, não garantia de imagem carregada ou de validade comercial auditada. O JSON separa o momento de montagem do catálogo abaixo da dobra.
- Bytes: soma de `Network.loadingFinished.encodedDataLength`, incluindo recursos cross-origin concluídos; sem payloads, cookies ou cabeçalhos de autorização. Não equivale a uso físico de rede incluindo TLS.
- Busca fixa: `from=2026-11-06`, `to=2026-11-08`, `guests=2`, três contextos mobile frios, mesmo perfil de rede/CPU. Primeiro cartão cotado exige texto de disponibilidade e preço; total de cartões ao corte não é tempo de conclusão de página medido continuamente.
- As ofertas automáticas da home seguem a data atual e podem variar. Os parâmetros capturados permitem comparar esse fator; para medir após essas datas, definir outra amostra equivalente e declarar a mudança, sem consultar datas passadas como benchmark comercial.

As navegações da home ocorreram aproximadamente entre 17:29 e 17:34 BRT; as capturas individuais têm timestamps no JSON. Todas as consultas foram sequenciais entre páginas; não houve teste de estresse.

## Home: mediana de três execuções

LCP inclui mínimo–máximo entre parênteses. Preço é o primeiro preço visível. MiB representa transferência concluída dentro da janela; buscas e pico de APIs são intervalos mínimo–máximo por navegação.

| Perfil/cache navegador | LCP s (faixa)    | Primeiro preço s | CLS   | MiB  | Buscas automáticas | Pico APIs simultâneas |
| ---------------------- | ---------------- | ---------------- | ----- | ---- | ------------------ | --------------------- |
| mobile / cold          | 6.24 (5.19–6.40) | 4.15             | 0.569 | 2.02 | 16–16              | 7–8                   |
| mobile / warm          | 1.01 (0.70–1.04) | 0.99             | 0.000 | 1.31 | 11–15              | 9–13                  |
| desktop / cold         | 1.84 (1.12–2.34) | 4.66             | 0.421 | 2.75 | 16–16              | 8–8                   |
| desktop / warm         | 0.56 (0.50–0.58) | 0.53             | 0.002 | 1.02 | 13–15              | 11–13                 |

TTFB mediano: mobile frio 439 ms, mobile quente 705 ms, desktop frio 568 ms e desktop quente 373 ms. A variação de origem e rede permanece mesmo com emulação fixa; cache quente do navegador não garante uma resposta HTML mais rápida.

Na primeira visita mobile, o LCP mediano de 6,24 s e CLS de 0,569 são os sinais mais fortes de problema. No desktop frio, o primeiro preço visível demora 4,66 s apesar de LCP de 1,84 s: otimizar apenas LCP pode deixar a espera comercial intacta. A causa exata de cada layout shift não foi instrumentada; não atribuir todo o CLS às fotos ou a um único componente.

O cache quente melhora a apresentação, mas mantém 11–15 buscas por navegação e picos de até 13 APIs simultâneas. Não houve requisições falhas ou HTTP ≥400 nas capturas da home; isso não prova disponibilidade permanente.

### Duração de `/api/search` no navegador

Esta tabela agrega consultas distintas dentro de cada cenário. Inclui rede/emulação, fila no navegador e servidor; não é p95 de backend nem de Stays. P95 usa o método do posto mais próximo e serve apenas para descrever esta amostra.

| Cenário        | Requisições concluídas | p50 ms | p95 ms |
| -------------- | ---------------------- | ------ | ------ |
| mobile / cold  | 48                     | 1514   | 2138   |
| mobile / warm  | 41                     | 1723   | 2554   |
| desktop / cold | 48                     | 1881   | 3020   |
| desktop / warm | 43                     | 1228   | 1915   |

## Busca datada fixa

| Repetição mobile fria | Primeiro cartão cotado s | Cartões montados ao corte | Com preço | Buscas |
| --------------------- | ------------------------ | ------------------------- | --------- | ------ |
| 1                     | 5.48                     | 30                        | 30        | 2      |
| 2                     | 4.36                     | 30                        | 30        | 2      |
| 3                     | 4.70                     | 30                        | 30        | 2      |

Mediana até primeiro cartão cotado: **4,70 s**. As duas páginas de rede retornaram 20 + 10 imóveis e todos tinham total positivo nas amostras. Essa jornada ativa não disparou as vitrines promocionais da home. A paginação ainda entrega os 30 cartões antes da apresentação observada; E3 deve separar primeira página de carregamento posterior.

## Resposta a interações

Medição adicional: após estabilizar a busca fixa, abrir o botão do cabeçalho “Buscar hospedagens”, esperar o diálogo e fechá-lo com Escape, três ciclos na mesma página por perfil. A medição anterior pelo seletor literal “Datas e hóspedes” não encontrou o botão; esses ciclos foram marcados como não executados, sem atribuir duração zero.

- mobile: maior duração Event Timing por ciclo = 32, 40, 40 ms.
- desktop: maior duração Event Timing por ciclo = 80, 104, 48 ms.

São amostras de abertura/fechamento com Event Timing, quantizadas pelo navegador e com limiar de 16 ms. Não são INP p75 de usuários nem cobrem todas as interações da jornada; eventos abaixo do limiar podem não aparecer. O primeiro ciclo também pode carregar código do diálogo, enquanto os posteriores o reutilizam.

## Orçamentos para as próximas sprints

- Home: zero consultas de seções distantes antes da aproximação. Objetivo da primeira vitrine: até uma consulta agregada do navegador; outras APIs essenciais devem ser inventariadas separadamente.
- Busca: uma chamada do navegador entrega a primeira página independentemente das demais; manter resultado já entregue em erro de próxima página.
- Concorrência inicial proposta: duas requisições interativas de dados, com prefetch cancelável e prioridade para a ação explícita. Controle global do backend é uma medida separada.
- Não aumentar quantidade de chamadas, erros ou bytes sem justificativa mensurável. Toda redução deve manter resultados cotados válidos para o mesmo contexto.
- Limiar inicial de investigação para duração: piora de mediana maior que `max(200 ms, 10% da mediana baseline, 2 × MAD baseline)` no mesmo cenário. Para CLS, investigar aumento absoluto acima de 0,02; objetivo final ≤0,1.
- Esse limiar é triagem, não teste de significância. Três amostras são poucas: se o efeito ficar próximo do limiar ou a dispersão for alta, repetir pelo menos mais três execuções antes de aprovar/rejeitar.
- Comparar cache frio e quente separadamente. Não usar ganho de cache quente para compensar regressão na primeira visita.
- Metas reais de acompanhamento continuam LCP ≤2,5 s, INP ≤200 ms e CLS ≤0,1 no p75. Sem acesso a dados reais suficientes, registrar como não aferido.

## Pendências de observabilidade

Não foram coletados contadores upstream Stays, hit ratio do cache do servidor, p50/p95 de processamento interno ou p75 real. O beacon Cloudflare observado não dá acesso automaticamente ao painel de métricas. A próxima sprint deve primeiro verificar telemetria existente e preparar instrumentação mínima local se faltar, sem publicar nesta etapa. Não invalidamos cache de produção para fabricar cenário de origem fria.

## Como repetir

Os três scripts anexos usam somente Playwright já instalado; não adicionam dependência ao projeto. Parametrizam `CRCN_PLAYWRIGHT_MODULE` (módulo ESM instalado), `CRCN_CHROMIUM_EXECUTABLE` (opcional, executável compatível) e `CRCN_BASELINE_OUTPUT` (diretório local de resultados). Na ausência de caminho de módulo, tentam resolver `playwright` no ambiente.

```sh
node docs/estudos/baseline-performance-e0-home.mjs
node docs/estudos/baseline-performance-e0-search.mjs
node docs/estudos/baseline-performance-e0-interaction.mjs
```

Executar sequencialmente, conferir o artefato antes/depois e usar as mesmas versões e parâmetros. Os scripts acessam a home pública e podem gerar consultas normais do site; não executar em paralelo nem como monitor recorrente. `cold` significa contexto novo, `warm` a segunda navegação da mesma aba. Os caminhos absolutos do runtime local foram substituídos por parâmetros nos scripts preservados; isso não altera os critérios de medição.

## Arquivos e validação

- [Dados completos e resumo](baseline-performance-e0-2026-11-03.json).
- [Instrumento da home](baseline-performance-e0-home.mjs).
- [Instrumento da busca datada](baseline-performance-e0-search.mjs).
- [Instrumento de interação](baseline-performance-e0-interaction.mjs).
- [Plano por prioridade e sprints](../plano-otimizacao-performance-ux.md).

Validação desta entrega: scripts de medição executados; sintaxe dos instrumentos preservados verificada com `node --check`; JSON e formatação verificados; alterações preexistentes preservadas. Não houve mudança no código da aplicação, dependências, banco, flags, workflows ou produção. Não houve commit, push ou deploy. Os testes de aplicação não foram repetidos por não haver mudança funcional.
