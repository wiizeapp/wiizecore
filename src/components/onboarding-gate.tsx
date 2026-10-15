import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, BadgeDollarSign, Banknote, BriefcaseBusiness, Building2, Check,
  CircleDollarSign, ClipboardCheck, Coins, CreditCard, FileCheck2, FileText,
  Gem, Goal, HandCoins, Handshake, HeartPulse, HelpCircle, Instagram,
  Landmark, Layers3, LayoutDashboard, Loader2, Megaphone, PackageCheck,
  ReceiptText, RefreshCcw, Rocket, Search, Send, ShieldCheck, Sparkles, Store,
  TrendingUp, User, UserCog, Users, UsersRound, Wallet, Workflow, Youtube,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ONBOARDING_STEPS, type OnboardingIcon, type OnboardingKey } from "@/lib/onboarding-options";
import { getMyOnboarding, saveOnboarding, skipOnboarding } from "@/lib/onboarding.functions";

type Answers = Partial<Record<OnboardingKey, string | string[]>>;

const ICONS: Record<OnboardingIcon, LucideIcon> = {
  owner: Gem, finance: CircleDollarSign, admin: ClipboardCheck, commercial: TrendingUp, consultant: BriefcaseBusiness, other: HelpCircle,
  services: Handshake, agency: Megaphone, freelancer: User, software: Layers3, health: HeartPulse,
  solo: User, "small-team": Users, team: UsersRound, company: Building2, enterprise: Store,
  late: HandCoins, manual: Send, organize: LayoutDashboard, speed: Rocket, contract: FileCheck2, all: PackageCheck,
  pix: BadgeDollarSign, boleto: ReceiptText, card: CreditCard, transfer: Landmark, cash: Banknote, platform: Workflow,
  wallet: Wallet, coins: Coins, banknote: Banknote, gem: Gem, growth: TrendingUp, private: ShieldCheck,
  centralize: Goal, simplify: LayoutDashboard, "contract-payment": FileText, recurring: RefreshCcw, reminders: Send, portal: UserCog,
  google: Search, social: Instagram, youtube: Youtube, referral: Handshake, wiize: Sparkles, partner: Handshake,
};

/** Pesquisa de boas-vindas: aparece uma vez para cada usuário, fora do Admin. */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { t: ui } = useTranslation("ui");
  const qc = useQueryClient();
  const getFn = useServerFn(getMyOnboarding);
  const saveFn = useServerFn(saveOnboarding);
  const skipFn = useServerFn(skipOnboarding);
  const { data, isError, refetch } = useQuery({ queryKey: ["my-onboarding"], queryFn: () => getFn(), staleTime: 0, refetchOnMount: "always" });
  const [stage, setStage] = useState<"welcome" | "questions">("welcome");
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!data && !isError) return <div className="internal-app flex min-h-dvh items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-primary" aria-label={ui("Carregando...")} /></div>;
  if (isError) return <div className="internal-app flex min-h-dvh items-center justify-center bg-background p-5"><div className="max-w-sm text-center"><h1 className="text-xl font-semibold">{ui("Não foi possível carregar")}</h1><Button className="mt-5" onClick={() => void refetch()}>{ui("Tentar novamente")}</Button></div></div>;
  if (data?.done || dismissed) return children;

  const step = ONBOARDING_STEPS[i];
  if (!step) return null;
  const activeStep = step;
  const value = answers[step.key];
  const selected = (id: string) => (Array.isArray(value) ? value.includes(id) : value === id);
  const canNext = step.optional || (Array.isArray(value) ? value.length > 0 : Boolean(value));

  function pick(id: string) {
    setAnswers((a) => {
      if (!activeStep.multi) return { ...a, [activeStep.key]: id };
      const cur = Array.isArray(a[activeStep.key]) ? (a[activeStep.key] as string[]) : [];
      return { ...a, [activeStep.key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  }

  async function finish() {
    setSaving(true);
    try {
      const s = (k: OnboardingKey) => (typeof answers[k] === "string" ? (answers[k] as string) : null);
      await saveFn({ data: {
        role: s("role"), business_type: s("business_type"), team_size: s("team_size"), biggest_challenge: s("biggest_challenge"),
        monthly_revenue: s("monthly_revenue"), goal_90d: s("goal_90d"), acquisition_source: s("acquisition_source"),
        payment_methods: Array.isArray(answers.payment_methods) ? answers.payment_methods : [],
      } });
      toast.success(ui("Obrigado! Sua Wiize Recebe está pronta."));
      qc.setQueryData(["my-onboarding"], { done: true });
    } catch (e) {
      toast.error(e instanceof Error ? ui(e.message) : ui("Não foi possível salvar suas respostas."));
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    setSaving(true);
    try {
      await skipFn();
      toast.success(ui("Onboarding pulado. Você pode continuar na Wiize Recebe."));
      qc.setQueryData(["my-onboarding"], { done: true });
      setDismissed(true);
    } catch (e) {
      toast.error(e instanceof Error ? ui(e.message) : ui("Não foi possível pular o onboarding."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="onboarding-shell fixed inset-0 z-[100] flex min-h-dvh flex-col overflow-y-auto bg-background text-foreground">
      <header className="flex items-center justify-between px-5 py-5 sm:px-10 sm:py-6">
        <Brand className="shrink-0" />
        {stage === "questions" ? (
          <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
            <span>{i + 1} {ui("de")} {ONBOARDING_STEPS.length}</span>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${((i + 1) / ONBOARDING_STEPS.length) * 100}%` }} />
            </div>
          </div>
        ) : null}
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-14 pt-6 sm:px-10 sm:pb-32">
      <div className="w-full">
        {stage === "welcome" ? (
          <section key="welcome" className="onboarding-enter mx-auto w-full max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> {ui("Boas-vindas à Wiize Recebe")}
            </div>
            <h1 className="mb-4 font-display text-3xl font-bold sm:text-5xl">{ui("Vamos configurar a Wiize Recebe para o seu negócio em 1 minuto.")}</h1>
            <p className="mx-auto mb-9 max-w-xl text-base text-muted-foreground sm:text-lg">{ui("Algumas perguntas rápidas para personalizar suas cobranças, seu financeiro e seus próximos passos.")}</p>
            <div className="flex flex-col items-center gap-3">
              <Button size="lg" className="h-12 px-8" onClick={() => setStage("questions")}>{ui("Começar")}<ArrowRight /></Button>
            </div>
          </section>
        ) : (
          <section key={`step-${i}`} className="onboarding-enter mx-auto w-full max-w-5xl">
            <div className="mb-8 sm:hidden">
              <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                <span>{i + 1} {ui("de")} {ONBOARDING_STEPS.length}</span>
                {step.optional ? <span>{ui("Opcional")}</span> : null}
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${((i + 1) / ONBOARDING_STEPS.length) * 100}%` }} /></div>
            </div>
            <div className="mb-8 text-center sm:mb-10">
              <div className="mb-2 flex items-center justify-center gap-2">
                <h2 className="font-display text-2xl font-bold sm:text-3xl">{ui(step.title)}</h2>
                {step.optional ? <span className="hidden text-xs text-muted-foreground sm:inline">({ui("Opcional")})</span> : null}
              </div>
              <p className="text-sm text-muted-foreground sm:text-base">{ui(step.subtitle)}</p>
            </div>
            <div className={`grid gap-3 sm:gap-4 ${step.options.length <= 5 ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              {step.options.map((o) => {
                const Icon = ICONS[o.icon];
                const isSelected = selected(o.id);
                return (
                  <Button key={o.id} type="button" variant="outline" onClick={() => pick(o.id)} aria-pressed={isSelected}
                    className={`group relative h-auto min-h-36 whitespace-normal rounded-xl p-5 text-center shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:bg-card hover:shadow-card sm:min-h-44 ${isSelected ? "border-primary bg-card ring-2 ring-primary/20" : "border-border bg-card"}`}>
                    <span className={`absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-sm border transition-colors ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>
                      {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="flex min-w-0 flex-col items-center gap-3">
                      <Icon className={`!h-10 !w-10 shrink-0 transition-colors sm:!h-12 sm:!w-12 ${isSelected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} strokeWidth={1.65} />
                      <span className="text-base font-semibold leading-snug text-foreground">{ui(o.label)}</span>
                      {o.description ? <span className="text-sm font-normal leading-relaxed text-muted-foreground">{ui(o.description)}</span> : null}
                    </span>
                  </Button>
                );
              })}
            </div>
            <div className="sticky bottom-0 z-10 -mx-5 mt-8 border-t border-border bg-background px-5 pb-3 pt-4 shadow-[0_-10px_24px_-12px_rgba(0,0,0,0.7)] sm:static sm:mx-0 sm:mt-10 sm:px-0 sm:pb-0 sm:pt-5 sm:shadow-none">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <Button className="justify-self-start" variant="ghost" disabled={i === 0 || saving} onClick={() => setI((current) => current - 1)}>{ui("Voltar")}</Button>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  <Button disabled={!canNext || saving} onClick={() => (i < ONBOARDING_STEPS.length - 1 ? setI((current) => current + 1) : finish())}>
                    {saving ? <Loader2 className="animate-spin" /> : null}
                    {i < ONBOARDING_STEPS.length - 1 ? ui("Continuar") : ui("Concluir")}
                    {!saving && i < ONBOARDING_STEPS.length - 1 ? <ArrowRight /> : null}
                  </Button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => void skip()}
                className="ml-auto mt-1 flex w-fit text-xs font-normal text-muted-foreground hover:text-foreground sm:hidden"
              >
                {saving ? <Loader2 className="animate-spin" /> : null}
                {ui("Pular por agora")}
              </Button>
            </div>
          </section>
        )}
      </div>
      </main>
      {stage === "questions" ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={() => void skip()}
          className="fixed bottom-5 right-6 z-10 hidden rounded-full border border-border/70 bg-background/85 px-3 py-1 text-xs font-normal text-muted-foreground shadow-sm backdrop-blur-sm hover:text-foreground sm:inline-flex"
        >
          {saving ? <Loader2 className="animate-spin" /> : null}
          {ui("Pular por agora")}
        </Button>
      ) : null}
    </div>
  );
}
