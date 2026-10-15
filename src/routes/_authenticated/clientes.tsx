import { createFileRoute, Link } from "@tanstack/react-router";
import { NameText } from "@/components/ds/name-text";
import { TableRowsSkeleton, TableStateRow, ErrorState, ListSkeleton } from "@/components/states";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PageHeader } from "@/components/app-shell";
import { CustomerInvoicesDialog } from "@/components/invoices/customer-invoices-dialog";
import { DataPagination, paginate, SummaryStrip, StatusBadge, SearchField, matchesSearch } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { customerStatusLabels, customerTypeLabels } from "@/lib/labels";
import { formatDocument, isValidCNPJ, isValidCPF, onlyDigits } from "@/lib/format";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Wiize Core" },
      { name: "description", content: "Cadastre clientes, documentos e contatos para cobranças e contratos na Wiize Core." },
      { property: "og:title", content: "Clientes — Wiize Core" },
      { property: "og:description", content: "Cadastre clientes, documentos e contatos para cobranças e contratos na Wiize Core." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Clientes,
});

function Clientes() {
  const { t: ui } = useTranslation("ui");
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const { data: workspace } = useWorkspace();
  const tenantId = workspace?.tenantId;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"individual" | "company">("individual");
  const [form, setForm] = useState({ name: "", tradeName: "", document: "", email: "", phone: "" });

  const [invoicesFor, setInvoicesFor] = useState<{ id: string; name: string } | null>(null);
  const { data: customers, isLoading, isError, refetch } = useQuery({
    queryKey: ["customers", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, trade_name, type, document, email, phone, status, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createCustomer = useMutation({
    mutationFn: async () => {
      const document = onlyDigits(form.document);
      if (document) {
        const valid = type === "individual" ? isValidCPF(document) : isValidCNPJ(document);
        if (!valid) throw new Error(type === "individual" ? "CPF inválido." : "CNPJ inválido.");
      }
      const { error } = await supabase.from("customers").insert({
        tenant_id: tenantId!,
        type,
        name: form.name.trim(),
        trade_name: form.tradeName.trim() || null,
        document: document || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
      });
      if (error) throw new Error(error.message.includes("duplicate") ? "Já existe cliente com este documento." : "Não foi possível salvar o cliente.");
    },
    onSuccess: () => {
      toast.success("Cliente cadastrado.");
      setForm({ name: "", tradeName: "", document: "", email: "", phone: "" });
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["customers", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["counts", tenantId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Ativo = recebeu cobrança ou pagamento nos últimos 3 meses (clientes novos contam como ativos no início).
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: recent } = useQuery({
    queryKey: ["customers-recent-activity", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("customer_id").eq("tenant_id", tenantId!).or(`created_at.gte.${since},paid_at.gte.${since}`).limit(5000);
      if (error) throw error;
      return new Set((data ?? []).map((p) => p.customer_id).filter(Boolean) as string[]);
    },
  });
  const isActive = (c: { id: string; status: string; created_at: string }) =>
    c.status === "active" && (Boolean(recent?.has(c.id)) || c.created_at >= since);

  const filteredCustomers = (customers ?? []).filter((c) => matchesSearch(q, [c.name, c.trade_name, c.document, c.email, c.phone]));

  return (
    <div>
      <PageHeader
        title={ui("Clientes")}
        description="Cadastre pessoas físicas e jurídicas para vincular a contratos e cobranças."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Novo cliente</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Novo cliente</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createCustomer.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label>Tipo de cliente</Label>
                  <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Pessoa física</SelectItem>
                      <SelectItem value="company">Pessoa jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">{type === "individual" ? "Nome completo" : "Razão social"}</Label>
                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                {type === "company" ? (
                  <div className="space-y-2">
                    <Label htmlFor="trade">Nome fantasia</Label>
                    <Input
                      id="trade"
                      value={form.tradeName}
                      onChange={(e) => setForm({ ...form, tradeName: e.target.value })}
                    />
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="document">{type === "individual" ? "CPF" : "CNPJ"}</Label>
                    <Input
                      id="document"
                      value={form.document}
                      onChange={(e) => setForm({ ...form, document: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">{ui("E-mail")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Endereço, cidade e estado são preenchidos pelo próprio cliente no link de pagamento.</p>
                <Button type="submit" className="w-full" disabled={createCustomer.isPending}>
                  Salvar cliente
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <SummaryStrip
        items={[
          { label: ui("Clientes"), value: customers ? String(customers.length) : null },
          { label: "Ativos", value: customers && recent ? String(customers.filter(isActive).length) : null, accent: true },
          { label: "Pessoas físicas", value: customers ? String(customers.filter((c) => c.type === "individual").length) : null },
          { label: "Empresas", value: customers ? String(customers.filter((c) => c.type !== "individual").length) : null },
        ]}
      />

      <div className="surface-panel overflow-hidden overflow-x-auto">
        <div className="border-b border-border px-5 py-3"><SearchField value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Pesquisar por nome, e-mail, CPF/CNPJ ou telefone" /></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ui("Nome")}</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Notas fiscais</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRowsSkeleton cols={6} />
            ) : isError ? (
              <TableStateRow cols={6}><ErrorState onRetry={() => refetch()} /></TableStateRow>
            ) : filteredCustomers.length > 0 ? (
               paginate(filteredCustomers, page, 10).map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    <Link to="/clientes/$id" params={{ id: customer.id }} className="hover:text-primary hover:underline"><NameText>{customer.name}</NameText></Link>
                    {customer.trade_name ? (
                      <span className="block text-xs text-muted-foreground">{customer.trade_name}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{customerTypeLabels[customer.type]}</TableCell>
                  <TableCell className="numeric-tabular">{formatDocument(customer.document)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {customer.email ?? customer.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={isActive(customer) ? "success" : "neutral"}>
                      {customer.status === "active" && recent && !isActive(customer) ? "Inativo (3 meses sem cobrança)" : customerStatusLabels[customer.status]}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline"><Link to="/clientes/$id" params={{ id: customer.id }}>Abrir</Link></Button>
                    <Button size="sm" variant="ghost" onClick={() => setInvoicesFor({ id: customer.id, name: customer.name })}>Histórico fiscal</Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum cliente ainda. Cadastre o primeiro para começar a cobrar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <DataPagination page={page} pageSize={10} total={filteredCustomers.length} onPageChange={setPage} />
      </div>
      {invoicesFor ? <CustomerInvoicesDialog customer={invoicesFor} onClose={() => setInvoicesFor(null)} /> : null}
    </div>
  );
}
