import { createFileRoute } from "@tanstack/react-router";
import { paymentShareMeta } from "@/lib/payment-share";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getServiceCheckout, startServiceCheckout, chooseServiceCheckoutMethod } from "@/lib/service-checkout.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { frequencyLabels } from "@/lib/labels";
import { FinancialIdentity, FinancialSupport } from "@/components/financial-provider";
import { CHECKOUT_SERVICE_FIELDS } from "@/lib/checkout-resume";
import { useCheckoutDraft } from "@/hooks/use-checkout-draft";
import { useCheckoutReturn } from "@/hooks/use-checkout-return";

export const Route = createFileRoute("/checkout/$token")({
  head: () => ({
    meta: [
      { title: "Checkout — WiizePay" },
      { name: "description", content: "Informe seus dados, escolha a forma de pagamento e conclua sua contratação com segurança." },
      { property: "og:title", content: "Checkout — WiizePay" },
      { property: "og:description", content: "Informe seus dados, escolha a forma de pagamento e conclua sua contratação com segurança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...paymentShareMeta,
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OpenCheckout,
});

const methodLabel: Record<string, string> = { pix: "Pix", boleto: "Boleto", credit_card: "Cartão de crédito" };

function OpenCheckout() {
  const { t } = useTranslation("ui");
  const { token } = Route.useParams();
  const fetchInfo = useServerFn(getServiceCheckout);
  const start = useServerFn(startServiceCheckout);
  const choose = useServerFn(chooseServiceCheckoutMethod);
  const info = useQuery({ queryKey: ["open-checkout", token], queryFn: () => fetchInfo({ data: { token } }), refetchOnWindowFocus: "always", refetchOnReconnect: "always" });
  useCheckoutReturn(info.refetch);
  const [form, setForm, clearDraft] = useCheckoutDraft(token, "service", CHECKOUT_SERVICE_FIELDS, { name: "", document: "", email: "", phone: "" });
  const [session, setSession] = useState<string | null>(null);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [method, setMethod] = useState("");
  const [n, setN] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const d = info.data;
  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">{children}</div>
      <footer className="mx-auto mt-8 max-w-lg"><FinancialIdentity /><FinancialSupport /></footer>
    </main>
  );
  if (info.isLoading) return shell(<p className="text-sm text-muted-foreground">{t("Carregando...")}</p>);
  if (d?.state === "activation_pending") return shell(<p role="status" className="text-sm">{t("A empresa ainda está concluindo a ativação para receber pagamentos. Este link ficará disponível após a aprovação da conta.")}</p>);
  if (info.isError || !d || d.state !== "ok") return shell(<p className="text-sm">{t("Este link de checkout não está disponível.")}</p>);

  const svc = d.service;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t("Algo deu errado.")); } finally { setBusy(false); }
  };

  return shell(
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{d.company}</p>
      <h1 className="mt-1 font-display text-2xl font-semibold">{svc.name}</h1>
      {svc.description ? <p className="mt-2 text-sm text-muted-foreground">{svc.description}</p> : null}
      <p className="mt-4 text-lg font-semibold numeric-tabular">
        {formatBRL(svc.amount)}
        {svc.type === "recurring" && svc.frequency ? <span className="ml-1 text-sm font-normal text-muted-foreground">/ {frequencyLabels[svc.frequency]}</span> : null}
      </p>
      <p className="mt-6 text-xs text-muted-foreground">{t("Etapa")} {session ? 2 : 1} {t("de")} 3 — {session ? t("Forma de pagamento") : t("Seus dados")}</p>

      {!session ? (
        <form className="mt-4 space-y-4" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await start({ data: { token, ...form } }); setSession(r.session); setResumeUrl(r.resumeUrl); }); }}>
          <div className="space-y-2"><Label htmlFor="oc-name">{t("Nome completo ou razão social")}</Label><Input id="oc-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="oc-doc">CPF/CNPJ</Label><Input id="oc-doc" required inputMode="numeric" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="oc-email">E-mail</Label><Input id="oc-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="oc-phone">{t("Telefone")}</Label><Input id="oc-phone" required inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <Button type="submit" className="w-full" disabled={busy}>{t("Avançar")}</Button>
        </form>
      ) : (
        <div className="mt-4 space-y-4">
          {resumeUrl ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              {t("Encontramos uma cobrança em aberto para você.")}{" "}
              <a className="font-medium text-primary underline" href={resumeUrl}>{t("Continuar cobrança existente")}</a>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>{t("Forma de pagamento")}</Label>
            <Select value={method} onValueChange={(v) => { setMethod(v); setN("1"); }}>
              <SelectTrigger><SelectValue placeholder={t("Selecione")} /></SelectTrigger>
              <SelectContent>{d.methods.map((m) => <SelectItem key={m} value={m}>{t(methodLabel[m] ?? m)}</SelectItem>)}</SelectContent>
            </Select>
            {svc.type === "recurring" && method ? <p className="text-xs text-muted-foreground">{t("Cobrança automática a cada ciclo, sem parcelamento.")}</p> : null}
          </div>
          {d.installments.length > 1 && method ? (
            <div className="space-y-2">
              <Label>{t("Parcelas")}</Label>
              <Select value={n} onValueChange={setN}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{d.installments.map((i) => <SelectItem key={i} value={String(i)}>{i === 1 ? `${t("À vista")} — ${formatBRL(svc.amount)}` : `${i}x ${t("de")} ${formatBRL(svc.amount / i)}`}</SelectItem>)}</SelectContent>
              </Select>
              {method !== "credit_card" && Number(n) > 1 ? <p className="text-xs text-muted-foreground">{t("Uma cobrança nova é enviada a cada mês.")}</p> : null}
            </div>
          ) : null}
          {resumeUrl ? <Button asChild className="w-full"><a href={resumeUrl} onClick={clearDraft}>{t("Continuar cobrança existente")}</a></Button> : <Button className="w-full" disabled={busy || !method} onClick={() => void run(async () => { const r = await choose({ data: { token, session, method, installments: Number(n) } }); clearDraft(); window.location.assign(r.payUrl); })}>{t("Ir para o pagamento")}</Button>}
          <Button type="button" variant="ghost" className="w-full" onClick={() => setSession(null)}>{t("Voltar")}</Button>
        </div>
      )}
      {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
    </>,
  );
}
