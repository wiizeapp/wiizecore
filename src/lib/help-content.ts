/**
 * Conteúdo da Central de Ajuda. Só documenta o que existe hoje no produto.
 * Taxas NUNCA são escritas aqui: os artigos de taxas exibem o widget que lê a configuração ativa.
 * Prazos vêm de `settlement-rules.ts`. Ao revisar o texto, atualize `updated`.
 */
export const HELP_REVIEWED_AT = "2026-10-15";

export type HelpCategoryId = "primeiros-passos" | "taxas-e-prazos" | "cobrancas" | "pix-e-recorrencia" | "cartao" | "recebimentos" | "notas-fiscais" | "contratos" | "seguranca" | "duvidas";
export type HelpWidget = "fees" | "settlement" | "fee-calc" | "anticipation-calc";

export type HelpArticle = {
  slug: string; category: HelpCategoryId; title: string; summary: string; minutes: number; updated: string;
  body?: string[]; steps?: string[]; notes?: string[]; pending?: string;
  link?: { to: string; label: string }; widget?: HelpWidget; related?: string[];
};

export const HELP_CATEGORIES: { id: HelpCategoryId; title: string; description: string; icon: string }[] = [
  { id: "primeiros-passos", title: "Primeiros passos", description: "Conta, ativação e navegação pelo painel.", icon: "rocket" },
  { id: "taxas-e-prazos", title: "Taxas e prazos", description: "Quanto custa e quando o dinheiro fica disponível.", icon: "percent" },
  { id: "cobrancas", title: "Cobranças e pagamentos", description: "Criar, enviar e acompanhar cobranças.", icon: "receipt" },
  { id: "pix-e-recorrencia", title: "Pix e recorrência", description: "Pix à vista, Pix Automático e assinaturas.", icon: "qr" },
  { id: "cartao", title: "Cartão e parcelamento", description: "Crédito, débito, parcelas e recusas.", icon: "card" },
  { id: "recebimentos", title: "Recebimentos e antecipação", description: "Recebíveis, calendário, saques e antecipação.", icon: "wallet" },
  { id: "notas-fiscais", title: "Notas fiscais e documentos", description: "Emissão integrada e arquivos.", icon: "file" },
  { id: "contratos", title: "Contratos e assinaturas", description: "Contratos digitais ligados às cobranças.", icon: "sign" },
  { id: "seguranca", title: "Segurança e conta", description: "Senhas, verificação em duas etapas e acesso.", icon: "shield" },
  { id: "duvidas", title: "Dúvidas frequentes", description: "Respostas rápidas para as perguntas mais comuns.", icon: "help" },
];

const U = HELP_REVIEWED_AT;
const SETTLE_NOTE = "Os prazos são previsões. O saldo só é liberado depois que a infraestrutura de pagamentos (Asaas) confirma a liquidação. Feriados estaduais e municipais podem mudar a data.";

export const HELP_ARTICLES: HelpArticle[] = [
  // Primeiros passos
  { slug: "como-funciona-a-wiizepay", category: "primeiros-passos", title: "Como funciona a Wiize Core", summary: "Visão geral da plataforma: clientes, serviços, cobranças e recebimentos em um só lugar.", minutes: 3, updated: U,
    body: ["A Wiize Core reúne o que uma empresa de serviços precisa para cobrar: cadastro de clientes e serviços, cobranças por Pix, boleto e cartão, contratos digitais, lembretes de cobrança, notas fiscais e gestão financeira.", "Os pagamentos são processados pela Asaas, nossa infraestrutura de pagamentos. As taxas cobradas de você são definidas pela Wiize Core e aparecem em Taxas e prazos.", "O fluxo comum é: cadastrar o cliente, cadastrar o serviço, gerar a cobrança, enviar o link e acompanhar o pagamento até o saldo ficar disponível."],
    link: { to: "/painel", label: "Abrir o Dashboard" }, related: ["navegar-pelo-dashboard", "ativar-pagamentos", "criar-cobranca"] },
  { slug: "acessar-e-configurar-a-conta", category: "primeiros-passos", title: "Como acessar e configurar a conta", summary: "Entrar, completar o perfil e os dados da empresa.", minutes: 2, updated: U,
    steps: ["Entre com seu e-mail e senha ou com sua conta Google.", "Responda à pesquisa de boas-vindas (você pode pular e voltar depois).", "No menu lateral, abra Configurações › Dados e conta.", "Revise os dados da empresa e salve.", "Em Configurações › Segurança, crie a senha financeira e ative a verificação em duas etapas."],
    body: ["A senha financeira é pedida em operações sensíveis, como saques."], link: { to: "/configuracoes", label: "Abrir Dados e conta" }, related: ["completar-dados-da-empresa", "manter-conta-segura"] },
  { slug: "ativar-pagamentos", category: "primeiros-passos", title: "Análise e aprovação cadastral", summary: "Como funciona a ativação para receber pagamentos reais.", minutes: 3, updated: U,
    body: ["Para receber pagamentos reais, a empresa passa por uma análise cadastral. A Wiize Core envia seus dados e documentos para a Asaas, que é quem decide a aprovação. A equipe Wiize Core não aprova nem recusa contas manualmente.", "Enquanto a análise não termina, o selo no topo do painel mostra a situação dos pagamentos."],
    steps: ["Abra Configurações › Ativar pagamentos.", "Preencha os dados da empresa e do responsável.", "Envie os documentos pedidos (é possível continuar pelo celular com um link e um código).", "Envie para análise e acompanhe a situação na mesma tela.", "Se aparecer “Ação necessária”, corrija o que for indicado e envie de novo."],
    notes: ["O prazo da análise depende da Asaas e não é garantido pela Wiize Core."], link: { to: "/ativacao", label: "Abrir Ativar pagamentos" }, related: ["completar-dados-da-empresa", "como-funciona-a-wiizepay"] },
  { slug: "completar-dados-da-empresa", category: "primeiros-passos", title: "Como completar os dados da empresa", summary: "Dados cadastrais, endereço e conta bancária para saque.", minutes: 2, updated: U,
    steps: ["Abra Configurações › Dados e conta.", "Complete razão social, documento e contato.", "Cadastre a conta bancária que vai receber os saques.", "Salve as alterações."], body: ["Os dados bancários são guardados de forma criptografada; na tela aparecem apenas mascarados."],
    link: { to: "/configuracoes", label: "Abrir Dados e conta" }, related: ["ativar-pagamentos", "corrigir-dados-cadastrais"] },
  { slug: "navegar-pelo-dashboard", category: "primeiros-passos", title: "Como navegar pelo dashboard", summary: "O que fica em cada parte do menu lateral.", minutes: 2, updated: U,
    body: ["Dashboard: resumo do saldo, previsão de recebimentos e novos clientes.", "Operação: Clientes, Serviços, Contratos, Arquivos e documentos e o grupo Cobranças (Central de Recebimentos, Lembrete inteligente, Cupons & Incentivos e Coproduções).", "Gestão: Gestão financeira e Notas Fiscais.", "Financeiro: Visão financeira, Extrato completo, Recebíveis, Limites de saque, Receba mais rápido e Multas e encargos.", "Configurações: dados da conta, aparência do checkout, ativação, segurança, equipe e integrações.", "No rodapé do menu ficam seu perfil, o tema, a Central de Ajuda e Sair. O botão Criar cobrança fica sempre no topo da tela."],
    link: { to: "/painel", label: "Abrir o Dashboard" }, related: ["consultar-dados-financeiros"] },
  { slug: "consultar-dados-financeiros", category: "primeiros-passos", title: "Como consultar os dados financeiros da conta", summary: "Saldo, extrato e recebíveis.", minutes: 2, updated: U,
    body: ["Em Financeiro › Visão financeira você vê o saldo disponível e o que ainda vai ser liberado.", "Em Extrato completo ficam todas as movimentações: pagamentos, taxas, estornos e saques.", "Em Recebíveis aparecem os valores já pagos pelos clientes que ainda aguardam liberação, com a data prevista."],
    link: { to: "/financeiro", label: "Abrir Visão financeira" }, related: ["valores-a-receber", "saques-e-transferencias"] },

  // Taxas e prazos
  { slug: "tabela-de-taxas", category: "taxas-e-prazos", title: "Tabela de taxas por modalidade", summary: "Percentual e tarifa fixa de Pix, Pix Automático, boleto, débito e cartão, lidos da configuração vigente.", minutes: 3, updated: U, widget: "fees",
    body: ["Os valores abaixo vêm direto da configuração comercial ativa da Wiize Core — a mesma usada no checkout e no cálculo das cobranças.", "Taxa = valor da venda × percentual + tarifa fixa. No boleto e no Pix parcelado, a tarifa fixa incide por parcela; no cartão, uma vez por venda."],
    notes: ["Se uma modalidade não aparecer na tabela, ela não está disponível para cobrança no momento."], related: ["prazos-de-liquidacao", "exemplos-de-calculo", "taxas-cartao-parcelado"] },
  { slug: "taxas-cartao-parcelado", category: "taxas-e-prazos", title: "Cartão parcelado: condições por número de parcelas", summary: "Faixas de 2 a 6, 7 a 12 e acima de 12 parcelas.", minutes: 2, updated: U, widget: "fees",
    body: ["No cartão de crédito a taxa muda conforme a faixa de parcelas. A faixa é escolhida pelo número total de parcelas da venda.", "Parcelas acima de 12 só aparecem se estiverem habilitadas na configuração vigente."], related: ["tabela-de-taxas", "parcelas-e-recebimentos"] },
  { slug: "prazos-de-liquidacao", category: "taxas-e-prazos", title: "Prazos de liquidação e disponibilidade do saldo", summary: "A partir de quando cada modalidade costuma ficar disponível.", minutes: 3, updated: U, widget: "settlement",
    body: ["A contagem começa na confirmação do pagamento (Pix, boleto e débito) ou na data da operação (cartão de crédito).", "Dias úteis são de segunda a sexta, sem feriados nacionais."], notes: [SETTLE_NOTE],
    pending: "Condições específicas da conta integrada na Asaas podem ser diferentes das regras públicas e estão em validação.", related: ["valores-a-receber", "como-funciona-antecipacao"] },
  { slug: "saques-e-transferencias", category: "taxas-e-prazos", title: "Transferências e saques", summary: "Como sacar o saldo disponível para sua conta bancária.", minutes: 2, updated: U,
    steps: ["Abra Financeiro › Visão financeira.", "Clique para solicitar saque.", "Informe o valor (respeitando o mínimo e o limite exibidos).", "Confirme com a senha financeira e a verificação em duas etapas, quando pedida."],
    body: ["A tarifa de saque e o valor mínimo aparecem na própria tela e em Taxas e prazos. Só o saldo disponível pode ser sacado."], link: { to: "/financeiro", label: "Abrir Visão financeira" }, related: ["limites-de-saque", "liquidacao-x-antecipacao-x-saque"] },
  { slug: "exemplos-de-calculo", category: "taxas-e-prazos", title: "Exemplos de cálculo e calculadora de taxas", summary: "Simule o custo e o valor líquido de uma venda.", minutes: 2, updated: U, widget: "fee-calc",
    body: ["Use a calculadora para ver a taxa estimada, o valor líquido e o prazo de cada modalidade com as taxas vigentes."], related: ["tabela-de-taxas", "simular-antecipacao"] },

  // Cobranças
  { slug: "criar-cobranca", category: "cobrancas", title: "Como criar uma cobrança", summary: "Passo a passo para gerar a cobrança e o link de pagamento.", minutes: 3, updated: U,
    steps: ["Clique em Criar cobrança, no topo de qualquer tela (ou em Cobranças › Central de Recebimentos).", "Selecione o cliente ou cadastre um novo.", "Escolha o serviço e confira o valor e a descrição.", "Defina o vencimento.", "Escolha a forma de pagamento: Pix, boleto ou cartão.", "Se quiser, configure parcelas, multa e juros e um plano de lembretes.", "Se houver contrato, vincule-o: o cliente assina antes de pagar.", "Revise as taxas exibidas e gere a cobrança.", "Copie o link e envie por WhatsApp ou e-mail.", "Acompanhe a situação na Central de Recebimentos."],
    body: ["O link da cobrança é permanente: se o cliente trocar a forma de pagamento, a mesma cobrança continua valendo."], link: { to: "/cobrancas", label: "Abrir Central de Recebimentos" }, related: ["status-do-pagamento", "compartilhar-cobranca", "cobranca-parcelada"] },
  { slug: "cobranca-parcelada", category: "cobrancas", title: "Cobrança à vista, parcelada ou recorrente", summary: "Diferenças entre os tipos de serviço e de cobrança.", minutes: 2, updated: U,
    body: ["O tipo vem do serviço cadastrado: avulso (à vista), parcelado ou recorrente (assinatura com frequência semanal a anual).", "No cartão, o parcelamento é feito na fatura do cliente. No boleto e no Pix, cada parcela é uma cobrança própria, com tarifa fixa por parcela."],
    link: { to: "/servicos", label: "Abrir Serviços" }, related: ["criar-cobranca", "configurar-recorrencia", "tabela-de-taxas"] },
  { slug: "link-de-checkout-do-servico", category: "cobrancas", title: "Link de checkout do serviço", summary: "Um link por serviço em que o próprio cliente se cadastra e paga.", minutes: 2, updated: U,
    steps: ["Abra Serviços.", "No serviço ativo, clique em Criar link de checkout.", "Use Copiar para enviar o link.", "Quem abrir preenche os dados, escolhe a forma de pagamento e paga; o cliente e a cobrança são criados automaticamente.", "Use Desativar para encerrar o link."], link: { to: "/servicos", label: "Abrir Serviços" }, related: ["criar-cobranca"] },
  { slug: "compartilhar-cobranca", category: "cobrancas", title: "Como compartilhar uma cobrança", summary: "Enviar o link e o que o cliente vê.", minutes: 2, updated: U,
    body: ["Na cobrança, copie o link e envie pelo canal que preferir.", "O cliente segue a ordem: confirma os dados, assina o contrato (se houver) e paga. Nenhuma etapa pode ser pulada.", "A aparência do checkout pode ser personalizada em Configurações › Aparência do checkout."], related: ["criar-cobranca", "status-do-pagamento"] },
  { slug: "status-do-pagamento", category: "cobrancas", title: "Como acompanhar o status de um pagamento", summary: "O que significa cada situação da cobrança.", minutes: 2, updated: U,
    body: ["Aguardando pagamento: a cobrança foi gerada e ainda não foi paga.", "Em processamento / em análise: o pagamento foi iniciado e aguarda retorno.", "Paga: a infraestrutura de pagamentos confirmou o pagamento.", "Vencida: passou do vencimento sem pagamento.", "Cancelada, estornada ou falhou: não houve recebimento.", "A situação só muda quando a Asaas confirma — nunca por ação manual."],
    link: { to: "/cobrancas", label: "Abrir Central de Recebimentos" }, related: ["pagamentos-nao-concluidos", "historico-de-cobrancas"] },
  { slug: "historico-de-cobrancas", category: "cobrancas", title: "Histórico e cancelamento de cobranças", summary: "Consultar cobranças antigas e cancelar quando permitido.", minutes: 2, updated: U,
    body: ["Na Central de Recebimentos, use a busca e os filtros para encontrar cobranças por cliente, valor ou situação.", "No Cliente 360 (abrindo o cliente) aparece o histórico completo, inclusive cada etapa do checkout.", "Cobranças ainda não pagas podem ser canceladas na própria cobrança. Cobranças pagas não são canceladas: nesse caso, use o estorno."],
    related: ["estornos-e-contestacoes", "status-do-pagamento"] },
  { slug: "pagamentos-nao-concluidos", category: "cobrancas", title: "Como lidar com pagamentos não concluídos", summary: "Vencidos, recusados ou abandonados.", minutes: 2, updated: U,
    body: ["Com um plano da Lembrete inteligente, o cliente recebe lembretes automáticos antes e depois do vencimento.", "Você pode regularizar a cobrança ou mudar a forma de pagamento; o mesmo link continua valendo.", "Multas e juros seguem o que foi configurado em Multas e encargos."], link: { to: "/lembrete-de-cobranca", label: "Abrir Lembrete inteligente" }, related: ["status-do-pagamento", "falha-de-pagamento-recorrente"] },

  // Pix e recorrência
  { slug: "pix-a-vista", category: "pix-e-recorrencia", title: "Como funciona o Pix à vista", summary: "QR Code e copia-e-cola com confirmação rápida.", minutes: 2, updated: U, widget: "fees",
    body: ["O cliente paga pelo QR Code ou pelo código copia-e-cola. A confirmação costuma ser rápida, e o prazo de liberação aparece em Prazos de liquidação."], related: ["pix-automatico", "prazos-de-liquidacao"] },
  { slug: "pix-automatico", category: "pix-e-recorrencia", title: "Como funciona o Pix Automático", summary: "Pagamentos recorrentes por Pix com autorização do pagador.", minutes: 3, updated: U,
    body: ["No Pix Automático o cliente autoriza uma vez, no aplicativo do banco dele, e as próximas cobranças são debitadas nas datas combinadas.", "Depende das regras do Banco Central, da autorização do pagador, do banco dele e das condições operacionais da Asaas. O pagador pode cancelar a autorização a qualquer momento pelo banco.", "A situação da autorização aparece na cobrança recorrente."],
    pending: "Prazos de liquidação específicos do Pix Automático na conta integrada estão em validação com a Asaas.", related: ["configurar-recorrencia", "diferencas-pix-cartao"] },
  { slug: "configurar-recorrencia", category: "pix-e-recorrencia", title: "Como configurar uma cobrança recorrente", summary: "Assinaturas por cartão ou Pix Automático.", minutes: 2, updated: U,
    steps: ["Em Serviços, cadastre um serviço do tipo recorrente e escolha a frequência.", "Crie a cobrança para o cliente usando esse serviço.", "Escolha cartão de crédito ou Pix Automático.", "Envie o link: no primeiro pagamento o cliente autoriza as próximas cobranças.", "Acompanhe os ciclos na Central de Recebimentos e no Cliente 360."],
    link: { to: "/servicos", label: "Abrir Serviços" }, related: ["pix-automatico", "ciclo-da-assinatura"] },
  { slug: "falha-de-pagamento-recorrente", category: "pix-e-recorrencia", title: "Pagamentos recorrentes pendentes ou com falha", summary: "O que fazer quando um ciclo não é pago.", minutes: 2, updated: U,
    body: ["Ciclos não pagos aparecem como pendentes ou vencidos na Central de Recebimentos.", "Motivos comuns: autorização cancelada, saldo insuficiente ou cartão recusado.", "Fale com o cliente, peça para atualizar a forma de pagamento pelo link da cobrança e use a Lembrete inteligente para lembretes."], related: ["pagamentos-nao-concluidos", "pagamento-recusado"] },
  { slug: "diferencas-pix-cartao", category: "pix-e-recorrencia", title: "Pix à vista, Pix Automático e cartão recorrente", summary: "Quando usar cada um.", minutes: 2, updated: U,
    body: ["Pix à vista: pagamento único, liberação rápida.", "Pix Automático: recorrente, sem cartão, depende da autorização no banco do pagador.", "Cartão recorrente: cobrado no cartão a cada ciclo; o prazo segue as regras do cartão.", "As taxas de cada um estão na tabela de taxas."], related: ["tabela-de-taxas", "pix-automatico"] },

  // Cartão
  { slug: "pagamento-no-cartao", category: "cartao", title: "Como funciona o pagamento no cartão", summary: "Crédito à vista, parcelado e débito.", minutes: 2, updated: U, widget: "fees",
    body: ["O cliente digita os dados do cartão no checkout seguro. A Wiize Core nunca guarda o número completo nem o código de segurança.", "A cobrança só aparece como paga depois da confirmação da infraestrutura de pagamentos."], related: ["parcelas-e-recebimentos", "pagamento-recusado"] },
  { slug: "parcelas-e-recebimentos", category: "cartao", title: "Parcelas e recebimentos no cartão", summary: "Cada parcela é liberada em uma data diferente.", minutes: 2, updated: U, widget: "settlement",
    body: ["No crédito parcelado, cada parcela tem sua própria previsão de liberação, contada a partir da data da operação.", "Em Recebíveis você vê o valor previsto e, depois, o valor efetivamente liberado."], notes: [SETTLE_NOTE], related: ["como-funciona-antecipacao", "previsto-x-recebido"] },
  { slug: "calcular-valor-liquido", category: "cartao", title: "Como calcular o valor líquido de uma venda", summary: "Calculadora com as taxas vigentes.", minutes: 2, updated: U, widget: "fee-calc", body: ["Informe o valor, a modalidade e as parcelas para ver o valor líquido estimado."], related: ["tabela-de-taxas"] },
  { slug: "previsto-x-recebido", category: "cartao", title: "Valores previstos e efetivamente recebidos", summary: "Por que a data e o valor podem mudar.", minutes: 2, updated: U,
    body: ["O valor previsto é calculado pela Wiize Core ao confirmar o pagamento. O valor e a data efetivos vêm da liquidação informada pela Asaas.", "Diferenças podem acontecer por feriados locais, estornos, contestações ou análise de risco."], related: ["valores-a-receber", "estornos-e-contestacoes"] },
  { slug: "pagamento-recusado", category: "cartao", title: "Como lidar com pagamentos recusados", summary: "Recusa pelo banco emissor ou pela análise antifraude.", minutes: 2, updated: U,
    body: ["A recusa é decidida pelo banco do cliente ou pela análise de segurança. A Wiize Core não consegue aprovar uma transação recusada.", "Peça ao cliente para tentar outro cartão ou outra forma de pagamento pelo mesmo link."], related: ["pagamentos-nao-concluidos"] },
  { slug: "estornos-e-contestacoes", category: "cartao", title: "Cancelamentos, estornos e contestações", summary: "Devolver um pagamento e o que é chargeback.", minutes: 3, updated: U,
    body: ["Estorno: você devolve um pagamento já recebido, total ou parcialmente, pela própria cobrança paga. O valor sai do seu saldo.", "Contestação (chargeback): o portador do cartão contesta a compra no banco. O valor pode ficar bloqueado até a decisão.", "Guarde contratos, comprovantes de entrega e conversas: eles ajudam na defesa."],
    pending: "Prazos de devolução e de resposta a contestações seguem as regras da Asaas e das bandeiras, em validação para a conta integrada.", related: ["historico-de-cobrancas"] },

  // Recebimentos
  { slug: "valores-a-receber", category: "recebimentos", title: "Valores a receber e calendário de liquidação", summary: "Onde ver o que já foi pago e ainda vai ser liberado.", minutes: 2, updated: U, widget: "settlement",
    body: ["Abra Financeiro › Recebíveis para ver cada recebível com a data prevista e a situação (aguardando liquidação, disponível, antecipado…)."], notes: [SETTLE_NOTE], link: { to: "/recebiveis", label: "Abrir Recebíveis" }, related: ["prazos-de-liquidacao", "como-funciona-antecipacao"] },
  { slug: "como-funciona-antecipacao", category: "recebimentos", title: "Como funciona a antecipação", summary: "Receber antes um valor que já foi pago pelo cliente.", minutes: 3, updated: U,
    body: ["Só podem ser antecipados recebíveis de pagamentos já confirmados, que a Asaas marque como elegíveis. Cobranças em aberto ou vencidas nunca são elegíveis. Pix não é antecipado.", "A taxa é mensal e proporcional aos dias que faltam para a data prevista de cada recebível.", "Na tela Receba mais rápido você simula, confirma com segurança e acompanha a solicitação. O valor definitivo é o informado pela Asaas na simulação."],
    steps: ["Abra Financeiro › Receba mais rápido.", "Escolha os recebíveis elegíveis.", "Simule e confira o custo e o valor líquido.", "Confirme com a senha financeira.", "Acompanhe a análise (cartão até 2 dias úteis; boleto até 3 dias úteis)."],
    link: { to: "/antecipacao", label: "Abrir Receba mais rápido" }, related: ["simular-antecipacao", "impedimentos-antecipacao"] },
  { slug: "simular-antecipacao", category: "recebimentos", title: "Simular o custo da antecipação", summary: "Calculadora por recebível, com taxa mensal proporcional.", minutes: 2, updated: U, widget: "anticipation-calc",
    body: ["A simulação aqui é informativa. A cotação oficial é feita na tela Receba mais rápido, com os recebíveis reais."], related: ["como-funciona-antecipacao"] },
  { slug: "impedimentos-antecipacao", category: "recebimentos", title: "O que pode impedir uma antecipação", summary: "Elegibilidade e análise.", minutes: 2, updated: U,
    body: ["Recebível ainda não confirmado, já liberado ou já antecipado.", "Contestação, estorno ou análise de risco em andamento.", "Recusa na análise da Asaas.", "Modalidade não elegível (como Pix)."], related: ["como-funciona-antecipacao"] },
  { slug: "liquidacao-x-antecipacao-x-saque", category: "recebimentos", title: "Liquidação, antecipação e saque: diferenças", summary: "Três momentos diferentes do dinheiro.", minutes: 2, updated: U,
    body: ["Liquidação: o recebível fica disponível no saldo na data normal, sem custo extra.", "Antecipação: você pede para receber antes, pagando a taxa de antecipação.", "Saque: você transfere o saldo disponível para sua conta bancária."], related: ["saques-e-transferencias", "como-funciona-antecipacao"] },
  { slug: "limites-de-saque", category: "recebimentos", title: "Limites de saque", summary: "Limites por operação e como pedir aumento.", minutes: 1, updated: U,
    body: ["Em Financeiro › Limites de saque você vê seus limites atuais e pode solicitar aumento, que passa por análise."], link: { to: "/limites", label: "Abrir Limites de saque" }, related: ["saques-e-transferencias"] },

  // Notas fiscais
  { slug: "emitir-nota-fiscal", category: "notas-fiscais", title: "Como funciona a emissão de notas fiscais", summary: "Notas de serviço integradas às cobranças.", minutes: 3, updated: U,
    steps: ["Abra Notas Fiscais e conclua a configuração fiscal (dados da prefeitura, regime e serviço).", "Cadastre os serviços fiscais.", "Emita a nota para uma cobrança ou configure a emissão para assinaturas.", "Acompanhe a situação de cada nota na lista."],
    body: ["Cada nota autorizada tem a tarifa exibida em Taxas e prazos.", "A emissão depende da prefeitura do seu município e do serviço integrado estar disponível."], link: { to: "/notas-fiscais", label: "Abrir Notas Fiscais" }, related: ["erros-de-emissao"] },
  { slug: "erros-de-emissao", category: "notas-fiscais", title: "Erros de emissão e como corrigir", summary: "Notas recusadas pela prefeitura.", minutes: 2, updated: U,
    body: ["Quando a prefeitura recusa, a nota mostra o motivo. Os erros mais comuns são dados fiscais da empresa ou do cliente incompletos.", "Corrija em Notas Fiscais › configurações ou no cadastro do cliente e emita novamente."], related: ["emitir-nota-fiscal", "corrigir-dados-cadastrais"] },
  { slug: "consultar-documentos", category: "notas-fiscais", title: "Como consultar documentos e arquivos", summary: "Notas, contratos e comprovantes.", minutes: 1, updated: U,
    body: ["Em Arquivos e documentos ficam os arquivos da empresa e dos clientes. Se o Google Drive estiver conectado em Integrações, os documentos são guardados lá.", "O cliente final acessa seus documentos e cobranças pela Central do Cliente."], link: { to: "/documentos", label: "Abrir Arquivos e documentos" }, related: ["emitir-nota-fiscal"] },

  // Contratos
  { slug: "usar-contratos", category: "contratos", title: "Como usar contratos digitais", summary: "Criar, vincular a cobranças e acompanhar assinaturas.", minutes: 3, updated: U,
    steps: ["Abra Contratos e crie um contrato.", "Envie o documento e marque onde cada pessoa assina.", "Vincule o contrato à cobrança do cliente.", "O cliente assina no checkout antes de pagar.", "Acompanhe as assinaturas e baixe o documento assinado."],
    body: ["Cada assinatura tem um código de verificação público."], link: { to: "/contratos", label: "Abrir Contratos" }, related: ["ciclo-da-assinatura"] },
  { slug: "ciclo-da-assinatura", category: "contratos", title: "Ciclo de uma assinatura e alterações", summary: "Acompanhar cobranças recorrentes e mudanças.", minutes: 2, updated: U,
    body: ["Os ciclos aparecem no Cliente 360 e na Central de Recebimentos.", "Para mudar valor ou condições de forma relevante, faça uma nova versão do contrato e uma nova cobrança. Para encerrar, cancele as próximas cobranças."], related: ["configurar-recorrencia", "usar-contratos"] },

  // Segurança
  { slug: "manter-conta-segura", category: "seguranca", title: "Como manter a conta segura", summary: "Senha, senha financeira e verificação em duas etapas.", minutes: 2, updated: U,
    body: ["Ative a verificação em duas etapas em Configurações › Segurança e guarde o código de recuperação.", "A senha financeira é pedida em saques e operações sensíveis. Três erros seguidos bloqueiam temporariamente o acesso da empresa.", "Nunca compartilhe senhas nem códigos. A equipe Wiize Core nunca pede essas informações."], link: { to: "/seguranca", label: "Abrir Segurança" }, related: ["problemas-de-acesso", "equipe-e-permissoes"] },
  { slug: "equipe-e-permissoes", category: "seguranca", title: "Equipe e permissões", summary: "Convidar pessoas com acesso limitado.", minutes: 1, updated: U,
    body: ["Em Configurações › Equipe e permissões você convida pessoas e define o que cada uma pode ver e fazer."], link: { to: "/equipe", label: "Abrir Equipe e permissões" }, related: ["manter-conta-segura"] },
  { slug: "corrigir-dados-cadastrais", category: "seguranca", title: "Como atualizar os dados cadastrais", summary: "Perfil e dados da empresa.", minutes: 1, updated: U,
    body: ["Seus dados pessoais ficam em Meu perfil (clique no seu nome no rodapé do menu). Os dados da empresa ficam em Configurações › Dados e conta."], link: { to: "/perfil", label: "Abrir Meu perfil" }, related: ["completar-dados-da-empresa"] },
  { slug: "problemas-de-acesso", category: "seguranca", title: "Problemas de acesso e suporte", summary: "Esqueci a senha, perdi o autenticador ou preciso de ajuda.", minutes: 2, updated: U,
    body: ["Esqueceu a senha: use “Esqueci minha senha” na tela de entrada. A verificação em duas etapas continua ativa.", "Perdeu o autenticador: use o código de recuperação.", "Para outros casos, fale com o suporte pela página de Suporte. Os Termos de uso e a Política de privacidade estão no rodapé do site."], link: { to: "/suporte", label: "Abrir Suporte" }, related: ["manter-conta-segura"] },
];

export const HELP_FAQ: { q: string; a: string; slug: string }[] = [
  { q: "Quanto custa receber?", a: "Depende da modalidade. A tabela vigente fica em Taxas e prazos.", slug: "tabela-de-taxas" },
  { q: "Quando o dinheiro cai no saldo?", a: "Cada modalidade tem um prazo previsto; o saldo só é liberado após a confirmação da Asaas.", slug: "prazos-de-liquidacao" },
  { q: "Posso receber antes?", a: "Sim, recebíveis confirmados e elegíveis podem ser antecipados com custo proporcional aos dias.", slug: "como-funciona-antecipacao" },
  { q: "Por que a cobrança ainda não aparece como paga?", a: "A situação só muda quando a infraestrutura de pagamentos confirma o pagamento.", slug: "status-do-pagamento" },
  { q: "Quem aprova minha conta?", a: "A análise cadastral é feita pela Asaas. A Wiize Core envia os dados e mostra a situação.", slug: "ativar-pagamentos" },
  { q: "Como cancelo uma cobrança paga?", a: "Cobranças pagas não são canceladas; use o estorno.", slug: "estornos-e-contestacoes" },
  { q: "O cliente pode pagar parcelado?", a: "Sim, no cartão de crédito e em parcelas de boleto ou Pix, conforme o serviço.", slug: "cobranca-parcelada" },
  { q: "Como funciona o Pix Automático?", a: "O cliente autoriza uma vez no banco e os próximos ciclos são debitados automaticamente.", slug: "pix-automatico" },
];

export const articleBySlug = (slug: string) => HELP_ARTICLES.find((a) => a.slug === slug);
export const categoryById = (id: string) => HELP_CATEGORIES.find((c) => c.id === id);
