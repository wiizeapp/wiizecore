/**
 * Wiize Core — padrão visual interno (referência: Dashboard).
 * Toda página interna deve montar sua tela com estas peças.
 */
import type { ReactNode } from "react";
import { Shimmer } from "@/components/states";

export { PageHeader } from "@/components/app-shell";
export { Panel, Change, RankList } from "@/components/dashboard/parts";
export * from "@/components/states";
export { DataPagination, paginate } from "@/components/ds/data-pagination";
export { SearchField, matchesSearch } from "@/components/ds/search-field";

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="min-w-0 space-y-6">{children}</div>;
}

/** Card de valor no padrão do resumo do Dashboard. */
export function StatCard({ label, value, hint, loading, icon }: { label: string; value: ReactNode; hint?: ReactNode; loading?: boolean; icon?: ReactNode }) {
  return (
    <div className="surface-panel min-w-0 p-5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icon}{label}</div>
      {loading ? <Shimmer className="mt-2.5 h-8 w-32" /> : <p className="numeric-tabular mt-1.5 truncate font-display text-2xl font-bold">{value}</p>}
      {hint && !loading ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

/** Área de tabela padrão (cartão discreto com rolagem horizontal no celular). */
export function DataTableShell({ children, toolbar }: { children: ReactNode; toolbar?: ReactNode }) {
  return (
    <section className="surface-panel min-w-0 overflow-hidden">
      {toolbar ? <div className="grid min-w-0 gap-2 border-b border-border p-3 sm:flex sm:flex-wrap sm:items-center">{toolbar}</div> : null}
      <div className="min-w-0 overflow-x-auto overscroll-x-contain">{children}</div>
    </section>
  );
}

/** Seção de formulário: título/descrição à esquerda, campos à direita. */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="surface-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const TONES = {
  success: "bg-primary/12 text-primary",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/12 text-destructive",
  neutral: "bg-muted text-muted-foreground",
} as const;

export function StatusBadge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>;
}

/** Faixa de resumo dividida (padrão Financeiro/Contratos). value=null mostra carregamento. */
export function SummaryStrip({ items, cols = 4 }: { items: { label: string; value: ReactNode | null; accent?: boolean; hint?: ReactNode }[]; cols?: 4 | 5 }) {
  return (
    <div className={`surface-panel mb-6 grid overflow-hidden ${cols === 5 ? "grid-cols-2 xl:grid-cols-5" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
      {items.map((k, index) => (
        <div key={k.label} className={`summary-strip-item min-w-0 p-5 ${cols === 5 && index === 2 ? "col-span-2 xl:col-span-1" : ""}`}>
          <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
          {k.value === null ? <Shimmer className="mt-2.5 h-8 w-24" /> : <p className={`numeric-tabular mt-1.5 truncate font-display text-2xl font-bold sm:text-[1.7rem] ${k.accent ? "text-primary" : ""}`}>{k.value}</p>}
          {k.hint && k.value !== null ? <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
