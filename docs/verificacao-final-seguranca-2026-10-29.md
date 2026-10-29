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
- Verificação automatizada básica executada; análise aprofundada concluída em 29/10/2026 às 23:07 UTC, sem achados retornados. O resultado é marcado como desatualizado e precede estas correções; não invalida os riscos demonstrados por análise manual/catálogo.
- Linter: 19 tabelas fechadas sem policy, uma função trigger sem search_path, extensão no esquema público e sete funções privilegiadas acessíveis a usuários. São sinais para avaliação, não provas automáticas de exploração.
- A verificação não prova comportamento de todos os endpoints, acesso a todos os arquivos, isolamento entre sessões reais, configuração Vercel/Asaas nem ausência de outras falhas.

## Próximos passos seguros

1. Aprovar plano de correção e reversão; fechar a ponte pública de contratos e classificação de dinheiro antes de homologar.
2. Preparar ambiente descartável com duas empresas e sessões autorizadas; validar controles positivos para cada recurso antes de testes negativos.
3. Corrigir regras de reserva/liberação no banco por migrações novas, nunca alterando histórico, após testes isolados e plano de implantação.
4. Migrar escritores legítimos de gestão antes de revogar permissões diretas; alinhar MFA e permissões por módulo.
5. Testar leitura/escrita cruzadas, concessão de cargo, AAL1/AAL2, membro desativado, arquivos, saldo próprio, repetição e concorrência; confirmar pelo aplicativo e leitura posterior.
6. Só depois reavaliar prontidão; pentest independente e recuperação testada continuam necessários para uma exigência equivalente à de instituição financeira.

## Fase 1 aprovada — implementação e validação

- Resolução do link público agora confere a empresa do contrato e falha fechada em erro; leitura e assinatura também filtram contrato, versão e assinaturas pela empresa do link.
- `RECEIVED_IN_CASH` não é mais normalizado como `PAYMENT_RECEIVED`. O processamento também intercepta eventos em dinheiro e eventos antigos normalizados com esse status antes de criar/alterar pagamentos, creditar saldo, reembolsar taxas ou liberar splits.
- **Nove testes de funções reais com dependências simuladas aprovados**, incluindo controle positivo de contrato próprio, negativa de leitura/assinatura estrangeiras, falha de consulta, reconciliação em dinheiro sem escrita e evento legado sem RPC financeira.
- Esses testes usam `vitest.security.config.ts`; o arquivo separado `final-security-flows.security-check.ts` evita que o transporte RPC transformado seja confundido com autorização. A primeira tentativa com o transporte padrão falhou no controle positivo e NÃO foi usada como prova de bloqueio.
- Regressões usuais reexecutadas: **470 aprovadas, 22 ignoradas**. Total de cenários executados nas duas baterias: **479 aprovados**; não inclui isolamento real.
- Compilação automática OK após as alterações. Não há comprovação end-to-end publicada nem assinatura real com sessões A/B.
- Nenhuma migração aplicada: as regras vulneráveis de coprodução/antecipação continuam no banco conectado até a fase de implantação autorizada.

## Fases seguintes — impacto e bloqueios

A primeira tentativa de preparar PostgreSQL descartável foi recusada pelo mecanismo `runuser`. Uma segunda tentativa, com troca explícita para usuário não privilegiado e ambiente limpo, funcionou. Foi iniciado um cluster local independente, com socket privado, TCP desativado e sem herdar configuração/credenciais do banco conectado; recebeu apenas esquema mínimo e dados sintéticos. O cluster foi desligado ao concluir. Ele não substitui uma cópia de autenticação/arquivos com sessões A/B autorizadas.

Reprodução das definições atuais, com restrições de saldo não negativo e recebimentos não relacionados suficientes para demonstrar o problema:

- Coprodução: split original R$ 100,00, estorno R$ 40,00 e pendente total R$ 260,00 (R$ 60,00 do split + R$ 200,00 não relacionados). A função atual liberou R$ 100,00 e deixou R$ 160,00 pendentes; o resultado correto seria R$ 60,00 disponíveis e R$ 200,00 pendentes. A repetição não movimentou novamente.
- Antecipação: pagamento líquido R$ 100,00, reserva de estorno R$ 40,00, pendente total R$ 260,00 e taxa R$ 5,00. A função atual deixou R$ 160,00 pendentes e R$ 95,00 disponíveis, sem preservar a reserva na liberação. Repetições com o mesmo e outro ID de evento não cobraram novamente a taxa; isso comprova idempotência desse caso, não a correção da liberação.
- A reprodução acima valida as falhas atuais. Depois foi testado um candidato separado, descrito abaixo. Nenhuma concorrência entre duas sessões foi executada. A admissão transacional compartilhada de estorno/antecipação ainda precisa ser projetada com o esquema completo e testada isoladamente.
- Nenhum dado real, identidade, segredo ou chamada de provedor participou. O banco compartilhado permaneceu inalterado.

Inventário dos escritores legítimos que impede revogação genérica:

| Recurso | Caminho atual | Avaliação antes de revogar |
|---|---|---|
| `contract_links` | emissão/revogação em `contract-links.functions.ts`, cliente privilegiado após autorização | Permissões ordinárias não são necessárias para esses caminhos; falta consistência relacional no banco e homologação |
| `finance_accounts` | `gestao.functions.ts`, `finance-ops.functions.ts`, cliente do usuário | Migrar operações para caminhos estreitos e autorizados antes de revogar |
| `finance_categories` | mesmas funções, cliente do usuário | Preservar categorias compartilhadas e edição legítima por empresa |
| `finance_entries` | mesmas funções e RPCs, cliente do usuário | Validar criação/edição/cancelamento e auditoria por operação |
| `finance_cards` | `finance-ops.functions.ts`, cliente do usuário | Preservar cadastro/alteração legítimos; privilégio efetivo atual inclui DELETE |

**Bloqueios restantes:** ambiente descartável com autenticação/arquivos e sessões A/B autorizadas; validação concorrente das funções financeiras; avaliação/reversão e autorização específica posterior para implantação no banco compartilhado; homologação externa e testes independentes. Não foram revogadas permissões nem alteradas regras financeiras no banco nesta fase.

## Candidato de saldo — validado apenas no esquema mínimo

`docs/migrations-pendentes/accounting-release-candidate.sql` é um **candidato não aplicado**, fora do histórico de migrações. Não está pronto para implantação: faltam admissão comum de estorno/antecipação, confirmação de reservas de estorno ativas/anteriores, ordem global de locks, custos do provedor, reconciliação externa e testes no esquema completo. Não aplicar manualmente por copiar este arquivo.

Cinco grupos de verificações no PostgreSQL descartável passaram:

1. Split de R$ 100 com R$ 40 estornados libera R$ 60 e preserva R$ 200 não relacionados; repetição libera zero.
2. Pagamento principal ainda não liberado recusa release do split, sem alterar seu estado.
3. Reserva de estorno de R$ 40 recusa conclusão de antecipação atomicamente: saldo, estado e taxa permanecem inalterados; confirmação externa incompatível precisaria de reconciliação, não repetição cega.
4. Sem reserva, conclusão válida libera R$ 95 após taxa de R$ 5; repetições mantêm uma transação de taxa e uma notificação.
5. Funções candidatas não permitem EXECUTE a usuários comuns/visitantes.

Scripts reexecutáveis guardados em `scripts/security`; `run-accounting-fixture.py` sempre cria novo cluster temporário, usa ambiente sem PG* herdado, TCP desativado, socket privado, dados sintéticos e encerra o processo mesmo em falha. A execução completa de baseline e candidato terminou sem erro. Esses cinco grupos são adicionais aos 479 testes do aplicativo, não testes de RLS real, provedor ou concorrência.

**Situação final desta fase:** primeiras barreiras de aplicativo corrigidas/testadas; falhas de saldo reproduzidas e candidato mínimo testado; banco conectado ainda usa funções anteriores. Fases de implantação e homologação integral seguem abertas, e a plataforma não deve ser declarada segura como um banco real.