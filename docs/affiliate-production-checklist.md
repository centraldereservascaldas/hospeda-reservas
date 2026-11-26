# Checklist de homologação — Portal de afiliados

Este checklist cobre a branch `codex/affiliate-portal`. A publicação em produção só deve ocorrer depois de todos os itens de homologação estarem concluídos.

## Funcionalidades entregues

- [x] Cadastro, login e solicitação de acesso via Supabase.
- [x] Aprovação, recusa, suspensão e reativação de afiliados.
- [x] Percentual de comissão configurável por afiliado.
- [x] Catálogo de imóveis liberados para divulgação.
- [x] Bloqueio administrativo de imóveis para novos links.
- [x] Link individual assinado no servidor.
- [x] Captura da indicação com validade e escopo por imóvel.
- [x] Persistência e recuperação da indicação em outro dispositivo.
- [x] Vínculo server-side entre checkout, reserva e afiliado.
- [x] Comissão pendente, aprovação manual e registro de pagamento.
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
5. Abrir o link em outro navegador/dispositivo.
6. Confirmar a captura da indicação e a assinatura do link.
7. Criar uma reserva de teste no checkout sandbox.
8. Confirmar que a reserva aparece somente para o afiliado correto.
9. Confirmar que a comissão nasce como `pending`.
10. Tentar aprovar antes de pagamento confirmado; deve ser recusado.
11. Confirmar o pagamento sandbox e a reserva confirmada.
12. Aprovar a comissão com valor manual.
13. Registrar o repasse com uma referência de teste.
14. Repetir o fluxo com retry/idempotência e confirmar que não duplica comissão.
15. Cancelar uma reserva de teste e validar a regra de comissão.

## Bloqueadores atuais

- [ ] Os testes Laravel precisam retornar resultado no ambiente local; atualmente o runner fica travado antes de emitir saída.
- [ ] Ainda não há ambiente Supabase/Stays/Cielo sandbox confirmado nesta máquina.
- [ ] A regra financeira de comissão precisa ser aprovada: valor bruto, líquido ou margem.
- [ ] A política de cancelamento, no-show e reembolso precisa ser definida antes do pagamento de comissões.
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
