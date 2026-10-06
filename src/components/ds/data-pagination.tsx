import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type DataPaginationProps = { page: number; pageSize: number; total: number; onPageChange: (page: number) => void };

export function DataPagination({ page, pageSize, total, onPageChange }: DataPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(0, page), pages - 1);
  const first = total === 0 ? 0 : safePage * pageSize + 1;
  const last = Math.min(total, (safePage + 1) * pageSize);
  if (total === 0) return null;
  const nums = Array.from({ length: pages }, (_, i) => i).filter((i) => i === 0 || i === pages - 1 || Math.abs(i - safePage) <= 1);
  return (
    <nav className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-3 py-3 sm:flex sm:justify-between" aria-label="Paginação">
      <p className="min-w-0 text-xs text-muted-foreground"><span className="hidden sm:inline">Mostrando </span>{first}–{last} de {total}</p>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon" disabled={safePage === 0} onClick={() => onPageChange(safePage - 1)} aria-label="Página anterior"><ChevronLeft className="size-4" /></Button>
        {nums.map((n, idx) => (<span key={n} className="flex items-center gap-1">{idx > 0 && n - (nums[idx - 1] ?? n) > 1 ? <span className="px-1 text-xs text-muted-foreground">…</span> : null}<Button type="button" size="sm" variant={n === safePage ? "default" : "ghost"} className="numeric-tabular h-8 min-w-8 px-2 text-xs" onClick={() => onPageChange(n)} aria-current={n === safePage ? "page" : undefined}>{n + 1}</Button></span>))}
        <Button type="button" variant="ghost" size="icon" disabled={safePage + 1 >= pages} onClick={() => onPageChange(safePage + 1)} aria-label="Próxima página"><ChevronRight className="size-4" /></Button>
      </div>
    </nav>
  );
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.min(Math.max(0, page), Math.max(0, Math.ceil(items.length / pageSize) - 1));
  return items.slice(safePage * pageSize, safePage * pageSize + pageSize);
}