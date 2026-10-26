import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { runAiReconciliation, listAiReconciliations } from "@/lib/reconciliation.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL, formatDate } from "@/lib/format";

type Report = {
  summary: string; total_difference: number; recommendations: string[];
  items: { reference: string; kind: string; expected: number | null; actual: number | null; difference: number | null; explanation: string }[];
};
const KIND: Record<string, string> = {
  taxa_wiizepay: "Taxa WiizePay", custo_provedor: "Custo do provedor", repasse: "Repasse", devolucao_custo: "Devolução de custo",
  ausente_no_extrato: "Falta no extrato", ausente_no_sistema: "Falta no sistema", outro: "Outro",
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function AiReconciliation({ tenants }: { tenants: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const run = useServerFn(runAiReconciliation);
  const list = useServerFn(listAiReconciliations);
  const now = new Date();
  const [form, setForm] = useState({ tenantId: "", periodStart: iso(new Date(now.getFullYear(), now.getMonth(), 1)), periodEnd: iso(now), statement: "", statementName: null as string | null });
  const [current, setCurrent] = useState<Report | null>(null);
  const { data: history } = useQuery({ queryKey: ["ai-recon", form.tenantId], queryFn: () => list({ data: { tenantId: form.tenantId || null } }) });
  const m = useMutation({
    mutationFn: () => run({ data: form }),
    onSuccess: (r) => { setCurrent(r); qc.invalidateQueries({ queryKey: ["ai-recon"] }); toast.success("Análise concluída."); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-2">
      <div>
        <h2 className="font-medium">Conferência com IA</h2>
        <p className="text-sm text-muted-foreground">Envie o extrato do provedor e a IA compara com as cobranças, taxas e repasses registrados. Ela só explica — nenhum saldo é alterado.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label>Empresa</Label>
          <Select value={form.tenantId} onValueChange={(v) => setForm({ ...form, tenantId: v })}>
            <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
            <SelectContent>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1"><Label>De</Label><Input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} /></div>
        <div className="space-y-1"><Label>Até</Label><Input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} /></div>
      </div>
      <div className="space-y-1">
        <Label>Extrato do provedor (arquivo CSV/TXT ou cole o conteúdo)</Label>
        <Input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 1_000_000) { toast.error("Arquivo muito grande (máx. 1 MB)."); return; }
          setForm({ ...form, statement: await f.text(), statementName: f.name });
        }} />
        <Textarea rows={6} value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} placeholder="Data;Descrição;Valor…" className="font-mono text-xs" />
      </div>
      <Button disabled={!form.tenantId || form.statement.length < 10 || m.isPending} onClick={() => m.mutate()}>
        {m.isPending ? "Analisando… (pode levar até 1 minuto)" : "Analisar divergências"}
      </Button>

      {current ? <ReportView r={current} /> : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Histórico</h3>
        {(history ?? []).map((h) => (
          <button key={h.id} type="button" onClick={() => setCurrent(h.report as Report)} className="flex w-full flex-wrap justify-between gap-2 rounded-md border border-border p-3 text-left text-sm hover:bg-muted/40">
            <span>{h.company} · {formatDate(h.period_start)} a {formatDate(h.period_end)}<span className="block text-xs text-muted-foreground">{h.summary?.slice(0, 140)}</span></span>
            <span className="text-xs text-muted-foreground">{formatDate(h.created_at)} · diferença {formatBRL(h.total_difference)}</span>
          </button>
        ))}
        {!history?.length ? <p className="text-sm text-muted-foreground">Nenhuma análise ainda.</p> : null}
      </div>
    </div>
  );
}

function ReportView({ r }: { r: Report }) {
  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Resultado</h3>
        <Badge variant={Math.abs(r.total_difference) < 0.01 ? "default" : "destructive"}>Diferença total {formatBRL(r.total_difference)}</Badge>
      </div>
      <p className="text-sm">{r.summary}</p>
      {r.items.map((i, n) => (
        <div key={n} className="rounded-md bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-medium">{KIND[i.kind] ?? i.kind} · {i.reference}</span>
            <span className="numeric-tabular text-xs text-muted-foreground">
              previsto {i.expected == null ? "—" : formatBRL(i.expected)} · cobrado {i.actual == null ? "—" : formatBRL(i.actual)} · diferença {i.difference == null ? "—" : formatBRL(i.difference)}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground">{i.explanation}</p>
        </div>
      ))}
      {r.recommendations.length ? (
        <ul className="list-disc pl-5 text-sm">{r.recommendations.map((x, n) => <li key={n}>{x}</li>)}</ul>
      ) : null}
    </div>
  );
}
