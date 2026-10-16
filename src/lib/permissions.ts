/** Catálogo de permissões da equipe. Seguro para o navegador (sem segredos). */
export const PERMISSION_MODULES = [
  { id: "dashboard", label: "Painel", actions: ["view"] },
  { id: "customers", label: "Clientes", actions: ["view", "create", "edit", "delete", "export"] },
  { id: "services", label: "Serviços", actions: ["view", "create", "edit", "delete"] },
  { id: "contracts", label: "Contratos", actions: ["view", "create", "edit", "delete"] },
  { id: "charges", label: "Central de Recebimentos", actions: ["view", "create", "edit", "delete", "export"] },
  { id: "dunning", label: "Lembrete inteligente", actions: ["view", "manage"] },
  { id: "coupons", label: "Cupons & Incentivos", actions: ["view", "create", "edit", "archive"] },
  { id: "documents", label: "Arquivos e documentos", actions: ["view", "create", "delete"] },
  { id: "invoices", label: "Notas fiscais", actions: ["view", "create", "manage"] },
  { id: "finance", label: "Gestão financeira", actions: ["view", "create", "edit", "delete", "export", "approve", "manage"] },
  { id: "statement", label: "Extrato e recebíveis", actions: ["view", "export"] },
  { id: "refunds", label: "Reembolsos", actions: ["view", "create", "approve"] },
  { id: "anticipation", label: "Antecipação", actions: ["view", "create"] },
  { id: "team", label: "Equipe", actions: ["view", "manage"] },
  { id: "audit", label: "Auditoria", actions: ["view"] },
  { id: "settings", label: "Configurações da empresa", actions: ["view", "manage"] },
  { id: "checkout", label: "Aparência do checkout", actions: ["view", "manage"] },
  { id: "integrations", label: "Integrações", actions: ["view", "manage"] },
  { id: "security", label: "Segurança da empresa", actions: ["view"] },
] as const;

/** Permissões críticas: só Proprietário e Admin. Nunca concedidas a colaboradores. */
export const CRITICAL_PERMISSIONS = [
  { id: "withdrawals.request", label: "Solicitar e realizar saques" },
  { id: "bank_accounts.manage", label: "Cadastrar e alterar conta bancária de saque" },
  { id: "bank_accounts.view_sensitive", label: "Ver dados bancários completos" },
] as const;

export const ACTION_LABEL: Record<string, string> = {
  view: "Visualizar",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
  export: "Exportar",
  approve: "Aprovar",
  manage: "Gerenciar",
  archive: "Arquivar",
};

export const ALL_PERMISSIONS: string[] = [
  ...PERMISSION_MODULES.flatMap((m) => m.actions.map((a) => `${m.id}.${a}`)),
  ...CRITICAL_PERMISSIONS.map((p) => p.id),
];
const CRITICAL_SET = new Set<string>(CRITICAL_PERMISSIONS.map((p) => p.id));
export const isCritical = (p: string) => CRITICAL_SET.has(p);

export type TeamRole = "owner" | "admin" | "finance" | "viewer";
export const ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Proprietário",
  admin: "Admin",
  finance: "Colaborador financeiro",
  viewer: "Colaborador",
};

/** Permissões padrão de cada nível. */
export function basePermissions(role: TeamRole): string[] {
  if (role === "owner" || role === "admin") return ALL_PERMISSIONS;
  if (role === "finance")
    return ALL_PERMISSIONS.filter(
      (p) => !isCritical(p) && !p.startsWith("team.") && !p.startsWith("settings.manage") && !p.startsWith("audit.") && p !== "integrations.manage" && !p.startsWith("security."),
    );
  return ["dashboard.view"];
}

/** Permissões efetivas: nível + cargo personalizado + extras. Críticas só para Proprietário/Admin. */
export function effectivePermissions(role: TeamRole, extra: string[] = [], customRole: string[] = []): string[] {
  const set = new Set<string>([...basePermissions(role), ...customRole, ...extra]);
  if (role !== "owner" && role !== "admin") for (const c of CRITICAL_SET) set.delete(c);
  return [...set].filter((p) => ALL_PERMISSIONS.includes(p));
}

/** Página interna → permissão necessária para ver. */
export const PAGE_PERMISSION: Record<string, string> = {
  "/clientes": "customers.view",
  "/servicos": "services.view",
  "/contratos": "contracts.view",
  "/cobrancas": "charges.view",
  "/lembrete-de-cobranca": "dunning.view",
  "/cupons": "coupons.view",
  "/documentos": "documents.view",
  "/checkout-personalizado": "checkout.view",
  "/integracoes": "integrations.view",
  "/seguranca": "security.view",
  "/multas-e-encargos": "finance.view",
  "/notas-fiscais": "invoices.view",
  "/financas": "finance.view",
  "/financeiro": "finance.view",
  "/extrato": "statement.view",
  "/recebiveis": "statement.view",
  "/limites": "withdrawals.request",
  "/antecipacao": "anticipation.view",
  "/configuracoes": "settings.view",
  "/ativacao": "settings.manage",
  "/equipe": "team.view",
};
