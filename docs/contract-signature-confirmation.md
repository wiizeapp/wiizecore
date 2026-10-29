# Confirmação adicional de assinatura

## Entrega

As quatro entradas de assinatura agora exigem nascimento: prestador autenticado, cliente pelo link, pessoa convidada e cliente pelo pagamento. O prestador mantém MFA e senha financeira; os demais precisam confirmar um código no e-mail cadastrado. Nenhum código ou senha é gravado nos registros ou certificado. Nascimento é criptografado na evidência e apresentado no PDF privado, não na consulta pública de autenticidade.

Código de seis dígitos, dez minutos, cinco tentativas, reenvio após sessenta segundos, máximo de cinco envios por hora por destinatário/origem. O reenvio invalida o anterior. A confirmação vincula dados, imagem de assinatura, versão, empresa, pessoa, destinatário e link. O banco revalida a validade do link, destinatário e versão na gravação. Alterações de posições/conteúdo e conjunto de signatários ficam bloqueadas após a primeira assinatura da versão; criar nova versão para alterações.

Assinaturas são imutáveis, gravadas apenas pela função privilegiada de conclusão. Consumo do desafio e assinatura são atômicos. Evidências anteriores ficam intactas, sem confirmação retroativa. O bloqueio financeiro continua aceitando a assinatura histórica do cliente que corresponde à versão/hash vigentes; nenhuma regra de saldo foi modificada.

## Banco e implantação

Aplicadas, conforme plano aprovado, migrations 0053–0056 no banco conectado compartilhado. RLS dos desafios habilitado, sem policies públicas; privilégios diretos de anon/authenticated revogados, funções de emissão/conclusão executáveis apenas pelo servidor, INSERT direto de assinaturas também revogado para service_role. O nascimento continua criptografado mesmo nas leituras da tabela.

**Versão antiga publicada não consegue concluir novas assinaturas**: faltam os novos campos e a confirmação exigida pelo banco. Não houve publicação automática. Atualizar o aplicativo Lovable e implantar arquivos/migrations correspondentes na Vercel antes de disponibilizar novas assinaturas. Contratos concluídos não foram reescritos.

## Verificações executadas

- Regressões: 469 aprovadas, 22 ignoradas (testes autenticados reais não disponíveis).
- Serviços reais com dependências simuladas: 19 aprovados, incluindo 10 novos testes de confirmação. Esses testes não comprovam entrega real de e-mail nem autenticação real do prestador.
- SQL aplicado executado em banco mínimo descartável sem TCP/credenciais reais: código errado, payload modificado, vencimento, repetição, duas conclusões simultâneas com apenas uma aceita, uma assinatura/consumo, imutabilidade e privilégios restritos. Cluster encerrado ao finalizar.
- Prévia local: links sintéticos de cliente/convidado recusados, sem erros de execução. Não houve acesso a contratos reais ou assinatura pelo navegador com envio real.
- Compilação automática OK após correções.

## Pendências explícitas

- Entrega real na caixa postal e assinatura completa com cliente, convidado e prestador: requer contrato e destinatário de teste autorizados e sessão válida com MFA/senha financeira. Não enviar códigos a contatos existentes sem autorização.
- Conferência visual das telas preenchidas e PDF final de um contrato autorizado, nas quatro entradas.
- Homologação com o esquema completo, sessões de duas empresas, interação com Drive e mudanças simultâneas de versão/cancelamento/links; banco mínimo não substitui essa validação.
- Acesso genérico de escrita a outras tabelas de contratos já apontado na auditoria anterior permanece fora da revisão completa de permissões por módulo. Esta entrega não certifica o aplicativo como banco real.

Confirmação por e-mail comprova o acesso àquela caixa postal na ocasião; nascimento é declarado pela pessoa. Não equivale a consulta oficial de identidade ou assinatura qualificada.