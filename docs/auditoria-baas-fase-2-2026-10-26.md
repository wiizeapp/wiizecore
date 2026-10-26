# Auditoria BaaS — Fase 2 (26/10/2026)

Referência: Contrato BaaS Asaas (cláusulas 3–14 e Anexo I) enviado pelo responsável. Este documento não é parecer jurídico nem declara conformidade total.

## 1. Correções realizadas
| Item | Antes | Depois | Rollback |
|---|---|---|---|
| `mfa_satisfied` | Executável por visitantes sem login | Só usuários logados e servidor (`0039_revoke_anon_mfa_satisfied.sql`). Todas as regras que usam a função valem só para usuários logados, então nenhum fluxo legítimo foi afetado | `GRANT EXECUTE ... TO anon` |
| `mark_notifications_read` | Revisada | Sem falha: exige membro ativo da empresa e só altera avisos daquela empresa (campo de leitura). Nenhuma alteração necessária | — |

## 2. Testes executados
| Tipo | Teste | Esperado | Obtido |
|---|---|---|---|
| Manual (chamada direta) | Visitante lê payments, customers, withdrawals, bank_accounts, wallets, notifications, audit_logs, provider_connections, tenants | Recusado | Recusado (permissão negada) |
| Manual | Visitante chama `mark_notifications_read` de outra empresa | Recusado | Recusado |
| Manual | Visitante chama `mfa_satisfied` após correção | Recusado | Recusado |
| Automatizado | Suíte completa | Passar | 291/291 |
| **Não executado** | Usuário da empresa A lendo/alterando/movendo dados da empresa B via chamadas diretas | — | **Pendente**: requer autorização para entrar com duas contas de teste de empresas diferentes |

Inspeção estática: todas as tabelas privadas têm regras ligadas a `is_tenant_member`/`has_tenant_role` + exigência de 2FA (`mfa_required`); operações financeiras passam pelo servidor com `member-access.server.ts`.

## 3. Sete cobranças históricas sem conta Asaas
Todas da mesma empresa (id iniciado em `a80e5c3c`), criadas entre 25/09 e 02/10/2026; a empresa **não tem mais nenhuma conexão Asaas** cadastrada. Todas têm identificador da cobrança no Asaas e avisos (webhooks) recebidos.
| Cobrança (início do id) | Situação | Avisos |
|---|---|---|
| c12213b1 | paga | 1 |
| 0b536776 | cancelada | 2 |
| 9f1894fa | cancelada | 2 |
| 9d79238f | aguardando pagamento | 1 |
| 7e5caecd | paga | 3 |
| 22962e4e | cancelada | 2 |
| ab281b15 | paga | 3 |

Conclusão: registros de teste/antigos de uma conexão removida, não falha de associação atual. Não foram vinculados, apagados nem alterados. **Conciliação manual**: conferir no painel Asaas da conta original as 3 pagas e cancelar no Asaas a que segue aguardando pagamento (9d79238f), se for teste.

## 4. Procedimento de resposta a incidentes (manual — Anexo I, 8; cl. 13.5 b)
1. **Identificar e registrar** data/hora da identificação (alertas de segurança do sistema, `security_events`, reclamações, aviso do Asaas).
2. **Classificar**: Crítico (vazamento de chave/dados, movimentação indevida), Alto (falha de acesso entre empresas, fraude), Médio, Baixo.
3. **Responsável**: titular da conta Wiize (Caio Ornelas) — único escalonamento até haver equipe; definir substituto.
4. **Conter**: revogar chave de API afetada no Asaas (Anexo I 4.2), bloquear usuário/empresa, suspender rota afetada. **Preservar evidências**: não apagar logs; exportar `audit_logs`, `security_events`, `webhook_events` do período.
5. **Comunicar o Asaas imediatamente, no máximo 24 h após a identificação**, por canal formal do contrato/gerente e e-mail contato@asaas.com.br. Registrar canal, horário, destinatário e comprovante (print/e-mail enviado).
6. Comunicar ANPD/titulares quando houver dado pessoal, conforme LGPD.
7. Investigar, corrigir, recuperar, e fazer análise posterior escrita (causa, impacto, ação preventiva).
Não há envio automático ao Asaas; o sistema só alerta internamente.

## 5. Checklist técnico (Anexo I)
| Controle | Situação |
|---|---|
| Segregação dev/homologação/produção (5.1–5.3) | **Parcial**: prévia e site publicado usam o mesmo banco; Asaas tem modo sandbox/produção por conexão. Requer banco separado para homologação |
| Chaves de API guardadas criptografadas, só no servidor (4.1 a–d) | Confirmado no código |
| Rotação de chaves | Não implementado como rotina; manual |
| Mecanismo adicional Asaas (4.1 e: validação de saque por webhook, IPs autorizados ou token/SMS) | **Não verificável** no código — configurar e comprovar no painel Asaas |
| Logs e rastreabilidade (7.2–7.3) | Parcial: auditoria e eventos de segurança existem; proteção contra exclusão por administrador do banco e retenção formal não definidas |
| Backups e testes de restauração | Não verificável (automático na hospedagem; teste de restauração nunca feito) |
| Monitoramento e vulnerabilidades (9) | Parcial: alertas internos e analisador do banco; sem processo formal com prazos |
| Acesso de admin/colaboradores | Confirmado: papéis em tabela separada, 2FA para admin, permissões no servidor |
| Dados pessoais e documentos | Confirmado: documentos em armazenamento privado, dados bancários/KYC criptografados |
| Continuidade e recuperação | Não implementado (sem plano escrito) |

## 6. Matriz contratual resumida
| Cláusula | Obrigação | Situação | Responsável |
|---|---|---|---|
| 3 | Asaas visível como instituição financeira | Selos e textos aplicados; aprovação do Asaas pendente | Wiize + Asaas |
| 4 | Estrutura Asaas → Tomadora → Cliente final → Pagador; proibida revenda/“infra para terceiros” | **Risco a confirmar**: o sistema cria subcontas para empresas e oferece API externa para que sistemas de terceiros cobrem seus clientes | Asaas (confirmação formal) |
| 5 | Exclusividade Asaas | Confirmado: só Asaas ativo | Wiize |
| 6.4 | Split só para remuneração/serviço não financeiro, nunca 100% | Parcial: taxas da plataforma e coproduções usam split; coprodução entre empresas precisa de validação | Asaas |
| 7.1 | Encaminhar reclamações ao Asaas | Canal de suporte Asaas exibido; sem registro de encaminhamento | Wiize |
| 9.2 / Anexo I | Checklist de segurança | Seção 5 acima | Wiize |
| 11 | Relatório mensal de indicadores (reclamações, SLA) | Não implementado | Wiize |
| 13.5 | Comunicação de incidentes | Procedimento manual (seção 4) | Wiize |

## 7. Pendências
1. Autorizar o teste entre duas empresas com contas de teste.
2. Asaas: confirmar se subcontas, API externa e coproduções respeitam as cláusulas 4 e 6.4.
3. Ativar no painel Asaas um mecanismo adicional de segurança e guardar comprovante.
4. Banco separado para homologação.
5. Plano de continuidade, teste de restauração e relatório mensal da cláusula 11.
6. Conciliação manual das 7 cobranças.
