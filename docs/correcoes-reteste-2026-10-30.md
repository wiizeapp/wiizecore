# Correções do reteste — 30/10/2026

## Conclusão

Entrega parcial. **Não aprovado como segurança bancária nem 100% seguro.** Nenhuma migration desta etapa foi aplicada ao banco conectado; nenhum saldo histórico, secret, pagamento real ou publicação foi alterado. As falhas de liberação de saldo F01/F02 continuam no banco conectado. O candidato SQL não deve ser aplicado sem os gates abaixo.

## Implementado no aplicativo

- Senha financeira: erro de leitura recusa alteração; mudança valida a senha atual pelo contador comum, atualiza somente o hash esperado; primeira configuração insere, sem sobrescrever uma configuração concorrente.
- MFA: o helper legado exige AAL2, inclusive quando nenhum fator é encontrado. Não substitui verificação autenticada integrada.
- Checkout: links públicos não mudam o e-mail cadastrado do cliente, inclusive sem contrato; atualização compara com o e-mail anterior. Clientes sem e-mail cadastrado precisam de correção pelo caminho autenticado.
- Contratos: assinaturas existentes bloqueiam substituição antes do envio, objetos Drive não são sobrescritos, downloads de PDF original/assinado verificam hash; erro de atualização de hash não é ignorado. Publicação do apontador ainda não é atômica com a assinatura: F03 não está encerrado.
- Versão de contrato: atualização compara empresa, versão e estado anterior; falta transação que inclua a criação da versão, sem órfãos.
- Estorno: exceção/timeout não significa recusa e não libera reserva; resposta síncrona REFUNDED não conclui saldo. Confirmação permanece no aviso oficial. Falha de persistência exige reconciliação.
- Antecipação: exceção não marca failed nem desbloqueia pagamento. Admissão durável/transacional e reconciliação de submissões desconhecidas ainda faltam.
- API: limite compartilhado antes da autenticação, limites por integração/empresa, falhas padronizadas/registradas; IP confiável ausente recusa com 503. A hospedagem deve fornecer cabeçalho confiável, sobrescrito na borda.
- E-mail: falhas persistidas contêm somente status/código, sem corpo de resposta ou exceção externa.
- Webhooks externos: criação e cada entrega exigem host exato em `EXT_WEBHOOK_ALLOWED_HOSTS`; ausência bloqueia. Não foi configurado novo secret. **Entrega externa fica bloqueada sem a lista aprovada.** Apenas hosts sob controle do operador, com DNS público e controle de saída verificados; lista não prova proteção contra DNS rebinding de um host autorizado. Nenhum wildcard/domínio informado somente pelo cliente deve ser aprovado.
- Dependências: substituído parser XLSX por escrita apenas; Zod/Vite e dependências transitivas corrigíveis atualizados, `package.json`, `bun.lock` e `package-lock.json` alinhados. Auditoria npm: zero altos/críticos, quatro moderados da cadeia de ferramentas Drizzle/esbuild; não usar `audit fix --force` que recomenda downgrade incompatível.

## Evidências e limites

- Regressão local: **488 passaram, 22 integrados ignorados**.
- Handlers reais com autorização/provedor/armazenamento simulados: **33 passaram**; incluem senha, contrato parcial, e-mail estrangeiro, estorno/antecipação incertos, API sem IP e falha de limite. Não comprovam autenticação ou RLS real.
- Excel: download no navegador e leitura do arquivo confirmaram texto `=malicious()` como texto, valor numérico 60, total SUM e cabeçalho congelado.
- Fixture de contabilidade socket-only descartável: restante do split 60 após estorno 40, saldo não relacionado 200 preservado, replay sem duplicação, bloqueios de reserva/admissão e concorrência sintética. **Esquema mínimo**, não clone completo, não prova integração com provedor/RLS.
- Compilação automática OK. Não testados: sessões A/B completas, quatro assinaturas/e-mail/PDF/Drive reais, provedor, configuração Vercel/saída/DNS, restauração ou pentest independente.

## Pendências que bloqueiam encerramento

1. **F01/F02 saldo:** admissão e conclusão de estorno/antecipação precisam RPCs transacionais com ordem global de locks; resultado definitivo precisa ser vinculado à operação e conexão autenticada, não apenas um event ID diferente. Validar lifecycle completo, reservas, split parcial, retries e histórico no esquema integral isolado antes de migration. Candidato `security-accounting-guards.sql` explicitamente não aprovado para implantação.
2. **F03/F06 contratos:** publicar arquivo/hash na mesma transação e mutex da confirmação, impedir mutação após assinatura no banco, criar versão de forma atômica, revisar todas as escritas diretas e estados.
3. **F07 egress:** lista exata bloqueia destinos arbitrários, mas hosts aprovados exigem controle operacional DNS/egress comprovado; entrega real bloqueada até configuração legítima.
4. **F09/RLS:** ajustar MFA/permissões efetivas após mapear callers, testar isolamento A/B em esquema integral. RLS habilitado sozinho não é garantia de isolamento. Não revogar indiscriminadamente escritas legítimas.
5. **Dependências/configuração:** quatro avisos moderados de ferramenta, revisão especializada e configuração Vercel/Auth/Asaas/Cloudflare/backup não verificadas.

Os bloqueios dependem de ambiente integral isolado com identidades autorizadas e endpoints fictícios controlados, bem como configuração/evidência externa que esta etapa não possui. Não liberar dinheiro, publicar ou aplicar o candidato mínimo para contornar esses gates.