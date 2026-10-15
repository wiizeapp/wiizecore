import { createFileRoute } from "@tanstack/react-router";
import { TableRowsSkeleton, TableStateRow, ErrorState } from "@/components/states";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/app-shell";
import { FiscalServiceDialog } from "@/components/invoices/fiscal-service-dialog";
import { getFiscalOverview } from "@/lib/invoices.functions";
import { listServiceCheckoutLinks, setServiceCheckoutLink } from "@/lib/service-checkout.functions";
import { useServerFn } from "@tanstack/react-start";
import { DataPagination, paginate, SummaryStrip, StatusBadge, SearchField, matchesSearch } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Archive, ArchiveRestore, Check, Copy, ExternalLink, Link2, Loader2, MoreHorizontal, Pencil, Power, Unlink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
      { title: "Serviços — Wiize Core" },
      { name: "description", content: "Cadastre serviços, recorrências e parcelamentos da sua empresa na Wiize Core." },
      { property: "og:title", content: "Serviços — Wiize Core" },
      { property: "og:description", content: "Cadastre serviços, recorrências e parcelamentos da sua empresa na Wiize Core." },
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
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
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
      if (!tenantId) throw new Error("Empresa não encontrada.");
      const { data, error } = await supabase
        .from("services")
        .select("id, name, type, amount, frequency, installments, cycles, active, due_days, custom_amount, flexible_type, archived_at")
        .eq("tenant_id", tenantId)
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
      if (!tenantId) throw new Error("Empresa não encontrada.");
      const { data, error } = await supabase
        .from("payments")
        .select("service_id, gross_amount, created_at")
        .eq("tenant_id", tenantId)
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
      if (!tenantId) throw new Error("Empresa não encontrada.");
      const amount = customAmount ? 0 : Number(form.amount.replace(",", "."));
      if (!customAmount && (!Number.isFinite(amount) || amount <= 0)) throw new Error("Informe um valor válido.");
      const flexible = type === "flexible";
      const installments = type === "installment" ? Number(form.installments) : null;
      if (type === "installment" && (!installments || installments < 2)) {
        throw new Error("Parcelamento exige pelo menos 2 parcelas.");
      }
      const { error } = await supabase.from("services").insert({
        tenant_id: tenantId,
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
      if (!tenantId) throw new Error("Empresa não encontrada.");
      const { error } = await supabase.from("services").update(v.patch).eq("id", v.id).eq("tenant_id", tenantId);
      if (error) throw new Error("Não foi possível atualizar o serviço.");
    },
    onSuccess: () => { toast.success("Serviço atualizado."); void queryClient.invalidateQueries({ queryKey: ["services", tenantId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [linkConfig, setLinkConfig] = useState<{ serviceId: string; name: string; customAmount: boolean; flexible: boolean; existing: boolean } | null>(null);
  const [linkAmount, setLinkAmount] = useState("");
  const [linkType, setLinkType] = useState<"one_time" | "installment" | "recurring">("installment");
  const [linkFrequency, setLinkFrequency] = useState("monthly");
  const [linkMax, setLinkMax] = useState("21");
  const configureLink = (service: NonNullable<typeof services>[number], existing = false) => {
    setLinkAmount(service.custom_amount ? "" : String(service.amount));
    setLinkType(service.flexible_type ? "installment" : service.type);
    setLinkFrequency(service.frequency ?? "monthly");
    setLinkMax("21");
    setLinkConfig({ serviceId: service.id, name: service.name, customAmount: service.custom_amount, flexible: service.flexible_type, existing });
  };
  const fetchOpen = useServerFn(listServiceCheckoutLinks);
  const setOpenFn = useServerFn(setServiceCheckoutLink);
  const openLinks = useQuery({ queryKey: ["service-open-links", tenantId], enabled: Boolean(tenantId), queryFn: () => fetchOpen() });
  const copyCheckoutLink = async (serviceId: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(serviceId);
      toast.success(ui("Link de checkout copiado."));
      setTimeout(() => setCopiedLink((current) => current === serviceId ? null : current), 1800);
    } catch {
      window.prompt(ui("Copie o link de checkout:"), url);
    }
  };
  const toggleOpen = useMutation({
    mutationFn: (v: { serviceId: string; active: boolean; amount?: string; chargeType?: "one_time" | "installment" | "recurring"; frequency?: string; maxInstallments?: number; newVersion?: boolean }) => setOpenFn({ data: v }),
    onSuccess: (r, variables) => {
      if (r.url) { void copyCheckoutLink(variables.serviceId, r.url); }
      else toast.success(ui("Link de checkout desativado."));
      setLinkConfig(null);
      void openLinks.refetch();
    },
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

      <TooltipProvider delayDuration={200}>
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
              <TableHead>{ui("Link de checkout")}</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton cols={8} />
            ) : isError ? (
              <TableStateRow cols={8}><ErrorState onRetry={() => refetch()} /></TableStateRow>
            ) : filteredServices.length > 0 ? (
                paginate(filteredServices, page, 10).map((service) => {
                  const ol = openLinks.data?.find((l) => l.serviceId === service.id && l.active);
                  const canHaveLink = !service.archived_at && service.active;
                  const linkPending = toggleOpen.isPending && toggleOpen.variables?.serviceId === service.id;
                  return (
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
                         <Tooltip>
                           <TooltipTrigger asChild>
                             <Button size="sm" variant="ghost" className="group h-auto min-h-8 max-w-48 gap-1.5 px-2 text-left text-xs font-normal text-muted-foreground hover:text-foreground" aria-label={ui(fsv ? "Editar configuração fiscal" : "Configurar serviço fiscal")} onClick={() => setFiscalEdit({ serviceId: service.id, row: fsv ?? null })}>
                               {fsv ? <span className="min-w-0"><span className="block truncate font-medium text-foreground">{fsv.name}</span><span className="block truncate text-muted-foreground">{fsv.municipal_service_code ?? ui("Serviço municipal")}</span></span> : <StatusBadge>{ui("Sem serviço fiscal")}</StatusBadge>}
                               <Pencil className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                             </Button>
                           </TooltipTrigger>
                           <TooltipContent>{ui(fsv ? "Editar configuração fiscal" : "Configurar serviço fiscal")}</TooltipContent>
                         </Tooltip>
                      );
                    })()}
                  </TableCell>
                   <TableCell className="whitespace-nowrap">
                     {canHaveLink ? <div className="flex h-8 items-center gap-1">
                       {openLinks.isLoading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : ol?.url ? <>
                         <Button size="sm" variant="outline" className="h-8 shrink-0 gap-2 rounded-lg border-border bg-muted/40 pl-2.5 pr-1 font-medium text-muted-foreground shadow-none hover:translate-y-0 hover:border-primary/40 hover:text-foreground hover:shadow-none" onClick={() => { if (ol.url) void copyCheckoutLink(service.id, ol.url); }} aria-label={ui("Copiar link de checkout")}>
                           <Link2 className="size-3.5" /><span>{ui("Copiar link")}</span>
                           <span className="grid size-6 place-items-center rounded-md bg-background text-foreground shadow-sm">{copiedLink === service.id ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}</span>
                         </Button>
                         <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="size-8 text-muted-foreground" asChild aria-label={ui("Abrir checkout")}><a href={ol.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" /></a></Button></TooltipTrigger><TooltipContent>{ui("Abrir checkout")}</TooltipContent></Tooltip>
                       </> : <Button size="sm" variant="outline" className="h-8 gap-2 border-dashed text-muted-foreground shadow-none" disabled={linkPending || openLinks.isError} onClick={() => configureLink(service)}>{linkPending ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}{ui("Criar link")}</Button>}
                     </div> : <span className="text-muted-foreground">—</span>}
                   </TableCell>
                   <TableCell className="whitespace-nowrap text-right">
                     <DropdownMenu>
                       <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-8 text-muted-foreground" aria-label={ui("Ações")}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                       <DropdownMenuContent align="end" className="w-52">
                         {canHaveLink && <DropdownMenuItem onClick={() => configureLink(service, Boolean(ol?.url))}><Pencil className="size-4" />{ui("Configurar novo link")}</DropdownMenuItem>}
                         {canHaveLink && !openLinks.isLoading && !openLinks.isError ? <>
                           {ol?.url ? <DropdownMenuItem disabled={toggleOpen.isPending} onClick={() => toggleOpen.mutate({ serviceId: service.id, active: false })}><Unlink className="size-4" />{ui("Desativar link de checkout")}</DropdownMenuItem> : <DropdownMenuItem disabled={toggleOpen.isPending} onClick={() => configureLink(service)}><Link2 className="size-4" />{ui("Criar link de checkout")}</DropdownMenuItem>}
                           <DropdownMenuSeparator />
                         </> : null}
                         {service.archived_at ? <DropdownMenuItem disabled={updateService.isPending} onClick={() => updateService.mutate({ id: service.id, patch: { archived_at: null } })}><ArchiveRestore className="size-4" />{ui("Restaurar")}</DropdownMenuItem> : <>
                           <DropdownMenuItem disabled={updateService.isPending} onClick={() => updateService.mutate({ id: service.id, patch: { active: !service.active } })}><Power className="size-4" />{ui(service.active ? "Desativar" : "Ativar")}</DropdownMenuItem>
                           {!service.active ? <DropdownMenuItem disabled={updateService.isPending} onClick={() => updateService.mutate({ id: service.id, patch: { archived_at: new Date().toISOString() } })}><Archive className="size-4" />{ui("Arquivar")}</DropdownMenuItem> : null}
                         </>}
                       </DropdownMenuContent>
                     </DropdownMenu>
                  </TableCell>
                </TableRow>
               ); })
            ) : (
              <TableRow>
                 <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  {showArchived ? "Nenhum serviço arquivado." : "Nenhum serviço cadastrado. Cadastre seus serviços para cobrar mais rápido."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataPagination page={page} pageSize={10} total={filteredServices.length} onPageChange={setPage} />
      </div>
      </TooltipProvider>
      <Dialog open={Boolean(linkConfig)} onOpenChange={(v) => { if (!v) setLinkConfig(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{ui("Configurar link de checkout")}</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!linkConfig) return; toggleOpen.mutate({ serviceId: linkConfig.serviceId, active: true, ...(linkConfig.customAmount ? { amount: linkAmount } : {}), chargeType: linkType, frequency: linkFrequency, maxInstallments: Number(linkMax), newVersion: true }); }}>
            <p className="font-medium">{linkConfig?.name}</p>
            <div className="space-y-2"><Label htmlFor="link-amount">{ui("Valor do link (R$)")}</Label><Input id="link-amount" inputMode="decimal" required value={linkAmount} disabled={!linkConfig?.customAmount} onChange={(e) => setLinkAmount(e.target.value)} /></div>
            {linkConfig?.flexible ? <div className="space-y-2"><Label>{ui("Forma de cobrança")}</Label><Select value={linkType} onValueChange={(v) => setLinkType(v as typeof linkType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="one_time">{ui("Pagamento único")}</SelectItem><SelectItem value="installment">{ui("À vista ou parcelado")}</SelectItem><SelectItem value="recurring">{ui("Recorrente")}</SelectItem></SelectContent></Select></div> : null}
            {linkType === "installment" ? <div className="space-y-2"><Label htmlFor="link-max">{ui("Máximo de parcelas")}</Label><Input id="link-max" type="number" min={1} max={21} required value={linkMax} onChange={(e) => setLinkMax(e.target.value)} /></div> : null}
            {linkType === "recurring" ? <div className="space-y-2"><Label>{ui("Periodicidade")}</Label><Select value={linkFrequency} onValueChange={setLinkFrequency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(frequencyLabels).map(([v,l]) => <SelectItem key={v} value={v}>{ui(l)}</SelectItem>)}</SelectContent></Select></div> : null}
            {linkConfig?.existing ? <p className="text-xs text-muted-foreground">{ui("Um novo link será criado. Links já enviados mantêm as condições anteriores.")}</p> : null}
            <Button className="w-full" type="submit" disabled={toggleOpen.isPending}>{ui("Salvar e copiar link")}</Button>
          </form>
        </DialogContent>
      </Dialog>
      {fiscalEdit ? <FiscalServiceDialog row={fiscalEdit.row} presetServiceId={fiscalEdit.serviceId} portal={String(fiscal.data?.settings?.portal ?? "municipal")} codeHelp={fiscal.data?.options?.municipalServiceCodeHelp}
        onClose={() => setFiscalEdit(null)} onSaved={() => void queryClient.invalidateQueries({ queryKey: ["fiscal-overview"] })} /> : null}
    </div>
  );
}
