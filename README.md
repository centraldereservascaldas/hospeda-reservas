# Hospeda Reservas

Aplicação de reservas com frontend React 19, TypeScript, Vite 6 e Tailwind CSS 4; API Laravel 13/PHP 8.3+; banco configurável via Laravel (SQLite local por padrão). Supabase Auth continua como provedor de identidade. Dados de hóspedes e permissões de proprietário são persistidos no banco Laravel. Stays e OpenAI são acessados apenas pelo backend.

## Requisitos

- PHP 8.3+ com extensões PDO SQLite, OpenSSL, Mbstring e Ctype
- Composer 2+
- Node.js 20+

## Organização do frontend

- Componentes do domínio de acomodação ficam em `src/components/property/`, incluindo cartão, catálogo, detalhe e suas seções/diálogos.
- Busca e filtros ficam em `src/components/search/`; condomínio e localização em `src/components/condominium/` e `src/components/location/`.
- Reservas/viagens, conta, proprietário e Sofia ficam em `src/components/booking/`, `account/`, `owner/` e `assistant/`.
- O diretório `src/components/` fica para elementos de layout realmente compartilhados, como cabeçalho, rodapé, navegação mobile e o hook de foco de diálogos.
- Imports apontam para os arquivos do domínio; não criar arquivos barrel apenas para reexportar componentes.

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

`npm run lint` executa ESLint em `src/`, `tests/` e na configuração do Vite (incluindo regras de acessibilidade JSX e Hooks), além da verificação de tipos TypeScript. Regras de lint ainda não saneadas no legado são reportadas como avisos para permitir correção progressiva; violações das regras dos Hooks e erros de tipos falham a verificação. `npm test` também verifica contenção de foco, teclado, Escape e retorno do foco em diálogos. O workflow **Frontend quality** executa essas verificações em pushes para `main` e pull requests. Como a formatação Prettier ainda não foi aplicada ao legado, `npm run format:check` cobre o tooling e uma lista progressiva de testes e componentes extraídos; formate arquivos novos ou alterados fora dessa lista com `npx prettier --write caminho/do/arquivo`, sem reformatar o legado em massa.

Use o checklist de novas features e o plano de auditoria em [`docs/frontend-quality-plan.md`](docs/frontend-quality-plan.md); o despacho operacional para subagents está em [`docs/frontend-quality-subagent-plan.md`](docs/frontend-quality-subagent-plan.md).

## Autenticação e dados

O navegador usa apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`. O middleware valida cada bearer token no Supabase Auth. Laravel grava o vínculo `guest_profiles` e os pedidos de acesso `owner_access`; não há FK para `auth.users`, pois a identidade continua externa. `SUPABASE_SERVICE_ROLE_KEY`, credenciais Stays e chave OpenAI são exclusivamente server-side.

### Supabase de teste

Há um projeto Supabase hospedado e exclusivo para testar a CRCN. A CLI está vinculada a esse projeto nesta máquina; a referência local fica em `supabase/.temp/` (ignorado pelo Git). `supabase/config.toml` define os retornos de autenticação para `http://localhost:3000` e `http://127.0.0.1:3000`. O projeto de teste dispensa confirmação de e-mail para facilitar cadastro/login local; não aplique essa configuração a um projeto de produção.

Neste ambiente, o `.env` ignorado pelo Git contém URL e chaves do Supabase de teste e usa o PostgreSQL dele pelo **pooler em modo de sessão**, com SSL. As migrações Laravel foram aplicadas a esse banco. A conta de QA e sua senha também estão somente no `.env` local (`SUPABASE_TEST_USER_EMAIL` e `SUPABASE_TEST_USER_PASSWORD`). Não copie esses valores para arquivos versionados nem para `VITE_*`, exceto URL e chave pública. As migrações antigas em `supabase/migrations/` não substituem as migrações Laravel atuais; não execute `supabase db push` sem revisar o destino e o escopo.

Para outro computador, obtenha as credenciais desse projeto de teste, configure as mesmas variáveis no `.env` e vincule a CLI com `supabase link --project-ref <referência-do-projeto>`. O `supabase start` local exige um runtime de containers e **não é necessário** para usar o projeto hospedado. Os testes automatizados do Laravel continuam isolados em SQLite em memória por `phpunit.xml`; o PostgreSQL hospedado serve ao desenvolvimento e aos testes manuais da aplicação.

A API mantém os contratos consumidos em `src/services/crcnBackendApi.ts` e os aliases `/external/v1` usados pela interface de integração. Reservas e disponibilidade permanecem autoritativas na Stays. O redirecionamento para o checkout hospedado Stays foi desativado. A implementação local inclui criação idempotente de pedido, pré-reserva `reserved`, retomada protegida, tentativa de pagamento Mercado Pago e reconciliação; ela ainda não foi validada ponta a ponta. As flags `DIRECT_BOOKING_ENABLED`, `DIRECT_BOOKING_PAYMENTS_ENABLED` e `DIRECT_BOOKING_CONFIRMATION_ENABLED` permanecem desligadas, e não há condições comerciais aprovadas no catálogo. Por isso a interface mantém a compra desabilitada e a API não inicia pedido ou cobrança. A proposta de compra como visitante não depende de sessão autenticada.

## Checkout próprio em implementação

A jornada de venda direta e o sistema de pagamento estão detalhados na [especificação do checkout](docs/especificacao-checkout-pagamentos-proprios.md), com [decisão de arquitetura](docs/adr/0001-checkout-proprio-e-informacoes-em-camadas.md) e [ordem de execução](docs/roadmap-vendas-diretas.md). Mercado Pago com Pix e cartão é a primeira integração planejada; a CRCN recebe o valor integral e registra reserva/pagamento na Stays. A integração e a interface ainda não foram validadas ponta a ponta nem habilitadas para compra.

A rota `/checkout/{referenciaPublica}` já retoma o pedido, exigindo `X-Checkout-Resume-Token`; a credencial fica guardada no navegador que iniciou a compra e não deve ser enviada em query string. O alias `/reservar/{listingId}` abre o anúncio e pré-preenche datas e hóspedes pelos parâmetros permitidos, sem criar pedido; a cotação e a compra continuam dependendo de validação no servidor e de condições aprovadas. Dados pessoais, tokens, segredos e valor final não devem ser colocados na query string.

## Skills e instruções locais

As skills Laravel e de testes estão em `.agents/skills/`. Leia `AGENTS.md` antes de alterar este sistema.
