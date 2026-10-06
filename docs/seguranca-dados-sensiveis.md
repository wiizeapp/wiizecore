# Mapa de dados sensíveis — WiizePay (Fase 1, 05/10/2026)

| Dado | Sensibilidade | Onde fica | Trânsito | Quem acessa | Criptografar? | Risco |
|---|---|---|---|---|---|---|
| Senha de login | Crítica | Autenticação gerenciada (hash) | HTTPS | Ninguém | Já protegido | Baixo |
| Senha financeira | Crítica | financial_credentials.password_hash (scrypt) | HTTPS | Servidor | Já hash | Baixo |
| Código reserva 2FA | Crítica | mfa_recovery_codes.code_hash | HTTPS | Servidor | Já hash | Baixo |
| Chave API Asaas / token webhook | Crítica | provider_connections.*_ciphertext (AES-GCM) + hash | Servidor↔Asaas | Servidor | Já criptografado; falta versão de chave | Médio |
| Tokens Wiize / Google Drive | Crítica | wiize_tokens.*_enc, google_drive_connections.refresh_token_ciphertext | Servidor | Servidor | Já criptografado; falta versão | Médio |
| OAuth (clientes, códigos, tokens) | Crítica | oauth_* (hash; webhook_secret_enc) | HTTPS | Servidor | Já protegido | Baixo |
| Links públicos, convites, portal, handoff | Alta | *_token_hash | URL | Servidor | Já hash | Baixo |
| Dados bancários e chave Pix | Alta | bank_accounts (agency, account_number, holder_document, pix_key) em texto | HTTPS | Empresa + servidor | **Sim** | Alto |
| CPF/CNPJ, endereço, telefone, e-mail de clientes | Alta | customers (texto) | HTTPS | Membros da empresa | **Sim** (+ busca por hash) | Alto |
| CPF/CNPJ, endereço, faturamento da empresa | Alta | tenants (texto, income_value) | HTTPS | Empresa + admin | **Sim** | Alto |
| Dados de signatários | Alta | contract_signers/contract_signatures (document, email, IP) | HTTPS | Empresa | **Sim** (documento) | Médio |
| Documentos KYC | Crítica | Armazenamento privado + activation_documents (caminho) | HTTPS/URL assinada | Empresa, servidor, Asaas | Armazenamento privado já criptografado em disco | Médio |
| Cartão | Crítica | Não armazenado (só 4 últimos na auditoria) | Navegador→servidor→Asaas | Ninguém | N/A | Baixo |
| Valores, saldos, transações | Média | payments, wallets, transactions | HTTPS | Empresa | Não (necessário para cálculos; protegido por regras de acesso) | Baixo |
| IP / navegador | Média | audit_logs, security_events, user_sessions, contract_events | Servidor | Admin / empresa | Não; reter com prazo | Baixo |
| E-mail/telefone do perfil | Média | profiles | HTTPS | Próprio usuário | Opcional | Baixo |

## Achados
- **Alto:** dados bancários, chave Pix e documentos de clientes/empresas em texto no banco (protegidos só por regras de acesso).
- **Médio:** chaves criptografadas sem número de versão — impossível trocar a chave mestra sem migração manual.
- **Médio:** `asaas.server.ts` registra a resposta completa do Asaas ao falhar envio de documento (pode conter dados pessoais).
- **Baixo:** navegador guarda apenas tema, idioma, consentimento e sessão de login — nada sensível.
- Já correto: senhas/códigos com hash, links públicos só com hash, cartão nunca armazenado, regras de acesso por empresa.

## Próxima fase (Fase 2)
Versionar a criptografia (`v1:`) mantendo leitura do formato antigo, e limpar o registro do Asaas.

## Fase 2 — aplicada
- Criptografia com versão (`v1:`), leitura do formato antigo mantida, pronta para troca de chave (`WISE_PAY_ENCRYPTION_KEY_V2`).
- Conta de saque: documento, agência, conta e Pix criptografados; colunas visíveis guardam só máscara. Contas antigas são criptografadas automaticamente ao abrir a tela de saques do admin.
- Falha de envio ao Asaas registra só status e códigos de erro.
- Pendente (Fase 3): dados de clientes/leads (CPF, telefone, endereço) — usados em ~44 pontos e em buscas.

## Fase 3 — aplicada
- Cadastro de ativação (CPF, RG, nascimento, contato, endereço, faturamento, responsável legal) criptografado em `form_enc`; no banco legível ficam só razão social, nome fantasia, tipo, cidade, Estado.
- Acesso: membros da mesma empresa veem tudo normalmente (o servidor abre os dados após conferir a empresa); outras empresas continuam bloqueadas pelas regras de acesso (`is_tenant_member`) + 2FA quando ativo.
- Clientes/leads: mantidos legíveis apenas para a própria empresa (busca, checkout e portal dependem deles); isolamento conferido em customers, signatários, documentos e ativação.

## Fase 4 — aplicada
- Webhook Asaas: token por empresa (hash + comparação em tempo constante), eventos repetidos bloqueados, status nunca volta de pago/estornado. Conferido, sem mudanças.
- Cartão: só os 4 últimos dígitos na auditoria; número e CVV vão direto ao Asaas. Conferido.
- Corrigido: erros do Asaas registravam a resposta completa (podia ter CPF, e-mail, endereço) — agora só status, códigos e caminho sem IDs. Erros do checkout e da régua registram só a mensagem.
- Checkout público: devolve os dados do próprio cliente para ele confirmar (CPF já mascarado), apenas com o link secreto e limite de tentativas.

## Fase 5 — aplicada
- Registros: NFS-e, conferência com IA e cancelamento de cobrança deixaram de registrar respostas completas (podiam conter dados de clientes); agora só status/mensagem e caminho sem IDs.
- Navegador: guarda apenas idioma, consentimento, aviso visto, sessão de login, sessão temporária do portal/celular (aba atual, expira) — nenhum CPF, conta ou cartão.
- Documentos: KYC e logos em armazenamento privado com links assinados; nenhum link público encontrado.

## Fase 6 — aplicada
- Todas as tabelas têm regras de acesso ligadas; a única leitura pública é a dos códigos de rastreamento do site (não sensível).
- Todas as ações do Admin conferem o papel de administrador no servidor antes de rodar.
- Testes automáticos de segurança executados.

## Fase 7 — Relatório final
**Protegido hoje**
- Senhas, senha financeira e código reserva do 2FA: guardados de forma irreversível (hash).
- Chaves de integração (Asaas, Wiize, Google Drive), dados de saque (`bank_accounts.sensitive_enc`) e cadastro de ativação (`payment_activations.form_enc`): criptografia AES-256-GCM com versão (`v1:`), pronta para troca de chave.
- Cartão: nunca guardado; só os 4 últimos dígitos na auditoria.
- Links públicos, convites, portal e celular: só o hash fica no banco; uso único/expiração quando aplicável.
- Registros internos: nenhuma resposta completa de provedor é gravada (Asaas, NFS-e, IA).
- Isolamento: todas as tabelas com regras de acesso por empresa; Admin conferido no servidor; teste automático impede função nova sem login.

**Risco aceito**
- Dados de clientes/leads (CPF, telefone, endereço) seguem legíveis só para a própria empresa, porque busca, checkout e portal dependem deles. Protegidos por regras de acesso + criptografia em disco do banco.

**Recomendações**
1. Testar no ambiente de teste: cadastro de conta de saque, saque, ativação completa e pagamento com cartão.
2. Teste manual entre duas empresas (uma não deve ver nada da outra).
3. Futuro: criptografar CPF de clientes com busca por hash exato, caso o risco precise ser reduzido.
4. Trocar a chave mestra periodicamente usando `WISE_PAY_ENCRYPTION_KEY_V2`.
