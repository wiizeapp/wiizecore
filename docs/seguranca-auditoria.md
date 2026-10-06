# Relatório de auditoria de segurança — WiizePay (29/09/2026)

## Corrigido
| Gravidade | Item | Correção |
|---|---|---|
| Alta | Visitantes sem login tinham permissão de leitura nas tabelas (bloqueada só pelas regras de acesso) | Permissão removida; só as taxas públicas ficam visíveis |
| Alta | Usuários logados tinham permissão de gravação em tabelas financeiras (bloqueada só pelas regras) | Gravação direta removida em saldo, extrato, pagamentos, saques, reembolsos, antecipações, notas, papéis, auditoria, chaves e configurações |
| Média | Link público do Pix Automático sem limite de tentativas | Limite de 60 acessos por 10 min por IP |
| Média | Sem conferência automática entre extrato e saldo | Função somente leitura + painel no /nimda |
| Baixa | Sem cabeçalhos de segurança | nosniff, HSTS, Referrer-Policy, Permissions-Policy, COOP |
| Baixa | Teste de notas fiscais quebrado | Corrigido |

## Já estava correto
- Regras de acesso ativas em todas as tabelas; isolamento por empresa via is_tenant_member/has_tenant_role.
- Funções que movem dinheiro só executáveis pelo servidor, com travas de linha e chaves de idempotência.
- Webhook com token por empresa, comparação em tempo constante e registro de eventos para bloquear repetição.
- Admin exige papel platform_admin + 2FA verificado no servidor; /nimda retorna 404 para quem não é admin.
- Proteção contra envio entre sites (CSRF) nas funções do servidor.
- Limite de tentativas: checkout, contratos, verificação, 2FA/recuperação, senha financeira, reembolsos.
- Senhas financeiras e códigos de recuperação com hash scrypt; chaves do provedor criptografadas (AES-256-GCM).

## Avisos antigos analisados (mantidos de propósito)
- 8 tabelas sem regras de acesso (ex.: chaves, webhooks, limites de tentativa): ficam totalmente fechadas; só o servidor acessa. É o comportamento desejado.
- 3 funções de checagem de permissão (has_role, has_tenant_role, is_tenant_member) executáveis por usuários logados: necessárias para as próprias regras de acesso; só respondem sim/não sobre o próprio usuário.

## Depende de fora do código
- Ataques de volume (DDoS): protegidos pela hospedagem.
- Backups do banco: automáticos no Lovable Cloud.
- Teste de invasão por empresa especializada: recomendado antes de operar em produção com volume alto.

## Testes automáticos
src/lib/security.test.ts: cliente administrativo nunca no topo de módulos do navegador, webhook exige token, links públicos com limite, nenhum segredo lido no navegador. 27/27 testes passando.
