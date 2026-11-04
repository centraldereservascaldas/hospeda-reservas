# Publicação E5/E6 e verificação E7 — 04/11/2026

## Artefato publicado

O [PR #43](https://github.com/centraldereservascaldas/hospeda-reservas/pull/43) foi integrado em `55dbd146accbaacab8003cf347f1bbee0ff28da4`. O [workflow 41801821080](https://github.com/centraldereservascaldas/hospeda-reservas/actions/runs/41801821080) concluiu frontend, backend, PostgreSQL, container, publicação por digest e deploy com sucesso. Gates do head anterior também passaram; frontend com 560 testes e backend com 397 casos/2.684 asserções (391 warnings do runner, seis casos sem warnings; não são 391 falhas).

Aplicação `7pgw9mcr2vjt5red5pswmvi6`, container `579ee6ac8fa7`, imagem `ghcr.io/centraldereservascaldas/hospeda-reservas@sha256:b721610ad5c63daacd10860e6005f8ac938ed36fa5da579cbea10d516dab93d2`. O digest da imagem em execução corresponde ao RepoDigest do artefato publicado. Apache, migrations, queue, scheduler e discovery estavam RUNNING, container saudável; health e ready públicos responderam sucesso. Banco `hospeda_reservas`, 22 migrations, nenhuma nova neste lote. Cache de busca e conteúdo configurados como database; TTL da busca 45 segundos; aquecimento de ofertas false/orçamento diário zero.

O JS público `/assets/index-ChwwwOHh.js` retornou SHA-256 `99bbe6f03ad4a0846d72e5d1dcca714a159a47c385aeb15d797108990e79de95`, idêntico ao arquivo no container, com `public, max-age=31536000, immutable`. Um asset inexistente retornou 404 com `no-store, max-age=0`. Houve um 502 pontual ao buscar o JS durante a troca; a leitura seguinte passou e as 18 navegações seguintes não registraram falhas de navegação/recursos. Uma tentativa com urllib sem o user agent usado nos demais probes recebeu 403; não foi usada como amostra de performance.

Backup restaurável e imagem anterior de retorno estão no [preflight](sprint-4-e7-integracao-2026-11-03.md). Nenhum restore foi feito em produção. Rollback preserva banco, pedidos e pagamentos.

## Comparação pública com E0

Mesmo Chromium/Playwright, emulação CDP, viewport, janela de 20 segundos, idioma/timezone e scripts da E0; sem tags opcionais, reservas ou pagamentos. As imagens e a API são reais nesta seção. A medição ocorreu no dia seguinte ao baseline, portanto ofertas automáticas, carga do servidor e caches CDN/provedor podem variar. Não é um experimento causal isolado nem RUM/p75.

Foram três pares frio/quente por perfil, seguidos de mais três pares mobile devido à dispersão. Nenhuma amostra foi descartada. A mediana mobile atual usa seis amostras; desktop e E0 usam três. Os JSONs preservam amostras originais e adicionais separadas.

| Cenário | LCP E0 → atual | Primeiro preço E0 → atual | CLS E0 → atual | Buscas E0 → atual |
| --- | --- | --- | --- | --- |
| Mobile frio | 6,24 → 3,36 s | 4,15 → 2,72 s | 0,569 → 0,00073 | 16 → 2 |
| Mobile quente | 1,01 → 0,75 s | 0,99 → 0,73 s | 0 → 0,00073 | 11–15 → 0–2 |
| Desktop frio | 1,84 → 1,86 s | 4,66 → 3,61 s | 0,421 → 0,00455 | 16 → 5 |
| Desktop quente | 0,56 → 0,52 s | 0,53 → 0,73 s | 0,002 → 0,00165 | 13–15 → 0–5 |

Mobile frio atual: LCP 3,016–6,428 s, MAD 0,276 s; primeiro preço 2,312–6,127 s, MAD 0,308 s. Desktop frio: LCP 1,216–2,000 s, MAD 0,136 s. A primeira navegação pós-publicação foi a mais lenta e foi mantida. Mediana de bytes concluídos: mobile frio 733.034, quente 19.398; desktop frio 451.663, quente 19.398. Não equivale a tráfego físico incluindo TLS. Cache quente não significa validade comercial renovada: algumas visitas refizeram consultas. O primeiro preço desktop quente ficou cerca de 200 ms mais lento; não tratar como ganho ou aprovação definitiva desse cenário sem repetir no artefato corrigido.

Busca fixa de 06–08/11, dois hóspedes: seis repetições mobile, uma consulta/página inicial de 12 imóveis, contra duas consultas/30 imóveis na E0. Cinco amostras apresentaram preço inicial (1,897–6,287 s, mediana 2,579 s), mas uma terminou sem cartões apesar de HTTP 200 com 12 cotações. Outra retirou os preços antes do corte de 20 segundos. A amostra sem resultado não entra como zero nem é excluída da avaliação: motivou a investigação abaixo. Não se declara aprovação funcional das seis buscas nem ganho agregado de duração enquanto existe essa falha.

Diálogo de busca, três ciclos por perfil: mobile [32,32,32] ms; desktop [56,96,48] ms. São durações Event Timing de poucas interações, não INP p75. As três tentativas no script auxiliar de busca não acharam o seletor antigo e foram marcadas como não executadas, conforme já ocorria na E0.

## Cache quente e custo operacional

Probe público pelo kernel, um processo PHP independente por leitura, mesmo contexto 13–15/11, dois hóspedes/oito resultados, máximo seis chamadas externas permitidas e timeout externo de 45 segundos. Antes: duas chamadas Stays em cada uma das duas leituras (handlers 3.136/1.357 ms). Depois: uma na primeira e zero na repetida (2.000/119 ms). Ambas 200, oito resultados/zero sem cotação, mesmo expiresAt `08:53:34Z`; o hit não estendeu a validade. Pico PHP 28 MiB frio e 26 MiB quente. Exclui rede pública/CDN/Apache; não é duração de requisição do navegador.

Antes, três snapshots do container: 173,2 MiB e CPU 0,29%/58,47%/0,46%. Depois, snapshots entre 173,8 e 205 MiB; processo PHP discovery com RSS 54.040 KiB, incluindo páginas compartilhadas. Uma janela de 30,01 segundos do cgroup consumiu 8,086 segundos de CPU (26,94% de um núcleo), medindo o container inteiro; snapshot ao fim 0,57%/205 MiB/19 PIDs. A carga não foi controlada e não permite atribuir essa diferença inteira ao novo worker ou concluir regressão de CPU. A fila financeira permaneceu default, separada de discovery. Aquecimento de ofertas desativado tem zero chamadas promocionais por esse mecanismo; seu custo ativo permanece não aferido por falta de cota.

## Defeito no limite de validade e correção local

Probe adicional sem emulação reproduziu o limite: primeira resposta em `09:06:04`, fetchedAt `09:06:03` e expiresAt `09:06:48`; 12 cartões cotados. Ao expirar no cliente, ficaram 12 cartões sem preço e aviso de atualização. O clique imediato gerou HTTP 200 em `09:06:47`, com o mesmo snapshot ainda válido por um segundo no servidor. A margem conservadora do cliente o rejeitou; ficaram 12 cartões e botão de tentar novamente. Não houve erro JavaScript. Esse é o defeito observado, não ausência real de acomodações.

A correção local mantém a rejeição de preços sem validade utilizável e faz no máximo uma nova leitura nesses casos. Se HTTP Date é válido, aguarda até o vencimento informado com teto de dois segundos; depois repete a mesma página dentro da mesma tarefa da fila. Cancelamento interrompe a espera. Não faz polling, não repete erros HTTP/metadados malformados e não renova a validade de um snapshot por leitura. Se a segunda resposta ainda não for utilizável, retorna erro com a retentativa explícita existente.

Passaram 24 testes direcionados, incluindo recuperação com um segundo restante, cancelamento, teto da espera e ausência de loop; lint/TypeScript, build e quatro jornadas da fixture passaram. Build local `index-9HpLYLN2.js` (481,10 kB; gzip 140,82 kB). Publicação desta correção e repetição pública do limite ainda pendentes neste registro. Evidências completas: [JSON](publicacao-cache-e7-2026-11-04.json).

## Pendências

- Publicar a correção após gates e verificar o ciclo público de expiração/atualização.
- Repetir o cenário desktop quente próximo ao limiar de duração e registrar o artefato final.
- Confirmar cota da conta Stays antes de ativar aquecimento e medir seu custo ativo.
- LCP mobile continua acima de 2,5 s nesta mediana de laboratório; metas p75 reais de LCP/INP/CLS continuam não aferidas.


## Publicação da retentativa e ajuste da janela útil

O PR #44 foi integrado em `02edfd17003f6c3f0cc800fc4e98a2fc139a78a6`; run `41806252700` passou nos seis jobs, incluindo publicação e deploy. Container `edc5aeb98748` saudável, cinco processos RUNNING, health/ready públicos com sucesso. Imagem `ghcr.io/centraldereservascaldas/hospeda-reservas@sha256:8b1b3e3e6c72a7dde510fd80a16cc157c6dd4a93eaa417d58eae82100c43547a`. JS público `/assets/index-zsoM3WEu.js`, SHA-256 `deea6cc6432205e0387d3b679009ea9dc68a0d7ef6158e74c4b5948bf0ee0cd9`, idêntico ao container. CI frontend: 564 testes.

A repetição pública mostrou uma segunda condição: em `09:39:56`, a atualização recebeu o snapshot com expiresAt `09:39:58`. A validade local conservadora ainda era positiva por uma fração de segundo, então não ocorreu retentativa. Os preços reapareceram brevemente e, seis segundos depois, a página estava novamente expirada, com 12 cartões preservados e sem erro JavaScript ou botão de erro. Esse resultado não aprova a experiência de atualização.

O novo ajuste inclui na retentativa respostas com até dois segundos de validade local utilizável. A espera pelo prazo do servidor tem teto de quatro segundos, mantendo uma única repetição e o cancelamento. Não altera validade comercial nem habilita polling. Passaram 26 testes direcionados, incluindo snapshots com um, dois e três segundos restantes e o teto de espera atualizado; lint/TypeScript e build passaram. No navegador da fixture, os cenários com dois e três segundos na resposta de atualização preservaram 12 cartões, retiraram preços ao expirar, fizeram uma retentativa e continuaram com 12 preços confirmados seis segundos após a renovação. Publicação deste ajuste e verificação pública ainda pendentes. [Dados do limite de validade](sprint-4-e7-janela-validade-2026-11-04.json).

Medição adicional do worker anterior: diferença de CPU do processo supervisor discovery e filhos já recolhidos em `/proc/13/stat`, com CLK_TCK, foi 4,240 segundos em 30,730 segundos de parede, aproximadamente 13,80% de um núcleo. Filhos ainda vivos nos extremos não entram no total, logo é aproximação; inclui trabalhos de descoberta ocorridos no intervalo e não é custo separado por job. O processo continuava RUNNING. Próxima otimização a avaliar em lote separado: diminuir inicializações PHP enquanto a fila está ociosa, preservando o timeout externo por tentativa e a separação da fila financeira.
