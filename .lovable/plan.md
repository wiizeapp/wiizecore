# Marca e Checkout na aparência

## Ajustes
- Separar a página Aparência em duas abas: **Marca** e **Checkout**, preservando o endereço atual.
- Marca reúne logo e cor principal; Checkout mantém temas, demais cores e suporte. A logo e a cor da marca são usadas na prévia dos lembretes e no checkout.
- A janela dos lembretes mostra a marca realmente salva, com logo e cor padrão Wiize quando não há personalização. O botão de edição abre Aparência diretamente em Marca.
- Preservar versões anteriores das cobranças, permissões e armazenamento privado das logos.

## Limite confirmado
- Não afirmar que a marca foi aplicada aos e-mails do Asaas: a API pública consultada documenta logo e cor para a fatura, não para e-mails. Essa parte fica bloqueada até o Asaas fornecer uma operação compatível; nenhum envio próprio será criado nesta etapa.
- A explicação da aba Marca diferencia onde a marca é aplicada e não promete alterações em e-mails não comprovadas.

## Verificação
- Testar persistência e padrão da cor da marca, navegação entre abas e abertura pela janela de lembretes.
- Conferir a interface na conta conectada, sem emitir cobranças nem enviar mensagens.

## Detalhes técnicos
- Reutilizar configurações versionadas existentes, adicionando a cor da marca ao conteúdo das configurações, sem nova tabela.
- Atualizar traduções e metadados da página. Informar todos os arquivos alterados na entrega.