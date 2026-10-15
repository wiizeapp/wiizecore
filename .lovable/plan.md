# Checkout aberto por serviço (link único sem cliente)

## Ideia
Na tela de Serviços, a empresa cria um "Checkout aberto": escolhe o serviço (valor e tipo já definidos), sem cliente, sem contrato e sem forma de pagamento. A WiizePay gera um link fixo, como o das cobranças. Quem abre o link preenche os próprios dados, escolhe como pagar e paga. O cliente e a cobrança são criados automaticamente.

A cobrança feita para um cliente específico continua como hoje: a forma de pagamento já vem definida.

## Jornada de quem paga
```text
Link aberto -> 1. Seus dados -> [cria ou encontra o cliente]
            -> 2. Forma de pagamento (+ parcelas) -> [cria ou reaproveita a cobrança]
            -> 3. Checkout normal já existente (Pix / boleto / cartão)
```
- Se a mesma pessoa (mesmo CPF/CNPJ) voltar ao link, ela encontra o mesmo cliente e a cobrança em aberto daquele serviço, sem duplicar nada.
- Depois da etapa 2, a pessoa segue para o checkout que já existe. Status de pago continua mudando só pela confirmação do Asaas.

## Formas de pagamento por tipo de serviço
- **Pagamento único:** Pix, boleto ou cartão à vista.
- **Parcelado:** cartão de crédito (à vista ou até 21x), Pix Automático recorrente (parcelas mensais) ou boleto mensal (um boleto por mês, como no Asaas).
- **Recorrente:** cartão de crédito, Pix Automático e boleto, sem opção de parcelar.
- **Valor personalizado:** fica fora do checkout aberto, porque o valor precisaria ser digitado por quem paga.

O seletor de forma de pagamento e parcelas aparece somente no checkout aberto.

## Na tela de Serviços
- Na linha de cada serviço ativo, um botão "Link de checkout" cria o link na primeira vez, depois copia, e permite desativar.
- Uma etiqueta indica quando o serviço tem checkout aberto ativo.

## Segurança
- O valor e o tipo vêm sempre do serviço salvo. Quem paga nunca envia o valor.
- Limite de tentativas por link e por endereço de acesso, CPF/CNPJ validado, registros no histórico de eventos do checkout e na auditoria.
- A criação é idempotente (mesmo link + mesmo documento + mesmo serviço = mesma cobrança).
- Se a conta de recebimento da empresa não estiver ativa, o link mostra "indisponível".

## Detalhes técnicos
- Migração: tabela `service_checkout_links` (tenant_id, service_id, token hash/cifrado, active, created_by, timestamps), GRANT + RLS por membro da empresa; tabela `service_checkout_sessions` (link_id, customer_id, charge_group_id, method, installments, chave de idempotência única).
- Servidor: `src/lib/service-checkout.functions.ts` (criar/revogar link, autenticado + `member-access`) e funções públicas `getServiceCheckout`, `startServiceCheckout` (dados → upsert do cliente, mesma regra do `/api/public/v1/ext/checkout-sessions`), `chooseServiceCheckoutMethod` (cria a cobrança via `createChargeCore` e devolve o token `/pagar/...` existente). Regras puras de métodos/parcelas em `src/lib/service-checkout-rules.ts` com testes.
- Nova página pública `src/routes/checkout.$token.tsx` com as etapas 1 e 2; a etapa 3 redireciona para `/pagar/$token`.
- `src/routes/_authenticated/servicos.tsx`: botão e etiqueta do link.
- Traduções EN/ES em `src/locales/{en,es}/ui.json`; regra registrada no `AGENTS.md`.
