import { useEffect, useState } from "react";
import { Link2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { AsaasSeal } from "@/components/financial-provider";

/** Aviso institucional exibido uma única vez por navegador (por chave). */
export function PartnerNotice({ storageKey, title, children }: { storageKey: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const key = `wiize:notice:${storageKey}`;
  useEffect(() => {
    try {
      // "?aviso=1" no endereço mostra o aviso de novo (útil para prints).
      const force = new URLSearchParams(window.location.search).get("aviso") === "1";
      if (force || !localStorage.getItem(key)) { localStorage.setItem(key, "1"); setOpen(true); }
    } catch { /* ignore */ }
  }, [key]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <div className="flex items-center justify-center gap-4 border-b border-border bg-muted/40 px-6 py-6">
          <Brand />
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"><Link2 className="h-4 w-4" /></span>
          <AsaasSeal />
        </div>
        <div className="space-y-4 px-6 pb-6 pt-2">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary"><ShieldCheck className="h-3.5 w-3.5" />Serviços financeiros</p>
            <DialogTitle className="font-display text-xl font-semibold tracking-tight">{title}</DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
          </DialogDescription>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">Instituição de pagamento autorizada pelo Banco Central.</p>
            <Button onClick={() => setOpen(false)}>Entendi</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
