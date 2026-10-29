# Assinatura de contratos com confirmação adicional

## O que será entregue

- Pedir **nome, CPF/CNPJ e data de nascimento da pessoa que assina**, inclusive quando ela representa uma empresa. Validar datas reais e não futuras, sem inventar regra de idade mínima.
- Para o **prestador autenticado na WiizePay**, manter o acesso com a confirmação de segurança atual e exigir a **senha financeira** no momento da assinatura. Essa exigência já existe; será preservada e registrada como evidência.
- Para **cliente, testemunha, signatário e aprovador externos**, exigir um **código por e-mail** antes de concluir a assinatura, seguindo a sequência do anexo: revisar documento → confirmar dados → confirmar código → assinar.
- Aplicar a mesma proteção nos links de contrato, links individuais e na assinatura dentro do pagamento. Não oferecer um caminho alternativo sem confirmação.
- Usar a identidade visual WiizePay, sem copiar marcas ou textos institucionais da Clicksign.

## E-mail e limites

- Enviar somente ao e-mail já vinculado ao cliente/signatário daquele contrato; não permitir trocar o destinatário livremente na tela pública.
- Código de seis dígitos, válido por dez minutos e uma única assinatura. Reenvio após 60 segundos invalida o código anterior; limitar envios e tentativas por destinatário, contrato e origem.
- Vincular a confirmação à empresa, pessoa, versão e impressão digital do contrato, além dos dados e da assinatura apresentados. Se esses dados mudarem, exigir nova confirmação.
- Se faltar e-mail cadastrado, mostrar que a empresa precisa corrigir o cadastro. Falha no envio, código errado, vencido, repetido ou de outro contrato bloqueia a assinatura.
- Essa é uma **confirmação por e-mail**, não uma comprovação oficial de identidade nem uma garantia contra fraude. Não substitui a proteção de acesso da conta WiizePay.

## Registros e documento

- Guardar o nascimento e as evidências pessoais de maneira protegida; mostrar o nascimento informado no certificado anexado ao PDF para as partes autorizadas.
- Registrar envio, reenvio, falha, confirmação e assinatura, com método utilizado, horário, versão, impressão digital, origem e referência da confirmação.
- Registrar a evidência de nascimento no histórico protegido; o registro geral mostra apenas que o dado foi informado e a referência da evidência. **Nunca incluir senha financeira ou código secreto no histórico ou no PDF.**
- A consulta pública de autenticidade permanece resumida: não expor nascimento, e-mail completo nem dados privados.
- Preservar contratos já assinados e seus documentos, sem inventar confirmação retroativa. A nova exigência valerá para assinaturas realizadas após a implantação; documentos antigos continuam identificados pelos registros existentes.
- Incluir os textos em português, inglês e espanhol.

## Proteções técnicas

- Centralizar a confirmação e a conclusão da assinatura em serviços de servidor compartilhados pelos quatro caminhos existentes: prestador, cliente por link, signatário extra e cliente pelo checkout.
- Criar armazenamento durável de desafios com código em hash protegido, expiração, tentativas e consumo atômico. Vincular o consumo e a gravação da assinatura na mesma transação para impedir duas assinaturas simultâneas ou reaproveitamento.
- Adicionar campos de evidência de forma compatível e revisar os acessos diretos das tabelas de assinaturas/desafios para que usuários comuns não consigam gravar uma assinatura confirmada ou alterar as evidências por fora das telas.
- Manter isolamento por empresa em todas as consultas de assinatura e leitura de PDF, usando acesso autorizado, permissões existentes e armazenamento privado. Conferir também os links individuais e downloads, além do link de cliente já reforçado na auditoria.
- Reutilizar o envio de e-mails existente; códigos não ficam gravados em mensagens de erro ou na fila de registros.
- Não alterar a liberação de saldo, pagamentos, Asaas ou os candidatos pendentes da auditoria financeira.

## Banco compartilhado e implantação

**A implementação precisa adicionar estruturas e proteções no banco conectado, que é compartilhado pela prévia e pelo aplicativo publicado na Lovable.** A aprovação deste plano autoriza essas alterações específicas de assinatura; não haverá apagamento de dados, mudança de contratos concluídos, publicação automática ou operação financeira.

Antes de aplicar, revisar a compatibilidade com o aplicativo atualmente publicado. Se uma proteção impedir a assinatura pela versão antiga, preparar a atualização de forma coordenada e informar a interrupção necessária, em vez de permitir um caminho sem verificação. A implantação na Vercel e a publicação continuam separadas e exigem sua autorização.

## Conferência

- Testar nascimento ausente/inválido/futuro, senha financeira recusada, acesso de outra empresa, código errado/vencido/reutilizado, reenvio, limite de tentativas e tentativa de assinar sem confirmação.
- Testar troca de versão, identidade ou assinatura após o envio e consumo concorrente do mesmo código.
- Conferir os quatro caminhos, o histórico e o certificado, verificando ausência de códigos/senhas e exposição de nascimento na consulta pública.
- Usar dados sintéticos e ambiente isolado nos testes de escrita e concorrência. O envio real e a assinatura completa serão validados apenas com destinatário e contrato de teste autorizados; qualquer etapa não exercitada será declarada como pendente, sem afirmar certificação bancária.