# WiizeCore — ativação de produção com Pix único de R$ 19,90

## Auditoria inicial
O cadastro CPF/CNPJ, documentos privados, continuação no celular, análise Asaas, Admin, auditoria e notificações já existem e serão adaptados. Hoje não exigem pagamento prévio. Há dois caminhos de criação de subconta sem trava durável contra duplicidade. Existem três cadastros em andamento e nenhuma conexão Asaas registrada; preservar os dados e não marcá-los como pagos.

## Fluxo e regras
1. Manter cadastro gratuito, login, 2FA e pesquisa inicial existentes. Testes não exigem taxa; nunca misturar demonstração com movimentação real.
2. Convite discreto no header/sino e modal voluntário com a identidade **WiizeCore**, taxa única de **R$ 19,90** e etapas transparentes. “Agora não” não cria cobrança.
3. Coletar apenas identificação mínima do pagador para emitir Pix na conta principal Asaas; isso não inicia cadastro de produção nem comprova titularidade.
4. Criar/reutilizar cobrança pendente sob trava durável. Valor fixado exclusivamente no servidor: **1.990 centavos, BRL, Pix**, sem recorrência. Exibir QR Code e copia e cola reais.
5. Confirmar somente no servidor, consultando a cobrança na Asaas e validando conta de origem, identificação, finalidade, valor e estado oficial. Webhooks autenticados, eventos idempotentes e reconciliação recuperam falhas sem cobrar novamente.
6. Só depois de pago liberar cadastro CPF/CNPJ, rascunho de produção, solicitação/envio de documentos e continuação no celular. Bloquear também acessos diretos, RPCs e caminhos alternativos de criação de subconta.
7. Reutilizar validações, revisão, aceite versionado e documentos privados; preservar versões/histórico e rejeitar arquivos inválidos. Não confundir envio com aprovação.
8. Criar subconta apenas com pagamento confirmado e cadastro/documentos exigidos completos. Trava e recuperação duráveis; timeout incerto não autoriza nova criação cega.
9. Espelhar pendências e decisões da Asaas. Produção exige aprovação real, ambiente correto e capacidades operacionais; Admin não marca pagamento como pago nem aprova a conta no lugar da Asaas.

## Política comercial
A política solicitada é taxa não reembolsável, com continuidade sem nova taxa enquanto pendências são corrigidas. Os termos devem preservar direitos legais aplicáveis e passar por validação jurídica/contratual antes da cobrança em produção. **Não prometer ausência de reprovação nem criação garantida:** a decisão continua com a Asaas.

Custo de referência informado: R$ 12,90; sem alterar margem ou tarifas das movimentações existentes.

## Entregas incrementais
- Base financeira dedicada à taxa, estados separados do cadastro, restrições de integridade, índices, RLS/grants e migrações versionadas.
- Serviços de preparação, consulta, webhook e reconciliação, reutilizando Asaas e auditoria existentes; limites de frequência, erros seguros e isolamento por empresa.
- Modal, checkout, confirmação, retomada e estados no fluxo `/ativacao`; PT-BR/EN/ES e acessibilidade no computador e celular.
- Admin existente com indicadores e detalhe da cobrança, pendências e recuperação técnica autorizada; acesso reforçado preservado.
- Notificações reais e deduplicadas à empresa; nenhuma comunicação automática nova ao consumidor final.
- Inventário completo de arquivos/migrações/configurações necessárias, resultados reais de testes, homologação, implantação e rollback não destrutivo.

## Testes e critérios de liberação
- R$ 19,90 definido no servidor; adulteração, pagamento local/retorno falso e cobrança de outra empresa recusados.
- Sem pagamento: nenhum cadastro/documento/subconta, inclusive celular e endpoints alternativos.
- Cliques simultâneos, evento duplicado, timeout, retomada offline e falha interna não duplicam cobrança nem subconta.
- Pagamento válido libera apenas cadastro; aprovação e produção permanecem independentes.
- Isolamento, arquivos privados, logs sanitizados, permissões Admin e regressões de MFA/cobranças/saques.
- Exercitar fluxo com sessão autorizada e sandbox Asaas real quando disponível. Não contar testes indisponíveis como aprovados.

## Limites e implantação
Não emitir cobrança real, criar subconta real, publicar ou mudar configuração externa automaticamente. Migrações do Lovable Cloud afetam o banco compartilhado; implementar de forma aditiva, com cobrança desativada até homologação e termos aprovados. Se faltarem credenciais, webhook externo ou sessão autorizada, entregar implementação com bloqueio seguro e indicar exatamente o que impede validação/liberação.