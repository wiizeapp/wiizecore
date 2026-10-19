/**
 * Normalização de endereços antes de qualquer envio ao Analytics (regras puras, seguras no navegador).
 * Nunca enviamos códigos de links, IDs internos nem parâmetros de URL.
 */

/** Rotas cujo segundo segmento é um código privado (link de pagamento, convite, portal…). */
const TOKEN_ROUTES = ["pagar", "checkout", "c", "portal", "convite", "assinar", "autorizar", "verificar", "ativacao-celular", "teste-checkout"] as const;
/** Rotas internas com ID no segundo segmento. */
const ID_ROUTES = ["clientes", "contratos", "coproducoes"] as const;
/** Rotas onde cliques não são medidos (dados de pagamento, documentos, área do cliente final). */
const NO_CLICK_ROUTES = ["pagar", "checkout", "c", "portal", "ativacao", "ativacao-celular", "assinar", "autorizar", "teste-checkout", "reset-password", "oauth"];

const LOOKS_PRIVATE = /^(?=.*\d)[A-Za-z0-9_-]{16,}$|^[0-9a-f]{8}-[0-9a-f]{4}-/i;

export function normalizePath(pathname: string): string {
  const clean = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  const parts = clean.split("/").filter(Boolean);
  if (!parts.length) return "/";
  const [first, second] = parts;
  if ((TOKEN_ROUTES as readonly string[]).includes(first!) && second && !(first === "verificar" && parts.length === 1)) {
    return `/${first}/:${first === "portal" ? "key" : first === "verificar" ? "code" : "token"}`;
  }
  if ((ID_ROUTES as readonly string[]).includes(first!) && second) return `/${first}/:id`;
  if (first === "notas-fiscais" && second && second !== "configuracoes") return "/notas-fiscais/:id";
  return "/" + parts.map((p) => (LOOKS_PRIVATE.test(p) ? ":id" : p)).join("/");
}

export type PageGroup =
  | "home" | "institutional" | "pricing" | "auth" | "app_dashboard" | "app_customers" | "app_billing"
  | "app_finance" | "app_documents" | "app_settings" | "app_onboarding" | "public_checkout" | "customer_portal"
  | "help" | "developers" | "legal" | "admin" | "other";

const GROUPS: [RegExp, PageGroup][] = [
  [/^\/$/, "home"],
  [/^\/(taxas|prazos)$/, "pricing"],
  [/^\/(auth|entrar|criar-conta|reset-password|convite\/:token|oauth)/, "auth"],
  [/^\/(pagar|checkout|c|assinar|autorizar|teste-checkout)\//, "public_checkout"],
  [/^\/portal\//, "customer_portal"],
  [/^\/(ajuda|suporte|perguntas-frequentes|contato)/, "help"],
  [/^\/(desenvolvedores|llms)/, "developers"],
  [/^\/(politica-|termos-de-uso|verificar)/, "legal"],
  [/^\/nimda/, "admin"],
  [/^\/(painel)$/, "app_dashboard"],
  [/^\/(clientes|coproducoes)/, "app_customers"],
  [/^\/(cobrancas|servicos|cupons|lembrete-de-cobranca|multas-e-encargos|checkout-personalizado|recebiveis|antecipacao)/, "app_billing"],
  [/^\/(financas|financeiro|extrato|limites)/, "app_finance"],
  [/^\/(contratos|notas-fiscais|documentos)/, "app_documents"],
  [/^\/(configuracoes|perfil|seguranca|equipe|integracoes|integracao-externa)$/, "app_settings"],
  [/^\/(ativacao|ativacao-celular)/, "app_onboarding"],
  [/^\/(sobre|seguranca-e-confianca|cobrancas-e-pagamentos|contratos-digitais|gestao-|pix-automatico|plataforma-de-pagamentos|lembretes-de-cobranca|checkout-com-sua-marca|central-do-cliente|portal-do-cliente|integracao-crm-wiize)/, "institutional"],
];

export function pageGroup(template: string): PageGroup {
  return GROUPS.find(([re]) => re.test(template))?.[1] ?? "other";
}

export function clicksAllowed(pathname: string): boolean {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return !NO_CLICK_ROUTES.includes(first);
}

/** Referenciador reduzido ao domínio; nunca o endereço completo. */
export function referrerHost(referrer: string, ownHost: string): string | null {
  try {
    const h = new URL(referrer).hostname.replace(/^www\./, "");
    return h && h !== ownHost.replace(/^www\./, "") ? h : null;
  } catch {
    return null;
  }
}

export function deviceCategory(width: number): "mobile" | "tablet" | "desktop" {
  return width < 640 ? "mobile" : width < 1024 ? "tablet" : "desktop";
}
