# Auditoria técnica — WiizeCore Global (Rapyd) sem mexer na operação Brasil (Asaas)

Esta etapa é só de auditoria. Nada no sistema será alterado: nem código, nem banco, nem segredos, nem integrações. Nenhuma cobrança ou saque será feito.

## O que vou fazer
1. **Mapear a operação brasileira atual (só leitura)**: clientes, cobranças, tentativas de pagamento, cartão, Pix automático, lembretes, cupons, coproduções, antecipação, saldos, saques, estornos, notas fiscais, ativação da conta, taxas, permissões, painel admin, API externa e avisos (webhooks). Listar telas, arquivos, tabelas e configurações que dependem do Asaas.
2. **Pesquisar a documentação pública da Rapyd**: contas de empresas (onboarding/KYB), cobranças em várias moedas, carteiras e saldos, split, saques, estornos, chargebacks, assinatura dos avisos e sandbox. Cada recurso será classificado como: confirmado / depende de aprovação comercial / não confirmado / não suportado, com link da fonte.
3. **Montar a proposta**: seletor Brasil/Global no topo do painel (só muda o que é exibido; o servidor decide e confere a permissão), separação de dados por operação, moedas e saldos sem misturar, taxas por moeda, saques, notas fiscais, webhooks e conciliação, admin sem poder de "aprovar na mão", riscos de segurança e contabilidade.
4. **Plano em fases e plano de testes**, sempre começando por sandbox e testes automáticos, com a operação brasileira testada como regressão em todas as fases.
5. **Lista de perguntas** que precisam de resposta antes do desenvolvimento (contrato com a Rapyd, países, moedas, quem é o titular da conta, nota fiscal no exterior etc.).

## O que você recebe
- Um relatório em PDF (e uma cópia em Markdown) nos Arquivos, seguindo exatamente os 16 itens pedidos no documento. Cada recomendação traz motivo, impacto, arquivos envolvidos e riscos.
- Um resumo curto aqui no chat.

## Detalhes técnicos
- Leitura de `src/lib/asaas*.server.ts`, `billing.server.ts`, `charges-core.server.ts`, `payment-attempts.server.ts`, `fee-engine.server.ts`, rotas `src/routes/api/public/**`, `app-shell.tsx`, `dev-environment.ts`, e consulta somente leitura da estrutura do banco (colunas, RLS, funções).
- A pesquisa da Rapyd será feita por subagente com fontes citadas; o que não estiver na documentação será marcado como "não confirmado", nunca assumido.
- Nenhum arquivo do projeto será editado; os arquivos gerados ficam apenas nos Arquivos (fora do sistema).
