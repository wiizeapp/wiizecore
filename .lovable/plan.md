# Adequação BaaS Asaas — WiizePay

## Objetivo
Aplicar identificação oficial e transparência pontuais, mantendo a marca, aparência e funcionamento financeiro atuais. O playbook foi lido, incluindo a cláusula-modelo da página 11.

## 1. Marcas e checkouts
- Criar uma identificação reutilizável com os três URLs oficiais individualizados, sem copiar, recolorir ou modificar os selos. Escolher a versão pelo contraste do fundo; abrir https://asaas.com em nova aba com proteção.
- Aplicar WiizePay + selo no rodapé do pagamento `/pagar/$token`, sua prévia e checkout aberto `/checkout/$token`.
- Conferir os encaminhamentos `/c/$token` e `/autorizar/$token` e identificar telas financeiras adicionais que não usem o rodapé compartilhado.
- Corrigir frases que atribuem processamento à WiizePay: plataforma WiizePay, serviços financeiros Asaas. Preservar suporte da empresa responsável pela cobrança e disponibilizar canais financeiros sem excesso de avisos.
- Adicionar apenas um selo em posição secundária no rodapé institucional.

## 2. Documentos e cookies
- Revisar privacidade com distinção factual entre plataforma, integração financeira Asaas e demais integrações comprovadas, sem classificação universal de controlador/operador.
- Nos Termos, esclarecer a identidade do prestador financeiro sem alterar obrigações, garantias, taxas ou contratos de processamento. A adoção da cláusula-modelo permanece pendente de validação jurídica e do Asaas; não será aplicada automaticamente.
- Atualizar Cookies conforme autenticação, preferências, registro de consentimento e carregamento condicional de GTM, Google Analytics e Meta Pixel encontrados no código. Não afirmar que ferramentas estão ativas sem confirmar a configuração.
- Verificar recusa, aceite e reabertura de preferências; corrigir somente falhas comprovadas. Não adicionar rastreamento.
- Registrar dados jurídicos ausentes, bases legais/retenção a confirmar e divergências do nome empresarial na cláusula-modelo em relatório separado.

## 3. Suporte financeiro
- Acrescentar uma opção limpa na Central de Ajuda, disponível com e sem login, com a descrição solicitada e ação “Acessar suporte financeiro”.
- Confirmar um canal oficial público antes de definir o destino. Na ausência de página confirmada, usar os canais do playbook: telefone PJ e mensagens 0800 009 0037; contato@asaas.com.br, sem inventar link de mensagens.
- Diferenciar atendimento financeiro Asaas do atendimento de software WiizePay, preservando o suporte existente.

## 4. Validação e entrega
- Conferir selos, URLs, contraste e apresentação em computador e celular, documentos e canais de contato no navegador.
- Executar testes existentes relacionados a aparência e regras de checkout, sem criar cobranças, pagar ou movimentar valores para testar alterações de apresentação.
- Entregar relatório com todos os arquivos criados/editados, cobertura, testes e limites da verificação. Fluxos sem um link real acessível serão identificados como não verificados ponta a ponta.
- Registrar expressamente: nomenclatura WiizePay depende de validação formal Asaas; ajustes técnicos não representam homologação ou conformidade integral.

## Detalhes técnicos
- Reutilizar `CheckoutTrustFooter`, `PublicFooter`, `Brand`, controles existentes e cores de `checkoutAppearanceVars`.
- Centralizar URLs oficiais/canais públicos em configuração compartilhada; incluir traduções EN/ES de cada novo texto PT-BR.
- Não alterar banco, autenticação, permissões, integrações, webhooks, cálculos, parcelamentos, split ou criação de contas.
- Arquivos principais previstos: apresentação do checkout, checkout aberto, rodapé público, Central de Ajuda, documentos legais, configuração pública, traduções e relatório em `docs/`.