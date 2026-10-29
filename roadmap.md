# Roadmap

- [x] Rebranding WiizePay: marca visível, traduções, e-mails novos, imagem ilustrativa, documentação pública e endereços de produção; integrações e histórico preservados, 86 testes aprovados, oito páginas públicas e boas-vindas autenticadas sem nome antigo, navegação de cadastro e celular conferidos. Painel completo aguarda pesquisa do usuário; configurações externas e homologação formal permanecem pendentes; instruções em docs/wiizepay-rebranding.md.
- [ ] Conectar wiizepay.com e publicar: depende de confirmação dos registros do domínio e publicação pelo usuário.

- [x] Auditar e planejar taxa única de ativação de produção de R$ 19,90 via Pix Asaas; plano aprovado conceitualmente.
- [ ] Garantir bloqueio em todas as entradas/RPCs/storage, criação durável nos dois caminhos, transição sem exceção dos três cadastros, validação Asaas e testes de concorrência/timeout/falha de banco com resultados evidenciados.
- [x] Implementar primeira etapa: taxa dedicada, gates servidor/RPC/storage, checkout, claims duráveis compartilhados e histórico documental; migrations 0044/0045, três cadastros preservados, consulta sandbox 200/wallet correspondente e produção 401.
- [ ] Concluir ativação e homologação: sessão autorizada indisponível, webhook principal sem configuração, production não autenticada, termos sem validação; recuperação de key subconta, vencimento/reembolso e testes integrados ainda pendentes. Cobrança desativada; relatório em docs/ativacao-producao-entrega.md.
- [ ] Implementar fluxo aprovado, confirmação financeira, idempotência, reconciliação, telas/Admin/notificações, testes e documentação; nenhuma cobrança ou publicação automática.

- [x] Preparar plano de controles próprios PLD: alertas de movimentação suspeita, casos no Admin, criptografia e desbloqueio temporário por 2FA + senha financeira.
- [x] Implementar base PLD cifrada, regras versionadas em observação, fila no Admin e desbloqueio temporário por 2FA + senha financeira; migrations 0041–0043 aplicadas, sem publicação do aplicativo.
- [ ] Validar acesso Admin autenticado, fechamento/reabertura e análise completa — bloqueado pela ausência de sessão autorizada da conta solicitante; regras e agendamento não ativados, parâmetros dependem de aprovação especializada.

- [x] Implementar proteções B–G: avisos autenticados isolados por empresa/conexão, senha financeira nas coproduções/cancelamento de saque, troca bloqueada em falha do provedor, AAL2 obrigatório e contador serializado no banco; reservas mantidas em respostas incertas.
- [x] Executar regressões e documentar arquivos alterados; 292 testes aprovados, aviso sem token rejeitado (401), acesso protegido redireciona ao login.
- [ ] Conferir telas financeiras autenticadas e concorrência real no banco: sessão da conta solicitante indisponível; pagamentos/estornos/saques completos dependem de conta de teste autorizada. Sete pagamentos históricos sem conexão Asaas identificável permanecem bloqueados para conferência da origem; não atribuir outra conta automaticamente.

- [x] Corrigir recebimento Resend: assinatura padronizada, falhas de consulta sem salvar mensagens vazias, repetição idempotente e erros sem dados privados; 24 testes aprovados, endpoint local aceita eventos assinados ignorados (200) e rejeita sem assinatura (401), compilação OK.
- [ ] Concluir recuperação Resend em produção: implantar na Vercel, usar endereço www sem redirecionamento, alinhar segredo do cadastro correto, identificar duplicados, reativar e reenviar mensagem real com conferência na caixa de entrada. Bloqueado por acesso/configuração externa Resend/Vercel; conexão foi recusada, imagens não mostram resposta individual. Passos em docs/resend-webhooks.md.

- [x] Reescrever os nove depoimentos com opiniões naturais e profissionais, identificar os exemplos fictícios e atualizar traduções; seção conferida no computador e celular, sem rolagem horizontal ou erros de execução, compilação OK.

- [x] Aplicar strong explícito com peso 700 nos botões de cadastro e acesso; manter relatório Lovable interno e apresentar erros sem detalhes técnicos, incluindo a página de falha geral em português.

- [x] Reforçar botões públicos (700), usar WiizeCore na configuração compartilhada, home e rodapé, espaçar links do navbar e alinhar SEO da home à abertura atual; conferido de 320 a 1582px sem rolagem lateral, menu Recursos e menu celular funcionais, sem erros de execução. SEO chega ao site publicado na próxima publicação.

- [x] Restaurar caligrafia dos quatro textos flutuantes só no computador, reforçar títulos/ações principais e ajustar largura do menu, abertura e Como funciona para Manrope.

- [x] Aplicar Manrope aos textos e títulos do site, preservando a imagem e a fonte da logo; manter fontes próprias de assinaturas e códigos.

- [x] Usar a imagem enviada exclusivamente nas prévias de WhatsApp dos links de pagamento e serviço; imagem pública HTTPS em PNG (1200×675, 287 KB) conferida no HTML das duas rotas, home/contratos/documentação inalterados, compilação OK. Disponível nos links publicados após a próxima publicação.

- [x] Simplificar lateral da documentação sem scroll interno, respeitar claro/escuro/sistema apenas nessa página pública, atualizar logo/rodapé e uniformizar seletores; rolagem condicional do menu conferida na conta conectada a 1274×776, documentação a 390×844 sem transbordamento, sem erros de execução.

- [x] Separar Marca e Checkout na aparência; prévia dos lembretes lê logo/cor salvas com alternativa padrão Wiize; abas, salvamento/releitura da cor e link para Marca conferidos na conta conectada, cor original restaurada, 17 testes aprovados. Upload de nova logo não exercitado nesta conferência.
- [ ] Aplicar marca nos e-mails Asaas: depende de confirmação de endpoint oficialmente suportado; não confundir com personalização da fatura.

- [x] Developer Portal para SaaS: seletor Sandbox/Produção no menu, prompts para 6 ferramentas, primeiros passos com progresso real, simulador de testes isolado, consultas de cobrança/assinatura, cancelamento de assinatura, lista de serviços, registros de chamadas e envio automático da fila de avisos a cada minuto; 28 testes da integração aprovados.
- [x] Fase 2 da API: lista de cobranças, cliente por ID externo, Idempotency-Key no cancelamento e bloqueio de serviços com valor livre; 17 cenários conferidos de ponta a ponta com chave de teste (criação, repetição, adulteração, retorno inseguro, pagamento de teste, assinatura ativa, cancelamento e repetição).
- [ ] Validar entrega real de aviso a um endpoint HTTPS do cliente e o fluxo de produção com Asaas: depende de endpoint próprio e conta de recebimento aprovada.
- [ ] Agendar o envio de avisos também no ambiente da Vercel: depende de configurar o cron com a senha de tarefas no painel da Vercel.

- [x] Trocar toda a marca visível para Wiize Core, incluindo abertura, descrições, rodapés, páginas internas e traduções; sete páginas conferidas, sessão conectada e três idiomas, celular sem transbordamento, 17 testes aprovados; lista completa de 182 arquivos entregue. Domínios, integrações e histórico preservados; validação formal Asaas permanece externa.

- [x] Corrigir link de serviço: empresa fixa valor antes de enviar, cliente escolhe pagamento; condições versionadas, cópia/abertura conferidas em sessão conectada, quatro testes aprovados e compilação OK, sem emitir cobrança ou movimentar dinheiro.
- [ ] Validar pagamento completo pelo link de serviço: depende da aprovação da conta de recebimento pelo provedor; ativação pendente exibida sem contornar a proteção.

- [x] Refinar tabela de serviços: configuração fiscal pelo status, links compactos como cobranças e menu de ações; sessão conectada, abertura fiscal e cópia de link existente conferidas, três testes aprovados e compilação OK; sem operações financeiras.

- [x] Simplificar rodapés e reduzir selo oficial Asaas para 120×36; computador/celular sem rolagem lateral, sete testes aprovados; arquivos informados na entrega.

- [x] Substituir a marca visível por Wiize Recebe, preservando Wiize, domínios, rotas e identificadores técnicos; telas públicas e sessão conectada conferidas.

- [x] Adequar identificação Asaas nos checkouts e rodapé institucional, prévia e portal sem alterar operações financeiras.
- [x] Revisar privacidade, termos e cookies contra o playbook e implementação; relatório em docs/adequacao-baas-wiize-recebe.md.
- [x] Adicionar suporte financeiro à Central de Ajuda, preservando suporte tecnológico Wiize Recebe.
- [x] Validar selos, canais, telas e testes: 63 aprovados; compilação OK; falha institucional preexistente registrada no relatório.
- [ ] Obter homologação formal da marca e apresentação pelo Asaas: depende de aprovação externa.
- [ ] Validar cláusula financeira, dados jurídicos e inventário de privacidade: depende de jurídico/Asaas e dados oficiais da empresa.

- [x] Ajustar os quatro ícones 3D de "Como funciona" para o mesmo tamanho: cada desenho é escalado pela própria área visível e por um peso óptico individual. Conferido em pixels reais a 1377px (71×65, 64×66, 91×62, 68×63) e a 393px, sem rolagem horizontal e com a compilação OK.

- [x] Igualar a altura visível dos quatro ícones 3D de "Como funciona" e retirar o sombreado; retirar os ícones dos cartões flutuantes da jornada e aplicar a fonte cursiva legível nos títulos; centralizar os textos dos painéis de funcionalidades. Conferido a 393, 820 e 1280px, sem rolagem horizontal, sem cortes e com a compilação OK.

- [x] No celular, devolver aos cartões da jornada a cor neutra do computador e manter verde apenas nos números; conferido a 393px, sem rolagem horizontal, sem erros de execução, compilação OK.

- [x] No celular, pintar cartões e círculos numerados da jornada com o verde da Wiize e retirar a seta à direita dos cartões; conferido a 393px sem rolagem horizontal, sem setas no DOM e sem erros de execução, computador inalterado, compilação OK.

- [x] Igualar fundo da jornada a Por que a WiizePay, retirar linha superior, destacar apenas wiizepay no endereço e aproximar fontes dos rótulos ao anexo; conferido a 320, 390 e 1347px, sem rolagem horizontal ou erros, compilação OK.

- [x] Afastar setas da cápsula, espelhar a de pagamento para dentro, reduzir descrição e igualar destaque ao Hero e fundo a Como funciona; conferido a 320, 390, 768 e 1347px, com cores e efeito iguais às referências, sem rolagem horizontal ou erros.

- [x] Refinar a jornada: título e endereço ampliados, “https://” suavizado, destaque igual à abertura, verde próximo da marca, setas direitas para o centro e quatro etapas com flutuação suave; conferido em PT-BR a 320, 390, 768 e 1347px, sem rolagem horizontal ou erros e com movimento reduzido respeitado.

- [x] Refinar apenas a jornada conectada conforme a imagem agora recebida: proporções, curvas independentes, luz nas bordas, ícones e acabamento do link; conferido a 320, 390, 640, 768 e 1280px, textos e posição preservados, sem cortes, duplicação ou erros de execução.

- [x] Substituir integralmente a jornada após Como funciona pela composição escura com cápsula central, quatro etapas e setas curvas, sem alterar demais seções.
- [x] Conferir textos PT-BR, endereço ilustrativo exato, seção única e composição anterior ausente; apresentação a 320, 390, 640, 768 e 1280px sem rolagem horizontal ou erros de execução, compilação OK. Referência mencionada não recebida; execução baseada na descrição aprovada.

- [x] Atualizar somente os textos da abertura da home e adicionar jornada visual conectada imediatamente após Como funciona, preservando as demais seções.
- [x] Validar textos exatos, posição, jornada ilustrativa, traduções, cadastro e apresentação a 320, 390, 768 e 1280px; sem transbordamento ou erros de execução, compilação OK. Teste institucional existente: 3/4 aprovados; uma expectativa antiga ainda exige “Mais de R$”, texto removido anteriormente pelo usuário, sem relação com esta entrega.

- [x] Deixar o fundo das imagens dos cartões "Não é apenas sobre receber" verde, igual ao fundo do portal, conferido em computador e celular sem cortes.
- [x] Remover ilustração da abertura de Sobre nós; destacar título e unificar descrição do portal; apresentação com entrada de baixo, sombra e desfoque leves conferida a 320, 390 e 1260px, botão do portal e quatro testes aprovados.

- [x] Refinar Sobre nós e síntese na home: remover links de fonte, ordenar menu, animar indicadores com brilho, arredondar composições e enriquecer ilustrações de painel e portal.
- [x] Conferir mudanças em computador e celular (320, 390, 768, 1024 e 1810px), navegação, contagem crescente, movimento reduzido, traduções e quatro testes; listar arquivos da entrega institucional.

- [x] Criar página institucional /sobre preservando a identidade e a abertura existentes, com narrativa editorial e portal fiel aos recursos reais.
- [x] Verificar e centralizar indicadores históricos da infraestrutura, com fonte documental e atribuição transparente; quatro testes aprovados.
- [x] Adicionar Sobre nós ao menu público e síntese de autoridade na home, sem alterar o hero comercial.
- [x] Validar navegação e menu, PT/EN/ES, metadados, movimento reduzido e telas de 320, 390, 768, 1024 e 1859px; sem transbordamento ou erros de execução.

- [x] Reorganizar navbar: logo à esquerda, links no centro, idioma e acesso à direita; conferido sem transbordamento a 393, 1024 e 1810px.
- [x] Alinhar a marca na mesma linha dos demais elementos, ampliar o logotipo e fixar a barra no topo da página sem acompanhar a rolagem; conferido a 390, 1280 e 1810px.
- [x] Deixar a abertura com um único botão "Crie sua conta grátis agora" com seta e o aviso discreto "Sem mensalidade. Aprovação rápida" abaixo; conferido na prévia.
- [x] Preparar modo visual de mockup no painel solicitado sem alterar dados reais; testes de exemplos e isolamento aprovados.
- [ ] Conferir o modo mockup na tela da conta solicitada: acesso disponível ainda exige concluir ou pular a pesquisa inicial pelo próprio usuário.

- [x] Ajustar valores monetários, jornada persistente acima do faturamento, faixa secundária de indicadores e evolução mensal do MRR; 10 testes aprovados e compilação OK.
- [x] Manter os filtros de período em uma linha só no celular e separar todos os cards complementares no responsivo; conferido a 393px, 768px e 1280px.
- [ ] Conferir visualmente o painel conectado: sessão disponível está bloqueada pela pesquisa inicial pendente; não alterar respostas do usuário para testar.

- [x] Refinar promoção na página Taxas, mostrar 0% à vista com aviso de duração e validar apresentação.

- [x] Corrigir contraste da marca WiizePay na prévia do checkout.
- [x] Ordenar a jornada entre dados, contrato e pagamento.
- [x] Reposicionar o aceite legal junto da ação final.
- [x] Validar visualmente a prévia autenticada e um checkout com cobrança real em desktop e celular.
- [x] Corrigir Faturado para considerar somente pagamentos confirmados e separar cobranças pendentes.
- [x] Acelerar o checkout eliminando consultas repetidas por parcela.
- [x] Retirar imediatamente cobranças excluídas sem pagamento de todos os totais financeiros.
- [x] Corrigir a validação e a mensagem do celular no checkout.
- [x] Elevar o visual das etapas de dados, contrato e pagamento ao padrão fintech da área interna.
- [x] Replicar fielmente as três etapas na prévia do checkout personalizado.
- [x] Validar a prévia, a tipagem e os testes; checkout real conferido pela tela enviada.
- [x] Remover o card externo do checkout, ocupar toda a área útil e iniciar os termos desmarcados.
- [x] Auditar o checkout real e a prévia, corrigir ícones e indicar conteúdo abaixo da tela.
- [x] Reconstruir a prévia do checkout focada em marca, cores, cantos e suporte editáveis.
- [x] Isolar cores e bordas da prévia e mover as ações para abaixo da simulação.
- [x] Trocar o glow dos botões no tema claro por brilho deslizante e leve elevação.
- [x] Mostrar carregamento claro durante o login.
- [x] Corrigir a atividade recente para registrar somente entradas e saídas quando afetarem o saldo.

- [x] Refinar CTA final da página inicial: remover sombra inferior, concentrar o escuro no texto e enriquecer as cores.
- [x] Revisar Política de Privacidade, Política de Pagamentos e Termos/Política de Uso para as funcionalidades atuais, incluindo Portal do Cliente.
- [x] Animar também os textos e a entrada das seções completas nas páginas públicas, preservando desempenho no celular.
- [x] Aproximar a CTA final da página inicial e das páginas de recursos da profundidade visual do hero.

- [x] Cupons de desconto por empresa: painel, aplicação no checkout, reserva e consumo seguros.
- [x] Grupo Cobranças no menu (Central de Recebimentos, Régua Inteligente, Cupons & Incentivos), novas permissões de equipe e menu lateral sem saltos.
- [x] Simplificar as animações públicas para seções e cartões inteiros, sem movimentos nos textos internos.
- [x] Manter hero, CTA e footer estáticos; alternar lateralmente só os cards de funcionalidades e suavizar os demais.
- [x] Pesquisa de boas-vindas com perfil dos clientes e painel agregado no Admin (Operação → Perfil dos clientes).
- [x] Ampliar o objetivo de 90 dias para resultados amplos da WiizePay: centralizar cobrança, simplificar financeiro, contrato + recebimento, portal do cliente e antecipação.
- [x] Reproduzir o design do onboarding do Wiize — LB2, limitar perguntas a 6 opções e adaptar segmentos, desafios, faturamento e objetivos à WiizePay.
- [x] Tornar o onboarding obrigatório antes da área interna e resetar todas as contas para responder novamente.
- [x] Simplificar os ícones dos cartões e permitir pular o onboarding com registro no perfil.
- [x] Ampliar os ícones e mover o pulo definitivo para o canto inferior direito do onboarding.
- [x] Reduzir levemente os ícones, aumentar a fonte dos cartões e levar o "Pular por agora" para a barra inferior no celular.

- [x] Revisar todo o fluxo de ativação: CPF/CNPJ, endereço, valores, perguntas e validação por etapa.
- [x] Tornar os documentos exigidos obrigatórios, compactar imagens e sincronizar com o Asaas com segurança.
- [x] Permitir continuar a ativação no celular por link curto + código, com expiração, uso único e acesso restrito.
- [x] Deixar preparada, mas desativada, a futura opção de envio do acesso por e-mail.
- [x] Guiar fotos de documentos, aceitar PDF e pré-validar resolução, luz, foco e integridade antes do envio.

- [x] Coproduções MVP

- [x] Segurança V1: bloquear membros desativados em todas as funções do servidor (aguarda aprovação).
- [x] Segurança V2: checar permissões específicas no servidor.
- [x] Segurança V3: empresa ativa explícita para quem participa de duas empresas.
- [x] Segurança V4–V6: endereço fixo dos avisos, portal com código por e-mail, tipos de arquivo limitados.
- [x] Alinhar as caixas de taxa 0% às demais e dividir o aviso da promoção: um em cada card (Pix e Boleto), em largura interna total e alinhados na base.
- [x] Cobrança atrasada: juros diários com taxas salvas na cobrança, aviso, cancelar, auto-cancelar 1ª cobrança em 30d, reativar
- [x] Painel da abertura: descer mais ~44px, retirar os dois cartões flutuantes e apagar a linha dura da base; conferir corte suave, sem e-mail, em 1329px e 390px

- [x] Abertura: painel 8px mais alto, moldura cinza suave de 10px em volta da imagem e faixa própria para a seção "Tudo o que você precisa..." (filete, tom mais claro e sombra), com a base do painel dissolvida antes da linha de corte. Conferido a 1280px e 390px, sem e-mail visível, sem rolagem horizontal, compilação OK.

- [x] Abertura: encurtar o vão escuro sob o painel (desfoque de 64px, imagem visível até perto da linha) e pintar a faixa "Tudo o que você precisa..." com a mesma cor da faixa "Da primeira cobrança ao dinheiro na conta" (ambas 0.21 0.018 165). Conferido a 1280px e 390px, sem corte seco, sem rolagem horizontal, compilação OK.

- [x] Abertura no celular: aproximar o título da seção seguinte da linha divisória (topo 48px só abaixo de 1024px) e devolver à seção "Da primeira cobrança..." o espaçamento original de 80px. Conferido a 390px e 1280px, sem corte seco, compilação OK.
- [x] Inverter a ordem das seções "Da primeira cobrança ao dinheiro na conta em 4 passos." e "Tudo o que você precisa para administrar seus recebimentos.", e deixar a segunda com a mesma cor de fundo da seção "Da contratação às próximas cobranças, tudo conectado."; ordem e cores conferidas no navegador, compilação OK.
- 2026-10-16: Espaçamento superior da seção "Da primeira cobrança..." reduzido (pt-14/lg:pt-20); sombra do painel do hero aliviada e degradê de corte mais alto e gradual (home-dashboard-fade 6rem, 3 estágios).

- [x] Reduzir o espaçamento interno da barra superior pública (altura 84→72 px no computador, 72→60 px no celular) e o recorte do menu "Recursos"; computador e celular conferidos, sem texto apertado e sem sobreposição do painel, compilação OK.

- [x] Barra superior mais compacta ainda: altura 72→60 px no computador e 60→52 px no celular, laterais e topo do cabeçalho mais justos; menu "Recursos" reposicionado e conferido no navegador sem sobreposição, compilação OK.

- [x] Botões do site: tirar o halo verde do hover, manter só a subida leve (2px) e fazer um feixe fino de luz atravessar o botão, como no destaque do título; travessia, elevação e ausência de halo conferidas no navegador, compilação OK.

- [ ] Analytics fases 2–5 (funil, eventos do servidor/receita, painel Admin, testes/docs) — plano aprovado 2026-10-19

- [ ] 3DS2 e Central de Contestações Asaas — plano aprovado como base 2026-10-29 com ajustes do usuário; começar pela fundação (banco + webhooks); 3DS só concluído após validação real na conta de produção.
  - Ajustes exigidos: parâmetros/eventos só da documentação oficial Asaas; fluxos parcelado e recorrente separados; 3DS desligado por padrão via configuração; mapear eventos oficiais completos e registrar desconhecidos para diagnóstico (sem descarte silencioso); defesa só marcada como enviada após confirmação da API; RLS/tenant/idempotência/auditoria; apresentar arquivos, migrações e testes antes de alterar o checkout.
  - Fase 1 parcial (2026-10-29): eventos oficiais de 3DS/risco/contestação adicionados à inscrição e ao conversor (asaas.server.ts), processamento de contestações com caso, histórico, aviso e auditoria (chargebacks.server.ts + billing.server.ts), eventos sem mapeamento agora auditados em vez de descartados em silêncio; 11 testes aprovados, compilação OK. PENDENTE: banco de dados inacessível (ENOTFOUND) — migração das 4 tabelas e o bucket privado chargeback-documents não aplicados; SQL guardado em docs/migrations-pendentes/0046_chargebacks_and_payment_authentications.sql para aplicar quando o banco voltar.

