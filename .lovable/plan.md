# Correções prioritárias de acesso e saldo

## Objetivo
Fechar os riscos encontrados na verificação final, sem movimentar dinheiro, publicar automaticamente ou testar ataques no banco compartilhado.

## Fase 1 — proteções no aplicativo
- Impedir que um link de contrato acesse ou assine contrato de outra empresa, verificando a relação tanto na resolução do link quanto nas consultas públicas.
- Impedir que um recebimento registrado em dinheiro seja convertido em saldo financeiro pendente ou disponível.
- Adicionar testes com dados simulados para cada regra e conferir regressões, sem chamadas reais ao Asaas.

## Fase 2 — validação isolada das regras de saldo
- Preparar uma cópia descartável com duas empresas e usuários autorizados; não presumir que trocar a chave Asaas isola o banco.
- Corrigir liberação de coprodução para descontar estornos anteriores e exigir liquidação confirmada.
- Unificar bloqueios de antecipação e estorno por pagamento; impedir liberação de valores reservados ou de recebimentos não relacionados.
- Testar valores concretos, repetição, falhas e concorrência; conferir saldo antes/depois. Implantação no banco compartilhado exige avaliação de impacto, reversão e autorização específica posterior.

## Fase 3 — acessos diretos
- Mapear operações legítimas de gestão que dependem das permissões atuais antes de revogá-las.
- Reforçar consistência de empresa nos vínculos de contrato/cargos e alinhar MFA e permissões por módulo.
- Validar usuários de duas empresas, cargos restritos, membro desativado, arquivos privados e acessos sem segundo fator, com controles positivos e negativos.

## Entrega e limites
- Relatório com cada achado, correção, teste executado e pendência.
- Nenhuma publicação, operação financeira real ou mudança externa automática.
- Não declarar segurança bancária apenas porque RLS está ligado ou testes locais passaram; conclusão depende de homologação isolada e revisão especializada.

## Detalhes técnicos
- Preservar o histórico de migrações; mudanças novas via ferramenta de migração, somente após validação da fase correspondente.
- Consultar privilégios efetivos, políticas permissivas/restritivas, relações de empresa e funções privilegiadas; testes ignorados nunca contam como aprovados.
- Manter Decimal/NUMERIC, isolamento, auditoria e idempotência em todos os caminhos financeiros.