import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/format";
import { getDunningAdmin, saveDunningAdmin } from "@/lib/dunning.functions";
import { planCost, type DunningChannel, type DunningPlanCode } from "@/lib/dunning-rules";

const NAMES: Record<DunningPlanCode, string> = { essential: "Essencial", smart: "Inteligente", intensive: "Intensiva" };
const CH: [DunningChannel, string][] = [["whatsapp", "WhatsApp"], ["sms", "SMS"], ["email", "E-mail"], ["voice", "Ligação"]];
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

export function AdminDunning() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getDunningAdmin);
  const save = useServerFn(saveDunningAdmin);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["dunning-admin"], queryFn: () => fetchFn() });
  const [f, setF] = useState<Record<string, string>>({});
  const [sim, setSim] = useState({ count: "1000", plan: "smart" as DunningPlanCode });
  useEffect(() => {
    if (!data?.settings) return;
    const s = data.settings;
    setF({
      recommended: String(s.recommended), alert: String(s.alert), critical: String(s.critical), minMarginPct: String(s.minMarginPct),
      whatsapp: s.costs.whatsapp?.toString() ?? "", sms: s.costs.sms?.toString() ?? "", email: s.costs.email?.toString() ?? "", voice: s.costs.voice?.toString() ?? "",
      ...Object.fromEntries(data.plans.map((p) => [`price_${p.code}`, String(p.price)])),
    });
  }, [data]);
  const mut = useMutation({
    mutationFn: () => save({ data: {
      recommended: Number(f["recommended"]), alert: Number(f["alert"]), critical: Number(f["critical"]), minMarginPct: Number(f["minMarginPct"]),
      costs: { whatsapp: num(f["whatsapp"] ?? ""), sms: num(f["sms"] ?? ""), email: num(f["email"] ?? ""), voice: num(f["voice"] ?? "") },
      prices: { essential: Number(f["price_essential"]), smart: Number(f["price_smart"]), intensive: Number(f["price_intensive"]) },
    } }),
    onSuccess: () => { toast.success("Configuração salva."); void qc.invalidateQueries({ queryKey: ["dunning-admin"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao salvar."),
  });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <ListSkeleton rows={4} />;
  const field = (k: string, label: string, hint?: string) => (
    <div className="space-y-1"><Label>{label}</Label><Input inputMode="decimal" value={f[k] ?? ""} placeholder={hint} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
  );
  const costs = { whatsapp: num(f["whatsapp"] ?? ""), sms: num(f["sms"] ?? ""), email: num(f["email"] ?? ""), voice: num(f["voice"] ?? "") };
  const simPrice = Number(f[`price_${sim.plan}`] ?? 0);
  const simUnit = planCost(sim.plan, costs);
  const simCount = Number(sim.count) || 0;
  const minMargin = Number(f["minMarginPct"] ?? 0);

  return (
    <div className="space-y-6">
      <section className="surface-panel p-5">
        <h2 className="font-display text-lg font-semibold">Lucro e margem por plano</h2>
        <p className="mt-1 text-sm text-muted-foreground">Custo estimado considera 1 envio por canal do plano. Sem custo cadastrado, a margem fica “não calculada”.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-2">Plano</th><th>Cobranças</th><th>Receita</th><th>Custo</th><th>Lucro</th><th>Margem unitária</th></tr></thead>
            <tbody className="divide-y">
              {data.byPlan.map((p) => (
                <tr key={p.code}>
                  <td className="py-2 font-medium">{NAMES[p.code]}</td><td>{p.count}</td><td>{formatBRL(p.revenue)}</td>
                  <td>{formatBRL(p.cost)}{p.uncosted ? <span className="text-xs text-muted-foreground"> ({p.uncosted} sem custo)</span> : null}</td>
                  <td>{formatBRL(p.margin)}</td>
                  <td>{p.unitMarginPct == null ? "Não calculada" : <span className={p.unitMarginPct < minMargin ? "font-semibold text-destructive" : ""}>{p.unitMarginPct.toFixed(1)}%{p.unitMarginPct < minMargin ? " — abaixo do mínimo" : ""}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.tenants.length ? (
          <div className="mt-5"><p className="text-sm font-medium">Empresas que mais usam</p>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">{data.tenants.map((t) => <li key={t.id} className="flex justify-between rounded-lg bg-muted/40 px-3 py-1.5"><span>{t.name}</span><span>{t.count} · {formatBRL(t.revenue)}</span></li>)}</ul>
          </div>
        ) : null}
      </section>

      <section className="surface-panel p-5">
        <h2 className="font-display text-lg font-semibold">Configuração</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {data.plans.map((p) => field(`price_${p.code}`, `Preço ${NAMES[p.code as DunningPlanCode]} (R$)`))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Alterar preço cria nova versão; cobranças antigas mantêm o preço usado.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {field("recommended", "Saldo recomendado (R$)")}{field("alert", "Saldo de alerta (R$)")}{field("critical", "Saldo crítico (R$)")}{field("minMarginPct", "Margem mínima (%)")}
        </div>
        <p className="mt-4 text-sm font-medium">Custo real por envio no provedor (interno)</p>
        <div className="mt-2 grid gap-4 md:grid-cols-4">{CH.map(([k, l]) => field(k, `${l} (R$)`, "Não cadastrado"))}</div>
        <Button className="mt-4" onClick={() => mut.mutate()} disabled={mut.isPending}>Salvar</Button>
      </section>

      <section className="surface-panel p-5">
        <h2 className="font-display text-lg font-semibold">Simulador</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="space-y-1"><Label>Cobranças por mês</Label><Input className="w-40" value={sim.count} onChange={(e) => setSim({ ...sim, count: e.target.value })} /></div>
          <div className="space-y-1"><Label>Plano</Label>
            <div className="flex gap-1">{(["essential", "smart", "intensive"] as DunningPlanCode[]).map((p) => <Button key={p} size="sm" variant={sim.plan === p ? "default" : "outline"} onClick={() => setSim({ ...sim, plan: p })}>{NAMES[p]}</Button>)}</div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-muted/40 p-3">Receita: <b>{formatBRL(simPrice * simCount)}</b></div>
          <div className="rounded-lg bg-muted/40 p-3">Custo: <b>{simUnit == null ? "Cadastre os custos" : formatBRL(simUnit * simCount)}</b></div>
          <div className="rounded-lg bg-muted/40 p-3">Lucro: <b>{simUnit == null ? "—" : formatBRL((simPrice - simUnit) * simCount)}</b></div>
        </div>
      </section>
    </div>
  );
}
