import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TONE, type InvoiceStatus } from "@/lib/invoice-status";
import { formatBRL, formatDate } from "@/lib/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ListSkeleton, StatusBadge, ErrorState } from "@/components/ds";

/** Histórico fiscal do cliente. */
export function CustomerInvoicesDialog({ customer, onClose }: { customer: { id: string; name: string }; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["invoices", "customer", customer.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("id, number, status, value, effective_date").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Notas fiscais · {customer.name}</DialogTitle></DialogHeader>
        {q.isLoading ? <ListSkeleton rows={3} /> : q.isError ? <ErrorState onRetry={() => q.refetch()} /> : q.data!.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma nota fiscal para este cliente.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {q.data!.map((n) => (
              <li key={n.id}>
                <Link to="/notas-fiscais/$id" params={{ id: n.id }} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span><span className="block font-medium">{n.number ? `Nº ${n.number}` : "Sem número"}</span><span className="text-xs text-muted-foreground">{formatDate(n.effective_date)}</span></span>
                  <span className="text-right"><span className="numeric-tabular block font-semibold">{formatBRL(n.value)}</span><StatusBadge tone={INVOICE_STATUS_TONE[n.status as InvoiceStatus]}>{INVOICE_STATUS_LABEL[n.status as InvoiceStatus]}</StatusBadge></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button asChild><Link to="/notas-fiscais" search={{ emitir: "standalone", cliente: customer.id }}>Emitir nota</Link></Button>
      </DialogContent>
    </Dialog>
  );
}
