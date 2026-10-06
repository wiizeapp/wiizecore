# Coproduções (MVP) — divisão do valor líquido por cobrança

## Regras decididas
- Coprodução pertence só à cobrança (não a cliente, serviço ou contrato). Até 4 coprodutores.
- Só pode ser convidado quem tem conta WiizePay com recebimentos já aprovados pelo Asaas.
- O pagamento fica bloqueado no link até todos os coprodutores aceitarem (mesma lógica do bloqueio por contrato). Se alguém recusar, o principal cancela a configuração ou remove a pessoa e o link volta a funcionar.
- Divisão sobre o valor líquido (após taxas Asaas + WiizePay). Custos de lembretes e atraso ficam 100% com o principal.
- Depois do aceite a configuração fica travada; para mudar: cancelar (se nada foi pago) e criar nova, com novo aceite.
- Coprodutor vê só nome do cliente, serviço, parcela, status, sua parte e responsabilidade. Nunca CPF, endereço ou documentos.
- Reembolso e cancelamento só pelo principal; nada é apagado, só muda de status.

## O que o usuário verá
1. Na criação da cobrança: caixa "Esta cobrança possui coprodutores" → card para adicionar até 4 pessoas (nome, e-mail, % ou valor fixo, responsabilidade), com resumo: valor, taxas, líquido e quanto cada um recebe.
2. Nova página "Coproduções" com duas abas: "Que eu criei" e "Que participo", com status por parcela.
3. Convite: sininho + e-mail para o coprodutor, abrindo uma página logada com Aceitar / Recusar.
4. No checkout público: aviso "Pagamento disponível em breve" enquanto houver aceite pendente.

## Como funciona o recebimento
- Quando todos aceitam, a WiizePay registra no Asaas a divisão em cada parcela ainda não paga (por percentual do líquido ou valor fixo), usando a carteira de cada coprodutor.
- Quando o Asaas confirma o pagamento, cada parte cai direto na conta de cada um; o saldo de cada participante só é creditado pela confirmação do provedor.
- Valores fixos são convertidos para percentual do líquido de forma determinística; o resto de centavos fica com o principal, para a soma bater exatamente.

## Detalhes técnicos
- Tabelas: `payment_coproductions` (por charge_group, tenant dono, status, versão) e `payment_coproduction_participants` (user/tenant do coprodutor, wallet, tipo, %/valor em NUMERIC, status, aceite com data/versão), mais `coproduction_events` para auditoria. RLS: membros do tenant dono veem tudo; o coprodutor só suas linhas, via funções seguras que devolvem campos limitados. Gravações apenas pelo servidor.
- Cálculo puro e testado em `src/lib/coproduction-math.ts`, reutilizando `fee-math.ts`.
- Funções de servidor em `src/lib/coproductions.functions.ts` (criar, cancelar, aceitar, recusar, listar), com validação de permissão, idempotência e auditoria; avisos via `notify.server.ts`.
- Asaas: split aplicado nas parcelas abertas ao concluir aceites; webhook registra a divisão efetiva por parcela; reembolso atualiza status.
- Checkout: `checkout.functions.ts` bloqueia pagamento com aceite pendente.
- Traduções EN/ES para todos os textos novos.
- Testes: os 11 cenários do documento (cálculo por testes automáticos; acesso negado e alteração direta pela API testados contra o banco).

## Fora do MVP
Mais de 4 coprodutores, divisão de custos de lembretes, comissões recorrentes, contrato próprio de coprodução, chat.
