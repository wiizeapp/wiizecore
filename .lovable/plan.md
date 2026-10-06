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

## Como funciona o recebimento (regra final)
- O coprodutor recebe sua porcentagem do valor líquido efetivamente recebido em cada pagamento confirmado — nunca do total da cobrança nem de parcelas futuras.
- Cada parcela é tratada sozinha: só depois que o Asaas confirma aquela parcela, com o valor e as taxas reais dela, a divisão é calculada e registrada. Parcela pendente = R$ 0 para todos.
- Quando todos aceitam, a WiizePay registra no Asaas a divisão em percentual em cada parcela aberta (o Asaas aplica o percentual sobre o líquido real no momento do pagamento). Nada é simulado.
- Valor fixo é convertido de forma determinística em percentual do líquido; centavos residuais ficam com o principal; a soma sempre bate exatamente com o líquido.
- Webhook repetido não duplica nada: cada registro de divisão é único por parcela + participante + identificador do Asaas.
- Se, ao conferir a documentação do Asaas, alguma limitação impedir exatamente esse comportamento (por exemplo, a taxa WiizePay também ser cobrada por divisão), aviso claramente e adapto com segurança, sem atalhos fictícios.
- O Asaas é a fonte da verdade: o valor recebido por cada participante vem somente do pagamento confirmado e da divisão real devolvida pelo Asaas; se diferir da estimativa, vale o do Asaas. Nenhum saldo previsto é mostrado como recebido.
- Antes de finalizar, testo a divisão no ambiente de teste do Asaas e relato exatamente como ela foi aplicada.
- Telas mostram "Estimativa de participação" antes do pagamento e o valor real por parcela depois (ex.: 1/6 — Pago — R$ 57,00; 3/6 — Pendente).

## Detalhes técnicos
- Tabelas: `payment_coproductions` (por charge_group, tenant dono, status, versão) e `payment_coproduction_participants` (user/tenant do coprodutor, wallet, tipo, %/valor em NUMERIC, status, aceite com data/versão), `coproduction_splits` (uma linha por parcela + participante: bruto, taxas, líquido, %, valor recebido, status, id Asaas, datas) e `coproduction_events` para auditoria. RLS: membros do tenant dono veem tudo; o coprodutor só suas linhas, via funções seguras que devolvem campos limitados. Gravações apenas pelo servidor.
- Cálculo puro e testado em `src/lib/coproduction-math.ts`, reutilizando `fee-math.ts`.
- Funções de servidor em `src/lib/coproductions.functions.ts` (criar, cancelar, aceitar, recusar, listar), com validação de permissão, idempotência e auditoria; avisos via `notify.server.ts`.
- Asaas: split aplicado nas parcelas abertas ao concluir aceites; webhook registra a divisão efetiva por parcela; reembolso atualiza status.
- Checkout: `checkout.functions.ts` bloqueia pagamento com aceite pendente.
- Traduções EN/ES para todos os textos novos.
- Testes: cenários dos dois documentos (à vista 1000/950 70/30, parcelado 6x com líquidos diferentes, parcela pendente, webhook duplicado, recusa, todos aceitos, 4 coprodutores, centavos) (cálculo por testes automáticos; acesso negado e alteração direta pela API testados contra o banco).

## Fora do MVP
Mais de 4 coprodutores, divisão de custos de lembretes, comissões recorrentes, contrato próprio de coprodução, chat.
