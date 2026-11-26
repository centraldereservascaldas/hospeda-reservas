# Checklist de homologação do portal de afiliados

Este checklist acompanha a homologação funcional e a preparação de publicação do portal. Para riscos técnicos, segurança e banco, consulte [checklist-review-afiliados-seguranca-banco.md](checklist-review-afiliados-seguranca-banco.md). Publicação depende da conclusão dos bloqueadores aplicáveis e dos controles operacionais.

## Validações locais já executadas

- [x] `AffiliateAccessTest.php`: 6 testes, 97 assertions.
- [x] `DirectCheckoutIntegratedJourneyTest.php`: 17 testes, 338 assertions.
- [x] `affiliateAttribution.test.ts` + `checkoutAttributionIntegration.test.ts`: 8 testes.
- [x] TypeScript frontend e build Vite.

Comando rápido para repetir a validação frontend do portal:

```bash
npm run test:affiliate
```

## Funcionalidades entregues

- [x] Cadastro, login e solicitação de acesso via Supabase.
- [x] Aprovação, recusa, suspensão e reativação de afiliados.
- [x] Percentual de comissão configurável por afiliado.
- [x] Catálogo de imóveis liberados para divulgação.
- [x] Bloqueio administrativo de imóveis para novos links.
- [x] Link individual com token opaco aleatório gerado no servidor.
- [x] Captura da indicação com validade e escopo por imóvel.
- [x] Indicação armazenada no backend e recuperada pelo cookie no mesmo navegador por sete dias.
- [x] Link curto pode ser aberto em outro dispositivo: o redirecionamento cria uma nova atribuição server-side naquele dispositivo.
- [ ] Recuperação de uma atribuição sem reabrir o link (por login/código) ainda não existe e não faz parte do fluxo atual.
- [x] Vínculo server-side entre checkout, reserva e afiliado.
- [x] Comissão pendente e fluxo administrativo de aprovação/registro de pagamento, protegido por elegibilidade de estadia concluída. A regra monetária ainda não é calculada pelo servidor.
- [x] Isolamento das reservas exibidas para cada afiliado.
- [x] Paginação dos painéis.

## Configuração de homologação

- [ ] Criar projeto Supabase de teste e confirmar que não é o projeto de produção.
- [ ] Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` somente no ambiente de teste.
- [ ] Configurar `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no backend de teste.
- [ ] Configurar `HOSPEDA_OWNER_ADMIN_EMAILS` com uma conta administrativa de teste.
- [ ] Configurar `APP_URL` e as URLs de redirect do Supabase para o domínio de homologação.
- [ ] Executar as migrations de afiliados no banco de teste.
- [ ] Confirmar que `APP_KEY` do teste é diferente da produção.
- [ ] Confirmar CORS, cookies e HTTPS no domínio de teste.

## Roteiro ponta a ponta

1. Criar uma conta de afiliado usando um e-mail de teste.
2. Solicitar acesso e aprovar pelo painel administrativo.
3. Definir uma comissão de teste, por exemplo 10%.
4. Liberar um imóvel de teste e gerar o link.
5. Abrir o link em um navegador de teste.
6. Confirmar a captura da indicação e a validade do token opaco, inclusive abrindo o mesmo link em outro dispositivo.
7. Criar uma reserva de teste no checkout sandbox.
8. Confirmar que a reserva aparece somente para o afiliado correto.
9. Confirmar que a comissão nasce como `pending`.
10. Tentar aprovar antes de pagamento confirmado; deve ser recusado.
11. Confirmar o pagamento sandbox e a reserva confirmada.
12. Confirmar que a aprovação permanece bloqueada até existir evidência registrada de checkout concluído e valor reconciliado. O valor continua manual e isso é bloqueador financeiro.
13. Registrar o repasse com uma referência de teste.
14. Repetir o fluxo com retry/idempotência e confirmar que não duplica comissão.
15. Cancelar uma reserva de teste e validar a regra de comissão.

## Bloqueadores atuais

- [x] Testes Laravel focados executados localmente: 29 testes e 474 assertions passaram.
- [ ] Executar a suíte completa e repetir testes em PostgreSQL isolado antes da publicação.
- [ ] Ainda não há ambiente Supabase/Stays/Cielo sandbox confirmado para esta homologação.
- [ ] A regra financeira de comissão precisa ser aprovada e calculada/validada no servidor: valor bruto, líquido ou margem, descontos, reembolsos, moeda e arredondamento.
- [ ] O fluxo normal ainda não conclui automaticamente o pedido. Definir evidência confiável, transição autorizada e auditoria para checkout concluído. A política de cancelamento, no-show e reembolso também precisa ser definida antes do pagamento.
- [ ] O repasse continua manual; não há pagamento automático ao afiliado.

## Segurança antes do go-live

- [ ] Ativar 2FA para administradores.
- [ ] Revisar e limitar os e-mails administrativos.
- [ ] Conferir logs sem tokens, assinaturas ou dados de pagamento.
- [ ] Testar expiração, adulteração e reutilização de links.
- [ ] Testar duplicidade de checkout, webhook e retry.
- [ ] Validar retenção e exclusão de dados conforme LGPD.

## Publicação controlada

- [ ] Backup recuperável do banco.
- [ ] Migrations revisadas e ensaiadas no banco de teste.
- [ ] Build identificado por commit/digest.
- [ ] Plano de rollback documentado.
- [ ] Health check do backend e frontend após deploy.
- [ ] Smoke test de login, catálogo, link, checkout e painel administrativo.
- [ ] Monitorar erros e reservas por pelo menos uma janela operacional antes de liberar todos os afiliados.

Não executar pagamentos reais durante a homologação e não aplicar migrations diretamente na produção sem backup e aprovação explícita.

Estado atualizado em 26/11/2026. A consolidação da branch e dos checklists não constitui autorização de produção.
