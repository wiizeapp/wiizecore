# Auditoria de segurança WiizePay

## Objetivo e limites
Investigar a aplicação real, corrigir falhas comprovadas e validar as correções sem alterar dinheiro, clientes ou produção para testar. Preservar login, MFA, senha financeira, checkout, Asaas e integrações. Não declarar prontidão enquanto houver riscos altos sem tratamento ou testes essenciais pendentes.

## Diagnóstico inicial já executado
- Consulta somente de leitura no backend conectado: **144 tabelas públicas, todas com RLS habilitado**. Isso não comprova que cada política ou permissão esteja correta; a revisão individual continua.
- Cinco locais de arquivos consultados estão privados: avatares, contestações, logos do checkout, contratos e documentos KYC. O isolamento entre empresas ainda exige testes.
- **125 testes existentes aprovados; 22 testes de isolamento ignorados por ausência das configurações de homologação**. Não serão contabilizados como aprovados. O teste existente precisa distinguir recusa legítima de erro de serviço para evitar falsos positivos.
- Verificação rápida não retornou novos achados ativos; isso não equivale a uma auditoria completa. Um verificador de infraestrutura foi omitido por ausência de conexão.
- Verificação de dependências identificou avisos altos envolvendo `xlsx`, `zod`, `js-yaml` e `source-map-js`, e moderados envolvendo `seroval`. São alertas de versões, ainda não provas de exploração dos fluxos da WiizePay. Não atualizar a versão principal de validação indiscriminadamente.
- Análise aprofundada iniciada, além de três revisões independentes de código: acessos/autenticação, pagamentos/integrações e isolamento/dados privados. Resultados ainda pendentes.
- Nenhuma configuração externa, saldo ou cobrança alterado. Compilação atual registrada como OK.

## Fases de execução
### A — Completar inventário e diagnóstico
Consolidar código, rotas, funções, permissões SQL, políticas por operação, triggers, arquivos privados e configurações acessíveis. Registrar evidências por arquivo/linha ou consulta, gravidade, pré-condições e diferença entre falha comprovada e informação não verificável. Conferir autenticação, recuperação, MFA, senha financeira, administração, chaves externas, webhooks, idempotência, CAPTCHA, limites e logs. Consultar documentação oficial Asaas para qualquer dúvida da integração.

### B — Priorizar e avaliar impacto
Tratar primeiro falhas críticas/altas comprovadas. Para cada mudança, indicar compatibilidade, teste de regressão e reversão. Mudanças de políticas no backend compartilhado ou novos limites financeiros exigem avaliação específica e aprovação antes de aplicação; não inventar valores. Configurações Vercel/Asaas/Cloudflare serão marcadas como não verificadas quando não houver acesso.

### C — Corrigir com alterações pequenas
Implementar correções seguras no código e dependências compatíveis, sem reconstruir controles corretos. Usar mudanças versionadas e aditivas no banco somente após a avaliação aprovada. Não rotacionar credenciais externas automaticamente. Manter regras financeiras, isolamento por empresa e confirmação do provedor.

### D — Validar
Executar testes de regressão por correção e testes de APIs/autorização. Preparar verificações de duas identidades fictícias em ambiente comprovadamente isolado, incluindo controle positivo de acesso próprio, leitura/escrita cruzada, documentos, privilégios e campos financeiros. Não rodar os testes de escrita existentes contra o backend compartilhado sem isolamento comprovado. Exercitar fluxos de navegador com acesso autorizado quando disponíveis, sem contornar MFA/onboarding ou modificar dados reais. Separar testes locais de homologação financeira real.

### E — Entregar evidências e pendências
Produzir relatório completo com situação inicial, achados, alterações, testes executados/falhos/não executados, configuração externa, riscos residuais, reversão e checklist. Criar procedimentos práticos de incidentes e recuperação. Backups diários descritos pela plataforma não comprovam snapshots deste projeto; inventário de backups e restauração isolada serão tratados como pendentes sem evidência. Arquivos de armazenamento não estão incluídos no backup de banco.

## Detalhes técnicos
- Preservar TanStack Start e os limites servidor/navegador; não criar Edge Functions novas.
- Revisar GRANT/REVOKE além de RLS, funções SECURITY DEFINER e projeções seguras; RLS habilitado sozinho não prova menor privilégio.
- Não imprimir valores de segredos nem dados pessoais em evidências; indicar categoria e localização apenas.
- Manter Decimal/NUMERIC, auditoria e idempotência existentes; nenhum webhook sintético será enviado à produção.
- Não publicar automaticamente. O resultado desta etapa é diagnóstico e plano de correções, não certificado de segurança ou pentest independente.