# Documentação de Desenvolvimento: Modularização e Calendário Perpétuo da Home

## Contexto e Objetivo
A página inicial apresentava recarregamentos frequentes de cotações, imagens estáticas de mock (toalha com flor) e feriados/eventos já passados (como Consciência Negra e datas de 2026 já decorridas) devido a regras de calendário hardcoded.

Esta frente de trabalho foi estruturada em sprints iterativas:
1. **Sprint 1 (Executada):** Estabilização de revalidações, remoção de imagens genéricas e cálculo perpétuo de datas futuras no frontend.
2. **Sprint 2 (Planejada):** Criação de tabela/model no Laravel (`discovery_campaigns` / `promotional_events`) com endpoints de API para gerenciar campanhas e eventos por banco de dados.
3. **Sprint 3 (Planejada):** Integração do frontend consumindo os eventos dinâmicos do backend.
4. **Sprint 4 (Planejada):** Interface de gestão no painel administrativo para controle sem intervenção de código.

---

## Sprint 1: Detalhes das Implementações

### 1. Revalidação e TTL de Cotações da Home
- **Arquivo modificado:** `src/components/search/SeasonalDateSuggestions.tsx`
- **Problema:** `QUOTE_TTL_MS` estava em 45 segundos, reiniciando timers e disparando requisições contínuas para `/api/search` em loop visível.
- **Solução:**
  - TTL estendido para 10 minutos (`600_000ms`), garantindo navegação suave e economia de recursos.
  - Implementada verificação de `document.hidden` para não disparar chamadas quando a aba do navegador estiver inativa em segundo plano.

### 2. Remoção do Mock de Imagem Genérica ("Toalha com Flor")
- **Arquivos modificados:** `src/data/staysApartments.ts` e `resources/data/stays-apartments.json`
- **Problema:** A imagem `photo-1540555700478-4be289fbecef` do Unsplash figurava em 18 anúncios de apartamentos locais.
- **Solução:** Substituída pela imagem real de infraestrutura termal hospedada na CDN oficial Stays (`https://crcn.stays.net/image/6a344d6b9a142d820bc52526`), com carregamento rápido e temático condizente com Caldas Novas.

### 3. Filtro Perpétuo de Datas e Eventos Futuros
- **Arquivos modificados:** `src/utils/surpriseDates.ts` e `src/utils/homeDateSuggestions.ts`
- **Problema:** Datas de eventos (como Caldas Country 2026) estavam congeladas em código, persistindo mesmo após o término do evento. Feriados anteriores a hoje apareciam na lista.
- **Solução:**
  - As sugestões agora respeitam estritamente a janela futura `earliestCheckIn = addDays(today, 2)`.
  - Eventos só são gerados se a data de início for igual ou posterior a `earliestCheckIn`.
  - O Caldas Country e outros eventos passam a exibir ano e período calculados dinamicamente (`formatEventPeriod`), projetando automaticamente a próxima edição futura e eliminando datas passadas.

---

## Sprint 2: Modelagem de Campanhas e API Laravel (Executada)

### 1. Banco de Dados e Modelagem
- **Migration:** `database/migrations/2026_11_26_002644_create_discovery_campaigns_table.php`
  - Campos: `id`, `slug`, `title`, `eyebrow`, `description`, `check_in`, `check_out`, `kind`, `is_active`, `weight`, `display_from`, `display_until`.
  - Índices compostos para consultas rápidas de status ativo e datas futuras.
- **Model:** `app/Models/DiscoveryCampaign.php`
  - Scope `activeForDisplay()` que garante que apenas eventos ativos, futuros e dentro da janela de exibição sejam retornados.
- **Factory & Seeder:** `database/factories/DiscoveryCampaignFactory.php` e `database/seeders/DiscoveryCampaignSeeder.php`

### 2. Controller, Resource e Rota de API
- **Resource:** `app/Http/Resources/DiscoveryCampaignResource.php`
- **Controller:** `app/Http/Controllers/Api/DiscoveryCampaignController.php`
- **Rota HTTP:** `GET /api/discovery/campaigns` em `routes/api.php`.
- **Testes Automatizados:** `tests/Feature/DiscoveryCampaignApiTest.php` cobrindo cenários de eventos inativos, expirados, janelas de display e eventos futuros. Formatação garantida via Laravel Pint.

---

## Validação e Qualidade
- **Testes de Unidade Frontend:** `tests/homeDateSuggestions.test.ts` e `tests/seasonalDateSuggestions.test.ts` (18 testes passando com 100% de sucesso).
- **Testes Backend:** `vendor/bin/phpunit` (780 testes executados, 777 aprovados e 3 ignorados por skip preexistente, 0 falhas).
- **Build de Produção:** `npm run build` compilou Astro e Vite 6 sem erros de TypeScript ou assets.
