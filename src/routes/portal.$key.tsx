import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowRight, CalendarClock, CheckCircle2, ChevronDown, Download, Eye, FileSignature, FileText, FolderOpen, Home, Image as ImageIcon, Loader2, LockKeyhole, LogOut, Mail, Receipt, ShieldCheck } from "lucide-react";
import { getPortalContractFile, getPortalData, getPortalDocument, getPortalInfo, getPortalInvoice, getPortalReceipt, portalLogin, portalLogout } from "@/lib/portal.functions";
import { CheckoutBrandHeader, checkoutAppearanceVars } from "@/components/checkout/checkout-presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/brand";
import { formatBRL, formatDate } from "@/lib/format";
import { paymentMethodLabels } from "@/lib/labels";
import { openFile } from "@/lib/contract-files-client";

export const Route = createFileRoute("/portal/$key")({
  loader: ({ params }) => getPortalInfo({ data: { key: params.key } }),
  head: () => ({
    meta: [
      { title: "Portal do cliente · WiizePay" },
      { name: "description", content: "Acesse seus recibos, contratos e documentos com segurança." },
      { property: "og:title", content: "Portal do cliente · WiizePay" },
      { property: "og:description", content: "Recibos, contratos e documentos em um só lugar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => <Centered title="Portal indisponível" text="Não foi possível abrir o portal agora. Tente novamente em instantes." />,
  notFoundComponent: () => <Centered title="Portal não encontrado" text="Confira o link recebido." />,
  component: PortalPage,
});

type Tab = "inicio" | "recibos" | "contratos" | "documentos";
const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "inicio", label: "Início", icon: Home },
  { id: "recibos", label: "Recibos", icon: Receipt },
  { id: "contratos", label: "Contratos", icon: FileSignature },
  { id: "documentos", label: "Documentos", icon: FolderOpen },
];

function Centered({ title, text }: { title: string; text: string }) {
  return <div className="grid min-h-screen place-items-center bg-background p-6 text-center"><div><h1 className="font-display text-xl font-semibold">{title}</h1><p className="mt-2 text-sm text-muted-foreground">{text}</p></div></div>;
}

function PortalPage() {
  const info = Route.useLoaderData();
  const { key } = Route.useParams();
  const storeKey = `wp-portal:${key}`;
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storeKey);
      const v = raw ? (JSON.parse(raw) as { token: string; expiresAt: string }) : null;
      if (v && new Date(v.expiresAt).getTime() > Date.now()) setToken(v.token); else sessionStorage.removeItem(storeKey);
    } catch { /* */ }
    setReady(true);
  }, [storeKey]);

  if (info.state !== "ok") return <Centered title="Portal não encontrado" text="Confira o link recebido." />;
  const appearance = info.appearance;

  const signOut = () => { try { sessionStorage.removeItem(storeKey); } catch { /* */ } setToken(null); };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground" style={checkoutAppearanceVars(appearance)}>
      <CheckoutBrandHeader appearance={appearance} />
      <main className="flex-1">
        {!ready ? <PortalLoading /> : token ? (
          <PortalHome portalKey={key} token={token} providerName={info.providerName} onExpired={() => { signOut(); toast.info("Sua sessão terminou. Entre novamente."); }} onSignOut={signOut} />
        ) : (
          <PortalLogin portalKey={key} providerName={info.providerName} onSuccess={(t, e) => { try { sessionStorage.setItem(storeKey, JSON.stringify({ token: t, expiresAt: e })); } catch { /* */ } setToken(t); }} />
        )}
      </main>
      <footer className={`checkout-panel border-t border-border px-4 py-1.5 text-center text-[11px] leading-tight text-muted-foreground/70 sm:pb-2 ${token ? "pb-[4.75rem]" : "pb-2"}`}>
        <span className="inline-flex items-center gap-1"><LockKeyhole className="size-2.5 shrink-0 text-primary/70" />Acesso protegido · Portal processado por <Brand className="ml-0.5 gap-1 align-middle [&>img]:size-3 [&>span]:text-[11px]" /></span>
      </footer>
    </div>
  );
}

function PortalLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <span className="relative grid size-14 place-items-center rounded-full bg-primary/10">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/15" />
          <LockKeyhole className="size-6 text-primary" />
        </span>
        <p className="text-sm text-muted-foreground">Abrindo seu portal com segurança…</p>
      </div>
    </div>
  );
}

function PortalLogin({ portalKey, providerName, onSuccess }: { portalKey: string; providerName: string; onSuccess: (token: string, expiresAt: string) => void }) {
  const login = useServerFn(portalLogin);
  const [email, setEmail] = useState("");
  const [doc, setDoc] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (doc.length !== 11 && doc.length !== 14) { setError("Digite o CPF (11 números) ou CNPJ (14 números) completo."); return; }
    setBusy(true);
    try { const r = await login({ data: { key: portalKey, email, doc } }); onSuccess(r.token, r.expiresAt); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível entrar. Tente novamente."); }
    finally { setBusy(false); }
  };
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-10 sm:py-16 lg:grid-cols-[1fr_420px] lg:items-center">
      <div className="hidden lg:block">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Portal do cliente</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">Tudo o que você contratou com {providerName}, em um só lugar.</h1>
        <ul className="mt-8 space-y-4 text-sm text-muted-foreground">
          {[[Receipt, "Recibos de todos os pagamentos em PDF"], [FileSignature, "Contratos assinados e todas as versões"], [FolderOpen, "Documentos enviados pela empresa"], [CalendarClock, "Próximas cobranças com pagamento rápido"]].map(([I, t]) => {
            const Icon = I as typeof Receipt;
            return <li key={t as string} className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-[var(--radius)] bg-primary/10"><Icon className="size-4 text-primary" /></span>{t as string}</li>;
          })}
        </ul>
      </div>
      <form onSubmit={submit} className="rounded-[calc(var(--radius)+6px)] border border-border bg-card p-6 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.35)] sm:p-8">
        <span className="grid size-11 place-items-center rounded-[var(--radius)] bg-primary/10"><ShieldCheck className="size-5 text-primary" /></span>
        <h2 className="mt-4 font-display text-xl font-semibold tracking-tight">Acessar portal do cliente</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use o e-mail cadastrado e o seu CPF ou CNPJ completo.</p>
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="portal-email">E-mail</Label>
            <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="portal-email" type="email" inputMode="email" autoComplete="email" required className="h-12 pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" /></div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="portal-doc">CPF ou CNPJ completo (só números)</Label>
            <Input id="portal-doc" inputMode="numeric" autoComplete="off" required maxLength={14} className="h-12 text-center font-mono text-lg tracking-[0.2em]" value={doc} onChange={(e) => setDoc(e.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="Somente números" />
          </div>
          {error ? <p role="alert" className="rounded-[var(--radius)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="h-12 w-full text-base" disabled={busy}>{busy ? <><Loader2 className="size-4 animate-spin" />Entrando…</> : <>Entrar<ArrowRight className="size-4" /></>}</Button>
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="size-3.5" />Sessão protegida, encerrada após 30 minutos.</p>
      </form>
    </div>
  );
}

type PortalData = Awaited<ReturnType<typeof getPortalData>>;

function PortalHome({ portalKey, token, providerName, onExpired, onSignOut }: { portalKey: string; token: string; providerName: string; onExpired: () => void; onSignOut: () => void }) {
  const fetchData = useServerFn(getPortalData);
  const logout = useServerFn(portalLogout);
  const [tab, setTab] = useState<Tab>("inicio");
  const q = useQuery({ queryKey: ["portal", portalKey, token], queryFn: () => Promise.race([
    fetchData({ data: { key: portalKey, token } }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000)),
  ]), retry: 1, networkMode: "always" });

  useEffect(() => { if (q.error && (q.error as Error).message.includes("session_expired")) onExpired(); }, [q.error]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  if (q.isPending && q.fetchStatus !== "idle") return <PortalLoading />;
  if (q.error || !q.data) return <div className="mx-auto max-w-md px-5 py-16 text-center"><p className="text-sm text-muted-foreground">Não foi possível carregar seu portal.</p><Button className="mt-4" variant="outline" onClick={() => void q.refetch()}>Tentar novamente</Button></div>;
  const d = q.data;
  const counts: Record<Tab, number> = { inicio: d.upcoming.length, recibos: d.paid.length, contratos: d.contracts.length, documentos: d.documents.length };
  const firstName = d.customerName.split(" ")[0];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-28 pt-6 sm:px-6 sm:pb-12 sm:pt-10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Portal do cliente</p>
          <h1 className="mt-1 truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">Olá, {firstName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Seus pagamentos e documentos com {providerName}.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { void logout({ data: { key: portalKey, token } }).catch(() => null); onSignOut(); }}><LogOut className="size-4" /><span className="hidden sm:inline">Sair</span></Button>
      </div>

      <nav aria-label="Seções do portal" className="mt-6 hidden gap-1 rounded-[calc(var(--radius)+4px)] border border-border bg-card p-1 sm:flex">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-2 rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
            <t.icon className="size-4" />{t.label}{counts[t.id] ? <span className={`rounded-full px-1.5 text-[11px] ${tab === t.id ? "bg-primary-foreground/20" : "bg-muted"}`}>{counts[t.id]}</span> : null}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "inicio" ? <HomeTab d={d} goTo={setTab} /> : null}
        {tab === "recibos" ? <ReceiptsTab portalKey={portalKey} token={token} items={d.paid} /> : null}
        {tab === "contratos" ? <ContractsTab portalKey={portalKey} token={token} items={d.contracts} /> : null}
        {tab === "documentos" ? <DocumentsTab portalKey={portalKey} token={token} items={d.documents} /> : null}
      </div>

      <nav aria-label="Seções do portal" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="grid grid-cols-4">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${tab === t.id ? "text-primary" : "text-muted-foreground"}`}>
              {tab === t.id ? <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary" /> : null}
              <t.icon className="size-5" />{t.label}
            </button>
          ))}
        </div>
      </nav>
      <ScrollHint />
    </div>
  );
}

function ScrollHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const check = () => setShow(document.documentElement.scrollHeight - window.innerHeight - window.scrollY > 120);
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const id = window.setInterval(check, 800);
    return () => { window.removeEventListener("scroll", check); window.removeEventListener("resize", check); window.clearInterval(id); };
  }, []);
  if (!show) return null;
  return <span aria-hidden className="pointer-events-none fixed bottom-20 right-4 z-30 grid size-9 animate-bounce place-items-center rounded-full border border-border bg-card shadow-md sm:bottom-6"><ArrowDown className="size-4 text-primary" /></span>;
}

function Section({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-[calc(var(--radius)+6px)] border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div><h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>{description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ icon: Icon, title, text }: { icon: typeof Home; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primary/10"><Icon className="size-5 text-primary" /></span>
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

const installment = (p: { installmentNumber: number | null; installmentCount: number | null }) => p.installmentCount ? `Parcela ${p.installmentNumber} de ${p.installmentCount}` : null;

function HomeTab({ d, goTo }: { d: PortalData; goTo: (t: Tab) => void }) {
  const next = d.upcoming[0];
  const totalPaid = d.paid.reduce((a, p) => a + p.amount, 0);
  return (
    <div className="space-y-5">
      {next ? (
        <div className="overflow-hidden rounded-[calc(var(--radius)+6px)] border border-border bg-card">
          <div className="p-5 sm:p-6">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><CalendarClock className="size-4 text-primary" />{next.status === "overdue" ? "Cobrança em atraso" : "Próxima cobrança"}</p>
            <p className="mt-2 font-display text-3xl font-semibold tracking-tight numeric-tabular">{formatBRL(next.amount)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{next.description}{installment(next) ? ` · ${installment(next)}` : ""} · vence em {formatDate(next.dueOn)}</p>
          </div>
          {next.payToken ? (
            <a href={`/pagar/${next.payToken}`} className="flex items-center justify-between border-t border-border bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground sm:px-6">Pagar agora<ArrowRight className="size-4" /></a>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-[calc(var(--radius)+6px)] border border-border bg-card p-5"><span className="grid size-10 place-items-center rounded-full bg-primary/10"><CheckCircle2 className="size-5 text-primary" /></span><div><p className="font-medium">Tudo em dia</p><p className="text-sm text-muted-foreground">Você não tem cobranças em aberto.</p></div></div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["recibos", Receipt, "Recibos", d.paid.length], ["contratos", FileSignature, "Contratos", d.contracts.length], ["documentos", FolderOpen, "Documentos", d.documents.length]] as const).map(([id, Icon, label, n]) => (
          <button key={id} type="button" onClick={() => goTo(id)} className="flex flex-col items-start gap-3 rounded-[calc(var(--radius)+4px)] border border-border bg-card p-4 text-left transition-colors hover:border-primary/50">
            <span className="grid size-9 place-items-center rounded-[var(--radius)] bg-primary/10"><Icon className="size-4 text-primary" /></span>
            <span><span className="block font-display text-xl font-semibold numeric-tabular">{n}</span><span className="text-xs text-muted-foreground">{label}</span></span>
          </button>
        ))}
        <div className="col-span-2 flex flex-col justify-between gap-3 rounded-[calc(var(--radius)+4px)] border border-border bg-card p-4 sm:col-span-1">
          <span className="grid size-9 place-items-center rounded-[var(--radius)] bg-primary/10"><CheckCircle2 className="size-4 text-primary" /></span>
          <span><span className="block font-display text-xl font-semibold numeric-tabular">{formatBRL(totalPaid)}</span><span className="text-xs text-muted-foreground">Total pago</span></span>
        </div>
      </div>

      {d.upcoming.length > 1 ? (
        <Section title="Cobranças em aberto">
          <ul className="divide-y divide-border">
            {d.upcoming.slice(1).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{p.description}</p><p className="text-xs text-muted-foreground">{installment(p) ? `${installment(p)} · ` : ""}{formatDate(p.dueOn)}</p></div>
                <div className="flex shrink-0 items-center gap-3"><span className="text-sm font-semibold numeric-tabular">{formatBRL(p.amount)}</span>{p.payToken ? <Button asChild size="sm" variant="outline"><a href={`/pagar/${p.payToken}`}>Pagar</a></Button> : null}</div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {d.paid.length ? (
        <Section title="Pagamentos recentes" action={<button type="button" onClick={() => goTo("recibos")} className="text-xs font-medium text-primary">Ver recibos</button>}>
          <ul className="divide-y divide-border">
            {d.paid.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3"><CheckCircle2 className="size-4 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate text-sm font-medium">{p.description}</p><p className="text-xs text-muted-foreground">Pago em {formatDate(p.paidAt ?? p.dueOn)}</p></div></div>
                <span className="shrink-0 text-sm font-semibold numeric-tabular">{formatBRL(p.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

function useDownloader() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<{ base64: string; fileName: string; mime?: string }>, view = false) => {
    const target = view ? window.open("", "_blank") : null;
    setBusy(id);
    try { const r = await fn(); openFile(r.base64, r.fileName, r.mime ?? "application/pdf", target); }
    catch (e) { try { target?.close(); } catch { /* */ } toast.error(e instanceof Error && !e.message.includes("session_expired") ? e.message : "Não foi possível abrir o arquivo. Tente novamente."); }
    finally { setBusy(null); }
  };
  return { busy, run };
}

function ReceiptsTab({ portalKey, token, items }: { portalKey: string; token: string; items: PortalData["paid"] }) {
  const get = useServerFn(getPortalReceipt);
  const getInvoice = useServerFn(getPortalInvoice);
  const { busy, run } = useDownloader();
  return (
    <Section title="Recibos e notas fiscais" description="Baixe o recibo de cada pagamento confirmado e, quando emitida, a nota fiscal para o seu controle.">
      {items.length ? (
        <ul className="divide-y divide-border">
          {items.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius)] bg-primary/10"><Receipt className="size-4 text-primary" /></span>
                <div className="min-w-0"><p className="truncate text-sm font-medium">{p.description}</p><p className="text-xs text-muted-foreground">{formatBRL(p.amount)} · {formatDate(p.paidAt ?? p.dueOn)}{p.method ? ` · ${paymentMethodLabels[p.method as keyof typeof paymentMethodLabels] ?? ""}` : ""}{installment(p) ? ` · ${installment(p)}` : ""}</p></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="outline" disabled={busy !== null} aria-label="Baixar recibo" onClick={() => void run(p.id, () => get({ data: { key: portalKey, token, paymentId: p.id } }))}>
                  {busy === p.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}<span className="hidden sm:inline">Recibo</span>
                </Button>
                {p.invoice ? (
                  <Button size="sm" variant="outline" disabled={busy !== null} aria-label="Baixar nota fiscal" onClick={() => { const inv = p.invoice!; void run(inv.id, () => getInvoice({ data: { key: portalKey, token, invoiceId: inv.id } })); }}>
                    {busy === p.invoice.id ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}<span className="hidden sm:inline">Nota fiscal</span>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty icon={Receipt} title="Nenhum recibo ainda" text="Assim que um pagamento for confirmado, o recibo aparece aqui." />}
    </Section>
  );
}

function ContractsTab({ portalKey, token, items }: { portalKey: string; token: string; items: PortalData["contracts"] }) {
  const get = useServerFn(getPortalContractFile);
  const { busy, run } = useDownloader();
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);
  if (!items.length) return <Section title="Contratos"><Empty icon={FileSignature} title="Nenhum contrato" text="Os contratos assinados com a empresa aparecem aqui." /></Section>;
  return (
    <div className="space-y-3">
      {items.map((c) => {
        const expanded = open === c.id;
        return (
          <div key={c.id} className="overflow-hidden rounded-[calc(var(--radius)+6px)] border border-border bg-card">
            <button type="button" onClick={() => setOpen(expanded ? null : c.id)} className="flex w-full items-center gap-3 px-5 py-4 text-left" aria-expanded={expanded}>
              <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius)] bg-primary/10"><FileSignature className="size-4 text-primary" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{c.title}</span>
                <span className="text-xs text-muted-foreground">{c.status === "signed" ? `Assinado${c.signedAt ? ` em ${formatDate(c.signedAt)}` : ""}` : "Aguardando assinatura"} · versão {c.currentVersion}</span></span>
              <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded ? (
              <ul className="divide-y divide-border border-t border-border">
                {c.versions.length ? c.versions.map((v) => (
                  <li key={v.version} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <span className="text-sm">Versão {v.version}{v.version === c.currentVersion ? <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Atual</span> : null}</span>
                    <span className="flex gap-2">
                      {v.signed ? <Button size="sm" disabled={busy !== null} onClick={() => void run(`${c.id}-${v.version}-s`, () => get({ data: { key: portalKey, token, contractId: c.id, version: v.version, kind: "signed" } }))}>{busy === `${c.id}-${v.version}-s` ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}Assinado</Button> : null}
                      {v.original ? <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run(`${c.id}-${v.version}-o`, () => get({ data: { key: portalKey, token, contractId: c.id, version: v.version, kind: "original" } }))}>{busy === `${c.id}-${v.version}-o` ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}Original</Button> : null}
                    </span>
                  </li>
                )) : <li className="px-5 py-4 text-sm text-muted-foreground">Os arquivos deste contrato ficam disponíveis após a assinatura.</li>}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const sizeLabel = (n: number) => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

function DocumentsTab({ portalKey, token, items }: { portalKey: string; token: string; items: PortalData["documents"] }) {
  const get = useServerFn(getPortalDocument);
  const { busy, run } = useDownloader();
  if (!items.length) return <Section title="Documentos"><Empty icon={FolderOpen} title="Nenhum documento" text="Quando a empresa compartilhar um arquivo com você, ele aparece aqui." /></Section>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((d) => {
        const viewable = d.mime === "application/pdf" || d.mime.startsWith("image/");
        const Icon = d.mime.startsWith("image/") ? ImageIcon : FileText;
        return (
          <div key={d.id} className="flex flex-col gap-4 rounded-[calc(var(--radius)+6px)] border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius)] bg-primary/10"><Icon className="size-4 text-primary" /></span>
              <div className="min-w-0"><p className="text-sm font-semibold">{d.title}</p><p className="text-xs text-muted-foreground">{sizeLabel(d.size)} · {formatDate(d.createdAt)}</p></div>
            </div>
            <Button className="h-11 w-full" disabled={busy !== null} onClick={() => void run(d.id, () => get({ data: { key: portalKey, token, id: d.id } }), viewable)}>
              {busy === d.id ? <Loader2 className="size-4 animate-spin" /> : viewable ? <Eye className="size-4" /> : <Download className="size-4" />}{d.buttonLabel}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
