import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Building2, CalendarDays, Check, CreditCard, ImageUp, Link2, Mail, Phone,
  Loader2, LockKeyhole, Monitor, Palette, QrCode, ReceiptText, RotateCcw, ShieldCheck,
  Smartphone, Sparkles, Trash2, UploadCloud,
} from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ErrorState, ListSkeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { checkoutAppearanceVars } from "@/components/checkout/checkout-presentation";
import { FinancialIdentity } from "@/components/financial-provider";
import {
  discardCheckoutLogo, getCheckoutAppearance, importCheckoutLogo, saveCheckoutAppearance, uploadCheckoutLogo,
} from "@/lib/checkout-appearance.functions";
import { contrastIssues, DEFAULT_APPEARANCE, headerTextColors, readableOn, THEMES, withBrandColor, type CheckoutAppearance } from "@/lib/checkout-appearance";

export const Route = createFileRoute("/_authenticated/checkout-personalizado")({
  head: () => ({
    meta: [
      { title: "Marca e Checkout — Wiize Core" },
      { name: "description", content: "Configure sua marca e personalize o checkout dos seus clientes." },
      { property: "og:title", content: "Marca e Checkout — Wiize Core" },
      { property: "og:description", content: "Logo, cores e textos do seu checkout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Page,
});

const COLOR_FIELDS: { key: "background" | "header" | "surface" | "button" | "buttonText" | "text" | "mutedText"; label: string; hint: string }[] = [
  { key: "background", label: "Fundo da página", hint: "Toda a área atrás dos cartões" },
  { key: "header", label: "Cabeçalho", hint: "Faixa do topo com a logo" },
  { key: "surface", label: "Superfícies", hint: "Cartões e caixas de pagamento" },
  { key: "button", label: "Fundo do botão", hint: "Ações e destaques" },
  { key: "buttonText", label: "Texto do botão", hint: "Texto sobre a ação" },
  { key: "text", label: "Texto principal", hint: "Títulos e valores" },
  { key: "mutedText", label: "Texto secundário", hint: "Detalhes e apoio" },
];
const ISSUE: Record<string, string> = { text: "Texto principal", mutedText: "Texto secundário", buttonText: "Texto do botão", background: "Fundo da página" };
const THEME_NAMES = {
  wiize: { name: "Wiize Core", description: "Verde preciso e fundo suave" },
  clean: { name: "Minimalista", description: "Branco e alto contraste" },
  dark: { name: "Escuro", description: "Elegante e confortável" },
} as const;

function hasTransparency(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  const size = 80;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(image, 0, 0, size, size);
  return context.getImageData(0, 0, size, size).data.some((value, index) => index % 4 === 3 && value < 250);
}

async function optimizeLogo(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error("Envie uma imagem PNG, JPG ou WebP.");
  if (file.size > 10 * 1024 * 1024) throw new Error("A imagem original deve ter no máximo 10 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível ler esta imagem."));
      element.src = objectUrl;
    });
    if (image.width < 64 || image.height < 32) throw new Error("A logo precisa ter pelo menos 64×32 pixels.");
    if (image.width / image.height > 10 || image.height / image.width > 2) throw new Error("Use uma logo horizontal ou quadrada.");
    const scale = Math.min(1, 1600 / image.width, 800 / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível otimizar a imagem.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const contentType = hasTransparency(image) ? "image/png" : "image/webp";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, contentType, 0.88));
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error("Não foi possível reduzir a logo para um tamanho seguro.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { contentType, base64: btoa(binary) };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function Page() {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const location = useLocation();
  const [section, setSection] = useState("marca");
  useEffect(() => { setSection(location.hash === "checkout" ? "checkout" : "marca"); }, [location.hash]);
  const fetchFn = useServerFn(getCheckoutAppearance);
  const saveFn = useServerFn(saveCheckoutAppearance);
  const uploadFn = useServerFn(uploadCheckoutLogo);
  const importFn = useServerFn(importCheckoutLogo);
  const discardFn = useServerFn(discardCheckoutLogo);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["checkout-appearance"], queryFn: () => fetchFn() });
  const [a, setA] = useState<CheckoutAppearance>(DEFAULT_APPEARANCE);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [logoUrlInput, setLogoUrlInput] = useState("");
  const savedLogoPath = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    setA(data.appearance);
    savedLogoPath.current = data.appearance.logoPath;
  }, [data]);

  const set = <K extends keyof CheckoutAppearance>(key: K, value: CheckoutAppearance[K]) => setA((previous) => ({ ...previous, [key]: value }));
  const issues = contrastIssues(a);

  async function discardDraft(path: string | null) {
    if (path && path !== savedLogoPath.current) await discardFn({ data: { logoPath: path } }).catch(() => undefined);
  }

  const save = useMutation({
    mutationFn: () => saveFn({ data: a }),
    onSuccess: (result) => {
      savedLogoPath.current = a.logoPath;
      toast.success(`Aparência salva (versão ${result.version}). Vale para as novas cobranças.`);
      void qc.invalidateQueries({ queryKey: ["checkout-appearance"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => uploadFn({ data: await optimizeLogo(file) }),
    onSuccess: async (result) => {
      await discardDraft(a.logoPath);
      setA((previous) => ({ ...previous, logoPath: result.logoPath, logoUrl: result.logoUrl }));
      toast.success("Logo otimizada e enviada. Salve para aplicar.");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const importLogo = useMutation({
    mutationFn: () => importFn({ data: { url: logoUrlInput.trim() } }),
    onSuccess: async (result) => {
      await discardDraft(a.logoPath);
      setA((previous) => ({ ...previous, logoPath: result.logoPath, logoUrl: result.logoUrl }));
      setLogoUrlInput("");
      toast.success("Logo importada. Salve para aplicar.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (isLoading) return <ListSkeleton />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;
  const disabled = !data.canEdit;
  const busyLogo = upload.isPending || importLogo.isPending;

  return (
    <div className="space-y-6">
      <PageHeader title={ui("Aparência")} description={ui("Sua marca e seu checkout, organizados em um só lugar.")} />
      <Tabs value={section} onValueChange={setSection}><TabsList aria-label={ui("Aparência")}><TabsTrigger value="marca"><Building2 className="mr-2 size-4" />{ui("Marca")}</TabsTrigger><TabsTrigger value="checkout"><CreditCard className="mr-2 size-4" />{ui("Checkout")}</TabsTrigger></TabsList></Tabs>
      {disabled ? <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Somente dono ou administrador pode alterar a aparência.</p> : null}
      <div className={`grid items-start gap-6 ${section === "checkout" ? "2xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]" : "mx-auto w-full max-w-3xl"}`}>
        <fieldset disabled={disabled} className="space-y-5">
          <div hidden={section !== "checkout"}><EditorSection icon={Sparkles} title="Estilo do checkout" description="Comece com um tema e refine os detalhes.">
            <div className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((theme) => {
                const selected = a.theme === theme;
                return (
                  <button key={theme} type="button" aria-pressed={selected} onClick={() => setA((previous) => ({ ...previous, theme, ...THEMES[theme] }))}
                    className={`group relative flex flex-col gap-2.5 rounded-lg border bg-card p-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-primary shadow-md ring-2 ring-primary/20" : "border-border"}`}>
                    <ThemeThumb colors={THEMES[theme]} />
                    {selected ? <span className="absolute right-3.5 top-3.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow"><Check className="size-3" /></span> : null}
                    <span className="px-1 pb-0.5"><span className="block text-xs font-semibold">{THEME_NAMES[theme].name}</span><span className="block text-[10px] text-muted-foreground">{THEME_NAMES[theme].description}</span></span>
                  </button>
                );
              })}
            </div>
          </EditorSection>

          </div>
          <div hidden={section !== "marca"}><EditorSection icon={Building2} title={ui("Marca")} description={ui("Sua logo e cor principal identificam sua empresa no checkout e na prévia dos avisos.")}>
            <div className="overflow-hidden rounded-lg border border-border">
              <div data-testid="brand-background-preview" className="flex min-h-52 items-center justify-center px-6 py-10 transition-colors motion-reduce:transition-none" style={{ background: a.brandColor }}>
                {a.logoUrl ? <img src={a.logoUrl} alt="Logo da empresa" className="max-h-24 max-w-full object-contain sm:max-w-[320px]" /> : <Brand size="lg" color={readableOn(a.brandColor)} accentColor={readableOn(a.brandColor)} />}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-background px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3"><Palette className="size-4 shrink-0 text-muted-foreground" /><Label htmlFor="brand-color" className="text-sm font-semibold">{ui("Cor principal da marca")}</Label></div>
                <label className="relative flex h-11 cursor-pointer items-center gap-3 overflow-hidden rounded-md border border-border bg-card px-3 transition-colors hover:border-primary focus-within:ring-2 focus-within:ring-ring">
                  <span className="size-6 rounded border border-border" style={{ background: a.brandColor }} />
                  <span className="font-mono text-xs uppercase">{a.brandColor}</span>
                  <input id="brand-color" type="color" value={a.brandColor} onChange={(event) => setA((previous) => withBrandColor(previous, event.target.value))} className="absolute inset-0 size-full cursor-pointer opacity-0" />
                </label>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button asChild variant="outline" className="h-10"><label className="cursor-pointer"><UploadCloud className="size-4" />{upload.isPending ? "Otimizando…" : "Enviar imagem"}<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }} /></label></Button>
              <Button type="button" variant="outline" className="h-10" disabled={!a.logoPath || busyLogo} onClick={() => { void discardDraft(a.logoPath); setA((previous) => ({ ...previous, logoPath: null, logoUrl: null })); }}><Trash2 className="size-4" />Remover logo</Button>
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG ou WebP até 10 MB. A imagem é reduzida antes do envio.</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1"><Link2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={logoUrlInput} onChange={(event) => setLogoUrlInput(event.target.value)} placeholder="https://seusite.com/logo.png" className="pl-9" /></div>
              <Button type="button" variant="secondary" disabled={!logoUrlInput.trim() || busyLogo} onClick={() => importLogo.mutate()}>{importLogo.isPending ? <Loader2 className="size-4 animate-spin" /> : "Importar"}</Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([['logo', 'Só logo'], ['logo_name', 'Logo + nome'], ['name', 'Só nome']] as const).map(([value, label]) => (
                <Button key={value} type="button" size="sm" variant={a.logoMode === value ? "default" : "outline"} onClick={() => set("logoMode", value)}>{label}</Button>
              ))}
            </div>
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs leading-5 text-muted-foreground">{ui("A cor principal também é aplicada aos botões do checkout. Os demais detalhes ficam na aba Checkout.")}</p>
              <p className="text-xs leading-5 text-muted-foreground">{ui("E-mails enviados pelo Asaas mantêm a aparência do provedor. Salvar aqui não altera a marca desses e-mails.")}</p>
            </div>
          </EditorSection></div>
          <div hidden={section !== "checkout"} className="space-y-5"><EditorSection icon={Palette} title={ui("Cores do checkout")} description="Clique em qualquer faixa para escolher a cor.">
            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map((field) => (
                <label key={field.key} className="group relative min-h-24 cursor-pointer overflow-hidden rounded-lg border border-border p-3 transition-colors hover:border-primary/60" style={{ background: a[field.key] }}>
                  <input type="color" aria-label={field.label} value={a[field.key]} onChange={(event) => set(field.key, event.target.value.toUpperCase())} className="absolute inset-0 size-full cursor-pointer opacity-0" />
                  <span className="pointer-events-none flex h-full flex-col justify-between" style={{ color: readableOn(a[field.key]) }}>
                    <span><span className="block text-sm font-semibold">{field.label}</span><span className="block text-[11px] opacity-75">{field.hint}</span></span>
                    <span className="self-end rounded bg-background/80 px-2 py-1 font-mono text-[11px] text-foreground backdrop-blur-sm">{a[field.key]}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="space-y-2"><div className="flex justify-between text-xs"><Label htmlFor="checkout-radius">Arredondamento</Label><span className="text-muted-foreground">{a.radius}px</span></div><input id="checkout-radius" type="range" min={0} max={24} value={a.radius} onChange={(event) => set("radius", Number(event.target.value))} className="w-full accent-primary" /></div>
            {issues.length ? <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Baixo contraste em: {issues.map((issue) => ISSUE[issue]).join(", ")}.</p> : <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" />Contraste aprovado para uma leitura segura.</p>}
          </EditorSection>

          <EditorSection icon={ReceiptText} title="Mensagem e suporte" description="Mostre ao cliente como falar com a sua equipe.">
            <Field label="Mensagem de suporte" value={a.supportText} max={120} placeholder="Precisa de ajuda? Fale com a nossa equipe." onChange={(value) => set("supportText", value)} />
            <div className="grid gap-3 sm:grid-cols-2"><Field label="E-mail de suporte" value={a.supportEmail} max={120} placeholder="contato@suaempresa.com.br" onChange={(value) => set("supportEmail", value)} /><Field label="Telefone" value={a.supportPhone} max={20} placeholder="(11) 99999-9999" onChange={(value) => set("supportPhone", value)} /></div>
          </EditorSection>

        </div></fieldset>

        {section === "checkout" ? <div className="space-y-4 2xl:sticky 2xl:top-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold">Prévia do checkout real</h2><span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">Simulação</span></div><p className="text-xs text-muted-foreground">Simula a aparência do checkout real. Nenhuma cobrança ou pagamento é criado.</p></div><div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1"><Button size="sm" variant={device === "desktop" ? "default" : "ghost"} onClick={() => setDevice("desktop")}><Monitor className="size-4" />Computador</Button><Button size="sm" variant={device === "mobile" ? "default" : "ghost"} onClick={() => setDevice("mobile")}><Smartphone className="size-4" />Celular</Button></div></div>
          <Preview a={a} device={device} company={data.companyName} />
        </div> : null}
      </div>
      <div className={section === "marca" ? "mx-auto w-full max-w-3xl" : ""}>
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">{ui("Versão atual")}: {data.version || ui("padrão")}. {ui("A nova aparência vale para as cobranças criadas depois de salvar. Cobranças já criadas mantêm a aparência da época em que foram geradas.")}</p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" disabled={disabled || save.isPending || busyLogo} onClick={() => setA(DEFAULT_APPEARANCE)}><RotateCcw className="size-4" />Restaurar padrão</Button>
              <Button onClick={() => save.mutate()} disabled={disabled || save.isPending || busyLogo || issues.length > 0}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Salvar aparência</Button>
            </div>
          </div>
      </div>
    </div>
  );
}

/** Miniatura fiel do checkout: cabeçalho, resumo, cartão de pagamento e botão nas cores do tema. */
function ThemeThumb({ colors: c }: { colors: (typeof THEMES)[keyof typeof THEMES] }) {
  const line = (color: string, width: string, height = 3, opacity = 1) => <span className="block rounded-full" style={{ background: color, width, height, opacity }} />;
  const r = Math.max(2, Math.round(c.radius / 3));
  const border = `color-mix(in srgb, ${c.text} 12%, ${c.background})`;
  return (
    <span aria-hidden="true" className="relative block aspect-[16/10] max-h-40 w-full overflow-hidden rounded-md shadow-inner" style={{ background: c.background, border: `1px solid ${border}` }}>
      <span className="flex h-[18%] items-center justify-between px-2" style={{ background: c.header, borderBottom: `1px solid ${border}` }}>
        <span className="flex items-center gap-1"><span className="size-2 rounded-[3px]" style={{ background: c.button }} />{line(contrastOn(c.header, c.text), "18px", 3)}</span>
        {line(contrastOn(c.header, c.mutedText), "14px", 2, 0.7)}
      </span>
      <span className="grid h-[82%] grid-cols-[0.9fr_1.1fr]">
        <span className="flex flex-col gap-1 p-2" style={{ background: `color-mix(in srgb, ${c.background} 96%, ${c.text} 4%)`, borderRight: `1px solid ${border}` }}>
          {line(c.button, "40%", 2)}
          {line(c.text, "70%", 3)}
          <span className="mt-1 block">{line(c.text, "85%", 6)}</span>
          <span className="mt-auto flex items-center gap-1 p-1" style={{ background: c.surface, borderRadius: r, border: `1px solid ${border}` }}><span className="size-1.5 rounded-sm" style={{ background: c.button, opacity: 0.6 }} />{line(c.mutedText, "60%", 2)}</span>
        </span>
        <span className="flex flex-col gap-1 p-2">
          {line(c.text, "55%", 3)}
          {line(c.mutedText, "75%", 2, 0.8)}
          <span className="mt-1 flex flex-1 flex-col justify-end gap-1 p-1.5" style={{ background: c.surface, borderRadius: r, border: `1px solid ${border}`, boxShadow: "0 4px 10px -6px rgb(0 0 0 / 0.25)" }}>
            <span className="flex items-center gap-1.5"><span className="aspect-square h-[38%] min-h-3 rounded-[3px]" style={{ background: c.button }} /><span className="flex flex-1 flex-col gap-1">{line(c.text, "55%", 2.5)}{line(c.mutedText, "80%", 2, 0.8)}</span></span>
            <span className="flex-1" />
            <span className="block h-1.5 rounded-sm" style={{ background: `color-mix(in srgb, ${c.surface} 90%, ${c.text} 10%)` }} />
            <span className="grid h-2.5 place-items-center" style={{ background: c.button, borderRadius: Math.max(1, r - 1) }}>{line(c.buttonText, "40%", 1.5, 0.9)}</span>
          </span>
        </span>
      </span>
    </span>
  );
}

function contrastOn(background: string, preferred: string) {
  return headerTextColors({ header: background, text: preferred, mutedText: preferred }).text;
}

function EditorSection({ icon: Icon, title, description, children }: { icon: typeof Palette; title: string; description: string; children: React.ReactNode }) {
  return <section className="space-y-4 rounded-lg border border-border bg-card p-5"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span><div><h2 className="font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div></div>{children}</section>;
}

function Field({ label, value, onChange, max, placeholder, multiline }: { label: string; value: string | null; onChange: (value: string | null) => void; max: number; placeholder?: string; multiline?: boolean }) {
  const common = { value: value ?? "", maxLength: max, placeholder, onChange: (event: { target: { value: string } }) => onChange(event.target.value || null) };
  return <div className="space-y-1.5"><div className="flex justify-between"><Label className="text-xs">{label}</Label><span className="text-[11px] text-muted-foreground">{(value ?? "").length}/{max}</span></div>{multiline ? <Textarea rows={2} {...common} /> : <Input {...common} />}</div>;
}

function Preview({ a, device, company }: { a: CheckoutAppearance; device: "desktop" | "mobile"; company: string }) {
  const mobile = device === "mobile";
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/30 p-2 sm:p-4">
      <div data-testid="checkout-live-preview" className={`mx-auto overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg transition-[max-width] duration-300 ${mobile ? "max-w-[390px]" : "max-w-[1080px]"}`} style={checkoutAppearanceVars(a)}>
        <PreviewHeader appearance={a} company={company} compact={mobile} />
        <main className={mobile ? "" : "grid min-h-[560px] grid-cols-[0.9fr_1.1fr]"}>
          <PreviewSummary compact={mobile} company={company} />
          <PreviewCheckoutBody compact={mobile} appearance={a} />
        </main>
        <footer className="checkout-panel border-t border-border px-5 py-5"><FinancialIdentity background={a.background} /></footer>
      </div>
    </div>
  );
}

function PreviewHeader({ appearance, company, compact }: { appearance: CheckoutAppearance; company: string; compact: boolean }) {
  const showLogo = appearance.logoUrl && appearance.logoMode !== "name";
  return <header className="checkout-header flex h-16 items-center justify-between gap-3 border-b border-border px-5 sm:px-7"><div className="flex min-w-0 items-center gap-2.5">{showLogo ? <img src={appearance.logoUrl ?? undefined} alt="Logo da empresa" className="h-9 max-w-36 object-contain" /> : null}{appearance.logoMode !== "logo" || !showLogo ? <strong className="truncate font-display text-base">{company}</strong> : null}</div><span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><ShieldCheck className="size-4 text-primary" />{compact ? "Seguro" : "Pagamento seguro"}</span></header>;
}

function PreviewSummary({ compact, company }: { compact: boolean; company: string }) {
  return <aside className={`checkout-panel ${compact ? "p-6" : "p-10 lg:p-12"}`}><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Pagamento para</p><h3 className="mt-2 font-display text-2xl font-semibold">{company}</h3><p className="mt-1 text-sm text-muted-foreground">Consultoria estratégica</p><div className={compact ? "mt-6" : "mt-10"}><p className="text-xs text-muted-foreground">Valor a pagar</p><p className={`numeric-tabular mt-1 font-display font-bold ${compact ? "text-4xl" : "text-6xl"}`}>R$ 950,00</p></div><div className={`flex items-start gap-3 rounded-lg border border-border bg-card p-4 ${compact ? "mt-6" : "mt-9"}`}><span className="grid size-9 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><CalendarDays className="size-4" /></span><div><p className="text-xs text-muted-foreground">Vencimento</p><p className="text-sm font-semibold">10 de outubro</p></div></div></aside>;
}

function PreviewCheckoutBody({ compact, appearance }: { compact: boolean; appearance: CheckoutAppearance }) {
  return <section className={`flex min-w-0 flex-col border-border bg-background ${compact ? "border-t p-6" : "border-l p-10 lg:p-12"}`}><div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground"><span className="grid size-6 place-items-center rounded-md bg-accent text-accent-foreground"><Check className="size-3.5" /></span><span>Dados confirmados</span><span className="h-px flex-1 bg-border" /><span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground"><CreditCard className="size-3.5" /></span><span className="text-primary">Pagamento</span></div><div className={compact ? "mt-7" : "mt-10"}><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Pagamento</p><h3 className="mt-2 font-display text-2xl font-semibold">Pague com Pix</h3><p className="mt-1 text-sm text-muted-foreground">Pagamento rápido e confirmação automática.</p></div><div className={`mt-6 rounded-lg border border-border bg-card shadow-sm ${compact ? "p-5" : "p-6"}`}><div className="flex items-center gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><QrCode className="size-6" /></span><div><p className="font-semibold">Pix</p><p className="text-xs text-muted-foreground">Copie o código ou escaneie para pagar</p></div></div><div className="mt-6 grid grid-cols-[1fr_auto] gap-2"><span className="h-11 rounded-md border border-border bg-muted" /><span className="grid size-11 place-items-center rounded-md border border-border text-muted-foreground"><LockKeyhole className="size-4" /></span></div><div className="mt-3 flex h-12 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground">Copiar código Pix</div></div><div className="mt-auto border-t border-border pt-6"><p className="text-xs font-medium">{appearance.supportText || "Precisa de ajuda? Fale com a nossa equipe."}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">{appearance.supportEmail ? <span className="flex items-center gap-1.5"><Mail className="size-3.5 text-primary" />{appearance.supportEmail}</span> : null}{appearance.supportPhone ? <span className="flex items-center gap-1.5"><Phone className="size-3.5 text-primary" />{appearance.supportPhone}</span> : null}<span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-primary" />Serviços financeiros Asaas</span></div></div></section>;
}

