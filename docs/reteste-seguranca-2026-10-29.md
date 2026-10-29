# WiizePay — auditoria de reteste de segurança

Data: 29/10/2026. Escopo: roteiro de 15 seções enviado pelo usuário.

## 1. Resultado geral

**NÃO APROVADA para liberação com garantia equivalente à de um banco.** Há falhas altas reproduzidas e outras cadeias de risco identificadas. Não foi demonstrado isolamento completo com duas sessões reais, nem funcionamento operacional de backups/restauração e alertas. Não houve evidência coletada de exploração histórica; a auditoria não procurou dados pessoais de outras contas.

Esta etapa não alterou banco compartilhado, permissões, secrets, código de negócio ou produção. Foram adicionados testes de diagnóstico e documentação. As migrations 0053–0056 foram aplicadas na etapa anterior de assinaturas, não neste reteste. Nenhum pagamento, saque, transferência, cadastro real, envio de e-mail ou chamada autenticada a provedor foi executado aqui.

## 2. Evidências executadas

| ID | Método | Resultado obtido | Alcance |
|---|---|---|---|
| E01 | `bunx vitest run`, removendo variáveis ISO do processo | 479 testes passaram; 22 ignorados; 65 arquivos passaram e 1 ignorado | Mistura testes unitários, análise estática e serviços simulados. Não comprova 479 operações reais |
| E02 | `bunx vitest run --config vitest.security.config.ts` | 23 testes passaram em 4 arquivos | Corpos originais dos handlers/serviços com dependências simuladas. Inclui testes que passam justamente por reproduzirem vulnerabilidades |
| E03 | `python3 scripts/security/run-accounting-fixture.py` | Falhas antigas de split/antecipação reproduzidas; cinco grupos de candidato passaram | PostgreSQL real, esquema mínimo fictício, socket privado, TCP desligado, ambiente sem credenciais compartilhadas; desligado após teste |
| E04 | `python3 scripts/security/contract-confirmation-fixture.py` | Código errado, dados alterados, expiração, repetição, duas conclusões simultâneas, imutabilidade e grants testados | SQL das migrations 0053–0056 em esquema mínimo; não executa autenticação real ou Drive |
| E05 | Consultas de catálogo somente leitura | 145 tabelas públicas, todas com RLS; 20 sem policies; 5 buckets privados; MFA restritiva nas políticas examinadas | Configuração atual, não teste A/B. Grants efetivos de tabela/coluna e EXECUTE consultados |
| E06 | `npm audit --package-lock-only --json` | 9 avisos: 4 altos, 5 moderados, zero críticos | Advisories de dependências; não demonstra exploração ou alcance de produção |
| E07 | Revisão adversarial de código e relatórios | Cadeias de alteração de destinatário/PDF, senha, versões e limites identificadas | Análise estática com reproduções específicas E02; restante explicitamente não executado |
| E08 | Registro automático disponível | `build OK` após os testes adicionados | Compilação, não homologação financeira |

Logs desta execução: `/tmp/wiize-retest/regressions-final.log`, `handlers-final.log`, `accounting.log`, `confirmation.log`, `dependencies.json`. São evidências temporárias locais, sem segredos intencionalmente registrados. Os resultados essenciais estão transcritos neste relatório; os testes ficam no projeto para repetição.

## 3. Vulnerabilidades e retestes individuais

### F01 — ALTO: split parcialmente estornado libera valor excessivo

- Teste: split original R$ 100, estorno R$ 40, pendente total R$ 260.
- Esperado: R$ 60 disponíveis e R$ 200 pendentes não relacionados preservados.
- Obtido: R$ 100 disponíveis e R$ 160 pendentes com a definição anterior. Repetição não duplicou a liberação.
- Evidência: E03, `scripts/security/accounting-baseline.py:27–43`, `drizzle/migrations/0013_coproductions.sql:137–146`. A definição ativa foi consultada neste reteste.
- Classificação: **REPROVADO — VULNERABILIDADE IDENTIFICADA**, reprodução SQL isolada. Não aumenta necessariamente o total do saldo: antecipa indevidamente a disponibilidade de outros recursos.
- Candidato em `docs/migrations-pendentes/accounting-release-candidate.sql` corrigiu o exemplo mínimo, mas não está aplicado nem pronto para implantação.

### F02 — ALTO: antecipação não preserva reserva de estorno

- Teste: líquido R$ 100, reserva R$ 40, taxa R$ 5, pendente R$ 260.
- Esperado: não liberar valor comprometido por estorno; preservar reserva ou bloquear até conciliação.
- Obtido: R$ 95 disponíveis, R$ 160 pendentes, sem preservar a reserva. Repetições não duplicaram taxa nesse exemplo.
- Evidência: E03; definição ativa de `apply_anticipation_event`; `src/lib/anticipation.server.ts:38–59`.
- Classificação: **REPROVADO**, SQL isolado. Concorrência entre admissão de estorno/antecipação e aceite do provedor não foi testada.
- Candidato bloqueia esse exemplo, mas faltam admissão transacional comum, ordem de locks e reconciliação de confirmação externa incompatível.

### F03 — ALTO: arquivo parcialmente assinado pode ser substituído

- Teste: handler original de anexação com contrato `awaiting_customer`, armazenamento simulado e erro de atualização do hash equivalente à proteção de versão assinada.
- Esperado: negar substituição depois de qualquer assinatura e não reportar sucesso se o hash não puder ser atualizado.
- Obtido: substituição simulada ocorreu antes da atualização; erro do hash foi ignorado; handler retornou sucesso. Controle positivo: contrato completamente `signed` recusou substituição.
- Evidência: E02, `src/lib/contract-file-retest.security-check.ts`; `src/lib/contract-docs.functions.ts:60–87`; `src/lib/contract-docs.server.ts:379–394,516–524`.
- Classificação: **REPROVADO** para o comportamento do handler simulado. PDF real/Drive não executados. A composição de novo arquivo com evidências do hash anterior é uma cadeia de risco identificada em código, não um PDF final produzido nesta auditoria.
- Recomendação: origem da versão imutável após qualquer assinatura; bloqueio/reserva antes de efeitos em Drive; erros verificados; bytes conferidos com hash comprometido.

### F04 — ALTO: checkout irmão pode mudar o destinatário do código

- Cenário analisado: dois links para o mesmo cliente; apenas um contém contrato. O outro pode atualizar o e-mail compartilhado; a emissão de código consulta esse novo e-mail.
- Esperado: identidade/destinatário do contrato não serem redefinidos por outro link público.
- Obtido por leitura: proteção de e-mail existe apenas quando o link usado em `updateCheckoutCustomer` contém `contract_id`; o registro compartilhado continua mutável pelo link irmão.
- Evidência: `src/lib/checkout.functions.ts:433–463`; `src/lib/contract-signing.server.ts:38–62`; migration 0054 valida o destinatário atual, não um destinatário independente congelado no contrato.
- Classificação: **REPROVADO por cadeia identificada em código; reprodução integrada NÃO TESTADA**. Exige posse dos dois links e documento exigido na assinatura; não é acesso arbitrário por ID.
- Recomendação: vincular destinatário ao contrato e autorizar separadamente mudanças de e-mail, cobrindo todos os caminhos que atualizam o cliente.

### F05 — MÉDIO: erro na consulta permite seguir para sobrescrever senha financeira

- Teste: handler original, sessão/middleware simulados, consulta de credencial com erro e `data:null`; gravação simulada posterior bem-sucedida.
- Esperado: falhar fechado sem escrever nem dispensar senha atual.
- Obtido: nenhum check de senha atual; uma chamada a upsert e resposta `{ok:true}`. Controle positivo: credencial encontrada sem senha atual recusou a troca.
- Evidência: E02, `src/lib/password-retest.security-check.ts`; `src/lib/security.functions.ts:47–90`.
- Classificação: **REPROVADO** no handler com dependências simuladas. Não é tomada de conta sem login: entrada exige MFA; nenhuma senha real foi alterada.
- Concorrência desse handler foi tentada no harness, mas falhou de forma inconclusiva e NÃO foi utilizada como prova; o teste descartado não integra os 23 resultados finais.
- Recomendação: criação se ausente e alteração por hash esperado em operação atômica; checar erros e política compartilhada de bloqueio.

### F06 — MÉDIO/ALTO conforme impacto: escritas diretas em contratos/gestão

- Catálogo: owner/admin/finance com MFA possuem políticas de atualização em contratos e gestão financeira; escopo de papel não equivale a permissão granular. `contracts_update` não exige que novo status/current_version respeitem conclusão ou progressão.
- Esperado: conclusão e mudanças sensíveis somente pelo caminho autorizado e auditado.
- Obtido: caminho SQL direto continua permitido pela combinação de grants/policies observada. Triggers congelam tenant/cliente e evidências, mas não todas as transições de status/current_version.
- Evidência: E05; `drizzle/migrations/0056_contract_signature_rpc_only.sql`; `src/lib/contracts.functions.ts:239–265`.
- Classificação: **PARCIALMENTE APROVADO — validação prática incompleta** para o conjunto; gap de autorização identificado por catálogo/código. Não executei alteração direta autenticada. Marcar contrato `signed` não cria assinatura nem basta para liberar checkout.
- Atualização atrasada após cancelamento e ponteiro de versão antigo são riscos de revisão; concorrência integrada não executada. Não revogar permissões indiscriminadamente sem migrar escritores legítimos.

### F07 — MÉDIO: proteção de destino de webhook baseada só no hostname

- Esperado: URL cadastrada não permitir acesso a destinos privados por resolução DNS.
- Obtido por código: rejeita IP literal/localhost/sufixos internos, mas hostname HTTPS arbitrário é aceito; entrega usa `fetch` sem validação do endereço resolvido.
- Evidência: `src/lib/ext-webhooks.functions.ts:23–31`; `src/lib/ext-webhooks.server.ts:61–77`.
- Classificação: **PARCIALMENTE APROVADO**; defesa incompleta identificada, exploração DNS/TLS/egress NÃO TESTADA. Cadastro exige papel privilegiado e senha financeira.

### F08 — MÉDIO: limite de API começa depois da autenticação

- Esperado: conter também tentativas inválidas antes de amplificar consultas/logs.
- Obtido por código: chave inválida não passa pelo limiter de integração; lookup/log podem acontecer antes dele. Limite agregado por empresa e controles externos não comprovados.
- Evidência: `src/lib/ext-auth.server.ts:7–26`, `src/lib/ext-api.server.ts:30–60`.
- Classificação: **PARCIALMENTE APROVADO**; risco de abuso não reproduzido por carga, conforme proibição de DoS.

### F09 — BAIXO: marcação de avisos sem MFA dentro da função privilegiada

- Esperado: acesso interno exigir MFA mesmo via RPC direta.
- Obtido: `mark_notifications_read` confere membro ativo, mas não AAL2; EXECUTE authenticated confirmado. Não cria saldo nem permite escrever avisos de outra empresa pela lógica examinada.
- Evidência: definição ativa e `drizzle/migrations/0000_notification_mark_read.sql`.
- Classificação: **PARCIALMENTE APROVADO**; bypass de requisito por análise de função, chamada autenticada NÃO TESTADA.

### F10 — dependências e logging

E06: altos em `launch-editor`, `vite`, `xlsx`, `zod`; moderados em cadeia `drizzle-kit`/`esbuild` e `seroval`. Alcance deve ser avaliado por versão/caminho; ferramenta de desenvolvimento vulnerável não equivale automaticamente a endpoint de produção explorável. `xlsx` sem correção indicada pelo audit; upgrade Zod exige compatibilidade. Não rodei `audit fix`.

`src/lib/email.server.ts:78–88` ainda pode armazenar trecho de resposta/mensagem de erro fora da confirmação de contrato. **Potencial exposição, não segredo encontrado**. Nascimento/códigos/senha têm sanitização testada; nascimento é criptografado, mas aparece no certificado privado acessível por capacidade autorizada. Isso precisa constar na política de acesso ao contrato.

## 4. Matriz do roteiro enviado

| Seção | Esperado | Método/obtido | Classificação global do tópico |
|---|---|---|---|
| 1 RLS/isolamento | A nunca lê/escreve B; próprio recurso funciona | E05: 145/145 RLS; financeiro central sem escrita ordinary; 22 A/B ignorados. Storage privado e políticas lidas, sem objetos reais | **PARCIALMENTE APROVADO**; A/B completo **NÃO TESTADO** |
| 2 Privilégios | Usuário não se promove nem altera saldo | E05: roles/saldos/RPCs financeiros examinados restritos; coluna de membro pode ter grant, mas sem policy permissiva de escrita. F06 | **PARCIALMENTE APROVADO** |
| 3 Senha financeira | Toda operação crítica validada, lifecycle seguro | E01/E02 e revisão; F05 reproduzido; operações completas não executadas | **REPROVADO** |
| 4 Auth/sessões/MFA | Sem bypass, revogação/recuperação funcionam | Testes de regras/helpers e catálogo; F09. Sem sessões reais isoladas para logout/revogação/troca de contato | **PARCIALMENTE APROVADO** |
| 5 Segredos | Nenhuma credencial privilegiada no navegador/respostas | Testes estáticos e revisão de imports; nenhum valor de segredo procurado/imprimido; bundle final indisponível, não gerado | **PARCIALMENTE APROVADO**, bundle **NÃO TESTADO** |
| 6 APIs/manipulação | IDs/valores/destinos validados no servidor | E01/E02 com mocks, escopos e reservas; F04/F06–F08 | **REPROVADO** nas cadeias identificadas; cobertura integrada incompleta |
| 7 Saques/financeiro | Sem liberação indevida ou duplicação | E03 reproduz F01/F02; idempotência desses exemplos passou; saques concorrentes completos ausentes | **REPROVADO** |
| 8 Webhooks Asaas | Autenticação, tenant, repetição e ordem seguros | E01/E02 para helpers/eventos em dinheiro; revisão de token/header e IDs persistentes; sem webhook real isolado | **PARCIALMENTE APROVADO** |
| 9 Limites/CAPTCHA/risco | Tokens falsos/reusados recusados server-side | Testes Turnstile com respostas simuladas, regras/IP/HMAC/RPC examinados; F08; Siteverify real não chamado | **PARCIALMENTE APROVADO** |
| 10 Logs/alertas | Imutáveis, completos, sem segredos; destino recebe | Catálogo audit sem escrita ordinary; sanitização unitária. Imutabilidade assinatura E04. Alertas/e-mail operacional sem teste | **PARCIALMENTE APROVADO** |
| 11 Backups | Snapshots/restauração/arquivos comprovados | Documentação apenas; inventário de backups indisponível e nenhum restore | **NÃO VERIFICÁVEL**; restore **NÃO TESTADO** |
| 12 Segurança geral | Dependências, headers, uploads, CORS/CSRF seguros | E06/F10; testes de headers e revisão middleware; sem cabeçalhos publicados/pentest/upload autenticado integrado | **REPROVADO** por advisories não tratados, exploração não comprovada |
| 13 Regressão | Fluxos reais continuam funcionais | E01 passou, E02 diagnósticos; código antigo incompatível com novas exigências de assinatura. Não executei login/checkout/PDF reais | **PARCIALMENTE APROVADO** |
| 14 Relatório | Resultados e provas honestos por teste | Este documento e testes/arquivos relacionados | Entregue, sem aprovação artificial |
| 15 Aprovação final | Sem alto/crítico; isolamento/restore comprovados | F01–F04 e bloqueios permanecem | **REPROVADO / APROVAÇÃO NÃO CONCEDIDA** |

## 5. Assinatura com nascimento e código: conclusão específica

### Referências oficiais Asaas verificadas

- [Criação de webhook](https://docs.asaas.com/docs/create-new-webhook-via-api): `authToken` configurado é enviado no header `asaas-access-token`. Comparação em tempo constante é medida da aplicação, não requisito específico citado pela Asaas.
- [FAQ de webhooks](https://docs.asaas.com/docs/webhooks-faq): entrega pode repetir eventos com o mesmo ID; falhas geram novas tentativas e a fila pode ser interrompida. Ordem depende de envio sequencial ou não sequencial.
- [Recepção de eventos](https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint): identificar redelivery pelo ID e implementar idempotência. A leitura da documentação não comprova configuração da conta nem comportamento publicado.

E04 comprovou em SQL isolado uma única assinatura/consumo diante de duas conclusões simultâneas, recusa de código errado/dados alterados/vencimento/replay, imutabilidade e privilégios privados. E02 comprovou bloqueios básicos com dependências simuladas. **Isso não basta para declarar o sistema inteiro correto:** F03 e F04 atingem os caminhos ao redor da confirmação. Entrega de e-mail, senha financeira/MFA reais, PDF e quatro telas em contrato válido ainda não foram homologados. Código por e-mail prova acesso à caixa postal; nascimento é declarado, não consulta oficial de identidade.

## 6. Comparação e implantação

- Antes: 144 tabelas/19 sem policies; agora: 145/20 devido à tabela privada de desafios. Não é nova exposição.
- Antes: 470 regressões e 22 ignorados; nesta execução: 479 e 22. Contagens diferentes não representam sozinhas cobertura maior de operações reais.
- Ponte pública de contrato estrangeiro e dinheiro externo: barreiras do aplicativo retestadas com mocks, não homologação publicada.
- Split/antecipação: falhas reproduzidas de novo e definições ativas ainda anteriores; candidato continua fora do histórico.
- Assinaturas: mais barreiras atômicas, mas risco em PDF/destinatário identificado. O banco compartilhado já exige novas evidências; código antigo publicado não conclui novas assinaturas. Não publiquei para solucionar isso automaticamente.

## 7. Ambiente completo e configurações externas

As migrations dependem de autenticação, armazenamento e funções gerenciadas. O cluster mínimo local não oferece serviço real de login, AAL1/AAL2, API de arquivos, sessões revogáveis ou Drive. Não existe nesta execução uma instância separada comprovadamente configurada com esses serviços e duas empresas fictícias. Criar A/B no banco conectado compartilhado violaria o plano. Não exportei dados/contas reais nem fiz clone com segredos de produção.

Documentação Lovable Cloud: backup diário de banco, cerca de 14 dias, sem arquivos dos buckets; recuperação por snapshots, não PITR. **Não vi inventário real de snapshots**; frequência/retensão efetivas, proteção e restauração deste projeto NÃO VERIFICÁVEIS aqui. Evidência vem de More → Database → Manage → Backups. Restore nesta tela altera o mesmo banco: não o execute para homologação isolada. Vercel, Auth, Asaas, Cloudflare, Resend, Drive e destinos de alerta não tiveram configurações de produção modificadas ou funcionamento certificado.

## 8. Prioridades

1. Corrigir e testar F01/F02 com admissão/reservas comuns e esquema completo antes de aplicar SQL financeiro.
2. Corrigir F03/F04 antes de declarar assinatura com confirmação segura; testes de PDF/Drive e links irmãos são obrigatórios.
3. Corrigir lifecycle da senha (F05) e centralizar transições de contrato/permissões granulares (F06).
4. Avaliar egress dos webhooks, limites pré-autenticação, MFA de avisos, logging e dependências.
5. Preparar instância totalmente isolada com usuários A/B/MFA, arquivos e provedores simulados/contas de teste separadas; executar todos os fluxos e controles positivos por recurso.
6. Confirmar backups reais e recuperação isolada, alertas, configurações publicadas e pentest especializado externo.

Nenhuma recomendação acima é autorização para aplicar migrations ou modificar produção. Este é um reteste assistido, não auditoria independente certificada.