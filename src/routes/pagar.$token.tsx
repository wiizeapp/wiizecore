import { createFileRoute, Link } from "@tanstack/react-router";
import { paymentShareMeta } from "@/lib/payment-share";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowRight, Ban, CalendarDays, CheckCircle2, Clock3, Copy, Loader2, Mail, MapPin, Phone, Undo2, XCircle, CreditCard, FileSignature, FileText, Eye, LockKeyhole, QrCode, UserRound } from "lucide-react";
import { applyCheckoutCoupon, getCheckout, getCheckoutContractPdf, getCheckoutReceipt, getPaymentInstructions, notifyCheckout3dsReturn, removeCheckoutCoupon, signCheckoutContract, switchCheckoutMethod, trackCheckoutEvent, updateCheckoutCustomer } from "@/lib/checkout.functions";
import { TicketPercent, X } from "lucide-react";
import { DEFAULT_APPEARANCE, type CheckoutAppearance } from "@/lib/checkout-appearance";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatBRL, formatDate } from "@/lib/format";
import { frequencyLabels, paymentMethodLabels, paymentStatusLabels } from "@/lib/labels";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SignaturePad, type SignatureValue } from "@/components/contracts/signature-pad";
import { CardPaymentForm } from "@/components/checkout/card-payment-form";
import { CheckoutBrandHeader, CheckoutProgress, CheckoutStageHeader, CheckoutTermsPanel, CheckoutTrustFooter, checkoutAppearanceVars } from "@/components/checkout/checkout-presentation";

export const Route = createFileRoute("/pagar/$token")({
  head: () => ({
    meta: [
      { title: "Pagamento seguro — WiizePay" },
      { name: "description", content: "Finalize seu pagamento com Pix, boleto ou cartão de forma segura." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Pagamento seguro — WiizePay" },
      { property: "og:description", content: "Finalize seu pagamento com Pix, boleto ou cartão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...paymentShareMeta,
    ],
  }),
  loader: async ({ params, context }) => {
    try {
      await context.queryClient.prefetchQuery({ queryKey: ["checkout", params.token], queryFn: () => getCheckout({ data: { token: params.token } }), staleTime: 5000 });
    } catch { /* o cliente tenta de novo */ }
  },
  component: Checkout,
});

const OPEN = ["awaiting_payment", "overdue", "created"];
function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function shiftDate(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function Checkout() {
  const { t: ui } = useTranslation("ui");
  const { token } = Route.useParams();
  const fetchCheckout = useServerFn(getCheckout);
  const fetchInstructions = useServerFn(getPaymentInstructions);
  const [method, setMethod] = useState<"pix" | "boleto" | "credit_card" | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const loadedInstructions = useRef<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["checkout", token],
    queryFn: () => fetchCheckout({ data: { token } }),
    refetchInterval: (q) => {
      const d = q.state.data;
      if (d?.state !== "ok") return false;
      return d.payments.some((p) => OPEN.includes(p.status)) ? 8000 : false;
    },
    retry: false,
  });

  const switchFn = useServerFn(switchCheckoutMethod);
  const [changing, setChanging] = useState(false);
  const switcher = useMutation({
    mutationFn: (input: { paymentId: string; method: "pix" | "boleto" | "credit_card"; regularize?: boolean }) =>
      switchFn({ data: { token, ...input, regularize: input.regularize ?? false, idempotencyKey: crypto.randomUUID().replace(/-/g, "") } }),
    onSuccess: async (_r, v) => {
      setChanging(false); instructions.reset(); setMethod(v.method);
      toast.success(v.regularize ? ui("Cobrança regularizada. Você já pode pagar.") : ui("Forma de pagamento alterada."));
      await refetch();
      if (v.method === "pix" || v.method === "boleto") instructions.mutate({ paymentId: v.paymentId, kind: v.method });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const instructions = useMutation({
    mutationFn: (input: { paymentId: string; kind: "pix" | "boleto" }) => fetchInstructions({ data: { token, ...input } }),
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    const el = document.documentElement;
    const wasDark = el.classList.contains("dark");
    el.classList.remove("dark"); el.style.colorScheme = "light";
    return () => { if (wasDark) { el.classList.add("dark"); el.style.colorScheme = "dark"; } };
  }, []);

  const track = useServerFn(trackCheckoutEvent);
  const trackedPayment = useRef<string | null>(null);
  const automaticPayment = data?.state === "ok" ? data.payments.find((payment) => OPEN.includes(payment.status)) : undefined;
  useEffect(() => {
    if (!automaticPayment) return;
    const chosen = automaticPayment?.method;
    if (chosen !== "pix" && chosen !== "boleto" && chosen !== "credit_card") return;
    setMethod(chosen);
    const instructionKey = `${automaticPayment.id}:${chosen}`;
    if ((chosen === "pix" || chosen === "boleto") && loadedInstructions.current !== instructionKey) {
      loadedInstructions.current = instructionKey;
      instructions.mutate({ paymentId: automaticPayment.id, kind: chosen });
    }
  }, [automaticPayment?.id, automaticPayment?.method]);

  // Retorno do desafio 3DS do banco: mostra "confirmando" até o webhook oficial atualizar a cobrança.
  const notify3ds = useServerFn(notifyCheckout3dsReturn);
  const [verifyingCard, setVerifyingCard] = useState(false);
  const handled3dsReturn = useRef(false);
  useEffect(() => {
    if (handled3dsReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("verificacao-cartao") !== "retorno") return;
    handled3dsReturn.current = true;
    setVerifyingCard(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("verificacao-cartao");
    window.history.replaceState(null, "", url.toString());
  }, []);
  useEffect(() => {
    if (!verifyingCard || !automaticPayment) return;
    void notify3ds({ data: { token, paymentId: automaticPayment.id } }).catch(() => undefined);
  }, [verifyingCard, automaticPayment?.id]);

  if (isLoading) return <Shell><CheckoutSkeleton /></Shell>;
  const appearance = data?.state === "ok" ? data.appearance : DEFAULT_APPEARANCE;
  if (error || !data) return <Shell><StateView icon={XCircle} tone="danger" title={ui("Não foi possível abrir o link")} text={ui("Tente novamente em alguns minutos.")} /></Shell>;
  if (data.state !== "ok") {
    const texts = { invalid: "Este link não existe. Confira o endereço recebido.", revoked: "Este link foi desativado pelo prestador. Peça um novo link." } as const;
    return <Shell><StateView icon={XCircle} tone="muted" title={ui("Link indisponível")} text={ui(texts[data.state])} /></Shell>;
  }

  const upcoming = data.payments.find((p) => OPEN.includes(p.status));
  const lastPaid = [...data.payments].reverse().find((p) => p.status === "paid");
  // Próximas parcelas só ficam disponíveis para pagamento 5 dias antes do vencimento.
  const releaseOn = upcoming?.dueOn ? shiftDate(upcoming.dueOn, -5) : null;
  const waitingNext = Boolean(upcoming && lastPaid && upcoming.status !== "overdue" && releaseOn && releaseOn > todayIso());
  const current = waitingNext ? undefined : upcoming;
  const processing = !current ? data.payments.find((p) => p.status === "processing" || p.status === "in_analysis") : undefined;
  const allPaid = waitingNext || (!current && !processing && data.payments.length > 0 && data.payments.every((p) => p.status === "paid"));
  const allCancelled = !current && data.payments.length > 0 && data.payments.every((p) => p.status === "cancelled");
  const anyRefunded = !current && data.payments.some((p) => p.status === "refunded");
  const failed = !current && !processing && data.payments.length > 0 && data.payments.some((p) => p.status === "failed");
  const shown = current ?? processing ?? lastPaid ?? data.payments[data.payments.length - 1];
  const accepted = (data.service?.acceptedMethods ?? ["pix", "boleto", "credit_card"]) as string[];
  const lockedMethod = current?.method ?? null;
  const available = (["pix", "boleto", "credit_card"] as const).filter((m) => (lockedMethod ? m === lockedMethod : accepted.includes(m)));
  const resolvedMethod = method ?? lockedMethod ?? available[0] ?? null;
  const pixPaid = method === "pix" && instructions.data?.kind === "pix" && !current && allPaid;
  const needsCustomerData = Boolean(current && !data.dataConfirmed);
  const checkoutStep = needsCustomerData ? "customer" : data.pendingContract ? "contract" : "payment";

  if (current && !needsCustomerData && !data.pendingContract && resolvedMethod && trackedPayment.current !== current.id) {
    trackedPayment.current = current.id;
    void track({ data: { token, event: "payment_viewed", method: resolvedMethod } }).catch(() => undefined);
  }
  const late = current && current.late.days > 0 ? current.late : null;
  const otherMethods = current?.canSwitch ? current.switchMethods.filter((m) => m !== current.method) : [];
  const methodName = (m: string) => ui(m === "pix" ? "Pix" : m === "boleto" ? "Boleto" : m === "debit_card" ? "Débito em conta" : "Cartão de crédito");

  return (
    <Shell appearance={appearance}>
      <div className="grid w-full flex-1 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)]">
        <aside className="checkout-panel p-6 sm:p-8 lg:border-r lg:border-border lg:px-14 lg:py-12 xl:px-20 xl:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{ui("Pagamento para")}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{data.providerName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{data.service?.name}{data.service?.type === "recurring" && data.service.frequency ? ` · ${frequencyLabels[data.service.frequency]}` : ""}</p>
          {(allPaid || processing) && data.returnUrls?.success ? (
            <a href={data.returnUrls.success} rel="noopener" className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{ui("Voltar para o site")}</a>
          ) : current && data.returnUrls?.cancel ? (
            <a href={data.returnUrls.cancel} rel="noopener" className="mt-3 inline-block text-xs text-muted-foreground underline">{ui("Voltar sem pagar")}</a>
          ) : null}

          {shown ? (
            <div className="mt-8 border-t border-border pt-7">
              <p className="text-sm text-muted-foreground">{shown.installmentCount ? `${ui("Parcela")} ${shown.installmentNumber} ${ui("de")} ${shown.installmentCount}` : ui("Valor a pagar")}</p>
              <p className="numeric-tabular mt-1 font-display text-5xl font-bold tracking-tight sm:text-6xl">{formatBRL(late && shown === current ? late.total : shown.amount)}</p>
              <div className="mt-7 flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="size-4" /></span>
                <div><p className="text-sm"><span>{ui("Vencimento em")} <b className="font-semibold">{longDate(shown.dueOn)}</b></span>{shown.status === "overdue" ? <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">{ui("vencida")}</span> : null}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{lateText(shown.finePercent, shown.interestPercent, ui)}</p></div>
              </div>
              {late ? (
                <dl className="mt-6 space-y-1.5 border-t border-border pt-4 text-sm" aria-label={ui("Valor atualizado")}>
                  <div className="flex justify-between"><dt className="text-muted-foreground">{ui("Valor original")}</dt><dd className="numeric-tabular">{formatBRL(late.original)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">{ui("Multa")}</dt><dd className="numeric-tabular">{formatBRL(late.fine)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">{ui("Juros")} ({late.days} {ui("dias")})</dt><dd className="numeric-tabular">{formatBRL(late.interest)}</dd></div>
                  <div className="flex justify-between border-t border-border pt-1.5 font-semibold"><dt>{ui("Total atualizado")}</dt><dd className="numeric-tabular">{formatBRL(late.total)}</dd></div>
                </dl>
              ) : null}
              {shown.feePassShare > 0 && shown.serviceAmount != null && shown.serviceAmount < shown.amount ? (
                <dl className="mt-6 space-y-1.5 border-t border-border pt-4 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">{ui("Valor do serviço")}</dt><dd className="numeric-tabular">{formatBRL(shown.serviceAmount)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">{ui("Taxa de pagamento")}</dt><dd className="numeric-tabular">{formatBRL(shown.amount - shown.serviceAmount)}</dd></div>
                  <div className="flex justify-between font-semibold"><dt>{ui("Total a pagar")}</dt><dd className="numeric-tabular">{formatBRL(shown.amount)}</dd></div>
                </dl>
              ) : null}
              {current && current.canSwitch && checkoutStep === "payment" ? (
                <CouponBox token={token} paymentId={current.id} coupon={current.coupon} onChanged={() => void refetch()} />
              ) : null}
            </div>
          ) : null}
          <ChargeOverview payments={data.payments} current={upcoming ?? null} nextExpected={data.nextExpected ?? null} />
        </aside>

        <section className="min-w-0 border-t border-border p-6 sm:p-8 lg:border-t-0 lg:px-14 lg:py-12 xl:px-20 xl:py-16">
        {current && lastPaid ? (
          <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{lastPaid.installmentCount ? `${ui("Parcela")} ${lastPaid.installmentNumber} ${ui("de")} ${lastPaid.installmentCount} ${ui("paga em")} ${formatDate(lastPaid.paidAt ?? lastPaid.dueOn)}` : `${ui("Último pagamento confirmado em")} ${formatDate(lastPaid.paidAt ?? lastPaid.dueOn)}`}</p>
              <p className="mt-0.5 text-muted-foreground">{ui("Obrigado! O próximo pagamento vence em")} <b className="font-semibold text-foreground">{formatDate(current.dueOn)}</b>.</p>
              <Link to="/portal/$key" params={{ key: data.portalKey }} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><UserRound className="size-4" />{ui("Acessar portal do cliente")}</Link>
            </div>
          </div>
        ) : null}
        {current ? <CheckoutProgress current={checkoutStep} needsCustomerData needsContract={Boolean(data.pendingContract)} /> : null}
          {needsCustomerData ? (
           <CustomerForm token={token} customer={data.customer} acceptedTerms={acceptedTerms} onAcceptedTerms={setAcceptedTerms} onDone={() => void refetch()} />
        ) : data.pendingContract ? (
          <CheckoutContractForm onViewed={() => void track({ data: { token, event: "contract_viewed" } }).catch(() => undefined)} token={token} contract={data.pendingContract} customerName={data.customer?.name ?? ""} onSigned={() => void refetch()} />
        ) : data.coproductionPending && !allPaid ? (
          <StateView icon={CheckCircle2} tone="muted" title={ui("Pagamento disponível em breve")} text={ui("O prestador está finalizando a configuração desta cobrança. Volte a este mesmo link em alguns instantes.")} />
        ) : allPaid || pixPaid ? (
          <StateView icon={CheckCircle2} tone="success" title={ui("Pagamento realizado com sucesso")} text={waitingNext ? ui("Tudo certo! Seu último pagamento foi confirmado. A próxima parcela fica disponível neste link 5 dias antes do vencimento.") : data.nextExpected ? ui("Tudo certo! Seu pagamento foi confirmado. A próxima cobrança aparecerá neste mesmo link.") : data.payments.length > 1 ? ui("Tudo certo! Todos os pagamentos desta cobrança foram confirmados.") : ui("Tudo certo! Seu pagamento foi confirmado.")} hint={ui("Você receberá a confirmação do pagamento pelos canais disponíveis.")}>
            {lastPaid ? <dl className="mx-auto mt-6 max-w-sm divide-y divide-border border-y border-border text-sm">
              <Row k={ui("Valor pago")} v={formatBRL(lastPaid.amount)} />
              <Row k={ui("Data")} v={formatDate(lastPaid.paidAt ?? lastPaid.dueOn)} />
              {lastPaid.method ? <Row k={ui("Forma de pagamento")} v={ui(paymentMethodLabels[lastPaid.method] ?? lastPaid.method)} /> : null}
              {data.payments.length > 1 ? <Row k={ui("Pagamentos concluídos")} v={`${data.payments.filter((p) => p.status === "paid").length} ${ui("de")} ${data.payments.length}`} /> : null}
              {waitingNext && upcoming ? <Row k={ui("Próxima parcela")} v={`${formatBRL(upcoming.amount)} · ${formatDate(upcoming.dueOn)}`} /> : null}
              {waitingNext && releaseOn ? <Row k={ui("Disponível para pagamento em")} v={formatDate(releaseOn)} /> : null}
              {!waitingNext && data.nextExpected ? <Row k={ui("Próxima cobrança")} v={`${formatBRL(data.nextExpected.amount)} · ${formatDate(data.nextExpected.dueOn)}`} /> : null}
              {data.payments.length > 1 ? <Row k={ui("Total pago")} v={formatBRL(data.payments.filter((p) => p.status === "paid").reduce((a, p) => a + p.amount, 0))} /> : null}
            </dl> : null}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <ReceiptsButton token={token} payments={data.payments} />
              <Button asChild type="button" className="w-full sm:w-auto sm:min-w-56"><Link to="/portal/$key" params={{ key: data.portalKey }}><UserRound className="size-4" />{ui("Acessar portal do cliente")}</Link></Button>
            </div>
          </StateView>
        ) : processing ? (
          <StateView icon={Loader2} spin tone="muted" title={ui("Pagamento em processamento")} text={ui("Estamos aguardando a confirmação do seu pagamento.")} hint={ui("Esta página atualiza sozinha quando o pagamento for confirmado.")} />
        ) : allCancelled ? (
          <StateView icon={Ban} tone="muted" title={ui("Cobrança cancelada")} text={ui("Esta cobrança foi cancelada pelo responsável e não aceita mais pagamentos.")} />
        ) : anyRefunded ? (
          <StateView icon={Undo2} tone="muted" title={ui("Pagamento estornado")} text={ui("O valor desta cobrança foi devolvido.")} />
        ) : failed ? (
          <StateView icon={XCircle} tone="danger" title={ui("Não foi possível concluir o pagamento")} text={ui("Não foi possível processar o pagamento. Verifique os dados e tente novamente.")}>
            <Button className="mt-6" onClick={() => void refetch()}>{ui("Tentar novamente")}</Button>
          </StateView>
        ) : current && data.linkExpired ? (
          <StateView icon={Clock3} tone="muted" title={ui("Cobrança expirada")} text={ui("O prazo original desta cobrança terminou.")} hint={current.canSwitch ? ui("Você pode regularizar agora pelo mesmo link. O valor é atualizado com os encargos combinados.") : ui("Entre em contato com o responsável pela cobrança para regularizar.")}>
            {current.canSwitch ? (
              <div className="mx-auto mt-6 flex max-w-sm flex-col gap-2">
                {current.switchMethods.map((m) => (
                  <Button key={m} variant={m === (current.method ?? "pix") ? "default" : "outline"} disabled={switcher.isPending}
                    onClick={() => switcher.mutate({ paymentId: current.id, method: m, regularize: true })}>
                    {switcher.isPending && switcher.variables?.method === m ? <Loader2 className="size-4 animate-spin" /> : null}
                    {ui("Regularizar cobrança")} · {methodName(m)}
                  </Button>
                ))}
              </div>
            ) : null}
          </StateView>
        ) : !current ? (
          <StateView icon={CheckCircle2} tone="muted" title={ui("Nada a pagar agora")} text={ui("Não há pagamentos em aberto neste link.")} />
        ) : verifyingCard ? (
          <StateView icon={Loader2} spin tone="muted" title={ui("Confirmando a verificação do banco")} text={ui("A verificação do banco foi concluída. Aguarde a confirmação do pagamento nesta página.")} hint={ui("Esta página atualiza sozinha quando o pagamento for confirmado.")}>
            <Button variant="outline" className="mt-6" onClick={() => setVerifyingCard(false)}>{ui("Voltar ao pagamento")}</Button>
          </StateView>
        ) : resolvedMethod ? (
          <div className="space-y-6">
            <CheckoutStageHeader step="payment" title={ui("Revise e conclua")} description={ui("Confira os detalhes antes de finalizar.")} method={resolvedMethod === "pix" || resolvedMethod === "boleto" ? resolvedMethod : "credit_card"} />
            {lockedMethod && otherMethods.length ? (
              <div className="rounded-lg border border-border bg-card p-4 text-sm shadow-sm">
                {!changing ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-muted-foreground">{ui("Precisa usar outra forma de pagamento?")}</span>
                    <Button variant="outline" size="sm" onClick={() => setChanging(true)}>{ui("Alterar forma de pagamento")}</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="font-medium">{ui("Escolha a nova forma de pagamento")}</p>
                    <p className="text-xs text-muted-foreground">{ui("O link continua o mesmo. A forma anterior deixa de valer.")}</p>
                    <div className="flex flex-wrap gap-2">
                      {otherMethods.map((m) => (
                        <Button key={m} size="sm" disabled={switcher.isPending} onClick={() => switcher.mutate({ paymentId: current.id, method: m, regularize: Boolean(late) })}>
                          {switcher.isPending && switcher.variables?.method === m ? <Loader2 className="size-4 animate-spin" /> : null}{methodName(m)}
                        </Button>
                      ))}
                      <Button size="sm" variant="ghost" disabled={switcher.isPending} onClick={() => setChanging(false)}>{ui("Cancelar")}</Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            <div className="flex items-center gap-3 pt-1">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">{resolvedMethod === "pix" ? <QrCode className="size-5" /> : resolvedMethod === "boleto" ? <FileText className="size-5" /> : <CreditCard className="size-5" />}</span>
              <div><h3 className="font-display text-xl font-semibold">{resolvedMethod === "pix" ? ui("Pague com Pix") : resolvedMethod === "boleto" ? ui("Pague com boleto") : ui("Dados do cartão")}</h3><p className="text-sm text-muted-foreground">{resolvedMethod === "credit_card" ? ui("Preencha os dados abaixo para finalizar") : ui("Use os dados abaixo para concluir o pagamento")}</p></div>
            </div>
            {resolvedMethod === "credit_card" ? (
              <CardPaymentForm token={token} paymentId={current.id} amount={late ? late.total : current.amount} disabled={false} onDone={() => void refetch()} />
            ) : null}
            {resolvedMethod === "pix" || resolvedMethod === "boleto" ? (
              <div className="space-y-5">
                {instructions.isPending ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{ui(resolvedMethod === "pix" ? "Gerando QR Code…" : "Gerando boleto…")}</div>
                ) : instructions.isError ? (
                  <div className="rounded-lg border border-border bg-card p-6 text-center text-sm"><p className="text-muted-foreground">{ui("Não foi possível gerar agora.")}</p><Button variant="outline" className="mt-3" onClick={() => instructions.mutate({ paymentId: current.id, kind: resolvedMethod })}>{ui("Tentar novamente")}</Button></div>
                ) : instructions.data?.kind === "pix" ? (
                  <>

                    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                      <img src={`data:image/png;base64,${instructions.data.image}`} alt="QR Code Pix" className="size-48 shrink-0 rounded-xl border border-border bg-card p-2" />
                      <ol className="space-y-2 text-sm text-muted-foreground">
                        <li><span className="font-semibold text-primary">1.</span> {ui("Abra o aplicativo do seu banco.")}</li>
                        <li><span className="font-semibold text-primary">2.</span> {ui("Escaneie o QR Code ou cole o código Pix.")}</li>
                        <li><span className="font-semibold text-primary">3.</span> {ui("Confirme e aguarde a atualização desta página.")}</li>
                      </ol>
                    </div>
                    <CopyField value={instructions.data.code} label={ui("Pix copia e cola")} button={ui("Copiar código Pix")} />
                  </>
                ) : instructions.data?.kind === "boleto" ? (
                  <>
                    <CopyField value={instructions.data.code} label={ui("Linha digitável")} button={ui("Copiar linha digitável")} />
                    {current.bankSlipUrl ? <Button asChild variant="outline" className="w-full"><a href={current.bankSlipUrl} target="_blank" rel="noopener noreferrer">{ui("Abrir boleto (PDF)")}</a></Button> : null}
                  </>
                ) : null}
                {instructions.data ? <p role="status" className="flex items-center justify-center gap-2 rounded-full bg-muted px-4 py-2 text-xs text-muted-foreground"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>{ui("Aguardando pagamento…")}</p> : null}
              </div>
            ) : null}
          </div>
        ) : <StateView icon={Clock3} tone="muted" title={ui("Forma de pagamento indisponível")} text={ui("Peça ao responsável para atualizar esta cobrança.")} />}

        {data.payments.length > 1 ? (
          <div className="mt-10 space-y-2">
            <h3 className="text-sm font-semibold">{ui("Histórico")}</h3>
            <ul className="divide-y divide-border border-y border-border text-sm">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span>{formatDate(p.dueOn)}{p.installmentCount ? ` · ${p.installmentNumber}/${p.installmentCount}` : ""}</span>
                  <span className="flex items-center gap-2"><span className="numeric-tabular">{formatBRL(p.amount)}</span><Badge variant={p.status === "paid" ? "default" : "secondary"}>{ui(paymentStatusLabels[p.status] ?? p.status)}</Badge></span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        </section>
      </div>
    </Shell>
  );
}

function CheckoutContractForm({ token, contract, customerName, onSigned, onViewed }: { onViewed: () => void; token: string; contract: { title: string; body: string; version: number }; customerName: string; onSigned: () => void }) {
  const sign = useServerFn(signCheckoutContract);
  const loadPdf = useServerFn(getCheckoutContractPdf);
  const [name, setName] = useState(customerName);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const pdf = useQuery({
    queryKey: ["checkout-contract-pdf", token, contract.version],
    enabled: viewerOpen,
    staleTime: Infinity,
    queryFn: async () => {
      const r = await loadPdf({ data: { token } });
      const bin = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      return URL.createObjectURL(new Blob([bin], { type: "application/pdf" }));
    },
  });
  const [document, setDocument] = useState("");
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const mutation = useMutation({
    mutationFn: () => sign({ data: { token, signerName: name, signerDocument: document, signature } }),
    onSuccess: () => { toast.success("Contrato assinado. O pagamento foi liberado."); onSigned(); },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
      <CheckoutStageHeader step="contract" title="Revise e assine" description={`Leia o documento vinculado a “${contract.title}” antes de liberar o pagamento.`} />
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-6" /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{contract.title}</p><p className="mt-0.5 text-xs text-muted-foreground">Versão {contract.version} · {opened ? "Documento aberto" : "Leia o documento completo antes de assinar"}</p></div>
        <Button type="button" variant={opened ? "outline" : "default"} className="h-11 gap-2" onClick={() => { setViewerOpen(true); if (!opened) onViewed(); setOpened(true); }}><Eye className="size-4" />{opened ? "Ler novamente" : "Abrir e ler contrato"}</Button>
      </div>
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-3 p-4 sm:p-6">
          <DialogHeader><DialogTitle>{contract.title}</DialogTitle><DialogDescription>Versão {contract.version}. Leia com atenção antes de assinar.</DialogDescription></DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
            {pdf.data ? <iframe src={pdf.data} title={contract.title} className="size-full" /> : pdf.isError ? <div className="grid size-full place-items-center p-6 text-center text-sm text-muted-foreground"><div className="space-y-3"><p>Não foi possível abrir o documento agora.</p><Button type="button" variant="outline" onClick={() => void pdf.refetch()}>Tentar novamente</Button>{contract.body ? <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-left">{contract.body}</p> : null}</div></div> : <div className="grid size-full place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" />Carregando documento…</span></div>}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {pdf.data ? <Button asChild variant="outline"><a href={pdf.data} download={`${contract.title}.pdf`}>Baixar PDF</a></Button> : null}
            <Button type="button" onClick={() => setViewerOpen(false)}>Li o contrato, continuar</Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="checkout-signer-name">Nome completo</Label><Input id="checkout-signer-name" required value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="checkout-signer-document">CPF ou CNPJ</Label><Input id="checkout-signer-document" required inputMode="numeric" value={document} onChange={(event) => setDocument(event.target.value)} /></div>
      </div>
      <SignaturePad name={name} onChange={setSignature} />
      {!opened ? <p className="text-center text-xs text-muted-foreground">Abra e leia o contrato para liberar a assinatura.</p> : null}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={!signature || !opened || mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileSignature className="size-4" />}{mutation.isPending ? "Registrando assinatura…" : "Assinar e continuar"}</Button>
    </form>
  );
}

function CopyField({ value, label, button }: { value: string; label: string; button: string }) {
  const { t: ui } = useTranslation("ui");
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <Input readOnly value={value} aria-label={label} className="h-11 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button type="button" size="lg" className="h-12 w-full gap-2" onClick={() => { void navigator.clipboard.writeText(value); toast.success(ui("Copiado.")); }}><Copy className="size-4" />{button}</Button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3 py-2.5"><dt className="text-muted-foreground">{k}</dt><dd className="numeric-tabular font-medium">{v}</dd></div>;
}

function StateView({ icon: Icon, tone, title, text, hint, spin, children }: { icon: typeof CheckCircle2; tone: "success" | "danger" | "muted"; title: string; text: string; hint?: string; spin?: boolean; children?: React.ReactNode }) {
  const ring = tone === "success" ? "bg-primary/10 text-primary" : tone === "danger" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return (
    <div role="status" className="mx-auto max-w-md py-8 text-center">
      <span className={`mx-auto grid size-16 place-items-center rounded-full ${ring}`}><Icon className={`size-8 ${spin ? "animate-spin" : ""}`} /></span>
      <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-muted-foreground">{text}</p>
      {hint ? <p className="mt-3 text-sm text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

function CheckoutSkeleton() {
  const { t: ui } = useTranslation("ui");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 animate-fade-in" aria-busy="true" role="status">
      <div className="relative size-20">
        <span className="absolute inset-0 rounded-full border-4 border-primary/15" />
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary [animation-duration:900ms]" />
        <span className="absolute inset-3 animate-ping rounded-full bg-primary/15 [animation-duration:1.6s]" />
        <LockKeyhole className="absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 text-primary" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-foreground">{ui("Preparando seu pagamento seguro")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{ui("Carregando cobrança…")}</p>
      </div>
      <div className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="size-2 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${i * 150}ms` }} />)}</div>
    </div>
  );
}

function longDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
}

function lateText(fine: number, interest: number, ui: (k: string) => string) {
  const f = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (fine <= 0 && interest <= 0) return ui("Sem encargos adicionais por atraso.");
  const parts = [fine > 0 ? `${ui("multa de")} ${f(fine)}%` : null, interest > 0 ? `${ui("juros de")} ${f(interest)}% ${ui("ao mês")}` : null].filter(Boolean);
  return `${ui("Após o vencimento:")} ${parts.join(" + ")}.`;
}

function Shell({ children, appearance = DEFAULT_APPEARANCE }: { children: React.ReactNode; appearance?: CheckoutAppearance }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" style={checkoutAppearanceVars(appearance)}>
      <CheckoutBrandHeader appearance={appearance} />
      <main className="flex w-full flex-1 flex-col">{children}</main>
      <MoreContentHint />
      <CheckoutTrustFooter appearance={appearance} />
    </div>
  );
}

function MoreContentHint() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY + window.innerHeight < document.documentElement.scrollHeight - 48);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, []);
  if (!visible) return null;
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      aria-label="Ver mais conteúdo abaixo"
      title="Ver mais conteúdo"
      onClick={() => window.scrollBy({ top: Math.max(280, window.innerHeight * 0.72), behavior: "smooth" })}
      className="fixed bottom-5 right-5 z-40 grid size-10 place-items-center rounded-full border border-border bg-background/95 text-primary shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-6 sm:right-6"
    >
      <ArrowDown className="size-4 animate-bounce" />
    </Button>
  );
}

type CheckoutCustomer = {
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  zipCode: string | null;
  address: string | null;
  addressNumber: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  complete: boolean;
} | null;

function CustomerForm({ token, customer, acceptedTerms, onAcceptedTerms, onDone }: { token: string; customer: CheckoutCustomer; acceptedTerms: boolean; onAcceptedTerms: (accepted: boolean) => void; onDone: () => void }) {
  const { t: ui } = useTranslation("ui");
  const save = useServerFn(updateCheckoutCustomer);
  const [f, setF] = useState({
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    zipCode: customer?.zipCode ?? "",
    address: customer?.address ?? "",
    addressNumber: customer?.addressNumber ?? "",
    complement: customer?.complement ?? "",
    district: customer?.district ?? "",
    city: customer?.city ?? "",
    state: customer?.state ?? "",
  });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          token,
          ...f,
          phone: f.phone.replace(/\D/g, ""),
          zipCode: f.zipCode.replace(/\D/g, ""),
        },
      }),
    onSuccess: onDone,
    onError: (e: Error) => {
      const message = friendlyCheckoutError(e);
      if (message.toLowerCase().includes("celular") || message.toLowerCase().includes("telefone")) setFieldError(message);
      toast.error(message);
    },
  });
  async function lookupCep(cep: string) {
    const d = cep.replace(/\D/g, "");
    if (d.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = (await r.json()) as { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean };
      if (!j.erro) setF((v) => ({ ...v, address: j.logradouro || v.address, district: j.bairro || v.district, city: j.localidade || v.city, state: j.uf || v.state }));
    } catch {
      /* preenchimento manual */
    }
  }
  const field = (k: keyof typeof f, label: string, props: Record<string, unknown> = {}, Icon?: typeof Mail) => (
    <label className="space-y-1.5 text-sm">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <span className="relative block">
        {Icon ? <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /> : null}
        <Input className={`h-11 bg-background ${Icon ? "pl-9" : ""}`} value={f[k]} onChange={(e) => { setFieldError(null); setF({ ...f, [k]: e.target.value }); }} {...props} />
      </span>
    </label>
  );
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const phone = f.phone.replace(/\D/g, "");
        if (phone.length !== 10 && phone.length !== 11) {
          setFieldError("Informe um celular válido com DDD, usando 10 ou 11 números.");
          return;
        }
        setFieldError(null);
        mut.mutate();
      }}
    >
       <CheckoutStageHeader step="customer" title={ui("Confirme seus dados")} description={ui("Precisamos destas informações para emitir o pagamento com segurança.")} />
      <dl className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
        <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">{ui("Nome completo")}</dt><dd className="mt-1 font-medium">{customer?.name ?? "—"}</dd></div>
        <div><dt className="text-[11px] font-semibold uppercase text-muted-foreground">CPF/CNPJ</dt><dd className="mt-1 font-mono font-medium">{customer?.document ?? "—"}</dd></div>
        <p className="text-xs text-muted-foreground sm:col-span-2">{ui("Nome e CPF/CNPJ só podem ser alterados pelo prestador.")}</p>
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
         <div>{field("email", ui("E-mail"), { type: "email", required: true }, Mail)}</div>
         <div>{field("phone", ui("Celular com DDD"), { inputMode: "tel", autoComplete: "tel", required: true, maxLength: 16, placeholder: "(11) 99999-9999", "aria-invalid": Boolean(fieldError) }, Phone)}{fieldError ? <p role="alert" className="mt-1.5 text-xs text-destructive">{fieldError}</p> : <p className="mt-1.5 text-[11px] text-muted-foreground">DDD + número, sem incluir o código do país.</p>}</div>
        <label className="space-y-1.5 text-sm">
          <span className="text-xs font-semibold">CEP</span>
          <Input className="h-11 bg-background" value={f.zipCode} inputMode="numeric" required onChange={(e) => setF({ ...f, zipCode: e.target.value })} onBlur={(e) => void lookupCep(e.target.value)} />
        </label>
          <div>{field("address", ui("Endereço"), { required: true }, MapPin)}</div>
         {field("addressNumber", ui("Número"), { required: true })}
         {field("complement", ui("Complemento"))}
         {field("district", ui("Bairro"), { required: true })}
         {field("city", ui("Cidade"), { required: true })}
         {field("state", ui("UF"), { maxLength: 2, required: true })}
      </div>
        <CheckoutTermsPanel checked={acceptedTerms} onCheckedChange={onAcceptedTerms} />
       <Button size="lg" className="h-12 w-full text-base" disabled={!acceptedTerms || mut.isPending}>{mut.isPending ? <Loader2 className="size-4 animate-spin" /> : null}{ui(mut.isPending ? "Salvando…" : "Confirmar e continuar")}{!mut.isPending ? <ArrowRight className="size-4" /> : null}</Button>
    </form>
  );
}

function friendlyCheckoutError(error: Error) {
  const raw = error.message;
  if (raw.includes("phone") || raw.includes("Telefone com DDD") || raw.includes("invalid_string")) return "Informe um celular válido com DDD, usando 10 ou 11 números.";
  if (raw.includes("zipCode") || raw.includes("CEP com 8")) return "Confira o CEP informado. Ele deve ter 8 números.";
  return raw.startsWith("[") || raw.startsWith("{") ? "Confira os dados destacados e tente novamente." : raw;
}

type OverviewPayment = { id: string; amount: number; status: string; dueOn: string | null; paidAt: string | null; installmentNumber: number | null; installmentCount: number | null };

/** Resumo vivo da cobrança: quanto já foi pago, quanto falta e as próximas datas. */
function ChargeOverview({ payments, current, nextExpected }: { payments: OverviewPayment[]; current: OverviewPayment | null; nextExpected: { dueOn: string; amount: number } | null }) {
  const { t: ui } = useTranslation("ui");
  const valid = payments.filter((p) => p.status !== "cancelled");
  if (valid.length === 0) return null;
  const paid = valid.filter((p) => p.status === "paid");
  const paidTotal = paid.reduce((a, p) => a + p.amount, 0);
  const remaining = valid.filter((p) => OPEN.includes(p.status)).reduce((a, p) => a + p.amount, 0);
  const lastPaid = [...paid].sort((a, b) => String(a.paidAt ?? a.dueOn).localeCompare(String(b.paidAt ?? b.dueOn))).pop();
  const pct = Math.round((paid.length / valid.length) * 100);
  const multi = valid.length > 1;
  if (!multi && !lastPaid) return null;
  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{ui("Situação da cobrança")}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${paid.length === valid.length && !nextExpected ? "bg-primary/10 text-primary" : current?.status === "overdue" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
          {paid.length === valid.length && !nextExpected ? ui("Quitada") : current?.status === "overdue" ? ui("Em atraso") : ui("Em dia")}
        </span>
      </div>
      {multi ? (
        <>
          <div className="mt-4 flex items-baseline justify-between text-xs text-muted-foreground"><span>{paid.length} {ui("de")} {valid.length} {ui("pagas")}</span><span>{pct}%</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
        </>
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-muted-foreground">{ui("Total pago")}</dt><dd className="numeric-tabular font-semibold">{formatBRL(paidTotal)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{ui("Falta pagar")}</dt><dd className="numeric-tabular font-semibold">{formatBRL(remaining)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{ui("Último pagamento")}</dt><dd className="font-medium">{lastPaid ? formatDate(lastPaid.paidAt ?? lastPaid.dueOn) : "—"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{ui("Próximo vencimento")}</dt><dd className="font-medium">{current ? formatDate(current.dueOn) : nextExpected ? formatDate(nextExpected.dueOn) : "—"}</dd></div>
      </dl>
    </div>
  );
}

function ReceiptsButton({ token, payments }: { token: string; payments: OverviewPayment[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const fetchReceipt = useServerFn(getCheckoutReceipt);
  const paid = payments.filter((p) => p.status === "paid");
  if (!paid.length) return null;
  const download = async (id: string) => {
    setBusy(id);
    try {
      const r = await fetchReceipt({ data: { token, paymentId: id } });
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o recibo. Tente novamente.");
    } finally { setBusy(null); }
  };
  return (
    <>
      <Button type="button" variant="outline" className="w-full sm:w-auto sm:min-w-56" onClick={() => setOpen(true)}><FileText className="size-4" />Baixar recibo</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Seus recibos</DialogTitle><DialogDescription>Escolha o pagamento para baixar o recibo em PDF.</DialogDescription></DialogHeader>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {paid.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0"><p className="font-medium">{p.installmentCount ? `Parcela ${p.installmentNumber} de ${p.installmentCount}` : "Pagamento"} · <span className="numeric-tabular">{formatBRL(p.amount)}</span></p><p className="text-xs text-muted-foreground">Pago em {formatDate(p.paidAt ?? p.dueOn)}</p></div>
                <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void download(p.id)}>{busy === p.id ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}PDF</Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CouponBox({ token, paymentId, coupon, onChanged }: { token: string; paymentId: string; coupon: { code: string; discount: number } | null; onChanged: () => void }) {
  const { t: ui } = useTranslation("ui");
  const apply = useServerFn(applyCheckoutCoupon);
  const remove = useServerFn(removeCheckoutCoupon);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const key = () => `cp_${crypto.randomUUID().replace(/-/g, "")}`;
  const applyMut = useMutation({
    mutationFn: () => apply({ data: { token, paymentId, code, idempotencyKey: key() } }),
    onSuccess: () => { setError(null); setCode(""); setOpen(false); toast.success(ui("Cupom aplicado.")); onChanged(); },
    onError: (e: Error) => setError(ui(e.message)),
  });
  const removeMut = useMutation({
    mutationFn: () => remove({ data: { token, paymentId, idempotencyKey: key() } }),
    onSuccess: () => { toast.success(ui("Cupom removido.")); onChanged(); },
    onError: (e: Error) => toast.error(ui(e.message)),
  });

  if (coupon) {
    return (
      <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm animate-in fade-in slide-in-from-bottom-1">
        <span className="flex min-w-0 items-center gap-2"><TicketPercent className="size-4 shrink-0 text-primary" /><span className="truncate"><b className="font-mono">{coupon.code}</b> · <span className="numeric-tabular">−{formatBRL(coupon.discount)}</span></span></span>
        <Button size="sm" variant="ghost" onClick={() => removeMut.mutate()} disabled={removeMut.isPending} aria-label={ui("Remover cupom")}>{removeMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}</Button>
      </div>
    );
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"><TicketPercent className="size-4" />{ui("Tenho um cupom")}</button>;
  return (
    <form className="mt-6 space-y-2 animate-in fade-in slide-in-from-bottom-1" onSubmit={(e) => { e.preventDefault(); if (code.trim()) applyMut.mutate(); }}>
      <Label htmlFor="coupon-code">{ui("Cupom de desconto")}</Label>
      <div className="flex gap-2">
        <Input id="coupon-code" autoFocus autoComplete="off" maxLength={32} value={code} onChange={(e) => { setError(null); setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "")); }} className="font-mono uppercase" aria-invalid={Boolean(error)} aria-describedby={error ? "coupon-error" : undefined} />
        <Button type="submit" disabled={applyMut.isPending || !code.trim()}>{applyMut.isPending ? <Loader2 className="size-4 animate-spin" /> : ui("Aplicar")}</Button>
      </div>
      {error ? <p id="coupon-error" role="alert" className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
