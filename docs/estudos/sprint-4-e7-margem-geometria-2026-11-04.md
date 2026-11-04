# E7 — Margem útil do cache e estabilidade das vitrines

## Publicação e renovação verificadas

O PR #45 foi integrado em `72c3388247454edce9c650638cbc73f638dffd49`. O [run 41810213189](https://github.com/centraldereservascaldas/hospeda-reservas/actions/runs/41810213189) passou em todos os jobs, incluindo publicação e deploy. Container `0fd61b5d3077`, saudável, cinco processos RUNNING; health/ready públicos com sucesso. Digest `sha256:ff0263c20716495fabc7ea281d07948057eeb96e2b084a6a999d03450fe20f3d`. O fonte `src/services/crcnBackendApi.ts` no container e no commit aprovado retornou SHA-256 `5165985724ed1211a536110839d205be7b558deaab84b73df9bdf9d61b71704e`.

Durante a troca, uma leitura ainda recebeu o HTML anterior. Após a retirada do container antigo, o domínio passou a entregar `/assets/index-DcLRVXXe.js`, SHA-256 `873d6216e1bb02fd56ccebba6c2adff5c5311891db64448dd10c17378067b035`, igual ao novo container. HTML com `no-cache, private`/CF DYNAMIC. Não confundir um asset retido do release anterior com a entrada ativa.

O ciclo público de renovação passou: 12 cartões/12 preços; vencimento preservou 12 cartões sem preço; atualização recebeu o snapshot com dois segundos restantes, repetiu uma vez e recebeu outro prazo. Seis segundos depois ainda havia 12 preços, sem botão de erro nem pageerror. Respostas em 09:57:57/09:58:40/09:58:43 UTC; expiresAt antigo 09:58:41, novo 09:59:27. Somente leituras, sem checkout/pedido/pagamento.

## Comparação pública completa de 72c3388

Mesmo método/navegador da E0, rede e CPU CDP, imagens/API reais, contexto sem login e sem aceitar tags opcionais. Seis amostras por cenário atual (24 navegações); três por cenário E0. Seis buscas datadas atuais e três ciclos de diálogo por dispositivo. Nenhuma amostra descartada. A observação de preço é um sinal do DOM que cruza o viewport, não mede oclusão por diálogos nem conversão; o painel de consentimento inicial pode cobrir esse conteúdo. Não são dados RUM/p75. Cache frio significa navegador novo, sem limpar cache compartilhado/CDN/provedor.

| Perfil/cache | LCP E0 → atual (ms) | Primeiro preço E0 → atual (ms) | CLS E0 → atual | Buscas atuais |
| --- | --- | --- | --- | --- |
| Mobile frio | 6.244 → 6.040 | 4.148 → 5.707 | 0,5686 → 0,1069 | 2–4 |
| Mobile quente | 1.008 → 706 | 993 → 684 | 0 → 0 (faixa até 0,1069) | 0–2 |
| Desktop frio | 1.836 → 1.988 | 4.660 → 3.309 | 0,4211 → 0,0282 | 5–9 |
| Desktop quente | 560 → 562 | 533 → 531 | 0,0022 → 0,0068 | 0–5 |

**Performance mobile fria não aprovada:** primeiro preço piorou 1.559 ms, acima do limiar E0 de aproximadamente 450 ms nesse cenário. Faixa atual 2.437–7.177 ms; LCP 2.856–7.516 ms. Todas as entradas JS apontaram para DcLRVXXe; zero falhas de navegação/recursos. Não atribuir toda variação ao cache: provedor, conteúdo e rede pública não foram isolados.

As repetições mostram o custo do limite de validade: quando o snapshot compartilhado está quase vencido, o cliente segura a tarefa, espera até quatro segundos e faz nova leitura. No desktop houve até nove buscas em uma navegação para cinco contextos normais. Isso reduz o volume contra as 16 buscas frias da E0, mas ainda adiciona latência evitável. Nas visitas quentes, normalmente não há consultas promocionais; prazo expirado pode provocar nova leitura.

As seis buscas datadas mantiveram 12 cartões cotados ao corte: tempos iniciais [4.119,5; 2.580,8; 6.569,6; 1.934,3; 8.871,8; 1.964,1] ms, mediana 3.350 ms, uma ou duas consultas. E0: mediana 4,70 s, duas consultas/30 cartões. O preço é válido nos resultados atuais, mas a cauda continua alta. Interações: mobile [32,32,32], desktop [88,112,48] ms; não são INP p75.

## Correção backend: recomputar antes de faltar prazo útil

Implementada em `9246296`, com proteção de TTLs curtos em `959bad6`. Para TTL atual de 45 s, um hit precisa de mais de cinco segundos restantes. Nos dois checks existentes (antes e dentro do lock), um snapshot com prazo menor exige recomputação. O resultado novo conserva fetchedAt anterior ao HTTP e expiresAt original; não se reinicia o relógio após a Stays responder nem há loop de recomputação backend.

Para TTL de até cinco segundos, preserva-se o hit enquanto válido. Nos demais, a margem é o menor entre cinco segundos e 20% inteiros do TTL. Isso evita que um TTL de seis segundos seja renovado a cada segundo. Em tráfego contínuo por chave, 45→40 s pode aumentar a cadência máxima de recomputação em 12,5%; não há job novo nem ativação do aquecimento. O benefício esperado é retirar o HTTP adicional e a espera no navegador quando o servidor já pode obter um snapshot novo; precisa ser medido após entrega.

Cooldown e HTTP 429 conservam snapshot ainda válido sem estender prazo, e não consultam o provedor. Outros erros/lock timeout continuam falha explícita: na janela antecipada, podem deixar de servir os últimos segundos de um snapshot ainda comercialmente válido. A interface conserva cartões e retentativa; falha não é armazenada como lista vazia. O teste novo de 503 explicita essa política. beforeRequest continua exigido antes de cada HTTP do warmer; orçamento negado impede recomputação. Aquecimento de ofertas segue false/orçamento zero.

Passaram 406 testes backend/2.726 asserções, incluindo hit com seis segundos, refresh com cinco, re-hit do novo payload, TTLs 1/2/5/6/10, 429 na renovação, falha 503 e orçamento negado. Pint passou. Laravel instalado 13.35.0; documentação 13.x de locks/cache consultada pelo Boost. Nenhuma migration ou dependência alterada.

## Correção visual: nome longo e preço não podem alterar a linha

O trace público reproduziu CLS somado 0,10691. Computed styles confirmaram `line-clamp-1 block` com display:block no subtítulo, permitindo duas linhas de 16 px. Cartões tinham 64/80 px de informações; o botão nativo esticado centralizava o conteúdo menor, deslocando a foto em oito pixels. O evento principal deslocou a próxima seção em 15 px. Esse é um defeito dependente dos dados reais; não há evidência de que a retentativa de API tenha criado a regra CSS.

Em `8f9481b`, os títulos/subtítulos mantêm clamp de uma linha sem block concorrente. A região de preço reserva 40 px e entrelinha 20 px em loading, ready, idle e erro, com até duas linhas. Não foi necessário alterar skeleton, CategoryBar, imagens ou transformar o botão em flex.

Fixture isolada com complexName alternando curto/longo, mesmo build/ambiente e API450ms: soma dos shifts do diagnóstico passou de 0,10256 para 0,00293. Isso não é CLS público/p75. Leitura de geometria com consentimento recusado: subtítulos 16/48→16/16 px; fotos antes em y360/y344, depois ambas y344; preços com altura comum e sem corte dos controles. Imagens dessa inspeção não validam aparência real, apenas geometria.

Validação em 320×844, 390×844, 844×390 e 1365×900: sem overflow horizontal, subtítulos de uma linha e preços/fotos alinhados. O perfil paisagem exigiu rolar até a seção para disparar a consulta, conforme visibilidade; uma tentativa inicial também confundiu o hover intencional de dois pixels com desalinhamento. A verificação final removeu o hover e passou. Os dados preservam a tentativa anterior. Na fixture, recusar consentimento levou a rolagem para baixo antes e depois; foi necessário voltar ao topo para inspecionar. É achado separado, ainda sem confirmação pública, não corrigido neste lote.

Passaram 15 testes direcionados de vitrines e 566 testes frontend completos, lint/TypeScript, build e Prettier. O comparativo visual é diagnóstico, não uma substituição da repetição pública após publicação.

## Entrega pendente

Publicar cache e geometria após gates; conferir aplicação/digest/banco/backup/rollback e repetir probes de cache, renovação e comparação pública. Retorno por imagem de 72c3388, preservando dados. Cota do provedor, ativação/custo do aquecimento e p75 real permanecem pendentes; custo do worker ocioso já medido é próximo ponto operacional a otimizar em lote separado.

Dados completos: [JSON](sprint-4-e7-margem-geometria-2026-11-04.json). Instrumentos: fixture, layout, renovação e scripts E0 nesta pasta.
