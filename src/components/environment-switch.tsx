import { FlaskConical, Radio } from "lucide-react";
import { useTranslation } from "react-i18next";
import { setDevEnv, useDevEnv, type DevEnv } from "@/lib/dev-environment";
import { cn } from "@/lib/utils";

const OPTIONS: { value: DevEnv; title: string; label: string; icon: typeof Radio }[] = [
  { value: "test", title: "Sandbox — Testes", label: "Teste integrações e fluxos de pagamento sem movimentar dinheiro real.", icon: FlaskConical },
  { value: "live", title: "Produção — Operações reais", label: "Utilize as credenciais de produção para processar pagamentos reais.", icon: Radio },
];

/** Seletor de ambiente da área de desenvolvedores; independente do tema. */
export function EnvironmentSwitch() {
  const { t } = useTranslation("ui");
  const env = useDevEnv();
  const choose = (v: DevEnv) => {
    if (v === env) return;
    if (v === "live" && !window.confirm(t("Mudar para Produção? As telas de desenvolvedor passam a mostrar chaves e cobranças reais."))) return;
    setDevEnv(v);
  };
  return (
    <div className="inline-flex h-8 items-center overflow-hidden rounded-md border border-sidebar-border bg-sidebar-accent/45 p-0.5" role="radiogroup" aria-label={t("Ambiente da API")}>
      {OPTIONS.map((o) => {
        const active = env === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${t(o.title)} — ${t(o.label)}`}
            onClick={() => choose(o.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-sidebar-accent-foreground",
              active && "border border-sidebar-border bg-background text-foreground shadow-sm",
            )}
          >
            <o.icon className={cn("size-3.5", active && o.value === "test" && "text-warning", active && o.value === "live" && "text-primary")} strokeWidth={1.8} />
            {o.value === "test" ? t("Sandbox") : t("Produção")}
          </button>
        );
      })}
    </div>
  );
}
