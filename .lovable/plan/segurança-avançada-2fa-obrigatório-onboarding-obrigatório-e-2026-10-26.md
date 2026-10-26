# Segurança avançada: 2FA obrigatório, onboarding obrigatório e painel "Auditoria e Segurança"

Base lida: `docs/auditoria-baas-diagnostico-2026-10-26.md` (Fase 1), `docs/auditoria-baas-fase-2-2026-10-26.md`, `docs/auditoria-baas-fase-3-2026-10-26.md`.

## Já existe e será reaproveitado (não recriar)
- Registro de auditoria (`audit_logs` + `src/lib/audit.server.ts`) e eventos de segurança (`security_events`, `src/lib/security-alerts.ts`).
- 2FA por aplicativo autenticador do próprio sistema de login, com código reserva único (`mfa-recovery.functions.ts`) e exigência de 2FA em ações sensíveis (`mfa-step-up.ts`, `mfa_satisfied` nas regras do banco).
- Portão de acesso (`_authenticated/route.tsx`) e portão de onboarding (`onboarding-gate.tsx`).
- Painel administrativo (`nimda.tsx`, `admin-console.tsx`) com papéis em tabela separada.

## Lacunas encontradas
1. 2FA só é cobrado de quem já ativou; quem nunca ativou entra sem segundo fator, e as regras do banco aceitam essa sessão.
2. Onboarding pode ser pulado (regra atual do projeto permite "pular"). O pedido novo remove o pular — a regra antiga será substituída.
3. Logs não têm categoria/resultado/origem/correlação padronizados, nem proteção de integridade, nem painel de consulta.
4. Consultas e exportações de logs por administradores não são registradas.

## Etapas (por risco)
**Etapa 1 — 2FA obrigatório no servidor (maior risco)**
- Tela obrigatória de configuração (QR Code, chave manual, confirmação com código, exibição do código reserva e confirmação "salvei"), sem botão de fechar.
- Função central no servidor: sessão válida + 2FA validado nesta sessão + membro ativo + permissão. Aplicada em `member-access.server.ts` (usado por todas as operações) e no portão de rotas.
- Banco: `mfa_satisfied` passa a exigir 2FA validado na sessão para todos (não só para quem ativou). Liberado apenas: configurar 2FA, sair, suporte.
- Sessões antigas sem 2FA caem na tela de configuração.

**Etapa 2 — Onboarding obrigatório validado no servidor**
- Remover o "pular" das etapas obrigatórias; conclusão gravada só pelo servidor, retoma do ponto certo. Pulos antigos continuam registrados; usuários que já pularam serão pedidos a concluir apenas as etapas obrigatórias.

**Etapa 3 — Logs padronizados e protegidos**
- Novos campos tipados em `audit_logs` (categoria, resultado, origem, correlação, idempotência, id externo, nível de risco, hash encadeado), aditivos.
- Gravação só pelo servidor; limpeza automática de senhas, códigos, tokens, cartões e documentos; bloqueio de alteração/exclusão até pelo servidor (gatilho) e registro da tentativa.
- Eventos: login ok/falha, saída, 2FA (ativar/falha/recuperar), bloqueios, senha, papéis, convites/remoções, cobranças, pagamentos confirmados, cancelamentos, reembolsos, saques, dados bancários, clientes, coproduções, avisos do Asaas, falhas, conciliação, acesso negado entre empresas, acesso a documentos/KYC (só metadados).
- Falha ao gravar log nunca interrompe nem repete operação financeira; vira alerta.
- Limitação documentada: o encadeamento detecta adulteração, mas não impede que quem controla o banco reescreva tudo; proposta de cópia externa imutável (não implementada).

**Etapa 4 — Painel "Auditoria e Segurança"**
- Dentro do painel administrativo: visão geral, totais por período/categoria, filtros, busca por id/correlação, detalhes mascarados, falhas de login, mudanças de permissão, financeiro, alertas, exportação CSV/JSON limitada.
- Servidor valida admin + 2FA recente; paginação e limite de período; toda consulta, exportação e acesso negado é registrado; limite de frequência.
- Verificação de integridade da corrente de hashes pelo painel.

**Etapa 5 — Testes, documentos e inventário**
- Testes automáticos das regras (2FA, onboarding, limpeza de dados, integridade, permissões) + testes diretos no banco (usuário comum tentando inserir/alterar/apagar log, outra empresa, acesso sem 2FA).
- Rodar a suíte inteira; regressão financeira só com testes existentes (sem cobranças reais).
- Testes entre duas empresas seguem **bloqueados** sem contas de homologação.
- Atualizar Fases 1, 2 e 3 sem apagar nada; novo relatório final com inventário gerado do diff real, ordem das migrações, publicação e rollback.

## Fora do escopo
Nenhuma mudança em taxas, saldos, cobranças, saques, reembolsos, split ou integração Asaas. Nada publicado. Nenhuma migração destrutiva.

## Pontos de atenção
- Ao ativar a Etapa 1, **todos** os usuários (inclusive você) terão que configurar o aplicativo autenticador no próximo acesso.
- Cópia externa imutável dos logs e alertas por e-mail/externos ficam como pendência (não existe hoje).
