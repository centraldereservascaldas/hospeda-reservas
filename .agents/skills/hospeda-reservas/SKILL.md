---
name: hospeda-reservas
description: "Ajuda a entender e navegar a arquitetura e as jornadas do site Hospeda Reservas: catálogo Stays, busca, autenticação, reservas e checkout. Use para perguntas sobre comportamento atual, integrações ou onde implementar uma mudança neste repositório."
---

# Guia do projeto Hospeda Reservas

Comece pelo [README](../../../README.md) para configuração local, estrutura e estado funcional registrado. Leia `AGENTS.md` antes de editar. Use este guia como mapa para localizar o código; confirme o comportamento no código e nos testes atuais, pois o README e documentos de planejamento podem ficar defasados. Não copie detalhes extensos de especificações para esta skill.

## Arquitetura e contratos

- O frontend React/TypeScript/Vite está em `src/`; a API corrente é Laravel em `app/` e `routes/api.php`. O Express legado em `server.ts` permanece durante a migração.
- Preserve os contratos `/api/*` usados por `src/services/crcnBackendApi.ts` e os aliases `/external/v1/*` definidos nas rotas Laravel. Leia `routes/api.php` e `routes/web.php` antes de mudar contratos ou roteamento da SPA.
- A UI é agrupada por domínio em `src/components/`; leia `README.md` para as fronteiras já adotadas e procure componentes existentes antes de criar outros.

## Catálogo, busca e Stays

- Para seguir a busca, leia `src/components/search/` (em especial `StaysSearchWidget.tsx` e `AvailabilitySearchState.tsx`), os clientes em `src/services/staysApi.ts` e `src/services/crcnBackendApi.ts`, depois `AccommodationController` e `StaysExternalApiClient`.
- Stays é fonte autoritativa para catálogo, disponibilidade, cotação e reservas. Credenciais ficam no backend. Confira `config/services.php`, `app/Services/StaysExternalApiClient.php` e os métodos de `AccommodationController`/`BookingController` antes de alterar integração.
- Para operações ou contratos da Stays External API, use também a skill local `.codex/skills/stays-api/SKILL.md` e o OpenAPI que ela indica; não deduza chamadas externas apenas pelo nome dos métodos.
- O simulador local está em `app/Services/StaysSimulator.php`, com conexão e migrations próprias em `config/database.php` e `database/migrations/stays_simulator/`. Consulte o README para ativação e limites; não trate dados simulados como reais nem habilite o simulador fora de local/test sem conferir a proteção.

## Autenticação e acesso

- O cliente Supabase no navegador está em `src/services/supabase.ts`; tokens são verificados no backend por `VerifySupabaseGuest` e `SupabaseAuthClient`. Acompanhe as rotas protegidas em `routes/api.php`.
- Perfis de hóspedes e solicitações de acesso de proprietários são persistidos pelo Laravel; leia `GuestReservationController`, `OwnerAccessController`, os middlewares e migrations relacionadas antes de alterar autorização.
- Nunca exponha service-role, credenciais Stays, OpenAI ou gateways no frontend, em variáveis `VITE_*`, logs ou mensagens. A chave anônima Supabase é pública e tem tratamento diferente de segredos server-side.

## Reservas, checkout e pagamentos

- Para o fluxo da interface, leia `src/services/checkoutApi.ts` e os componentes de `src/components/booking/`. No backend, comece em `BookingController`, `CheckoutPaymentController`, `DirectCheckoutService` e `DirectCheckoutPaymentService`.
- A retomada sem sessão usa `X-Checkout-Resume-Token`; siga sua geração, armazenamento e validação antes de tocar na URL ou nos dados do checkout. Não coloque token de retomada, PII ou valores finais em query strings.
- Gateways e notificações: consulte `app/Services/Payments/`, `MercadoPagoWebhookController`, `CieloWebhookController`, `routes/api.php` e jobs de reconciliação. Estados locais precisam continuar reconciliáveis com o provedor e com a Stays.
- A existência de código de checkout não significa que vendas estejam autorizadas. Confira readiness, termos comerciais, flags de `config/direct-booking.php`, `.env` do ambiente e README atual. Não ligue cobrança real sem autorização explícita e validação operacional.
- Use `docs/especificacao-checkout-pagamentos-proprios.md`, `docs/adr/0001-checkout-proprio-e-informacoes-em-camadas.md` e `docs/roadmap-vendas-diretas.md` para decisões e intenção; confirme sempre o código implantado e os estados reais.

## Qualidade e publicação

- `.github/workflows/frontend-quality.yml`, `backend-quality.yml`, `postgres-migrations.yml` e `release-image.yml` mostram verificações automatizadas; consulte cada workflow atual antes de concluir o que CI cobre.
- Para CI, GHCR, Coolify, backup, migrations e recuperação, use a skill `.agents/skills/hospeda-deploy/SKILL.md`. Os workflows de publicação de imagem não comprovam, por si, que o Coolify esteja conectado ou que deploy automático esteja ativo.
- Para mudanças Laravel, leia `.agents/skills/laravel-best-practices/SKILL.md`; para UI, siga `docs/frontend-quality-plan.md` e o fluxo de trabalho definido no `AGENTS.md`.
