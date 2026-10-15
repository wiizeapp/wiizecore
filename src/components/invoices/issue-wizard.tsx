import { useServiceFees } from "@/hooks/use-service-fees";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, FileText, Layers, Receipt, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { createInvoice, listInvoiceSources } from "@/lib/invoices.functions";
import { formatBRL, formatDate, formatDocument } from "@/lib/format";
import { paymentMethodLabels } from "@/lib/labels";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListSkeleton } from "@/components/states";
import { useTranslation } from "react-i18next";

type Origin = "payment" | "installment" | "standalone";
export type WizardInit = { origin?: Origin | undefined; paymentId?: string | undefined; customerId?: string | undefined };
type FiscalService = { id: string; name: string; description: string | null; municipal_service_code: string | null; municipal_service_name: string | null; municipal_service_id: string | null; iss: number | null; retain_iss: boolean; service_id: string | null; active: boolean };

const STEPS = ["Origem", "Cliente", "Serviço", "Dados fiscais", "Revisão"];
const todayBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const REQUIRED = "Este dado é necessário para emitir a NFS-e.";

export function IssueWizard({ open, onOpenChange, services, init, environment }: {
  open: boolean; onOpenChange: (v: boolean) => void; services: FiscalService[]; init?: WizardInit | undefined; environment: "sandbox" | "production";
}) {
  const { t: ui } = useTranslation("ui");
  const invoiceFee = useServiceFees()?.invoice ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: ws } = useWorkspace();
  const tenantId = ws?.tenantId;
  const fetchSources = useServerFn(listInvoiceSources);
  const create = useServerFn(createInvoice);
  const [step, setStep] = useState(0);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [q, setQ] = useState("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [fsId, setFsId] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [observations, setObservations] = useState("");
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [date, setDate] = useState(todayBR());

  useEffect(() => {
    if (!open) return;
    setStep(init?.origin ? 1 : 0); setOrigin(init?.origin ?? null); setPaymentId(init?.paymentId ?? null); setGroupId(null);
    setCustomerId(init?.customerId ?? null); setFsId(null); setValue(""); setDescription(""); setObservations(""); setWhen("now"); setDate(todayBR()); setQ("");
  }, [open, init?.origin, init?.paymentId, init?.customerId]);

  const sources = useQuery({ queryKey: ["invoice-sources"], queryFn: () => fetchSources(), enabled: open && origin !== "standalone" && origin !== null });
  const customers = useQuery({
    queryKey: ["customers-fiscal", tenantId], enabled: open && Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, document, email, phone, address, city, state").eq("tenant_id", tenantId!).order("name");
      if (error) throw error;
      return data;
    },
  });

  const payment = sources.data?.payments.find((p) => p.id === paymentId) ?? null;
  const group = sources.data?.installments.find((g) => g.id === groupId) ?? null;
  const effectiveCustomerId = origin === "payment" ? payment?.customerId : origin === "installment" ? group?.customerId : customerId;
  const customer = customers.data?.find((c) => c.id === effectiveCustomerId) ?? null;
  const commercialServiceId = origin === "payment" ? payment?.serviceId : origin === "installment" ? group?.serviceId : null;
  const activeServices = services.filter((s) => s.active);
  const fs = activeServices.find((s) => s.id === fsId) ?? null;
  const amount = origin === "payment" ? payment?.amount ?? 0 : origin === "installment" ? group?.amount ?? 0 : Number(value.replace(",", ".")) || 0;

  // Serviço comercial ligado a um serviço fiscal → preenche sozinho.
  useEffect(() => {
    if (step !== 2 || fsId) return;
    const linked = commercialServiceId ? activeServices.find((s) => s.service_id === commercialServiceId) : null;
    const pick = linked ?? (activeServices.length === 1 ? activeServices[0] : null);
    if (pick) { setFsId(pick.id); if (!description) setDescription(pick.description || pick.name); }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredPayments = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (sources.data?.payments ?? []).filter((p) => !t || [p.customer, p.description, p.id, String(p.amount), p.dueOn, formatBRL(p.amount)].some((x) => String(x ?? "").toLowerCase().includes(t))).slice(0, 40);
  }, [q, sources.data]);
  const filteredGroups = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (sources.data?.installments ?? []).filter((g) => !t || [g.customer, g.description, formatBRL(g.amount)].some((x) => String(x ?? "").toLowerCase().includes(t)));
  }, [q, sources.data]);
  const filteredCustomers = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (customers.data ?? []).filter((c) => !t || c.name.toLowerCase().includes(t) || (c.document ?? "").includes(t.replace(/\D/g, "") || "§")).slice(0, 40);
  }, [q, customers.data]);

  const customerMissing = customer ? [!customer.document && "CPF/CNPJ", !customer.email && "E-mail"].filter(Boolean) as string[] : [];
  const canNext = [
    Boolean(origin),
    origin === "payment" ? Boolean(payment) : origin === "installment" ? Boolean(group) : Boolean(customer) && customerMissing.length === 0,
    Boolean(fs) && description.trim().length >= 3 && amount > 0,
    when === "now" || date >= todayBR(),
    true,
  ][step];

  const submit = useMutation({
    mutationFn: () => create({ data: {
      origin: origin!, paymentId: paymentId ?? undefined, chargeGroupId: groupId ?? undefined, customerId: customerId ?? undefined,
      fiscalServiceId: fsId!, value: origin === "standalone" ? amount : undefined, description: description.trim(),
      observations: observations.trim() || null, effectiveDate: when === "schedule" ? date : undefined,
    } }),
    onSuccess: (r) => {
      toast.success(r.status === "SCHEDULED" && when === "schedule" ? "Nota agendada." : "Processando emissão. Avisaremos quando a prefeitura autorizar.");
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["invoice-sources"] });
      onOpenChange(false);
      void navigate({ to: "/notas-fiscais/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error("Não foi possível emitir a nota", { description: e.message }),
  });

  const row = "flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm transition-colors";
  const sel = (on: boolean) => `${row} ${on ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Emitir nota fiscal</DialogTitle></DialogHeader>
        <ol className="grid grid-cols-5 gap-1.5" aria-label="Etapas">
          {STEPS.map((s, i) => (
            <li key={s} className="min-w-0">
              <div className={`h-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <p className={`mt-1.5 truncate text-[11px] ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{s}</p>
            </li>
          ))}
        </ol>

        {environment === "production" ? (
          <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs">Ambiente de produção: esta ação poderá gerar um documento fiscal válido.</p>
        ) : (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Ambiente de teste: a nota depende das regras do município usado no teste.</p>
        )}

        <div className="min-h-[260px] space-y-3">
          {step === 0 && (
            <>
              <p className="font-display text-sm font-semibold">Como deseja emitir esta nota?</p>
              {([
                ["payment", Receipt, "A partir de uma cobrança", "Vincule a nota a uma cobrança existente."],
                ["installment", Layers, "A partir de um parcelamento", "Vincule a nota a um parcelamento."],
                ["standalone", FileText, "Nota avulsa", "Para serviços recebidos fora da Wiize Core (dinheiro, transferência, outra maquininha)."],
              ] as const).map(([k, Icon, t, d]) => (
                <button key={k} type="button" className={sel(origin === k)} onClick={() => { setOrigin(k); setPaymentId(null); setGroupId(null); setCustomerId(null); }}>
                  <span className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10"><Icon className="h-4 w-4 text-primary" /></span>
                    <span><span className="block font-medium">{t}</span><span className="text-xs text-muted-foreground">{d}</span></span>
                  </span>
                  {origin === k ? <Check className="h-4 w-4 text-primary" /> : null}
                </button>
              ))}
            </>
          )}

          {step === 1 && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder={origin === "standalone" ? "Buscar cliente" : origin === "payment" ? "Buscar cobrança (cliente, valor, ID, data, descrição)" : "Buscar parcelamento"} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {origin === "payment" && (sources.isLoading ? <ListSkeleton rows={3} /> : filteredPayments.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma cobrança disponível para nota.</p> : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {filteredPayments.map((p) => (
                    <button key={p.id} type="button" className={sel(paymentId === p.id)} onClick={() => setPaymentId(p.id)}>
                      <span className="min-w-0"><span className="block truncate font-medium">{p.customer}</span><span className="block truncate text-xs text-muted-foreground">{p.description ?? "Cobrança"}{p.installment ? ` · parcela ${p.installment}` : ""} · vence {formatDate(p.dueOn)}</span></span>
                      <span className="numeric-tabular shrink-0 font-semibold">{formatBRL(p.amount)}</span>
                    </button>
                  ))}
                </div>
              ))}
              {origin === "installment" && (sources.isLoading ? <ListSkeleton rows={3} /> : filteredGroups.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nenhum parcelamento disponível para nota.</p> : (
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {filteredGroups.map((g) => (
                    <button key={g.id} type="button" className={sel(groupId === g.id)} onClick={() => setGroupId(g.id)}>
                      <span className="min-w-0"><span className="block truncate font-medium">{g.customer}</span><span className="block truncate text-xs text-muted-foreground">{g.description ?? "Parcelamento"} · {g.count}x</span></span>
                      <span className="numeric-tabular shrink-0 font-semibold">{formatBRL(g.amount)}</span>
                    </button>
                  ))}
                </div>
              ))}
              {origin === "standalone" && (customers.isLoading ? <ListSkeleton rows={3} /> : (
                <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                  {filteredCustomers.map((c) => (
                    <button key={c.id} type="button" className={sel(customerId === c.id)} onClick={() => setCustomerId(c.id)}>
                      <span className="min-w-0"><span className="block truncate font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{formatDocument(c.document) || "Sem CPF/CNPJ"}</span></span>
                    </button>
                  ))}
                  {filteredCustomers.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nenhum cliente encontrado. <Link to="/clientes" className="text-primary underline">Cadastrar cliente</Link></p> : null}
                </div>
              ))}
              {payment && (
                <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-4 text-xs sm:grid-cols-3">
                  {[[ui("Cliente"), payment.customer], ["Serviço", payment.service ?? "—"], ["Valor", formatBRL(payment.amount)], ["Vencimento", formatDate(payment.dueOn)], ["Método", paymentMethodLabels[payment.method ?? ""] ?? "A escolher"], ["Status", payment.status === "paid" ? "Paga" : "Em aberto"]].map(([k, v]) => (
                    <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
                  ))}
                </dl>
              )}
              {customer && customerMissing.length > 0 && (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
                  <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" />{REQUIRED}</p>
                  <p className="mt-1 text-muted-foreground">Complete no cadastro do cliente: {customerMissing.join(", ")}.</p>
                  <Link to="/clientes" className="mt-2 inline-block text-primary underline">Corrigir cadastro</Link>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              {activeServices.length === 0 ? (
                <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
                  Cadastre um serviço fiscal antes de emitir. <Link to="/notas-fiscais/configuracoes" className="text-primary underline">Configurar serviço</Link>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Serviço prestado</Label>
                  <Select value={fsId ?? ""} onValueChange={(v) => { setFsId(v); const s = activeServices.find((x) => x.id === v); if (s) setDescription(s.description || s.name); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{activeServices.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.municipal_service_code ?? "serviço municipal"}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="inv-desc">Descrição do serviço na nota</Label>
                <Textarea id="inv-desc" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {origin === "standalone" ? (
                <div className="space-y-2">
                  <Label htmlFor="inv-value">Valor (R$)</Label>
                  <Input id="inv-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" />
                </div>
              ) : <p className="text-xs text-muted-foreground">Valor da nota: <b className="text-foreground">{formatBRL(amount)}</b> (igual ao da {origin === "payment" ? "cobrança" : "soma das parcelas"}).</p>}
            </>
          )}

          {step === 3 && (
            <>
              <Label>Data de emissão</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" className={sel(when === "now")} onClick={() => setWhen("now")}><span><span className="block font-medium">Emitir agora</span><span className="text-xs text-muted-foreground">Envia para a prefeitura hoje.</span></span></button>
                <button type="button" className={sel(when === "schedule")} onClick={() => setWhen("schedule")}><span><span className="block font-medium">Agendar emissão</span><span className="text-xs text-muted-foreground">Escolha uma data futura.</span></span></button>
              </div>
              {when === "schedule" ? <Input type="date" min={todayBR()} value={date} onChange={(e) => setDate(e.target.value)} /> : null}
              <div className="space-y-2">
                <Label htmlFor="inv-obs">Observações da nota (opcional)</Label>
                <Textarea id="inv-obs" rows={3} maxLength={2000} value={observations} onChange={(e) => setObservations(e.target.value)} />
                <p className="text-right text-[11px] text-muted-foreground">{observations.length}/2000</p>
              </div>
              {fs && <p className="text-xs text-muted-foreground">Tributação: ISS {fs.iss ?? 0}%{fs.retain_iss ? " retido pelo tomador" : ""}, conforme o serviço fiscal.</p>}
            </>
          )}

          {step === 4 && (
            <>
              <p className="font-display text-sm font-semibold">Revise sua nota fiscal</p>
              <p className="text-xs text-muted-foreground">Taxa: <span className="font-medium text-foreground">{invoiceFee != null ? formatBRL(invoiceFee) : "conforme tabela"}</span>, descontada do saldo após a autorização.</p>
              <dl className="grid gap-3 rounded-xl bg-muted/50 p-4 text-sm sm:grid-cols-2">
                {[
                  [ui("Cliente"), customer?.name ?? "—"], ["Serviço", fs?.name ?? "—"], ["Valor", formatBRL(amount)],
                  ["Data", when === "now" ? "Hoje" : formatDate(date)], ["Código de serviço", fs?.municipal_service_code ?? fs?.municipal_service_name ?? "—"],
                  ["Tributação", `ISS ${fs?.iss ?? 0}%${fs?.retain_iss ? " (retido)" : ""}`],
                  ["Origem", origin === "payment" ? "Cobrança" : origin === "installment" ? "Parcelamento" : "Avulsa"], ["Observações", observations || "—"],
                ].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 break-words font-medium">{v}</dd></div>)}
              </dl>
              <p className="text-xs text-muted-foreground">Após a autorização pela prefeitura, alterações ou cancelamentos estarão sujeitos às regras do município.</p>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}>{step === 0 ? "Cancelar" : "Voltar"}</Button>
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Continuar</Button>
          ) : (
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>{submit.isPending ? "Enviando…" : "Emitir nota"}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
