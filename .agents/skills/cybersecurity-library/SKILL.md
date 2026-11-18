---
name: cybersecurity-library
description: Navega a biblioteca local de skills de cibersegurança da Anthropic para tarefas defensivas. Use apenas a skill específica adequada ao escopo e autorização; prefira revisão de código, segurança de aplicações web/APIs, dependências e CI.
---

# Biblioteca de skills de cibersegurança

O repositório upstream está espelhado integralmente em `references/Anthropic-Cybersecurity-Skills/` para consulta. Ele contém conteúdo defensivo e ofensivo; a presença local não autoriza testes contra sistemas reais nem execução de comandos de exploração. Leia a skill escolhida antes de usá-la e siga o escopo explicitamente autorizado pelo usuário.

## Seleção inicial para este projeto

O catálogo tem 817 arquivos `SKILL.md`. Consulte a coleção completa quando necessário, mas prefira começar por:

- `conducting-api-security-testing/SKILL.md` — revisar segurança de APIs em escopo autorizado.
- `testing-api-security-with-owasp-top-10/SKILL.md` — verificar controles de APIs REST.
- `testing-api-for-broken-object-level-authorization/SKILL.md` — autorização por objeto/tenant.
- `testing-api-for-mass-assignment-vulnerability/SKILL.md` — atribuição e validação de campos.
- `testing-api-authentication-weaknesses/SKILL.md` — fronteiras de autenticação.
- `performing-sca-dependency-scanning-with-snyk/SKILL.md` — análise de dependências e cadeia de suprimentos.
- `securing-github-actions-workflows/SKILL.md` — hardening de workflows GitHub Actions.
- `performing-security-headers-audit/SKILL.md` — cabeçalhos de segurança web.

Skills de exploração, enumeração externa, phishing, malware, pós-exploração e operações ofensivas não devem ser executadas para este projeto sem escopo e autorização explícitos. Prefira análise estática e validação local isolada. As orientações upstream podem assumir ferramentas/ambientes que não estão disponíveis aqui; confira os requisitos antes de seguir qualquer procedimento.

## Origem

- Projeto: https://github.com/mukul975/Anthropic-Cybersecurity-Skills
- Commit espelhado: `54a798831d2266a3ca61ce68a7acb80b81160d57`
- Licença upstream: Apache-2.0 (consulte `references/Anthropic-Cybersecurity-Skills/LICENSE`)
