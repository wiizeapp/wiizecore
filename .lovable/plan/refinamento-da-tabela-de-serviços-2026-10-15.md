# Refinamento da tabela de serviços

## Ajustes
- Retirar o botão “Associar”. Manter “Sem serviço fiscal” como controle discreto: ao passar o mouse ou focar, indicar a ação; ao clicar, abrir a configuração fiscal existente. No celular, o toque continuará funcionando.
- Serviços com configuração fiscal terão o nome da configuração clicável, sem um botão “Editar” separado.
- Organizar o checkout em coluna própria, com botão compacto “Copiar link”, ícones e confirmação visual, seguindo a tabela de cobranças. Disponibilizar “Abrir checkout” por ícone com descrição.
- Agrupar criar/desativar link, ativar/desativar serviço, arquivar e restaurar no menu de três pontos, respeitando as condições atuais.
- Informar os arquivos alterados nesta etapa, separados dos 15 arquivos da etapa anterior já listados.

## Limites e validação
- Alterar somente a apresentação e as interações da tabela; preservar operações, valores, permissões e integrações.
- Conferir a tabela com a sessão conectada, a abertura da configuração fiscal, o menu e a cópia de um link existente, sem criar cobranças ou movimentar dinheiro.

## Detalhes técnicos
- Reutilizar Button, Tooltip e DropdownMenu existentes e os tokens da área interna.
- Alterar `src/routes/_authenticated/servicos.tsx` e acrescentar traduções EN/ES somente quando necessárias; registrar o acompanhamento em `roadmap.md`.