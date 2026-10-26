# WiizePay — marca e domínio de produção

A apresentação atual usa WiizePay. Site, endereços públicos da API, documentação, canonical e links dos novos e-mails usam `https://wiizepay.com`, centralizados nas configurações existentes. O símbolo e as fontes foram preservados. As páginas, textos de suporte, políticas, notificações novas e traduções PT-BR/EN/ES foram atualizados.

## Preservado

Nenhuma alteração de banco, migration, segredo, pagamento, permissão, registro histórico ou documento já emitido. Rotas, nomes técnicos, cabeçalhos assinados, chaves de armazenamento e integração Wiize CRM permanecem iguais. A imagem compartilhada de pagamentos continua hospedada em sua origem atual até que sua disponibilidade no novo domínio seja confirmada. A configuração de retorno para sandbox/preview não foi alterada para não redirecionar avisos de teste à produção.

## Antes da publicação oficial

1. Conectar `wiizepay.com` ao provedor que hospedará a produção. Na Lovable, confirmar os registros pela janela de conexão de domínio e definir o domínio principal após verificação. Se a produção for na Vercel, configurar o domínio nessa hospedagem, em vez de apontar simultaneamente para a Lovable.
2. Publicar o código atualizado na hospedagem escolhida.
3. Revisar URLs autorizadas de login, recuperação de senha e integrações externas. Preservar callbacks do CRM em `wiize.com.br`, pois pertencem ao CRM, não ao site de pagamentos.
4. No Asaas, revisar os endereços de webhook de produção para o novo domínio, preservando os caminhos e tokens atuais. Conferir entregas autenticadas antes de retirar endereços antigos; não criar recebimento duplicado sem necessidade.
5. Revisar `RESEND_FROM_EMAIL`: se definido, ele prevalece sobre o remetente padrão do código. Trocar somente o nome visível para WiizePay, mantendo o endereço já validado; novo endereço exige validação do domínio de envio. Outros remetentes configurados externamente também precisam da nova marca.
6. Confirmar homologação formal da marca e das cláusulas pelo Asaas/jurídico. Esta mudança de apresentação não comprova essa aprovação.

Nenhuma dessas configurações externas foi modificada automaticamente. Pagamentos reais, entrega de e-mail e webhooks no novo domínio devem ser conferidos depois da publicação; a troca da marca não valida liquidação financeira.