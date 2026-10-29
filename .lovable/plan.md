# Seção 3D Secure — apresentação profissional

- Redesenhar somente a seção 3D Secure da página Segurança: título forte, textos mais claros, benefícios separados e estado de homologação bem identificado.
- Incorporar o globo animado do anexo como ilustração da infraestrutura, com destaque no Brasil, movimento discreto e adaptação a telas estreitas. A ilustração não representa operações reais ou cobertura internacional.
- Adaptar o código enviado ao projeto, com carregamento seguro no navegador, cores do tema, interação por arraste e respeito à preferência de movimento reduzido.
- Preservar os avisos: integração preparada, 3DS desligado até liberação, teste real de produção obrigatório e nenhuma garantia de fraude zero/reversão.
- Não alterar pagamentos, configuração 3DS, Admin ou regras financeiras.
- Conferir a seção em telas larga e estreita, o globo visível/em movimento e ausência de erros; adicionar traduções das mensagens novas.

## Resposta sobre ativação
Com `CHECKOUT_3DS_ENABLED=false`, permanece o fluxo normal de cartão sem 3DS. Com `true`, também é necessária a liberação operacional no Admin e a habilitação Asaas. A integração foi preparada, mas funcionamento real com desafio ainda depende de homologação na produção habilitada.