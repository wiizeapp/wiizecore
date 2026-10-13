# Reorganização do painel interno

## Apresentação
- Saldo disponível à esquerda, com a imagem de dinheiro enviada.
- MRR líquido previsto da empresa nos próximos 30 dias à direita, com a imagem de calendário enviada.
- Abaixo, manter o estilo atual para cinco indicadores com ícones: Faturado, A receber, Vencidos, Cobranças ativas e Novos clientes.
- Ajustar disposição e tamanhos para computador e celular, mantendo filtros e demais áreas do painel.

## Cálculos
- MRR é da empresa usuária, não da WiizePay: somar somente parcelas e cobranças recorrentes reais previstas nos próximos 30 dias, descontadas as taxas registradas. Identificar como previsão, não saldo já recebido.
- Excluir cobranças canceladas, recusadas e estornadas; não incluir novamente parcelas já pagas nem inventar mensalidades futuras.
- Os cinco indicadores inferiores acompanham o período selecionado. Novos clientes são aqueles cuja primeira cobrança ocorreu nesse período.

## Detalhes técnicos
- Reutilizar os registros de pagamentos e as regras de resumo financeiro existentes, sem alterar processamento financeiro ou permissões.
- Incluir testes dos cálculos e traduções dos novos textos, incorporar as imagens enviadas e conferir o painel autenticado em dois tamanhos de tela.
- Informar os arquivos editados e criados ao concluir, com eventuais limites de verificação.