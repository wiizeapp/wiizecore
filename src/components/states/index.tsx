import type { ReactNode } from "react";
import { AlertTriangle, Inbox, LoaderCircle, RotateCw } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function DataLoading({ label = "Carregando", compact = false, className = "" }: { label?: string; compact?: boolean; className?: string }) {
  const { t: ui } = useTranslation("ui");
  return <div role="status" aria-live="polite" aria-busy="true" className={`flex items-center justify-center gap-2 text-muted-foreground ${compact ? "min-h-8 text-xs" : "min-h-28 text-sm"} ${className}`}><LoaderCircle className="size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" /><span>{ui(label)}</span></div>;
}

/** Bloco de carregamento com brilho suave (respeita movimento reduzido). */
export function Shimmer({ className = "h-4 w-full" }: { className?: string }) {
  return <DataLoading label="Carregando" compact className={className} />;
}

export function Loading({ label = "Carregando dados", children }: { label?: string; children: ReactNode }) {
  const { t: ui } = useTranslation("ui");
  return (
    <div role="status" aria-live="polite" aria-busy="true">
       <span className="sr-only">{ui(label)}</span>
      {children}
    </div>
  );
}

export function StatSkeleton() {
  return <DataLoading label="Carregando resumo" className="min-h-24" />;
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return <DataLoading label="Carregando gráfico" className="w-full" />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return <DataLoading label="Carregando informações" className={rows > 4 ? "min-h-40" : "min-h-28"} />;
}

/** Linhas de carregamento para usar dentro de <TableBody>. */
export function TableRowsSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <TableRow aria-busy="true"><TableCell colSpan={cols}><DataLoading label="Carregando registros" className={rows > 4 ? "min-h-36" : "min-h-24"} /></TableCell></TableRow>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-2 px-4 py-10 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-muted text-muted-foreground">{icon ?? <Inbox className="h-5 w-5" />}</div>
      <p className="font-display text-sm font-semibold">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ text = "Não foi possível carregar estas informações.", onRetry }: { text?: string; onRetry?: () => void }) {
  const { t: ui } = useTranslation("ui");
  return (
    <div role="alert" className="grid place-items-center gap-2 px-4 py-10 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-destructive/10 text-destructive"><AlertTriangle className="h-5 w-5" /></div>
       <p className="font-display text-sm font-semibold">{ui("Algo deu errado")}</p>
       <p className="max-w-sm text-sm text-muted-foreground">{ui(text)}</p>
      {onRetry && (
        <Button type="button" onClick={onRetry} variant="outline" size="sm" className="mt-2">
          <RotateCw className="h-3.5 w-3.5" />  {ui("Tentar novamente")}
        </Button>
      )}
    </div>
  );
}

/** Estado completo para uma linha de tabela (vazio ou erro). */
export function TableStateRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={cols}>{children}</TableCell>
    </TableRow>
  );
}
