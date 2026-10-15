import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/hooks/useWorkspace";
import { saveFiscalService, type getFiscalOverview } from "@/lib/invoices.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FsRow = Awaited<ReturnType<typeof getFiscalOverview>>["services"][number];

export function FiscalServiceDialog({ row, portal, codeHelp, onClose, onSaved, presetServiceId }: { row: FsRow | null; portal: string; codeHelp?: string | null | undefined; onClose: () => void; onSaved: () => void; presetServiceId?: string | undefined }) {
  const { data: ws } = useWorkspace();
  const save = useServerFn(saveFiscalService);
  const [f, setF] = useState({
    name: row?.name ?? "", description: row?.description ?? "", code: row?.municipal_service_code ?? "", municipalId: row?.municipal_service_id ?? "",
    municipalName: row?.municipal_service_name ?? "", iss: row?.iss != null ? String(row.iss) : "", retainIss: row?.retain_iss ?? false, serviceId: row?.service_id ?? presetServiceId ?? "",
  });
  const services = useQuery({
    queryKey: ["services", ws?.tenantId, "min"], enabled: Boolean(ws?.tenantId),
    queryFn: async () => (await supabase.from("services").select("id, name").eq("tenant_id", ws!.tenantId!).order("name")).data ?? [],
  });
  const m = useMutation({
    mutationFn: () => save({ data: {
      id: row?.id, name: f.name, description: f.description || null, municipalServiceId: null, municipalServiceCode: f.code || null,
      municipalServiceName: f.municipalName || f.name, iss: f.iss ? Number(f.iss.replace(",", ".")) : null, retainIss: f.retainIss, serviceId: f.serviceId || null,
    } }),
    onSuccess: () => { toast.success("Serviço fiscal salvo."); onSaved(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{row ? "Editar serviço fiscal" : "Novo serviço fiscal"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Nome do serviço</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: Consultoria" /></div>
          <div><Label>Código do serviço</Label><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="Ex.: 01.07.01" />
            <p className="mt-1 whitespace-pre-line text-[11px] text-muted-foreground">{codeHelp ?? "Informe o código de tributação nacional do serviço (Portal Nacional da NFS-e). Confira com seu contador."}</p></div>
          <div><Label>Descrição padrão na nota</Label><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label>Alíquota de ISS (%)</Label><Input inputMode="decimal" value={f.iss} onChange={(e) => setF({ ...f, iss: e.target.value })} placeholder="Ex.: 2" /></div>
            <div className="flex items-end gap-2 pb-2"><Switch checked={f.retainIss} onCheckedChange={(v) => setF({ ...f, retainIss: v })} id="retain" /><Label htmlFor="retain">ISS retido pelo cliente</Label></div>
          </div>
          <div>
            <Label>Serviço que você vende (opcional)</Label>
            <Select value={f.serviceId || "none"} onValueChange={(v) => setF({ ...f, serviceId: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Nenhum</SelectItem>{(services.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">Confira alíquota e retenções com seu contador. O WiizePay não calcula impostos por conta própria.</p>
          <Button className="w-full" onClick={() => m.mutate()} disabled={m.isPending || f.name.length < 2 || !f.code.trim()}>Salvar serviço fiscal</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

