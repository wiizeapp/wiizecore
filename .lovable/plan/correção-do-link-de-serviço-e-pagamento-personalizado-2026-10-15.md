# Correção do link de serviço e pagamento personalizado

## O que foi confirmado
- O link existente está ativo, mas a conta de recebimento está com ativação em andamento. O checkout bloqueia pagamento até a aprovação do provedor; essa proteção será preservada.
- O fluxo anterior excluiu serviços com valor ou forma de cobrança personalizados.
- Conforme sua escolha, **você define o valor antes de enviar**, e o cliente escolhe como pagar. O cliente não pode alterar o preço.

## Ajustes
1. Permitir configurar o checkout na tabela de Serviços: valor quando personalizado e regras de cobrança quando a forma for personalizada.
2. Salvar essas condições no link, com autorização da empresa e validação no servidor. Alterações não devem mudar cobranças já criadas nem preços de links já enviados sem uma confirmação explícita.
3. Oferecer ao cliente os métodos e parcelas permitidos, usando a criação segura de cobranças já existente. Recorrência continua distinta de parcelamento; não apresentar Pix Automático como disponível sem integração real.
4. Corrigir o endereço compartilhado sem alterar destinos de integrações e tornar clara a mensagem de conta ainda não habilitada para receber.
5. Preservar o selo discreto e a ordem dos dados, contrato quando vinculado e pagamento; manter traduções.

## Verificação e entrega
- Conferir configuração, abertura e escolhas no checkout, testar validações de valor e parcelas e impedir alteração do preço pelo cliente.
- Não gerar pagamentos nem movimentar dinheiro durante os testes. O pagamento completo ficará pendente até a conta ser aprovada e haver um teste autorizado.
- Informar os arquivos alterados e distinguir os ajustes concluídos da aprovação externa pendente.

## Detalhes técnicos
- Versionar condições dos links/sessões conforme necessário, com isolamento por empresa, RLS e auditoria.
- Reutilizar `createChargeCore`; preservar idempotência e validação das condições no servidor.
- Não usar a origem informada pelo navegador para mudar callbacks financeiros. Endereços de integração permanecem separados dos links de navegação.
