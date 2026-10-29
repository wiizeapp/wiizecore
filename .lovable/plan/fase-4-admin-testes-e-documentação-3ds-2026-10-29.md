# Fase 4 — Admin, testes e documentação 3DS

## Entrega
- Substituir a área vazia **Chargebacks** do Admin por uma visão operacional das contestações: empresa, cobrança, valor, status oficial, prazo, estado da defesa e histórico; filtros e paginação com dados reais.
- Mostrar as últimas tentativas 3DS e seus estados reais, sem confundir confirmação de pagamento com autenticação comprovada.
- Exibir a configuração 3DS por ambiente e acrescentar controle administrativo seguro de desativação/liberação. A liberação administrativa não substitui a habilitação Asaas nem a configuração de produção; manter desligado até homologação autorizada.
- Preservar a nova confirmação de dois fatores e senha financeira em cada acesso ao Admin. Nenhum documento privado, dado de cartão ou segredo será incluído nas listagens.

## Página de Segurança e Confiança
Adicionar uma seção **3D Secure Asaas**, destacando a autenticação junto ao banco emissor como camada adicional para reduzir o risco de fraude e apoiar a prevenção de perdas por contestações.

Informar claramente o estado atual: **integração preparada, com ativação e homologação em produção pendentes**. Não afirmar “ativo” antes da comprovação. Descrever o Asaas como infraestrutura financeira para empresas, sem o superlativo “maior do país”, ainda não comprovado. Não prometer ausência de fraude, reversão de contestação ou cobertura universal.

## Testes e documentação
- Ampliar testes de acesso Admin, configuração desligada/ligada, dados seguros, eventos duplicados/fora de ordem e isolamento entre contas, aproveitando os testes existentes.
- Executar testes pertinentes e conferir a página pública em tela larga e estreita.
- Documentar endpoints, configuração, limites, evidências exigidas e roteiro de homologação real. Separar testes automatizados aprovados de validações ainda indisponíveis.
- O módulo só será declarado concluído após teste real na conta de produção habilitada pela Asaas: o ambiente de testes não reproduz o desafio 3DS. Não realizar cobrança ou defesa real sem autorização específica.

## Detalhes técnicos
- Reutilizar `/nimda?secao=chargebacks`, `AdminUnlockGate`, `requireMfaAuth` e `assertAdminPage`; consultas privilegiadas somente após todas as verificações.
- Reutilizar as quatro tabelas existentes e projeções explícitas; valores monetários permanecem Decimal/NUMERIC, sem somas em ponto flutuante.
- Controle operacional durável, auditado no servidor, sem permitir ativação pela alteração de preferências no navegador; qualquer mudança necessária no banco seguirá a ferramenta oficial.
- Manter `CHECKOUT_3DS_ENABLED=false` até a liberação apropriada; não alterar diretamente a Vercel sem acesso disponível.
- Atualizar traduções EN/ES junto das novas mensagens PT-BR, documentação e lista de pendências.

## Limites
Acesso autenticado real ao Admin, desafio 3DS e envio de defesa dependem de sessão/conta autorizada e cenários reais elegíveis. Alertas periódicos e demais pendências da fase 3 não serão tratados como concluídos nesta fase.