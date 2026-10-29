# WiizePay — verificação final de acesso e saldo

Data: 29/10/2026. Somente consultas e testes locais; nenhuma alteração de dados, migração, publicação ou operação com provedor.

## Resultado

**Não aprovada para uma declaração de segurança bancária.** RLS está habilitado nas 144 tabelas públicas, mas existem cadeias de autorização e contabilização que precisam de correção. Não há evidência nesta revisão de exploração ou de saldo fraudulento existente.

## Confirmado no banco conectado

- 144 tabelas públicas, nenhuma sem RLS; 19 sem políticas, o que impede acesso ordinário via RLS, não significa exposição.
- `payments`, `wallets`, `transactions`, `refunds`, `withdrawals`, `user_roles` e `tenant_members`: sem escrita efetiva de usuários comuns, incluindo privilégios de coluna nas consultas realizadas. As políticas de leitura financeiras consultadas exigem participação ativa na empresa e MFA, com exceções posteriores que precisam de alinhamento.
- Funções `apply_payment_event`, `settle_payment`, `request_withdrawal`, `complete_withdrawal`, `apply_refund_event`, `request_refund`, `apply_anticipation_event`, `reserve_coupon`, `release_coproduction_splits`, `apply_coproduction_split`, `activate_payment_attempt`, `consume_rate_limit` e `card_risk_decide`: sem EXECUTE para anon/authenticated.
- Funções de participação exigem `auth.uid()` e membro ativo. MFA exige AAL2. Desbloqueio Admin vincula prova, sessão, validade e credencial.
- Privilégios efetivos foram consultados com `has_table_privilege` e `has_any_column_privilege`; `information_schema.role_table_grants` retornou listas vazias sob o acesso disponível e NÃO foi usado como evidência de revogação. GRANT sem política aplicável não basta para conceder acesso.

## Achados prioritários

### Alto — ponte de contrato entre empresas

`contract_links` permite escrita a owner/admin/finance com MFA. Suas FKs ligam empresa e contrato separadamente; não há trigger não interno nessa tabela. `src/lib/contract-links.functions.ts` resolve token sem conferir a empresa do contrato e os leitores/assinadores públicos usam cliente privilegiado filtrando somente o ID do contrato (linhas 186–190 e 265–269).

Um usuário autorizado a criar links pode, conhecendo um UUID válido de contrato estrangeiro, tentar apontar um link próprio para esse contrato. A cadeia de autorização é demonstrável pelo código e catálogo; não foi executada. Consulta agregada encontrou **zero links atualmente associados a contratos de outra empresa**. Isso não prova ausência de exploração histórica nem impede tentativa futura.

### Alto — recebimento em dinheiro tratado como liquidação

`billing.server.ts:458–460` converte `RECEIVED_IN_CASH` em `PAYMENT_RECEIVED` na reconciliação; o pipeline libera saldo em 345–349. Recebimento externo/em dinheiro não comprova que o provedor mantém fundos disponíveis. Exploração depende de a conta poder registrar esse recebimento no provedor; essa capacidade não foi testada. Necessário separar situação comercial de liquidação financeira e testar ausência de qualquer crédito com essa resposta.

### Alto — coprodução parcialmente estornada libera o valor original

A definição ATIVA de `release_coproduction_splits` libera `s.amount`, sem descontar `s.refunded_amount`; `sync_coproduction_refunds` desconta o estorno do saldo pendente e mantém splits parcialmente estornados em situação elegível. Exemplo lógico: R$ 100 com R$ 40 devolvidos deve liberar R$ 60, não R$ 100. Com outros recebimentos pendentes, pode liberar recursos ainda não liquidados; sem cobertura, pode falhar por restrição de saldo. Não houve reprodução com dados reais.

### Alto — antecipação e reserva de estorno

A definição ATIVA de `apply_anticipation_event` move todo `p.net_amount` na conclusão sem subtrair reserva de estorno. `anticipation.server.ts:38–56` não lê nem bloqueia essa reserva, e a admissão não usa uma única reserva transacional com o estorno. Aceitação e ordem pelo provedor permanecem não verificadas. Precisa de bloqueio comum por pagamento e testes concorrentes isolados antes de considerar o saldo protegido nesse cenário.

### Autorização por módulo e MFA incompletas

As tabelas de gestão financeira permitem operações diretas a determinados cargos base, contornando validações e auditoria do servidor. **Não confundir esses registros de gestão com saldo sacável.** Várias funções legítimas usam cliente autenticado e dependem dessas permissões: revogação genérica quebraria funcionalidades. Leitura por participação na empresa não é equivalente à permissão específica por módulo. `service_checkout_links/versions` têm leitura por membro sem política MFA restritiva na consulta ativa.

`mark_notifications_read` verifica empresa, mas não MFA dentro da função privilegiada; seu EXECUTE é acessível a authenticated. Isso não cria saldo, mas precisa de alinhamento com o acesso interno obrigatório.

## Testes executados e limites

- Bateria completa: **470 aprovados, 22 ignorados**, 64 arquivos aprovados e um ignorado.
- Seleção de segurança: 44 aprovados e os mesmos 22 ignorados.
- Todas as variáveis de homologação A/B estão ausentes; os 22 testes reais NÃO foram executados e NÃO contam como aprovação.
- Nenhum teste de INSERT/UPDATE/DELETE, liberação de saldo, concorrência, assinatura ou provedor foi disparado no banco compartilhado. Se a proteção falhar, um teste negativo de escrita pode alterar dados reais.
- Verificação automatizada básica executada; análise aprofundada iniciada e resultado ainda pendente na elaboração deste complemento.
- Linter: 19 tabelas fechadas sem policy, uma função trigger sem search_path, extensão no esquema público e sete funções privilegiadas acessíveis a usuários. São sinais para avaliação, não provas automáticas de exploração.
- A verificação não prova comportamento de todos os endpoints, acesso a todos os arquivos, isolamento entre sessões reais, configuração Vercel/Asaas nem ausência de outras falhas.

## Próximos passos seguros

1. Aprovar plano de correção e reversão; fechar a ponte pública de contratos e classificação de dinheiro antes de homologar.
2. Preparar ambiente descartável com duas empresas e sessões autorizadas; validar controles positivos para cada recurso antes de testes negativos.
3. Corrigir regras de reserva/liberação no banco por migrações novas, nunca alterando histórico, após testes isolados e plano de implantação.
4. Migrar escritores legítimos de gestão antes de revogar permissões diretas; alinhar MFA e permissões por módulo.
5. Testar leitura/escrita cruzadas, concessão de cargo, AAL1/AAL2, membro desativado, arquivos, saldo próprio, repetição e concorrência; confirmar pelo aplicativo e leitura posterior.
6. Só depois reavaliar prontidão; pentest independente e recuperação testada continuam necessários para uma exigência equivalente à de instituição financeira.