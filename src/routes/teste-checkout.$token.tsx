import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TEST_CARDS } from "@/lib/ext-test-cards";
import { getSandboxCheckout, paySandboxCheckout } from "@/lib/ext-portal.functions";
import { formatBRL as formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/teste-checkout/$token")({
  head: () => ({
    meta: [
      { title: "Checkout de teste — Wiize Core" },
      { name: "description", content: "Ambiente de testes da Wiize Core: nenhum dinheiro real é movimentado." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Checkout de teste — Wiize Core" },
      { property: "og:description", content: "Ambiente de testes da Wiize Core: nenhum dinheiro real é movimentado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SandboxCheckout,
});

const METHOD: Record<string, string> = { pix: "Pix", boleto: "Boleto", credit_card: "Cartão de crédito" };

function SandboxCheckout() {
  const { token } = Route.useParams();
  const { t } = useTranslation("ui");
  const get = useServerFn(getSandboxCheckout);
  const pay = useServerFn(paySandboxCheckout);
  const q = useQuery({ queryKey: ["sbx-checkout", token], queryFn: () => get({ data: { token } }) });
  const [busy, setBusy] = useState(false);
  const d = q.data;

  const [card, setCard] = useState("");
  const act = async (outcome?: "approve" | "decline" | "pending") => {
    setBusy(true);
    try {
      await pay({ data: outcome ? { token, outcome } : { token, testCard: card } });
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? t(e.message) : t("Algo deu errado."));
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs font-medium text-foreground">
          <FlaskConical className="size-4 shrink-0" />
          {t("Ambiente de testes. Nenhum dinheiro real é cobrado e nada é enviado ao provedor de pagamentos.")}
        </div>
        {q.isLoading ? <div className="skeleton-shimmer h-56 rounded-xl" /> : !d ? (
          <p className="surface-panel p-6 text-sm">{t("Link de teste não encontrado.")}</p>
        ) : (
          <section className="surface-panel space-y-4 p-6">
            <div>
              <p className="text-xs text-muted-foreground">{t("Você está pagando")}</p>
              <h1 className="font-display text-xl font-semibold">{d.service}</h1>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatCurrency(Number(d.amount))}{d.type === "recurring" ? <span className="text-sm font-normal text-muted-foreground"> · {t("recorrente")}</span> : null}</p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-muted-foreground">{t("Cliente de teste")}</dt><dd>{d.customer}</dd></div>
              <div><dt className="text-muted-foreground">{t("Forma de pagamento")}</dt><dd>{d.method ? t(METHOD[d.method] ?? d.method) : t("Escolha do comprador")}</dd></div>
              <div><dt className="text-muted-foreground">{t("Situação")}</dt><dd className="font-medium">{t(STATUS[d.status] ?? d.status)}</dd></div>
            </dl>
            {d.expired ? <p className="text-sm text-muted-foreground">{t("Este link de teste expirou.")}</p> : ["awaiting_payment", "pending"].includes(d.status) ? (
              <div className="grid gap-2">
                {(!d.method || d.method === "credit_card") && (
                  <form className="space-y-2 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); void act(); }}>
                    <label htmlFor="sbx-card" className="text-xs font-medium">{t("Cartão de teste")}</label>
                    <Input id="sbx-card" inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" value={card}
                      onChange={(e) => setCard(e.target.value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "))} />
                    <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                      {TEST_CARDS.map((c) => <li key={c.number}><button type="button" className="font-mono underline-offset-2 hover:underline" onClick={() => setCard(c.number)}>{c.number}</button> · {t(c.label)}</li>)}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">{t("Qualquer validade futura e qualquer CVV de 3 dígitos. Não use um cartão real.")}</p>
                    <Button type="submit" className="w-full" disabled={busy || card.replace(/\D/g, "").length !== 16}>{t("Pagar com cartão de teste")}</Button>
                  </form>
                )}
                <Button disabled={busy} onClick={() => act("approve")}>{t("Simular pagamento aprovado")}</Button>
                <div className="grid grid-cols-2 gap-2">
                  {d.status === "awaiting_payment" && <Button variant="outline" disabled={busy} onClick={() => act("pending")}>{t("Simular pendente")}</Button>}
                  <Button variant="outline" disabled={busy} onClick={() => act("decline")}>{t("Simular recusa")}</Button>
                </div>
              </div>
            ) : null}
            {d.status === "paid" && d.successUrl ? (
              <a href={d.successUrl} rel="noopener" className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{t("Voltar para o site")}</a>
            ) : d.status !== "paid" && d.cancelUrl ? (
              <a href={d.cancelUrl} rel="noopener" className="block text-xs text-muted-foreground underline">{t("Voltar sem pagar")}</a>
            ) : null}
            <p className="text-[11px] text-muted-foreground">{t("O retorno ao site não confirma o pagamento. O sistema integrado deve confirmar pelo aviso assinado ou pela consulta à API.")}</p>
          </section>
        )}
      </div>
    </main>
  );
}

const STATUS: Record<string, string> = {
  awaiting_payment: "Aguardando pagamento", pending: "Pendente", paid: "Pagamento de teste aprovado", failed: "Recusado (teste)",
  overdue: "Vencida", cancelled: "Cancelada", refunded: "Reembolsada (teste)",
};
