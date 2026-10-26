import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { getAdminTracking, saveAdminTracking } from "@/lib/admin-tracking.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "react-i18next";

const PATTERNS = { gtm_id: /^GTM-[A-Z0-9]{4,12}$/, ga4_id: /^G-[A-Z0-9]{4,15}$/, meta_pixel_id: /^[0-9]{6,20}$/ };

export function AdminTracking() {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const read = useServerFn(getAdminTracking), write = useServerFn(saveAdminTracking);
  const settings = useQuery({
    queryKey: ["admin-tracking"],
    queryFn: async () => (await read()).settings,
  });
  const consents = useQuery({
    queryKey: ["admin-cookie-consents"],
    queryFn: async () => {
      const result = await read();
      return { rows: result.rows, total: result.total };
    },
  });
  const [form, setForm] = useState({ enabled: true, gtm_id: "", ga4_id: "", meta_pixel_id: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const s = settings.data;
    if (s) setForm({ enabled: s.enabled, gtm_id: s.gtm_id ?? "", ga4_id: s.ga4_id ?? "", meta_pixel_id: s.meta_pixel_id ?? "" });
  }, [settings.data]);

  const save = async () => {
    const clean = {
      gtm_id: form.gtm_id.trim().toUpperCase() || null,
      ga4_id: form.ga4_id.trim().toUpperCase() || null,
      meta_pixel_id: form.meta_pixel_id.trim() || null,
    };
    for (const [k, v] of Object.entries(clean)) {
      if (v && !PATTERNS[k as keyof typeof PATTERNS].test(v)) { toast.error(`Código inválido: ${v}`); return; }
    }
    setSaving(true);
    try { await write({ data: { enabled: form.enabled, ...clean } }); }
    catch { toast.error("Não foi possível salvar."); return; }
    finally { setSaving(false); }
    toast.success("Configurações de análise salvas.");
    void qc.invalidateQueries({ queryKey: ["admin-tracking"] });
  };

  const rows = consents.data?.rows ?? [];
  const pct = (k: "analytics" | "marketing" | "functional") => rows.length ? Math.round((rows.filter((r) => r[k]).length / rows.length) * 100) : 0;

  return (
    <section className="surface-panel space-y-5 p-5">
      <div>
        <h3 className="text-base font-semibold">Análise e cookies</h3>
        <p className="text-sm text-muted-foreground">Os códigos só são carregados no site depois que o visitante aceitar os cookies correspondentes.</p>
      </div>
      <div className="flex items-center gap-3">
        <Switch checked={form.enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))} id="trk-on" />
        <Label htmlFor="trk-on">Rastreamento ativo</Label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5"><Label>Google Analytics 4</Label><Input placeholder="G-XXXXXXX" value={form.ga4_id} onChange={(e) => setForm((f) => ({ ...f, ga4_id: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Google Tag Manager</Label><Input placeholder="GTM-XXXXXX" value={form.gtm_id} onChange={(e) => setForm((f) => ({ ...f, gtm_id: e.target.value }))} /></div>
        <div className="space-y-1.5"><Label>Pixel do Meta</Label><Input placeholder="123456789012345" value={form.meta_pixel_id} onChange={(e) => setForm((f) => ({ ...f, meta_pixel_id: e.target.value }))} /></div>
      </div>
      {form.gtm_id.trim() && form.ga4_id.trim() ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{ui("Com o GTM preenchido, o site envia tudo só pelo GTM e não carrega o GA4 direto, para não contar em dobro. Configure o GA4 dentro do GTM.")}</p>
      ) : null}
      <Button onClick={save} disabled={saving || settings.isLoading}>{saving ? "Salvando…" : "Salvar"}</Button>

      <div className="border-t border-border pt-4">
        <h4 className="text-sm font-semibold">Consentimentos registrados: {consents.data?.total ?? "…"}</h4>
        <p className="mb-3 text-xs text-muted-foreground">Últimos 20 — aceitaram análise {pct("analytics")}% · marketing {pct("marketing")}% · funcionais {pct("functional")}%</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1.5">Data</th><th>Funcionais</th><th>Análise</th><th>Marketing</th><th>Versão</th><th>Idioma</th><th>Logado</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="py-1.5">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                  <td>{r.functional ? "Sim" : "Não"}</td><td>{r.analytics ? "Sim" : "Não"}</td><td>{r.marketing ? "Sim" : "Não"}</td>
                  <td>{r.policy_version}</td><td>{r.language ?? "—"}</td><td>{r.user_id ? "Sim" : "Não"}</td>
                </tr>
              ))}
              {!rows.length && !consents.isLoading && <tr><td colSpan={7} className="py-3 text-muted-foreground">Nenhum consentimento registrado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
