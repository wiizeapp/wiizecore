import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { listRefunds, saveRefundPolicy } from "@/lib/refunds.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/ds";
import { REFUND_STATUS } from "./charge-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "react-i18next";

export function RefundsPanel({ tenantId }: { tenantId: string }) {
  const { t: ui } = useTranslation("ui");
  const fn = useServerFn(listRefunds);
  const q = useQuery({ queryKey: ["refunds"], queryFn: () => fn() });
  const [policy, setPolicy] = useState(false);
  const rows = (q.data ?? []) as any[];
  return (
    <div className="surface-panel mt-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div><p className="text-sm font-semibold">Reembolsos</p><p className="text-xs text-muted-foreground">Para reembolsar, abra uma cobrança paga.</p></div>
        <Button size="sm" variant="ghost" onClick={() => setPolicy(true)}><Settings2 className="h-4 w-4" /> Política</Button>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{q.isLoading ? "Carregando…" : "Nenhum reembolso até agora."}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>{ui("Cliente")}</TableHead><TableHead className="hidden md:table-cell">Data</TableHead><TableHead className="text-right">Original</TableHead><TableHead className="hidden sm:table-cell text-right">Dedução</TableHead><TableHead className="text-right">Reembolsado</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><p className="font-medium">{r.payments?.customers?.name ?? "—"}</p><p className="text-xs text-muted-foreground">{r.payments?.description ?? r.reason}</p></TableCell>
                  <TableCell className="hidden md:table-cell">{formatDate(r.created_at)}</TableCell>
                  <TableCell className="numeric-tabular text-right">{formatBRL(r.original_amount)}</TableCell>
                  <TableCell className="hidden sm:table-cell numeric-tabular text-right text-muted-foreground">{Number(r.deduction_amount) > 0 ? `− ${formatBRL(r.deduction_amount)}` : "—"}</TableCell>
                  <TableCell className="numeric-tabular text-right font-semibold">{formatBRL(r.refund_amount)}</TableCell>
                  <TableCell><StatusBadge tone={REFUND_STATUS[r.status]?.tone ?? "neutral"}>{REFUND_STATUS[r.status]?.label ?? r.status}</StatusBadge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {policy ? <PolicyDialog tenantId={tenantId} onClose={() => setPolicy(false)} /> : null}
    </div>
  );
}

function PolicyDialog({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const save = useServerFn(saveRefundPolicy);
  const q = useQuery({
    queryKey: ["refund-policy", tenantId],
    queryFn: async () => (await (supabase.from as any)("refund_policies").select("*").eq("tenant_id", tenantId).maybeSingle()).data,
  });
  const p = q.data;
  const [f, setF] = useState<{ window_days: string; allow_partial: boolean; default_mode: "net" | "gross"; default_deduction_type: "none" | "fixed" | "percent"; default_deduction_value: string } | null>(null);
  const v = f ?? { window_days: String(p?.window_days ?? 30), allow_partial: p?.allow_partial ?? true, default_mode: p?.default_mode ?? "net", default_deduction_type: p?.default_deduction_type ?? "none", default_deduction_value: String(p?.default_deduction_value ?? 0) };
  const set = (patch: Partial<typeof v>) => setF({ ...v, ...patch });
  const m = useMutation({
    mutationFn: () => save({ data: { window_days: Math.min(30, Math.max(1, Number(v.window_days) || 30)), allow_partial: v.allow_partial, default_mode: v.default_mode, default_deduction_type: v.default_deduction_type, default_deduction_value: Number(v.default_deduction_value.replace(",", ".")) || 0 } }),
    onSuccess: () => { toast.success("Política salva."); void qc.invalidateQueries({ queryKey: ["refund-policy"] }); void qc.invalidateQueries({ queryKey: ["refund-ctx"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Política de reembolso</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Prazo (dias após o pagamento, até 30)</Label><Input inputMode="numeric" value={v.window_days} onChange={(e) => set({ window_days: e.target.value.replace(/\D/g, "").slice(0, 2) })} /></div>
          <div className="flex items-center justify-between"><Label>Permitir reembolso parcial</Label><Switch checked={v.allow_partial} onCheckedChange={(c) => set({ allow_partial: c })} /></div>
          <div><Label>Padrão</Label>
            <Select value={v.default_mode} onValueChange={(x) => set({ default_mode: x as "net" | "gross" })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="net">Devolver o que recebi</SelectItem><SelectItem value="gross">Devolver valor pago</SelectItem></SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Dedução padrão</Label>
              <Select value={v.default_deduction_type} onValueChange={(x) => set({ default_deduction_type: x as typeof v.default_deduction_type })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">Nenhuma</SelectItem><SelectItem value="fixed">Valor fixo</SelectItem><SelectItem value="percent">Porcentagem</SelectItem></SelectContent></Select></div>
            {v.default_deduction_type !== "none" ? <div><Label>Valor</Label><Input inputMode="decimal" value={v.default_deduction_value} onChange={(e) => set({ default_deduction_value: e.target.value.replace(/[^\d.,]/g, "") })} /></div> : null}
          </div>
          <p className="text-xs text-muted-foreground">A taxa WiizePay da venda não é devolvida no reembolso e não existe taxa extra para reembolsar.</p>
          <Button className="w-full" disabled={m.isPending} onClick={() => m.mutate()}>Salvar política</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
