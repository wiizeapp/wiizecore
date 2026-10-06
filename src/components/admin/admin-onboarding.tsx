import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StatCard, StatGrid } from "@/components/ds";
import { EmptyState } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ONBOARDING_STEPS, type OnboardingKey } from "@/lib/onboarding-options";
import { getOnboardingInsights } from "@/lib/onboarding.functions";
import { formatDate } from "@/lib/format";

const label = (key: OnboardingKey, id: string | null | undefined) =>
  ONBOARDING_STEPS.find((s) => s.key === key)?.options.find((o) => o.id === id)?.label ?? "—";

export function AdminOnboarding() {
  const fn = useServerFn(getOnboardingInsights);
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin-onboarding"], queryFn: () => fn() });
  if (isError) return <EmptyState title="Não foi possível carregar" text="Confirme a verificação em duas etapas e tente de novo." />;
  const rate = data && data.total ? Math.round((data.completed / data.total) * 100) : 0;
  return (
    <div className="space-y-6">
      <StatGrid>
        <StatCard label="Responderam" loading={isLoading} value={data?.completed ?? 0} />
        <StatCard label="Pularam" loading={isLoading} value={data?.skipped ?? 0} />
        <StatCard label="Taxa de resposta" loading={isLoading} value={`${rate}%`} hint={`${data?.total ?? 0} usuários viram a pesquisa`} />
      </StatGrid>
      {!isLoading && !data?.completed ? (
        <EmptyState title="Ainda sem respostas" text="Os resultados aparecem aqui quando os usuários responderem a pesquisa de boas-vindas." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ONBOARDING_STEPS.map((s) => {
            const counts = (data?.breakdown?.[s.key] ?? {}) as Record<string, number>;
            const total = data?.completed || 1;
            const rows = s.options.map((o) => ({ ...o, n: counts[o.id] ?? 0 })).sort((a, b) => b.n - a.n);
            return (
              <section key={s.key} className="surface-panel p-5">
                <h3 className="text-sm font-semibold">{s.title}</h3>
                {s.multi ? <p className="text-xs text-muted-foreground">Várias respostas por pessoa</p> : null}
                <ul className="mt-3 space-y-2.5">
                  {rows.map((r) => {
                    const pct = Math.round((r.n / total) * 100);
                    return (
                      <li key={r.id} className="space-y-1 text-sm">
                        <div className="flex justify-between gap-2"><span className="truncate">{r.label}</span><span className="numeric-tabular text-muted-foreground">{r.n} · {pct}%</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {data?.recent.length ? (
        <section className="surface-panel overflow-x-auto p-2">
          <h3 className="px-3 pt-3 text-sm font-semibold">Respostas recentes</h3>
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Empresa</TableHead><TableHead>Papel</TableHead><TableHead>Negócio</TableHead><TableHead>Desafio</TableHead><TableHead>Faturamento</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.recent.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell className="whitespace-nowrap text-xs">{r.completed_at ? formatDate(r.completed_at) : "—"}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{r.company ?? "—"}</TableCell>
                  <TableCell>{label("role", r.role)}</TableCell>
                  <TableCell>{label("business_type", r.business_type)}</TableCell>
                  <TableCell>{label("biggest_challenge", r.biggest_challenge)}</TableCell>
                  <TableCell>{label("monthly_revenue", r.monthly_revenue)}</TableCell>
                  <TableCell>{label("acquisition_source", r.acquisition_source)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
