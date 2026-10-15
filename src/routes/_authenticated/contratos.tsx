import { SignaturePad, type SignatureValue } from "@/components/contracts/signature-pad";
import { NameText } from "@/components/ds/name-text";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shimmer, TableRowsSkeleton, TableStateRow, ErrorState, ListSkeleton } from "@/components/states";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/app-shell";
import { ContractWizard } from "@/components/contracts/contract-wizard";
import { createContract, signContractAsProvider, archiveContract } from "@/lib/contracts.functions";
import { createContractLink, revokeContractLinks } from "@/lib/contract-links.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contractStatusLabels } from "@/lib/labels";
import { formatBRL, formatDate } from "@/lib/format";
import { MoreVertical } from "lucide-react";
import { durationLabel } from "@/lib/contract-display";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataPagination, paginate, SearchField, matchesSearch } from "@/components/ds";
import { useTranslation } from "react-i18next";


export const Route = createFileRoute("/_authenticated/contratos")({
  head: () => ({
    meta: [
      { title: "Contratos — Wiize Recebe" },
      { name: "description", content: "Crie contratos, gere links de assinatura e acompanhe versões assinadas na Wiize Recebe." },
      { property: "og:title", content: "Contratos — Wiize Recebe" },
      { property: "og:description", content: "Crie contratos, gere links de assinatura e acompanhe versões assinadas na Wiize Recebe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Contratos,
});

function Contratos() {
  const { t: ui } = useTranslation("ui");
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const { data: workspace } = useWorkspace();
  const tenantId = workspace?.tenantId;
  const queryClient = useQueryClient();
  const create = useServerFn(createContract);
  const sign = useServerFn(signContractAsProvider);

  const [open, setOpen] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();
  const archive = useServerFn(archiveContract);
  const archiveMutation = useMutation({
    mutationFn: async (v: { id: string; archived: boolean }) => archive({ data: { contractId: v.id, archived: v.archived } }),
    onSuccess: (_r, v) => {
      toast.success(v.archived ? "Contrato arquivado." : "Contrato restaurado.");
      void queryClient.invalidateQueries({ queryKey: ["contracts", tenantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const [signing, setSigning] = useState<{ id: string; title: string } | null>(null);
  const [financialPassword, setFinancialPassword] = useState("");
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const createLink = useServerFn(createContractLink);
  const revokeLinks = useServerFn(revokeContractLinks);
  const [form, setForm] = useState({
    title: "",
    customerId: "",
    serviceIds: [] as string[],
    durationMonths: "",
    amount: "",
    startsOn: "",
    endsOn: "",
    body: "",
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-simple", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: services } = useQuery({
    queryKey: ["services-simple", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, amount")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: contracts, isLoading, isError, refetch } = useQuery({
    queryKey: ["contracts", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, status, amount, current_version, signed_at, created_at, archived_at, duration_months, starts_on, ends_on, customers(name, email, document), contract_services(services(name)), contract_signatures(contract_version_id, contract_versions(version))")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const visible = (contracts ?? []).filter((c) => (showArchived ? c.archived_at : !c.archived_at)).filter((c) => {
    const cu = c.customers as { name?: string; email?: string | null; document?: string | null } | null;
    const svc = ((c.contract_services ?? []) as { services: { name: string } | null }[]).map((x) => x.services?.name);
    return matchesSearch(q, [c.title, c.id, `v${c.current_version}`, cu?.name, cu?.email, cu?.document, ...svc, c.amount, contractStatusLabels[c.status]]);
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      create({
        data: {
          title: form.title,
          customerId: form.customerId && form.customerId !== "none" ? form.customerId : null,
          serviceIds: form.serviceIds,
          durationMonths: form.durationMonths ? Number(form.durationMonths) : null,
          amount: form.amount ? Number(form.amount.replace(",", ".")) : 0,
          startsOn: form.startsOn || null,
          endsOn: form.endsOn || null,
          body: form.body,
        },
      }),
    onSuccess: (result) => {
      toast.success("Contrato criado como rascunho.");
      void navigate({ to: "/contratos/$id", params: { id: result.contractId } });
      setOpen(false);
      setForm({ title: "", customerId: "", serviceIds: [], durationMonths: "", amount: "", startsOn: "", endsOn: "", body: "" });
      void queryClient.invalidateQueries({ queryKey: ["contracts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["counts", tenantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const linkMutation = useMutation({
    mutationFn: async (contractId: string) => createLink({ data: { contractId } }),
    onSuccess: (result) => {
      setLink({ url: `${window.location.origin}/c/${result.token}`, expiresAt: result.expiresAt });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (contractId: string) => revokeLinks({ data: { contractId } }),
    onSuccess: () => toast.success("Links revogados."),
    onError: (error: Error) => toast.error(error.message),
  });

  const signMutation = useMutation({
    mutationFn: async () =>
      sign({
        data: {
          contractId: signing!.id,
          financialPassword,
          signerName: workspace?.fullName ?? workspace?.email ?? "Prestador",
          signature,
        },
      }),
    onSuccess: () => {
      toast.success("Assinatura registrada.");
      setSigning(null);
      setFinancialPassword("");
      void queryClient.invalidateQueries({ queryKey: ["contracts", tenantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title={ui("Contratos")}
        description="Crie, gerencie, envie para assinatura e acompanhe seus contratos em um só lugar."
        action={
          <>
          <Button onClick={() => setWizard(true)}>+ Novo contrato</Button>
          <ContractWizard open={wizard} onOpenChange={setWizard} tenantId={tenantId} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Novo contrato</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createMutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="title">Título</Label>
                  <Input
                    id="title"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Cliente (opcional)</Label>
                    <Select
                      value={form.customerId}
                      onValueChange={(value) => setForm({ ...form, customerId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum (contrato avulso)</SelectItem>
                        {customers?.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Duração em meses (opcional)</Label>
                    <Input id="duration" inputMode="numeric" placeholder="Indeterminado" value={form.durationMonths}
                      onChange={(e) => setForm({ ...form, durationMonths: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
                  </div>
                </div>
                {services?.length ? (
                  <div className="space-y-2">
                    <Label>Serviços (opcional, pode escolher vários)</Label>
                    <div className="flex flex-wrap gap-2">
                      {services.map((service) => {
                        const on = form.serviceIds.includes(service.id);
                        return (
                          <button type="button" key={service.id}
                            onClick={() => {
                              const ids = on ? form.serviceIds.filter((i) => i !== service.id) : [...form.serviceIds, service.id];
                              const total = services.filter((x) => ids.includes(x.id)).reduce((t, x) => t + Number(x.amount ?? 0), 0);
                              setForm({ ...form, serviceIds: ids, amount: total ? total.toFixed(2) : form.amount });
                            }}
                            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                            {service.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="contract-amount">Valor (opcional)</Label>
                    <Input
                      id="contract-amount"
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="starts">Início</Label>
                    <Input
                      id="starts"
                      type="date"
                      value={form.startsOn}
                      onChange={(e) => setForm({ ...form, startsOn: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ends">Término</Label>
                    <Input
                      id="ends"
                      type="date"
                      value={form.endsOn}
                      onChange={(e) => setForm({ ...form, endsOn: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="body">Texto do contrato</Label>
                  <Textarea
                    id="body"
                    rows={10}
                    required
                    value={form.body}
                    onChange={(e) => setForm({ ...form, body: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  Criar contrato
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          </>
        }
      />


      <div className="surface-panel mb-6 grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: ui("Contratos"), value: contracts ? String(contracts.length) : null },
          { label: "Assinados", value: contracts ? String(contracts.filter((c) => c.status === "signed").length) : null, accent: true },
          { label: "Aguardando assinatura", value: contracts ? String(contracts.filter((c) => c.status !== "signed" && c.status !== "cancelled").length) : null },
          { label: "Valor em contratos", value: contracts ? formatBRL(contracts.filter((c) => c.status !== "cancelled").reduce((t, c) => t + Number(c.amount ?? 0), 0)) : null },
        ].map((k) => (
          <div key={k.label} className="summary-strip-item min-w-0 p-5">
            <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
            {k.value === null ? <Shimmer className="mt-2.5 h-8 w-24" /> : <p className={`numeric-tabular mt-1.5 truncate font-display text-2xl font-bold sm:text-[1.7rem] ${k.accent ? "text-primary" : ""}`}>{k.value}</p>}
          </div>
        ))}
      </div>

      <div className="surface-panel overflow-hidden overflow-x-auto">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">Todos os contratos</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Clique em um contrato para ver documento, assinaturas e auditoria</p>
          </div>
          <div className="flex items-center gap-2"><SearchField value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Pesquisar por título, cliente, e-mail, CPF/CNPJ" />
          <Button size="sm" variant="ghost" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Ver ativos" : "Ver arquivados"}</Button></div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contrato</TableHead>
              <TableHead>{ui("Cliente")}</TableHead>
              <TableHead>{ui("Serviços")}</TableHead>
              <TableHead>Assinaturas</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton cols={7} />
            ) : isError ? (
              <TableStateRow cols={7}><ErrorState onRetry={() => refetch()} /></TableStateRow>
            ) : visible.length > 0 ? (
              paginate(visible, page, 10).map((contract) => {
                const svc = ((contract.contract_services ?? []) as { services: { name: string } | null }[]).map((x) => x.services?.name).filter(Boolean);
                const sigs = ((contract.contract_signatures ?? []) as { contract_versions: { version: number } | null }[])
                  .filter((x) => x.contract_versions?.version === contract.current_version).length;
                const open = contract.status !== "signed" && contract.status !== "cancelled";
                return (
                <TableRow key={contract.id} className="cursor-pointer" onClick={() => navigate({ to: "/contratos/$id", params: { id: contract.id } })}>
                  <TableCell className="font-medium">
                    <Link to="/contratos/$id" params={{ id: contract.id }} className="hover:text-primary" onClick={(e) => e.stopPropagation()}><NameText>{contract.title}</NameText></Link>
                    <span className="block text-xs text-muted-foreground">v{contract.current_version} · {formatDate(contract.created_at)}</span>
                  </TableCell>
                  <TableCell><NameText max="max-w-[12rem]">{(contract.customers as { name?: string } | null)?.name}</NameText></TableCell>
                  <TableCell className="max-w-[180px] truncate">{svc.length ? svc.join(", ") : "—"}</TableCell>
                  <TableCell className="numeric-tabular">{contract.status === "draft" && sigs === 0 ? "—" : `${sigs}/2`}</TableCell>
                  <TableCell>{durationLabel(contract)}</TableCell>
                  <TableCell>
                    <Badge variant={contract.status === "signed" ? "default" : "secondary"}>
                      {contract.archived_at ? "Arquivado" : contractStatusLabels[contract.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="Ações"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate({ to: "/contratos/$id", params: { id: contract.id } })}>Abrir contrato</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/contratos/$id", params: { id: contract.id }, search: { aba: "documento" } })}>Visualizar documento</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/contratos/$id", params: { id: contract.id }, search: { aba: "historico" } })}>
                          {contract.status === "signed" ? "Nova versão" : "Editar"}
                        </DropdownMenuItem>
                        {open ? (
                          <>
                            <DropdownMenuItem disabled={linkMutation.isPending} onClick={() => linkMutation.mutate(contract.id)}>Enviar para assinatura / copiar link</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSigning({ id: contract.id, title: contract.title })}>Assinar como prestador</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => revokeMutation.mutate(contract.id)}>Cancelar links</DropdownMenuItem>
                          </>
                        ) : null}
                        <DropdownMenuItem onClick={() => navigate({ to: "/contratos/$id", params: { id: contract.id }, search: { aba: "assinaturas" } })}>Ver assinaturas</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/contratos/$id", params: { id: contract.id }, search: { aba: "auditoria" } })}>Ver auditoria</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/contratos/$id", params: { id: contract.id }, search: { aba: "cobrancas" } })}>Ver cobranças</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => archiveMutation.mutate({ id: contract.id, archived: !contract.archived_at })}>
                          {contract.archived_at ? "Restaurar" : "Arquivar"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  {showArchived ? "Nenhum contrato arquivado." : "Nenhum contrato ainda. Crie o primeiro para enviar junto da cobrança."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataPagination page={page} pageSize={10} total={visible.length} onPageChange={setPage} />
      </div>

      <Dialog open={Boolean(signing)} onOpenChange={(value) => !value && setSigning(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assinar “{signing?.title}”</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              signMutation.mutate();
            }}
          >
            <p className="text-sm text-muted-foreground">
              Registramos data, versão, impressão digital do documento, IP e dispositivo desta assinatura.
            </p>
            <SignaturePad name={workspace?.fullName ?? ""} onChange={setSignature} />
            <div className="space-y-2">
              <Label htmlFor="fin-password">Senha financeira</Label>
              <Input
                id="fin-password"
                type="password"
                required
                value={financialPassword}
                onChange={(e) => setFinancialPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={signMutation.isPending || !signature}>
              Confirmar assinatura
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(link)} onOpenChange={(value) => !value && setLink(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link de assinatura do cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Envie este link ao cliente. Ele expira em {link ? formatDate(link.expiresAt) : "—"} e é exibido uma
            única vez aqui — copie agora.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={link?.url ?? ""} onFocus={(e) => e.target.select()} />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (link) {
                  void navigator.clipboard.writeText(link.url);
                  toast.success("Link copiado.");
                }
              }}
            >
              Copiar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
