import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { disconnectWiize, getWiizeConnection, startWiizeConnect } from "@/lib/wiize-integration.functions";
import { ensureTwoFactor, getMfaState } from "@/lib/mfa-step-up";

export function WiizeIntegrationCard() {
  const { t } = useTranslation("ui");
  const qc = useQueryClient();
  const fetchConn = useServerFn(getWiizeConnection);
  const connect = useServerFn(startWiizeConnect);
  const disconnect = useServerFn(disconnectWiize);
  const { data, isLoading } = useQuery({ queryKey: ["wiize-connection"], queryFn: () => fetchConn() });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("wiize");
    if (p === "conectado") toast.success(t("wiize.connected_ok"));
    else if (p === "em-uso") toast.error(t("wiize.org_in_use"));
    else if (p === "erro") toast.error(t("wiize.connect_error"));
  }, [t]);

  const connectM = useMutation({
    mutationFn: () => connect(),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("wiize.connect_error")),
  });
  const disconnectM = useMutation({
    mutationFn: async () => {
      if (!window.confirm(t("wiize.disconnect") + "?")) throw new Error(t("wiize.cancelled"));
      const mfa = await getMfaState();
      const code = mfa.factorId && !mfa.isAal2 ? window.prompt(t("wiize.mfa_prompt")) ?? "" : "";
      await ensureTwoFactor(code);
      return disconnect();
    },
    onSuccess: () => { toast.success(t("wiize.disconnected_ok")); qc.invalidateQueries({ queryKey: ["wiize-connection"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const c = data?.connection;
  return (
    <section className="surface-panel grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr]">
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight">{t("wiize.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("wiize.subtitle")}</p>
      </div>
      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Wiize</span>
          {isLoading ? <span className="skeleton-shimmer h-5 w-24 rounded" /> : c ? <Badge>● {t("wiize.status_connected")}</Badge> : <Badge variant="secondary">○ {t("wiize.status_disconnected")}</Badge>}
        </div>
        {c ? (
          <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Row label={t("wiize.account")} value={c.wiize_account_name ?? "—"} />
              <Row label={t("wiize.email")} value={c.wiize_email_masked ?? "—"} />
              <Row label={t("wiize.organization")} value={c.wiize_organization_name ?? "—"} />
              <Row label={t("wiize.connected_at")} value={c.connected_at ? formatDateTime(c.connected_at) : "—"} />
              <Row label={t("wiize.permissions")} value={(c.scopes ?? []).join(", ") || "—"} />
              <Row label={t("wiize.last_sync")} value={c.last_sync_at ? formatDateTime(c.last_sync_at) : t("wiize.never")} />
            </dl>
            {data?.canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => connectM.mutate()} disabled={connectM.isPending || !data.configured}>{t("wiize.manage")}</Button>
                <Button variant="destructive" onClick={() => disconnectM.mutate()} disabled={disconnectM.isPending}>{t("wiize.disconnect")}</Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-2">
            <Button onClick={() => connectM.mutate()} disabled={connectM.isPending || !data?.configured || !data?.canManage}>{t("wiize.connect")}</Button>
            {data && !data.configured ? <p className="text-xs text-muted-foreground">{t("wiize.not_available")}</p> : null}
            {data && data.configured && !data.canManage ? <p className="text-xs text-muted-foreground">{t("wiize.owner_only")}</p> : null}
            <p className="text-xs text-muted-foreground">{t("wiize.security_note")}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}
