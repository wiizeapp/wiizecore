# Hero e jornada conectada — WiizePay

## O que será ajustado
- Substituir o título e a descrição da abertura pelos textos exatos fornecidos, mantendo botão, painel ilustrado, alinhamento, verde de destaque e animações existentes.
- Inserir a nova seção imediatamente após **Como funciona**, antes do comparativo atual. Nenhuma outra seção será removida ou reorganizada.

## Nova composição
**Da contratação às próximas cobranças, tudo conectado.**

Usar o texto de apoio fornecido e uma única interface visual da WiizePay, com uma faixa discreta de link e progressão contínua. Não apresentar quatro cartões independentes.

- **Dados da contratação:** identificação do serviço e campos essenciais da jornada real.
- **Assinatura do contrato:** trecho de documento e confirmação de assinatura quando houver contrato vinculado.
- **Pagamento confirmado:** estado de confirmação com as formas de pagamento já disponíveis.
- **Próximas cobranças e documentos:** continuidade no portal, com cobranças e arquivos disponíveis, sem sugerir acesso irrestrito ou funcionalidades novas.

No computador, a interface terá hierarquia assimétrica: contratação e contrato como etapas anteriores mais compactas, pagamento como foco e acompanhamento integrado à continuidade da mesma composição. No celular, a mesma narrativa será reorganizada verticalmente, com conexão visível e textos legíveis, sem recortes ou sobreposição.

Reutilizar padrões reais do checkout e portal como base, logo e cores existentes, bordas finas e sombras discretas. A composição será ilustrativa, sem dados de clientes reais, valores financeiros inventados, botões que simulem operações ou novas promessas. Não dependerá de animação para explicar a sequência.

## Detalhes técnicos
- Criar um componente específico de apresentação em `src/components/home` e inserir sua chamada em `src/routes/index.tsx`.
- Usar os tokens existentes e estilos limitados à nova seção, sem modificar o tema global.
- Adicionar traduções EN/ES de todos os novos textos visíveis.
- Registrar a separação entre ilustração e operação real nas regras do projeto.
- Não alterar rotas, autenticação, integrações, pagamentos ou regras de negócio.

## Validação e entrega
- Conferir o título e a descrição exatos e a posição logo abaixo de Como funciona.
- Conferir computador, tablet e celular, incluindo 320px, ausência de transbordamento, legibilidade e movimento reduzido.
- Verificar que o botão de cadastro e as seções existentes continuam presentes, sem erros na página.
- Conferir os metadados existentes da home e as traduções.
- Informar ao final os arquivos criados e editados e as validações realizadas.