# Página institucional WiizePay

## Direção visual
- Preservar a abertura comercial atual, o verde proprietário, as fontes Outfit/Inter, a largura dos conteúdos, os botões e a barra pública.
- Criar `/sobre` com abertura centralizada no mesmo padrão visual da home e uma representação da operação integrada logo abaixo, sem imagem lateral.
- Alternar composições editoriais, diagramas e interfaces ilustrativas, evitando uma sequência de cartões iguais.

## Entrega
1. **Página Sobre nós:** abertura; fragmentação da operação; propósito; quatro pilares; portal do cliente em destaque; infraestrutura; princípios; visão de futuro; conclusão com cadastro.
2. **Portal fiel ao produto:** mostrar cobranças, contratos, recibos, documentos e notas fiscais quando habilitadas. Descrever acesso por e-mail e CPF/CNPJ completo, como funciona hoje, sem prometer login com senha ou uma área de serviços inexistente. Exemplos visuais identificados como ilustrativos, sem salvar dados.
3. **Infraestrutura transparente:** centralizar período, valores, descrições e referências documentais. Apresentar os indicadores de 2025 somente com fonte verificável, sem atribuí-los à WiizePay e sem nome comercial do fornecedor no texto da página. Usar evolução percentual, não um valor de 2024 calculado ou inventado.
4. **Navegação:** acrescentar “Sobre nós” ao menu existente, no computador e no celular, com indicação da página aberta.
5. **Home:** inserir uma síntese de autoridade depois da apresentação de funcionalidades e antes da seção de público/depoimentos, como ponte entre produto e confiança. Botão “Conheça nossa história” para `/sobre`; hero comercial intacto.

## Interações e acessibilidade
- Entradas discretas com a solução existente, indicadores animados uma única vez ao aparecer e conteúdo legível sem animações.
- Respeitar redução de movimento; preservar navegação por teclado, foco visível e hierarquia de títulos.
- CTAs: “Conheça nossa plataforma” para a home; “Como pensamos” para o propósito dentro da própria página; conclusão para o cadastro existente.

## Detalhes técnicos
- Reutilizar `PublicPage`, `Button`, os estilos `hero-payment`, `hero-title`, `hero-shine`, `section-shell` e `premium-cta`.
- Isolar composições institucionais em componentes próprios e estilos limitados à nova experiência; não alterar os tokens globais ou o funcionamento financeiro.
- Adicionar traduções EN/ES para os textos novos e metadados específicos da nova página, incluindo endereço canônico a partir da configuração existente.
- Não alterar autenticação, pagamentos, integrações, variáveis de ambiente ou dados de clientes.

## Validação e relatório
- Conferir acesso direto e atualização de `/sobre`, navegação do menu, CTAs e retorno à home.
- Testar telas de 320 px, celular comum, tablet e desktop; verificar ausência de rolagem horizontal e sobreposições.
- Conferir fonte, período, valores e atribuição dos indicadores; testar movimento reduzido e idiomas.
- Executar os testes disponíveis relacionados à entrega e conferir erros de compilação e console.
- Informar os arquivos criados/alterados e qualquer verificação que não puder ser concluída.

**Observação da auditoria:** o portal atual não utiliza senha. A pesquisa encontrou uma publicação original dos resultados, mas a consulta direta foi bloqueada; a fonte será reconferida antes de publicar os números.