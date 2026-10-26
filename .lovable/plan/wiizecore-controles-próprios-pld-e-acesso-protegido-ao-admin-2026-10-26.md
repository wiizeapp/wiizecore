# WiizeCore — controles próprios PLD e acesso protegido ao Admin

## Objetivo
Criar alertas internos de movimentação suspeita e uma área **Admin → Prevenção à lavagem de dinheiro** para a equipe analisar casos. Proteger **todo o Admin**, não apenas a tela nova, com nova confirmação de 2FA e senha financeira a cada abertura.

Os alertas indicam necessidade de análise, não comprovam crime. Esta implementação não substitui os controles do Asaas nem certifica conformidade jurídica.

## 1. Entrada e permanência no Admin
- Exigir conta autenticada, perfil administrativo validado no servidor, código novo do autenticador e senha financeira pessoal do administrador. Uma sessão que já tenha confirmado 2FA não dispensa essa nova confirmação.
- Para administrador sem senha financeira, oferecer cadastro seguro com nova confirmação de 2FA; nunca usar senha compartilhada de empresa nem criar senha padrão.
- Depois das duas confirmações, liberar a navegação pelas áreas autorizadas do Admin naquela página. “Liberar tudo” não amplia permissões nem remove as confirmações exigidas para operações financeiras sensíveis.
- Cada nova aba, reabertura, atualização da página ou retorno após sair do Admin exige os dois fatores novamente. Trocar entre seções do Admin na mesma página mantém a liberação enquanto válida.
- Ao sair, fechar ou encerrar a sessão: limpar imediatamente a liberação e os dados administrativos da página. Os casos salvos **não são apagados**; perde-se o acesso, não o histórico de análise.
- Como proteção adicional, propor bloqueio após **5 minutos de inatividade** e limite máximo de **30 minutos por liberação**. Avisar antes do bloqueio e salvar notas de forma protegida antes da expiração quando possível.
- Limitar tentativas, registrar recusas sem senhas/códigos e preservar o bloqueio existente da senha financeira: **3 erros = 60 minutos**. Falha na verificação, sessão expirada ou serviço indisponível mantém o Admin bloqueado.

**Limite importante:** o navegador pode encerrar sem avisar o servidor. O retorno sempre pedirá nova confirmação porque a liberação não será salva no navegador; no servidor, a sessão anterior será revogada quando possível e obrigatoriamente expirará. Não prometer revogação instantânea em caso de travamento ou falta de internet.

## 2. Alertas de movimentação suspeita
Começar em **modo de observação**, sem bloquear dinheiro ou mudar operações:
- Aumento incomum do volume, valor ou frequência de pagamentos em relação ao histórico da própria empresa.
- Sequência de pequenos pagamentos cujo total/frequência ultrapasse critérios aprovados de análise.
- Recebimentos seguidos de pedidos de saque em curto intervalo; considerar prazos e diferenças entre pedido e execução confirmada.
- Frequência atípica de reembolsos e contestações confirmadas pelo provedor, quando disponíveis.
- Alteração de conta de recebimento seguida de pedido de retirada, usando somente eventos disponíveis e autorizados.
- Avisos de risco do Asaas, apenas quando houver fonte oficialmente suportada e verificável.

Cada regra terá motivo, parâmetros, período observado, versão, responsável e referências dos eventos que a acionaram. Valores, percentuais e quantidades serão definidos antes de ativar cada regra; não inventar limites legais. Empresas sem histórico suficiente terão indicação de dados insuficientes, não uma classificação fabricada.

Reprocessamento e repetição de webhook não duplicam alertas. Fontes incompletas ou conexão antiga ausente geram pendência de conferência, não acusação. Não usar nacionalidade, raça, religião ou atributos sensíveis como critérios.

## 3. Tela de análise no Admin
- Visão resumida com alertas novos, casos em análise, escalados e concluídos; mostrar dados reais ou estado vazio.
- Fila com filtros de período, empresa, regra, prioridade, responsável e situação.
- Detalhe com motivo do alerta, linha do tempo, operações relacionadas, origem e qualidade dos dados, versão da regra, notas protegidas e histórico de decisões.
- Fluxo: **Novo → Em análise → Aguardando informações / Escalado → Concluído**. Conclusão com justificativa obrigatória: falso positivo, explicado ou encaminhado para avaliação especializada.
- Designar responsável, anexar evidências privadas e permitir reabertura justificada sem sobrescrever o histórico.
- Consultas, revelação de dados, atribuições, alterações de regras e decisões registradas na auditoria. Lista mascarada por padrão; detalhe revela apenas o necessário para a permissão do analista.
- Sem exportação em massa ou download de evidências na primeira etapa, evitando cópias fora do controle da sessão. Traduções PT-BR/EN/ES e identidade visual atual preservadas.

Nenhum botão dessa área bloqueará saldo, cancelará cobrança, autorizará saque ou enviará comunicação automática ao cliente, Asaas ou órgão público.

## 4. Criptografia e confidencialidade
- Criptografar no servidor notas, justificativas, evidências, dados pessoais e conteúdo sensível dos alertas; transporte por HTTPS e armazenamento privado.
- Armazenar apenas os índices operacionais mínimos fora do conteúdo cifrado: identificadores internos, datas, situação, versão e referências. Documentar o inventário de dados em vez de prometer que todo campo será cifrado da mesma maneira.
- Senhas ficam em hash com salt, nunca reversíveis; códigos 2FA nunca são armazenados nem registrados. Chaves de criptografia ficam em campos seguros, separadas dos dados e nunca enviadas à página.
- Descriptografar somente após autorização administrativa e sessão temporária válida. Logs guardam referências e ações, não conteúdo de casos, documentos, senhas ou códigos.
- Evidências em área privada, sem link público ou endereço de acesso permanente; validação de tipo/tamanho e proteção contra arquivos maliciosos antes de permitir abertura. Caso a inspeção segura não esteja disponível, upload fica desativado inicialmente.
- Planejar versionamento/rotação das chaves, recuperação dos backups cifrados e retenção aprovada por jurídico/Asaas. A criptografia não impede que alguém autorizado copie o que já visualizou.

## 5. Etapas de entrega
1. **Acesso Admin:** inventariar todas as entradas administrativas, implementar sessão temporária, dois fatores novos e testes de bloqueio antes de adicionar dados de casos.
2. **Base protegida:** criar regras versionadas, alertas, casos, histórico e armazenamento cifrado, sem mudanças destrutivas ou alterações financeiras.
3. **Detecção:** processar eventos confirmados de forma idempotente; validar regras com dados sintéticos em ambiente isolado e manter regras novas desativadas até aprovação dos parâmetros.
4. **Análise:** criar fila, detalhe, decisões, atribuição e auditoria no Admin.
5. **Validação e entrega:** testar fluxos, segurança e regressões; entregar inventário completo de arquivos, mudanças no banco, nomes dos campos seguros necessários e publicação/reversão. Não publicar automaticamente.

## Detalhes técnicos
- Reutilizar `requireMfaAuth`, autorização `platform_admin`, infraestrutura de senha financeira e `audit.server.ts`. O helper atual `ensureTwoFactor` aceita AAL2 já existente: ele não basta para o novo desafio administrativo.
- Resolver explicitamente a senha pessoal de administradores sem vínculo de empresa; o verificador financeiro atual depende de `tenant_members` e não deve ser reutilizado sem essa adequação.
- Centralizar autorização administrativa em middleware para leituras, escritas, exportações, auditoria, recuperação e demais ferramentas. Só a consulta mínima necessária para abrir o desafio fica disponível antes da liberação; nunca dados do Admin.
- Usar `createServerFn` para ações internas; confirmar desafio 2FA recente no servidor, vinculado ao usuário e à tentativa de desbloqueio, sem aceitar prova fornecida pelo cliente nem reutilização do mesmo desafio.
- Sessão administrativa durável com identificador aleatório guardado apenas como hash no banco; vincular usuário, sessão de autenticação, escopo, emissão, expiração e revogação. Prova da página somente em memória volátil, nunca em localStorage, sessionStorage, URL ou cookie compartilhado como única garantia por aba. Autorização depende sempre do registro e das validações no servidor, nunca da presença de um valor na página.
- Validar papel, sessão autenticada, prova administrativa e expiração em cada chamada; revogar após logout, alteração de senha/2FA ou perda de papel. Limpar cache administrativo, cancelar consultas e impedir restauração de dados pelo histórico do navegador após bloqueio.
- Criptografia autenticada AES-GCM com nonce único e contexto vinculado a caso/empresa/versão; reutilizar primitivas existentes após revisão. A aplicação deverá recusar leitura se chave ou integridade estiver inválida.
- Novas estruturas no banco com GRANT explícito, RLS e acesso restrito. Conteúdo PLD não acessível diretamente pelo navegador; descriptografia e operações privilegiadas apenas após autorização. Usar NUMERIC/Decimal nas regras monetárias.
- Fontes: pagamentos e eventos Asaas autenticados vinculados à conexão original; eventos de saque/reembolso quando confirmados; auditoria técnica como contexto, sem confundir falhas de login com lavagem de dinheiro.
- Detector desacoplado do processamento financeiro: falha não impede pagamento, mas gera pendência operacional e permite reprocessamento idempotente. Decisões de caso exigem persistência e auditoria transacional; falha não pode aparentar sucesso.
- Atualizar documentação de arquitetura e relatório de produção durante implementação; não criar ou alterar secrets nesta etapa de planejamento.

## Testes e critérios de aceite
- Sem login, sem papel Admin, somente AAL1, apenas 2FA, apenas senha financeira, desafio reutilizado ou liberação de outra conta: nenhum dado administrativo liberado.
- Administrador já em AAL2 precisa confirmar novo 2FA e senha; ambas as confirmações liberam somente as permissões existentes.
- Fechar/reabrir, atualizar, nova aba, restauração pelo histórico, inatividade, expiração, logout e perda de papel bloqueiam o acesso; nenhuma restauração via armazenamento do navegador.
- A terceira senha incorreta aciona o bloqueio de 60 minutos; tentativa simultânea não perde contagem. Testar administrador sem vínculo de empresa e falha de serviço.
- Testar isolamento por empresa, papéis de análise, integridade do conteúdo cifrado, nonce, chave inválida e ausência de conteúdo sensível em logs/retornos indevidos.
- Repetir evento não duplica alerta; cada regra ativada terá teste com parâmetros concretos aprovados, casos positivos/negativos e dados insuficientes.
- Decisão sem justificativa é recusada; alterações concorrentes não apagam histórico. Alertas não alteram tarifas, saldos, status de pagamentos, saques ou splits.
- Testar acesso autorizado completo no navegador em ambiente isolado. Testes dependentes de credenciais/autorização indisponíveis serão marcados como não verificados, nunca aprovados.

## Dependências e limites
- Definir responsável por PLD, substituto, política de encaminhamento e retenção com assessoria qualificada/Asaas. Não integrar comunicação a órgãos públicos sem confirmar competência e obrigações aplicáveis.
- Não pressupor disponibilidade de listas PEP/sanções, origem de recursos ou beneficiário final: integrações e revisão cadastral ficam fora desta primeira entrega.
- O diagnóstico anterior deixou testes reais de isolamento e restauração pendentes; devem ser resolvidos antes da liberação operacional. Não usar dados ou transações reais nos testes nem alterar configurações de produção sem autorização.
- Nenhuma funcionalidade, chave ou mudança no banco será aplicada até a aprovação deste plano.