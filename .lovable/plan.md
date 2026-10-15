# Central de Ajuda WiizePay — plano em fases

## Objetivo
Criar uma Central de Ajuda na área logada com artigos, guias, taxas e prazos, duas calculadoras e envio de sugestões. Criar também uma área no Admin para cuidar dessas sugestões.

## Fase 1 — Acesso e estrutura
- Novo item "Central de Ajuda" (ícone de livro) no rodapé do menu lateral, logo acima de "Sair".
- Novas páginas na área logada: `/ajuda` (início), `/ajuda/$categoria` e `/ajuda/artigo/$slug`.
- Página inicial com cabeçalho, busca ("Como podemos ajudar você?"), as 10 categorias e artigos em destaque.
- Busca em artigos, guias e dúvidas frequentes, com o nome da categoria e mensagem amigável quando nada for encontrado.

## Fase 2 — Conteúdo
- Os artigos ficam em arquivos de conteúdo dentro do projeto (sem banco de dados). Cada artigo tem título, resumo, categoria, data, tempo de leitura, passos numerados e artigos relacionados.
- Os guias seguem os nomes reais dos menus e botões que já existem (Clientes, Serviços, Cobranças, Contratos, Notas Fiscais, Recebíveis, Receba mais rápido, Segurança etc.). Só entra o que já funciona hoje.
- Botões "Isso ajudou?" e "Enviar sugestão" no fim de cada artigo.

## Fase 3 — Taxas, prazos e calculadoras
- As taxas vêm da mesma configuração usada no checkout e na página `/taxas`. Nenhum valor é digitado à mão.
- Os prazos vêm das regras de liberação já usadas pelo sistema. Cada prazo mostra a data da última revisão. O que não estiver confirmado com a Asaas aparece como "a confirmar".
- Calculadora de taxas: valor, forma de pagamento e parcelas. Mostra a taxa em %, a tarifa fixa, o custo total, o valor líquido, o custo efetivo e o prazo. Usa as contas que já existem no sistema.
- Calculadora de antecipação: calcula parcela por parcela, de acordo com a data de cada uma. Se o sistema não tiver uma taxa oficial, usa uma taxa mensal digitada pela pessoa, com o aviso "simulação hipotética". Não usa um percentual fixo.

## Fase 4 — Sugestões
- Janela "Envie sua sugestão" com os campos: tipo, título, descrição, página de origem (preenchida sozinha) e informações extras.
- A sugestão é gravada no servidor junto com o usuário, a empresa e a página. O sistema bloqueia envios repetidos. Se der erro, o que foi digitado continua no formulário.

## Fase 5 — Admin "Sugestões de usuários"
- Novo item no menu do Admin.
- Mostra os números reais de cada situação.
- Tabela com busca, filtros por situação, categoria e data, ordenação e páginas.
- Na tela de detalhes é possível mudar a situação e a prioridade, definir um responsável, escrever notas internas e ver o histórico.
- Situações: Nova, Em análise, Planejada, Em desenvolvimento, Implementada, Não aprovada.

## Detalhes técnicos
- Tabelas novas:
  - `feature_suggestions`: user_id, tenant_id, category, title, description, extra, source_page, status, priority, assigned_to, created_at, updated_at.
  - `feature_suggestion_internal`: notas internas, separadas para que o cliente nunca as leia.
  - `feature_suggestion_events`: histórico de alterações.
  - `help_article_feedback`: respostas de "Isso ajudou?".
- Regras de acesso: o cliente só pode criar e ler as próprias sugestões. Notas e histórico ficam só com `has_role(platform_admin)`. As funções do servidor usam `requireSupabaseAuth` e conferem o papel de admin no servidor.
- Os envios de sugestão têm limite usando o `rate_limits` que já existe.
- Textos em PT, com traduções EN/ES em `ui.json`.
- Testes das calculadoras com vitest, usando vários valores e números de parcelas.

## Pendências a confirmar
- Prazos e condições específicos da conta Asaas da WiizePay, principalmente Pix Automático e taxa real de antecipação.
- Canal oficial de suporte que aparece quando a busca não encontra nada (hoje existe a página `/suporte`).
