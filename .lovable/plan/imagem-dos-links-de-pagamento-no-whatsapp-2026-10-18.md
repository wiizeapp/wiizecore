# Imagem dos links de pagamento no WhatsApp

- Usar a imagem enviada, sem modificá-la, na prévia de compartilhamento dos links de pagamento e checkout de serviço.
- Manter as imagens das demais páginas, contratos e portal inalteradas.
- Conferir a imagem pública e as informações de compartilhamento entregues ao WhatsApp.
- Informar os arquivos alterados. A atualização no WhatsApp depende da publicação e pode levar tempo por causa do cache.

## Detalhes técnicos
- Armazenar a imagem no Lovable Assets e adicionar `og:image` e `twitter:image` somente nas rotas de pagamento, com endereço HTTPS absoluto.
- Preservar toda a lógica financeira e de autenticação.