# WiizePay — resposta a incidentes e recuperação

Procedimento operacional proposto; responsáveis nominais, contatos e prazos contratuais devem ser definidos pela empresa. Não pressupõe alertas, backups ou bloqueios já habilitados. Não cria suspensão global automática.

## Regras comuns
1. Registrar UTC, recurso, conta afetada, correlação e resultado; preservar logs íntegros com acesso restrito. Não exportar senhas, cartões, tokens ou documentos sem necessidade.
2. Responsável técnico coordena contenção; responsável financeiro reconcilia Asaas; responsável de privacidade/jurídico avalia comunicações. Registrar decisões e alcance.
3. Conter somente a conta, chave, integração ou operação afetada. Usar controles existentes e confirmados; não afirmar bloqueio no provedor sem confirmação dele.
4. Não apagar reservas, histórico, cobranças ou evidências para permitir retentativas. Não editar saldo manualmente.
5. Comunicar titulares, parceiros e autoridades conforme avaliação jurídica e prazo legal/contratual aplicável; não há prazo universal validado neste documento.
6. Retomar após correção, regressão negativa e positiva, conciliação e aprovação do responsável. Revisar causa raiz e alcance.

## Cenários
| Cenário | Detecção / contenção | Recuperação / validação |
|---|---|---|
| Conta comprometida | Correlacionar logins, falhas MFA e alterações; revogar sessões da conta e suspender vínculo afetado pelos caminhos autorizados; preservar evidências | Recuperar identidade por fluxo existente, redefinir credenciais e fatores conforme autorização; conferir sessões antigas recusadas e permissões originais |
| Chave/API/segredo vazado | Identificar qual segredo e ambientes; revogar chave de cliente ou coordenar rotação externa com proprietário; não imprimir valor | Distribuir novo segredo por canal seguro, atualizar emissor e consumidor com janela acordada; validar nova chave e rejeição da antiga, sem quebrar integrações silenciosamente |
| Movimentação indevida | Conferir ledger e transação oficial; conter operação/conta específica via controles autorizados e contatar Asaas quando necessário | Conciliar pela conta original; nenhuma declaração local de pago/estornado/transferido substitui confirmação oficial; validação financeira independente |
| Acesso a dados | Preservar evidências de objeto/ator/horário, revogar sessão/chave afetada, fechar o caminho exato após avaliação | Testar usuário permitido, outro tenant e role restrita; avaliar titulares afetados e obrigações jurídicas; não divulgar dados no relatório |
| Webhook falso/falho | Verificar rejeições, token configurado e fila oficial; conter origem afetada, sem descartar eventos legítimos | Corrigir autenticação/configuração, reenviar pela ferramenta oficial e validar deduplicação/ordem; nunca reenviar payload financeiro inventado à produção |
| Serviço externo indisponível | Identificar fornecedor e falhas; preservar reservas e não repetir criação incerta | Conferir objeto oficialmente por referência original, retomar fila de forma idempotente; alertas e agendamentos devem ter entrega comprovada |
| Corrupção/restauração | Conter escrita afetada com decisão humana, registrar estado e preservar export autorizado antes de qualquer rollback | Restaurar primeiro em ambiente separado; conferir esquema, usuários, ledger, relações, contratos e arquivos; produção só com aprovação e plano de indisponibilidade/perda |

## Backups e exercício isolado
Lovable Cloud documenta um backup diário de banco e retenção aproximada de 14 dias; snapshots deste projeto não foram lidos. Recuperação point-in-time não está disponível nesse fluxo; restauração usa snapshots diários. Nem backups nem export de banco incluem arquivos dos buckets, secrets ou configurações de provedores.

1. Abrir More → Database → Manage → Backups e registrar timestamp UTC real do snapshot escolhido.
2. Preservar estado atual pela opção de export em More → Database → Manage → Settings. Proteger export como dado sensível: inclui contas e hashes de senha.
3. Inventariar arquivos em More → Storage e preservar separadamente pelo processo autorizado da empresa; inventariar secrets sem registrar valores no relatório.
4. Preparar destino isolado e credenciais próprias; não apontar teste ao backend compartilhado nem cadastrar webhooks para produção.
5. Restaurar cópia no destino autorizado, reconfigurar autenticação/serviços e validar relação de registros, totais NUMERIC, origem Asaas, documentos e trilha de auditoria. Não produzir cobranças reais.
6. Medir tempo e perda possível com evidência; RPO/RTO são metas a aprovar, não garantias existentes.

Restaurar snapshot no projeto original perde dados posteriores e reverte esquema; pode deixar código incompatível e indisponível por minutos. Não é reversível por simples botão. Não executar neste projeto durante auditoria.