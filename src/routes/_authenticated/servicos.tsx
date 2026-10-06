import { createFileRoute, Link } from "@tanstack/react-router";
import { TableRowsSkeleton, TableStateRow, ErrorState, ListSkeleton } from "@/components/states";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/app-shell";
import { FiscalServiceDialog } from "@/components/invoices/fiscal-service-dialog";
import { getFiscalOverview } from "@/lib/invoices.functions";
import { useServerFn } from "@tanstack/react-start";
import { DataPagination, paginate, SummaryStrip, StatusBadge, SearchField, matchesSearch } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { frequencyLabels, serviceTypeLabels } from "@/lib/labels";
import { formatBRL } from "@/lib/format";
import { useTranslation } from "react-i18next";

type ServiceType = "one_time" | "installment" | "recurring" | "flexible";

export const Route = createFileRoute("/_authenticated/servicos")({
  head: () => ({
    meta: [
      { title: "Serviços — WiizePay" },
      { name: "description", content: "Cadastre serviços, recorrências e parcelamentos da sua empresa na WiizePay." },
      { property: "og:title", content: "Serviços — WiizePay" },
      { property: "og:description", content: "Cadastre serviços, recorrências e parcelamentos da sua empresa na WiizePay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Servicos,
});

function Servicos() {
  const { t: ui } = useTranslation("ui");
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [customAmount, setCustomAmount] = useState(false);
  const { data: workspace } = useWorkspace();
  const tenantId = workspace?.tenantId;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ServiceType>("one_time");
  const [frequency, setFrequency] = useState("monthly");
  const [form, setForm] = useState({
    name: "",
    description: "",
    amount: "",
    installments: "2",
    cycles: "",
    dueDays: String(workspace?.settings.defaultDueDays ?? 5),
  });

  const fetchFiscal = useServerFn(getFiscalOverview);
  const fiscal = useQuery({ queryKey: ["fiscal-overview"], queryFn: () => fetchFiscal() });
  const [fiscalEdit, setFiscalEdit] = useState<{ serviceId: string; row: any } | null>(null);
  const { data: services, isLoading, isError, refetch } = useQuery({
    queryKey: ["services", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, type, amount, frequency, installments, cycles, active, due_days, custom_amount, flexible_type, archived_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Serviços personalizados: média das últimas cobranças de cada um (sem cobrança = fora do cálculo).
  const customIds = (services ?? []).filter((s) => s.custom_amount).map((s) => s.id);
  const { data: customAvg } = useQuery({
    queryKey: ["services-custom-avg", tenantId, customIds.join(",")],
    enabled: Boolean(tenantId) && customIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("service_id, gross_amount, created_at")
        .eq("tenant_id", tenantId!)
        .in("service_id", customIds)
        .not("status", "in", "(cancelled,failed)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const acc: Record<string, number[]> = {};
      for (const r of data ?? []) {
        const k = r.service_id as string;
        if ((acc[k] ??= []).length < 10) acc[k].push(Number(r.gross_amount ?? 0));
      }
      return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
    },
  });
  const ticketValues = (services ?? []).flatMap((s) => {
    if (!s.custom_amount) return [Number(s.amount ?? 0)];
    const v = customAvg?.[s.id];
    return v === undefined ? [] : [v];
  });
  const ticketReady = services && (customIds.length === 0 || customAvg !== undefined);

  const createService = useMutation({
    mutationFn: async () => {
      const amount = customAmount ? 0 : Number(form.amount.replace(",", "."));
      if (!customAmount && (!Number.isFinite(amount) || amount <= 0)) throw new Error("Informe um valor válido.");
      const flexible = type === "flexible";
      const installments = type === "installment" ? Number(form.installments) : null;
      if (type === "installment" && (!installments || installments < 2)) {
        throw new Error("Parcelamento exige pelo menos 2 parcelas.");
      }
      const { error } = await supabase.from("services").insert({
        tenant_id: tenantId!,
        name: form.name.trim(),
        description: form.description.trim() || null,
        type: flexible ? "one_time" : type,
        flexible_type: flexible,
        amount: Number(amount.toFixed(2)),
        frequency: type === "recurring" ? (frequency as never) : null,
        installments,
        custom_amount: customAmount,
        installment_amount: installments && !customAmount ? Number((amount / installments).toFixed(2)) : null,
        cycles: type === "recurring" && form.cycles ? Number(form.cycles) : null,
        due_days: Number(form.dueDays) || 5,
      });
      if (error) throw new Error("Não foi possível salvar o serviço.");
    },
    onSuccess: () => {
      toast.success("Serviço cadastrado.");
      setOpen(false);
      setCustomAmount(false);
      setForm({ name: "", description: "", amount: "", installments: "2", cycles: "", dueDays: "5" });
      void queryClient.invalidateQueries({ queryKey: ["services", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["counts", tenantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateService = useMutation({
    mutationFn: async (v: { id: string; patch: { active?: boolean; archived_at?: string | null } }) => {
      const { error } = await supabase.from("services").update(v.patch).eq("id", v.id).eq("tenant_id", tenantId!);
      if (error) throw new Error("Não foi possível atualizar o serviço.");
    },
    onSuccess: () => { toast.success("Serviço atualizado."); void queryClient.invalidateQueries({ queryKey: ["services", tenantId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredServices = (services ?? []).filter((s) => (showArchived ? s.archived_at : !s.archived_at)).filter((s) => matchesSearch(q, [s.name, s.amount, Number(s.amount ?? 0).toFixed(2).replace('.', ','), serviceTypeLabels[s.type]]));

  return (
    <div>
      <PageHeader
        title={ui("Serviços")}
        description="Defina o que você vende: pagamento único, parcelado ou recorrente."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Novo serviço</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo serviço</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createService.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="service-name">Nome do serviço</Label>
                  <Input
                    id="service-name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="service-desc">Descrição</Label>
                  <Textarea
                    id="service-desc"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Forma de cobrança</Label>
                    <Select value={type} onValueChange={(value) => setType(value as ServiceType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="one_time">Pagamento único</SelectItem>
                        <SelectItem value="installment">Parcelado</SelectItem>
                        <SelectItem value="recurring">Recorrente</SelectItem>
                        <SelectItem value="flexible">Personalizada (definir na cobrança)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Valor total (R$)</Label>
                    <Input
                      id="amount"
                      required={!customAmount}
                      disabled={customAmount}
                      placeholder={customAmount ? "Definido na cobrança" : undefined}
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={customAmount} onChange={(e) => setCustomAmount(e.target.checked)} />
                  <span className="text-sm"><span className="font-medium">Valor personalizado</span><span className="block text-xs text-muted-foreground">Você informa o valor na hora de criar cada cobrança.</span></span>
                </label>

                {type === "flexible" ? (
                  <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Ao criar cada cobrança você escolhe se ela será à vista, parcelada ou recorrente — sem precisar cadastrar o mesmo serviço três vezes.
                  </p>
                ) : null}

                {type === "installment" ? (
                  <div className="space-y-2">
                    <Label htmlFor="installments">Número de parcelas</Label>
                    <Input
                      id="installments"
                      type="number"
                      min={2}
                      max={24}
                      value={form.installments}
                      onChange={(e) => setForm({ ...form, installments: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Parcelamento divide um valor único em várias parcelas — diferente de recorrência.
                    </p>
                  </div>
                ) : null}

                {type === "recurring" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Periodicidade</Label>
                      <Select value={frequency} onValueChange={setFrequency}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(frequencyLabels).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cycles">Nº de ciclos (opcional)</Label>
                      <Input
                        id="cycles"
                        type="number"
                        min={1}
                        value={form.cycles}
                        onChange={(e) => setForm({ ...form, cycles: e.target.value })}
                      />
                    </div>
                  </div>
                ) : null}

                <Button type="submit" className="w-full" disabled={createService.isPending}>
                  Salvar serviço
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <SummaryStrip
        items={[
          { label: ui("Serviços"), value: services ? String(services.length) : null },
          { label: "Ativos", value: services ? String(services.filter((s) => s.active).length) : null, accent: true },
          { label: "Recorrentes", value: services ? String(services.filter((s) => s.type === "recurring").length) : null },
          { label: "Ticket médio", value: ticketReady ? formatBRL(ticketValues.length ? ticketValues.reduce((t, v) => t + v, 0) / ticketValues.length : 0) : null },
        ]}
      />

      <div className="surface-panel overflow-hidden overflow-x-auto">
        <div className="border-b border-border px-5 py-3"><SearchField value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Pesquisar por nome ou valor" /></div>
        <div className="flex justify-end border-b border-border px-5 py-2"><Button size="sm" variant="ghost" onClick={() => { setShowArchived((v) => !v); setPage(0); }}>{showArchived ? "Ver serviços" : "Ver arquivados"}</Button></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Cobrança</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Detalhes</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Configuração fiscal</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton cols={7} />
            ) : isError ? (
              <TableStateRow cols={7}><ErrorState onRetry={() => refetch()} /></TableStateRow>
            ) : filteredServices.length > 0 ? (
               paginate(filteredServices, page, 10).map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.name}</TableCell>
                  <TableCell>{service.flexible_type ? "Personalizada" : serviceTypeLabels[service.type]}</TableCell>
                  <TableCell className="numeric-tabular">{service.custom_amount ? <span className="text-sm text-muted-foreground">Personalizado</span> : formatBRL(service.amount)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {service.flexible_type
                      ? "Definida na cobrança"
                      : service.type === "installment"
                      ? `${service.installments}x`
                      : service.type === "recurring"
                        ? frequencyLabels[service.frequency ?? "monthly"]
                        : "Pagamento único"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={service.active ? "success" : "neutral"}>
                      {service.archived_at ? "Arquivado" : service.active ? "Ativo" : "Inativo"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const fsv = fiscal.data?.services.find((f) => f.active && f.service_id === service.id);
                      return (
                        <div className="flex items-center gap-2">
                          {fsv ? <span className="text-xs"><span className="block font-medium">{fsv.name}</span><span className="text-muted-foreground">{fsv.municipal_service_code ?? "Serviço municipal"}</span></span> : <StatusBadge>Sem serviço fiscal</StatusBadge>}
                          <Button size="sm" variant="ghost" onClick={() => setFiscalEdit({ serviceId: service.id, row: fsv ?? null })}>{fsv ? "Editar" : "Associar"}</Button>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {service.archived_at ? (
                      <Button size="sm" variant="ghost" disabled={updateService.isPending} onClick={() => updateService.mutate({ id: service.id, patch: { archived_at: null } })}>Restaurar</Button>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" disabled={updateService.isPending} onClick={() => updateService.mutate({ id: service.id, patch: { active: !service.active } })}>{service.active ? "Desativar" : "Ativar"}</Button>
                        {!service.active ? <Button size="sm" variant="ghost" disabled={updateService.isPending} onClick={() => updateService.mutate({ id: service.id, patch: { archived_at: new Date().toISOString() } })}>Arquivar</Button> : null}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  {showArchived ? "Nenhum serviço arquivado." : "Nenhum serviço cadastrado. Cadastre seus serviços para cobrar mais rápido."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataPagination page={page} pageSize={10} total={filteredServices.length} onPageChange={setPage} />
      </div>
      {fiscalEdit ? <FiscalServiceDialog row={fiscalEdit.row} presetServiceId={fiscalEdit.serviceId} portal={String(fiscal.data?.settings?.portal ?? "municipal")} codeHelp={fiscal.data?.options?.municipalServiceCodeHelp}
        onClose={() => setFiscalEdit(null)} onSaved={() => void queryClient.invalidateQueries({ queryKey: ["fiscal-overview"] })} /> : null}
    </div>
  );
}
