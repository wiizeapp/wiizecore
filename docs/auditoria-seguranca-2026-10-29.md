# WiizePay — auditoria de segurança e correções

Data: 29/10/2026. Etapa entregue: diagnóstico e correções locais verificáveis. **Não é liberação de produção nem pentest independente.** Análise aprofundada concluída sobre a versão anterior às alterações, com dois avisos: fórmulas em planilhas exportadas e destino livre para importação de logotipo. Ambos tratados nesta etapa; isso não substitui nova análise do código atualizado.

## Resumo executivo
Foram encontrados problemas comprovados no código de recuperação MFA, delegação de permissões, sequência obrigatória de checkout, persistência de resultados financeiros e idempotência externa. Foram corrigidos sem executar pagamentos, alterar clientes/saldos, aplicar migrações ou publicar. A revisão do banco conectado confirmou RLS nas 144 tabelas públicas e cinco buckets privados; também confirmou exceções de acesso direto que precisam de correção avaliada separadamente. **RLS habilitado não equivale a permissões corretas.**

Nenhuma vulnerabilidade crítica foi comprovada nesta etapa; há riscos altos ainda pendentes. A revisão não foi exaustiva em todos os fluxos: saques, antecipação, recuperação de senha financeira, upload e transições concorrentes de webhook ainda precisam de testes integrados. Não afirmar ausência de outras falhas.

## Inventário e evidências acessíveis
- React/TanStack Start; funções internas em `src/lib/*.functions.ts`, lógica privilegiada em módulos de servidor, APIs externas em `src/routes/api/public`.
- Entradas públicas inventariadas: checkout externo, consultas de cobranças/clientes/serviços/assinaturas, cancelamento, OAuth/callbacks, tarefas programadas, webhooks Asaas/ativação/Resend/Wiize e entrega de avisos.
- Catálogo real consultado: RLS, GRANT de leitura/escrita, políticas por operação e execução das funções SECURITY DEFINER. Funções financeiras consultadas sem EXECUTE para visitantes ou usuários comuns; exceções de autenticação/membership e marcar notificações exigem análise específica.
- Buckets `avatars`, `chargeback-documents`, `checkout-logos`, `contract-files`, `kyc-documents`: todos privados; limites de tamanho presentes. Não foi exercitado acesso cruzado a objetos.
- Nenhum cargo personalizado estrangeiro encontrado nas referências de membros/convites (consulta agregada: zero em ambos). Isso não elimina a falha de atribuição futura corrigida.
- Build automático registrado como OK após correções.
- Busca limitada em fontes não demonstrou segredo real exposto; literais de teste não foram classificados como vazamento. Histórico completo, bundles publicados, credenciais Vercel, logs externos e configurações reais de Auth não foram verificados. Nenhum segredo foi impresso.

## Achados e tratamento
| Gravidade | Evidência | Tratamento e estado |
|---|---|---|
| ALTA | `team.functions.ts` aceitava cargo estrangeiro e nível base com permissões superiores ao concedente; `member-access.server.ts` somava cargo sem conferir empresa | Cargo local + subconjunto de permissões base/personalizadas; consultas ignoram cargo estrangeiro legado. **CORRIGIDO E TESTADO** em regras locais; convite/alteração completos com sessões A/B ainda não exercitados. Constraint composta de banco não aplicada. |
| MÉDIA | `recoverWithCode` consumia código sem condicionar `used_at` nem confirmar resultado | Todas as três entradas de código reserva usam `claimRecoveryCode` antes de efeitos privilegiados. **CORRIGIDO E TESTADO** com concorrência simulada e erro de gravação. Corrida real entre endpoints e retirada de fatores não testadas. |
| ALTA | `getPaymentInstructions`, cartão, troca e cupons não exigiam confirmação/assinatura; `getCheckout` retornava URLs pagáveis antecipadamente | Guard central de consentimento por empresa/grupo/cliente e assinatura da versão/hash vigentes; URLs ocultas antes da liberação; assinatura exige confirmação anterior. Aceite explícito obrigatório no envio e gravação não é mais best-effort. **CORRIGIDO E TESTADO** nas regras com banco simulado; checkout integral autorizado pendente. |
| ALTA | `charges-core.server.ts` apagava placeholder em qualquer erro após envio Asaas; gravações ignoravam erros retornados | Placeholder/chave/referências preservados; retorno genérico de conferência; gravações essenciais exigem linha confirmada; replay verifica grupo/parcela/recorrência completos e relações originais. **CORRIGIDO, MAS NÃO TESTADO** de ponta a ponta com provedor. Guard de gravação e reserva externa têm testes locais; timeout Asaas aceito e falha tardia de parcela precisam de integração isolada. |
| MÉDIA | Checkout externo registrava hash após criação; conflitos de gravação e replay não passavam sempre pela reserva | `withIdempotency` antes dos efeitos de cliente/cobrança, hash de operação/corpo, 409 em conflito; erros/exceções mantêm reserva no checkout; sessão antiga consultada dentro do claim. **CORRIGIDO E TESTADO** em helper simulado; queda após inserir sessão ainda exige teste da rota inteira. |
| MÉDIA | CSP de produção não permitia origem do Turnstile | Script, conexão e frame permitem somente `https://challenges.cloudflare.com`. **CORRIGIDO E TESTADO** na política; desafio real publicado **PENDENTE DE CONFIGURAÇÃO EXTERNA**. |
| MÉDIA | Drive imprimia corpo de erro; webhook setup e erro global imprimiam exceções | Esses caminhos agora imprimem código constante/status, sem corpo/exceção. **CORRIGIDO, MAS NÃO TESTADO** com erros de provedores reais. Outros console paths não foram todos revisados. |
| MÉDIA | Testes de isolamento interpretavam qualquer erro como lista vazia | Apenas recusa explícita 42501 em 401/403 conta; erro de serviço/tabela/sessão invalida teste. Escritas exigem `ISO_ISOLATED_CONFIRMED=yes`. **CORRIGIDO E TESTADO** no parser; 22 cenários reais continuam ignorados. |
| MÉDIA | Análise aprofundada: `exportRows` exportava texto iniciado por fórmula sem neutralização | `safeSpreadsheetRows` protege textos nas três exportações, preservando números e totais internos. **CORRIGIDO E TESTADO** com prefixos =,+,-,@ e espaços/controles. Abrir o arquivo em Excel real não foi exercitado. |
| MÉDIA | Análise aprofundada: `importCheckoutLogo` buscava destino escolhido livremente pelo administrador | Allowlist exata `CHECKOUT_LOGO_ALLOWED_HOSTS`, sem credenciais/portas alternativas/IP/redirect; timeout e leitura limitada mesmo sem Content-Length. **CORRIGIDO E TESTADO** em regras e leitura simulada. **PENDENTE DE CONFIGURAÇÃO EXTERNA:** sem lista aprovada a importação por URL é recusada; upload de arquivo continua disponível. Aprovar somente hosts controlados/confiáveis, nunca domínios arbitrários com DNS mutável. |
| ALTA/MÉDIA | Scanner de dependências apontou versões vulneráveis | Atualizados lockfiles: seroval 1.7.3, js-yaml 4.3.2, source-map-js 1.2.2; Zod transitivo 4.6.7. Scanner deixou de apontar essas versões. **CORRIGIDO E TESTADO** por nova varredura e regressão; Zod direto 3.25.76 e XLSX 0.18.5 continuam pendentes. XLSX é usado para exportação, não leitura de planilhas neste inventário; isso não apaga o aviso. Migrar Zod principal exige revisão de compatibilidade; não atualizar cegamente. |
| ALTA | Banco real permite INSERT/UPDATE/DELETE em `contract_links` e `finance_accounts/cards/categories/entries` para authenticated; policies por role/membership | Acesso pode contornar validações/auditoria do servidor em registros internos e emissão de links. **NÃO IMPLEMENTADO, COM JUSTIFICATIVA:** revogar no backend compartilhado exige avaliação e aprovação específica; nenhum acesso cruzado ou saque externo foi demonstrado. |
| MÉDIA | Banco real: `service_checkout_links/versions` não têm policy restritiva MFA; SELECT de várias tabelas sensíveis usa membership sem módulo | **NÃO IMPLEMENTADO, COM JUSTIFICATIVA:** matriz de permissões precisa alinhar leitores reais antes de alteração compartilhada. Não confundir isolamento de empresa com autorização por módulo. |
| MÉDIA | Snapshots, entrega de alertas e restauração não consultáveis neste acesso | **NÃO VERIFICÁVEL COM O ACESSO DISPONÍVEL**. Documentação da plataforma descreve backup diário de banco, não comprova snapshots deste projeto; arquivos não incluídos. |

## Arquivos alterados
- Novos: `recovery-code.server.ts`, `team-role-policy.ts`, `checkout-readiness.server.ts`, `charge-save.server.ts`, `isolation-response.ts`, `security-regression.test.ts`, `isolation-response.test.ts`.
- Alterados: `mfa-recovery.functions.ts`, `member-access.server.ts`, `team.functions.ts`, `checkout.functions.ts`, `charges-core.server.ts`, `ext-idempotency.server.ts`, `security-headers.ts`, `security-headers.test.ts`, `google-drive.server.ts`, `webhook-setup.server.ts`, `tenant-isolation.live.test.ts`, `src/start.ts`.
- Rotas: `src/routes/pagar.$token.tsx`, `src/routes/api/public/v1/ext/checkout-sessions.ts`.
- Traduções EN/ES, `AGENTS.md`, `roadmap.md`, `bun.lock`, `package-lock.json`; relatório e plano de auditoria.
- Análise aprofundada: `spreadsheet-safety.ts`, `logo-import-policy.ts`, `export-logo-security.test.ts`, `checkout-appearance.functions.ts`, `src/components/admin/admin-finance.tsx` e rotas `extrato.tsx`/`recebiveis.tsx`.
- **Nenhuma migração nova aplicada.** Nenhuma configuração Asaas/Cloudflare/Vercel alterada nesta auditoria. O ambiente Asaas efetivamente ativo não foi reconfirmado; não presumir isolamento por ser Sandbox.

## Testes e limites da evidência
1. Base inicial: 125 aprovados / 22 ignorados.
2. Primeira seleção após correções: 90 aprovados.
3. Bateria completa intermediária: 458 aprovados / 22 ignorados, em 63 arquivos aprovados e um ignorado. A última revisão ampliou os testes; resultado final deve ser lido no resumo de execução entregue.
4. Navegador local: `/auth` carregou, dois campos, zero erros JS. Captura mostra página de login; não prova login bem-sucedido.
5. POST `{}` sem autenticação para Asaas, taxa de ativação e Resend: **401 nos três endpoints**, sem segredo ou evento financeiro falso. Isso valida rejeição, não entrega autenticada/idempotência/ordenação completas.
6. Build automático OK. Testes de MFA/Admin autenticado, convites A/B, pagamento, saque, estorno, concorrência de ledger e documentos privados **não executados** com sessões reais.
7. Segredos nunca usados para testes ofensivos; nenhuma credencial rotacionada. Nenhum pagamento ou dado real alterado.
8. Última revisão antes dos achados aprofundados: 463 aprovados / 22 ignorados. Resultado após os testes de exportação/importação é registrado abaixo na conclusão.

## Próxima mudança de banco — avaliação antes de aplicar
Proposta: revogar somente escrita direta de authenticated/anon nos seis recursos acima, manter leitura legítima e service_role, preservar APIs/RPCs existentes; verificar se algum leitor/escritor do navegador depende de acesso direto. Em seguida adicionar MFA restritivo nas tabelas novas e alinhar leitura por módulo. Constraint composta de cargo deve abranger membros e convites após conferência dos dados.

Antes de aplicar: inventário de leitores por tabela, snapshot/export confirmado, cópia isolada, controle positivo e negativo por role/MFA e scripts exatos de reversão dos GRANT/policies atuais. **Não aplicar revogação genérica sem esses passos.**

## Pendências externas e prontidão
- Confirmar Vercel com fonte/lockfiles atualizados, hostnames Turnstile e secrets por ambiente; não enviar valores pelo chat.
- Conferir se a hospedagem sobrescreve o header escolhido em `TRUSTED_CLIENT_IP_HEADERS`; teste deve provar que um header do visitante não muda `remoteIp`.
- Confirmar Auth hospedado: confirmação e-mail, MFA, limites nativos, recuperação/revogação; código não prova configuração ativa.
- Conferir webhooks Asaas por conexão, autenticação, fila/reenvio, ordenação e conciliação; documentação oficial: https://docs.asaas.com/docs/how-to-implement-idempotence-in-webhooks e https://docs.asaas.com/docs/send-types.
- Criar/autorizar homologação comprovadamente isolada com dois usuários A/B e dados sintéticos para testes SQL/API/storage. Os nomes A/B nos testes locais não representam sessões reais.
- Verificar efetiva entrega de alertas à empresa; registros no banco não provam monitoramento ativo.
- Backups: conferir snapshots em More → Database → Manage → Backups; inventário inacessível por ferramenta. Arquivos precisam de preservação separada. Não restaurar sobre produção.
- Resolver riscos altos de dependências e acesso direto antes de recomendar liberação. 3DS real Asaas permanece separado, exige conta habilitada e autorização de teste.

## Reversão das correções locais
Não houve mudança de esquema nesta etapa. Para regressão funcional, recuperar a versão anterior dos arquivos afetados e lockfiles pelo histórico do projeto, em ambiente de teste; **não remover as barreiras silenciosamente em produção**. Corrigir compatibilidade mantendo as proteções e validar novamente antes de publicar.

Reservas de criação incerta não devem ser apagadas para destravar. Buscar oficialmente cobrança/assinatura pela conta original e referência externa, comparar valor/cliente e registrar resultado antes de liberar continuação. O processo automático de reconstrução completa de grupos não foi implementado nesta etapa; intervenção especializada ainda necessária. Não concluir que timeout significa falha externa.

## Checklist de liberação
- [x] Correções locais e testes não destrutivos; erros anônimos recusados.
- [x] Inventário real básico de RLS/GRANT/buckets.
- [ ] Corrigir e testar acessos diretos com matriz de permissões aprovada.
- [ ] Eliminar avisos altos residuais de dependências ou demonstrar tratamento aceitável por revisão especializada.
- [ ] Testar A/B reais, storage, MFA/Admin e jornadas financeiras isoladas.
- [ ] Testar timeout aceito, salvamento parcial, repetição e ordenação com integração isolada.
- [ ] Confirmar configurações de hospedagem, Auth, Asaas, CAPTCHA, alertas e backups.
- [x] Concluir análise aprofundada e tratar os dois avisos encontrados; nova análise pós-alteração ainda não executada.
- [ ] Restauração isolada e pentest independente quando exigido.

**Resultado: não pronta para liberação certificada; riscos altos e testes essenciais pendentes.**

Conclusão da execução: **470 testes aprovados, 22 ignorados, 64 arquivos de teste aprovados e um ignorado**. Zero falhas nos testes executados. O erro de tipagem na exportação vazia foi corrigido após essa rodada e rechecado pelo build automático. Os dois avisos aprofundados foram tratados no código; não há homologação de produção nesta evidência.