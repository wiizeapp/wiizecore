import { createFileRoute, Link } from "@tanstack/react-router";
import { NameText } from "@/components/ds/name-text";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, FileSignature, Plus, Receipt, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader, Panel, StatusBadge, ErrorState, ListSkeleton, StatCard } from "@/components/ds";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { contractStatusLabels, customerStatusLabels, customerTypeLabels, paymentMethodLabels, paymentStatusLabels } from "@/lib/labels";
import { summarize, isOpen, isOverdue, type SummaryRow } from "@/lib/financial-summary";
import { formatBRL, formatDate, formatDateTime, formatDocument } from "@/lib/format";
import { useTranslation } from "react-i18next";
import { CustomerDocuments } from "@/components/customers/customer-documents";
import { toast } from "sonner";
import { Link2 } from "lucide-react";

const TABS = [
  { id: "visao", label: "Visão geral" },
  { id: "dados", label: "Dados" },
  { id: "contratos", label: "Contratos" },
  { id: "cobrancas", label: "Cobranças" },
  { id: "financeiro", label: "Financeiro" },
  { id: "documentos", label: "Documentos" },
  { id: "atividades", label: "Atividades" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/_authenticated/clientes_/$id")({
  validateSearch: (s: Record<string, unknown>): { aba?: Tab } =>
    TABS.some((t) => t.id === s["aba"]) ? { aba: s["aba"] as Tab } : {},
  head: () => ({
    meta: [
      { title: "Cliente — WiizePay" },
      { name: "description", content: "Central 360º do cliente: dados, contratos, cobranças, parcelas e financeiro." },
      { property: "og:title", content: "Cliente — WiizePay" },
      { property: "og:description", content: "Central 360º do cliente na WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClienteCentral,
});

type Pay = {
  id: string; description: string | null; status: string; method: string; gross_amount: number; net_amount: number | null;
  refunded_amount: number | null; due_on: string | null; paid_at: string | null; installment_number: number | null;
  installment_count: number | null; charge_group_id: string | null; created_at: string;
};

const OPEN = ["created", "awaiting_payment", "processing", "in_analysis"];
const DATA_STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  complete: { label: "Dados completos", tone: "success" },
  submitted: { label: "Dados enviados pelo cliente", tone: "success" },
  basic: { label: "Dados básicos", tone: "warning" },
};

function payTone(s: string, due?: string | null): "success" | "warning" | "danger" | "neutral" {
  if (s === "paid") return "success";
  if (isOverdue({ status: s, due_on: due ?? null })) return "danger";
  if (s === "overdue" || s === "failed") return "danger";
  if (OPEN.includes(s)) return "warning";
  return "neutral";
}

function ClienteCentral() {
  const { t: ui } = useTranslation("ui");
  const { id } = Route.useParams();
  const { aba = "visao" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: workspace } = useWorkspace();
  const tenantId = workspace?.tenantId as string | undefined;

  const q = useQuery({
    queryKey: ["cliente-360", tenantId, id],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const [c, p, k, i] = await Promise.all([
        supabase.from("customers").select("*, wiize_customer_links(id)").eq("tenant_id", tenantId!).eq("id", id).maybeSingle(),
        supabase.from("payments").select("id, description, status, method, gross_amount, net_amount, platform_fee_amount, refunded_amount, due_on, paid_at, installment_number, installment_count, charge_group_id, created_at").eq("tenant_id", tenantId!).eq("customer_id", id).order("due_on", { ascending: true }),
        supabase.from("contracts").select("id, title, status, signed_at, sent_at, created_at, archived_at").eq("tenant_id", tenantId!).eq("customer_id", id).order("created_at", { ascending: false }),
        supabase.from("invoices").select("id, status, created_at").eq("tenant_id", tenantId!).eq("customer_id", id),
      ]);
      if (c.error || p.error || k.error) throw c.error ?? p.error ?? k.error;
      const ids = (p.data ?? []).map((x) => x.id);
      const ev = ids.length
        ? await supabase.from("charge_events").select("payment_id, event_type, actor, metadata, created_at").eq("tenant_id", tenantId!).in("payment_id", ids.slice(0, 300)).order("created_at", { ascending: false }).limit(200)
        : { data: [] as { payment_id: string; event_type: string; actor: string; metadata: unknown; created_at: string }[] };
      const ce = await supabase.from("checkout_events").select("charge_group_id, event, metadata, created_at").eq("tenant_id", tenantId!).eq("customer_id", id).order("created_at", { ascending: false }).limit(300);
      return { customer: c.data, payments: (p.data ?? []) as unknown as Pay[], contracts: k.data ?? [], invoices: i.data ?? [], events: ev.data ?? [], checkoutEvents: ce.data ?? [] };
    },
  });

  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (q.isLoading || !q.data) return <div className="space-y-6"><ListSkeleton rows={6} /></div>;
  const { customer, payments, contracts, invoices, events, checkoutEvents } = q.data;
  if (!customer) return <EmptyState title="Cliente não encontrado" text="Ele pode ter sido removido ou pertence a outra empresa." action={<Button asChild variant="outline"><Link to="/clientes">Voltar para Clientes</Link></Button>} />;

  const t = summarize(payments as unknown as SummaryRow[]);
  const totals = { charged: t.charged, received: t.paid, open: t.pending, overdue: t.overdue, refunded: t.refunded };

  const ds = DATA_STATUS[(customer as { data_status?: string }).data_status ?? "basic"] ?? DATA_STATUS["basic"]!;

  // Agrupa parcelas de uma mesma cobrança.
  const groups = new Map<string, Pay[]>();
  for (const p of payments) {
    const key = p.charge_group_id ?? p.id;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const groupList = [...groups.values()].sort((a, b) => (b[0]!.created_at > a[0]!.created_at ? 1 : -1));

  const M: Record<string, string> = { pix: "Pix", boleto: "Boleto", credit_card: "Cartão", debit_card: "Débito" };
  const EV: Record<string, string> = { method_changed: "Forma de pagamento alterada", regularized: "Cobrança regularizada", "provider.overdue": "Cobrança vencida", "provider.failed": "Pagamento recusado", "provider.cancelled": "Cobrança cancelada", "provider.refunded": "Estorno", "provider.processing": "Pagamento em processamento" };
  const WHO: Record<string, string> = { customer: "pelo cliente", provider: "pelo prestador", system: "pelo sistema", admin: "pelo administrador" };
  const CK: Record<string, string> = { opened: "Abriu o link de pagamento", data_confirmed: "Confirmou os dados e aceitou os termos", contract_viewed: "Abriu o contrato para leitura", contract_signed: "Assinou o contrato", payment_viewed: "Chegou na etapa de pagamento", payment_submitted: "Enviou o pagamento com cartão", card_declined: "Cartão recusado" };
  const groupDesc = new Map(payments.map((p) => [p.charge_group_id ?? p.id, p.description ?? "Cobrança"]));
  const STAGES = ["opened", "data_confirmed", "contract_viewed", "contract_signed", "payment_viewed", "payment_submitted"];
  const STAGE_LABEL: Record<string, string> = { none: "Link ainda não acessado", opened: "Acessou, não confirmou os dados", data_confirmed: "Confirmou os dados", contract_viewed: "Viu o contrato, não assinou", contract_signed: "Assinou o contrato", payment_viewed: "Chegou no pagamento, não pagou", payment_submitted: "Pagamento enviado, aguardando confirmação" };
  const journeyOf = (groupId: string, items: Pay[]) => {
    if (items.some((x) => x.status === "paid") && !items.some((x) => OPEN.includes(x.status) || x.status === "overdue")) return { label: "Pago", tone: "success" as const };
    const evs = checkoutEvents.filter((e) => e.charge_group_id === groupId).map((e) => e.event);
    const stage = [...STAGES].reverse().find((st) => evs.includes(st)) ?? "none";
    const partial = items.some((x) => x.status === "paid");
    return { label: partial ? `Pagando em dia · ${STAGE_LABEL[stage]}` : STAGE_LABEL[stage]!, tone: stage === "none" ? ("neutral" as const) : ("warning" as const) };
  };
  const descOf = new Map(payments.map((p) => [p.id, p.description ?? "Cobrança"]));
  const activities = [
    ...events.filter((e) => EV[e.event_type]).map((e) => {
      const m = (e.metadata ?? {}) as { from?: string; to?: string };
      const change = m.from || m.to ? ` (${M[m.from ?? ""] ?? "—"} → ${M[m.to ?? ""] ?? "—"})` : "";
      return { at: e.created_at, text: `${EV[e.event_type]}${change} ${WHO[e.actor] ?? ""} — ${descOf.get(e.payment_id) ?? "Cobrança"}` };
    }),
    ...payments.filter((p) => p.paid_at).map((p) => ({ at: p.paid_at!, text: `Pagamento recebido — ${formatBRL(p.gross_amount)}` })),
    ...payments.map((p) => ({ at: p.created_at, text: `Cobrança criada — ${p.description ?? "Cobrança"}${p.installment_count ? ` (${p.installment_number}/${p.installment_count})` : ""}` })),
    ...contracts.map((c) => ({ at: c.created_at, text: `Contrato criado — ${c.title}` })),
    ...contracts.filter((c) => c.signed_at).map((c) => ({ at: c.signed_at!, text: `Contrato assinado — ${c.title}` })),
    ...checkoutEvents.filter((e) => CK[e.event]).map((e) => {
      const m = (e.metadata ?? {}) as { method?: string };
      return { at: e.created_at, text: `${CK[e.event]}${m.method && e.event === "payment_viewed" ? ` (${M[m.method] ?? m.method})` : ""} — ${groupDesc.get(e.charge_group_id) ?? "Cobrança"}` };
    }),
    { at: customer.created_at, text: "Cliente cadastrado" },
  ].sort((a, b) => (b.at > a.at ? 1 : -1));

  const ChargeGroup = ({ items }: { items: Pay[] }) => {
    const first = items[0]!;
    const count = first.installment_count ?? items.length;
    const paid = items.filter((p) => p.status === "paid").length;
    const total = items.reduce((s, p) => s + Number(p.gross_amount), 0);
    const pct = count ? Math.round((paid / count) * 100) : 0;
    return (
      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">{first.description ?? "Cobrança"}</p>
            <p className="text-xs text-muted-foreground">{paymentMethodLabels[first.method] ?? first.method} · {count > 1 ? `${count} parcelas` : "Pagamento único"}</p>
            {(() => { const j = journeyOf(first.charge_group_id ?? first.id, items); return <div className="mt-2"><StatusBadge tone={j.tone}>{j.label}</StatusBadge></div>; })()}
          </div>
          <p className="numeric-tabular font-semibold">{formatBRL(total)}</p>
        </div>
        {count > 1 ? (
          <>
            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
              {paid}/{count} pagas
            </div>
            <ul className="mt-3 divide-y divide-border text-sm">
              {items.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>Parcela {p.installment_number ?? "—"} · vence {formatDate(p.due_on)}{p.paid_at ? ` · paga em ${formatDate(p.paid_at)}` : ""}</span>
                  <span className="flex items-center gap-3"><span className="numeric-tabular">{formatBRL(p.gross_amount)}</span><StatusBadge tone={payTone(p.status, p.due_on)}>{paymentStatusLabels[p.status] ?? p.status}</StatusBadge></span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Vence {formatDate(first.due_on)}{first.paid_at ? ` · paga em ${formatDate(first.paid_at)}` : ""}</span>
            <StatusBadge tone={payTone(first.status, first.due_on)}>{paymentStatusLabels[first.status] ?? first.status}</StatusBadge>
          </div>
        )}
      </div>
    );
  };

  const field = (label: string, value: string | null | undefined) => (
    <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm">{value || "—"}</dd></div>
  );

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to="/clientes"><ArrowLeft className="size-4" />{ui("Clientes")}</Link></Button>
      <PageHeader
        title={customer.name}
        description={`${customerTypeLabels[customer.type] ?? ""} · ${formatDocument(customer.document)}${(customer as { wiize_customer_links?: unknown[] }).wiize_customer_links?.length ? " · Vindo do Wiize — edite os dados pelo Wiize" : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            {tenantId && payments.some((p) => !["cancelled", "failed"].includes(p.status)) ? (
              <Button variant="outline" onClick={() => {
                const url = `${window.location.origin}/portal/${tenantId}`;
                void navigator.clipboard.writeText(url).then(() => toast.success("Link do portal copiado. Envie para o cliente."), () => toast.info(url));
              }}><Link2 className="size-4" />Copiar link do portal</Button>
            ) : null}
            <Button asChild variant="outline"><Link to="/contratos"><FileSignature className="size-4" />{ui("Contratos")}</Link></Button>
            <Button asChild><Link to="/cobrancas" search={{ nova: true, cliente: customer.id } as never}><Plus className="size-4" />{ui("Nova cobrança")}</Link></Button>
          </div>
        }
      />
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={customer.status === "active" ? "success" : "neutral"}>{customerStatusLabels[customer.status]}</StatusBadge>
        <StatusBadge tone={ds.tone}>{ds.label}</StatusBadge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={<Receipt className="size-3.5" />} label="Valor contratado" value={formatBRL(totals.charged)} hint={`${groupList.length} cobrança(s) · não é valor recebido`} />
        <StatCard icon={<CheckCircle2 className="size-3.5 text-primary" />} label="Recebido" value={<span className="text-primary">{formatBRL(totals.received)}</span>} hint={`${payments.filter((p) => p.status === "paid").length} ${ui("pagamento(s)")}`} />
        <StatCard icon={<Clock className="size-3.5" />} label="A receber" value={formatBRL(totals.open)} hint={`${payments.filter((p) => isOpen(p.status) && !isOverdue(p)).length} parcela(s) pendente(s)`} />
        <StatCard icon={<AlertTriangle className="size-3.5" />} label="Em atraso" value={formatBRL(totals.overdue)} hint={`${payments.filter((p) => isOverdue(p)).length} parcela(s) vencida(s)`} />
        <StatCard icon={<RotateCcw className="size-3.5" />} label="Reembolsado" value={formatBRL(totals.refunded)} />
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={aba === t.id} onClick={() => void navigate({ search: { aba: t.id }, replace: true })}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${aba === t.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {aba === "visao" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel title="Contato" subtitle={ds.label}>
            <dl className="grid gap-4">
              {field("E-mail", customer.email)}
              {field("Telefone", customer.phone || customer.whatsapp)}
              {field("Cidade/UF", [customer.city, customer.state].filter(Boolean).join(" / "))}
            </dl>
          </Panel>
          <Panel title="Resumo">
            <dl className="grid gap-4 sm:grid-cols-2">
              {field("Cobranças", String(groupList.length))}
              {field("Contratos assinados", `${contracts.filter((c) => c.status === "signed").length} de ${contracts.length}`)}
              {field("Notas fiscais", String(invoices.length))}
              {field("Cliente desde", formatDate(customer.created_at))}
            </dl>
          </Panel>
          <Panel title="Próximos vencimentos">
            {payments.filter((p) => OPEN.includes(p.status) || p.status === "overdue").slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                <span>{p.description ?? "Cobrança"}{p.installment_count ? ` ${p.installment_number}/${p.installment_count}` : ""} · {formatDate(p.due_on)}</span>
                <span className="numeric-tabular">{formatBRL(p.gross_amount)}</span>
              </div>
            ))}
            {!payments.some((p) => OPEN.includes(p.status) || p.status === "overdue") ? <p className="text-sm text-muted-foreground">Nada em aberto.</p> : null}
          </Panel>
        </div>
      ) : null}

      {aba === "dados" ? (
        <Panel title="Dados do cliente" subtitle={ds.label}>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {field("Nome", customer.name)}
            {field("Nome fantasia", customer.trade_name)}
            {field("CPF/CNPJ", formatDocument(customer.document))}
            {field("E-mail", customer.email)}
            {field("Telefone", customer.phone)}
            {field("WhatsApp", customer.whatsapp)}
            {field("Tipo", customerTypeLabels[customer.type])}
            {field("Situação", customerStatusLabels[customer.status])}
            {field("CEP", customer.zip_code)}
            {field("Endereço", [customer.address, customer.address_number, customer.complement].filter(Boolean).join(", "))}
            {field("Bairro", customer.district)}
            {field("Cidade/UF", [customer.city, customer.state].filter(Boolean).join(" / "))}
            {field("Cadastrado em", formatDateTime(customer.created_at))}
            {field("Atualizado em", formatDateTime(customer.updated_at))}
          </dl>
          {customer.notes ? <div className="mt-5 rounded-xl bg-muted/50 p-4 text-sm"><p className="text-xs text-muted-foreground">Observações</p><p className="mt-1 whitespace-pre-line">{customer.notes}</p></div> : null}
          {(customer as { data_submitted_at?: string | null }).data_submitted_at ? <p className="mt-4 text-xs text-muted-foreground">Dados enviados pelo cliente em {formatDateTime((customer as { data_submitted_at: string }).data_submitted_at)}.</p> : null}
        </Panel>
      ) : null}

      {aba === "contratos" ? (
        <Panel title={ui("Contratos")}>
          {contracts.length ? (
            <ul className="divide-y divide-border">
              {contracts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <Link to="/contratos/$id" params={{ id: c.id }} className="font-medium hover:text-primary"><NameText>{c.title}</NameText></Link>
                  <span className="flex items-center gap-3 text-xs text-muted-foreground">{c.signed_at ? `Assinado em ${formatDate(c.signed_at)}` : `Criado em ${formatDate(c.created_at)}`}<StatusBadge tone={c.status === "signed" ? "success" : c.status === "cancelled" || c.status === "expired" ? "danger" : "warning"}>{contractStatusLabels[c.status]}</StatusBadge></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nenhum contrato com este cliente.</p>}
        </Panel>
      ) : null}

      {aba === "cobrancas" ? (
        <div className="space-y-3">
          {groupList.length ? groupList.map((g) => <ChargeGroup key={g[0]!.charge_group_id ?? g[0]!.id} items={g} />) : <Panel title={ui("Cobranças")}><p className="text-sm text-muted-foreground">Nenhuma cobrança ainda.</p></Panel>}
        </div>
      ) : null}

      {aba === "financeiro" ? (
        <Panel title="Histórico financeiro" subtitle="Pagamentos recebidos deste cliente">
          {payments.filter((p) => p.paid_at).length ? (
            <ul className="divide-y divide-border text-sm">
              {payments.filter((p) => p.paid_at).sort((a, b) => (b.paid_at! > a.paid_at! ? 1 : -1)).map((p) => (
                <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{formatDate(p.paid_at)} · {p.description ?? "Cobrança"}</span>
                  <span className="numeric-tabular">{formatBRL(p.gross_amount)} <span className="text-muted-foreground">· líquido {formatBRL(p.net_amount)}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Nenhum pagamento recebido ainda.</p>}
        </Panel>
      ) : null}

      {aba === "documentos" ? <CustomerDocuments customerId={customer.id} /> : null}

      {aba === "atividades" ? (
        <Panel title="Atividades">
          <ol className="space-y-3 text-sm">
            {activities.map((a, i) => (
              <li key={i} className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /><span><span className="block">{a.text}</span><span className="text-xs text-muted-foreground">{formatDateTime(a.at)}</span></span></li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </div>
  );
}
