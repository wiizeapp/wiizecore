# Validação do candidato de saldo — 30/10/2026

## Decisão

**Não aplicar literalmente `security-accounting-guards.sql`.** Autorização para aplicação recebida, mas a revisão anterior à execução encontrou incompatibilidades concretas. Nenhuma migration foi criada/aplicada, nenhum saldo histórico foi modificado e nada foi publicado nesta verificação.

## Evidência obtida nesta rodada

- Catálogo ativo consultado somente para leitura: wallets, wallet_balances, transactions, payments, refunds, anticipation_requests e coproduction_splits têm RLS. Authenticated não tem INSERT/UPDATE/DELETE nessas sete tabelas. As quatro funções examinadas de liberação/antecipação/estorno não permitem EXECUTE a anon/authenticated.
- wallet_balances tem GRANT UPDATE para anon, mas nenhuma policy anon ou policy UPDATE no catálogo consultado: RLS bloqueia essa via atualmente. GRANT sozinho não prova exploração; retirar privilégio desnecessário requer ajuste explícito posterior.
- Policies MFA examinadas de wallets/payments/refunds/anticipation_requests são RESTRICTIVE, combinadas com SELECT por empresa. Isso é revisão do catálogo, não prova autenticada de isolamento A/B ou de todas as tabelas.
- Reexecutados 34 testes de handlers reais com dependências simuladas: todos passaram. Incluem novo teste de erro ao persistir o recibo da antecipação; o aplicativo não reporta sucesso nessa situação. Não são testes de RLS real ou de Asaas.
- Fixture socket-only descartável passou: split 100 menos estorno 40 libera 60, preserva 200 não relacionado, repetição não duplica, reserva impede conclusão da antecipação, conclusão válida credita 95 com taxa única de 5, admissão concorrente sintética aceita apenas uma operação, grants e MFA locais conferidos. Cluster encerrado.

## Bloqueios concretos de implantação

1. **Correção de antecipação ausente do arquivo selecionado.** O banco ativo ainda tem `apply_anticipation_event` que libera todo o líquido sem preservar a reserva. A fixture instala ANTES outro candidato (`accounting-release-candidate.sql`); passar a fixture composta não valida aplicação isolada deste arquivo.
2. **Estorno/antecipação oficialmente recusados podem ficar presos.** As funções ativas primeiro persistem `last_provider_event_id`, depois mudam status em outro UPDATE. O trigger proposto exige que o mesmo UPDATE de status altere esse ID. Portanto, uma recusa legítima é bloqueada e a transação reverte. Reprodução adicionada em `scripts/security/accounting-outcome-compatibility.py`, executada exclusivamente pelo runner isolado: sequência ativa recusada com rollback, controle positivo em UPDATE combinado aceito. É um teste de bloqueio de implantação, não prova de correção completa.
3. **ID novo não comprova resultado oficial.** É necessário vínculo durável com operação, pagamento e conexão, além de validação do evento; não apenas diferença de texto.
4. **Ordem de locks incompatível.** O candidato libera split em payment → wallets → splits, mas a função de estorno de splits usa splits → wallets. Há possibilidade de deadlock. Finalizadores de operações também bloqueiam operação antes de pagamento, exigindo revisão conjunta.
5. **Submissão ao provedor sem claim exclusivo.** Duas execuções de envio de estorno podem alcançar o provedor. Antecipação cria admissão e espelho em operações separadas e não trata todos os erros de persistência do ID externo. Timeout manter reserva é necessário, mas não resolve duplicidade ou reconciliação.
6. **Ausência de prova completa.** Esquema integral com triggers/origem/auth, ciclo do provedor, concorrência cruzada e sessões A/B não foram exercitados. Não declarar homologação financeira real ou segurança de 100%.

## Próxima correção necessária

Correção parcial adicional no aplicativo: `requestAnticipation` agora verifica erros de persistência do espelho pendente, recibo externo e espelho processing, sempre com filtro da empresa. Erro antes do envio impede a chamada; erro após envio conserva admissão e retorna pendente para reconciliação, sem anunciar sucesso. Não substitui claim durável, RPC de admissão ou reconciliação completa; o banco conectado permanece inalterado.

Substituir os dois candidatos por uma correção coordenada de RPCs e handlers: admissão/submissão durável, confirmação vinculada à operação e conexão, estados desconhecidos conservando reservas, locks globais consistentes e cálculo restante. Validar no esquema integral descartável antes de aplicar uma migration única e verificar novamente o catálogo conectado. Não fazer alterações artificiais em saldo nem usar operações reais para testes negativos.