# Auditoria BaaS — Fase 3: fechamento de pendências (26/10/2026)

Fonte de verdade: `docs/auditoria-baas-fase-2-2026-10-26.md`. Nenhuma tarifa, saldo, cobrança, subconta, split ou API externa foi alterada. Nenhuma mensagem foi enviada ao Asaas.

## P1 — Isolamento entre empresas
- **Antes:** só testado sem login.
- **Ação:** suíte automatizada `src/lib/tenant-isolation.live.test.ts` (22 testes): leitura de 16 tabelas sensíveis da empresa B, alteração de cobrança, exclusão e criação de cliente, marcar avisos, listar arquivos privados de KYC, mais um controle positivo (A vê a própria empresa).
- **Resultado:** 22 **ignorados (skipped)** — não executados, portanto **não aprovados**.
- **Acessos necessários (homologação):** endereço + chave pública do backend de homologação; sessão com 2FA de um usuário da empresa A; ids da empresa A, da empresa B, de uma cobrança e de um cliente simulados da B. Variáveis: `ISO_URL, ISO_ANON_KEY, ISO_A_TOKEN, ISO_A_TENANT, ISO_B_TENANT, ISO_B_PAYMENT, ISO_B_CUSTOMER`.
- Comando: `bunx vitest run src/lib/tenant-isolation.live.test.ts`.

## P2 — Homologação isolada (proposta, não executada)
- **Hoje:** prévia e site publicado compartilham o mesmo banco, armazenamento e segredos. Asaas separa sandbox/produção por conexão.
- **Proposta:**
  1. Criar um projeto separado (remix) só para homologação: banco, armazenamento, autenticação e segredos próprios. O remix copia a estrutura, sem dados.
  2. Homologação recebe apenas chaves **sandbox** do Asaas; produção recebe só chaves de produção (Anexo I 5.3).
  3. Dados de teste fictícios; nunca copiar dados reais.
  4. Toda mudança passa primeiro pela homologação; produção recebe apenas a publicação revisada.
- **Dependências:** chaves sandbox Asaas, conta de e-mail de teste, endereços de retorno dos webhooks da homologação.
- **Rollback:** a homologação é independente; descartá-la não afeta a produção.

## P3 — Segurança adicional da API Asaas (Anexo I 4.1 e) — ação manual
Escolher ao menos um, em cada conta de produção, no painel Asaas (menu Integrações / Segurança da API — confirmar o nome atual no painel):
1. **Endereços IP autorizados:** cadastrar os IPs de saída do servidor. Atenção: a hospedagem atual pode não ter IP fixo; confirmar antes de ativar, para não bloquear cobranças.
2. **Validação de saque via webhook:** o Asaas consulta um endereço da plataforma antes de liberar cada saque. **Não implementado no sistema**; exige desenvolvimento e aprovação.
3. **Autorização de saque por TokenApp/SMS:** ativação só no painel; mais simples para começar.
- **Evidência a arquivar:** captura de tela do painel com data/hora e conta, e e-mail de confirmação do Asaas, se houver.

## P4 — Logs, backups e continuidade
| Item | Situação | Quem garante |
|---|---|---|
| Retenção de logs | Política proposta: auditoria e eventos de segurança mantidos por 5 anos; avisos de webhook por 5 anos. Não há exclusão automática hoje (verificado). | Sistema |
| Proteção contra alteração | Usuários comuns não alteram nem apagam logs (escrita só pelo servidor). O administrador do banco ainda poderia; proteção total depende de cópia externa. | Parcial |
| Backup | Cópia automática diária do banco, guardada por cerca de 14 dias. **Arquivos enviados (documentos, contratos, logos) não entram na cópia.** | Hospedagem (não verificado por mim) |
| Restauração | Restaurar volta o banco inteiro ao dia da cópia e apaga o que veio depois. Teste seguro: exportar o banco e restaurar num projeto separado. **Nunca testado.** | Wiize |
| Objetivos | Proposta: perda máxima de dados (RPO) 24 h; tempo de volta (RTO) 4 h. Dados do Asaas são a fonte final de cobranças e saldos e permitem reconciliar. | Wiize |
| Continuidade | Se a plataforma cair: o Asaas continua recebendo e notificando; ao voltar, os avisos pendentes são reprocessados sem duplicar (idempotência). Comunicar clientes e o Asaas se passar de 4 h. | Wiize |
| Vulnerabilidades | Mensal: analisador de segurança do banco + verificação de dependências; críticas em até 48 h, altas em 7 dias, demais em 30; registrar em `docs/`. Críticas/altas que afetem o Asaas: comunicar (Anexo I 9.4). | Wiize |
| Escalonamento | Responsável: Caio Ornelas. **Substituto: pendente.** | Wiize |

## P5 — Indicadores mensais (cláusula 11) — documentado, não implementado
Período: mês civil (dia 1 a último dia, horário de Brasília). Revisão: até o 5º dia útil do mês seguinte; enviar ao Asaas se solicitado.
| Indicador | Fórmula | Fonte | Situação |
|---|---|---|---|
| Reclamações procedentes | procedentes ÷ total de reclamações financeiras no mês | Registro de reclamações | **Não existe registro no sistema**; até existir, usar planilha com data, canal, cliente (sem dados sensíveis), assunto, procedente sim/não, data de resposta |
| Prazo médio de resposta | média (resposta − recebimento) em horas úteis | Mesmo registro | Idem |
| Disponibilidade | (minutos do mês − minutos fora do ar) ÷ minutos do mês | Monitor externo | **Não há monitor**; contratar um serviço de verificação a cada minuto |
Sem esses registros, nenhum número deve ser apresentado como definitivo.

## P6 — Conciliação das 7 cobranças
Ids completos ficam só no banco (consulta administrativa); aqui aparece só o início.
| Início do id | Situação local | Ação manual sugerida |
|---|---|---|
| c12213b1 | paga | Conferir no Asaas da conta original se foi recebida |
| 7e5caecd | paga | Idem |
| ab281b15 | paga | Idem |
| 0b536776 | cancelada | Conferir cancelamento no Asaas |
| 9f1894fa | cancelada | Idem |
| 22962e4e | cancelada | Idem |
| 9d79238f | aguardando pagamento | Decidir se cancela no Asaas (não cancelado automaticamente) |
A conexão Asaas original foi removida; o vínculo só pode ser restaurado com confirmação de qual conta a emitiu.

## Lista pré-produção
- [ ] Testes de isolamento executados e aprovados em homologação
- [ ] Ambiente de homologação separado criado
- [ ] Mecanismo adicional de segurança Asaas ativado + evidência arquivada
- [ ] Teste de restauração feito e registrado
- [ ] Substituto de incidentes definido
- [ ] Registro de reclamações e monitor de disponibilidade ativos
- [ ] 7 cobranças conciliadas
- [ ] Dados oficiais da empresa (razão social, CNPJ, encarregado LGPD) publicados
- [ ] **Asaas (pendente, independente de testes):** aprovação formal da marca e selos (cl. 3)
- [ ] **Asaas (pendente):** subcontas e API externa vs. vedação a revenda (cl. 4)
- [ ] **Asaas (pendente):** split em coproduções (cl. 6.4)
- [ ] Checklist de segurança do Asaas (cl. 9.2) recebido e respondido
