# Segurança avançada — 2FA obrigatório, onboarding obrigatório e auditoria interna (26/10/2026)

## O que foi feito
- **2FA obrigatório**: banco (`mfa_satisfied()` exige sessão AAL2) e servidor (`requireMfaAuth` em todas as funções logadas; exceções nominais: recuperação de 2FA, registro da mudança de 2FA e aceite de convite). Tela obrigatória de configuração sem botão de pular, com código reserva único exibido uma vez.
- **Onboarding obrigatório**: servidor recusa concluir sem as perguntas obrigatórias; pular é recusado e registrado; progresso salvo e retomado.
- **Logs internos**: `audit_logs` com categoria, resultado, risco, origem, correlação; metadados sanitizados; corrente de hash; bloqueio de UPDATE/DELETE/TRUNCATE (migration 0040).
- **Painel "Auditoria e Segurança"** (Admin): só papel `platform_admin` com 2FA; filtros, detalhes, exportação CSV/JSON limitada (5/hora, 5.000 linhas, 90 dias), verificação de integridade; toda consulta é registrada.

## Evidências
- Verificação de tipos sem erros; build OK.
- Testes: 303 aprovados, 22 ignorados (testes de isolamento entre empresas — exigem credenciais de homologação; **não aprovados**).

## Não verificado / riscos residuais
- Fluxo logado (configuração do 2FA, onboarding, painel) não foi testado no navegador por falta de sessão de teste.
- Usuários atuais sem 2FA serão obrigados a configurar no próximo acesso — comunicar antes de publicar.
- Registros antigos não têm hash; administrador do banco ainda pode reescrever dados (falta cópia externa imutável).
- Integrações que chamam funções logadas sem 2FA (ex.: apps internos) devem ser testadas antes da publicação.

## Publicação e reversão
Nada foi publicado. Reverter: voltar o código à versão anterior; no banco, recriar `mfa_satisfied()` aceitando usuários sem fator (versão da 0039) — sem apagar logs.
