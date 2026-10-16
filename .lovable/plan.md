# Integrações e API separadas por ambiente

## 1. Menu "Integrações" no menu lateral
Menu que abre com dois itens:
- **Integrações gerais**: a página de integrações que já existe (Wiize, Drive etc.), sem mudanças.
- **API e Desenvolvedores**: uma página com abas:
  - **Chaves de API**: gerar, ver prefixo, revogar. Para gerar uma chave é preciso digitar a **senha financeira** (conferida no servidor). A chave completa aparece uma única vez; depois fica guardada só de forma protegida (hash).
  - **Webhooks**: cadastrar o endereço (só HTTPS), segredo de assinatura criptografado, enviar evento de teste, ver histórico de entregas.
  - **Documentação**: a documentação que já existe.
  - **Guia para IAs**: os textos prontos para Lovable, Codex, Claude, Cursor, Base44 e outros, com botão de copiar.
- **Produção e Teste separados**: cada aba mostra só os itens do ambiente escolhido. Chave e webhook de teste nunca funcionam em produção, e o contrário também. O servidor confere o tipo da chave em cada chamada. O que aparece na tela serve só para orientar e não dá permissão para nada.

## 2. Produção como padrão e aviso ao mudar para Teste
- Ao entrar, o ambiente é sempre **Produção**.
- Ao mudar para **Teste**, aparece um aviso explicando que, para usar o ambiente de testes, é preciso concluir a ativação de pagamentos: preencher todos os dados e enviar as fotos dos documentos. Tem um botão "Ir para ativação".
- Um ajuste no texto: quem aprova é o Asaas. Não vamos escrever "aceito automaticamente". Vamos escrever "a análise é feita pelo provedor e costuma ser rápida". Assim o texto não promete algo que a plataforma não controla.

## 3. Como separar teste e produção no seu projeto de produção (resposta)
- No projeto de produção (Vercel), crie **dois conjuntos de credenciais do Asaas**:
  - `ASAAS_API_KEY` + `ASAAS_WEBHOOK_TOKEN`: conta real (produção).
  - `ASAAS_SANDBOX_API_KEY` + `ASAAS_SANDBOX_WEBHOOK_TOKEN`: conta sandbox do Asaas.
- O servidor escolhe qual credencial usar pelo **tipo da chave da API** (`sk_live_` usa produção, `sk_test_` usa sandbox). O botão da tela não decide isso.
- No painel do Asaas sandbox, aponte o webhook para o mesmo endereço do site, com o token sandbox. O sistema identifica de qual ambiente veio cada aviso e o registra separado.
- Antes de ligar isso em produção, vou conferir no código como o Asaas está configurado hoje. Se alguma variável nova for necessária, ela entra na lista de mudanças para a Vercel. Nada de produção muda sem essa comparação.

## Detalhes técnicos
- Nova rota `/_authenticated/integracoes/api` (abas). O item do menu fica em `app-shell.tsx` como grupo que abre e fecha.
- Server fn `createExtApiKey` exige senha financeira (reaproveita a verificação já existente), permissão de admin da empresa e auditoria.
- Webhooks: tabela de endpoints por empresa + ambiente. O segredo fica criptografado no servidor. As entregas usam a fila que já existe (`enqueueWiizeSaleEvent`) e são filtradas por ambiente.
- Ambiente padrão "production" em `dev-environment.ts`; modal na troca para teste.
- Resolver de credencial Asaas por ambiente em um único helper do servidor.
- Traduções PT/EN/ES; testes: senha financeira obrigatória, chave de teste recusada em produção, padrão = produção.
- No final: lista de arquivos criados e editados, sem repetir os das entregas anteriores.
