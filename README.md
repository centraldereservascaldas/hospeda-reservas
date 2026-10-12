# Hospeda Reservas

Aplicação de reservas com frontend React 19, TypeScript, Vite 6 e Tailwind CSS 4; API Laravel 13/PHP 8.3+; banco configurável via Laravel (SQLite local por padrão). Supabase Auth continua como provedor de identidade. Dados de hóspedes e permissões de proprietário são persistidos no banco Laravel. Stays e OpenAI são acessados apenas pelo backend.

## Requisitos

- PHP 8.3+ com extensões PDO SQLite, OpenSSL, Mbstring e Ctype
- Composer 2+
- Node.js 20+

## Configuração local

1. `composer install`
2. `cp .env.example .env` e configure Supabase, Stays e OpenAI quando aplicável. Mantenha chaves privadas sem prefixo `VITE_`.
3. `php artisan key:generate`
4. Crie o SQLite local: `touch database/database.sqlite`
5. `php artisan migrate`
6. `npm ci`
7. Inicie a API com `composer dev` (porta 8000) e o frontend em outro terminal com `npm run dev` (porta 3000).

O Vite encaminha `/api/*` e `/external/v1/*` para `VITE_API_PROXY_TARGET`. O padrão local é `http://127.0.0.1:8000`.

O backend Express anterior permanece disponível durante a migração pelo comando `npm run legacy:dev`; o fluxo padrão usa Laravel. Não remova `server.ts` nem as dependências Express até concluir a migração e validar os endpoints restantes.

## Verificação

- Frontend: `npm ci`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`
- Backend: `php artisan test`, `./vendor/bin/pint --test`, `php artisan route:list --path=api`
- Health check: `GET /api/health`

`npm run lint` executa ESLint em `src/`, `tests/` e na configuração do Vite (incluindo regras de acessibilidade JSX e Hooks), além da verificação de tipos TypeScript. Regras de lint ainda não saneadas no legado são reportadas como avisos para permitir correção progressiva; violações das regras dos Hooks e erros de tipos falham a verificação. `npm test` também verifica contenção de foco, teclado, Escape e retorno do foco em diálogos. O workflow **Frontend quality** executa essas verificações em pushes para `main` e pull requests. Como a formatação Prettier ainda não foi aplicada ao legado, `npm run format:check` cobre somente os arquivos de tooling, documentação e o novo teste; formate os arquivos alterados com `npx prettier --write caminho/do/arquivo` até que a migração gradual permita ampliar essa checagem sem reescrever tudo de uma vez.

## Autenticação e dados

O navegador usa apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O middleware valida cada bearer token no Supabase Auth. Laravel grava o vínculo `guest_profiles` e os pedidos de acesso `owner_access`; não há FK para `auth.users`, pois a identidade continua externa. `SUPABASE_SERVICE_ROLE_KEY`, credenciais Stays e chave OpenAI são exclusivamente server-side.

A API mantém os contratos consumidos em `src/services/crcnBackendApi.ts` e os aliases `/external/v1` usados pela interface de integração. Reservas e disponibilidade permanecem autoritativas na Stays. O checkout redireciona para o checkout hospedado Stays; não confirma pagamento localmente.

## Skills e instruções locais

As skills Laravel e de testes estão em `.agents/skills/`. Leia `AGENTS.md` antes de alterar este sistema.
