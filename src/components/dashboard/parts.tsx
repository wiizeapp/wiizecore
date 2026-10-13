import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Inbox } from "lucide-react";

export function Panel({ title, subtitle, action, children, className = "" }: { title: ReactNode; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`surface-panel p-5 sm:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">Sem base anterior</span>;
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? "text-primary" : "text-destructive"}`}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(value).toFixed(1).replace(".", ",")}%
    </span>
  );
}

export type AppPath = "/clientes" | "/servicos" | "/cobrancas" | "/contratos" | "/financeiro" | "/ativacao" | "/seguranca" | "/notas-fiscais" | "/notas-fiscais/configuracoes";

export function Empty({ text, to, cta }: { text: string; to?: AppPath; cta?: string }) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <Inbox className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
      {to && cta && (
        <Link to={to} className="text-xs font-semibold text-primary hover:underline">{cta}</Link>
      )}
    </div>
  );
}

export function Skeleton({ h = "h-24" }: { h?: string }) {
  // Bloco de altura fixa: reserva o espaço final e evita que os cartões cresçam/encolham ao carregar.
  return <div role="status" aria-label="Carregando informações" className={`${h} w-full animate-pulse rounded-lg bg-muted/70`} />;
}

export function RankList({ items, format }: { items: { label: string; value: number; hint?: string | undefined }[]; format: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i, idx) => (
        <li key={`${i.label}-${idx}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">{idx + 1}</span>
              <span className="truncate font-medium">{i.label}</span>
            </span>
            <span className="numeric-tabular shrink-0 font-semibold">{format(i.value)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${(i.value / max) * 100}%` }} />
            </div>
            {i.hint && <span className="shrink-0 text-[11px] text-muted-foreground">{i.hint}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
