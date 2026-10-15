import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MAX_COPRODUCERS } from "@/lib/coproduction-math";
import { formatBRL } from "@/lib/format";

export type CoproducerDraft = { name: string; email: string; type: "percent" | "fixed"; value: string; responsibility: string };
export const EMPTY_COPRODUCER: CoproducerDraft = { name: "", email: "", type: "percent", value: "", responsibility: "" };
const num = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;

export function coproducersPayload(list: CoproducerDraft[]) {
  return list.map((c) => ({ name: c.name.trim(), email: c.email.trim(), type: c.type, percent: c.type === "percent" ? num(c.value) : null, fixedAmount: c.type === "fixed" ? num(c.value) : null, responsibility: c.responsibility.trim() || null }));
}

export function CoproductionCard({ enabled, onEnabled, list, onChange, total, installments }: {
  enabled: boolean; onEnabled: (v: boolean) => void; list: CoproducerDraft[]; onChange: (l: CoproducerDraft[]) => void; total: number | null; installments: number;
}) {
  const { t: ui } = useTranslation("ui");
  const set = (i: number, patch: Partial<CoproducerDraft>) => onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const pctSum = list.filter((c) => c.type === "percent").reduce((a, c) => a + num(c.value), 0);
  return (
    <div className="rounded-lg border border-border">
      <label className="flex cursor-pointer items-center gap-3 p-4 text-sm font-medium">
        <Checkbox checked={enabled} onCheckedChange={(v) => { onEnabled(Boolean(v)); if (v && !list.length) onChange([{ ...EMPTY_COPRODUCER }]); }} />
        {ui("Esta cobrança possui coprodutores")}
      </label>
      {enabled ? (
        <div className="space-y-4 border-t border-border p-4">
          <h4 className="text-sm font-semibold">{ui("Configurar coprodução")}</h4>
          {list.map((c, i) => (
            <div key={i} className="space-y-2 rounded-lg bg-muted/40 p-3">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase text-muted-foreground">{ui("Coprodutor")} {i + 1}</span>
                <Button type="button" size="icon" variant="ghost" aria-label={ui("Remover")} onClick={() => onChange(list.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div><Label className="text-xs">{ui("Nome")}</Label><Input value={c.name} onChange={(e) => set(i, { name: e.target.value })} /></div>
                <div><Label className="text-xs">{ui("E-mail da conta Wiize Recebe")}</Label><Input type="email" value={c.email} onChange={(e) => set(i, { email: e.target.value })} /></div>
                <div><Label className="text-xs">{ui("Participação")}</Label>
                  <div className="flex gap-2">
                    <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={c.type} onChange={(e) => set(i, { type: e.target.value as "percent" | "fixed", value: "" })}>
                      <option value="percent">%</option><option value="fixed">R$</option>
                    </select>
                    <Input inputMode="decimal" value={c.value} onChange={(e) => set(i, { value: e.target.value.replace(/[^\d.,]/g, "") })} placeholder={c.type === "percent" ? "30" : "0,00"} />
                  </div></div>
                <div><Label className="text-xs">{ui("Responsabilidade (opcional)")}</Label><Input value={c.responsibility} maxLength={300} onChange={(e) => set(i, { responsibility: e.target.value })} /></div>
              </div>
            </div>
          ))}
          {list.length < MAX_COPRODUCERS ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, { ...EMPTY_COPRODUCER }])}><Plus className="size-4" />{ui("Adicionar coprodutor")}</Button>
          ) : <p className="text-xs text-muted-foreground">{ui("O limite é de 4 coprodutores por cobrança.")}</p>}
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="text-xs font-semibold uppercase text-muted-foreground">{ui("Participação configurada")}</p>
            {total ? <p className="mt-1">{ui("Cobrança")}: {formatBRL(total)}{installments > 1 ? ` · ${installments}x ${formatBRL(total / installments)}` : ""}</p> : null}
            {list.map((c, i) => <p key={i}>{c.name || `${ui("Coprodutor")} ${i + 1}`}: {c.type === "percent" ? `${c.value || 0}%` : `${formatBRL(num(c.value))} (${ui("convertido em % do líquido")})`}</p>)}
            {pctSum > 0 ? <p>{ui("Você")}: {Math.max(0, 100 - pctSum).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%{list.some((c) => c.type === "fixed") ? ` − ${ui("valores fixos")}` : ""}</p> : null}
            <p className="mt-2 text-xs text-muted-foreground">{ui("A divisão será aplicada sobre o valor líquido efetivamente recebido em cada pagamento, após as taxas aplicáveis. O link de pagamento fica bloqueado até todos aceitarem.")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
