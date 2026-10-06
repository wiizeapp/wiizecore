export const customerStatusLabels: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  overdue: "Em atraso",
  suspended: "Suspenso",
  closed: "Encerrado",
};

export const customerTypeLabels: Record<string, string> = {
  individual: "Pessoa física",
  company: "Pessoa jurídica",
};

export const serviceTypeLabels: Record<string, string> = {
  one_time: "Pagamento único",
  installment: "Parcelado",
  recurring: "Recorrente",
};

export const frequencyLabels: Record<string, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  yearly: "Anual",
};

export const contractStatusLabels: Record<string, string> = {
  draft: "Rascunho",
  awaiting_customer: "Aguardando cliente",
  awaiting_provider: "Aguardando prestador",
  signed: "Assinado",
  cancelled: "Cancelado",
  expired: "Expirado",
};

export const paymentMethodLabels: Record<string, string> = {
  undefined: "Personalizado (cliente escolhe)",
  pix: "Pix",
  pix_automatic: "Pix Automático",
  credit_card: "Cartão de crédito",
  boleto: "Boleto",
  debit_card: "Débito em conta",
};

export const paymentStatusLabels: Record<string, string> = {
  created: "Criada",
  awaiting_payment: "Aguardando pagamento",
  processing: "Processando",
  paid: "Paga",
  overdue: "Vencida",
  cancelled: "Cancelada",
  refunded: "Estornada",
  in_analysis: "Em análise",
  failed: "Falhou",
};

export const tenantRoleLabels: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  finance: "Financeiro",
  viewer: "Leitura",
};
