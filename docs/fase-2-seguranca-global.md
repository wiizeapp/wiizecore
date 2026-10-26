# Fase 2 — melhorias de segurança financeira

- Registros financeiros ficam ligados à conexão original do provedor; avisos do Asaas são isolados por empresa e conexão.
- Senha financeira: bloqueio da empresa após 3 erros por 60 minutos, com contador serializado no banco.
- Ações que movimentam dinheiro exigem verificação em duas etapas (AAL2) e senha financeira.
- Troca de forma de pagamento com ativação atômica; resultado incerto do provedor mantém a reserva.
- Saques reservados de forma exclusiva antes do envio, sem aprovação duplicada.

Não foram feitos pagamentos ou saques reais para validar.
