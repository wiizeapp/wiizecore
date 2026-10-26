# PLD e proteção do Admin — estado da entrega

## Implementado
- Desafio novo de autenticador e senha financeira para desbloqueio administrativo; prova volátil vinculada à sessão no servidor.
- Expiração após 5 minutos sem atividade e limite de 30 minutos; bloqueio e limpeza ao sair/atualizar, com revogação remota quando possível.
- Conteúdo sensível de regras e casos cifrado com AES-GCM; índices operacionais mínimos permanecem fora da cifra.
- Quatro indicadores observacionais, regras versionadas, fila, detalhes e decisões com histórico.
- Migrações 0041, 0042 e 0043 aplicadas ao banco compartilhado. Nenhuma secret criada ou alterada. Nenhuma publicação do aplicativo executada.
- Endpoint autenticado de observação automática preparado, sem agendamento criado e sem ativação de regras.

## Evidência e limites
- 80 testes unitários/regressões aprovados; última repetição dos três arquivos novos: 11 aprovados. Compilação reportada OK.
- Acesso sem login retornou 404 e não revelou conteúdo administrativo; isso NÃO comprova o fluxo autorizado.
- Fluxo autenticado completo, nova aba, restauração pelo histórico, alterações concorrentes e isolamento real ainda não verificados. Sessão da conta solicitante indisponível.
- Regras não certificam conformidade jurídica; parâmetros, retenção e encaminhamento dependem de aprovação especializada. PEP/sanções e anexos não implementados.
- Fechar um navegador sem conexão pode impedir aviso imediato ao servidor; prova não persistida impede restaurar o acesso pela página, mas o registro remoto depende de revogação ou expiração.
- Não houve pagamentos, saques ou reembolsos reais de teste. Não ativar operação antes das verificações pendentes.