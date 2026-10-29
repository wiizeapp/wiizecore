# Checkout sem perda de dados e seção 3DS

## O que será ajustado
- Preservar os dados de contato e endereço ainda não enviados ao sair e voltar ao mesmo checkout, com prazo limitado e limpeza após confirmação. Dados já confirmados e contratos assinados continuam vindo do servidor.
- Não guardar número de cartão, validade, CVV ou assinatura em rascunhos. O aceite e a assinatura não serão usados para pular confirmações exigidas pelo servidor.
- Atualizar a situação imediatamente ao voltar do aplicativo do banco, recuperar a conexão ou retornar ao site, acompanhando também pagamentos em processamento/análise até a confirmação oficial.
- Conferir que Pix recorrente mantém o histórico e apresenta corretamente a próxima cobrança, sem reiniciar etapas concluídas.
- No retorno 3DS, aguardar a confirmação oficial sem afirmar que o banco aprovou a autenticação apenas porque o cliente voltou ao site.
- Ajustar a seção 3DS e o globo para telas pequenas e grandes, com o verde da marca Wiize.

## Verificação
- Adicionar testes para recuperação de rascunhos, isolamento por link, expiração, limpeza e acompanhamento de pagamentos.
- Conferir os fluxos de retorno e a apresentação em navegador, sem realizar pagamentos reais.
- Manter explicitamente pendente a validação real do 3DS, que depende da conta de produção Asaas habilitada e de um pagamento autorizado.

## Detalhes técnicos
- Correções concentradas nos formulários e no acompanhamento do checkout, sem alterar liquidação, taxas, autorização ou confirmação por webhook.
- Rascunhos locais limitados a campos permitidos; nenhum estado local concede acesso ou confirma pagamento.
- `CHECKOUT_3DS_ENABLED=false` mantém o fluxo sem 3DS. A opção de liberação no Admin é uma proteção adicional para permitir testes controlados, não uma ativação da conta Asaas.