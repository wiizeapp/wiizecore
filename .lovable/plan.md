# Ajustes da API, webhooks e Lembrete inteligente

## Fase 1 — Documentação pública (/desenvolvedores)
- Menu lateral igual ao de Termos de uso, separado em grupos: **Começo** (visão geral, primeiros passos, ambientes), **Segurança** (chaves, escopos, idempotência), **Implementação** (checkout, cobranças, clientes, assinaturas, cancelamento), **Webhooks** (eventos, assinatura, reenvio), **Testes** (sandbox, simulador), **Referência** (erros, limites, llms.txt).
- Bloco "Acessos rápidos" no topo do menu.
- O item do menu acende sozinho conforme a pessoa rola a página, e o menu fica fixo na lateral.
- Endereço da API trocado para **wiizecore.com** em toda a documentação, exemplos, guia para IA e llms.txt.

## Fase 2 — Página API e desenvolvedores
- Janela "Nova chave": permissões em lista limpa, agrupadas (Leitura / Escrita), com caixas de seleção discretas e "Selecionar tudo".
- Chaves em **tabela** (nome, início da chave, ambiente, situação, último uso, criada em). Clicar na linha abre janela com detalhes, permissões e ações **Suspender / Reativar** e **Revogar** (revogar pede senha financeira).
- Webhooks ganham **card próprio**, separado da tabela de chaves, com lista de endereços, teste, troca de segredo, pausa e histórico de entregas.
- Conferir de ponta a ponta no ambiente de Teste que criar chave, suspender, revogar e criar webhook funcionam.

## Fase 3 — Lembrete inteligente
- Renomear "Régua inteligente" para **Lembrete inteligente** (menu, página, textos, PT/EN/ES).
- Ao escolher um plano, os canais ficam marcados automaticamente e travados (não dá para tirar ou pôr).
- O que a empresa salvou vira o padrão de todas as cobranças.
- Cada momento (cobrança criada, antes do vencimento, no vencimento, em atraso, pagamento confirmado) ganha:
  - escolha de canais por momento, dentro do que o plano permite (ex.: criada = só e-mail; pagamento confirmado = e-mail + SMS + WhatsApp);
  - botão **Editar conteúdo**, com texto da mensagem, logo e cor, e prévia.
- Preço continua cobrado pela regra atual por aviso, no servidor.

## Limitações importantes (a confirmar)
- **Personalização de texto/logo/cor**: o Asaas permite ligar/desligar avisos por canal e momento, e mudar logo e cor da página de pagamento. Pela API, ele **não permite reescrever o texto** das mensagens que ele mesmo envia. Para texto 100% editável, só se o envio sair pela própria Wiize Core (e-mail pelo nosso serviço de e-mail; SMS/WhatsApp precisariam de um serviço contratado). Isso conflita com a regra atual "cliente final só recebe aviso via Asaas".
- **Endereço wiizecore.com**: hoje o site e a API respondem em wiizepay.com. Se wiizecore.com ainda não estiver ligado ao projeto, a documentação apontaria para um endereço que não funciona.

## Resposta à dúvida
Sim: quando a empresa cria cobranças pela API com o Lembrete inteligente ligado, os clientes dela recebem os avisos de vencimento normalmente, porque a cobrança pela API passa pelo mesmo caminho das cobranças feitas no painel. Condições: o cliente precisa ter e-mail/celular válidos e a cobrança ser real (Produção). No ambiente de Teste nenhum aviso é enviado.

## Detalhes técnicos
- Menu com IntersectionObserver reaproveitando `legal-page.tsx`; base da API em `deploy-config.ts` (novo campo `apiBaseUrl`).
- Ações de chave reutilizam `ext-integrations.functions.ts` (adicionar suspender/reativar com auditoria).
- Canais por momento: configuração versionada por empresa + override por cobrança, aplicada às notificações do cliente no Asaas; validação de canais permitidos e cobrança via `dunning_charge_fee` no servidor.
