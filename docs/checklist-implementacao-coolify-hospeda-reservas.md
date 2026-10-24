# Checklist de implantação do Hospeda Reservas em projeto próprio no Coolify

Registro histórico verificado em 20/10/2026. O estado remoto precisa ser conferido novamente antes de qualquer publicação. O destino proposto era um preview público temporário em `https://crcn.caldasindica.com`.

## Situação atual

- [x] Acesso à API do Coolify validado com token `Read`, `Write` e `Deploy`, com validade de 30 dias. O token está guardado em arquivo de ambiente local fora do repositório, com permissões restritas.
- [x] Identificada a VPS do Coolify: `194.163.141.192`; painel em `https://cy.caldasindica.com`.
- [x] Confirmada a zona Cloudflare `caldasindica.com`; o nome `caldusindica.com` não está cadastrado. O subdomínio pretendido é `crcn.caldasindica.com`.
- [x] Inventariados serviços CRCN existentes no projeto `caldas_indica`, incluindo CRCN Search API, CRCN Vistorias e PostgreSQL. Esses recursos devem permanecer intactos e não serão reutilizados pelo Hospeda Reservas.
- [x] Criado o projeto Coolify exclusivo `CRCN Hospeda Reservas`, UUID `ifqaqce2qcbiyqhrcmgq1qda`, com ambiente `production` (`w09miyshazoqlr7bzvwkgwkt`).
- [x] Criado o registro DNS `A` `crcn.caldasindica.com` → `194.163.141.192`, DNS-only; a resolução já foi confirmada.
- [x] Preparada e publicada a branch isolada `codex/crcn-coolify-preview`, commit `902b8bf`; o build do frontend passou.
- [x] Criado PostgreSQL privado `crcn-hospeda-reservas-postgres` (UUID `9bn7a32xssdvsi56wa3om1vv`) no ambiente `production`; container confirmado saudável via SSH.
- [ ] Aplicação web ainda não foi criada; variáveis de runtime e deploy seguem pendentes.
- [ ] Coolify só tem a fonte GitHub `Public GitHub`; a conta GitHub autenticada não tem permissão administrativa no repositório para cadastrar uma deploy key. Configurar uma GitHub App com acesso ao repositório ou conceder essa permissão ao usuário de implantação.
- [ ] URL pública ainda não está disponível.

## 1. Preparar a versão que será publicada

- [x] Revisar o diff isolado da branch `codex/crcn-coolify-preview` (somente `nixpacks.toml` e `routes/web.php`).
- [x] Confirmar a origem privada GitHub `centraldereservascaldas/hospeda-reservas` e publicar a branch isolada.
- [ ] Dar ao Coolify acesso de leitura ao repositório privado via GitHub App ou deploy key.
- [ ] Selecionar e revisar apenas os commits que farão parte do preview; o número de alterações locais registrado em 20/10/2026 não representa o estado atual de `main`.
- [ ] Confirmar que a montagem serve o React/Vite e a API Laravel pela mesma origem, preservando as rotas `/api/*`.
- [ ] Validar build, rotas de saúde e migrações antes de publicar.

## 2. Criar um projeto Coolify exclusivo

- [x] Criar no Coolify um projeto novo chamado `CRCN Hospeda Reservas`, exclusivo para este site.
- [x] Usar o ambiente `production` criado automaticamente dentro do projeto novo.
- [ ] Manter o projeto `caldas_indica` e todos os recursos atuais sem alterações; não anexar a aplicação nem compartilhar o banco existente.
- [ ] Criar dentro do projeto novo a aplicação web Laravel + React/Vite, com PHP 8.3+, porta interna configurada e `APP_DEBUG=false`.
- [x] Criar dentro do projeto novo um PostgreSQL dedicado; manter o banco privado na rede interna do Coolify, com volume persistente.
- [ ] Configurar `APP_KEY` exclusivo, URL da aplicação, conexão PostgreSQL e armazenamento persistente necessário.
- [ ] Manter checkout e pagamentos próprios desabilitados no preview.

## 3. Configurar integrações com segurança

- [ ] Obter autorização específica antes de copiar credenciais Stays do `.env` local para as variáveis privadas do backend no Coolify.
- [ ] Configurar `STAYS_CLIENT_ID` e `STAYS_CLIENT_SECRET` apenas no backend; nunca usar prefixo `VITE_` para segredos.
- [ ] Se autenticação Supabase for necessária no preview, configurar URL e chave pública no build do frontend; manter a service-role key somente no backend e só quando autorizada.
- [ ] Não configurar chaves de gateways de pagamento enquanto o checkout permanecer desligado.
- [ ] Definir política de logs sem tokens, dados pessoais ou credenciais.

## 4. Publicar o endereço temporário

- [x] Criar na zona Cloudflare o registro `A` de `crcn.caldasindica.com` apontando para `194.163.141.192`.
- [ ] Usar DNS-only durante a emissão do certificado TLS pelo Coolify; ativar proxy Cloudflare somente após validar HTTPS e comportamento do proxy.
- [ ] Associar `https://crcn.caldasindica.com` à aplicação no Coolify e aguardar emissão do certificado.
- [ ] Implantar a versão aprovada e confirmar que o Coolify concluiu o deploy com status saudável.

## 5. Validar antes de compartilhar o link

- [ ] `GET /api/health` responde com sucesso em HTTPS.
- [ ] A página inicial, arquivos estáticos, navegação SPA e rotas `/api/*` funcionam no mesmo domínio.
- [ ] Catálogo, detalhes, disponibilidade e cotação recebem dados ao vivo da Stays.
- [ ] Não há chamadas do navegador para APIs internas sem TLS nem segredos expostos nos arquivos JavaScript.
- [ ] Checkout próprio, criação de pedidos e pagamentos continuam bloqueados.
- [ ] Conferir logs recentes do Coolify e resposta anônima da página pública.
- [ ] Compartilhar o link temporário somente após todos os itens acima passarem.

## Serviços previstos

| Serviço | Para o preview de catálogo | Antes de ativar checkout |
| --- | --- | --- |
| Projeto Coolify `CRCN Hospeda Reservas` | Necessário para isolar os recursos deste site | Necessário |
| Aplicação web (React/Vite + API Laravel), no projeto novo | Necessário | Necessário |
| PostgreSQL privado, dedicado ao projeto novo | Necessário para persistência da aplicação | Necessário |
| Worker de filas | Não necessário enquanto ações em fila estiverem desabilitadas | Necessário para jobs e e-mails do checkout |
| Scheduler Laravel | Não necessário para navegação do catálogo | Necessário para reconciliações e tarefas periódicas |

## Publicação e recuperação

- [ ] Antes de push/deploy, apresentar branch, commit, arquivos incluídos, variáveis necessárias, health checks e plano de rollback para aprovação.
- [ ] Revisar os commits atuais de `main` e as flags de checkout antes de definir o candidato; este checklist não autoriza publicar tudo em bloco.
- [ ] Preservar o volume PostgreSQL durante rollback; reverter a aplicação para a última imagem saudável sem apagar dados.
- [ ] Ao encerrar o preview temporário, remover o DNS e os serviços somente após autorização e confirmar que não há dados que precisem ser preservados.
