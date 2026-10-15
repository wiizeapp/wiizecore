import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, CreditCard, FileSignature, FileText, LockKeyhole, QrCode, ShieldCheck, UserRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { Checkbox } from "@/components/ui/checkbox";
import { FinancialIdentity, FinancialSupport } from "@/components/financial-provider";
import { headerTextColors, type CheckoutAppearance } from "@/lib/checkout-appearance";

export type CheckoutStep = "customer" | "contract" | "payment";
export type CheckoutMethod = "pix" | "boleto" | "credit_card";

/**
 * Mapa único das cores do checkout (real e prévia):
 * fundo = página inteira, cabeçalho = faixa da logo, superfícies = cartões e painéis.
 */
export function checkoutAppearanceVars(appearance: CheckoutAppearance) {
  const headerText = headerTextColors(appearance);
  return {
    "--checkout-header": appearance.header,
    "--checkout-header-foreground": headerText.text,
    "--checkout-header-muted": headerText.muted,
    "--checkout-panel": `color-mix(in srgb, ${appearance.background} 96%, ${appearance.text} 4%)`,
    "--background": appearance.background,
    "--card": appearance.surface,
    "--popover": appearance.surface,
    "--foreground": appearance.text,
    "--card-foreground": appearance.text,
    "--popover-foreground": appearance.text,
    "--secondary": `color-mix(in srgb, ${appearance.surface} 88%, ${appearance.text} 12%)`,
    "--secondary-foreground": appearance.text,
    "--muted": `color-mix(in srgb, ${appearance.surface} 92%, ${appearance.text} 8%)`,
    "--muted-foreground": appearance.mutedText,
    "--accent": `color-mix(in srgb, ${appearance.button} 12%, ${appearance.surface})`,
    "--accent-foreground": appearance.button,
    "--primary": appearance.button,
    "--primary-foreground": appearance.buttonText,
    "--border": `color-mix(in srgb, ${appearance.text} 16%, ${appearance.surface})`,
    "--input": `color-mix(in srgb, ${appearance.text} 20%, ${appearance.surface})`,
    "--ring": appearance.button,
    "--radius": `${appearance.radius / 16}rem`,
  } as CSSProperties;
}

export function CheckoutBrandHeader({ appearance, preview = false }: { appearance: CheckoutAppearance; preview?: boolean }) {
  const name = appearance.displayName;
  return (
    <header className="checkout-header border-b border-border">
      <div className={`mx-auto flex h-16 items-center justify-between gap-3 px-5 ${preview ? "max-w-full" : "max-w-6xl"}`}>
        {appearance.logoUrl && appearance.logoMode !== "name" ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <img src={appearance.logoUrl} alt={name ?? "Logo"} className="h-11 max-w-[220px] object-contain" />
            {appearance.logoMode === "logo_name" && name ? <span className="truncate font-display text-base font-semibold">{name}</span> : null}
          </span>
        ) : name ? <span className="truncate font-display text-lg font-semibold">{name}</span> : <Brand />}
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground"><ShieldCheck className="size-4 text-primary" />Pagamento seguro</span>
      </div>
    </header>
  );
}

export function CheckoutProgress({ current, needsCustomerData = true, needsContract = true, compact = false }: { current: CheckoutStep; needsCustomerData?: boolean; needsContract?: boolean; compact?: boolean }) {
  const steps = [
    ...(needsCustomerData ? [{ key: "customer" as const, label: "Seus dados", icon: UserRound }] : []),
    ...(needsContract ? [{ key: "contract" as const, label: "Contrato", icon: FileSignature }] : []),
    { key: "payment" as const, label: "Pagamento", icon: CreditCard },
  ];
  const currentIndex = steps.findIndex((step) => step.key === current);
  return <ol aria-label="Etapas do checkout" className={`${compact ? "mb-8" : "mb-10"} flex items-center gap-2 sm:gap-3`}>
    {steps.map((step, index) => {
      const Icon = step.icon;
      const active = index === currentIndex;
      const done = index < currentIndex;
      return <li key={step.key} className={`flex min-w-0 items-center gap-2 sm:gap-3 ${index < steps.length - 1 ? "flex-1" : ""}`}>
        <span className={`flex shrink-0 items-center gap-2 text-[11px] font-semibold sm:text-xs ${active ? "text-primary" : done ? "text-foreground" : "text-muted-foreground"}`}>
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg border shadow-sm ${active ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background"}`}>{done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}</span>
          <span className={`whitespace-nowrap ${active ? "" : "hidden sm:inline"}`}>{step.label}</span>
        </span>
        {index < steps.length - 1 ? <span aria-hidden className={`h-0.5 min-w-4 flex-1 rounded-full ${done ? "bg-primary" : "bg-border"}`} /> : null}
      </li>;
    })}
  </ol>;
}

export function CheckoutSummary({ providerName, serviceName, amountLabel = "Valor a pagar", amount = "R$ 950,00", dueDate = "10 de outubro", children }: { providerName: string; serviceName: string; amountLabel?: string; amount?: string; dueDate?: string; children?: ReactNode }) {
  return (
    <aside className="checkout-panel p-6 sm:p-8 lg:border-r lg:border-border lg:px-14 lg:py-12 xl:px-20 xl:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Pagamento para</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{providerName}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{serviceName}</p>
      <div className="mt-8 border-t border-border pt-7">
        <p className="text-sm text-muted-foreground">{amountLabel}</p>
        <p className="numeric-tabular mt-1 font-display text-5xl font-bold tracking-tight sm:text-6xl">{amount}</p>
        <div className="mt-7 flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="size-4" /></span>
          <div><p className="text-sm">Vencimento em <b className="font-semibold">{dueDate}</b></p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Após o vencimento: multa de 2% + juros de 1% ao mês.</p></div>
        </div>
      </div>
      {children}
    </aside>
  );
}

export function CheckoutStageHeader({ step, title, description, method }: { step: CheckoutStep; title: string; description: string; method?: CheckoutMethod }) {
  const stepLabel = step === "customer" ? "Seus dados" : step === "contract" ? "Contrato" : "Pagamento";
  const Icon = step === "customer" ? UserRound : step === "contract" ? FileSignature : method === "pix" ? QrCode : method === "boleto" ? FileText : CreditCard;
  const methodLabel = method === "pix" ? "Pix" : method === "boleto" ? "Boleto" : method === "credit_card" ? "Cartão de crédito" : null;
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-6">
      <div className="flex min-w-0 items-start gap-4">
        {step !== "payment" ? <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span> : null}
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">{stepLabel}</p><h2 className="mt-1 font-display text-2xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      </div>
      {methodLabel ? <span className="flex shrink-0 items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"><Icon className="size-3.5" />{methodLabel}</span> : null}
    </div>
  );
}

export function CheckoutTermsPanel({ checked, onCheckedChange, interactive = true }: { checked: boolean; onCheckedChange?: (checked: boolean) => void; interactive?: boolean }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /><p className="text-sm font-semibold">Confirme para continuar</p></div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-muted/40 p-3.5 text-sm leading-5 text-muted-foreground">
        <Checkbox className="mt-0.5" checked={checked} disabled={!interactive} onCheckedChange={(value) => onCheckedChange?.(value === true)} aria-label="Aceitar termos e política de privacidade" />
        <span>Li e aceito os {interactive ? <Link to="/termos-de-uso" target="_blank" className="font-medium text-primary underline-offset-2 hover:underline">Termos de Uso</Link> : <b className="font-medium text-primary">Termos de Uso</b>} e a {interactive ? <Link to="/politica-de-privacidade" target="_blank" className="font-medium text-primary underline-offset-2 hover:underline">Política de Privacidade</Link> : <b className="font-medium text-primary">Política de Privacidade</b>}.</span>
      </label>
      {!checked ? <p className="text-xs text-muted-foreground">O aceite é necessário para liberar o pagamento.</p> : null}
    </div>
  );
}

export function CheckoutTrustFooter({ appearance, preview = false }: { appearance: CheckoutAppearance; preview?: boolean }) {
  return (
    <footer className="border-t border-border checkout-panel">
      <div className={`mx-auto space-y-5 px-5 py-6 ${preview ? "max-w-full" : "max-w-6xl"}`}>
        <FinancialIdentity background={appearance.background} />
        <nav aria-label="Termos de Uso" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground"><Link to="/termos-de-uso" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Termos de Uso</Link><Link to="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Política de Privacidade</Link><Link to="/politica-de-pagamentos" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Política de Pagamento</Link><Link to="/ajuda" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Suporte financeiro</Link></nav>
        {appearance.supportText || appearance.supportEmail || appearance.supportPhone ? <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-muted-foreground">{appearance.supportText ? <span>{appearance.supportText}</span> : null}{appearance.supportEmail ? <a href={`mailto:${appearance.supportEmail}`} className="hover:text-foreground">{appearance.supportEmail}</a> : null}{appearance.supportPhone ? <span>{appearance.supportPhone}</span> : null}</div> : null}
      </div>
    </footer>
  );
}