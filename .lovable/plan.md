# WiizePay — identidade e domínio de produção

## Entrega
- Substituir WiizeCore e Wiize Core por **WiizePay** nas páginas públicas e internas, logo escrita, títulos, políticas, mensagens, e-mails e traduções.
- Preservar o símbolo, as fontes, o acabamento visual e todas as regras financeiras e de segurança existentes.
- Organizar os endereços públicos do site e da documentação para **https://wiizepay.com**.
- Conferir páginas principais, idiomas e ausência de nomes antigos na apresentação.

## Domínio e publicação
Abrir a conexão de **wiizepay.com** para confirmar os registros no provedor do domínio. A mudança no site oficial depende da publicação; não publicar automaticamente nem alterar cadastros de integração externos sem confirmação.

## Detalhes técnicos
- Centralizar identidade em `brand-config.ts` e origens públicas em `deploy-config.ts`.
- Não renomear rotas, chaves de armazenamento, eventos, identificadores OAuth, integrações, migrations ou registros históricos.
- Preservar endereços de callbacks do CRM e arte oficial Asaas. Manter a origem da imagem compartilhada até confirmar sua disponibilidade no novo domínio.
- Não alterar banco nem segredos. Documentar configurações externas que precisam acompanhar a mudança, inclusive URLs de login, webhooks e remetente de e-mail.
- Validar testes existentes relacionados aos arquivos alterados e navegação real; aprovação formal da marca pela Asaas permanece externa.

