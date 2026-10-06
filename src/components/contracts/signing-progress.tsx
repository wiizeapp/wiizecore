import { CheckCircle2, Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export type ProgressItem = { key: string; label: string; name: string; signedAt: string | null };

/** Mostra quem já assinou, quem falta e libera o PDF assinado quando todos concluírem. */
export function SigningProgress({ items, onDownload, downloading }: { items: ProgressItem[]; onDownload: () => void; downloading?: boolean }) {
  const pending = items.filter((i) => !i.signedAt).length;
  const all = items.length > 0 && pending === 0;
  return (
    <div className="surface-panel space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Assinaturas</h2>
        <span className="text-xs text-muted-foreground">{all ? "Todas as partes assinaram" : `Falta${pending > 1 ? "m" : ""} ${pending} de ${items.length}`}</span>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-3 p-3 text-sm">
            {i.signedAt ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /> : <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{i.name || i.label}</p>
              <p className="text-xs text-muted-foreground">{i.label}</p>
            </div>
            <span className={`shrink-0 text-right text-xs ${i.signedAt ? "text-primary" : "text-muted-foreground"}`}>
              {i.signedAt ? formatDateTime(i.signedAt) : "Falta assinar"}
            </span>
          </li>
        ))}
      </ul>
      {all ? (
        <Button className="w-full" onClick={onDownload} disabled={downloading}>
          <Download className="mr-1.5 h-4 w-4" />{downloading ? "Preparando..." : "Baixar PDF assinado"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">O PDF assinado fica disponível aqui assim que todos assinarem.</p>
      )}
    </div>
  );
}
