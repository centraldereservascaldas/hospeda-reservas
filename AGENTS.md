# Hospeda Reservas

## Arquitetura

- O frontend existente permanece em React 19, TypeScript, Vite 6 e Tailwind CSS 4.
- O backend novo usa PHP 8.3+ e Laravel 13 para a API HTTP.
- Durante a transição, preserve os contratos `/api/*` consumidos por `src/services/crcnBackendApi.ts`.
- A API Laravel roda em `http://127.0.0.1:8000`; o Vite continua em `http://localhost:3000`.
- Credenciais Stays, OpenAI e Supabase permanecem exclusivamente no backend. Valores `VITE_*` são públicos.
- Não remova `server.ts` nem altere o backend atual até que endpoints sejam migrados e validados por etapas.

## Convenções de trabalho

- Leia este arquivo, `README.md` e a skill `.agents/skills/laravel-best-practices/SKILL.md` antes de alterar o backend.
- Siga a skill `implementar` em `.agents/skills/implementar/SKILL.md` para implementar mudanças.
- Consulte regras aplicáveis em `.agents/skills/laravel-best-practices/rules/` antes de escrever código Laravel.
- Use Form Requests para validar entradas, Resources para respostas de API e serviços para integrações externas, mantendo autenticação e autorização no servidor.
- Preserve o formato das respostas atuais do Express durante a migração, salvo decisão explícita em contrário.
- Nunca grave segredos em arquivos versionados, logs, respostas ou código do frontend.
- Não faça commit, push ou deploy sem solicitação explícita.

## Operação do repositório e produção

- Confira `git status`, a branch e os arquivos alterados antes de trabalhar; preserve alterações preexistentes. Use branch de trabalho e PR para mudanças compartilhadas; registre a revisão e os testes proporcionais ao diff.
- Leia o README e `docs/checklist-implementacao-coolify-hospeda-reservas.md` antes de operar CI ou Coolify. Confira os workflows no commit e no GitHub: o estado da branch, da `main` e da produção pode ser diferente.
- O workflow `release-image.yml` executa testes em PR e, após push na `main` e aprovação dos gates, publica a imagem e pode acionar o Coolify quando `PRODUCTION_DEPLOY_ENABLED` for `true`. Confira o valor e a versão do workflow antes de operar: em 28/10/2026 a variável estava ligada. Backup antes de migrations e rollback seguro ainda precisam ser integrados e validados. A branch remota `codex/hospeda-production` também pode acionar o Coolify.
- Antes de mudar produção, identifique a aplicação, a imagem e o banco corretos; confirme backup recuperável e a compatibilidade das migrations. Evite executar migrations de reversão ou restaurar o banco automaticamente: isso pode apagar reservas, pagamentos e registros posteriores ao backup.
- Prefira imagens por digest, verificações do artefato implantado e health checks após o deploy. Considere segredos, permissões mínimas, concorrência de deploy e controles de acesso da branch. Não exponha credenciais nem execute comandos de produção durante testes locais.

## Qualidade do frontend

- Siga o plano de melhorias em `docs/frontend-quality-plan.md` para mudanças da auditoria; preserve os contratos da API Laravel e o fluxo de checkout hospedado.
- Agrupe componentes por domínio quando houver uma família coesa, como `src/components/property/`; mantenha no diretório compartilhado apenas componentes usados por domínios distintos e migre outras famílias em etapas próprias.
- Prefira imports diretos. Crie um arquivo barrel somente quando houver necessidade concreta de uma API pública do módulo.
- Use `npm` e `package-lock.json` para instalar dependências. Não gere outro lockfile.
- Prefira tipos explícitos para props, serviços e respostas; valide dados externos antes de usá-los na interface e evite novos `any`.
- Associe labels aos campos, dê nomes acessíveis a botões com ícone e mantenha o foco visível para teclado.
- Todo diálogo precisa de nome acessível, semântica de modal e gerenciamento de foco, inclusive retorno ao controle que o abriu. Verifique Escape e diálogos aninhados.
- Reutilize tokens e componentes existentes quando houver repetição real. Respeite `prefers-reduced-motion` em animações.
- Escolha a prioridade de carregamento das imagens conforme sua posição na tela; não adie a imagem principal sem motivo.
- Ao alterar uma jornada, revise estados de carregamento, sucesso, vazio e erro, além dos impactos em busca, detalhe, autenticação, checkout e acesso de proprietário.
- Antes de concluir uma feature, revise o diff, faça as verificações proporcionais à mudança e registre o resultado. Use o checklist completo em `docs/frontend-quality-plan.md`.

## Comandos

- `composer setup`: dependências PHP, ambiente local, SQLite e build frontend.
- `composer dev`: servidor Laravel na porta 8000.
- `npm run dev`: servidor Vite na porta 3000.
- `npm run build`: build do frontend.
- `php artisan route:list --path=api`: rotas da API Laravel.

===

<laravel-boost-guidelines>
=== foundation rules ===

# Laravel Boost Guidelines

## Foundational Context

This application is a Laravel application running on PHP 8.5. Always use the APIs that match the installed major version of each package — do not assume a version.

Before relying on a package's API, confirm its installed version:

- PHP packages: run `composer show --direct` to list direct dependencies with versions, or `composer show <vendor/package>` for a single package.
- JS packages: check `package.json` for the installed versions.

## Skills Activation

This project has domain-specific skills available in `**/skills/**`. You MUST activate the relevant skill whenever you work in that domain—don't wait until you're stuck.

## Conventions

- You must follow all existing code conventions used in this application. When creating or editing a file, check sibling files for the correct structure, approach, and naming.
- Use descriptive names for variables and methods. For example, `isRegisteredForDiscounts`, not `discount()`.
- Check for existing components to reuse before writing a new one.

## Verification Scripts

- Do not create verification scripts or tinker when tests cover that functionality and prove they work. Unit and feature tests are more important.

## Application Structure & Architecture

- Stick to existing directory structure; don't create new base folders without approval.
- Do not change the application's dependencies without approval.

## Frontend Bundling

- If a frontend change doesn't show in the UI or you get a "Unable to locate file in Vite manifest" error, run `npm run build` or ask the user to run `npm run dev` or `composer run dev`.

## Documentation Files

- You must only create documentation files if explicitly requested by the user.

=== boost rules ===

# Laravel Boost

## Tools

- Laravel Boost is an MCP server with tools designed specifically for this application. Prefer Boost tools over manual alternatives like shell commands or file reads.
- Use `database-query` to run read-only queries against the database instead of writing raw SQL in tinker.
- Use `database-schema` to inspect table structure before writing migrations or models.
- Use `get-absolute-url` to resolve the correct scheme, domain, and port for project URLs. Always use this before sharing a URL with the user.
- Use `browser-logs` to read browser logs, errors, and exceptions. Only recent logs are useful, ignore old entries.

## Searching Documentation (IMPORTANT)

- Use `search-docs` before changes that depend on Laravel ecosystem APIs, behavior, configuration, or version-specific syntax. Skip it for copy-only edits and other changes where package documentation is irrelevant. Reuse sufficient results already in context instead of searching again.
- Pass a `packages` array to scope results when you know which packages are relevant.
- Use multiple broad, topic-based queries: `['rate limiting', 'routing rate limiting', 'routing']`. Expect the most relevant results first.
- Do not add package names to queries because package info is already shared. Use `test resource table`, not `filament 4 test resource table`.

### Search Syntax

1. Use words for auto-stemmed AND logic: `rate limit` matches both "rate" AND "limit".
2. Use `"quoted phrases"` for exact position matching: `"infinite scroll"` requires adjacent words in order.
3. Combine words and phrases for mixed queries: `middleware "rate limit"`.
4. Use multiple queries for OR logic: `queries=["authentication", "middleware"]`.

## Project Rules

- This project contains committed, area-grouped rules in `.ai/rules` when that directory exists, including path-scoped framework guidelines under `.ai/rules/boost`. Before you enter plan mode or create/edit any file, you MUST first: open @.ai/rules/index.md (it maps file globs to rule files), read every rule file whose globs cover the path(s) in scope, and run `grep -rin 'keyword' .ai/rules` to catch what a path match alone misses. Do not write code until you have read and are following every matching rule. If `.ai/rules` does not exist, continue without it.

## Artisan

- Run Artisan commands directly via the command line (e.g., `php artisan route:list`). Use `php artisan list` to discover available commands and `php artisan [command] --help` to check parameters.
- Inspect routes with `php artisan route:list`. Filter with: `--method=GET`, `--name=users`, `--path=api`, `--except-vendor`, `--only-vendor`.
- Read configuration values using dot notation: `php artisan config:show app.name`, `php artisan config:show database.default`. Or read config files directly from the `config/` directory.

## Tinker

- Execute PHP in app context for debugging and testing code. Do not create models without user approval, prefer tests with factories instead. Prefer existing Artisan commands over custom tinker code.
- Always use single quotes to prevent shell expansion: `php artisan tinker --execute 'Your::code();'`
  - Double quotes for PHP strings inside: `php artisan tinker --execute 'User::where("active", true)->count();'`

=== php rules ===

# PHP

- Always use curly braces for control structures, even for single-line bodies.
- Use PHP 8 constructor property promotion: `public function __construct(public GitHub $github) { }`. Do not leave empty zero-parameter `__construct()` methods unless the constructor is private.
- Use explicit return type declarations and type hints for all method parameters: `function isAccessible(User $user, ?string $path = null): bool`
- Use TitleCase for Enum keys: `FavoritePerson`, `BestLake`, `Monthly`.
- Prefer PHPDoc blocks over inline comments. Only add inline comments for exceptionally complex logic.
- Use array shape type definitions in PHPDoc blocks.

=== deployments rules ===

# Deployment

- Laravel can be deployed using [Laravel Cloud](https://cloud.laravel.com/), which is the fastest way to deploy and scale production Laravel applications.
- Activate the `deploying-to-cloud` skill whenever deploying to Laravel Cloud, configuring Cloud environments or resources, using the Cloud CLI, or troubleshooting Cloud deployments.

=== laravel/core rules ===

# Do Things the Laravel Way

- Use `php artisan make:` commands to create new files (i.e. migrations, controllers, models, etc.). You can list available Artisan commands using `php artisan list` and check their parameters with `php artisan [command] --help`.
- If you're creating a generic PHP class, use `php artisan make:class`.
- Pass `--no-interaction` to all Artisan commands to ensure they work without user input. You should also pass the correct `--options` to ensure correct behavior.

### Model Creation

- When creating new models, create useful factories and seeders for them too. Ask the user if they need any other things, using `php artisan make:model --help` to check the available options.

## APIs & Eloquent Resources

- For APIs, default to using Eloquent API Resources and API versioning unless existing API routes do not, then you should follow existing application convention.

## URL Generation

- When generating links to other pages, prefer named routes and the `route()` function.

## Testing

- When creating models for tests, use the factories for the models. Check if the factory has custom states that can be used before manually setting up the model.
- Faker: Use methods such as `$this->faker->word()` or `fake()->randomDigit()`. Follow existing conventions whether to use `$this->faker` or `fake()`.
- When creating tests, make use of `php artisan make:test [options] {name}` to create a feature test, and pass `--unit` to create a unit test. Most tests should be feature tests.

=== pint/core rules ===

# Laravel Pint Code Formatter

- If you have modified any PHP files, you must run `vendor/bin/pint --dirty --format agent` before finalizing changes to ensure your code matches the project's expected style.
- Do not run `vendor/bin/pint --test --format agent`, simply run `vendor/bin/pint --format agent` to fix any formatting issues.

=== phpunit/core rules ===

# PHPUnit

- This project uses PHPUnit. Create tests with `php artisan make:test --phpunit {name}`.
- Do not include the test suite directory in `{name}`. Use `SomeFeatureTest`, not `Feature/SomeFeatureTest`.
- Read the `testing-best-practices` skill for guidance on coverage, naming, structure, dependency isolation, and review.

## Running Tests

- Run the narrowest set of tests that covers the change. Pass a file path or `--filter=testName` to `php artisan test --compact`.
- Rerun a test after each change to it.
- Run `vendor/bin/phpunit` to call the test runner directly. It accepts the same file path and `--filter=testName` arguments.

</laravel-boost-guidelines>
