# Correções de segurança da WiizePay

## Resultado pretendido
Tratar todas as falhas F01–F10 do reteste e as pendências associadas das auditorias anteriores, com provas de bloqueio e controles positivos. Segurança de 100% não pode ser garantida: o resultado será uma lista verificável de correções, testes e riscos residuais, sem certificação bancária.

## 1. Saldo e reservas — prioridade máxima
- Corrigir liberação de coprodução para descontar estornos e exigir confirmação de liquidação aplicável.
- Unificar a admissão de antecipação e estorno sob bloqueio por pagamento; impedir que operações simultâneas comprometam os mesmos recursos.
- Preservar reservas em respostas incertas e reconciliar confirmações do provedor incompatíveis, sem liberar saldo nem repetir efeitos cegamente.
- Revisar todas as rotinas irmãs de reserva, liberação, estorno, taxa e saque; manter Decimal/NUMERIC e idempotência durável.
- Testar R$ 100 com R$ 40 estornados liberando somente R$ 60, preservação de valores não relacionados, falhas, repetição, concorrência e isolamento. Não aplicar o candidato mínimo de docs como solução completa.
- Não alterar saldos históricos automaticamente: eventuais divergências serão diagnosticadas por consultas agregadas e exigirão reconciliação autorizada separada.

## 2. Assinatura, documento e destinatário
- Tornar o arquivo original e sua referência imutáveis após qualquer assinatura; reservar a versão antes de enviar arquivos e verificar todos os erros e hashes.
- Vincular destinatário à identidade do contrato; impedir troca por checkout irmão ou outros caminhos públicos. Mudança legítima deverá ser autorizada sem reescrever evidências antigas.
- Criar/ativar versões e cancelar contratos com bloqueio transacional e estado/versão esperados; impedir atualizações atrasadas e status de assinatura fabricado.
- Manter nascimento protegido, senha financeira/MFA da empresa e código por e-mail dos demais; testar as quatro entradas, expiração/replay e concorrência.

## 3. Senha, acesso e RLS
- Fazer criação/alteração de senha financeira atômicas, com erro de consulta recusado, comparação da credencial esperada e política de bloqueio preservada.
- Mapear escritores legítimos e migrá-los para operações estreitas antes de revogar acesso direto. Aplicar permissões por módulo, empresa ativa e MFA também no servidor/RPC.
- Fechar brechas relacionais entre empresa, cliente, contrato e recurso; proteger cargos, evidências, credenciais e registros de auditoria.
- Alinhar `mark_notifications_read` ao MFA obrigatório e revisar recuperação/Admin sem enfraquecer autenticação.

## 4. APIs, avisos externos e dependências
- Bloquear destinos privados de webhook com proteção adequada à hospedagem, incluindo mudanças de DNS; falhar fechado quando não houver garantia de destino público. Não usar somente filtros de texto nem resolver DNS e depois conectar sem proteção.
- Adicionar contenção antes da autenticação e limites agregados pertinentes, mantendo os limites atômicos existentes. Não inventar limites financeiros comerciais.
- Remover respostas brutas e mensagens potencialmente sensíveis dos registros de e-mail; preservar alertas e deduplicação.
- Tratar os nove avisos de dependências: substituição/atualização compatível, especialmente XLSX e Zod, com testes de importação/exportação e regressão. Não usar atualização forçada que quebre a plataforma.
- Revalidar webhooks Asaas, CAPTCHA/IP/antifraude, cabeçalhos, proteção de requisições, uploads e separação entre navegador e segredos.

## 5. Testes e critérios de conclusão
- Executar testes unitários, handlers reais com serviços simulados e SQL isolado com concorrência; transformar os testes que reproduzem vulnerabilidades em testes de recusa após cada correção.
- Buscar homologação com esquema completo, empresas fictícias A/B, sessões AAL1/AAL2 e arquivos privados. Se o ambiente completo não estiver disponível, deixar esses resultados como NÃO TESTADOS, sem usar dados reais do banco compartilhado.
- Entrega de e-mail, Drive, provedores, alertas, configurações da Vercel e restauração exigem acesso/destinos isolados e evidência externa. A ausência desses recursos será um bloqueio, não uma aprovação.
- Regressão e compilação devem passar; testar caminhos permitidos também, para não confundir sistema quebrado com sistema protegido.

## Banco conectado e implantação
**A aprovação deste plano autoriza migrations de correção no banco conectado compartilhado, somente após validação isolada e análise de compatibilidade da fase.** Elas afetam também os aplicativos que utilizam esse banco, inclusive versões antigas. Informar o impacto antes da aplicação; não revogar caminhos antigos de forma que quebre operações legítimas sem estratégia coordenada.

- Fazer mudanças aditivas e novas migrations pela ferramenta de banco; não editar histórico nem permissões gerenciadas.
- Não publicar Lovable, implantar na Vercel, mudar secrets/ambiente ou chamar operações financeiras reais automaticamente.
- Se uma proteção exigir atualização coordenada da versão publicada, preparar a correção e interromper apenas essa implantação até autorização específica; explicar o bloqueio e o risco de manter a versão antiga.
- Não executar restauração ou criar contas de teste no banco compartilhado.

## Entregas
Código e migrations das correções efetivamente validadas, testes persistentes, lista dos arquivos/configurações necessários em produção e relatório por achado: corrigido e comprovado no alcance do teste, parcialmente validado ou bloqueado. Nenhuma afirmação de “100% seguro”.

## Detalhes técnicos
Preservar TanStack Start, funções internas server-side, RLS/GRANT explícitos, RPCs financeiras service-only, auditoria, regras dos AGENTS e traduções PT/EN/ES. Operações externas incertas têm claims duráveis e conciliação; testes de mutação usam ambiente limpo e clusters locais separados do banco conectado.