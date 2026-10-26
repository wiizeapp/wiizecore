# Fase 2 — segurança e base Global

## Entrega
- Avisos Asaas vinculados à empresa e conexão autenticadas; repetições identificadas por conexão.
- Consultas de pagamentos, tentativas, reembolsos e antecipações passam a usar a conexão original.
- Senha financeira e sessão AAL2 exigidas no servidor para coproduções, cancelamento de saque, reembolso, antecipação e cadastro bancário.
- Contagem de senha financeira serializada no banco, com bloqueio após três erros por 60 minutos.
- Troca de método interrompida se a consulta do pagamento falhar; ativação da tentativa feita em transação bloqueada. Respostas incertas mantêm reservas para evitar novas operações às cegas.
- Fundação Global aditiva aplicada: operação/moeda, conexão de origem, vínculos por cliente/conexão e saldos Global zerados e desativados. Brasil continua BRL/Asaas, sem replicar saldos.

## Evidências e limites
- Suite existente: 292 testes aprovados em 39 arquivos. Após o último ajuste, 16 testes relevantes aprovados novamente.
- Compilação final sem erros.
- Pedido local sem token ao webhook Asaas: 401. Página protegida sem sessão: redirecionamento ao login, sem erros de execução.
- Banco: dez restrições Brasil/BRL, RLS nas duas novas tabelas, funções financeiras novas sem execução por authenticated e com execução por service_role; nenhum saldo Global não zerado.
- Sete pagamentos históricos sem conexão Asaas cadastrada identificável. Origem não foi inventada; ficam impedidos de usar outra conta automaticamente.
- Não foi possível conferir as telas autenticadas da conta solicitante: sessão indisponível. Não foram feitos pagamentos, saques ou estornos reais, nem testes concorrentes contra registros financeiros reais. Asserções automatizadas não substituem esses testes.
- Os índices globais antigos de IDs do provedor foram preservados por compatibilidade. Ainda restringem colisões entre conexões; sua retirada exige uma fase posterior coordenada. A fundação não significa suporte multimoeda ativo.
- Rapyd, conversão, seletor Global e pagamentos internacionais não foram ativados.
- As alterações do banco já foram aplicadas ao Lovable Cloud compartilhado. Código de outro projeto de produção precisa ser atualizado junto com as alterações de banco correspondentes; não aplicar as mesmas alterações duas vezes.

## Arquivos de execução
- `src/lib/financial-scope.ts` (novo)
- `src/lib/financial-origin.server.ts` (novo)
- `src/lib/finance.server.ts`
- `src/lib/finance.functions.ts`
- `src/lib/billing.server.ts`
- `src/lib/payment-attempts.server.ts`
- `src/lib/charges-core.server.ts`
- `src/lib/checkout.functions.ts`
- `src/lib/refunds.server.ts`
- `src/lib/refunds.functions.ts`
- `src/lib/coproduction.server.ts`
- `src/lib/coproductions.functions.ts`
- `src/lib/anticipation.server.ts`
- `src/lib/anticipation.functions.ts`
- `src/lib/admin.functions.ts`
- `src/lib/withdrawal-security.functions.ts`
- `src/routes/api/public/webhooks/asaas.ts`
- `src/components/developer/secure-action-dialog.tsx`
- `src/components/withdrawal-2fa-card.tsx`
- `src/components/charges/charge-sheet.tsx`
- `src/routes/_authenticated/financeiro.tsx`
- `src/routes/_authenticated/coproducoes.tsx`
- `src/routes/_authenticated/coproducoes_.$id.tsx`
- `src/routes/_authenticated/antecipacao.tsx`
- `src/locales/en/ui.json`
- `src/locales/es/ui.json`

## Banco, testes e manutenção
- `drizzle/migrations/0035_financial_security_and_global_foundation.sql` (aplicada)
- `drizzle/migrations/0036_atomic_payment_attempt_activation.sql` (aplicada)
- `src/integrations/supabase/types.ts` (regenerado automaticamente)
- `src/lib/financial-scope.test.ts` (novo)
- `src/lib/anti-fraud.test.ts`
- `src/lib/AGENTS.md`
- `roadmap.md`
- `docs/fase-2-seguranca-global.md` (este relatório)
- Plano aprovado arquivado em `.lovable/plan/correções-de-segurança-e-fase-2-base-global-2026-10-26.md`.

## Próxima conferência necessária
Usar conta de teste autorizada para conferir senha incorreta/correta, AAL1/AAL2, três erros concorrentes, troca de método com falha do provedor, reenvio do mesmo aviso e recebimento de avisos de conexões distintas; verificar resultado e releitura antes de liberar a operação em produção. Conferir a origem dos sete registros históricos sem criar vínculo por suposição.