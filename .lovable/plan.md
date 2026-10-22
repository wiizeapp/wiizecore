# Correção dos webhooks Resend

## Falhas reproduzidas
- O endereço informado, `https://wiizecore.com/api/public/webhooks/resend-inbound`, responde com **308** e redireciona para `www.wiizecore.com`.
- Um aviso de diagnóstico assinado com a configuração disponível foi **recusado com 401** no endereço com www e **aceito com 200** no endereço Lovable. Isso indica configurações diferentes entre os ambientes, mas ainda não confirma qual segredo está cadastrado em cada webhook do Resend.
- O código atual pode salvar uma mensagem vazia quando a busca do conteúdo falha, impedindo sua recuperação nas novas tentativas.
- Ainda não recebemos a imagem de uma tentativa com erro nem acessamos o histórico do Resend. A imagem enviada mostra somente o cadastro desativado.

## Fase 1 — Correção e testes
- Preservar o endereço da rota e a exigência de assinatura válida.
- Usar uma biblioteca compatível com o padrão de assinatura do Resend em vez da verificação manual, com testes de assinatura válida, inválida, expirada e múltiplas assinaturas.
- Impedir o salvamento de mensagens incompletas quando a busca no Resend falhar; responder com erro temporário para permitir nova tentativa.
- Confirmar mensagens já salvas sem repetir o processamento; manter isolamento por empresa.
- Registrar erros úteis sem conteúdo de e-mails, destinatários ou segredos.
- Testar essas situações sem enviar e-mails, alterar pagamentos ou inserir mensagens fictícias em produção.

## Fase 2 — Ajuste do serviço publicado
- Orientar o cadastro do endereço direto, sem redirecionamento: `https://www.wiizecore.com/api/public/webhooks/resend-inbound`.
- Conferir a configuração de assinatura na Vercel e no Resend. Cada cadastro de webhook pode ter seu próprio segredo; não compartilhar um único segredo entre cadastros distintos sem verificar isso.
- Identificar se os dois cadastros são duplicados ou atendem ambientes diferentes antes de reativá-los.
- Após disponibilizar a correção no site e alinhar as configurações, reativar os cadastros necessários e reenviar uma entrega real que falhou; confirmar que a mensagem aparece na plataforma.

## Dependências para concluir
A reativação e a confirmação real dependem de acesso autorizado ao Resend e à configuração da Vercel, ou das ações do usuário nesses serviços. Não é necessário enviar segredos pelo chat. Sem essas etapas, a correção do código não será apresentada como solução completa em produção.

## Detalhes técnicos
- Mudanças limitadas ao recebimento Resend em `src/routes/api/public/webhooks/resend-inbound.ts`, auxiliares e testes específicos em `src/lib`, e documentação de configuração.
- Nenhuma mudança nos webhooks financeiros Asaas/Wiize, status de pagamentos, regras de cobrança ou páginas públicas.