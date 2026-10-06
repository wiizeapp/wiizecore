import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listLimitRequests, reviewLimitRequest } from "@/lib/limits.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDate } from "@/lib/format";

export function AdminLimits() {
  const list = useServerFn(listLimitRequests);
  const review = useServerFn(reviewLimitRequest);
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["admin-limits"], queryFn: () => list() });
  const [dates, setDates] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (v: { id: string; action: "in_review" | "approved" | "rejected" }) =>
      review({ data: { ...v, expectedResponseOn: dates[v.id] || undefined, message: v.action === "rejected" ? "O banco parceiro não aprovou o aumento." : undefined } }),
    onSuccess: () => { toast.success("Pedido atualizado e empresa avisada."); void qc.invalidateQueries({ queryKey: ["admin-limits"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (error) return <p className="mt-4 text-sm text-destructive">{(error as Error).message}</p>;
  return (
    <div className="mt-4 space-y-6">
      <div className="surface-panel p-2">
        <h3 className="p-3 font-semibold">Pedidos de aumento</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Atual</TableHead><TableHead>Pedido</TableHead><TableHead>Motivo</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {(data?.requests ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.tenantName}</TableCell>
                <TableCell>{formatBRL(Number(r.current_daily_limit))}/dia</TableCell>
                <TableCell>{formatBRL(Number(r.requested_daily_limit))}/dia{r.requested_monthly_count ? ` · ${r.requested_monthly_count}/mês` : ""}</TableCell>
                <TableCell className="max-w-xs text-xs text-muted-foreground">{r.reason}</TableCell>
                <TableCell><Badge variant="secondary">{r.status}{r.expected_response_on ? ` · ${formatDate(r.expected_response_on)}` : ""}</Badge></TableCell>
                <TableCell>
                  {["pending", "in_review"].includes(r.status) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {r.status === "pending" ? (<>
                        <Input type="date" className="h-8 w-36" value={dates[r.id] ?? ""} onChange={(e) => setDates({ ...dates, [r.id]: e.target.value })} />
                        <Button size="sm" variant="outline" disabled={m.isPending} onClick={() => m.mutate({ id: r.id, action: "in_review" })}>Informar prazo</Button>
                      </>) : null}
                      <Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ id: r.id, action: "approved" })}>Aprovar</Button>
                      <Button size="sm" variant="destructive" disabled={m.isPending} onClick={() => m.mutate({ id: r.id, action: "rejected" })}>Recusar</Button>
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {!data?.requests.length ? <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Nenhum pedido.</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
      <div className="surface-panel p-2">
        <h3 className="p-3 font-semibold">Limite de cada conta</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Limite diário</TableHead><TableHead>Usado hoje</TableHead><TableHead>Saques no mês</TableHead><TableHead>Tipo</TableHead></TableRow></TableHeader>
          <TableBody>
            {(data?.accounts ?? []).map((a) => (
              <TableRow key={a.tenantId}>
                <TableCell className="font-medium">{a.tenantName}</TableCell>
                <TableCell>{formatBRL(a.dailyLimit)}</TableCell>
                <TableCell>{formatBRL(a.usedToday)}</TableCell>
                <TableCell>{a.usedMonth} / {a.monthlyCount}</TableCell>
                <TableCell>{a.personalized ? <Badge>Personalizado</Badge> : <Badge variant="outline">Padrão</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
