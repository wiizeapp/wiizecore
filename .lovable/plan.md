# Reteste de segurança da WiizePay

## Objetivo
Questionar as proteções existentes e buscar falhas reproduzíveis nos 15 tópicos do roteiro enviado. Não declarar segurança bancária nem prontidão para produção com base apenas em código ou testes simulados.

## Limites obrigatórios
- Não alterar o banco conectado, configurações de produção, permissões ou secrets.
- Não criar usuários ou dados de teste no ambiente compartilhado.
- Não fazer pagamentos, saques, transferências ou chamadas com efeitos financeiros, mesmo que uma chave esteja configurada como Sandbox.
- Usar apenas dados fictícios e testes controlados; sem força bruta massiva, acesso a dados privados reais ou testes destrutivos.
- Não corrigir vulnerabilidades nesta etapa: registrar diagnóstico e proposta de correção para autorização separada.

## Etapas
1. **Inventário e comparação:** revisar os relatórios anteriores, migrations efetivamente aplicadas, caminhos de acesso e testes existentes. Identificar as correções ainda não implantadas e os riscos conhecidos de saldo e compatibilidade das assinaturas.
2. **Reteste isolado:** executar regressões e testes dos serviços com dependências simuladas; reproduzir código inválido, repetição, alteração de empresa/destinatário/versão, autorização insuficiente e falhas fechadas. Usar os bancos locais descartáveis existentes para concorrência e regras financeiras. Esquema mínimo não será tratado como prova de isolamento completo.
3. **Viabilidade da homologação completa:** verificar se é possível preparar esquema, autenticação e arquivos privados isolados, sem copiar dados reais ou reutilizar credenciais de produção. Somente nesse ambiente criar usuários/empresas A e B e testar leituras e escritas cruzadas, privilégios, sessões, arquivos e chamadas diretas. Se faltarem recursos, registrar esses testes como NÃO TESTADOS e explicar o bloqueio; não substituí-los por testes no banco compartilhado.
4. **Controles externos:** conferir configurações acessíveis por leitura autorizada e documentação oficial dos provedores. Entrega de e-mail, CAPTCHA real, alertas e restauração exigem ambiente e destinos de teste isolados. Sem acesso comprovável, classificar como NÃO VERIFICÁVEL.
5. **Relatório:** entregar matriz por teste com método, resultado esperado/obtido, evidência, risco e classificação. Separar revisão estática, simulação, teste SQL isolado e fluxo completo autenticado. Comparar com a auditoria anterior e listar prioridades e bloqueios.

## Cobertura do relatório
RLS e isolamento; privilégios; senha financeira; autenticação/MFA/sessões; segredos; APIs; saques e consistência; webhooks Asaas; limites/CAPTCHA/antifraude; logs e alertas; backups/restauração; segurança geral e dependências; regressão; evidências; critérios finais de aprovação. Incluir nascimento, código por e-mail e assinatura financeira no reteste de contratos.

## Detalhes técnicos
- Consultas ao catálogo do banco conectado, se necessárias, serão somente de leitura e sem retornar dados pessoais.
- Testes com mutações SQL ficam em clusters locais novos, sem TCP e com ambiente limpo, conforme as regras de scripts.
- Nenhuma migration de correção será aplicada e nenhum código será publicado durante a auditoria.
- Não alterar campos, preços, limites ou requisitos de operações para fazê-los passar nos testes.
- Este reteste assistido não substitui pentest independente especializado nem certificação regulatória.

## Entrega e aprovação
Relatório técnico em português com resultados APROVADO — TESTADO E VALIDADO, REPROVADO, PARCIALMENTE APROVADO, NÃO TESTADO ou NÃO VERIFICÁVEL, sempre limitado ao alcance da evidência. A aprovação geral permanecerá pendente se houver falhas altas/críticas ou requisitos essenciais não comprovados.