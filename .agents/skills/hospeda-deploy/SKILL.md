---
name: hospeda-deploy
description: "Orienta publicação e recuperação do Hospeda Reservas em Coolify, incluindo CI, GHCR, banco e migrations. Use ao investigar ou executar deploy neste repositório; distingue o workflow local da versão remota que pode disparar Coolify e orienta confirmar a ref e a configuração atual."
---

# Publicação do Hospeda Reservas

Use as instruções do repositório e confirme o estado remoto antes de qualquer operação. Leia `AGENTS.md` e a seção de deploy do `README.md` quando existir. Confirme no Coolify o inventário e as configurações atuais; arquivos de planejamento e registros antigos não substituem essa verificação. Não exponha tokens, credenciais, variáveis privadas ou dados pessoais em comandos, logs ou respostas.

## O que o CI comprova

- `.github/workflows/release-image.yml` executa validações em pull requests e pushes para `main`; no push para `main`, publica a imagem no GHCR depois dos gates e aciona o Coolify quando `PRODUCTION_DEPLOY_ENABLED` for `true`. A variável estava ligada em 28/10/2026; confirme o valor e a versão do workflow antes de qualquer operação. PRs não publicam nem implantam.
- Há duas versões relevantes de `.github/workflows/publish-image.yml`; não as trate como equivalentes:
  - O arquivo local não rastreado executa verificações e publica imagem no GHCR em push para `codex/hospeda-production` ou `workflow_dispatch`, mas não contém job `deploy`.
  - A versão consultada em `origin/codex/hospeda-production:.github/workflows/publish-image.yml` também é acionada por push nessa branch e por `workflow_dispatch`; ela condiciona `publish` e `deploy` à ref `codex/hospeda-production`. Depois de publicar, o job `deploy` atualiza a tag de imagem da aplicação no Coolify, inicia a implantação via API e monitora até estado saudável, usando `COOLIFY_APPLICATION_UUID` e `COOLIFY_TOKEN` como configuração/segredo do GitHub Actions. Portanto, push nessa branch remota com essa versão do workflow pode acionar Coolify automaticamente; `workflow_dispatch` também o faz quando executado nessa ref.
- Antes de concluir se uma execução vai publicar ou implantar, confira a ref/commit do workflow efetivamente usado pelo GitHub Actions. A versão local está untracked e não representa por si só o conteúdo da branch remota. Verifique também a configuração atual da aplicação no Coolify; a existência do job não comprova que as variáveis e o segredo estejam configurados ou que a execução tenha sucesso.
- `release-image.yml` registra SHA e digest imutável no resumo da execução. `publish-image.yml` publica uma tag baseada no SHA, mas não registra o digest no resumo; obtenha o digest diretamente do resultado do build/registry antes de usá-lo. Não trate uma tag como imutável nem a use como única referência para rollback.

## Preparar uma publicação

1. Identifique branch, commit, diff e versão do workflow que será usada; confirme se essa versão contém job de deploy. Após a execução, confira conclusão e resolva o digest imutável no resumo ou no GHCR.
2. Confirme no Coolify o projeto, ambiente, aplicação, origem/repositório, estratégia de atualização, imagem selecionada e recursos conectados. Não infira esses dados do checklist histórico.
3. Confira health check e disponibilidade pelas rotas `/api/health` e `/api/ready`. O container web serve a SPA e API Laravel; preserve os contratos `/api/*` e a persistência do volume PostgreSQL.
4. Antes de executar um deploy ou outra operação externa, mostre ao usuário o alvo, SHA/digest, alterações relevantes, migrações previstas, verificação pós-deploy e plano de retorno. Faça a operação somente com autorização explícita para publicação.
5. Após publicar, acompanhe o estado até conclusão e valide health checks, logs recentes sem segredos, rotas críticas e recursos do ambiente.

## Banco, backup e migrations

- Antes de migration de produção, confirme o banco e ambiente de destino, estado atual das migrations e existência/horário de um backup restaurável. Siga o procedimento de backup suportado pelo ambiente Coolify/PostgreSQL configurado; verifique o resultado sem imprimir dados ou credenciais.
- Trate migrations aplicadas em ambiente compartilhado como imutáveis. Revise locks, volume de dados, compatibilidade da versão anterior e possibilidade de avanço seguro; prefira mudanças em etapas compatíveis com código antigo e novo.
- As verificações de compatibilidade no CI não provam que migration de produção foi executada. Confirme explicitamente o plano de execução no ambiente de destino.
- Não use `migrate:fresh`, não apague nem recrie o volume como forma de recuperação e não reverta migrations que descartem ou transformem dados sem um plano validado.
- Para rollback de aplicação, selecione a última imagem saudável por digest e preserve o volume e os dados atuais. Considere que a versão anterior precisa continuar compatível com as migrations já aplicadas.
- Restore de backup altera dados e pode sobrescrever transações posteriores ao backup. Faça restore primeiro em destino isolado para validar quando viável; restaure produção somente após autorização explícita e confirmação do destino, snapshot e janela de perda de dados.

## Limites de operação

- Não faça commit, push, merge, publicação ou alteração em Coolify sem pedido explícito do usuário. A autorização para editar código não autoriza publicar.
- Não altere domínio, DNS, segredos, volumes, banco ou recursos de outros projetos como parte de um deploy do Hospeda Reservas.
- Se o alvo, a imagem, o backup ou a estratégia de rollback não puderem ser confirmados, pare antes da mutação e explique qual evidência está faltando.
