# Cobrança atrasada: juros diários, aviso, cancelamento automático e reativação

## Como vai funcionar (exemplo: R$ 300, vence dia 5, multa 2%, juros 3% ao mês)
- **Dia 6 em diante:** o link mostra o valor atualizado. A multa de 2% (R$ 6,00) entra uma única vez, porque é assim que a lei permite. Os juros de 3% ao mês são divididos por 30 e somados a cada dia: R$ 0,30 por dia.
- **Dia 10:** R$ 300 + R$ 6,00 + R$ 1,50 (5 dias) = **R$ 307,50**. O link mostra o valor original, a multa, os juros e o total. O valor é calculado de novo sempre que o link abre.
- Ao pagar, o valor cobrado é o total atualizado do dia. O cálculo é feito no servidor e o cliente não consegue alterar esse valor.
- Os percentuais usados são os que a empresa definiu em "Multas e encargos". Se ela não definiu nada, vale o padrão atual.

## Avisos para a empresa
- Na lista de cobranças, a cobrança atrasada aparece como **"Atrasada há X dias"**, com o total atualizado.
- Um aviso no sininho e no e-mail, uma vez, no primeiro dia de atraso.
- Botão **"Cancelar cobrança"** direto na cobrança atrasada, com confirmação.

## Primeira cobrança: cancelamento automático em 30 dias
- Vale só para a primeira cobrança de um cliente. Se ela ficar 30 dias vencida sem pagamento, a rotina diária a cancela no provedor e no sistema.
- A cobrança fica com a situação **"Cancelada"**. O link para de aceitar pagamento e mostra "Esta cobrança não está mais disponível".
- O contrato assinado, o cliente e o resto do sistema continuam iguais.
- A empresa recebe um aviso de que a cobrança foi cancelada.

## Ativar novamente
- Ao passar o mouse (ou tocar) em "Cancelada", aparece **"Ativar novamente"**.
- A empresa escolhe uma nova data de vencimento. O sistema cria uma nova tentativa de pagamento para a **mesma cobrança e o mesmo link**, sem multa nem juros antigos. O cliente usa o mesmo link de antes.
- Só funciona se a cobrança não tiver sido paga. Tudo fica registrado no histórico da cobrança.

## Pontos para confirmar
- A multa entra uma vez só e os juros entram por dia. Está certo assim?
- O cancelamento automático em 30 dias vale só para a primeira cobrança. As demais ficam abertas até a empresa cancelar.

## Detalhes técnicos
- Regras puras: `src/lib/late-charges.ts`, com a nova função `shouldAutoCancelFirstCharge(dueOn, today, isFirst)` e testes.
- Valor atualizado: conferir que `checkout.$token`, `c.$token` e `pagar.$token` usam `computeLateCharges` vindo do servidor. O pagamento atrasado cria uma nova linha em `payment_attempts` com o total atualizado (fluxo atual em `payment-attempts.server.ts`, ordem criar → cancelar → ativar).
- Cancelar e reativar: novas funções em `charge-attempts.functions.ts`, com `requireModulePerm`, auditoria e chave de idempotência. A reativação usa `payment-attempts.server.ts` com o novo vencimento. Webhooks de tentativas antigas continuam descartados.
- Rotina diária: `src/routes/api/public/cron/notifications.ts`. Ela avisa o primeiro dia de atraso (deduplicado em `email_outbox`) e cancela a primeira cobrança com 30 dias de atraso, via provedor e depois webhook ou espelho do status. A "primeira cobrança" é a mais antiga daquele cliente, ainda sem nenhum pagamento confirmado.
- Telas: `src/routes/_authenticated/cobrancas.tsx` e `charge-sheet.tsx` (selo de atraso, botão cancelar, hover "Ativar novamente" com seletor de data). Traduções EN/ES.
- Sem tabela nova. Se faltar um campo para guardar o motivo do cancelamento, entra uma coluna opcional.
