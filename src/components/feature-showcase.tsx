import { BarChart3, ShieldCheck, Wallet } from "lucide-react";
import growthIllustrationUrl from "@/assets/wiizepay-growth-illustration.png";
const growthIllustration = { url: growthIllustrationUrl };
import { cn } from "@/lib/utils";

const splitPoints = [
  {
    icon: Wallet,
    title: "Acompanhamento em tempo real",
    description: "Saldo disponível, valores a receber e recebimentos atualizados em um só lugar.",
  },
  {
    icon: ShieldCheck,
    title: "Segurança nível bancário",
    description: "2FA, senha financeira e confirmações de pagamento feitas pelo servidor.",
  },
  {
    icon: BarChart3,
    title: "Relatórios e extratos",
    description: "Exporte relatórios claros para conferência, imposto e prestação de contas.",
  },
];

export function SplitShowcase() {
  return (
    <section className="brand-cta flex min-h-screen w-full items-center" aria-label="Gestão financeira Wiize Core">
      <div className="section-shell py-14 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-12">
          <div className="relative min-w-0 overflow-hidden">
            <div className="showcase-green-glow pointer-events-none absolute inset-0" aria-hidden="true" />
            <img
              src={growthIllustration.url}
              alt="Ilustração de crescimento de recebimentos Wiize Core"
              loading="lazy"
              width={1536}
              height={1024}
              className="relative block h-auto max-h-[34rem] w-full object-contain object-center drop-shadow-2xl"
            />
          </div>
          <div className="space-y-3">
            {splitPoints.map((point, index) => (
              <div
                key={point.title}
                className={cn(
                  "flex items-start gap-4 rounded-lg border border-primary-foreground/10 bg-background px-4 py-5 text-foreground shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-primary-foreground/25",
                  index === 0 && "ring-1 ring-primary-foreground/15",
                )}
              >
                <div className="flex aspect-square items-center justify-center p-3">
                  <point.icon className="size-7 text-primary" aria-hidden="true" />
                </div>
                <div className="space-y-1.5 py-1">
                  <h3 className="text-base font-semibold">{point.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">{point.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
