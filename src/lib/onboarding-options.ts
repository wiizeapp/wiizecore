/** Perguntas da pesquisa de boas-vindas da WiizePay. Fonte única para a tela e para o Admin. */
export type OnboardingKey =
  | "role" | "business_type" | "team_size" | "biggest_challenge" | "payment_methods" | "monthly_revenue" | "goal_90d" | "acquisition_source";

export type OnboardingStep = {
  key: OnboardingKey;
  title: string;
  subtitle: string;
  multi?: boolean;
  optional?: boolean;
  options: { id: string; label: string; icon: OnboardingIcon; description?: string }[];
};

export type OnboardingIcon =
  | "owner" | "finance" | "admin" | "commercial" | "consultant" | "other"
  | "services" | "agency" | "freelancer" | "software" | "health"
  | "solo" | "small-team" | "team" | "company" | "enterprise"
  | "late" | "manual" | "organize" | "speed" | "contract" | "all"
  | "pix" | "boleto" | "card" | "transfer" | "cash" | "platform"
  | "wallet" | "coins" | "banknote" | "gem" | "growth" | "private"
  | "centralize" | "simplify" | "contract-payment" | "recurring" | "reminders" | "portal"
  | "google" | "social" | "youtube" | "referral" | "wiize" | "partner";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { key: "role", title: "Qual opção melhor descreve você?", subtitle: "Vamos adaptar a WiizePay ao seu papel na empresa.", options: [
    { id: "dono", label: "Dono / Sócio", icon: "owner" },
    { id: "financeiro", label: "Financeiro", icon: "finance" },
    { id: "administrativo", label: "Administrativo", icon: "admin" },
    { id: "comercial", label: "Comercial", icon: "commercial" },
    { id: "contador", label: "Contador / Consultor", icon: "consultant" },
    { id: "outro", label: "Outro", icon: "other" },
  ] },
  { key: "business_type", title: "Qual é o seu tipo de negócio?", subtitle: "Assim mostramos os recursos que fazem mais sentido para você.", options: [
    { id: "servicos_b2b", label: "Prestadores de serviços", icon: "services" },
    { id: "agencia", label: "Agência / Marketing", icon: "agency" },
    { id: "autonomo", label: "Autônomo / Profissional liberal", icon: "freelancer" },
    { id: "tecnologia", label: "Tecnologia / SaaS / Software", icon: "software" },
    { id: "saude", label: "Saúde e bem-estar", icon: "health" },
    { id: "outro", label: "Outro", icon: "other" },
  ] },
  { key: "team_size", title: "Quantas pessoas trabalham na empresa?", subtitle: "Isso nos ajuda a entender o tamanho da sua operação.", options: [
    { id: "1", label: "Só eu", icon: "solo" },
    { id: "2-5", label: "2 a 5", icon: "small-team" },
    { id: "6-20", label: "6 a 20", icon: "team" },
    { id: "21-100", label: "21 a 100", icon: "company" },
    { id: "100+", label: "Mais de 100", icon: "enterprise" },
  ] },
  { key: "biggest_challenge", title: "Qual seu maior desafio hoje?", subtitle: "Vamos priorizar o que mais impacta o seu caixa.", options: [
    { id: "inadimplencia", label: "Clientes que atrasam ou não pagam", icon: "late" },
    { id: "cobranca_manual", label: "Cobrar clientes manualmente", icon: "manual" },
    { id: "organizar_financas", label: "Organizar as finanças", icon: "organize" },
    { id: "receber_rapido", label: "Receber mais rápido", icon: "speed" },
    { id: "contratos", label: "Formalizar contratos", icon: "contract" },
    { id: "todos", label: "Todos os desafios acima", icon: "all" },
  ] },
  { key: "payment_methods", title: "Como você recebe dos clientes hoje?", subtitle: "Pode marcar mais de uma opção.", multi: true, options: [
    { id: "pix", label: "Pix", icon: "pix" },
    { id: "boleto", label: "Boleto", icon: "boleto" },
    { id: "cartao", label: "Cartão", icon: "card" },
    { id: "transferencia", label: "Transferência", icon: "transfer" },
    { id: "dinheiro", label: "Dinheiro", icon: "cash" },
    { id: "outra_plataforma", label: "Outra plataforma de pagamento", icon: "platform" },
  ] },
  { key: "monthly_revenue", title: "Quanto sua empresa fatura por mês?", subtitle: "Opcional, usado só para personalizar recomendações.", optional: true, options: [
    { id: "ate-20k", label: "Até R$ 20 mil", icon: "wallet" },
    { id: "20k-100k", label: "R$ 20 mil a R$ 100 mil", icon: "coins" },
    { id: "100k-500k", label: "R$ 100 mil a R$ 500 mil", icon: "banknote" },
    { id: "500k-1m", label: "R$ 500 mil a R$ 1 milhão", icon: "gem" },
    { id: "1m+", label: "Mais de R$ 1 milhão", icon: "growth" },
    { id: "nao-dizer", label: "Prefiro não dizer", icon: "private" },
  ] },
  { key: "goal_90d", title: "Qual resultado quer nos próximos 90 dias?", subtitle: "Vamos montar seus primeiros passos na WiizePay a partir disso.", options: [
    { id: "centralizar_cobranca", label: "Centralizar cobranças", description: "Reunir toda a cobrança da operação em um só lugar.", icon: "centralize" },
    { id: "controle_financeiro", label: "Simplificar o financeiro", description: "Controlar entradas, saídas e saldo sem depender de planilhas.", icon: "simplify" },
    { id: "contrato_e_cobranca", label: "Contratos e pagamentos", description: "Assinar contratos e receber pagamentos no mesmo fluxo.", icon: "contract-payment" },
    { id: "cobranca_recorrente", label: "Automatizar recorrências", description: "Cobrar mensalidades com Pix Automático e recorrência.", icon: "recurring" },
    { id: "reduzir_atrasos", label: "Reduzir atrasos", description: "Usar lembretes inteligentes para receber no prazo.", icon: "reminders" },
    { id: "portal_cliente", label: "Dar autonomia ao cliente", description: "Oferecer 2ª via, recibos e notas em um portal próprio.", icon: "portal" },
  ] },
  { key: "acquisition_source", title: "Como você conheceu a WiizePay?", subtitle: "Só para sabermos por onde você chegou.", options: [
    { id: "google", label: "Google", icon: "google" },
    { id: "instagram_tiktok", label: "Instagram / TikTok", icon: "social" },
    { id: "youtube", label: "YouTube", icon: "youtube" },
    { id: "indicacao", label: "Indicação", icon: "referral" },
    { id: "wiize", label: "Pelo Wiize CRM", icon: "wiize" },
    { id: "outro", label: "Outro", icon: "other" },
  ] },
];

export const validOption = (key: OnboardingKey, id: string) =>
  ONBOARDING_STEPS.find((s) => s.key === key)?.options.some((o) => o.id === id) ?? false;
