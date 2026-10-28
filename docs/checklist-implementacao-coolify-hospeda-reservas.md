# Operação CI, GitHub e Coolify do Hospeda Reservas

Estado documental revisado em **28/10/2026**. Este arquivo combina evidência recente do GitHub com registros anteriores do Coolify. Ele não comprova o estado atual do painel, da VPS, do DNS ou do banco; confirme esses itens diretamente no ambiente antes de publicar.

## Estado confirmado nesta revisão

| Área | Evidência em 28/10/2026 | Estado |
| --- | --- | --- |
| Repositório | `centraldereservascaldas/hospeda-reservas`; `origin/main` apontava para `d20a4fd` na verificação mais recente de 28/10 | Referência remota observada |
| Pull request | PR [#2](https://github.com/centraldereservascaldas/hospeda-reservas/pull/2), branch `codex/integrate-github-updates-20261026` (`cadc92f`) | Mesclada em 28/10 |
| CI da PR | Frontend, backend, migrações PostgreSQL e smoke de container; validações do workflow `Release image` também concluíram com sucesso no SHA observado | Checks recentes verdes na PR |
| Publicação GHCR pela PR | O job `publish` do workflow `Release image` ficou `SKIPPED`, pois a execução era de pull request | Nenhuma imagem publicada por essa execução |
| Publicação pela `main` | A [run 40751200643](https://github.com/centraldereservascaldas/hospeda-reservas/actions/runs/40751200643) de `d20a4fd` concluiu os jobs `publish` e `deploy` com sucesso | Registro histórico; confirme a versão ativa no Coolify |
| Deploy Coolify | Há registro de deploy em 27/10 da imagem `eec29ca` no domínio `crcn.caldasindica.com` | Deploy histórico confirmado; saúde atual não verificada |
| PostgreSQL | Registro de 28/10 informa restore do banco, com 16 tabelas e 18 migrations presentes após a operação | Restore histórico confirmado; estado, volume e backup atual não verificados |

O workflow [`.github/workflows/release-image.yml`](../.github/workflows/release-image.yml) roda gates em PRs e pushes para `main`. Em push na `main`, publica a imagem após os gates e aciona o Coolify quando `PRODUCTION_DEPLOY_ENABLED` é `true`. Na verificação de 28/10 essa variável estava ligada; confirme o valor e a versão do workflow antes de operar. CI verde em PR não significa publicação ou implantação.

Há outro fluxo operacional: a versão de [`publish-image.yml` em `origin/codex/hospeda-production`](https://github.com/centraldereservascaldas/hospeda-reservas/blob/codex/hospeda-production/.github/workflows/publish-image.yml) publica no GHCR e aciona o deploy no Coolify via API após os gates. O deploy verifica o tag solicitado e o estado `running:healthy`, e tenta novamente em falhas transitórias. Push nessa branch pode publicar e implantar automaticamente; trate-a como branch de produção. A execução bem-sucedida observada em 26/10 foi [a run 40352328925](https://github.com/centraldereservascaldas/hospeda-reservas/actions/runs/40352328925).

A cópia local não rastreada `.github/workflows/publish-image.yml` **não corresponde** à versão remota: não contém o job de deploy e também difere na condição de publicação e no banco usado pelo smoke. Não use essa cópia para inferir o que ocorrerá na branch remota; compare o workflow da ref exata antes de editar, executar manualmente ou descrever um deploy.

Em uma publicação, registre SHA e digest da imagem produzida; prefira o digest como identidade imutável da imagem candidata e do rollback. No fluxo remoto da branch `codex/hospeda-production`, o workflow seleciona uma tag SHA e chama a API do Coolify; confirme que essa versão é a ref efetivamente executada e verifique qual imagem/tag o serviço está usando.

## Branches e caminho de integração

1. Atualize a branch de trabalho a partir do `origin/main` remoto atual e crie uma branch `codex/<tema>` para a mudança.
2. Abra uma PR para `main`. Revise o diff, confirme os checks relevantes e aguarde a decisão de revisão/merge da equipe.
3. Após merge e push em `main`, acompanhe a execução do workflow `Release image`. A imagem só é candidata quando os gates passam e a publicação GHCR termina com SHA/digest registrados.
4. Em push para `main`, acompanhe os jobs `publish` e `deploy`. Com `PRODUCTION_DEPLOY_ENABLED=true`, o workflow pode acionar o Coolify automaticamente; confirme o resultado e a versão ativa no ambiente.

O fluxo da ref remota `origin/codex/hospeda-production` também encadeia publicação GHCR e deploy Coolify depois dos gates. Push nessa ref pode iniciar o deploy automaticamente; acompanhe o job `deploy` até o estado final e valide o SHA e a saúde no Coolify.

Não use o ponteiro local de `main` sem atualizar e comparar com `origin/main`. A branch `codex/hospeda-production` tem um gatilho de push que publica e implanta automaticamente pelo Coolify; não faça push nessa ref sem intenção explícita de publicação. A `codex/crcn-coolify-preview` é uma referência antiga. A cópia local não rastreada de `publish-image.yml` não representa a versão remota implantadora.

## Coolify: histórico e estado a revalidar

O checklist anterior registrou em 20/10/2026:

- projeto `CRCN Hospeda Reservas`, UUID `ifqaqce2qcbiyqhrcmgq1qda`, ambiente `production`;
- PostgreSQL dedicado `crcn-hospeda-reservas-postgres`, UUID `9bn7a32xssdvsi56wa3om1vv`;
- DNS `A` `crcn.caldasindica.com` para `194.163.141.192`, inicialmente DNS-only;
- aplicação web ainda não criada, ausência de URL pública e necessidade de definir acesso privado ao código. O registro foi superado pelo deploy observado em 27/10, mas as demais configurações precisam ser verificadas no Coolify.

Além do estado antigo, há estes eventos operacionais datados:

- **27/10/2026:** imagem `eec29ca` implantada em `https://crcn.caldasindica.com`.
- **28/10/2026:** restore do PostgreSQL registrado; após a operação, havia 16 tabelas e 18 migrations.

Esses registros provam que houve atividade nesses momentos, não a configuração, versão, dados, saúde ou acessibilidade atuais. Não houve nesta revisão leitura atual do painel Coolify, inspeção do container ou requisição ao domínio. A antiga pendência de deploy key/GitHub App vale apenas se o Coolify clonar o repositório privado; no fluxo de imagem, confirme acesso de leitura ao GHCR.

### Revalidar no painel antes de escolher a imagem

- [ ] Confirmar projeto e ambiente corretos e verificar que recursos de outros projetos não serão alterados.
- [ ] Confirmar a aplicação que recebeu o deploy em 27/10 e se continua associada ao projeto/ambiente esperados.
- [ ] Confirmar a origem selecionada (repositório ou imagem GHCR), método de atualização e se o deploy automático da ref `origin/codex/hospeda-production` continua configurado como no workflow remoto observado.
- [ ] Confirmar que o serviço web usa a imagem atualmente aprovada pelo SHA/digest, e que o tag/tag de produção não aponta para imagem diferente da esperada.
- [ ] Confirmar acesso de pull ao GHCR caso a aplicação consuma imagem publicada; verificar origem Git apenas se for usar build pelo próprio Coolify.
- [ ] Inspecionar configuração de rede, porta interna 80, domínio, TLS e saúde da aplicação. Não considerar DNS ou HTTPS disponíveis sem teste atual.
- [ ] Confirmar se o PostgreSQL dedicado existe, está saudável, tem volume persistente, backup restaurável e acesso privado pela aplicação.
- [ ] Confirmar variáveis de produção diretamente no gerenciador de segredos: `APP_KEY` exclusiva, `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL` HTTPS, `DB_CONNECTION=pgsql` e dados de conexão do banco. Não copiar segredos para este arquivo, logs ou frontend.
- [ ] Manter credenciais Stays, Supabase service role e gateway apenas no backend, após revisar a necessidade de cada integração.
- [ ] Manter checkout próprio, criação de pedido e cobranças desligados até as validações e decisões comerciais descritas na documentação de checkout estarem concluídas.

## Banco, migrations e saúde

O container entrega a aplicação React compilada e a API Laravel sob a mesma origem. O Dockerfile contém SQLite para smoke local; em um ambiente durável, configure PostgreSQL e confirme a conexão usada pelo processo web. O workflow prova compatibilidade de migrations em PostgreSQL descartável de CI, não prova que o banco Coolify recebeu migrations.

- [ ] Confirmar banco e ambiente de destino, migration pendente e backup restaurável antes de executar migration.
- [ ] Executar a estratégia de migration aprovada para o serviço e confirmar o estado no banco de destino. Não use `migrate:fresh` nem remova o volume como procedimento de deploy/rollback.
- [ ] Testar `/api/health` e `/api/ready` pela URL do ambiente. `/api/ready` deve indicar falha quando dependências essenciais, como banco, não estão prontas.
- [ ] Confirmar resposta da SPA, carregamento de assets e rotas `/api/*` no mesmo domínio.
- [ ] Conferir logs recentes de web e banco sem expor tokens, credenciais ou dados pessoais.
- [ ] Se filas ou tarefas agendadas forem habilitadas no escopo publicado, configurar e monitorar worker e scheduler separadamente conforme os comandos e health checks documentados neste arquivo; não os considerar ativos apenas porque a imagem contém Laravel.

## Plano de publicação e recuperação

Antes de qualquer deploy, apresentar à pessoa responsável: ambiente/projeto Coolify, PR e SHA aprovados, digest da imagem, arquivos/alterações relevantes, migrations previstas, variáveis necessárias sem revelar valores, health checks e imagem de rollback. CI/CD e publicação de imagem não autorizam por si só uma alteração no ambiente.

- [ ] Confirmar backup restaurável e a última imagem saudável por digest.
- [ ] Publicar somente o digest escolhido e acompanhar a operação até o estado final.
- [ ] Validar prontidão, página inicial, assets, API, conexão de banco e logs recentes após o deploy.
- [ ] Para rollback de aplicação, selecionar o digest da última imagem saudável e preservar volume e migrations aplicadas; avaliar compatibilidade entre código e schema antes de trocar a imagem.
- [ ] Registrar SHA/digest, horário, resultado e pendências no registro operacional apropriado, sem registrar segredos.

Não há resultado de deploy a registrar como concluído nesta revisão. O estado final do Coolify permanece **não verificado** até a conferência do painel e dos endpoints do ambiente.

## Worker e scheduler, somente quando o checkout estiver autorizado

Estas recomendações aplicam-se quando o checkout e as rotinas assíncronas forem habilitados no ambiente. Não crie worker/scheduler apenas por existir suporte no código. O serviço web usa Apache; se jobs do checkout, e-mails transacionais ou tarefas agendadas estiverem ativos, crie serviços separados com a mesma imagem, banco e variáveis da aplicação:

- Worker: `php artisan queue:work database --tries=5 --timeout=60 --sleep=3 --max-time=3600`.
- Scheduler: `php artisan schedule:work`.
- Mantenha `QUEUE_CONNECTION=database` e `DB_QUEUE_RETRY_AFTER=90`; o timeout do worker deve ficar abaixo de `retry_after`.
- No worker, `--max-time=3600` faz o processo encerrar depois de uma hora; configure reinício automático após qualquer saída. Configure o scheduler também para reiniciar após falha ou reinício do host.
- Worker e scheduler não iniciam Apache. Desabilite/substitua o health check HTTP herdado por um health check de processo: worker `CMD-SHELL tr '\000' ' ' </proc/1/cmdline | grep -F 'artisan queue:work' >/dev/null`; scheduler `CMD-SHELL tr '\000' ' ' </proc/1/cmdline | grep -F 'artisan schedule:work' >/dev/null`. Mantenha o health check HTTP `/api/ready` no serviço web.
- Confirme tabelas `jobs` e `failed_jobs`, atividade nos logs e recuperação após restart do container.

O catálogo e as integrações podem funcionar sem habilitar o checkout. A configuração desses processos não habilita, por si só, pagamento real. Para estado funcional da jornada, limites e validações pendentes, consulte a [especificação do checkout](especificacao-checkout-pagamentos-proprios.md), o [fluxo Stays](stays-checkout-flow.md) e o [runbook do piloto](checkout-80-20-pilot-runbook.md).
