# Continuidade do checkout — 2026-10-29

## Alterações
- Rascunhos de contato/endereço no checkout de pagamento e identificação no link de serviço: somente campos explicitamente permitidos, na mesma aba, prazo de duas horas. Recuperados após recarregar ou voltar; removidos após confirmação dos dados ou encaminhamento ao pagamento.
- Não persistir cartão, validade, CVV, assinatura, aceite, credenciais de sessão ou situação financeira. O aceite ainda não confirmado precisa ser feito novamente após recarregar. Assinaturas já concluídas e dados confirmados permanecem no servidor.
- Atualização imediata ao voltar à aba, recuperar foco/conexão ou restaurar página pelo histórico. Consulta periódica inclui `processing` e `in_analysis`, além dos estados abertos.
- Falha temporária de atualização com dados já disponíveis não desmonta o formulário. Primeira renderização estável evita divergência entre HTML inicial e navegador.
- Instruções Pix/boleto automáticas apenas depois da confirmação de dados e assinatura exigida; consulta de CEP antiga não altera o endereço de um CEP diferente.
- Retorno 3DS conserva seu indicador de navegação durante a espera, inclusive após recarregar. Não declara autenticação bem-sucedida nem pagamento recebido pela URL.
- Link de serviço com cobrança existente prioriza continuar a cobrança em vez de gerar outra pela ação principal. A identificação/sessão no servidor continua obrigatória; não há restauração local de autorização.
- Seção 3DS usa o token `brand-pay` da Wiize, inclusive no marcador do globo; título adaptado para telas pequenas.

## Evidências
- 39 testes aprovados em sete arquivos: recuperação/remontagem, isolamento entre links, limpeza, expiração, campos proibidos, retorno da aba/conexão e estados de acompanhamento; regressões 3DS e modalidades de serviço.
- Navegador em português com respostas substituídas apenas no navegador, sem editar banco nem iniciar operações: dados preenchidos → recarregar → recuperação sem aceite → confirmação → Pix → processamento com consultas periódicas → recebido e próxima cobrança recorrente. Retorno 3DS mantém espera após recarregar.
- Página pública conferida em 320, 390, 768 e 1163 px: sem rolagem horizontal; globo carregado; token de verde igual ao da marca. Metadados próprios preservados.

## Limites e pendências
- Testes com respostas locais não provam recebimento real, Pix Automático/consentimento bancário, emissão recorrente pelo Asaas ou desafio 3DS de produção.
- Rascunhos são restritos à mesma aba e expiram; fechar a aba definitivamente, usar outro dispositivo ou bloquear armazenamento pode exigir preencher novamente campos não enviados. Número de cartão e CVV nunca são recuperados de armazenamento local.
- Sessão de identificação do link de serviço não é persistida; após reabrir, os campos permitem reenviar a identificação, e o servidor deve reencontrar a cobrança existente. Dados financeiros nunca vêm do rascunho.
- 3DS continua condicionado à flag, liberação operacional e habilitação Asaas; com `CHECKOUT_3DS_ENABLED=false`, permanece o fluxo sem 3DS. Conclusão exige teste real autorizado na conta de produção habilitada.