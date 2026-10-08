import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEPLOY_CONFIG } from "@/lib/deploy-config";
import { embedCreateCharge, embedCreateContract, embedCreateService, embedOptions, startEmbedSession } from "@/lib/embed.functions";
import { formatBRL } from "@/lib/format";

type Kind = "contract" | "service" | "charge";
type Theme = "light" | "dark";
type Opts = Awaited<ReturnType<typeof embedOptions>>;
const ORIGINS: readonly string[] = DEPLOY_CONFIG.wiizeEmbedOrigins;

function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  document.documentElement.style.colorScheme = t;
}

/** Só identificadores e status; nunca dados pessoais. Enviado apenas para os endereços oficiais do Wiize. */
function notify(type: string, data: Record<string, unknown> = {}) {
  if (window.parent === window) return;
  for (const o of ORIGINS) {
    try { window.parent.postMessage({ source: "wiizepay", type, data }, o); } catch { /* origem diferente: ignorado */ }
  }
}

const selectCls = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";
const today = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

export function EmbedApp({ kind }: { kind: Kind }) {
  const start = useServerFn(startEmbedSession);
  const loadOpts = useServerFn(embedOptions);
  const [session, setSession] = useState<string | null>(null);
  const [info, setInfo] = useState<{ customer: { id: string; name: string } | null; companyName: string | null } | null>(null);
  const [opts, setOpts] = useState<Opts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const ticket = params.get("t");
    const th = params.get("theme");
    if (th === "light" || th === "dark") applyTheme(th);
    // Tira o passe do endereço na hora: não fica no histórico.
    window.history.replaceState(null, "", window.location.pathname);
    const onMsg = (e: MessageEvent) => {
      if (!ORIGINS.includes(e.origin) || e.source !== window.parent) return;
      const d = e.data as { type?: string; theme?: string } | null;
      if (d?.type === "wiizepay:theme.set" && (d.theme === "light" || d.theme === "dark")) applyTheme(d.theme);
    };
    window.addEventListener("message", onMsg);
    if (!ticket) { setError("Acesso expirado. Abra a janela novamente."); return; }
    start({ data: { ticket } })
      .then(async (r) => {
        if (r.kind !== kind) throw new Error("Acesso expirado. Abra a janela novamente.");
        applyTheme(r.theme);
        setSession(r.session);
        setInfo({ customer: r.customer, companyName: r.companyName });
        setOpts(await loadOpts({ data: { session: r.session } }));
        notify("wiizepay:ready", { kind });
      })
      .catch((e) => { setError(e instanceof Error ? e.message : "Acesso expirado. Abra a janela novamente."); notify("wiizepay:error", { kind }); });
    return () => window.removeEventListener("message", onMsg);
  }, [kind, start, loadOpts]);

  if (error) return <Shell><p className="text-sm text-destructive">{error}</p></Shell>;
  if (!session || !opts || !info) return <Shell><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Carregando...</div></Shell>;
  return (
    <Shell subtitle={info.customer ? `Cliente: ${info.customer.name}` : info.companyName}>
      {kind === "service" && <ServiceStep session={session} opts={opts} />}
      {kind === "contract" && <ContractStep session={session} opts={opts} />}
      {kind === "charge" && <ChargeStep session={session} opts={opts} />}
    </Shell>
  );
}

function Shell({ children, subtitle }: { children: ReactNode; subtitle?: string | null }) {
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <div className="mx-auto max-w-xl space-y-4">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">WiizePay</p>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </header>
        {children}
      </div>
    </main>
  );
}

function Pick({ title, items, onPick }: { title: string; items: { id: string; label: string; sub?: string }[]; onPick: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="max-h-56 space-y-2 overflow-auto">
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onPick(i.id)} className="w-full rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:bg-accent">
              <span className="font-medium">{i.label}</span>{i.sub && <span className="ml-2 text-muted-foreground">{i.sub}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Done({ text }: { text: string }) {
  return <p className="rounded-md border border-border bg-card p-3 text-sm">{text}</p>;
}

function ServiceStep({ session, opts }: { session: string; opts: Opts }) {
  const create = useServerFn(embedCreateService);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [type, setType] = useState<"one_time" | "installment" | "recurring">("one_time");
  const pick = (id: string) => { const s = opts.services.find((x) => x.id === id); notify("wiizepay:service.selected", { service_id: id, name: s?.name, amount_cents: s ? Math.round(Number(s.amount) * 100) : undefined, type: s?.type }); setDone(true); };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMsg(null);
    const f = new FormData(e.currentTarget);
    const methods = f.getAll("methods").map(String) as ("pix" | "boleto" | "credit_card" | "debit_card")[];
    setBusy(true);
    try {
      const r = await create({ data: { session, name: String(f.get("name") ?? ""), amount: Number(String(f.get("amount") ?? "").replace(",", ".")), type, installments: type === "installment" ? Number(f.get("installments") || 2) : null, methods } });
      notify("wiizepay:service.selected", { service_id: r.id, name: r.name, amount_cents: Math.round(r.amount * 100), type, created: true });
      setDone(true);
    } catch (err) { setMsg(err instanceof Error ? err.message : "Não foi possível criar o serviço."); } finally { setBusy(false); }
  }
  if (done) return <Done text="Serviço escolhido. Você já pode continuar no Wiize." />;
  return (
    <>
      <Pick title="Escolher serviço existente" items={opts.services.map((s) => ({ id: s.id, label: s.name, sub: formatBRL(Number(s.amount)) }))} onPick={pick} />
      <form onSubmit={submit} className="space-y-3 rounded-md border border-border bg-card p-3">
        <h2 className="text-sm font-semibold">Criar novo serviço</h2>
        <div className="space-y-1"><Label htmlFor="name">Nome</Label><Input id="name" name="name" required minLength={2} maxLength={160} /></div>
        <div className="space-y-1"><Label htmlFor="amount">Valor total (R$)</Label><Input id="amount" name="amount" required inputMode="decimal" /></div>
        <div className="space-y-1"><Label htmlFor="type">Tipo</Label>
          <select id="type" className={selectCls} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="one_time">À vista</option><option value="installment">Parcelado</option><option value="recurring">Recorrente (mensal)</option>
          </select></div>
        {type === "installment" && <div className="space-y-1"><Label htmlFor="installments">Parcelas</Label><Input id="installments" name="installments" type="number" min={2} max={24} defaultValue={2} /></div>}
        <fieldset className="space-y-1"><legend className="text-sm font-medium">Formas de pagamento</legend>
          {[["pix", "Pix"], ["boleto", "Boleto"], ["credit_card", "Cartão de crédito"]].map(([v, l]) => (
            <label key={v} className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" name="methods" value={v} defaultChecked={v === "pix"} />{l}</label>
          ))}
        </fieldset>
        {msg && <p className="text-sm text-destructive">{msg}</p>}
        <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="animate-spin" />}Criar serviço</Button>
      </form>
    </>
  );
}

function ContractStep({ session, opts }: { session: string; opts: Opts }) {
  const create = useServerFn(embedCreateContract);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const pick = (id: string) => { notify("wiizepay:contract.selected", { contract_id: id }); setDone(true); };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMsg(null);
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await create({ data: { session, title: String(f.get("title") ?? ""), serviceId: String(f.get("serviceId") ?? ""), startsOn: String(f.get("startsOn") ?? ""), endsOn: String(f.get("endsOn") || "") || null } });
      notify("wiizepay:contract.selected", { contract_id: r.id, created: true });
      setDone(true);
    } catch (err) { setMsg(err instanceof Error ? err.message : "Não foi possível criar o contrato."); } finally { setBusy(false); }
  }
  if (done) return <Done text="Contrato escolhido. A assinatura acontece no link de pagamento, antes do pagamento." />;
  return (
    <>
      <Pick title="Escolher contrato existente" items={opts.contracts.map((c) => ({ id: c.id, label: c.title, sub: formatBRL(Number(c.amount)) }))} onPick={pick} />
      <form onSubmit={submit} className="space-y-3 rounded-md border border-border bg-card p-3">
        <h2 className="text-sm font-semibold">Criar novo contrato</h2>
        <div className="space-y-1"><Label htmlFor="title">Título</Label><Input id="title" name="title" required minLength={2} maxLength={160} /></div>
        <div className="space-y-1"><Label htmlFor="serviceId">Serviço</Label>
          <select id="serviceId" name="serviceId" required className={selectCls}>
            <option value="">Selecione</option>
            {opts.services.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatBRL(Number(s.amount))}</option>)}
          </select></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="startsOn">Início</Label><Input id="startsOn" name="startsOn" type="date" required defaultValue={today()} /></div>
          <div className="space-y-1"><Label htmlFor="endsOn">Fim (opcional)</Label><Input id="endsOn" name="endsOn" type="date" /></div>
        </div>
        {msg && <p className="text-sm text-destructive">{msg}</p>}
        <Button type="submit" disabled={busy || !opts.services.length} className="w-full">{busy && <Loader2 className="animate-spin" />}Criar contrato</Button>
      </form>
    </>
  );
}

function ChargeStep({ session, opts }: { session: string; opts: Opts }) {
  const create = useServerFn(embedCreateCharge);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const requestId = useRef(crypto.randomUUID().replace(/-/g, ""));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMsg(null);
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await create({ data: { session, serviceId: String(f.get("serviceId") ?? ""), contractId: String(f.get("contractId") || "") || null, dueOn: String(f.get("dueOn") ?? ""), method: String(f.get("method") ?? "undefined") as "undefined", requestId: requestId.current } });
      notify("wiizepay:charge.created", { charge_group_id: r.chargeGroupId, checkout_url: r.checkoutUrl });
      setUrl(r.checkoutUrl);
    } catch (err) { setMsg(err instanceof Error ? err.message : "Não foi possível criar a cobrança."); } finally { setBusy(false); }
  }
  if (url) return <Done text="Cobrança criada. O link de pagamento já foi enviado para o Wiize." />;
  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-border bg-card p-3">
      <h2 className="text-sm font-semibold">Criar cobrança</h2>
      <div className="space-y-1"><Label htmlFor="serviceId">Serviço</Label>
        <select id="serviceId" name="serviceId" required className={selectCls}>
          <option value="">Selecione</option>
          {opts.services.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatBRL(Number(s.amount))}</option>)}
        </select></div>
      <div className="space-y-1"><Label htmlFor="contractId">Contrato (opcional)</Label>
        <select id="contractId" name="contractId" className={selectCls}>
          <option value="">Sem contrato</option>
          {opts.contracts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label htmlFor="dueOn">Vencimento</Label><Input id="dueOn" name="dueOn" type="date" required min={today()} defaultValue={today()} /></div>
        <div className="space-y-1"><Label htmlFor="method">Forma de pagamento</Label>
          <select id="method" name="method" className={selectCls} defaultValue="undefined">
            <option value="undefined">Cliente escolhe</option><option value="pix">Pix</option><option value="boleto">Boleto</option><option value="credit_card">Cartão de crédito</option>
          </select></div>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      <Button type="submit" disabled={busy || !opts.services.length} className="w-full">{busy && <Loader2 className="animate-spin" />}Criar cobrança</Button>
    </form>
  );
}
