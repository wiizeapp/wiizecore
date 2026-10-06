import { DateField } from "@/components/ds/date-field";
import { NameText } from "@/components/ds/name-text";
import { summarize, type SummaryRow } from "@/lib/financial-summary";
import { confirmAction } from "@/components/confirm-dialog";
import { TableRowsSkeleton, TableStateRow, ErrorState, ListSkeleton } from "@/components/states";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Copy, Landmark, MoreHorizontal, Percent, Search, Sparkles, UserRound } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChargeSheet } from "@/components/charges/charge-sheet";
import { RefundsPanel } from "@/components/charges/refunds-panel";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/app-shell";
import { ChargeMethodDialog } from "@/components/charges/charge-method-dialog";
import { SubscriptionInvoiceDialog } from "@/components/invoices/subscription-invoice-dialog";
import { DataPagination, paginate, StatusBadge, SummaryStrip, matchesSearch } from "@/components/ds";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/invoice-status";
import { CoproductionCard, coproducersPayload, type CoproducerDraft } from "@/components/charges/coproduction-card";
import { cancelCharge, createCharge, setCustomerDocument, simulateSandboxPayment, syncChargeStatus, regeneratePaymentLink, revokePaymentLinks } from "@/lib/charges.functions";
import { Button } from "@/components/ui/button";
import { CopyChargeLinkButton } from "@/components/charges/copy-charge-link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChangeChargeDunningDialog, DunningPlanPicker, type DunningPlanChoice } from "@/components/charge-dunning-plan";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { frequencyLabels, paymentMethodLabels, paymentStatusLabels, serviceTypeLabels } from "@/lib/labels";
import { formatBRL, formatDate } from "@/lib/format";
import { PixAutomaticPanel } from "@/components/pix-automatic-panel";
import { createPixAutomatic } from "@/lib/pix-automatic.functions";
import { useTranslation } from "react-i18next";
import { getLateFees } from "@/lib/late-fees.functions";
import { ActivationNotice } from "@/components/activation-notice";

export const Route = createFileRoute("/_authenticated/cobrancas")({
  validateSearch: (search: Record<string, unknown>): { nova?: boolean; cliente?: string | undefined; contrato?: string | undefined; servico?: string | undefined } => {
    const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
    const nova = search["nova"] === true || search["nova"] === "true" || search["nova"] === "1";
    return { ...(nova ? { nova: true } : {}), cliente: uuid(search["cliente"]), contrato: uuid(search["contrato"]), servico: uuid(search["servico"]) };
  },
  head: () => ({
    meta: [
      { title: "Cobranças — WiizePay" },
      { name: "description", content: "Crie cobranças, links de pagamento e acompanhe eventos de pagamento da WiizePay." },
      { property: "og:title", content: "Cobranças — WiizePay" },
      { property: "og:description", content: "Crie cobranças, links de pagamento e acompanhe eventos de pagamento da WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Cobrancas,
});

type Method = "undefined" | "pix" | "boleto" | "credit_card" | "debit_card" | "pix_automatic";

function newKey() {
  return crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
}

function Cobrancas() {
  const { t: ui } = useTranslation("ui");
  const prefill = Route.useSearch();
  const { nova } = prefill;
  const { data: workspace } = useWorkspace();
  const tenantId = workspace?.tenantId;
  const queryClient = useQueryClient();
  const create = useServerFn(createCharge);
  const regenerate = useServerFn(regeneratePaymentLink);
  const revoke = useServerFn(revokePaymentLinks);
  const cancel = useServerFn(cancelCharge);
  const simulate = useServerFn(simulateSandboxPayment);
  const syncStatus = useServerFn(syncChargeStatus);
  const fetchLateFees = useServerFn(getLateFees);

  const [open, setOpen] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkKind, setLinkKind] = useState<"pay" | "pixauto">("pay");
  const [pixAuto, setPixAuto] = useState(false);
  const [installmentCount, setInstallmentCount] = useState<number | null>(null);
  const [feeShare, setFeeShare] = useState(0);
  const [dunningPlan, setDunningPlan] = useState<DunningPlanChoice | null>(null);
  const [coproOn, setCoproOn] = useState(false);
  const [coproducers, setCoproducers] = useState<CoproducerDraft[]>([]);
  const [dunningEdit, setDunningEdit] = useState<string | null>(null);
  const [methodEdit, setMethodEdit] = useState<string | null>(null);
  const createPixAuto = useServerFn(createPixAutomatic);
  const [docInput, setDocInput] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const saveDoc = useServerFn(setCustomerDocument);
  const [form, setForm] = useState({ customerId: "", serviceId: "", contractId: "", method: "undefined" as Method, dueOn: "" });
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const expiry = { on: false, days: "30", date: "" };

  useEffect(() => {
    if (!nova) return;
    setOpen(true);
    if (prefill.cliente || prefill.contrato || prefill.servico) {
      setForm((f) => ({ ...f, customerId: prefill.cliente ?? f.customerId, contractId: prefill.contrato ?? f.contractId, serviceId: prefill.servico ?? f.serviceId }));
    }
    setIdempotencyKey(newKey());
  }, [nova]);

  const { data: customers } = useQuery({
    queryKey: ["customers-simple", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, document, data_status").eq("tenant_id", tenantId!).order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: services } = useQuery({
    queryKey: ["services-full", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, amount, type, installments, frequency, accepted_methods, custom_amount, flexible_type")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: contracts } = useQuery({
    queryKey: ["contracts-simple", tenantId, form.customerId],
    enabled: Boolean(tenantId && form.customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, status")
        .eq("tenant_id", tenantId!)
        .eq("customer_id", form.customerId)
        .not("status", "in", "(cancelled,expired)");
      if (error) throw error;
      return data;
    },
  });
  const { data: payments, isLoading, isError, refetch } = useQuery({
    queryKey: ["payments", tenantId],
    enabled: Boolean(tenantId),
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, charge_group_id, description, status, method, gross_amount, platform_fee_amount, net_amount, due_on, installment_number, installment_count, subscription_id, created_at, refunded_amount, customers(name, email, document, phone)")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data;
    },
  });
  const { data: lateFees } = useQuery({ queryKey: ["late-fees", tenantId], enabled: Boolean(tenantId && open), queryFn: () => fetchLateFees() });

  const { data: invoiceRows } = useQuery({
    queryKey: ["invoices", "by-charge", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("id, status, number, payment_id, charge_group_id, effective_date").eq("tenant_id", tenantId!).not("status", "in", "(CANCELED)").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const [subInvoice, setSubInvoice] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, NonNullable<typeof payments>>();
    for (const p of payments ?? []) {
      const list = map.get(p.charge_group_id) ?? [];
      list.push(p);
      map.set(p.charge_group_id, list);
    }
    return [...map.entries()].map(([id, items]) => {
      const sorted = [...items].sort((a, b) => a.due_on.localeCompare(b.due_on));
      const next = sorted.find((p) => ["awaiting_payment", "overdue", "created"].includes(p.status)) ?? sorted[sorted.length - 1]!;
      const kind = next.subscription_id ? "recurring" : next.installment_count ? "installment" : "one_time";
      const sum = (key: "gross_amount" | "platform_fee_amount" | "net_amount") =>
        sorted.reduce((acc, p) => acc + Math.round(Number(p[key]) * 100), 0) / 100;
      return {
        id,
        kind,
        items: sorted,
        next,
        customer: (next.customers as { name?: string } | null)?.name ?? "—",
        gross: sum("gross_amount"),
        fee: sum("platform_fee_amount"),
        net: sum("net_amount"),
        paid: sorted.filter((p) => p.status === "paid").length,
      };
    });
  }, [payments]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<(typeof groups)[number] | null>(null);
  const visibleGroups = groups.filter((g) => {
    const s = g.next.status;
    const okStatus = statusFilter === "all" || (statusFilter === "open" ? ["awaiting_payment", "created"].includes(s) : s === statusFilter);
    const c = g.next.customers as { name?: string; email?: string | null; document?: string | null; phone?: string | null } | null;
    return okStatus && matchesSearch(search, [g.next.description, g.customer, c?.email, c?.document, c?.phone, g.next.id, g.gross, Number(g.gross ?? 0).toFixed(2).replace('.', ',')]);
  });
  const visiblePage = paginate(visibleGroups, page, 10);
  // Mesmo cálculo usado no Dashboard, Financeiro e Central do cliente.
  const summary = useMemo(() => {
    const t = summarize((payments ?? []) as unknown as SummaryRow[]);
    return { open: t.pending, paid: t.paid, overdue: t.overdue, refunded: t.refunded };
  }, [payments]);

  const rawService = services?.find((s) => s.id === form.serviceId);
  const [chargeType, setChargeType] = useState<"one_time" | "installment" | "recurring">("one_time");
  const [chargeFreq, setChargeFreq] = useState("monthly");
  // Serviço com forma personalizada: o tipo é escolhido nesta cobrança.
  const selectedService = rawService && rawService.flexible_type
    ? { ...rawService, type: chargeType, frequency: chargeType === "recurring" ? (chargeFreq as typeof rawService.frequency) : null, installments: chargeType === "installment" ? (installmentCount ?? 2) : null }
    : rawService;
  // O responsável sempre define a forma de pagamento; o cliente não escolhe.
  const methodOptions: Method[] = selectedService
    ? (selectedService.accepted_methods as Method[]).filter((m) => m !== "debit_card" && m !== "undefined")
    : [];

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["payments", tenantId] });

  const createMutation = useMutation({
    mutationFn: async (): Promise<{ token: string; kind: "pay" | "pixauto" }> => {
      if (selectedService?.type === "installment" && (!installmentCount || installmentCount < 2 || installmentCount > 21)) {
        throw new Error("Escolha uma quantidade entre 2 e 21 parcelas.");
      }
      const dueOn = form.dueOn || new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
      const selCustomer = customers?.find((x) => x.id === form.customerId);
      if (selCustomer && !selCustomer.document) {
        if (!docInput.trim()) throw new Error("Informe o CPF/CNPJ do cliente.");
        await saveDoc({ data: { customerId: form.customerId, document: docInput } });
        void queryClient.invalidateQueries({ queryKey: ["customers-simple"] });
      }
      if (form.method === "pix_automatic" && selectedService?.type === "recurring") {
        const r = await createPixAuto({ data: { customerId: form.customerId, serviceId: form.serviceId, startOn: dueOn, customAmount: selectedService?.custom_amount ? Number(customAmount.replace(/\./g, "").replace(",", ".")) || null : null, frequency: rawService?.flexible_type ? (chargeFreq as never) : null } });
        return { token: r.token, kind: "pixauto" };
      }
      const r = await create({
        data: {
          customerId: form.customerId,
          serviceId: form.serviceId,
          contractId: form.contractId || null,
          method: form.method === "pix_automatic" ? "undefined" : form.method,
          dueOn,
          installmentCount: selectedService?.type === "installment" ? installmentCount : null,
          chargeType: rawService?.flexible_type ? chargeType : null,
          frequency: rawService?.flexible_type && chargeType === "recurring" ? (chargeFreq as never) : null,
          idempotencyKey,
          linkDays: expiryDays(expiry),
          collectCustomerData: true,
          feePassShare: selectedService?.type !== "installment" || form.method === "undefined" ? 0 : feeShare,
          dunningPlan,
          coproducers: coproOn && coproducers.length ? coproducersPayload(coproducers) : null,
          customAmount: selectedService?.custom_amount ? Number(customAmount.replace(/\./g, "").replace(",", ".")) || null : null,
        },
      });
      return { token: r.token, kind: "pay" };
    },
    onSuccess: (result) => {
      toast.success(result.kind === "pixauto" ? "Autorização de Pix Automático criada." : "Cobrança criada.");
      setLinkKind(result.kind);
      setPixAuto(false);
      setInstallmentCount(null);
      setFeeShare(0);
      setDunningPlan(null);
      setCoproOn(false);
      setCoproducers([]);
      void queryClient.invalidateQueries({ queryKey: ["pix-automatic"] });
      setOpen(false);
      setAttemptedSubmit(false);
      setForm({ customerId: "", serviceId: "", contractId: "", method: "undefined", dueOn: "" });
      setLinkToken(result.token);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const regenerateMutation = useMutation({
    mutationFn: (chargeGroupId: string) => regenerate({ data: { chargeGroupId, days: 30 } }),
    onSuccess: (r) => { setLinkKind("pay"); setLinkToken(r.token); },
    onError: (e: Error) => toast.error(e.message),
  });
  const revokeMutation = useMutation({
    mutationFn: (chargeGroupId: string) => revoke({ data: { chargeGroupId } }),
    onSuccess: () => toast.success("Links revogados."),
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelMutation = useMutation({
    mutationFn: (chargeGroupId: string) => cancel({ data: { chargeGroupId } }),
    onSuccess: () => {
      toast.success("Cobrança excluída dos valores e cancelada para pagamento.");
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["dash"] });
      void queryClient.invalidateQueries({ queryKey: ["recebiveis"] });
      void queryClient.invalidateQueries({ queryKey: ["recebiveis-totais"] });
      void queryClient.invalidateQueries({ queryKey: ["cliente-360"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const simulateMutation = useMutation({
    mutationFn: (chargeGroupId: string) => simulate({ data: { chargeGroupId } }),
    onSuccess: (r: { status?: string }) => {
      toast.success(r?.status === "applied" ? "Pagamento de teste confirmado." : "Pagamento de teste enviado. O status muda em alguns segundos.");
      refresh();
      setTimeout(refresh, 4000);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncMutation = useMutation({
    mutationFn: (chargeGroupId: string) => syncStatus({ data: { chargeGroupId } }),
    onSuccess: (r: { applied: number }) => {
      toast.success(r.applied ? "Status atualizado." : "Nenhuma mudança encontrada.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkUrl = linkToken && typeof window !== "undefined" ? `${window.location.origin}/${linkKind === "pixauto" ? "autorizar" : "pagar"}/${linkToken}` : "";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title={ui("Cobranças")}
        description="O valor vem sempre do serviço cadastrado. O status muda somente quando o pagamento é confirmado."
        action={
          <Dialog
            open={open}
            onOpenChange={(value) => {
              setOpen(value);
              if (value) {
                setIdempotencyKey(newKey());
                setAttemptedSubmit(false);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button disabled={!customers?.length || !services?.length || !(workspace?.providerStatus === "connected")}>{ui("Nova cobrança")}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[92vh] overflow-y-auto pb-0 sm:max-w-2xl">
              <DialogHeader className="border-b border-border pb-4">
                <DialogTitle className="text-xl">{ui("Nova cobrança")}</DialogTitle>
                <p className="text-sm text-muted-foreground">Gere um link fixo para o cliente pagar, acompanhar parcelas e atualizar dados.</p>
              </DialogHeader>
              <ActivationNotice tenantId={workspace?.tenantId} compact />
              <form
                className="space-y-5 pt-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  setAttemptedSubmit(true);
                  if (!form.customerId || !form.serviceId) {
                    toast.error("Escolha cliente e serviço.");
                    return;
                  }
                  createMutation.mutate();
                }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quem e o quê</p>
                <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{ui("Cliente")}</Label>
                  <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v, contractId: "" })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {customers?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}{c.document ? "" : " (sem CPF/CNPJ)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {customers?.find((x) => x.id === form.customerId && !x.document) ? (
                    <div className="space-y-1">
                      <Input placeholder="CPF ou CNPJ do cliente" value={docInput} onChange={(e) => setDocInput(e.target.value)} inputMode="numeric" maxLength={18} />
                      <p className="text-xs text-muted-foreground">Este cliente não tem CPF/CNPJ. Ele ficará salvo no cadastro.</p>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Serviço</Label>
                  <Select
                    value={form.serviceId}
                    onValueChange={(v) => {
                      const s = services?.find((x) => x.id === v);
                        const defaultMethod = s?.accepted_methods.find((m) => m !== "debit_card") as Method | undefined;
                        setForm({ ...form, serviceId: v, method: defaultMethod ?? "pix" });
                        setInstallmentCount(s?.type === "installment" ? Math.min(21, Math.max(2, Number(s.installments ?? 2))) : null);
                        setChargeType("one_time");
                       setPixAuto(false);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {services?.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} · {s.flexible_type ? "Forma personalizada" : serviceTypeLabels[s.type]} · {s.custom_amount ? "Valor personalizado" : formatBRL(s.amount)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rawService?.flexible_type ? (
                    <div className="grid gap-3 pt-1 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Forma de cobrança</Label>
                        <Select value={chargeType} onValueChange={(v) => { const t = v as typeof chargeType; setChargeType(t); setInstallmentCount(t === "installment" ? (installmentCount ?? 2) : null); setPixAuto(false); if (form.method === "pix_automatic") setForm({ ...form, method: "pix" }); }}>
                          <SelectTrigger aria-label="Forma de cobrança"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="one_time">À vista</SelectItem>
                            <SelectItem value="installment">Parcelado</SelectItem>
                            <SelectItem value="recurring">Recorrente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {chargeType === "recurring" ? (
                        <div className="space-y-1.5">
                          <Label>Periodicidade</Label>
                          <Select value={chargeFreq} onValueChange={setChargeFreq}>
                            <SelectTrigger aria-label="Periodicidade"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(frequencyLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedService?.custom_amount ? (
                    <div className="space-y-1.5 pt-1">
                      <Label htmlFor="custom-amount">Valor desta cobrança (R$){selectedService.type === "installment" ? " — total" : selectedService.type === "recurring" ? " — por período" : ""}</Label>
                      <Input id="custom-amount" required inputMode="decimal" placeholder="0,00" value={customAmount} onChange={(e) => setCustomAmount(e.target.value.replace(/[^\d.,]/g, ""))} />
                    </div>
                  ) : selectedService ? (
                    <p className="text-xs text-muted-foreground">
                      {selectedService.type === "installment"
                        ? `${selectedService.installments}x de ${formatBRL(Number(selectedService.amount) / Number(selectedService.installments ?? 1))} (total ${formatBRL(selectedService.amount)})`
                        : selectedService.type === "recurring"
                          ? `${formatBRL(selectedService.amount)} por período, cobrado automaticamente`
                          : `Pagamento único de ${formatBRL(selectedService.amount)}`}
                    </p>
                  ) : null}
                </div>
                </div>
                <div className="space-y-2">
                  <Label>Contrato (opcional)</Label>
                  <Select value={form.contractId || "none"} onValueChange={(v) => setForm({ ...form, contractId: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem contrato</SelectItem>
                      {contracts?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(() => {
                    const sel = contracts?.find((c) => c.id === form.contractId);
                    return sel && sel.status !== "signed" ? (
                      <p className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">
                        Contrato ainda não assinado por todas as partes. Você pode gerar a cobrança, mas recomendamos concluir as assinaturas antes.
                      </p>
                    ) : null;
                  })()}
                </div>
                <p className="border-t border-border pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pagamento</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Forma de pagamento</Label>
                    <Select value={form.method} onValueChange={(v) => { const method = v as Method; setForm({ ...form, method }); setPixAuto(method === "pix_automatic"); setFeeShare(0); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[...methodOptions, ...(selectedService?.type === "recurring" ? (["pix_automatic"] as Method[]) : [])].filter((m, i, all) => all.indexOf(m) === i).map((m) => (
                          <SelectItem key={m} value={m}>{paymentMethodLabels[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due">Primeiro vencimento</Label>
                    <DateField id="due" min={today} value={form.dueOn} onChange={(v) => setForm({ ...form, dueOn: v })} />
                    {!form.dueOn ? <p className="text-xs text-muted-foreground">Sem data, vence em 5 dias.</p> : null}
                  </div>
                </div>
                {selectedService?.type === "installment" ? (() => {
                  const base = Math.min(21, Math.max(2, Number(selectedService.installments ?? 2)));
                  const n = installmentCount ?? base;
                  const total = selectedService.custom_amount ? Number(customAmount.replace(/\./g, "").replace(",", ".")) || 0 : Number(selectedService.amount);
                  return (
                    <div className="grid gap-4 rounded-lg border border-border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)] sm:items-end">
                      <div className="space-y-2">
                        <Label>Número de parcelas</Label>
                        <Select value={String(n)} onValueChange={(value) => setInstallmentCount(Number(value))}>
                          <SelectTrigger aria-label="Número de parcelas" className="bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 20 }, (_, index) => index + 2).map((count) => <SelectItem key={count} value={String(count)}>{count} parcelas</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">A quantidade fica definida nesta cobrança e não poderá ser escolhida pelo cliente.</p>
                      </div>
                      {total > 0 ? <div className="rounded-md border border-border bg-background px-4 py-3"><p className="text-xs text-muted-foreground">Valor de cada parcela</p><p className="numeric-tabular mt-1 text-lg font-semibold text-foreground">{formatBRL(total / n)}</p><p className="mt-0.5 text-xs text-muted-foreground">{n}x · total {formatBRL(total)}</p></div> : null}
                    </div>
                  );
                })() : null}
                {form.method === "pix_automatic" ? (
                  <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                    <Landmark className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div><p className="font-medium">Autorização no aplicativo do banco</p><p className="mt-1 text-xs text-muted-foreground">O cliente autoriza uma vez pelo QR Code. As próximas cobranças recorrentes são pagas automaticamente e ele pode cancelar quando quiser no banco.</p></div>
                  </div>
                ) : null}
                {!(pixAuto && selectedService?.type === "recurring") ? (
                  <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-4">
                    <div className="flex min-w-0 gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Percent className="size-4" /></span><div><p className="text-sm font-semibold">{ui("Multa e juros por atraso")}</p><p className="mt-1 text-xs text-muted-foreground">{lateFees?.fineEnabled ? `${ui("Multa de")} ${lateFees.finePercent.toLocaleString()}%` : ui("Sem multa")} · {lateFees?.interestEnabled ? `${ui("Juros de")} ${lateFees.interestPercent.toLocaleString()}% ${ui("ao mês")}` : ui("Sem juros")}</p>{lateFees && !lateFees.configured ? <p className="mt-1 text-xs text-primary">{ui("Padrão inicial da Asaas ativo.")}</p> : null}</div></div>
                    <Button type="button" variant="outline" size="sm" asChild><Link to="/multas-e-encargos">{ui("Ajustar")}</Link></Button>
                  </div>
                ) : null}
                {selectedService?.type === "installment" ? (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                    <div><Label>Quem paga a taxa?</Label><p className="mt-1 text-xs text-muted-foreground">Defina como a taxa desta cobrança será dividida.</p></div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button type="button" variant={feeShare === 0 ? "default" : "outline"} className="h-auto justify-start gap-2 py-3" disabled={form.method === "undefined"} onClick={() => setFeeShare(0)}><Sparkles className="size-4" /><span className="text-left"><span className="block text-xs font-semibold">Eu absorvo</span><span className="block text-[11px] font-normal opacity-75">A taxa sai do valor recebido</span></span></Button>
                      <Button type="button" variant={feeShare === 100 ? "default" : "outline"} className="h-auto justify-start gap-2 py-3" disabled={form.method === "undefined"} onClick={() => setFeeShare(100)}><UserRound className="size-4" /><span className="text-left"><span className="block text-xs font-semibold">Cliente paga</span><span className="block text-[11px] font-normal opacity-75">A taxa é somada ao total</span></span></Button>
                    </div>
                    <div className="flex items-center gap-3"><Label htmlFor="fee-share" className="shrink-0 text-xs">Dividir</Label><Input id="fee-share" type="number" min={0} max={100} className="h-8" disabled={form.method === "undefined"} value={feeShare} onChange={(e) => setFeeShare(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /><span className="text-xs text-muted-foreground">% com o cliente</span></div>
                    <p className="text-xs text-muted-foreground">
                      {form.method === "undefined" ? "Escolha a forma de pagamento para repassar a taxa." : feeShare > 0 ? "O valor final é recalculado pelo sistema e o cliente vê a taxa separada no link de pagamento." : "Você recebe o valor do serviço menos a taxa."}
                    </p>
                  </div>
                ) : null}
                {selectedService ? (
                  <CoproductionCard enabled={coproOn} onEnabled={setCoproOn} list={coproducers} onChange={setCoproducers}
                    total={selectedService.custom_amount ? Number(customAmount.replace(/\./g, "").replace(",", ".")) || null : Number(selectedService.amount) || null}
                    installments={selectedService.type === "installment" ? (installmentCount ?? Number(selectedService.installments ?? 2)) : 1} />
                ) : null}
                {!(pixAuto && selectedService?.type === "recurring") ? (
                  <details className="group rounded-lg border border-border">
                    <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-medium">Lembretes desta cobrança <span className="text-xs text-muted-foreground group-open:hidden">{dunningPlan ? "Personalizado" : "Padrão da empresa"} · abrir</span></summary>
                    <div className="px-4 pb-4"><DunningPlanPicker value={dunningPlan} onChange={setDunningPlan} /></div>
                  </details>
                ) : null}
                <div className="sticky bottom-0 -mx-6 flex flex-col-reverse gap-2 border-t border-border bg-background/95 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">O link não expira e pode ser copiado a qualquer momento.</p>
                  <Button type="submit" className="sm:min-w-52" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando…" : pixAuto && selectedService?.type === "recurring" ? "Gerar link de autorização" : "Criar cobrança e link"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      {!(workspace?.providerStatus === "connected") ? (
        <p className="mb-4 text-sm text-muted-foreground">Ative sua conta de pagamentos em Configurações para criar cobranças.</p>
      ) : null}
      <ActivationNotice tenantId={workspace?.tenantId} />

      <ChangeChargeDunningDialog chargeGroupId={dunningEdit} onClose={() => setDunningEdit(null)} />
      <ChargeMethodDialog paymentId={methodEdit} onClose={() => setMethodEdit(null)} />
      <Dialog open={Boolean(linkToken)} onOpenChange={(v) => !v && setLinkToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{linkKind === "pixauto" ? "Link de autorização do Pix Automático" : "Link de pagamento"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {linkKind === "pixauto" ? "Envie ao cliente: a página mostra o QR code e explica como autorizar no app do banco. Vale por 7 dias. " : ""}Copie e envie ao cliente. Este é o link fixo da cobrança: você pode copiá-lo de novo a qualquer momento na tabela de cobranças.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={linkUrl} className="font-mono text-xs" />
            <Button
              type="button"
              size="icon"
              aria-label="Copiar link"
              onClick={() => {
                void navigator.clipboard.writeText(linkUrl);
                toast.success("Link copiado.");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SummaryStrip items={[
        { label: ui("Em aberto"), value: isLoading ? null : formatBRL(summary.open) },
        { label: "Recebido", value: isLoading ? null : formatBRL(summary.paid), accent: true },
        { label: "Vencido", value: isLoading ? null : formatBRL(summary.overdue) },
        { label: "Reembolsado", value: isLoading ? null : formatBRL(summary.refunded) },
      ]} />

      <div className="surface-panel overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar por cliente, e-mail, CPF/CNPJ, valor ou descrição" className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem><SelectItem value="open">{ui("Em aberto")}</SelectItem><SelectItem value="paid">Pagas</SelectItem>
              <SelectItem value="overdue">Vencidas</SelectItem><SelectItem value="refunded">Reembolsadas</SelectItem><SelectItem value="cancelled">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cobrança</TableHead>
              <TableHead className="hidden md:table-cell">{ui("Cliente")}</TableHead>
              <TableHead className="hidden lg:table-cell">Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="hidden xl:table-cell text-right">Líquido</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-32">Link</TableHead>
              <TableHead className="w-14 text-right"><span className="sr-only">Ações</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton cols={8} />
            ) : isError ? (
              <TableStateRow cols={8}><ErrorState onRetry={() => refetch()} /></TableStateRow>
            ) : visibleGroups.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">{groups.length ? "Nenhuma cobrança com esses filtros." : "Nenhuma cobrança ainda. Clique em “Criar cobrança” para enviar a primeira."}</TableCell></TableRow>
            ) : (
              visiblePage.map((g) => {
                const open = g.items.some((p) => ["awaiting_payment", "overdue", "created"].includes(p.status));
                const inv = invoiceRows?.find((i) => (i.payment_id && g.items.some((p) => p.id === i.payment_id)) || i.charge_group_id === g.id);
                return (
                  <TableRow key={g.id} className="cursor-pointer" onClick={() => setDetail(g)}>
                    <TableCell className="font-medium">
                      {g.next.description ?? "Cobrança"}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {serviceTypeLabels[g.kind]}
                        {g.kind === "installment" ? ` · ${g.paid}/${g.next.installment_count} pagas` : ""}
                        {g.kind === "recurring" ? ` · ${g.paid} pagas` : ""}
                        {g.next.method ? ` · ${paymentMethodLabels[g.next.method]}` : ""}
                        <span className="md:hidden"> · <NameText max="max-w-[10rem]">{g.customer}</NameText></span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell"><NameText max="max-w-[12rem]">{g.customer}</NameText></TableCell>
                    <TableCell className="hidden lg:table-cell">{formatDate(g.next.due_on)}</TableCell>
                    <TableCell className="numeric-tabular text-right font-medium">{formatBRL(g.gross)}</TableCell>
                    <TableCell className="hidden xl:table-cell numeric-tabular text-right text-muted-foreground">{formatBRL(g.net)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge tone={g.next.status === "paid" ? "success" : g.next.status === "overdue" || g.next.status === "failed" ? "danger" : g.next.status === "refunded" ? "neutral" : "warning"}>
                          {paymentStatusLabels[g.next.status]}
                        </StatusBadge>
                        {inv ? <StatusBadge tone={INVOICE_STATUS_TONE[inv.status as InvoiceStatus]}>NFS-e</StatusBadge> : null}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}><CopyChargeLinkButton chargeGroupId={g.id} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Ações"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setDetail(g)}>Ver detalhes</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDunningEdit(g.id)}>Plano de lembretes</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setMethodEdit(g.next.id)}>Forma de pagamento e histórico</DropdownMenuItem>
                          {inv ? (
                            <DropdownMenuItem asChild><Link to="/notas-fiscais/$id" params={{ id: inv.id }}>Ver nota fiscal</Link></DropdownMenuItem>
                          ) : g.kind === "recurring" && g.next.subscription_id ? (
                            <DropdownMenuItem onClick={() => setSubInvoice(g.next.subscription_id!)}>NFS-e automática</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem asChild><Link to="/notas-fiscais" search={g.kind === "installment" ? { emitir: "installment" } : { emitir: "payment", cobranca: g.next.id }}>Emitir nota</Link></DropdownMenuItem>
                          )}
                          {open ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => regenerateMutation.mutate(g.id)}>Novo link</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => simulateMutation.mutate(g.id)}>Simular pagamento</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => syncMutation.mutate(g.id)}>Atualizar status</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => revokeMutation.mutate(g.id)}>Revogar links</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => {
                                void confirmAction({ title: "Excluir esta cobrança?", description: "As parcelas sem pagamento serão canceladas e deixarão de aparecer nos valores a receber e em atraso.", confirmText: "Excluir cobrança", destructive: true }).then((ok) => ok && cancelMutation.mutate(g.id));
                              }}>Excluir cobrança</DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <DataPagination page={page} pageSize={10} total={visibleGroups.length} onPageChange={setPage} />
        </div>
      </div>
      <ChargeSheet group={detail as never} onClose={() => setDetail(null)} />
      {tenantId ? <RefundsPanel tenantId={tenantId} /> : null}
      {workspace?.providerStatus === "connected" ? <PixAutomaticPanel /> : null}
      {subInvoice ? <SubscriptionInvoiceDialog subscriptionId={subInvoice} onClose={() => setSubInvoice(null)} /> : null}
    </div>
  );
}

function expiryDays(e: { on: boolean; days: string; date: string }) {
  if (!e.on) return 30;
  if (e.days !== "custom") return Number(e.days);
  if (!e.date) throw new Error("Escolha a data de expiração.");
  const diff = Math.ceil((new Date(`${e.date}T23:59:59-03:00`).getTime() - Date.now()) / 86_400_000);
  return Math.min(90, Math.max(1, diff));
}
