# Venda Wiize conectada à WiizePay (janelas embutidas seguras)

## Objetivo
No CRM Wiize, o assistente "Gerar venda" (Cliente → Contrato → Serviço → Cobrança) passa a usar a WiizePay de verdade:
- **Cliente:** o cliente da Wiize é enviado e vinculado na WiizePay (já existe), sem duplicar.
- **Contrato / Serviço:** escolher um que já existe na WiizePay ou criar um novo por uma janela da WiizePay aberta dentro da Wiize.
- **Cobrança:** criada pela janela da WiizePay; a Wiize recebe o link de pagamento verdadeiro e o status por aviso assinado.
- A janela segue o tema da Wiize: clara ou escura, inclusive se trocar com ela aberta.

## Segurança (transporte e acesso)
- Tudo só por HTTPS. Nenhuma senha, token ou chave aparece no endereço da janela.
- A Wiize pede ao servidor da WiizePay um **passe de uso único** (vale 2 minutos), usando a conexão OAuth que já existe. Esse pedido é de servidor para servidor.
- A janela abre com esse passe. A WiizePay troca o passe por uma sessão curta (30 min), presa a uma empresa e a um usuário. A sessão fica guardada em um cookie protegido e só funciona dentro da janela.
- A WiizePay só aceita aparecer dentro do endereço oficial da Wiize. Qualquer outro site é bloqueado (proteção contra cliques falsos).
- As mensagens entre a janela e a Wiize só são aceitas quando vêm do endereço oficial e levam somente identificadores e status, nunca dados pessoais completos.
- A janela só consegue ver e criar dados da empresa conectada. Permissões e membro ativo são conferidos no servidor. Toda ação fica registrada na auditoria.
- Os avisos de volta para a Wiize são assinados e não se repetem (a assinatura já existe).

## O que muda na WiizePay
1. Novo endereço da API para emitir o passe da janela (contrato, serviço ou cobrança, cliente e tema).
2. Novas listas na API para a Wiize mostrar contratos e serviços existentes do cliente.
3. Novas telas enxutas para a janela: Contrato, Serviço e Cobrança. Elas usam os mesmos formulários e regras atuais (assinatura do contrato, taxas, checkout), sem menu lateral.
4. Tema na janela: o tema vem no início e pode ser trocado por mensagem; ele só muda a aparência.
5. Cabeçalhos de segurança: permitir a janela apenas para a Wiize e apenas nessas telas. O resto do site continua bloqueado.
6. Traduções PT/EN/ES dos novos textos.

## O que muda no projeto Wiize - LB2 (feito lá)
Ao final, entrego um texto pronto para colar no projeto Wiize - LB2. Ele diz como pedir o passe pelo servidor, abrir a janela com o tema atual, ouvir as mensagens só do endereço da WiizePay e salvar na venda os IDs e o link de pagamento.

## Detalhes técnicos
- Migration: tabela `embed_tickets` (hash do passe, tenant, usuário, tipo, cliente, expiração, usado_em) e `embed_sessions` (hash, tenant, usuário, expiração), com RLS fechada e acesso só do servidor (grants para service_role).
- Rotas: `src/routes/api/public/v1/embed-tickets.ts`, `.../v1/contracts.ts` (GET), `.../v1/services.ts` (GET); telas `src/routes/embed.contrato.tsx`, `embed.servico.tsx`, `embed.cobranca.tsx`.
- Lógica: `src/lib/embed-session.server.ts`, `src/lib/embed.functions.ts`. Reaproveita `charges-core.server.ts`, `member-access.server.ts` e `oauth-ui-theme.ts`.
- Cookie `__Host-` com Secure, HttpOnly e SameSite=None, para funcionar dentro da janela. Também há proteção contra ações forjadas (CSRF) em cada ação.
- `security-headers.ts`: em `/embed/*`, `frame-ancestors` só com a origem da Wiize, vinda de `deploy-config.ts`. No resto, continua `DENY`.
- postMessage com `targetOrigin` fixo; eventos `wiizepay:ready`, `contract.selected`, `service.selected`, `charge.created`, `theme.set`.
- Testes: passe expirado ou reutilizado, empresa errada, origem errada e cabeçalhos por rota.
