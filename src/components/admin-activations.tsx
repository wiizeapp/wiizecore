import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getActivationDetail, listActivations } from "@/lib/activation.functions";
import { ActivationBadge, ACTIVATION_LABEL, DOC_LABEL } from "@/components/activation-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

const FIELD: Record<string, string> = {
  fullName: "Nome", cpf: "CPF", birthDate: "Nascimento", email: "E-mail", phone: "Celular", zipCode: "CEP", address: "Endereço", number: "Número",
  complement: "Complemento", district: "Bairro", city: "Cidade", state: "UF", legalName: "Razão social", tradeName: "Nome fantasia", cnpj: "CNPJ",
  companyType: "Tipo", openedOn: "Abertura", monthlyRevenue: "Faturamento mensal", businessModel: "Modelo de negócio", paymentSources: "Origem dos recebimentos",
  expectedVolume: "Volume esperado", legalRepName: "Responsável legal", legalRepCpf: "CPF do responsável", legalRepRole: "Cargo",
};

export function AdminActivations() {
  const list = useServerFn(listActivations);
  const { data = [] } = useQuery({ queryKey: ["admin-activations"], queryFn: () => list() });
  const [filter, setFilter] = useState("queue");
  const [open, setOpen] = useState<string | null>(null);
  const queue = ["submitted", "under_review"];
  const rows = data.filter((r) => filter === "all" || (filter === "queue" ? queue.includes(r.status) : r.status === filter));
  const count = (s: string[]) => data.filter((r) => s.includes(r.status)).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[["Aguardando análise", count(queue)], ["Ação necessária", count(["action_required"])], ["Aprovadas", count(["approved"])], ["Recusadas/suspensas", count(["rejected", "suspended"])]].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-semibold">{v}</p></div>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        {[["queue", "Fila"], ["all", "Todas"], ...Object.entries(ACTIVATION_LABEL)].map(([v, l]) => (
          <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} onClick={() => setFilter(v as string)}>{l}</Button>
        ))}
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead>Enviado em</TableHead><TableHead>Espera</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum processo.</TableCell></TableRow>}
          {rows.map((r) => (
            <TableRow key={r.tenantId}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell>{r.personType === "company" ? "PJ" : r.personType === "individual" ? "PF" : "—"}</TableCell>
              <TableCell><ActivationBadge status={r.status} /></TableCell>
              <TableCell>{r.submittedAt ? formatDate(r.submittedAt) : "—"}</TableCell>
              <TableCell>{r.submittedAt && queue.includes(r.status) ? `${Math.floor((Date.now() - new Date(r.submittedAt).getTime()) / 3.6e6)} h` : "—"}</TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={() => setOpen(r.tenantId)}>Abrir</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Detail tenantId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Detail({ tenantId, onClose }: { tenantId: string | null; onClose: () => void }) {
  const { data } = useQuery({ queryKey: ["admin-activation", tenantId], queryFn: () => get({ data: { tenantId: tenantId! } }), enabled: !!tenantId });
  const get = useServerFn(getActivationDetail);
  return (
    <Dialog open={!!tenantId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{data?.name ?? "Carregando…"}</DialogTitle></DialogHeader>
        {data && (
          <div className="space-y-5">
            <div className="flex items-center gap-2"><ActivationBadge status={data.status} /><span className="text-sm text-muted-foreground">{data.personType === "company" ? "Pessoa Jurídica" : "Pessoa Física"}</span></div>
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {Object.entries(data.form as Record<string, string>).filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="text-muted-foreground text-xs">{FIELD[k] ?? k}</dt><dd className="break-words">{v}</dd></div>
              ))}
            </dl>
            <div className="space-y-2">
              <h3 className="font-semibold text-sm">Documentos (links válidos por 2 minutos)</h3>
              {data.documents.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento.</p>}
              {data.documents.map((d) => (
                <div key={d.id} className="flex justify-between items-center rounded border p-2 text-sm">
                  <span>{DOC_LABEL[d.kind] ?? d.kind}</span>
                  {d.url ? <a className="text-primary underline" href={d.url} target="_blank" rel="noreferrer noopener">Visualizar</a> : "—"}
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-sm">Histórico</h3>
              {data.events.map((e, i) => (
                <p key={i} className="text-xs text-muted-foreground">{formatDate(e.created_at)} — {ACTIVATION_LABEL[e.to_status] ?? e.to_status}{e.message ? `: ${e.message}` : ""}</p>
              ))}
            </div>
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">A aprovação desta conta é feita pelo Asaas. A situação é atualizada automaticamente; o admin apenas acompanha.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
