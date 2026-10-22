# Recuperação dos webhooks Resend

## Diagnóstico em 22/10/2026

- POST no endereço `https://wiizecore.com/api/public/webhooks/resend-inbound` retornou **308**, redirecionando para www.
- O mesmo aviso de diagnóstico assinado foi recusado (**401**) em `https://www.wiizecore.com/api/public/webhooks/resend-inbound` e aceito (**200**, ignorado sem escrita) em `https://wiizecore.lovable.app/api/public/webhooks/resend-inbound`.
- Isso comprova diferença de comportamento/configuração entre as publicações. Não estabelece qual segredo pertence a cada cadastro do Resend.
- As imagens mostram falhas de `email.sent`, `email.delivered` e `email.received`, mas não mostram o código de resposta de uma tentativa real.

## Configurar antes de reativar

1. Disponibilizar a correção deste projeto na publicação Vercel usada por www.wiizecore.com.
2. No Resend, editar o endereço para **https://www.wiizecore.com/api/public/webhooks/resend-inbound**, sem redirecionamento.
3. Copiar o segredo de assinatura do próprio cadastro no Resend para **RESEND_WEBHOOK_SECRET** nas variáveis de **Production** da Vercel, em formulário seguro. Não colar no chat. Fazer nova implantação para aplicar a variável.
4. Conferir **RESEND_API_KEY** em Production: a conta/chave deve permitir consultar mensagens recebidas. Não trocar a chave de envio sem avaliar os outros usos.
5. Este recebimento precisa apenas de **email.received**. Sent/delivered válidos são confirmados e ignorados, sem gravar dados. Selecionar somente email.received diminui avisos desnecessários.
6. Dois cadastros do Resend têm segredos próprios: se apontam para a mesma publicação com uma única variável, identificar qual manter e remover/desativar o duplicado somente após confirmação. Se atendem ambientes distintos, usar a configuração correspondente em cada ambiente. Não adicionar segredos de outros cadastros automaticamente.
7. Reativar o cadastro necessário; reenviar uma mensagem real recebida que falhou e conferir resposta 200 e presença na caixa de entrada da plataforma. Repetir entrega deve manter uma única mensagem.

## Respostas esperadas

- 200: mensagem salva/já salva ou outro evento assinado ignorado.
- 401: assinatura não confere, cabeçalhos ausentes ou tentativa expirada. Nunca retirar a verificação para esconder o erro.
- 400: evento assinado, mas malformado.
- 503: configuração ausente/inválida, consulta ao Resend indisponível, falha de consulta ou gravação. Nova tentativa permitida; não salva conteúdo incompleto.
- 308: ainda está usando o endereço que redireciona; corrigir o cadastro.

Testes automatizados usam apenas dados e segredos fictícios isolados, sem mensagens enviadas ou escritas em produção. A validação completa permanece pendente até o reenvio real e sua conferência na plataforma.