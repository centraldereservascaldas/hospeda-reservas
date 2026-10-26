# Skill Stays API

Skill portátil do Codex para a operação diária de anúncios e acomodações na Stays, com consulta e integração da External API. Inclui playbooks operacionais e um catálogo derivado do snapshot OpenAPI.

## Instalar no Codex

1. Extraia a pasta `stays-api` para `~/.codex/skills/stays-api`.
2. Reinicie ou atualize a sessão do Codex para carregar a skill.
3. Se o trabalho for em um projeto CRCN, mantenha também a skill no diretório local `.codex/skills/stays-api` desse projeto, conforme as instruções do projeto.

## Configurar credenciais

O arquivo `.env.example` documenta as variáveis necessárias. Para configuração local, copie-o como `.env` e preencha `STAYS_CLIENT_ID` e `STAYS_CLIENT_SECRET` com credenciais da External API fornecidas pela Stays. O padrão `STAYS_BASE_URL` aponta para a conta CRCN; em outra conta, use a URL autorizada correspondente.

```sh
cp .env.example .env
chmod 600 .env
```

O Codex não carrega `.env` automaticamente. O projeto ou comando que fizer a chamada deve carregar essas variáveis de forma segura. Nunca coloque os segredos em prompts, frontend, relatórios, logs ou arquivos compartilhados.

## Compartilhar/atualizar o pacote

Na pasta da skill, execute:

```sh
./scripts/export-skill.sh /caminho/seguro/stays-api-skill.zip
```

O ZIP não contém `.env`, `.DS_Store`, caches, dependências ou repositórios Git. Compartilhe apenas o ZIP gerado; cada computador configura seu próprio `.env`.

## Conteúdo

- `SKILL.md`: instruções que o Codex usa para tarefas Stays.
- `references/`: roteador de linguagem natural, ciclo de vida do anúncio, playbooks por tarefa, catálogo completo de endpoints, documentação do produto e snapshot OpenAPI.
- `agents/openai.yaml`: metadados de apresentação da skill.
- `scripts/inspect-openapi.py`: busca operações do snapshot por rota, resumo, tag ou operationId.
- `scripts/build-endpoint-catalog.py`: atualiza o catálogo Markdown completo a partir do OpenAPI.
- `scripts/export-skill.sh`: empacotador com validação de conteúdo e exclusão de segredos.
