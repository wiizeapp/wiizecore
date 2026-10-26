# Diagnóstico inicial (somente leitura) — Auditoria de segurança e conformidade BaaS — 26/10/2026

Nenhum código, dado financeiro, credencial ou configuração foi alterado nesta etapa.

## 1. Nível de risco atual (preliminar)
**Moderado**, sem falha crítica (P0) confirmada nesta etapa. Conformidade contratual **não verificada**: o texto do contrato BaaS (cláusulas 3–14 e Anexo I) não está no projeto.

## 2. Evidências coletadas nesta etapa
| Tipo | Verificação | Resultado |
|---|---|---|
| Automatizado | Suíte completa | 291/291 testes, 39 arquivos |
| Automatizado | Analisador de segurança do banco | 14 avisos, nenhum crítico |
| Inspeção estática | Chaves privadas no navegador | Nenhuma; só chave pública do backend |
| Inspeção estática | Webhook Asaas | Token por conexão, hash + comparação em tempo constante, idempotência por evento e conexão, limite de tamanho, validação de formato |
| Inspeção estática | Senha financeira | Bloqueio atômico 3 erros/60 min, auditado |
| Inspeção estática | Acesso de equipe | Vínculo ativo + permissões no servidor |
| Banco | Funções privilegiadas executáveis por usuários | 5 (has_role, has_tenant_role, is_tenant_member, mark_notifications_read, mfa_satisfied) |

## 3. Achados
| Prioridade | Achado | Situação |
|---|---|---|
| P1 | Teste real entre duas empresas (ler/alterar/mover recursos da outra) nunca executado ponta a ponta | Não verificado — precisa de 2 contas de teste |
| P1 | Arquitetura de contas: plataforma cria subcontas Asaas e usa split (`asaas.server.ts`) — pode tocar cláusulas de revenda/subparceria | Questão jurídica — requer confirmação formal do Asaas |
| P2 | `mfa_satisfied` executável sem login | Baixo risco (só lê a própria sessão); revogar |
| P2 | `mark_notifications_read` executável por usuário logado | Verificar se filtra pela empresa do usuário |
| P2 | 7 tabelas fechadas sem regras (só servidor acessa) | Intencional |
| P2 | Extensão no esquema público | Baixo risco |
| P2 | Processo formal de incidente com aviso ao Asaas em até 24 h | Parcial: alertas existem; falta procedimento e registro de comunicação |
| P2 | 7 cobranças históricas sem conta Asaas identificável | Bloqueadas para conferência manual |
| P3 | Dados da empresa responsável (razão social, CNPJ, encarregado LGPD) | Pendente de informação do responsável |

## 4. Não auditado / não verificável daqui
Texto do contrato BaaS e Anexo I; configurações da Vercel e do Asaas; backups/restauração; teste de invasão; chargebacks reais; mecanismos extras de segurança de API do Asaas (ex.: lista de IPs) — dependem de configuração externa.

## 5. Próximos passos propostos
1. Receber o contrato BaaS para montar a matriz cláusula a cláusula.
2. Corrigir P2 do banco (revogar `mfa_satisfied`, revisar `mark_notifications_read`).
3. Criar testes automáticos de isolamento entre empresas e roteiro de incidente 24 h.
4. Enviar ao Asaas as perguntas sobre subcontas/split/revenda.

Não há declaração de conformidade total nem de ausência de multas.
