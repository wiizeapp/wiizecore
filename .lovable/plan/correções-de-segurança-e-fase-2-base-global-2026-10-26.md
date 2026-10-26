# Correções de segurança e Fase 2 — base Global

## Primeiro: concluir as pendências da Fase 1
- **Avisos de pagamento:** vincular cada aviso à empresa e à conexão autenticadas, isolar repetições e impedir que o aviso de uma empresa altere pagamentos de outra. Aplicar a mesma proteção às consultas de reconciliação e às tentativas substituídas.
- **Troca da forma de pagamento:** interromper a troca se o Asaas não confirmar a situação da cobrança. Não criar uma nova cobrança quando essa conferência falhar.
- **Coproduções e cancelamento de saque:** exigir senha financeira no servidor e nas telas antes de aceitar uma divisão, cancelar ou reaplicar a divisão e cancelar um saque. Conferir vínculo ativo e permissões.
- **Verificação em duas etapas:** exigir confirmação nas operações financeiras sensíveis, inclusive de quem ainda não ativou o autenticador. Essas pessoas precisarão ativá-lo antes de movimentar dinheiro; não será desativada nenhuma proteção existente.
- **Tentativas de senha:** tornar a contagem atômica, mantendo o bloqueio de toda a empresa por 60 minutos após 3 erros, mesmo com pedidos simultâneos.

## Depois: Fase 2 — base de dados aditiva
- Registrar operação, moeda e conexão de origem nos registros financeiros, preservando os dados existentes como **Brasil / BRL**.
- Preparar vínculos de clientes por conexão e saldos separados por empresa, operação e moeda. O saldo brasileiro atual continua sendo a fonte da operação Brasil, sem duplicar dinheiro.
- Impedir valores de outras moedas nos caminhos brasileiros existentes. Não ativar cobranças Global, Rapyd, conversão de moedas nem um seletor Brasil/Global nesta fase.
- Usar a conexão original nos fluxos que consultam ou alteram pagamentos, sem escolher outra conta silenciosamente. Vínculos antigos só serão preenchidos quando a origem puder ser determinada com segurança; casos ambíguos ficam identificados para conferência.

## Conferência e entrega
- Adicionar testes específicos de isolamento entre empresas, repetição de avisos, falha do Asaas, exigência de senha/2FA, concorrência e preservação de BRL.
- Conferir as alterações aplicadas no banco e executar os testes existentes. Exercitar as telas alteradas sem movimentar dinheiro real.
- Entregar resumo das correções, lista dos arquivos alterados e limitações verificáveis. Testes de movimentação real não serão declarados concluídos sem evidência do provedor.

## Detalhes técnicos
- Alterações de banco aplicadas exclusivamente por migrations, com permissões explícitas e RLS; funções financeiras restritas ao servidor.
- Arquivos principais: `billing.server.ts`, `payment-attempts.server.ts`, webhook Asaas, `finance.server.ts`, `finance.functions.ts`, `coproductions.functions.ts`, telas correspondentes, migrations e testes. Novos textos com traduções EN/ES.
- A integração Rapyd das fases seguintes continua dependente da definição do modelo contratado, verificação das empresas, países/moedas e moeda de saque; isso não impede preparar a base isolada nesta fase.